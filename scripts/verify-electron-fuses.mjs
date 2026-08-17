import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  getCurrentFuseWire,
} from '@electron/fuses';

const EXPECTED_FUSES = new Map([
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.DISABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
]);

export async function verifyElectronFuses(appPath) {
  const current = await getCurrentFuseWire(appPath);
  if (current.version !== FuseVersion.V1) {
    throw new Error(`不支持的 Electron Fuse 版本：${current.version}`);
  }
  for (const [option, expected] of EXPECTED_FUSES) {
    if (current[option] !== expected) {
      throw new Error(
        `Electron Fuse ${FuseV1Options[option]} 状态错误：期望 ${expected}，实际 ${current[option]}`,
      );
    }
  }
  return true;
}
