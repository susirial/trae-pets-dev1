# Windows 安装与接入

适用于 `TRAE-Pet-<version>-win-x64-unsigned-preview.zip`。

## 安装

1. 按 ZIP 内 `SHA256SUMS.txt` 校验 NSIS 安装程序。
2. 运行 `TRAE-Pet-<version>-win-x64-setup.exe`，记录选择的安装目录。
3. 当前预览版未做 Authenticode 签名；确认官网来源与 hash 后再由用户明确继续。
4. 安装完成后勾选启动，或从开始菜单启动 **TRAE Pet**。首次启动会自动完成 Hook 接入。

## 自动接入 TRAE Hook

先安装受支持的系统 Node 22/24 LTS（最低 `22.12.0`，推荐 Node 24 LTS），再在
PowerShell 中确认：

```powershell
node --version
where.exe node
```

启动应用即可：它会扫描 `%USERPROFILE%\.trae`、`%USERPROFILE%\.trae-cn` 等全部已安装
的 TRAE 版本，逐个备份并安全合并各自的 `hooks.json`。稳定 Hook CLI 位于
`%APPDATA%\trae-pet\hook-runtime\`，并固化已验证系统 Node 的绝对路径。使用
`nvm-windows`、`fnm` 等版本管理器时，请确保登录会话本身能找到 Node，否则启动时会
弹出一次引导提示。

验收：

```powershell
$Launcher = "<安装目录>\resources\bin\trae-pet.cmd"
& $Launcher install-info
& $Launcher doctor
& $Launcher verify-hooks
```

只有验收失败时才需要手工修复，从能找到正确 Node 的终端运行
`& $Launcher install-hooks`；需要限定目标时追加 `--profile=trae-cn` 或
`--dir=<绝对路径>`。`TRAE_PET_NODE` 是高级覆盖，只应设为受支持 `node.exe` 的绝对路径。

验收时确认 `install-info`、`doctor`、`verify-hooks` 都输出 JSON 且 `ok: true`，
并确认 `verify-hooks.stateUpdated: true`。

## 升级与卸载

- 运行新版安装程序覆盖升级；NSIS 默认保留用户数据。
- 卸载 Hook：`& $Launcher uninstall-hooks`。
- 恢复备份：`& $Launcher uninstall-hooks --restore-backup`。
- 在“设置 → 应用”卸载程序。只有需要彻底清理时才删除 `%APPDATA%\trae-pet\`。

开发模式仍使用 `npm run dev` 和系统 Node。排障见 `TROUBLESHOOTING.md`。
