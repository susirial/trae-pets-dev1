# TRAE Pet 生产版本制作手册

本文档面向负责发版、官网上传和交付验收的同学，说明如何从源码仓库制作最终用户可下载的生产版本。

如果只想安装已经打好的包，请看 `SETUP.md` 和对应平台的 `INSTALL_*.md`。如果只想做最终验收，请看 `RELEASE_CHECKLIST.md`。本文档关注的是“如何把用户版本做出来”。

## 1. 发布目标

生产版本的目标不是简单执行 `npm run build`，而是生成可分发给最终用户的安装包与官网 ZIP。

完整发布流程会完成以下工作：

- 构建 Hook CLI，输出 `dist/cli.cjs`。
- 构建 Electron App，输出 `out/`。
- 校验 Hook CLI 所需的系统 Node 版本策略与安装清单一致。
- 使用 `electron-builder` 生成平台安装器。
- 将安装器、安装说明、验收说明、排障文档和校验文件组装到 `release/final/`。
- 生成 `release-manifest.json` 和 `SHA256SUMS.txt`，供官网展示和发布校验使用。

## 2. 发布产物

正式给用户下载的文件只从 `release/final/` 中选择。

常见产物如下：

| 文件 | 用途 | 是否上传官网 |
| --- | --- | --- |
| `TRAE-Pet-<version>-mac-arm64-<channel>.zip` | Apple Silicon 用户下载包，内部包含 arm64 DMG 与说明文档 | 是，通过 Apple Silicon 实测后上传 |
| `TRAE-Pet-<version>-mac-x64-<channel>.zip` | Intel Mac 用户下载包，内部包含 x64 DMG 与说明文档 | 是，通过 Intel Mac 实测后上传 |
| `TRAE-Pet-<version>-win-x64-<channel>.zip` | Windows 用户下载包，内部包含 NSIS 安装器与说明文档 | 是，通过 Windows 实测后上传 |
| `TRAE-Pet-<version>-linux-x64-<channel>.zip` | Linux 用户下载包，内部包含 AppImage/deb 与说明文档 | 是，通过 Linux 实测后上传 |
| `TRAE-Pet-<version>-release-bundle.zip` | 发布汇总包，包含多个平台 ZIP 和公共文档 | 视官网流程决定，通常供内部归档 |
| `release-manifest.json` | 机器可读发布清单，记录版本、渠道、commit、hash、签名状态 | 是，或复制其中信息到下载页 |
| `SHA256SUMS.txt` | 最终 ZIP 的 SHA256 校验表 | 是，或复制 hash 到下载页 |

不要把 `release/raw/` 或 `release/staging/` 直接发给用户。它们是中间产物目录。

## 3. 前置环境

### 3.1 基础环境

发布机需要具备：

- macOS：用于原生分别构建 macOS arm64 与 x64 DMG。
- Node.js 22/24 LTS（最低 `22.12.0`，推荐 Node 24 LTS）与 npm：用于安装依赖、
  运行构建脚本和测试。
- Git：用于确认 commit 和工作区状态。
- Docker：用于构建 Windows x64 和 Linux x64 安装器。

### 3.2 平台限制

- macOS 安装器必须在 macOS 上构建。
- Windows 和 Linux 安装器由发布脚本通过 Docker/Wine 构建。
- 默认渠道是 `unsigned-preview`，发布脚本会显式关闭证书自动发现并生成未签名预览包。
- `security-test` 是仅限 macOS 的安全测试通道，使用
  `npm run release:mac:security-test` 构建，并在 manifest 记录 issuer 与 reviewStatus。
  与 stable 相同，它必须完成 Developer ID 签名、公证与 stapling，不能使用跳过参数。
- 官网 macOS 商业包使用 `stable` 通道，必须通过 Developer ID 签名、Apple 公证与 stapling。
- `stable` 还要求 `release.config.json` 的 `legal.reviewStatus` 为 `approved`；否则在
  访问签名凭据或开始构建前 fail closed。当前 `test-only` 状态不能发布 stable。

安全通道还会分别构建 arm64 与 x86_64 Swift `secure-core` 单架构 helper、从发行 CLI
剔除 TypeScript fallback、混淆 main/preload/CLI、压缩 renderer，并在打包时写入
Electron Fuses。ASAR integrity 用于篡改检测，混淆用于提高逆向成本；两者都不是源码加密。

### 3.3 工作区要求

正式发布前，Git 工作区必须干净。

检查命令：

```bash
git status --short
```

期望输出为空。

如果只是本地试验，可以给发布脚本加 `--allow-dirty`，但这样生成的 manifest 会标记 `dirty: true`，不建议用于正式发布。

### 3.4 macOS stable 商业发布凭据

官网 DMG 需要 Team `563C77XM96` 的 **Developer ID Application** 证书。`Apple
Development` 证书不能用于官网分发。先确认：

```bash
security find-identity -v -p codesigning
```

再把 Apple ID 的 App 专用密码保存到本机钥匙串 profile。以下命令会通过安全提示读取
密码，不要把密码写入仓库、命令行参数或 shell 脚本：

```bash
xcrun notarytool store-credentials "trae-pet-notary" \
  --apple-id "<APPLE_ID>" \
  --team-id "563C77XM96"
export APPLE_NOTARY_PROFILE="trae-pet-notary"
```

本机商业发布命令：

```bash
npm run release:mac:stable
npm run release:verify
npm run verify:mac-signing
shasum -a 256 -c release/final/SHA256SUMS.txt
```

stable 通道禁止 `--allow-dirty`、`--skip-verify` 和 `--skip-build`。流程会验证 app、
Helper、DMG 不含独立 Hook Node runtime、签名、公证 ticket、staple 与 Gatekeeper，任何一步
失败都不会生成可发布 manifest。

GitHub Actions 使用 `.github/workflows/release-mac.yml`。仓库 Secrets 必须配置：

- `MAC_CERT_P12_BASE64`
- `MAC_CERT_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

正式产物以受保护 tag 的 CI 结果为准，本机产物只用于预演和排障。

## 4. 标准三平台发布流程

下面是推荐给发布同学使用的标准流程。

### Step 1：进入项目根目录

```bash
cd /path/to/trae-pet_v1.0
```

确认当前目录下存在 `package.json`、`electron-builder.yml`、`release.config.json`。

### Step 2：确认版本号和发布渠道

版本号来自 `package.json`：

```bash
node -p "require('./package.json').version"
```

发布渠道和支持的系统 Node 版本策略来自 `release.config.json`。

发布前请确认：

- `package.json` 中的 `version` 是本次要发布的版本。
- `install.manifest.json` 中的版本与 `package.json` 一致。
- `release.config.json` 同时声明默认 `unsigned-preview`、测试 `security-test` 与商业
  `stable` 通道，并包含法务 issuer/reviewStatus。

### Step 3：安装干净依赖

```bash
npm ci
```

不要用 `npm install` 替代正式发布的依赖安装。`npm ci` 会严格使用 `package-lock.json`，更适合可复现发布。

### Step 4：执行完整验证

```bash
npm run verify
```

该命令会依次执行：

- `npm run typecheck`：检查 Node 侧和 Web 侧 TypeScript 类型。
- `npm run test:node`：执行 Node 测试。
- `npm run build`：构建 CLI 和 Electron App。
- `node scripts/release-preflight.mjs`：检查发布所需文件是否齐全。

如果这一步失败，不要继续打包。先修复类型、测试、构建或 preflight 问题。

### Step 5：执行发布组装

```bash
npm run release:local
```

这一步会执行完整生产制作流程：

- 再次运行发布前验证。
- 校验系统 Node 策略、package engines 与安装 manifest 一致。
- 执行发布 preflight。
- 原生分别构建 macOS arm64 与 x64 DMG。
- 通过 Docker/Wine 构建 Windows x64 安装器。
- 通过 Docker 构建 Linux x64 AppImage/deb。
- 复制安装文档、排障文档、验收清单、许可证和 `THIRD_PARTY_NOTICES.txt`。
- 生成各平台 staging 包。
- 生成 `release/final/` 下的最终 ZIP、manifest 和 SHA256。

如果工作区不干净，脚本会失败并提示：

```text
发布要求干净工作区；仅本地试验可显式传入 --allow-dirty
```

正式发布时应先清理工作区，而不是直接加 `--allow-dirty`。

### Step 6：验证最终发布包

```bash
npm run release:verify
```

该命令会检查：

- `release/final/release-manifest.json` 存在且结构正确。
- manifest 中记录的 ZIP 文件都存在。
- ZIP 文件大小和 SHA256 与 manifest 匹配。
- ZIP 内包含必要文档和安装器。
- ZIP 内包含 `THIRD_PARTY_NOTICES.txt`，且法务元数据与外层 manifest 一致。
- `SETUP.md` 中包含 Hook 安装、验证、卸载入口。

如果这一步失败，不要上传官网。

### Step 7：查看最终产物

```bash
ls -lh release/final
```

重点确认：

- 是否生成目标平台 ZIP。
- 是否生成 `release-manifest.json`。
- 是否生成 `SHA256SUMS.txt`。
- 文件大小是否明显异常，例如 ZIP 只有几 KB。

### Step 8：记录发布信息

打开 `release/final/release-manifest.json`，记录以下字段：

- `version`：版本号。
- `channel`：发布渠道。
- `commit`：构建来源 commit。
- `dirty`：构建时工作区是否有未提交变更。
- `supportedNode`：Hook CLI 支持的系统 Node 版本策略。
- `artifacts[].platform`：平台。
- `artifacts[].file`：最终 ZIP 文件名。
- `artifacts[].size`：文件大小。
- `artifacts[].sha256`：ZIP 的 SHA256。
- `artifacts[].signed`：签名状态。

正式发布建议 `dirty` 为 `false`。如果是 `true`，应重新从干净工作区构建。

## 5. 单平台补包流程

如果只需要补某个平台，可以直接运行单平台打包命令。

### macOS

```bash
npm run package:mac
```

输出位置通常在 `release/`，产物为 DMG。

### Windows

```bash
npm run package:win
```

输出位置通常在 `release/`，产物为 NSIS 安装器。

### Linux

```bash
npm run package:linux
```

输出位置通常在 `release/`，产物为 AppImage 和 deb。

注意：单平台 `package:*` 命令只负责生成安装器，不会像 `release:local` 一样完整组装官网 ZIP、manifest 和最终 SHA256。面向官网分发时，仍推荐使用 `npm run release:local` 生成 `release/final/`。

## 6. 发布脚本参数

底层发布脚本是：

```bash
node scripts/release.mjs
```

它支持以下参数：

| 参数 | 用途 | 正式发布建议 |
| --- | --- | --- |
| `--platform=all` | 构建全部平台，默认值 | 推荐 |
| `--platform=mac` | 只构建 macOS | 仅补包使用 |
| `--platform=win` | 只构建 Windows | 仅补包使用 |
| `--platform=linux` | 只构建 Linux | 仅补包使用 |
| `--arch=all` | macOS 同时构建 arm64 与 x64；`--platform=all` 时为默认值 | 可信 macOS 通道必须使用 |
| `--arch=arm64` / `--arch=x64` | 仅构建指定 macOS 架构 | 只用于普通单架构预览补包 |
| `--skip-verify` | 跳过 `npm run verify` | 不推荐正式发布使用 |
| `--skip-build` | 跳过安装器构建，复用已有 raw 产物 | 不推荐，除非明确知道原因 |
| `--allow-dirty` | 允许工作区不干净 | 只允许本地试验使用 |

示例：

```bash
node scripts/release.mjs --platform=mac
```

本地试验示例：

```bash
node scripts/release.mjs --platform=mac --allow-dirty
```

不要把带 `--allow-dirty` 生成的包作为正式官网包发布。

## 7. 目录说明

### `dist/`

CLI 构建产物目录。

关键文件：

```text
dist/cli.cjs
```

该文件会被打进 Electron 包的 `extraResources`，作为 Hook CLI 使用。

### `out/`

Electron App 构建产物目录。

关键文件包括：

```text
out/main/index.js
out/preload/index.js
out/renderer/pet/index.html
out/renderer/settings/index.html
```

### `release/raw/`

安装器原始输出目录。

这是 `electron-builder` 生成的中间产物，不直接给用户下载。

### `release/staging/`

平台发布包组装目录。

每个平台目录中会包含安装器、安装文档、排障文档、验收清单、许可证和 SHA256。

这是最终 ZIP 的来源目录，不直接作为官网下载入口。

### `release/final/`

最终发布目录。

官网上传、内部归档、版本登记都应以该目录为准。

## 8. 官网上传清单

每个平台上传前，至少确认以下信息：

- 平台 ZIP 来自 `release/final/`。
- `npm run release:verify` 已通过。
- 目标平台已按 `RELEASE_CHECKLIST.md` 完成人工验收。
- 下载页展示版本号。
- 下载页展示平台和架构，例如 `mac-arm64`、`mac-x64`、`win-x64`、`linux-x64`。
- 下载页展示签名状态，例如 `unsigned-preview`、`signed: false`。
- 下载页展示文件大小。
- 下载页展示 SHA256。
- 下载页保留或链接安装说明、排障说明和已知限制。

官网不要上传未经过目标系统实测的平台包。

## 9. 发布验收

自动验收必须通过：

```bash
npm ci
npm run verify
npm run release:local
npm run release:verify
```

人工验收以 `RELEASE_CHECKLIST.md` 为准，至少覆盖：

- macOS：DMG 安装、首次启动、透明窗口、置顶、拖动、托盘、Hook 安装验证卸载。
- Windows：NSIS 安装、开始菜单、首次启动、系统 Node、Hook 安装升级卸载。
- Linux：AppImage/deb 启动、X11/Wayland 行为、托盘、透明窗口、置顶、deb 升级卸载。

发布结论中必须写清楚：

- 哪些平台通过实测，可以上传官网。
- 哪些平台存在已知限制。
- 当前包是否签名。
- 当前包是否为 preview channel。

## 10. 常见失败处理

### 工作区不干净

现象：

```text
发布要求干净工作区；仅本地试验可显式传入 --allow-dirty
```

处理：

```bash
git status --short
```

确认未提交变更来源。正式发布应提交、暂存、移除或重新拉取干净工作区后再构建。

### preflight 缺文件

现象：

```json
{
  "ok": false,
  "checks": {
    "missing": ["..."]
  }
}
```

处理：

- 如果缺 `dist/cli.cjs`，先运行 `npm run build:cli` 或 `npm run build`。
- 如果缺 `out/...`，先运行 `npm run build:app` 或 `npm run build`。
- 如果缺 `LICENSE`、`package-lock.json`、`release.config.json`，先恢复必要仓库文件。

### Docker 构建失败

处理：

- 确认 Docker 正在运行。
- 确认当前用户有权限执行 Docker。
- 确认网络可以拉取或访问 `release.config.json` 中配置的容器镜像。
- 如果只需要先验证 macOS 包，可以临时使用 `node scripts/release.mjs --platform=mac` 单独构建，但不要把它当作三平台完整发布。

### release verify 失败

处理：

- 不要手工改 ZIP 内部文件。
- 删除异常的 `release/final/` 后重新执行 `npm run release:local`。
- 对比 `release-manifest.json` 中的文件名、大小和 SHA256 是否与实际文件一致。

### manifest 中 `dirty: true`

处理：

- 该包只适合本地试验或内部预览。
- 正式官网发布应从干净工作区重新构建，直到 manifest 中 `dirty` 为 `false`。

## 11. 发布后归档

发布完成后，建议归档以下信息：

- 发布日期。
- 发布人。
- Git commit。
- 版本号。
- 发布渠道。
- 上传平台。
- 每个平台 ZIP 文件名。
- 每个平台 SHA256。
- 签名状态。
- 人工验收结论。
- 已知限制。

可以直接把 `release/final/release-manifest.json` 和 `release/final/SHA256SUMS.txt` 存入发布记录系统。

## 12. 快速命令总览

正式三平台发布：

```bash
git status --short
npm ci
npm run verify
npm run release:local
npm run release:verify
ls -lh release/final
```

只构建 macOS 安装器：

```bash
npm run package:mac
```

只构建 Windows 安装器：

```bash
npm run package:win
```

只构建 Linux 安装器：

```bash
npm run package:linux
```

只组装 macOS 发布 ZIP：

```bash
node scripts/release.mjs --platform=mac
```

本地试验，不要求干净工作区：

```bash
node scripts/release.mjs --platform=mac --allow-dirty
```

正式发布不要使用最后一条命令生成官网包。
