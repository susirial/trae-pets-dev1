# TRAE Pet 隐私说明

TRAE Pet 在本机读取 TRAE Hook 事件，用于更新桌宠动作、状态文字和聊天气泡。应用
不提供遥测、广告或云端同步，也不会主动把 Hook 内容上传到 TRAE Pet 服务器。

## 本地处理的数据

- Hook 事件类型、工具名称、执行状态及经过截断的操作摘要。
- 用户主动开启对应设置后，可能显示提示词或命令参数。
- 配置、运行状态、诊断日志、用户宠物包和音效均保存在本地用户数据目录。
- 历史记录默认关闭；开启后只写入本地文件。

默认配置不显示提示词和完整命令参数，并启用密钥脱敏。脱敏会识别常见的 API key、
token、密码、Bearer token 和 JWT，但不能保证覆盖所有自定义秘密格式。不要在不受信任
的屏幕共享环境中开启敏感内容显示。

## 网络与外部链接

应用运行时不上传 Hook 数据。用户主动点击“官网”时，系统浏览器会打开
`https://www.trae-pets.com/`；该网页适用网站自身的隐私政策。

## 查看与删除

用户数据目录：

- macOS：`~/Library/Application Support/trae-pet/`
- Windows：`%APPDATA%\trae-pet`
- Linux：`${XDG_CONFIG_HOME:-~/.config}/trae-pet`

普通卸载默认保留用户配置。彻底删除前应先运行 `uninstall-hooks`，再由用户明确删除
上述目录。`uninstall-hooks` 只移除 TRAE Pet 自己安装的 Hook，不改动其他 Hook。
