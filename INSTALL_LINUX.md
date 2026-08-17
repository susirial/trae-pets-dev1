# Linux 安装与接入

支持 x64 AppImage 与 Debian/Ubuntu x64 deb。不同 Wayland 合成器对透明置顶窗口和
托盘支持存在差异，发布前必须在目标发行版实测。

## 系统 Node

先安装 Node 22/24 LTS（最低 `22.12.0`，推荐 Node 24 LTS），并确认：

```bash
node --version
which node
```

启动应用时会自动完成 Hook 接入，因此请确保登录会话本身能找到 Node；使用 `nvm` 或
`fnm` 时尤其要注意。自动接入会固化已验证 Node 的绝对路径，并扫描 `~/.trae`、
`~/.trae-cn` 等全部已安装的 TRAE 版本，逐个备份并幂等合并各自的 `hooks.json`。
Node 升级、移动或卸载后重新启动应用即可刷新记录，也可以手工运行 `install-hooks`。
`TRAE_PET_NODE=/absolute/path/to/node` 是高级覆盖。

## AppImage

```bash
chmod +x TRAE-Pet-*-linux-x64.AppImage
./TRAE-Pet-*-linux-x64.AppImage
```

启动即接入。自动接入会把 CLI 复制到
`${XDG_CONFIG_HOME:-$HOME/.config}/trae-pet/hook-runtime/`，所以退出 AppImage 后
Hook 仍可使用已安装的系统 Node 22/24 LTS 运行。需要命令行验收或修复时临时解包：

```bash
./TRAE-Pet-*-linux-x64.AppImage --appimage-extract
./squashfs-root/resources/bin/trae-pet.sh install-info
./squashfs-root/resources/bin/trae-pet.sh doctor
./squashfs-root/resources/bin/trae-pet.sh verify-hooks
./squashfs-root/resources/bin/trae-pet.sh install-hooks
rm -rf squashfs-root
```

## deb

```bash
sudo apt install ./TRAE-Pet-*-linux-x64.deb
trae-pet
"/opt/TRAE Pet/resources/bin/trae-pet.sh" install-info
"/opt/TRAE Pet/resources/bin/trae-pet.sh" doctor
"/opt/TRAE Pet/resources/bin/trae-pet.sh" verify-hooks
```

实际安装路径可能随发行版调整，可在 `/opt` 或 desktop 文件中确认。
验收时三个诊断命令都必须输出 JSON 且 `ok: true`，并确认
`verify-hooks.stateUpdated: true`；失败时才运行 `install-hooks` 修复，可用
`--profile=trae-cn` 或 `--dir=<绝对路径>` 限定目标。

## 升级与卸载

- 安装新版 AppImage/deb；用户数据默认保留。
- 先运行 `uninstall-hooks` 移除 TRAE Pet Hook。
- AppImage 直接删除文件；deb 使用 `sudo apt remove trae-pet`。
- 只有彻底清理时才删除 `${XDG_CONFIG_HOME:-$HOME/.config}/trae-pet/`。

遇到 Wayland 问题可尝试：

```bash
ELECTRON_OZONE_PLATFORM_HINT=x11 ./TRAE-Pet-*-linux-x64.AppImage
```

其他问题见 `TROUBLESHOOTING.md`。
