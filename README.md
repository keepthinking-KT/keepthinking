# KeepThinking — AI 记忆引擎

KeepThinking 是一个开源的本地 AI 记忆引擎。它帮你记录 AI 对话中的关键决策、Bug 修复、架构变更，然后在新会话中自动注入这些记忆——让 AI 不再每次对话都「失忆」。

## 功能

- **跨会话记忆**：每次对话结束后提取关键信息，新会话自动注入历史上下文
- **语义搜索**：本地 ONNX 向量引擎，支持 50+ 语言，理解语义而非仅匹配关键词
- **认知图谱**：将决策构建成知识网络，按关联度和时效性排序
- **Bug 诊断辅助**：识别 6 种常见 Bug 模式，基于历史记忆提供参考建议
- **Git 集成**：自动读取 commit 历史，AI 可以了解代码库演变过程
- **MCP 协议**：7 个标准 MCP 工具，配置后接入 Claude Desktop、Cursor、VS Code 等工具
- **Web 控制台**：浏览器可视化认知图谱、搜索历史记忆、查看项目统计
- **环境自检**：定期巡检磁盘和内存，低资源时告警

## 安装

```bash
wget https://keepthinking.vip/install.sh && bash install.sh
```

安装过程包含 10 个步骤：系统检测 → Node.js 检查 → 下载 → 解压 → 引擎复制 → 依赖安装 → 语义模型下载（74MB）→ 自动启动。

安装完成后访问 `http://你的服务器IP:3456`，设置密码后即可使用。

> ⚠️ 云服务器用户请在安全组中放行 TCP 3456 端口。

## 系统要求

- **操作系统**：Linux（推荐 Ubuntu 20.04+、CentOS 7+）
- **运行时**：Node.js ≥ 18
- **磁盘**：至少 500MB 可用空间（含 74MB 语义模型）
- **内存**：至少 1GB 可用

## 数据存储

- 所有数据存于 `~/.keepthinking/memory/`，在你自己的硬盘上
- 安装后运行时不上传数据（首次安装需联网下载 ONNX 语义模型 74MB）
- 不采集用户数据，不连接第三方服务器

## 开源协议

MIT License — 自由使用、修改、分发，按现状提供，不提供担保。

## 联系方式

- 💬 微信：Lucky_Good_Man
- 🌐 [keepthinking.vip](https://keepthinking.vip)
- 💻 [GitHub](https://github.com/keepthinking-KT/keepthinking)
