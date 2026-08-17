# TRAE Pet 排障

## 先运行诊断

使用安装目录中的 `trae-pet.sh` 或 `trae-pet.cmd`：

```text
<launcher> install-info
<launcher> doctor
<launcher> verify-hooks
<launcher> status
```

这些命令输出 JSON。三个验收命令都应为 `ok: true`，`verify-hooks` 还应为
`stateUpdated: true`。重点检查 `hookCommand`、`nodePath`、`nodeVersion`、
`dataDir`、`resourcesDir`、`profiles`（每个 TRAE 版本一条，都应为 `ok: true`）和
当前 `state.action`。

应用每次启动的自动接入结果写在用户数据目录的 `hook-install-report.json`，
也可以在“配置 → 检查”页查看，并从那里重新接入或移除接入。

## 自动接入没有生效

- 确认应用至少完整启动过一次；接入在桌宠窗口出现后异步执行。
- 从图形界面启动时环境变量与终端不同。使用 `nvm`、`fnm` 时，登录会话可能找不到
  Node，这时应用会弹出一次引导提示，可改为在终端运行 `install-hooks` 修复。
- `hook-install-report.json` 中的 `action` 为 `no-profile` 表示没有发现 TRAE 配置
  目录：先安装并启动一次 TRAE，再重启应用。
- `skippedProfiles` 会说明某个 `~/.trae*` 目录被跳过的原因（符号链接、缺少 TRAE
  配置标志文件）。

## 只接入了部分 TRAE 版本

- 国际版与国内版分别使用 `~/.trae` 和 `~/.trae-cn`，两者的 `hooks.json` 相互独立。
- 新装了某个 TRAE 版本后重启 TRAE Pet 即可自动补齐，也可以运行
  `<launcher> install-hooks` 立即接入。
- 只想处理其中一个版本时使用 `<launcher> install-hooks --profile=trae-cn`，或用
  `--dir=<绝对路径>` 指定目录。

## 系统 Node 无法找到或路径失效

Hook CLI 只支持 Node 22/24 LTS，最低 `22.12.0`，推荐 Node 24 LTS。先检查：

```text
macOS/Linux: node --version && which node
Windows:     node --version; where.exe node
```

- 使用 `nvm`、`fnm` 或 `nvm-windows` 时，从已经激活正确 Node、且上述命令能找到
  Node 的终端运行发布包内 launcher 的 `install-hooks`。
- 安装器会把已验证 Node 的绝对路径写入 `hook-runtime/node-path.json`。Node 升级、
  移动或卸载后，必须重新运行 `install-hooks` 刷新记录。
- 自动发现异常时，可临时设置 `TRAE_PET_NODE` 为 Node 可执行文件的绝对路径后再运行
  `install-hooks`。这是高级覆盖，不要指向未经验证的程序。
- 安装包不提供独立 Hook Node runtime；不要从其他来源复制 runtime 到应用目录。

## Hook 没有触发

- 确认对应版本的 `hooks.json`（`~/.trae/hooks.json` 或 `~/.trae-cn/hooks.json`）中
  命令为绝对路径，并且 `hook` 子命令位于同一个 `command` 字符串内。
- 重新执行 `install-hooks`；它会备份并幂等合并，不会覆盖其他 Hook。
- 重启 TRAE 或新建会话。
- 查看用户数据目录下 `logs/hook-debug.log`。

## macOS 无法打开

- `stable`：先核对下载页和 ZIP 内 SHA256。若一致仍被拦截，运行
  `codesign --verify --deep --strict "/Applications/TRAE Pet.app"` 并把结果反馈给
  发布方；不要用右键打开绕过失败的商业签名。
- `unsigned-preview`：该渠道未签名、未公证。确认下载来源后，可右键应用选择“打开”，
  或在系统设置的“隐私与安全性”中明确放行。
- 任何渠道都不要关闭 Gatekeeper。

## Windows SmartScreen

当前预览版未做 Authenticode 签名。确认下载来源与 SHA256 后，由用户明确选择继续。
不要全局关闭 SmartScreen。

## Linux 窗口或托盘异常

- 优先在 X11 会话验证透明置顶窗口。
- Wayland 合成器对透明窗口、托盘和全局置顶支持不同；可尝试
  `ELECTRON_OZONE_PLATFORM_HINT=x11`。
- AppImage Hook 安装请按 `INSTALL_LINUX.md` 临时解包；Hook CLI 与 launcher 会复制到
  稳定用户数据目录，并使用安装时固化的系统 Node 绝对路径。

## 升级与卸载

- 运行新安装器覆盖升级；`config.json`、用户宠物和公共音效默认保留。
- `uninstall-hooks` 只移除 TRAE Pet Hook。
- `uninstall-hooks --restore-backup` 恢复安装前备份。
- 只有用户明确要求彻底清理时，才删除平台对应的 `trae-pet` 用户数据目录。
