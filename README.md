<div align="center">
  <img src="assets/llama-cpp.png" width="88" alt="Llama.cpp Desktop logo" />

  <h1>Llama.cpp Desktop</h1>

  <p>
    一个给 Windows 本地 llama.cpp 准备的桌面端控制面板。
    <br />
    启动服务、配置模型、查看日志、直接聊天和接入 OpenAI Compatible 客户端，都放在一个窗口里。
  </p>

  <p>
    <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-506f51?style=flat-square" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-41-506f51?style=flat-square" />
    <img alt="llama.cpp" src="https://img.shields.io/badge/llama.cpp-local-506f51?style=flat-square" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-151713?style=flat-square" />
  </p>
</div>

![Llama.cpp Desktop preview](docs/desktop-preview.svg)

## 亮点

| 功能 | 说明 |
| --- | --- |
| 本地直连 | 直接启动 llama.cpp 原版目录里的 `llama-server.exe`，不强依赖额外启动器 |
| OpenAI 兼容 | 默认提供 `http://127.0.0.1:8080/v1`，可接入 OpenClaw、Claude Code 等客户端 |
| 桌面聊天 | 内置网页端风格聊天页面，支持流式回复、历史对话、搜索和消息操作 |
| 附件入口 | 支持图片、文本、PDF 等附件入口，图片可在聊天里预览 |
| 模型信息 | 点击模型标签即可查看当前模型、上下文、GPU 层数和运行参数 |
| 终端日志 | 在客户端里查看 llama.cpp 输出，方便排查启动和推理问题 |
| 托盘后台 | 关闭窗口后隐藏到系统托盘，服务继续后台运行 |
| 参数配置 | 支持模型路径、上下文、采样、GPU 层数、线程和批处理参数 |

## 下载

首次发布包会放在 GitHub Releases 页面：

[打开 Releases](https://github.com/Qiao-920/llama-cpp-desktop/releases)

下载 `Llama.cpp-Desktop.exe` 后双击运行即可。项目本身不包含模型文件和 llama.cpp 二进制文件，需要你本机已经有可用的 llama.cpp Windows 构建目录。

## 快速开始

1. 下载并打开 `Llama.cpp-Desktop.exe`。
2. 在设置里选择 llama.cpp 原文件目录，或直接选择 `llama-server.exe`。
3. 选择你的 GGUF 模型文件。
4. 保存配置并启动服务。
5. 使用内置聊天，或把 `http://127.0.0.1:8080/v1` 接入 OpenAI 兼容客户端。

## 开发运行

```powershell
npm install
npm start
```

## 打包

```powershell
npm run dist
```

打包产物会生成在 `dist/`，该目录不会提交到 Git。

## 当前限制 / Roadmap

- 当前主要面向 Windows 10 / 11。Ubuntu、macOS 等跨平台版本需要继续适配路径、进程管理、托盘和打包配置。
- 项目不内置 llama.cpp、模型文件、显卡驱动或 CUDA / Vulkan 运行库，需要用户本机已有可用环境。
- 图片入口可以预览并发送图片，但真正理解图片需要视觉模型和对应的 `mmproj` 多模态投影文件。
- 普通文本模型不能因为上传了图片就自动具备看图能力；视频理解当前暂未支持。
- ngram、多 GPU、speculative decoding 等高级能力可以先通过“自定义附加参数”传给本机 `llama-server`，具体是否生效取决于本地 llama.cpp 版本。
- 如果桌面端速度和原生命令行差异明显，请先复制“最终启动命令”，对比 GPU layers、上下文、batch、ubatch、threads 等参数。
- Qwen 等 thinking 模型是否输出 `<think>` 内容取决于模型、模板和 `chat_template_kwargs`；桌面端会解析并折叠展示返回中的 `<think>...</think>`。

## 项目结构

```text
assets/      图标和托盘图标
desktop/     Electron 主进程和预加载脚本
renderer/    桌面端界面
scripts/     图标生成脚本
```

## 开源说明

本仓库只包含桌面端源码，不包含：

- llama.cpp 二进制文件
- GGUF / GGML 模型文件
- 打包生成的 exe
- 本地配置文件和运行日志

## License

MIT
