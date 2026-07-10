# 测试证据模板

复制本文件到：

```text
spec/evidence/YYYY-MM-DD-topic.md
```

## 基本信息

| 项 | 内容 |
| --- | --- |
| 日期 |  |
| 测试人 |  |
| 分支 |  |
| commit |  |
| 版本号 |  |
| Windows 版本 |  |
| Node 版本 |  |
| llama.cpp 路径 |  |
| 模型文件 |  |
| mmproj 文件 |  |

## 本次目标

1. 
2. 
3. 

## 命令证据

```powershell
git status -sb
```

结果：

```text

```

```powershell
node --check desktop/main.mjs
node --check renderer/app.js
git diff --check
```

结果：

```text

```

```powershell
npm run dist
```

结果：

```text

```

## UI 截图证据

| 场景 | 尺寸 | 截图路径 | 结论 |
| --- | --- | --- | --- |
| 主聊天页 | 1365x768 |  |  |
| 主聊天页 | 1920x1080 |  |  |
| 生成中 | 1365x768 |  |  |
| 附件菜单 | 1365x768 |  |  |
| 图片附件 | 1365x768 |  |  |
| 终端日志 | 1365x768 |  |  |
| 设置页 | 1365x768 |  |  |

## 终端过滤证据

| 过滤项 | 输入或触发方式 | 日志计数/截图 | 结论 |
| --- | --- | --- | --- |
| 流式 JSON chunk | `http: streamed chunk: data:` |  |  |
| Prompt 回显 | 完整 prompt 或 `<|im_start|>` |  |  |
| HTML/CSS/JS 代码回显 | 长代码或 HTML 输出 |  |  |
| 空闲轮询 | `que start_loop: waiting for new tasks` |  |  |

## 请求证据

| 项 | 结论 | 证据 |
| --- | --- | --- |
| `chat_template_kwargs` 是否发送 |  |  |
| CLI 写法是否被规范化 |  |  |
| `messages[0]` 是否为 system |  |  |
| 本地错误是否未进入上下文 |  |  |
| 附件内容是否按类型处理 |  |  |

## 验收清单

| ID | 结果 | 说明 |
| --- | --- | --- |
| A-01 |  |  |
| A-02 |  |  |
| A-03 |  |  |
| A-04 |  |  |
| A-05 |  |  |
| B-01 |  |  |
| B-02 |  |  |
| B-03 |  |  |
| C-01 |  |  |
| C-02 |  |  |
| C-04 |  |  |
| C-06 |  |  |
| D-01 |  |  |
| D-03 |  |  |
| D-04 |  |  |
| E-01 |  |  |
| E-02 |  |  |
| E-03 |  |  |
| E-05 |  |  |
| F-01 |  |  |
| F-03 |  |  |
| F-04 |  |  |

## 未通过项

| ID | 复现步骤 | 实际结果 | 预期结果 | 下一步 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 最终结论

本次是否可以标记为通过：

- [ ] 可以
- [ ] 不可以

原因：
