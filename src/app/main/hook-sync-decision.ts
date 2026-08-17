/**
 * Pure launch-time decision logic for the hook auto-installer. Kept free of any
 * Electron import so it stays directly unit testable.
 */

export interface HookReportProfile {
  id: string;
  dir: string;
  hooksFile: string;
  ok: boolean;
  error?: string;
}

export interface HookInstallReport {
  schema: 'trae.pet.hook-report.v1';
  appVersion: string;
  updatedAt: string;
  ok: boolean;
  action: HookSyncAction;
  profileSource: string;
  profiles: HookReportProfile[];
  skippedProfiles: Array<{ dir: string; reason: string }>;
  node: {
    ok: boolean;
    version: string | null;
    execPath: string | null;
    error: string | null;
  };
  nodePromptShownFor: string | null;
  error?: string;
}

export type HookSyncAction = 'install' | 'skip' | 'no-profile';

export interface HookSyncInput {
  appVersion: string;
  report: HookInstallReport | null;
  verifyOk: boolean;
  discoveredProfileIds: string[];
}

export interface HookSyncDecision {
  action: HookSyncAction;
  reason: string;
}

function sameProfileSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function decideHookSync({
  appVersion,
  report,
  verifyOk,
  discoveredProfileIds,
}: HookSyncInput): HookSyncDecision {
  if (discoveredProfileIds.length === 0) {
    return { action: 'no-profile', reason: '未检测到 TRAE 配置目录' };
  }
  if (!verifyOk) {
    return { action: 'install', reason: 'Hook 校验未通过，需要重新接入' };
  }
  if (!report || !report.ok) {
    return { action: 'install', reason: '缺少成功的接入记录' };
  }
  if (report.appVersion !== appVersion) {
    return { action: 'install', reason: `应用版本已从 ${report.appVersion} 升级到 ${appVersion}` };
  }
  if (!sameProfileSet(report.profiles.map((profile) => profile.id), discoveredProfileIds)) {
    return { action: 'install', reason: '检测到新的 TRAE 版本目录' };
  }
  return { action: 'skip', reason: '全部 TRAE 版本已接入且校验通过' };
}

/**
 * The missing-Node dialog is a one-shot per app version: repeating it on every
 * launch would be noise for users who deliberately postponed the install.
 */
export function shouldPromptNodeInstall(
  report: HookInstallReport | null,
  appVersion: string,
  nodeOk: boolean,
): boolean {
  if (nodeOk) return false;
  return report?.nodePromptShownFor !== appVersion;
}
