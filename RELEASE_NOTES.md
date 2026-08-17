# TRAE Pet 0.3.0

本版本是开源源码树对应的 0.3.0 发布。它不引入许可证激活、设备绑定、登录或联网授权；
从源码构建或安装后的应用可直接使用。

## 分发状态

- `security-test` 仅允许生成 macOS arm64（Apple Silicon）与 x64（Intel）两个独立
  测试包，manifest 必须同时记录两种架构及 `channel`、`issuer` 与 `reviewStatus`。
- 当前法务状态是 `test-only`，因此 `stable` 会 fail closed，不能开始签名发布。
- macOS arm64/x64 DMG：`security-test` 与 `stable` 都必须分别使用 Developer ID
  签名、Apple 公证与 stapling；`unsigned-preview` 渠道仍为未签名测试包。
- Windows x64 NSIS：未进行 Authenticode 签名。
- Linux x64：AppImage 与 deb。
- Hook CLI 使用受支持的系统 Node 22/24 LTS（最低 `22.12.0`，推荐 Node 24 LTS），
  安装包不分发独立 Node runtime；安装 Hook 时会固化系统 Node 的绝对路径。

具体渠道和签名状态以包内 `install.manifest.json` 与外层 `release-manifest.json`
为准。官网公开前应在目标系统完成 `RELEASE_CHECKLIST.md`。

## 许可与第三方声明

- 应用本体采用 MIT 许可证，见根目录 `LICENSE`。
- 发布包包含 `THIRD_PARTY_NOTICES.txt`；Electron Framework 内继续携带完整 Chromium
  bundled notices。该声明不是完整法律审计。

## 安全加固

- Hook 事件映射、提示生成和隐私摘要迁移到随目标包提供的单架构 Swift
  `secure-core`；发行 CLI 编译时移除 TypeScript fallback。
- main、preload 和 CLI 采用兼容性优先的混淆；renderer 采用生产压缩，所有生产构建
  均禁止 source map。
- 启用 ASAR integrity、OnlyLoadAppFromAsar、RunAsNode/Node options/inspect 禁用等
  Electron Fuses，并验证实际 packaged fuse wire。
- BrowserWindow 启用 sandbox/context isolation，生产禁用 DevTools、外部导航和窗口
  打开；CSP 禁止脚本内联和网络连接。
- `EnableCookieEncryption` Fuse 保持关闭：应用不使用 Cookie 或网络会话，而 Electron
  42 在受支持的 macOS 环境开启该可选 Fuse 会阻塞 packaged 主进程启动。

这些措施用于提高逆向和篡改成本，不是源码加密，也不能保证纯客户端软件绝对无法破解。
