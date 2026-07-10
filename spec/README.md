# llama.cpp Desktop 主规格文档

## 一句话设定

llama.cpp Desktop 是一个面向 Windows 用户的本地 llama.cpp 桌面控制台，用来选择模型、启动本地 OpenAI 兼容服务、进行聊天调试，并把复杂配置收进可理解的桌面端界面里。

## 文档职责

本目录不是普通说明书，而是开发用规格体系。任何新功能、修复、发布前检查，都应该先对照这里的规格和验收标准。

| 文档 | 职责 |
| --- | --- |
| [README.md](README.md) | 主规格入口，定义项目目标、机制、视觉方向、版本交付范围。 |
| [harness.md](harness.md) | 定义 Harness Engineering 的执行框架：如何防止只说修好但没有证据。 |
| [acceptance.md](acceptance.md) | 验收标准清单，所有条目必须可验证、可截图、可贴命令输出。 |
| [evidence-template.md](evidence-template.md) | 每次修复、打包、发布前填写的测试证据模板。 |
| [modules/01-runtime-and-config.md](modules/01-runtime-and-config.md) | 启动器、配置、端口、模型路径、内存风险等运行时规格。 |
| [modules/02-chat-thinking.md](modules/02-chat-thinking.md) | 聊天请求、思考模式、系统消息、原始输出、错误处理规格。 |
| [modules/03-attachments-and-input.md](modules/03-attachments-and-input.md) | 图片、文本、PDF、音频等附件入口和输入框交互规格。 |
| [modules/04-terminal-logs.md](modules/04-terminal-logs.md) | 终端日志过滤、展示样式、保留策略和调试可读性规格。 |
| [modules/05-release-and-packaging.md](modules/05-release-and-packaging.md) | 打包、版本号、GitHub Release、发布资产和回滚要求。 |

## 项目目标

1. 让普通用户不用手写 llama-server 命令，也能启动本地 OpenAI 兼容接口。
2. 让配置、模型路径、mmproj、端口、采样参数、模板参数都能在桌面端集中管理。
3. 让聊天调试接近现代 AI 客户端体验，支持思考展示、原始输出、附件预览和历史记录。
4. 让终端日志像正常终端一样可读，而不是被流式 JSON、超长 prompt 和回显刷屏。
5. 让发布流程有可复现证据，避免“本地说修好了，用户下载还是旧版本”。

## 当前机制概览

| 机制 | 说明 |
| --- | --- |
| Electron 主进程 | `desktop/main.mjs` 负责配置、IPC、启动/停止 llama-server、聊天请求、日志处理。 |
| 预加载桥接 | `desktop/preload.cjs` 暴露安全的 `window.llamaDesktop` API。 |
| 渲染层 | `renderer/app.js` 和 `renderer/styles.css` 负责聊天界面、设置弹窗、附件、终端日志、模型信息。 |
| 本地服务 | 桌面端通过配置启动本地 `llama-server.exe`，并使用 OpenAI 兼容接口 `/v1/chat/completions`。 |
| 发布 | `.github/workflows/release.yml` 根据 tag 构建并上传 Windows exe 与 sha256。 |

## 视觉风格

整体方向是克制、桌面工具化、轻量专业，不做营销页和装饰型大卡片。

| 区域 | 风格要求 |
| --- | --- |
| 主聊天区 | 大面积留白，内容居中但不压缩可读宽度；输入框固定在底部附近，但不能遮挡消息阅读。 |
| 侧边栏 | 淡绿色和中性色为主，历史对话紧凑可扫读。 |
| 设置弹窗 | 桌面端设置中心风格，左侧导航、右侧表单，信息密度高但不挤。 |
| 附件预览 | 参考 Warp / ChatGPT 的轻量图片气泡：图片应自然展示，不塞进巨大空白卡片。 |
| 终端日志 | 黑底等宽字体，接近真实 PowerShell/Terminal，不展示无意义的 JSON 噪音。 |
| 错误提示 | 用户可读，避免直接把长堆栈和内部 JSON 塞进聊天气泡。 |

## 版本交付范围

本规格覆盖 `0.6.x` 稳定化阶段，以及下一版继续修复时必须维持的基础框架。

必须交付：

1. 思考模式配置真实生效，尤其是 Qwen 的 `enable_thinking`。
2. 系统消息永远位于模板要求的开头，避免 Jinja `System message must be at the beginning`。
3. 本地错误、超时、取消、系统提示不能进入下一轮模型上下文。
4. 图片和文件附件展示为轻量气泡，不把聊天区挤成大卡片。
5. 终端日志默认过滤流式 JSON、超长 prompt、空闲轮询和重复噪音。
6. 高内存风险配置有明确默认值、提示和可验证边界。
7. 发布包版本号、tag、Release 标题、exe 资产一致。
8. 每次宣称修好必须提供验收证据，不能只口头说明。

## 非目标

当前阶段不承诺：

1. 内置 llama.cpp、模型文件或 mmproj 文件。
2. 视频理解端到端处理。
3. 完整 MCP 生态实现。
4. macOS/Linux 打包。
5. 自动判断所有模型模板的正确参数。

## 开发原则

1. 修 bug 前先明确“用户看到的问题”和“代码里对应的机制”。
2. UI 修复必须同时看聊天静态态、生成中态、错误态和窗口缩放态。
3. 所有可配置项都要区分：写入配置、启动参数、请求参数、界面展示。
4. 不把内部调试信息直接暴露给普通用户，除非在终端日志或原始输出折叠区中。
5. 发布前必须跑 [acceptance.md](acceptance.md) 的核心检查，并把证据写进 [evidence-template.md](evidence-template.md) 的副本。
