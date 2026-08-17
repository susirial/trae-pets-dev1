import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  screen,
  shell,
  Tray,
  nativeImage,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { OFFICIAL_WEBSITE_URL, isAllowedExternalUrl } from '@shared/external-links';
import {
  IPC,
  type PetClickPreviewInput,
  type PetPackageImportMode,
  type PetQuickCreateInput,
  type SaveResult,
} from '@shared/ipc';
import {
  clampPetScale,
  mergeConfig,
  removePetFromConfig,
  resolvePetOverride,
  type PetConfig,
  type PetSoundSelection,
} from '@shared/pet-config';
import { getConfig, getDefaultConfig, loadConfig, saveConfig } from './config-store';
import { getResourcePaths, getResourcesDir, getUserPaths } from './paths';
import {
  listPetPackages,
  listPetActionOptions,
  resolvePetAudio,
  resolvePackageAssetRequest,
  type PetPackageRoots,
} from './pet-packages';
import {
  cancelPetPackageInspection,
  cleanupPetPackageInspections,
  deleteUserPetPackage,
  diagnoseUserPetPackages,
  importPetPackage,
  inspectPetPackage,
  installInspectedPetPackage,
  resolveStagedPetVisual,
} from './pet-package-manager';
import {
  deleteSoundFromLibrary,
  importSoundToLibrary,
  listSoundLibrary,
  resolveSoundLibraryAsset,
  type SoundLibraryRoots,
} from './sound-library';
import { readPayload, writeManualState } from './state-writer';
import {
  hookAccessStatus,
  installHooksNow,
  resolveKnownProfileDir,
  syncHooksOnLaunch,
  uninstallHooksNow,
} from './hook-bootstrap';
import { buildClickInteraction, ClickInteractionController } from './click-interaction';
import { bottomCenterAnchoredPosition, clampWindowPosition } from './window-geometry';
import { isAllowedPageNavigation, isDevToolsShortcut, safeRendererPath } from './security';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'trae-pet',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Force the user-data folder name to match the standalone CLI (@shared APP_NAME).
app.setName('trae-pet');

const HOOK_SYNC_DELAY_MS = 1_200;

let petWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let lastStateText = '';
let suspendPetMoveSave = false;
let moveSaveTimer: NodeJS.Timeout | null = null;
let scaleSaveTimer: NodeJS.Timeout | null = null;
let pendingPetScale: number | null = null;
let clickInteractionController: ClickInteractionController | null = null;

function ensureUserDirs(): void {
  const user = getUserPaths();
  fs.mkdirSync(user.logsDir, { recursive: true });
  fs.mkdirSync(user.petsDir, { recursive: true });
  fs.mkdirSync(user.soundsDir, { recursive: true });
}

function petPackageRoots(): PetPackageRoots {
  return {
    builtInDir: getResourcePaths().petsDir,
    userDir: getUserPaths().petsDir,
  };
}

function soundLibraryRoots(): SoundLibraryRoots {
  return {
    builtInDir: getResourcePaths().soundsDir,
    userDir: getUserPaths().soundsDir,
  };
}

function rendererUrl(page: 'pet' | 'settings'): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl
    ? `${devUrl}/${page}/index.html`
    : `trae-pet://app/${page}/index.html`;
}

function loadPage(win: BrowserWindow, page: 'pet' | 'settings'): void {
  const url = rendererUrl(page);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedPageNavigation(url, targetUrl)) event.preventDefault();
  });
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (isDevToolsShortcut(input)) event.preventDefault();
    });
  }
  void win.loadURL(url);
}

function effectiveWindowSize(config: PetConfig): { width: number; height: number } {
  const scale = clampPetScale(config.window.scale);
  return {
    width: Math.round(config.window.width * scale),
    height: Math.round(config.window.height * scale),
  };
}

function windowOrigin(config: PetConfig): { x: number; y: number } {
  if (
    config.window.positionMode === 'manual'
    && Number.isFinite(config.window.manualX)
    && Number.isFinite(config.window.manualY)
  ) {
    return {
      x: Number(config.window.manualX),
      y: Number(config.window.manualY),
    };
  }
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const { width: w, height: h } = effectiveWindowSize(config);
  const { position } = config.window;
  const margin = 24;
  const right = width - w - margin;
  const left = margin;
  const top = margin;
  const bottom = height - h - margin;
  switch (position) {
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'top-right':
      return { x: right, y: top };
    case 'top-left':
      return { x: left, y: top };
    case 'bottom-right':
    default:
      return { x: right, y: bottom };
  }
}

function saveManualWindowPosition(x: number, y: number): SaveResult {
  try {
    const current = getConfig();
    saveConfig({
      ...current,
      window: {
        ...current.window,
        positionMode: 'manual',
        manualX: x,
        manualY: y,
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function syncPetWindowBounds(config: PetConfig): void {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const { width, height } = effectiveWindowSize(config);
  const prev = petWindow.getBounds();
  let origin: { x: number; y: number };
  if (config.window.positionMode === 'manual') {
    // Keep the pet's bottom-center anchored so scaling grows it upward/outward
    // instead of drifting, then clamp inside the current display work area.
    const work = screen.getDisplayMatching(prev).workArea;
    origin = bottomCenterAnchoredPosition(prev, { width, height }, work);
    // Persist the re-anchored top-left so a restart keeps the same placement.
    if (origin.x !== config.window.manualX || origin.y !== config.window.manualY) {
      saveManualWindowPosition(origin.x, origin.y);
    }
  } else {
    origin = windowOrigin(config);
  }
  suspendPetMoveSave = true;
  petWindow.setAlwaysOnTop(Boolean(config.window.alwaysOnTop), 'screen-saver');
  petWindow.setBounds({ x: origin.x, y: origin.y, width, height });
  setTimeout(() => {
    suspendPetMoveSave = false;
  }, 0);
}

function schedulePetPositionSave(): void {
  if (!petWindow || petWindow.isDestroyed() || suspendPetMoveSave) {
    return;
  }
  if (moveSaveTimer) {
    clearTimeout(moveSaveTimer);
  }
  moveSaveTimer = setTimeout(() => {
    moveSaveTimer = null;
    if (!petWindow || petWindow.isDestroyed() || suspendPetMoveSave) {
      return;
    }
    const bounds = petWindow.getBounds();
    const result = saveManualWindowPosition(bounds.x, bounds.y);
    if (result.ok) {
      broadcastConfig(getConfig());
    }
  }, 160);
}

function isPetWindowSender(event: IpcMainInvokeEvent): boolean {
  return Boolean(
    petWindow
    && !petWindow.isDestroyed()
    && BrowserWindow.fromWebContents(event.sender) === petWindow
  );
}

function flushPendingPetScale(): void {
  if (scaleSaveTimer) {
    clearTimeout(scaleSaveTimer);
    scaleSaveTimer = null;
  }
  if (pendingPetScale === null) return;
  const scale = pendingPetScale;
  pendingPetScale = null;
  const current = getConfig();
  const saved = saveConfig({
    ...current,
    window: { ...current.window, scale },
  });
  broadcastConfig(saved);
}

function schedulePetScaleSave(): void {
  if (scaleSaveTimer) clearTimeout(scaleSaveTimer);
  scaleSaveTimer = setTimeout(flushPendingPetScale, 250);
}

function packageAudioMimeType(file: string): string | null {
  switch (path.extname(file).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.m4a':
      return 'audio/mp4';
    case '.aac':
      return 'audio/aac';
    case '.flac':
      return 'audio/flac';
    default:
      return null;
  }
}

function packageVisualMimeType(file: string): string | null {
  switch (path.extname(file).toLowerCase()) {
    case '.webp': return 'image/webp';
    case '.png':
    case '.apng': return 'image/png';
    case '.gif': return 'image/gif';
    default: return null;
  }
}

function registerAssetProtocol(): void {
  protocol.handle('trae-pet', async (request) => {
    const url = new URL(request.url);

    if (url.hostname === 'app') {
      const relativePath = safeRendererPath(url.pathname);
      if (!relativePath) return new Response('Not Found', { status: 404 });
      const rendererRoot = path.resolve(__dirname, '../renderer');
      const filePath = path.resolve(rendererRoot, relativePath);
      if (!filePath.startsWith(`${rendererRoot}${path.sep}`) || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 });
      }
      const mimeType = relativePath.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : relativePath.endsWith('.js')
          ? 'text/javascript; charset=utf-8'
          : 'text/css; charset=utf-8';
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: {
          'content-type': mimeType,
          'cache-control': 'no-store',
        },
      });
    }

    if (url.hostname === 'pet-asset') {
      const parts = url.pathname.split('/').filter(Boolean);
      const [encodedPetId, kind, encodedFileName] = parts;
      if (!encodedPetId || !kind || !encodedFileName || parts.length !== 3) {
        return new Response('Not Found', { status: 404 });
      }
      let petId: string;
      let fileName: string;
      try {
        petId = decodeURIComponent(encodedPetId);
        fileName = decodeURIComponent(encodedFileName);
      } catch {
        return new Response('Not Found', { status: 404 });
      }

      if (kind === 'visual') {
        const filePath = resolvePackageAssetRequest(petPackageRoots(), petId, 'visual', fileName);
        const mimeType = packageVisualMimeType(fileName);
        if (!filePath || !mimeType || !fs.existsSync(filePath)) return new Response('Not Found', { status: 404 });
        return new Response(fs.readFileSync(filePath), {
          status: 200,
          headers: {
            'content-type': mimeType,
            'cache-control': 'no-cache',
          },
        });
      }

      if (kind === 'audio') {
        const filePath = resolvePackageAssetRequest(petPackageRoots(), petId, 'audio', fileName);
        const mimeType = packageAudioMimeType(fileName);
        if (!filePath || !mimeType || !fs.existsSync(filePath)) return new Response('Not Found', { status: 404 });
        return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
          status: 200,
          headers: {
            'content-type': mimeType,
            'cache-control': 'no-cache',
          },
        });
      }

      return new Response('Not Found', { status: 404 });
    }

    if (url.hostname === 'pet-staging') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 2) return new Response('Not Found', { status: 404 });
      let sessionId: string;
      let fileName: string;
      try {
        sessionId = decodeURIComponent(parts[0]);
        fileName = decodeURIComponent(parts[1]);
      } catch {
        return new Response('Not Found', { status: 404 });
      }
      const filePath = resolveStagedPetVisual(sessionId, fileName);
      const mimeType = packageVisualMimeType(fileName);
      if (!filePath || !mimeType) return new Response('Not Found', { status: 404 });
      return new Response(fs.readFileSync(filePath), {
        status: 200,
        headers: {
          'content-type': mimeType,
          'cache-control': 'no-store',
        },
      });
    }

    if (url.hostname === 'sound-library') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 1) return new Response('Not Found', { status: 404 });
      let soundId: string;
      try {
        soundId = decodeURIComponent(parts[0]);
      } catch {
        return new Response('Not Found', { status: 404 });
      }
      const filePath = resolveSoundLibraryAsset(soundLibraryRoots(), soundId);
      if (!filePath) return new Response('Not Found', { status: 404 });
      return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'cache-control': 'no-cache',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  });
}

function createPetWindow(): void {
  const config = getConfig();
  const { x, y } = windowOrigin(config);
  const { width, height } = effectiveWindowSize(config);

  petWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: config.window.alwaysOnTop,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  if (config.window.alwaysOnTop) {
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadPage(petWindow, 'pet');

  petWindow.webContents.once('did-finish-load', () => {
    const payload = readPayload();
    try {
      lastStateText = fs.readFileSync(getUserPaths().stateFile, 'utf8');
    } catch {
      lastStateText = '';
    }
    petWindow?.webContents.send(IPC.stateUpdate, payload);
  });

  petWindow.on('closed', () => {
    clickInteractionController?.dispose();
    clickInteractionController = null;
    petWindow = null;
  });
  petWindow.on('move', () => {
    schedulePetPositionSave();
  });
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 940,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'TRAE 宠物 · 配置',
    backgroundColor: '#f4f6f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  loadPage(settingsWindow, 'settings');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function emitState(): void {
  clickInteractionController?.cancel(false);
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send(IPC.stateUpdate, readPayload());
}

function sendStatePayload(payload: ReturnType<typeof readPayload>): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send(IPC.stateUpdate, payload);
}

function interactionController(): ClickInteractionController {
  clickInteractionController ??= new ClickInteractionController(readPayload, sendStatePayload);
  return clickInteractionController;
}

function validSoundSelection(value: unknown): PetSoundSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const selection = value as Partial<PetSoundSelection> & { soundId?: unknown };
  if (selection.mode === 'none') return { mode: 'none' };
  if (
    (selection.mode === 'sound' || selection.mode === 'library')
    && typeof selection.soundId === 'string'
    && selection.soundId.trim()
  ) {
    return { mode: selection.mode, soundId: selection.soundId.trim() };
  }
  return undefined;
}

function validateClickSettings(config: PetConfig): string | null {
  const packages = new Map(listPetPackages(petPackageRoots()).map((pkg) => [pkg.id, pkg]));
  for (const [petId, override] of Object.entries(config.petOverrides)) {
    const click = override.click;
    if (!click) continue;
    const pkg = packages.get(petId);
    if (!pkg) continue;
    if (
      typeof click.action === 'string'
      && !listPetActionOptions(pkg).some((option) => option.id === click.action)
    ) {
      return `宠物 ${pkg.name} 的点击动作不可用：${click.action}`;
    }
    if (click.sound?.mode === 'sound' && !pkg.manifest.sounds[click.sound.soundId]) {
      return `宠物 ${pkg.name} 的点击语音不可用：${click.sound.soundId}`;
    }
    if (
      click.sound?.mode === 'library'
      && !resolveSoundLibraryAsset(soundLibraryRoots(), click.sound.soundId)
    ) {
      return `公共点击语音不可用：${click.sound.soundId}`;
    }
  }
  return null;
}

function presentClick(petId: string, actionId: string, sound?: PetSoundSelection): void {
  const controller = interactionController();
  const interaction = buildClickInteraction({
    config: getConfig(),
    petsDir: petPackageRoots(),
    soundLibraryRoots: soundLibraryRoots(),
    petId,
    actionId,
    sound,
    token: controller.nextToken(),
  });
  if (interaction) controller.present(interaction);
}

function broadcastConfig(config: PetConfig): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.configUpdate, config);
  }
}

function watchStateFile(): void {
  const file = getUserPaths().stateFile;
  fs.watchFile(file, { interval: 250 }, () => {
    let next = '';
    try {
      next = fs.readFileSync(file, 'utf8');
    } catch {
      emitState();
      return;
    }
    if (next !== lastStateText) {
      lastStateText = next;
      emitState();
    }
  });
}

function contextMenuTemplate(): MenuItemConstructorOptions[] {
  const config = getConfig();
  const states = config.states
    .filter((state) => state.enabled)
    .map<MenuItemConstructorOptions>((state) => ({
      label: state.label,
      click: () => {
        writeManualState(state.id);
        emitState();
      },
    }));

  return [
    { label: '打开配置…', click: () => openSettings() },
    { type: 'separator' },
    { label: '触发状态', submenu: states },
    { type: 'separator' },
    { label: '退出', role: 'quit' },
  ];
}

function setupApplicationMenu(): void {
  if (!app.isPackaged) return;
  const template: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'windowMenu' },
      ]
    : [
        { role: 'editMenu' },
        { role: 'windowMenu' },
      ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupTray(): void {
  const iconPath = path.join(getResourcesDir(), 'tray.png');
  let image = nativeImage.createEmpty();
  if (fs.existsSync(iconPath)) {
    image = nativeImage.createFromPath(iconPath);
  }
  if (process.platform === 'darwin' && !image.isEmpty()) {
    image = image.resize({ width: 18, height: 18 });
    image.setTemplateImage(true);
  }

  try {
    tray = new Tray(image);
    tray.setToolTip('TRAE 宠物');
    tray.setContextMenu(Menu.buildFromTemplate(contextMenuTemplate()));
    tray.on('click', () => openSettings());
  } catch {
    // Tray is optional; the pet right-click menu remains available.
    tray = null;
  }
}

function refreshTrayMenu(): void {
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate(contextMenuTemplate()));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.stateGet, () => readPayload());

  ipcMain.handle(IPC.petClose, () => {
    app.quit();
  });

  ipcMain.handle(IPC.petIgnoreMouse, (_event, ignore: boolean) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
    }
  });

  ipcMain.handle(IPC.petContextMenu, () => {
    const menu = Menu.buildFromTemplate(contextMenuTemplate());
    menu.popup({ window: petWindow ?? undefined });
  });

  ipcMain.handle(IPC.petPositionSave, (event, x: number, y: number) => {
    if (!isPetWindowSender(event)) return { ok: false, error: '无权修改桌宠位置' };
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: '桌宠位置无效' };
    }
    const result = saveManualWindowPosition(x, y);
    if (result.ok) {
      broadcastConfig(getConfig());
    }
    return result;
  });

  ipcMain.handle(IPC.petBoundsGet, (event) => {
    if (!isPetWindowSender(event) || !petWindow) {
      return { ok: false, error: '桌宠窗口不可用' };
    }
    return { ok: true, bounds: petWindow.getBounds() };
  });

  ipcMain.handle(IPC.petWindowMove, (event, rawX: number, rawY: number) => {
    if (!isPetWindowSender(event) || !petWindow) {
      return { ok: false, error: '无权移动桌宠窗口' };
    }
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return { ok: false, error: '桌宠位置无效' };
    }
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: Math.round(rawX + bounds.width / 2),
      y: Math.round(rawY + bounds.height / 2),
    });
    const position = clampWindowPosition(
      { x: rawX, y: rawY },
      bounds,
      display.workArea,
    );
    petWindow.setPosition(position.x, position.y);
    return { ok: true, bounds: petWindow.getBounds() };
  });

  ipcMain.handle(IPC.petScaleSet, (event, rawScale: number) => {
    if (!isPetWindowSender(event) || !petWindow) {
      return { ok: false, error: '无权缩放桌宠窗口' };
    }
    if (!Number.isFinite(rawScale)) {
      return { ok: false, error: '桌宠缩放值无效' };
    }
    const scale = clampPetScale(rawScale);
    pendingPetScale = scale;
    const current = getConfig();
    syncPetWindowBounds({
      ...current,
      window: { ...current.window, scale },
    });
    schedulePetScaleSave();
    return { ok: true, scale };
  });

  ipcMain.handle(IPC.settingsOpen, () => openSettings());

  ipcMain.handle(IPC.configGet, () => getConfig());
  ipcMain.handle(IPC.configGetDefaults, () => getDefaultConfig());
  ipcMain.handle(IPC.petPackagesList, () => {
    const roots = petPackageRoots();
    return listPetPackages(roots).map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      version: pkg.version,
      source: pkg.source,
      visuals: Object.fromEntries(
        Object.entries(pkg.manifest.visuals).map(([stateId, visual]) => [stateId, visual.file]),
      ),
      actions: Object.fromEntries(
        Object.entries(pkg.manifest.actions).map(([actionId, action]) => [actionId, action.state]),
      ),
      clickAction: pkg.manifest.interaction.clickAction,
      actionOptions: listPetActionOptions(pkg),
      sounds: pkg.manifest.sounds,
      stateSounds: pkg.manifest.stateSounds,
      defaultAudio: Object.fromEntries(Object.keys(pkg.manifest.visuals).map((stateId) => {
        const audio = resolvePetAudio(roots, pkg.id, stateId);
        return [stateId, {
          soundId: audio.soundId ?? null,
          file: audio.file,
          url: audio.url,
          error: audio.error,
          volume: audio.volume ?? 1,
        }];
      })),
      presentation: pkg.manifest.presentation,
      theme: pkg.manifest.theme,
    }));
  });
  ipcMain.handle(IPC.petPackageImport, async (_event, requestedPath?: string) => {
    let source = requestedPath;
    if (!source) {
      const chosen = await dialog.showOpenDialog({
        title: '导入桌宠包（ZIP 或文件夹）',
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: '桌宠包', extensions: ['zip'] }],
      });
      if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, canceled: true };
      source = chosen.filePaths[0];
    }
    const result = importPetPackage(source, petPackageRoots());
    if (result.ok) emitState();
    return result;
  });
  ipcMain.handle(
    IPC.petPackageInspect,
    async (_event, mode: PetPackageImportMode, requestedPath?: string) => {
      if (mode !== 'package' && mode !== 'quick') {
        return {
          ok: false,
          error: '不支持的导入模式',
          issues: [],
          stateFiles: {},
          statePreviewUrls: {},
          availableVisuals: [],
        };
      }
      let source = requestedPath;
      if (!source) {
        let properties: Array<'openFile' | 'openDirectory'> = ['openDirectory'];
        let filters: Electron.FileFilter[] | undefined;
        if (mode === 'package') {
          const sourceKind = await dialog.showMessageBox({
            type: 'question',
            title: '导入桌宠包',
            message: '选择宠物包来源',
            detail: '可以导入 ZIP 文件，也可以选择包含 manifest.json 的文件夹。',
            buttons: ['选择 ZIP', '选择文件夹', '取消'],
            defaultId: 0,
            cancelId: 2,
          });
          if (sourceKind.response === 2) {
            return {
              ok: false,
              canceled: true,
              issues: [],
              stateFiles: {},
              statePreviewUrls: {},
              availableVisuals: [],
            };
          }
          properties = sourceKind.response === 0 ? ['openFile'] : ['openDirectory'];
          filters = sourceKind.response === 0
            ? [{ name: '桌宠包', extensions: ['zip'] }]
            : undefined;
        }
        const chosen = await dialog.showOpenDialog({
          title: mode === 'quick' ? '选择九图宠物素材文件夹' : '选择桌宠包（ZIP 或文件夹）',
          properties,
          filters,
        });
        if (chosen.canceled || !chosen.filePaths[0]) {
          return {
            ok: false,
            canceled: true,
            issues: [],
            stateFiles: {},
            statePreviewUrls: {},
            availableVisuals: [],
          };
        }
        source = chosen.filePaths[0];
      }
      return inspectPetPackage(source, petPackageRoots(), mode);
    },
  );
  ipcMain.handle(
    IPC.petPackageInstall,
    (_event, sessionId: string, input?: PetQuickCreateInput) => {
      const result = installInspectedPetPackage(sessionId, petPackageRoots(), input);
      if (result.ok) emitState();
      return result;
    },
  );
  ipcMain.handle(IPC.petPackageCancel, (_event, sessionId: string) => (
    cancelPetPackageInspection(sessionId)
  ));
  ipcMain.handle(IPC.petPackageDelete, (_event, id: string) => {
    const result = deleteUserPetPackage(id, petPackageRoots());
    if (result.ok) {
      const saved = saveConfig(removePetFromConfig(getConfig(), id));
      broadcastConfig(saved);
      emitState();
    }
    return result;
  });
  ipcMain.handle(IPC.petPackagesDiagnose, () => diagnoseUserPetPackages(
    getUserPaths().petsDir,
    getResourcePaths().petsDir,
  ));
  ipcMain.handle(IPC.soundLibraryList, () => listSoundLibrary(soundLibraryRoots()));
  ipcMain.handle(IPC.soundLibraryImport, async (_event, requestedPath?: string) => {
    let source = requestedPath;
    if (!source) {
      const chosen = await dialog.showOpenDialog({
        title: '导入公共音效（MP3）',
        properties: ['openFile'],
        filters: [{ name: 'MP3 音效', extensions: ['mp3'] }],
      });
      if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, canceled: true };
      source = chosen.filePaths[0];
    }
    return importSoundToLibrary(source, soundLibraryRoots());
  });
  ipcMain.handle(IPC.soundLibraryDelete, (_event, id: string) => (
    deleteSoundFromLibrary(id, soundLibraryRoots(), getConfig())
  ));
  ipcMain.handle(IPC.soundLibraryOpenFolder, async () => {
    try {
      fs.mkdirSync(getUserPaths().soundsDir, { recursive: true });
      const error = await shell.openPath(getUserPaths().soundsDir);
      return error ? { ok: false, error } : { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(IPC.hooksStatus, () => hookAccessStatus());
  ipcMain.handle(IPC.hooksInstall, () => {
    const status = installHooksNow();
    return { ok: status.ok, status, ...(status.error ? { error: status.error } : {}) };
  });
  ipcMain.handle(IPC.hooksUninstall, (_event, restoreBackup?: boolean) => {
    const status = uninstallHooksNow(restoreBackup === true);
    return { ok: status.ok, status, ...(status.error ? { error: status.error } : {}) };
  });
  ipcMain.handle(IPC.hooksOpenProfileDir, async (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) return { ok: false, error: 'TRAE 版本标识无效' };
    const dir = resolveKnownProfileDir(id.trim());
    if (!dir) return { ok: false, error: `未找到 TRAE 配置目录：${id}` };
    const error = await shell.openPath(dir);
    return error ? { ok: false, error } : { ok: true };
  });
  ipcMain.handle(IPC.externalOpenOfficialWebsite, async () => {
    if (!isAllowedExternalUrl(OFFICIAL_WEBSITE_URL)) {
      return { ok: false, error: '官网链接未通过安全校验' };
    }
    try {
      await shell.openExternal(OFFICIAL_WEBSITE_URL);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(IPC.configSave, (_event, next: PetConfig) => {
    try {
      if (scaleSaveTimer) {
        clearTimeout(scaleSaveTimer);
        scaleSaveTimer = null;
      }
      pendingPetScale = null;
      const normalized = mergeConfig(getDefaultConfig(), next);
      const validationError = validateClickSettings(normalized);
      if (validationError) return { ok: false, error: validationError };
      const merged = saveConfig(next);
      syncPetWindowBounds(merged);
      broadcastConfig(merged);
      refreshTrayMenu();
      emitState();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(IPC.actionTrigger, (_event, id: string) => {
    writeManualState(id);
    emitState();
  });
  ipcMain.handle(IPC.petClickTrigger, () => {
    const config = getConfig();
    const pkg = listPetPackages(petPackageRoots()).find((candidate) => (
      candidate.id === config.pet.selectedId
    ));
    if (!pkg) return;
    const click = resolvePetOverride(config, pkg.id).click;
    if (click?.action === null) return;
    const actionId = click?.action ?? pkg.manifest.interaction.clickAction;
    if (!actionId) return;
    presentClick(pkg.id, actionId, click?.sound ?? { mode: 'none' });
  });
  ipcMain.handle(IPC.petClickPreview, (_event, raw: PetClickPreviewInput) => {
    if (!raw || typeof raw.petId !== 'string' || typeof raw.action !== 'string') return;
    presentClick(raw.petId, raw.action, validSoundSelection(raw.sound) ?? { mode: 'none' });
  });
}

function bootstrapDiagnostic(step: string, error?: unknown): void {
  if (process.env.TRAE_PET_BOOTSTRAP_DIAGNOSTICS !== '1') return;
  try {
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : '';
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'bootstrap-diagnostic.log'),
      `${new Date().toISOString()} ${step}${detail ? ` ${detail}` : ''}\n`,
    );
  } catch {
    // Diagnostics must never become another startup failure.
  }
}

function bootstrap(): void {
  bootstrapDiagnostic('start');
  ensureUserDirs();
  bootstrapDiagnostic('user-dirs-ready');
  registerAssetProtocol();
  bootstrapDiagnostic('asset-protocol-ready');
  loadConfig();
  bootstrapDiagnostic('config-ready');
  registerIpc();
  bootstrapDiagnostic('ipc-ready');
  setupApplicationMenu();
  bootstrapDiagnostic('application-menu-ready');
  createPetWindow();
  bootstrapDiagnostic('pet-window-created');
  setupTray();
  bootstrapDiagnostic('tray-ready');
  watchStateFile();
  bootstrapDiagnostic('state-watch-ready');
  // Hook auto-install probes the system Node runtime synchronously, so it waits
  // until the pet window has had a chance to paint. It never blocks startup and
  // never throws.
  setTimeout(() => {
    void syncHooksOnLaunch().then((report) => {
      bootstrapDiagnostic(`hook-sync-${report?.ok ? 'ok' : 'incomplete'}`);
    });
  }, HOOK_SYNC_DELAY_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) {
        petWindow.restore();
      }
      petWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      bootstrap();
    } catch (error) {
      bootstrapDiagnostic('failed', error);
      console.error('TRAE Pet bootstrap failed:', error);
      app.quit();
    }
  });

  app.on('before-quit', () => {
    flushPendingPetScale();
    clickInteractionController?.dispose();
    cleanupPetPackageInspections();
  });

  app.on('window-all-closed', () => {
    fs.unwatchFile(getUserPaths().stateFile);
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
