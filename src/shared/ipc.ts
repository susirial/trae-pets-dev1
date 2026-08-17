import type { PetConfig, PetSoundSelection } from './pet-config';
import type {
  PetManifestPresentation,
  PetManifestSound,
  PetManifestTheme,
  RequiredPetState,
} from './pet-manifest';
import type { RendererStatePayload } from './state-schema';

export interface PetPackageDefaultAudio {
  soundId: string | null;
  file: string | null;
  url: string | null;
  error: string | null;
  volume: number;
}

export interface PetPackageAsset {
  id: string;
  name: string;
  description: string;
  version?: string;
  source?: 'built-in' | 'user';
  /** Normalized state id -> manifest-declared visual filename. */
  visuals: Record<string, string>;
  /** Normalized action id -> target state id. */
  actions: Record<string, string>;
  sounds: Record<string, PetManifestSound>;
  stateSounds: Record<string, string>;
  defaultAudio: Record<string, PetPackageDefaultAudio>;
  clickAction?: string;
  actionOptions: Array<{
    id: string;
    stateId: string;
    file: string;
    durationMs: number;
  }>;
  presentation: PetManifestPresentation;
  theme: PetManifestTheme;
}

export interface PetClickPreviewInput {
  petId: string;
  action: string;
  sound?: PetSoundSelection;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface PetWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PetWindowBoundsResult extends SaveResult {
  bounds?: PetWindowBounds;
}

export interface PetWindowScaleResult extends SaveResult {
  scale?: number;
}

export interface PetPackageOperationResult extends SaveResult {
  id?: string;
  canceled?: boolean;
}

export interface PetPackageDiagnostic {
  folder: string;
  id?: string;
  valid: boolean;
  errors: string[];
}

export type PetPackageImportMode = 'package' | 'quick';

export interface PetPackageIssue {
  code: string;
  severity: 'error' | 'warning';
  path?: string;
  message: string;
  hint?: string;
}

export interface PetPackageInspection extends PetPackageOperationResult {
  sessionId?: string;
  mode?: PetPackageImportMode;
  name?: string;
  description?: string;
  author?: string;
  license?: string;
  issues: PetPackageIssue[];
  stateFiles: Partial<Record<RequiredPetState, string>>;
  statePreviewUrls: Partial<Record<RequiredPetState, string>>;
  availableVisuals: Array<{ file: string; url: string }>;
}

export interface PetQuickCreateInput {
  id: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;
  stateFiles: Record<RequiredPetState, string>;
  extraActions?: PetQuickActionInput[];
  clickAction?: string;
}

export interface PetQuickActionInput {
  id: string;
  file: string;
  durationMs: number;
  enabled: boolean;
}

export type SoundLibrarySource = 'built-in' | 'user';

export interface SoundLibraryAsset {
  id: string;
  name: string;
  file: string;
  source: SoundLibrarySource;
  size: number;
  url: string;
}

export interface SoundLibraryOperationResult extends SaveResult {
  id?: string;
  canceled?: boolean;
  referencedBy?: string[];
}

export interface HookProfileStatus {
  /** TRAE variant id, e.g. `trae` (international) or `trae-cn` (China build). */
  id: string;
  dir: string;
  hooksFile: string;
  ok: boolean;
  error?: string;
}

export interface HookNodeStatus {
  ok: boolean;
  version: string | null;
  execPath: string | null;
  error: string | null;
}

export interface HookAccessStatus {
  ok: boolean;
  busy: boolean;
  lastAction: 'install' | 'skip' | 'no-profile' | 'unknown';
  updatedAt: string | null;
  appVersion: string | null;
  profileSource: string;
  profiles: HookProfileStatus[];
  skippedProfiles: Array<{ dir: string; reason: string }>;
  node: HookNodeStatus;
  requirements: { min: string; majors: number[]; recommended: string };
  error?: string;
}

export interface HookOperationSummary extends SaveResult {
  status: HookAccessStatus;
}

export const IPC = {
  stateGet: 'pet-state:get',
  stateUpdate: 'pet-state:update',
  petClose: 'pet-window:close',
  petIgnoreMouse: 'pet-window:set-ignore-mouse',
  petContextMenu: 'pet-window:context-menu',
  petPositionSave: 'pet-window:save-position',
  petBoundsGet: 'pet-window:get-bounds',
  petWindowMove: 'pet-window:move',
  petScaleSet: 'pet-window:set-scale',
  settingsOpen: 'settings:open',
  configGet: 'config:get',
  configGetDefaults: 'config:get-defaults',
  configSave: 'config:save',
  configUpdate: 'config:update',
  petPackagesList: 'pet-packages:list',
  petPackageImport: 'pet-packages:import',
  petPackageInspect: 'pet-packages:inspect',
  petPackageInstall: 'pet-packages:install',
  petPackageCancel: 'pet-packages:cancel',
  petPackageDelete: 'pet-packages:delete',
  petPackagesDiagnose: 'pet-packages:diagnose',
  soundLibraryList: 'sound-library:list',
  soundLibraryImport: 'sound-library:import',
  soundLibraryDelete: 'sound-library:delete',
  soundLibraryOpenFolder: 'sound-library:open-folder',
  hooksStatus: 'hooks:status',
  hooksInstall: 'hooks:install',
  hooksUninstall: 'hooks:uninstall',
  hooksOpenProfileDir: 'hooks:open-profile-dir',
  externalOpenOfficialWebsite: 'external:open-official-website',
  actionTrigger: 'action:trigger',
  petClickTrigger: 'pet-interaction:click',
  petClickPreview: 'pet-interaction:click-preview',
} as const;

export interface PetAPI {
  getState(): Promise<RendererStatePayload>;
  onStateUpdate(callback: (payload: RendererStatePayload) => void): () => void;
  closePet(): void;
  setIgnoreMouse(ignore: boolean): void;
  openContextMenu(): void;
  savePetPosition(x: number, y: number): Promise<SaveResult>;
  getPetWindowBounds(): Promise<PetWindowBoundsResult>;
  movePetWindow(x: number, y: number): Promise<PetWindowBoundsResult>;
  setPetWindowScale(scale: number): Promise<PetWindowScaleResult>;
  openSettings(): void;
  getConfig(): Promise<PetConfig>;
  getDefaultConfig(): Promise<PetConfig>;
  saveConfig(config: PetConfig): Promise<SaveResult>;
  onConfigUpdate(callback: (config: PetConfig) => void): () => void;
  listPetPackages(): Promise<PetPackageAsset[]>;
  importPetPackage(sourcePath?: string): Promise<PetPackageOperationResult>;
  inspectPetPackage(mode: PetPackageImportMode, sourcePath?: string): Promise<PetPackageInspection>;
  installPetPackage(sessionId: string, input?: PetQuickCreateInput): Promise<PetPackageOperationResult>;
  cancelPetPackageInspection(sessionId: string): Promise<SaveResult>;
  deletePetPackage(id: string): Promise<PetPackageOperationResult>;
  diagnosePetPackages(): Promise<PetPackageDiagnostic[]>;
  listSoundLibrary(): Promise<SoundLibraryAsset[]>;
  importSound(sourcePath?: string): Promise<SoundLibraryOperationResult>;
  deleteSound(id: string): Promise<SoundLibraryOperationResult>;
  openSoundLibraryFolder(): Promise<SaveResult>;
  getHookStatus(): Promise<HookAccessStatus>;
  installHooks(): Promise<HookOperationSummary>;
  uninstallHooks(restoreBackup?: boolean): Promise<HookOperationSummary>;
  openHookProfileDir(id: string): Promise<SaveResult>;
  openOfficialWebsite(): Promise<SaveResult>;
  triggerAction(id: string): void;
  triggerPetClick(): void;
  previewPetClick(input: PetClickPreviewInput): void;
}

declare global {
  interface Window {
    petAPI: PetAPI;
  }
}
