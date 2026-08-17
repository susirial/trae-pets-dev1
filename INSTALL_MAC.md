# macOS 安装与接入

适用于 `TRAE-Pet-<version>-mac-arm64-<channel>.zip`（Apple Silicon）或
`TRAE-Pet-<version>-mac-x64-<channel>.zip`（Intel）。安装前先读取
`install.manifest.json`，确认版本、渠道和 macOS 签名状态。

## 选择正确架构

点击 Apple 菜单  →“关于本机”查看芯片；也可以在终端运行：

```bash
uname -m
```

- 显示 `arm64` 或“Apple M 系列”时，下载
  `TRAE-Pet-<version>-mac-arm64-<channel>.zip`，内部 DMG 名为
  `TRAE-Pet-<version>-mac-arm64.dmg`。
- 显示 `x86_64` 或“Intel”时，下载
  `TRAE-Pet-<version>-mac-x64-<channel>.zip`，内部 DMG 名为
  `TRAE-Pet-<version>-mac-x64.dmg`。

Apple Silicon 默认使用 arm64 原生产物；不要把 x64/Rosetta 版本作为默认安装方案。

## 安装

1. 按 ZIP 内 `SHA256SUMS.txt` 校验 DMG。
2. 打开 DMG，将 **TRAE Pet** 拖入“应用程序”。
3. `stable` 包已使用 Developer ID 签名、公证并附加 ticket，应可直接启动。若系统仍
   报告无法验证开发者，不要绕过 Gatekeeper，先核对 SHA256 与下载来源。
4. `unsigned-preview` 未签名、未公证，仅用于测试；确认来源后可右键应用选择“打开”，
   或在“隐私与安全性”中明确放行。
5. 启动应用，确认桌宠与配置工作室可以打开。首次启动会自动完成 TRAE Hook 接入。

## 自动接入 TRAE Hook

先安装受支持的系统 Node 22/24 LTS（最低 `22.12.0`，推荐 Node 24 LTS），并确认：

```bash
node --version
which node
```

启动应用即可：它会扫描 `~/.trae`、`~/.trae-cn` 等全部已安装的 TRAE 版本，逐个备份并
幂等合并各自的 `hooks.json`，再把 Hook CLI 复制到
`~/Library/Application Support/trae-pet/hook-runtime/`，并记录系统 Node 的绝对路径；
升级应用不会改变稳定 Hook 路径。使用 `nvm` 或 `fnm` 时，请确保登录会话本身能找到
Node，否则启动时会弹出一次引导提示。

接入结果可以在应用的“配置 → 检查”页查看，也可以用命令行验收：

```bash
LAUNCHER="/Applications/TRAE Pet.app/Contents/Resources/bin/trae-pet.sh"
"$LAUNCHER" install-info
"$LAUNCHER" doctor
"$LAUNCHER" verify-hooks
```

只有验收失败时才需要手工修复。从能找到正确 Node 的终端运行：

```bash
"$LAUNCHER" install-hooks
```

需要只处理某一个 TRAE 版本时追加 `--profile=trae-cn` 或 `--dir=<绝对路径>`。
`TRAE_PET_NODE=/absolute/path/to/node` 是高级覆盖，仅在自动发现不符合预期时使用。
验收时确认 `install-info`、`doctor`、`verify-hooks` 都输出 JSON 且 `ok: true`，
并确认 `verify-hooks.stateUpdated: true`。

## 升级与卸载

- 将新版应用覆盖到“应用程序”；用户配置和资源默认保留。
- 移除 Hook：`"$LAUNCHER" uninstall-hooks`。
- 恢复安装前 Hook：`"$LAUNCHER" uninstall-hooks --restore-backup`。
- 删除应用完成普通卸载。只有需要彻底清理时，才删除
  `~/Library/Application Support/trae-pet/`。

开发模式同样使用 `npm run dev` 和系统 Node。排障见
`TROUBLESHOOTING.md`，本地数据处理说明见 `PRIVACY.md`。
