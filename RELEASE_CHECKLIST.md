# TRAE Pet 发布验收清单

版本：__________  Commit：__________  验收日期：__________

## 自动门禁

- [ ] `npm ci`
- [ ] `npm run verify`
- [ ] 三个平台安装器构建完成
- [ ] `npm run release:verify`
- [ ] `SHA256SUMS.txt` 自校验成功
- [ ] 发布包标记与实际签名状态一致
- [ ] stable macOS manifest 为 `dirty: false`，且禁止跳过 verify/build
- [ ] stable 发布前 `release.config.json` 的 `legal.reviewStatus` 已经正式审核为 `approved`
- [ ] security-test 仅包含 macOS arm64 与 x64 两个独立产物，manifest 的 channel/issuer/reviewStatus 正确
- [ ] 系统 Node 策略在 package engines、release config、install manifest 和文档中一致：
  22/24 LTS、最低 22.12.0、推荐 Node 24 LTS
- [ ] 每个平台 ZIP 与应用资源都包含 `LICENSE` 和 `THIRD_PARTY_NOTICES.txt`
- [ ] 已确认测试版未加入许可证激活、设备绑定、登录或联网授权
- [ ] packaged Fuse wire 与 `electron-builder.yml` 一致，ASAR integrity 和 only-load-from-ASAR 已启用
- [ ] arm64/x64 包内 `secure-core` 分别为 arm64/x86_64 单架构、可执行且通过 `codesign --verify`
- [ ] main/preload/CLI 混淆 manifest 哈希通过，ASAR 与 CLI 中没有 `.map`
- [ ] 签名 packaged app 实际启动后创建 renderer，Hook CLI 继续返回 `continue:true`
- [ ] 篡改测试副本的 `app.asar` 后应用拒绝正常启动，未修改原始签名产物

## 用户宠物导入与快速制作

测试素材：`reaper/` 类目录（包含 `idle`、`waving`、`running-left`、`running-right`、`waiting`、`review`、`jumping`、`happy`、`failed` 九张标准状态图片及 `ultimate-death-blossom.webp` 额外动作）及一个标准 Manifest v2 ZIP。

- [ ] 设置页“伙伴身份”显示用户宠物库，并可打开“导入宠物包”“九图快速制作”和“诊断”
- [ ] 选择 reaper 类九图目录后，九宫格预览完整，自动映射或手动调整九个状态均可用
- [ ] 未被九图占用的图片出现在“额外动作”区域，可启用/停用、修改合法且唯一的动作 ID、设置时长并选择默认点击动作
- [ ] 快速制作填写新 ID 和名称后安装成功，生成 canonical `trae.pet.manifest.v2`，并自动选中新宠物
- [ ] 安装后的额外图片同时写入 Manifest `visuals` 与 `actions`，在“点击互动”中可选择、预览，播放结束恢复基础状态
- [ ] 标准 Manifest v2 ZIP 预检、九宫格预览及安装成功
- [ ] 结构化错误/警告可见；重复 ID 被拒绝并明确提示改名
- [ ] 超过单文件 20 MiB、总包 100 MiB、含 symlink 或路径穿越的输入均被拒绝
- [ ] 取消、失败和安装完成后 staging 均无残留，失败导入不产生半安装包
- [ ] 删除非当前用户包会清理对应 `petOverrides`，且不影响当前宠物
- [ ] 删除当前用户包会回退到内置 `trae`，并清理对应 `petOverrides`
- [ ] 安装后退出并重启应用，用户包仍能加载、选择并正确显示九个状态

## macOS

测试人：__________  系统/架构：__________

- [ ] `codesign --verify --deep --strict` 验证 app 和 secure-core Helper
- [ ] DMG 内不存在独立 Hook Node runtime，Hook 使用受支持的系统 Node
- [ ] `xcrun stapler validate` 验证 DMG 公证 ticket
- [ ] `spctl` 对 DMG 和 app 均返回 accepted，Team ID 为 `563C77XM96`
- [ ] 在未安装开发证书的干净 Mac 上完成 DMG 安装与首次启动
- [ ] 断网后从已下载 DMG 首次启动，确认 stapled ticket 可用
- [ ] 桌宠透明窗口、置顶、拖动、托盘
- [ ] 配置保存、宠物切换、宠物包导入、公共音效
- [ ] `install-hooks → verify-hooks → uninstall-hooks`
- [ ] Apple Silicon 使用 arm64 包，Intel Mac 使用 x64 包；两台实体机分别完成安装与首次启动
- [ ] `node --version` 与 `which node` 通过；Node 升级/移动后重跑 `install-hooks` 可刷新固化路径
- [ ] 覆盖升级与普通卸载保留用户数据

## Windows

测试人：__________  系统/架构：__________

- [ ] NSIS 安装、开始菜单、首次启动
- [ ] 桌宠透明窗口、置顶、拖动、托盘
- [ ] 宠物包导入与公共音效
- [ ] 未安装受支持系统 Node 时安装命令友好失败且不修改 Hooks
- [ ] Hook 安装、升级、卸载及备份恢复
- [ ] `node --version` 与 `where.exe node` 通过；`install-info`、`doctor`、`verify-hooks` JSON 验收成功

## Linux

测试人：__________  发行版/桌面环境：__________

- [ ] AppImage 与 deb 启动
- [ ] X11/Wayland 已知行为记录
- [ ] 托盘、透明窗口、置顶
- [ ] AppImage 解包安装 Hook 后可删除临时目录
- [ ] `node --version` 与 `which node` 通过；`install-info`、`doctor`、`verify-hooks` JSON 验收成功
- [ ] deb 升级与卸载

## 发布结论

- [ ] 官网只上传通过目标系统实测的平台
- [ ] 已知限制写入 `RELEASE_NOTES.md`
- [ ] 下载页展示版本、平台、架构、签名状态、大小和 SHA256
- [ ] 下载包包含 `PRIVACY.md`，官网隐私说明与应用实际本地数据行为一致
- [ ] 发布包包含 MIT `LICENSE` 与 `THIRD_PARTY_NOTICES.txt`
