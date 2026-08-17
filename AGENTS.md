# TRAE Pet Agent Guide

当用户要求安装此发布包时：

1. 阅读 `SETUP.md`、`install.manifest.json` 和当前平台的 `INSTALL_*.md`。
2. 先运行 `node --version` 与 macOS/Linux 的 `which node` 或 Windows 的
 `where.exe node`，确认系统 Node 是 22/24 LTS 且不低于 22.12.0。
3. 校验 `SHA256SUMS.txt` 后安装当前平台产物。
4. 启动应用一次。应用每次启动都会自动发现全部已安装的 TRAE 版本
 （`~/.trae`、`~/.trae-cn`、`~/.trae-beta` 等），并幂等合并各自的
 `hooks.json`，不需要手动编辑配置文件。
5. 运行发布包内 `trae-pet.sh|cmd` 的 `install-info`、`doctor`、`verify-hooks`
 做验收，只有 JSON 验收全部成功才报告完成。
6. 只有验收失败时才需要人工介入：使用发布包内的 `trae-pet.sh|cmd install-hooks`
 重新接入，不要直接覆盖用户的 `~/.trae/hooks.json` 或 `~/.trae-cn/hooks.json`。
 需要限定目标时使用 `--profile=trae-cn,trae` 或 `--dir=<绝对路径>`。
7. 遇到权限、Gatekeeper、SmartScreen、Wayland 或 Hook 问题时阅读
 `TROUBLESHOOTING.md`。

禁止事项：

- 不安装来源不明的依赖，不关闭系统安全功能。
- 不修改与 TRAE Pet 无关的 Hook。
- 不手工编辑 `hooks.json`；自动接入与 `install-hooks` 都会保留用户已有 Hook。
- 不删除用户数据，除非用户明确要求彻底卸载。
- 不把 `unsigned-preview` 描述成已签名正式版本。
- 不把 `stable` 描述成已验证商业包，除非 manifest 中 `signed`、`notarized`、
 `stapled` 均为 `true`，且 SHA256、Developer ID 和 Team ID 验收通过。
