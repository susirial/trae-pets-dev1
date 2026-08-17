import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import { NODE_DOWNLOAD_URL, isAllowedExternalUrl } from '@shared/external-links';
import type { HookAccessStatus } from '@shared/ipc';
import {
  installTraeHooks,
  uninstallTraeHooks,
  verifyTraeHooks,
  type HookOperationResult,
} from '../../cli/hook-installer';
import { resolveTraeProfiles } from '../../cli/trae-profiles';
import { SUPPORTED_NODE } from '../../cli/node-runtime';
import { getUserPaths } from './paths';
import {
  decideHookSync,
  shouldPromptNodeInstall,
  type HookInstallReport,
  type HookSyncAction,
} from './hook-sync-decision';

let syncing = false;

function reportFile(): string {
  return path.join(getUserPaths().baseDir, 'hook-install-report.json');
}

/**
 * Root holding `bin/` and `cli/cli.cjs`. Packaged builds ship them as extra
 * resources; in dev they live at the repo root.
 */
function packagedRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

export function readHookReport(): HookInstallReport | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(reportFile(), 'utf8').replace(/^\uFEFF/, ''),
    ) as Partial<HookInstallReport>;
    return parsed.schema === 'trae.pet.hook-report.v1' ? parsed as HookInstallReport : null;
  } catch {
    return null;
  }
}

function writeHookReport(report: HookInstallReport): void {
  const file = reportFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function buildReport(
  action: HookSyncAction,
  result: HookOperationResult,
  nodePromptShownFor: string | null,
): HookInstallReport {
  return {
    schema: 'trae.pet.hook-report.v1',
    appVersion: app.getVersion(),
    updatedAt: new Date().toISOString(),
    ok: result.ok,
    action,
    profileSource: result.profileSource,
    profiles: result.profiles.map((profile) => ({
      id: profile.id,
      dir: profile.dir,
      hooksFile: profile.hooksFile,
      ok: profile.ok,
      ...(profile.error ? { error: profile.error } : {}),
    })),
    skippedProfiles: result.skippedProfiles,
    node: {
      ok: Boolean(result.node?.ok),
      version: result.node?.version ?? null,
      execPath: result.node?.execPath ?? null,
      error: result.node?.error ?? null,
    },
    nodePromptShownFor,
    ...(result.error ? { error: result.error } : {}),
  };
}

async function promptMissingNode(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'TRAE Pet 需要系统 Node',
    message: '桌宠已启动，但还无法自动接入 TRAE Hook',
    detail: `自动接入需要系统安装 Node ${SUPPORTED_NODE.majors.join('/')} LTS`
      + `（最低 ${SUPPORTED_NODE.min}，推荐 ${SUPPORTED_NODE.recommended}）。`
      + '\n安装完成后重新启动 TRAE Pet 即可自动完成接入，无需手动编辑 hooks.json。',
    buttons: ['打开 Node 下载页', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0 && isAllowedExternalUrl(NODE_DOWNLOAD_URL)) {
    await shell.openExternal(NODE_DOWNLOAD_URL);
  }
}

function toAccessStatus(
  result: HookOperationResult,
  report: HookInstallReport | null,
): HookAccessStatus {
  return {
    ok: result.ok,
    busy: syncing,
    lastAction: report?.action ?? 'unknown',
    updatedAt: report?.updatedAt ?? null,
    appVersion: report?.appVersion ?? null,
    profileSource: result.profileSource,
    profiles: result.profiles.map((profile) => ({
      id: profile.id,
      dir: profile.dir,
      hooksFile: profile.hooksFile,
      ok: profile.ok,
      ...(profile.error ? { error: profile.error } : {}),
    })),
    skippedProfiles: result.skippedProfiles,
    node: {
      ok: Boolean(result.node?.ok),
      version: result.node?.version ?? null,
      execPath: result.node?.execPath ?? null,
      error: result.node?.error ?? null,
    },
    requirements: {
      min: SUPPORTED_NODE.min,
      majors: [...SUPPORTED_NODE.majors],
      recommended: SUPPORTED_NODE.recommended,
    },
    ...(result.error ? { error: result.error } : {}),
  };
}

export function hookAccessStatus(): HookAccessStatus {
  return toAccessStatus(
    verifyTraeHooks({ packagedRoot: packagedRoot() }),
    readHookReport(),
  );
}

export function installHooksNow(): HookAccessStatus {
  const result = installTraeHooks(app.getVersion(), { packagedRoot: packagedRoot() });
  const report = buildReport('install', result, readHookReport()?.nodePromptShownFor ?? null);
  writeHookReport(report);
  return toAccessStatus(result, report);
}

export function uninstallHooksNow(restoreBackup = false): HookAccessStatus {
  const result = uninstallTraeHooks(restoreBackup, { packagedRoot: packagedRoot() });
  const report = buildReport('install', result, readHookReport()?.nodePromptShownFor ?? null);
  writeHookReport(report);
  return toAccessStatus(result, report);
}

/** Only directories the installer itself knows about may be revealed. */
export function resolveKnownProfileDir(id: string): string | null {
  const discovered = resolveTraeProfiles().profiles.find((profile) => profile.id === id);
  if (discovered) return discovered.dir;
  return readHookReport()?.profiles.find((profile) => profile.id === id)?.dir ?? null;
}

/**
 * Runs on every launch so newly installed TRAE variants get wired up and an app
 * upgrade refreshes the stable hook runtime. Never throws and never blocks: a
 * failure here must not stop the pet from showing up.
 */
export async function syncHooksOnLaunch(): Promise<HookInstallReport | null> {
  if (syncing) return readHookReport();
  syncing = true;
  try {
    const appVersion = app.getVersion();
    const previous = readHookReport();
    const discovered = resolveTraeProfiles().profiles.map((profile) => profile.id);
    const verified = verifyTraeHooks({ packagedRoot: packagedRoot() });
    const decision = decideHookSync({
      appVersion,
      report: previous,
      verifyOk: verified.ok,
      discoveredProfileIds: discovered,
    });

    if (decision.action === 'skip') {
      const report = buildReport('skip', verified, previous?.nodePromptShownFor ?? null);
      writeHookReport(report);
      return report;
    }

    if (decision.action === 'no-profile') {
      const report = buildReport('no-profile', {
        ...verified,
        ok: false,
        error: decision.reason,
      }, previous?.nodePromptShownFor ?? null);
      writeHookReport(report);
      return report;
    }

    const result = installTraeHooks(appVersion, { packagedRoot: packagedRoot() });
    const promptNode = shouldPromptNodeInstall(
      previous,
      appVersion,
      Boolean(result.node?.ok),
    );
    const report = buildReport(
      'install',
      result,
      promptNode ? appVersion : previous?.nodePromptShownFor ?? null,
    );
    writeHookReport(report);
    if (promptNode) await promptMissingNode();
    return report;
  } catch {
    // Auto-install is best effort; the settings panel exposes a manual retry.
    return null;
  } finally {
    syncing = false;
  }
}
