# TRAE Pet 安装入口

本文件同时面向最终用户和帮助安装的 AI。生产 ZIP 包含应用安装器、Hook CLI
和平台说明；配置 Hook 前需安装受支持的系统 Node 22/24 LTS（最低
`22.12.0`，推荐 Node 24 LTS）。安装包不提供独立 Hook Node runtime。

安装只有两步：**装应用**、**启动一次**。应用启动时会自动把桌宠 Hook 接入
本机全部 TRAE 版本，`install-hooks` 只在验收失败时作为修复手段使用。

## 给 AI 的执行约束

1. 先读取 `install.manifest.json` 和当前平台的 `INSTALL_*.md`。
2. 识别操作系统与 CPU 架构，只安装当前平台产物。
3. 先运行 `node --version` 和 macOS/Linux 的 `which node` 或 Windows 的
   `where.exe node`，确认 Node 是受支持的稳定版本。
4. 安装前验证 ZIP 内 `SHA256SUMS.txt`；不要跳过校验后声称成功。
5. 安装后启动应用一次，让它完成自动接入；不要手工编辑任何 `hooks.json`。
6. 依次执行 `install-info`、`doctor`、`verify-hooks` 并检查 JSON 验收字段。
   失败时才运行发布包内 launcher 的 `install-hooks` 修复。
7. 先读取 `install.manifest.json` 的 `channel` 与签名状态。`stable` 应已签名、公证；
   `unsigned-preview` 会触发系统安全警告。任何情况下都不得关闭系统安全功能。

## 系统 Node 前置检查

macOS / Linux：

```bash
node --version
which node
```

Windows PowerShell：

```powershell
node --version
where.exe node
```

只支持 Node 22/24 LTS，最低 `22.12.0`，推荐 Node 24 LTS。使用 `nvm`、`fnm`
等版本管理器时，请确保这些命令在普通登录会话（不只是某个终端）里也能找到 Node，
应用启动时的自动接入才能发现它。自动接入会验证 Node 并固化其绝对路径。
如果启动时找不到 Node，应用会弹出一次引导提示；装好 Node 后重新启动应用即可。

`TRAE_PET_NODE` 仅用于高级排障，可把它设为受支持 Node 可执行文件的绝对路径后再运行
launcher；日常安装不需要设置。

## 自动接入的 TRAE 版本

应用每次启动都会扫描用户主目录下的 TRAE 配置目录，并为每一个发现的版本幂等合并
`hooks.json`：

| 版本 | 配置目录 |
| --- | --- |
| 国际版 | `~/.trae/hooks.json` |
| 国内版 | `~/.trae-cn/hooks.json` |
| 其它变体（如 Beta） | `~/.trae-<变体>/hooks.json` |

Windows 上对应 `%USERPROFILE%\.trae\hooks.json`、`%USERPROFILE%\.trae-cn\hooks.json`。
只有真实存在、且含有 TRAE 自身配置文件的目录会被接入；符号链接会被跳过。
接入前会自动备份，已有的其它 Hook 会被保留。接入报告写在用户数据目录的
`hook-install-report.json`，也可以在应用的“配置 → 检查”页查看每个版本的接入状态。

## 安装流程

### macOS

1. 打开 DMG，将 **TRAE Pet** 拖到“应用程序”，然后启动一次，等待自动接入完成。
2. `stable` 包可直接启动；若签名校验失败，应停止安装并核对 SHA256。
   `unsigned-preview` 才需要右键应用选择“打开”，或在“隐私与安全性”中明确放行。
3. 验收（失败时才需要 `install-hooks`）：

```bash
"/Applications/TRAE Pet.app/Contents/Resources/bin/trae-pet.sh" verify-hooks
"/Applications/TRAE Pet.app/Contents/Resources/bin/trae-pet.sh" install-hooks
```

### Windows

1. 运行 `TRAE-Pet-*-win-x64-setup.exe`；安装完成后勾选启动，或从开始菜单启动一次。
2. 验收（失败时才需要 `install-hooks`）：

```powershell
& "<安装目录>\resources\bin\trae-pet.cmd" verify-hooks
& "<安装目录>\resources\bin\trae-pet.cmd" install-hooks
```

### Linux

1. 给 AppImage 执行权限并启动一次，自动接入会在启动时完成。
2. AppImage 挂载路径不是稳定 Hook 路径，但自动接入会把 CLI 复制到用户数据目录中的
   稳定 `hook-runtime/`，所以退出 AppImage 后 Hook 依然可用。
3. 需要手工验收或修复时临时解包：

```bash
chmod +x ./TRAE-Pet-*.AppImage
./TRAE-Pet-*.AppImage --appimage-extract
./squashfs-root/resources/bin/trae-pet.sh verify-hooks
./squashfs-root/resources/bin/trae-pet.sh install-hooks
rm -rf ./squashfs-root
```

推荐 Debian/Ubuntu 用户安装 `.deb` 后直接使用安装目录中的入口：

```bash
"/opt/TRAE Pet/resources/bin/trae-pet.sh" verify-hooks
"/opt/TRAE Pet/resources/bin/trae-pet.sh" install-hooks
```

## 验收

所有平台都必须完成：

1. `install-info` JSON 返回 `ok: true`、正确版本、平台、`profiles` 列出已发现的
   TRAE 版本，以及绝对 Hook 路径和 Node 信息。
2. `doctor` JSON 返回 `ok: true`，Node 路径与版本有效。
3. `verify-hooks` JSON 返回 `ok: true`、`stateUpdated: true`，且 `profiles` 中每个
   版本都是 `ok: true`。
4. 启动 TRAE 新会话并发送消息，桌宠状态随 Hook 事件变化。

失败时阅读 `TROUBLESHOOTING.md`。卸载 Hook 使用：

```text
trae-pet.sh|trae-pet.cmd uninstall-hooks
```

如需恢复安装前备份，追加 `--restore-backup`。只想处理某一个 TRAE 版本时，追加
`--profile=trae-cn` 或 `--dir=<绝对路径>`。
