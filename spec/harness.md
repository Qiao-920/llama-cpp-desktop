# Harness Engineering 框架

## 定义

本项目里的 Harness Engineering 指：为每个关键功能建立“规格、判定方法、测试命令、截图/日志证据”的闭环。开发者不能只说“应该修好了”，必须留下可复查证据。

## Harness 分层

| 层级 | 目标 | 输出证据 |
| --- | --- | --- |
| H1 静态检查 | 确认代码语法、格式、明显冲突没有破坏项目。 | 命令输出。 |
| H2 构建检查 | 确认 Electron 应用可打包，产物存在。 | exe 路径、文件大小、sha256。 |
| H3 请求检查 | 确认聊天请求体、模板参数、系统消息顺序正确。 | 请求摘要、日志片段、必要时截图。 |
| H4 UI 检查 | 确认聊天、附件、设置、终端在真实窗口尺寸下可用。 | 1365x768 和 1920x1080 截图。 |
| H5 异常检查 | 确认超时、500、端口占用、模型未启动等错误可读且不污染上下文。 | 错误截图和下一轮请求验证。 |
| H6 发布检查 | 确认版本号、tag、Release、资产一致。 | GitHub Release 链接、资产列表、sha256。 |

## 标准检查命令

在项目根目录运行：

```powershell
git status -sb
node --check desktop/main.mjs
node --check renderer/app.js
git diff --check
npm run dist
```

如果只做快速本地打包，可使用独立输出目录，避免覆盖正式产物：

```powershell
npx electron-builder --publish never --config.directories.output=dist-harness
```

## UI 证据要求

每次涉及界面的修复，至少提供以下截图：

1. `1365x768` 主聊天页。
2. `1920x1080` 主聊天页。
3. 相关功能打开态，例如附件菜单、模型信息弹窗、终端日志页。
4. 如果是生成中 bug，必须包含“生成中”状态截图。

截图必须能看出：

1. 没有按钮被遮挡。
2. 内容可滚动。
3. 输入框不覆盖最后一条消息。
4. 关键数值或文件名可读。
5. 错误态不会变成大面积不可读堆栈。

## 请求证据要求

涉及聊天请求、思考模式、系统消息、附件时，证据必须说明：

1. 最终发给 `/v1/chat/completions` 的请求中是否包含 `chat_template_kwargs`。
2. `messages[0]` 是否为合并后的 system 消息。
3. 本地 UI 错误是否带有 `localOnly` 或等价机制，确保不会进入下一轮请求。
4. 图片附件是否只作为可支持的多模态内容发送；普通文件是否作为文本或文件说明处理。

## 失败记录

如果某项没有通过，不允许写“已修复”。必须写：

1. 失败项 ID。
2. 复现步骤。
3. 实际结果。
4. 预期结果。
5. 下一步计划。

## 证据存放建议

建议每次修复建立一份文件：

```text
spec/evidence/YYYY-MM-DD-short-topic.md
```

可以直接复制 [evidence-template.md](evidence-template.md)。
