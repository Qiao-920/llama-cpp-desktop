# 模块规格：发布与打包

## 模块目标

确保用户下载到的版本、GitHub Release 页面、package 版本、tag 和 exe 资产一致，避免“代码修了但发布页还是旧版本”。

## 发布流程

```text
确认本地验收通过
  -> 更新 package.json version
  -> 更新 README/发布说明
  -> commit
  -> tag vX.Y.Z
  -> push main 和 tag
  -> GitHub Actions 构建
  -> Release 上传 exe 和 sha256
  -> 打开 Release 验证
```

## 版本一致性

| 位置 | 要求 |
| --- | --- |
| `package.json` | `version` 与 tag 一致。 |
| Git tag | 格式为 `vX.Y.Z`。 |
| Release 标题 | 必须包含同一版本号。 |
| exe 文件 | Release 资产必须存在。 |
| sha256 文件 | Release 资产必须存在，内容对应 exe。 |

## 禁止提交

1. `node_modules/`
2. `dist/`
3. `dist-*`
4. GGUF 模型文件。
5. mmproj 文件。
6. 本地截图缓存和临时文件。

## 发布说明要求

每个 Release 至少写清楚：

1. 本次修了什么。
2. 影响用户的使用方式变化。
3. 已知仍未完成的能力。
4. 下载哪个资产。
5. 如有必要，说明配置迁移注意事项。

## 验收重点

必须通过 [acceptance.md](../acceptance.md) 的 F 组。
