# 宠物包 v2 与配置 v5 使用说明

本文说明 TRAE Pet 当前的宠物包 Manifest v2、用户配置 Config v5，以及测试和生产打包使用方式。

## 能力概览

- Manifest v2：描述宠物身份、视觉、动作、音频、状态音频、交互、展示、主题、作者和许可证。
- 旧 manifest 自动规范化：根级 `id`、`name` 格式仍可使用。
- Config v5：支持宠物选择、窗口、状态行为、音频及按宠物 ID 的覆盖设置。
- v3/v4 配置兼容：加载时自动合并并输出为 v5 结构，旧 `clickAction` 会迁移到 `click.action`。
- 双目录扫描：内置包优先于同 ID 的用户包。
- 用户宠物库：设置页“伙伴身份”可导入标准 Manifest v2 ZIP/文件夹、诊断和删除用户包。
- 九图快速制作：选择包含九张标准状态图片的文件夹，在九宫格中确认或调整状态映射，并生成 canonical `trae.pet.manifest.v2`。
- 安全安装：在 staging 中执行路径、符号链接、扩展名、大小、九状态与重复 ID 校验，通过后再原子安装。
- 运行时资源通过 `trae-pet://` 自定义协议提供给渲染进程。

> 点击互动已接入运行时：左键点击宠物会播放配置的包内动作和独立语音，结束后恢复最新基础状态。`doubleClickAction`、`presentation` 与 `theme` 仍未全部接入窗口渲染。

## 1. Manifest v2

Schema 为：

```json
{
  "schema": "trae.pet.manifest.v2"
}
```

### 必需状态

每个有效宠物包必须提供以下九个视觉状态：

```text
idle
waving
running-left
running-right
waiting
review
jumping
happy
failed
```

### 最小目录结构

```text
my-pet/
├── manifest.json
├── idle.webp
├── waving.webp
├── running-left.webp
├── running-right.webp
├── waiting.webp
├── review.webp
├── jumping.webp
├── happy.webp
└── failed.webp
```

可选音频文件放在宠物包内：

```text
my-pet/audio/
├── idle.m4a
└── happy.mp3
```

支持 `.mp3`、`.wav`、`.ogg`、`.m4a`、`.aac`、`.flac`。

### 完整 v2 示例

```json
{
  "schema": "trae.pet.manifest.v2",
  "identity": {
    "id": "my-pet",
    "name": "我的宠物",
    "description": "示例宠物包",
    "version": "1.0.0"
  },
  "visuals": {
    "idle": { "file": "idle.webp", "fps": 10, "loopKind": "seamless-loop" },
    "waving": { "file": "waving.webp", "durationMs": 1800 },
    "running-left": { "file": "running-left.webp" },
    "running-right": { "file": "running-right.webp" },
    "waiting": { "file": "waiting.webp" },
    "review": { "file": "review.webp" },
    "jumping": { "file": "jumping.webp" },
    "happy": { "file": "happy.webp" },
    "failed": { "file": "failed.webp" }
  },
  "actions": {
    "celebrate": { "state": "happy", "fallback": "idle", "durationMs": 2200 }
  },
  "sounds": {
    "idle-bgm": { "file": "audio/idle.m4a", "volume": 0.4 }
  },
  "stateSounds": {
    "idle": "idle-bgm"
  },
  "interaction": {
    "clickAction": "waving",
    "doubleClickAction": "celebrate"
  },
  "presentation": {
    "scale": 1,
    "anchor": "bottom-center"
  },
  "theme": {
    "primary": "#5b7cff",
    "accent": "#7a5cff",
    "bubble": "#ffffff"
  },
  "author": {
    "name": "Your Name",
    "url": "https://example.com"
  },
  "license": {
    "name": "MIT",
    "url": "https://opensource.org/licenses/MIT"
  }
}
```

### 旧 manifest 兼容

以下格式仍然有效。系统会自动将九个视觉文件规范化为 `${stateId}.webp`：

```json
{
  "id": "legacy-pet",
  "name": "旧版宠物",
  "description": "自动兼容",
  "version": 1
}
```

`durationMs` 表示动作播放一轮的时长，允许范围为 250–30000ms。点击动作应在 action 或其目标 visual 上声明；缺失时运行时使用 2000ms，并在宠物包诊断中给出 warning。旧包的 `actionMetadata.<id>.durationMs` 会被兼容读取。

## 2. Config v5

用户配置文件路径：

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/trae-pet/config.json` |
| Windows | `%APPDATA%\trae-pet\config.json` |
| Linux | `~/.config/trae-pet/config.json` |

示例：

```json
{
  "schema": "trae.pet.config.v5",
  "pet": {
    "selectedId": "my-pet",
    "displayName": "我的桌宠",
    "description": "自定义显示名称"
  },
  "window": {
    "width": 280,
    "height": 400,
    "scale": 1.5,
    "position": "bottom-right",
    "alwaysOnTop": true
  },
  "audio": {
    "enabled": true,
    "volume": 0.8
  },
  "petOverrides": {
    "my-pet": {
      "audio": {
        "enabled": true,
        "volume": 0.5
      },
      "stateSounds": {
        "idle": true,
        "happy": false
      },
      "soundSelections": {
        "idle": {
          "mode": "sound",
          "soundId": "idle-bgm"
        },
        "review": {
          "mode": "library",
          "soundId": "user:review-notice.mp3"
        },
        "failed": {
          "mode": "none"
        }
      },
      "click": {
        "action": "waving",
        "sound": {
          "mode": "sound",
          "soundId": "idle-bgm"
        }
      },
      "presentation": {
        "scale": 1.2,
        "reducedMotion": false
      }
    }
  }
}
```

配置合并顺序：

```text
代码 DEFAULT_CONFIG
→ resources/default-config.json
→ userData/config.json
→ 最终 Config v5
```

因此旧版 v3/v4 配置可以直接保留；系统加载时会合并其已支持字段并使用 v5 schema。遗留 GIF 资源路径和旧状态音频文件字段会被忽略。

### 点击互动

- `click.action` 缺省时继承 Manifest `interaction.clickAction`，`null` 表示主动禁用，字符串表示覆盖为指定包内动作。
- `click.sound` 与状态音效完全独立，支持 `none`、包内 `sound` 和公共 `library` 三种来源；缺省为无语音。
- 点击只形成瞬时展示层，不写入 `state.json`，不会覆盖 Hook 的持久状态与优先级。
- 连续点击会重新开始动作和语音；新的 Hook 或手动状态会立即结束点击展示。

### 为每个动作选择音效

设置页的每个状态支持四种音效策略：

- **使用包默认**：读取 Manifest `stateSounds[stateId]`；旧宠物包继续尝试 `audio/<stateId>.<ext>`。
- **无声音**：当前宠物的该动作明确静音，不进行资源回退。
- **包内曲目**：从当前宠物 Manifest `sounds` 中选择 soundId。
- **公共音效库**：从内置或用户公共 MP3 中选择来源限定的 soundId。

选择结果按宠物 ID 存在 `petOverrides` 中，因此不同宠物可以为同一个动作选择不同音效：

```json
{
  "petOverrides": {
    "orc-warrior": {
      "soundSelections": {
        "idle": {
          "mode": "sound",
          "soundId": "orgrimmar-ambience"
        },
        "happy": {
          "mode": "library",
          "soundId": "user:success.mp3"
        },
        "failed": {
          "mode": "none"
        }
      }
    }
  }
}
```

字段缺失表示继承包默认。指定的 soundId 如果在更新后的宠物包中不存在，运行时会报告资源错误并保持静音，不会自动播放其他曲目。

配置页提供独立试听按钮。试听不受声音总开关限制，但会应用主音量、状态相对音量和 Manifest 曲目音量；实际桌宠播放仍受声音总开关控制。

### 公共音效库

公共库不属于 Manifest，宠物包仍然保持自包含和可移植。它由两个目录组成：

```text
内置只读：<应用资源>/resources/sounds/
用户可写：<userData>/sounds/
```

- 当前公共库只扫描根目录中的 MP3 文件，不递归扫描子目录。
- 设置页支持导入 MP3、打开用户目录、刷新、试听和删除。
- 也可以把 MP3 直接复制到用户目录，再回到设置页刷新。
- 文件必须是普通文件，不能是符号链接，单文件最大 20 MiB，并会校验 MP3 文件头。
- 内置与用户文件使用 `builtin:` / `user:` 命名空间，因此同名文件不会互相覆盖。
- 删除仍被 `petOverrides[*].soundSelections` 引用的用户音效会被拒绝；应先为相关动作改选其他音效。
- 公共音效通过 `trae-pet://sound-library/<soundId>` 提供，renderer 不接触文件系统绝对路径。

## 3. 内置包与用户包

扫描目录：

```text
内置：<应用资源>/resources/pets/<id>/
用户：<userData>/pets/<id>/
```

规则：

1. 内置包先扫描。
2. 用户包与内置包使用相同 ID 时，内置包胜出，用户包不会覆盖它。
3. 缺少 manifest 或任意必需视觉状态的包不会显示在宠物列表中。
4. 当前选中的宠物包无效时，运行时会回退到 `trae`。

用户包安装位置示例：

```text
~/Library/Application Support/trae-pet/pets/my-pet/
```

## 4. 导入、删除与诊断

设置页“伙伴身份”的“用户宠物库”提供以下入口：

- **导入宠物包**：选择标准 Manifest v2 ZIP 或文件夹。
- **九图快速制作**：选择包含九张标准状态图片的文件夹。
- **诊断**：检查已安装用户包，并列出无效包及原因。
- **删除**：只能删除用户包，内置包不可删除。

### 安装前预检与预览

选择素材后，应用先复制或解压到 staging，不会直接写入正式宠物目录。预检窗口会显示：

- 九个标准状态的九宫格图片预览。
- 每个状态当前对应的文件；快速制作模式可用下拉框重新映射。
- 结构化错误和警告，以及可操作的修复提示。
- 宠物 ID、名称、描述、作者和许可证；快速制作模式可在安装前编辑。

错误会阻止“确认安装”，警告则保留给用户判断。只有预检通过后，staging 内容才会通过原子重命名安装到 `<userData>/pets/<id>/`。校验规则包括：

- 单文件最大 20 MiB，解压或复制后的单包总大小最大 100 MiB。
- 拒绝绝对路径、`..` 路径穿越和符号链接。
- 仅允许 JSON、视觉与音频白名单扩展名，并检查图片文件签名。
- 校验宠物 ID 格式、Manifest 引用和九个必需状态。
- 拒绝与内置包或已安装用户包重复的 ID，并提示修改 `identity.id` 后重新导入；快速制作时可直接改用新 ID。

预检会话有效期为 15 分钟。取消预览、安装成功或失败、会话过期以及应用退出时都会清理 staging，失败导入不会在用户宠物目录中留下半安装包。

### 九图快速制作

素材目录可使用 `.webp`、`.png`、`.gif` 或 `.apng` 图片。若文件名恰好为九个标准状态 ID，应用会自动完成映射；否则可在九宫格中手动选择。九个状态全部映射且宠物 ID、名称有效后才能安装。

九图映射完成后，所有未被标准状态占用的图片会显示在“额外动作”区域。额外动作默认启用，动作 ID 由文件名（不含扩展名）规范化为 kebab-case；可在安装前修改 ID、关闭不需要的动作、设置 250–30000ms 的单轮时长，并选择一个动作作为默认点击互动。动作 ID 必须唯一，且不能与九个标准状态 ID 冲突。安装后仍可在设置页“点击互动”中切换任意包内动作。

快速制作会在暂存目录内生成 canonical Manifest，schema 固定为 `trae.pet.manifest.v2`（`schemaVersion: 2`）。九图写入标准 `visuals`；启用的额外动作同时写入独立 `visuals` 和 `actions`，播放完回到 `idle`。若没有额外动作，默认点击仍为 `waving`。Manifest 同时包含默认帧率/播放方式、展示信息、作者和许可证，安装时仍会再次执行完整校验和重复 ID 检查。

### 删除与回退

删除用户包会同时清理该 ID 在配置中的 `petOverrides`。如果删除的是当前宠物，当前选择会自动回退到内置 `trae`；删除其他用户包不会改变当前选择。删除后包列表、配置和桌宠运行态会同步刷新。

## 5. 测试环境

### 前置条件

```bash
node --version
npm --version
npm install
```

当前开发与 Hook CLI 支持 Node 22/24 LTS，最低 `22.12.0`，推荐 Node 24 LTS。

### 开发运行

```bash
npm run dev
```

### 类型检查

```bash
npm run typecheck
```

### 全量单元测试

```bash
npm run test:node
```

等价命令：

```bash
node --experimental-strip-types --test tests/*.test.mjs
```

重点测试：

```bash
node --experimental-strip-types --test \
  tests/pet-package-v2.test.mjs \
  tests/pet-config-v3.test.mjs \
  tests/pet-packages.test.mjs \
  tests/renderer-state-payload.test.mjs
```

### 隔离测试数据

避免污染真实用户配置：

```bash
TRAE_PET_DATA_DIR=/tmp/trae-pet-test npm run dev
```

发送 Hook 测试事件：

```bash
TRAE_PET_DATA_DIR=/tmp/trae-pet-test \
TRAE_PET_INPUT_JSON='{"hook_event_name":"UserPromptSubmit","prompt":"test"}' \
node bin/trae-pet.js hook
```

检查运行状态：

```bash
TRAE_PET_DATA_DIR=/tmp/trae-pet-test node bin/trae-pet.js status
node bin/trae-pet.js doctor
```

`doctor` 当前不包含宠物包诊断；请在设置页“伙伴身份”的用户宠物库中点击“诊断”检查用户包。

## 6. 生产版本构建与发布

构建前建议：

```bash
npm ci
npm run verify
```

打包命令：

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

在 MacBook 上构建并组装官网 ZIP：

```bash
npm run release:local
npm run release:verify
```

常见产物：

```text
macOS Apple Silicon: TRAE-Pet-<version>-mac-arm64-unsigned-preview.zip
macOS Intel: TRAE-Pet-<version>-mac-x64-unsigned-preview.zip
Windows: TRAE-Pet-<version>-win-x64-unsigned-preview.zip
Linux: TRAE-Pet-<version>-linux-x64-unsigned-preview.zip
```

打包后内置资源位置：

```text
macOS:
TRAE Pet.app/Contents/Resources/resources/pets/

Windows:
<安装目录>/resources/resources/pets/

Linux:
<安装目录>/resources/resources/pets/
```

用户配置和用户宠物包独立于安装目录，升级通常会保留：

```text
config.json
pets/
state.json
history.jsonl
```

升级前建议备份：

```text
<userData>/config.json
<userData>/pets/
<userData>/state.json
```

当前没有自动更新或自动回滚机制。回滚时请保留旧版安装包；如果旧版本不能处理 v4 配置，恢复升级前备份的 `config.json`。

生产 ZIP 的统一安装入口为 `SETUP.md`，机器可读契约为
`install.manifest.json`。当前 `unsigned-preview` 未做 Apple 公证或 Windows
Authenticode 签名，官网必须明确展示此状态。

## 7. Hook 配置

开发版 macOS/Linux：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "/absolute/path/to/trae-pet/bin/trae-pet.sh hook"
      }
    ]
  }
}
```

Windows：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "command": "C:\\absolute\\path\\to\\trae-pet\\bin\\trae-pet.cmd hook"
      }
    ]
  }
}
```

生产版首次配置入口：

| 平台 | 路径 |
| --- | --- |
| macOS | `TRAE Pet.app/Contents/Resources/bin/trae-pet.sh` |
| Windows | `<安装目录>\resources\bin\trae-pet.cmd` |
| Linux | `<安装目录>/resources/bin/trae-pet.sh` |

运行 `<入口> install-hooks` 后，CLI 会复制到用户数据目录的 `hook-runtime/`，
并使用受支持的系统 Node，将稳定绝对路径幂等合并到 `~/.trae/hooks.json`。使用
`verify-hooks` 验收，使用 `uninstall-hooks` 安全移除；开发态同样使用源码 `bin/`
与系统 Node。
