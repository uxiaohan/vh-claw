<div align="center">
  <h1>🦞 VH-Claw</h1>
  <p>便携式 OpenClaw 管理工具 — 无需配置，开箱即用</p>
</div>

## 项目简介

VH-Claw 是一个基于 Electrobun 构建的 OpenClaw 便携式管理工具。它允许你将 OpenClaw 环境放在 U 盘中，在任何电脑上插拔即用，无需安装 Node.js 或其他依赖。

### 核心特性

- 🚀 **零配置启动**：首次运行自动下载所需运行时
- 💾 **便携式设计**：所有数据存储在同一目录，可放在 U 盘使用
- 🔧 **完整管理界面**：图形化配置 OpenClaw 和模型
- 📱 **跨平台支持**：Windows / macOS / Linux 全平台
- ⚡ **国内网络优化**：内置 GitHub 镜像和国内 npm 源
- 🎯 **内置中文技能**：预置 10+ 中文 AI 技能

## 目录结构

```
VH-Claw/
├── Windows启动.bat          (Windows 启动文件)
├── VH-Claw-canary.app       (macOS 启动文件)
├── bin/
│   └── data/
│       ├── openclaw/    (OpenClaw 安装目录)
│       └── logs/        (运行日志)
├── config/
│   └── .openclaw/       (OpenClaw 配置，跨平台共享)
└── (可选: runtime/     存放各平台运行时)
```

## 快速开始

## 截图

![控制面板](https://wp-cdn.4ce.cn/v2/daFAsWg.png)
![模型配置](https://wp-cdn.4ce.cn/v2/k4CRq2p.png)



### 下载安装

1. 从 [Releases](https://github.com/vvhan/vh-claw/releases) 下载对应平台的最新版本
2. 解压到任意目录（推荐 U 盘根目录）
3. 运行启动文件：
   - Windows: `Windows启动.bat`
   - macOS: `VH-Claw-canary.app`
   - Linux: `vh-claw`

### 首次使用

1. **初始化环境**
   - 启动 VH-Claw
   - 首次使用需点击「初始化环境」按钮
   - 等待自动下载和安装（约 30 秒到 1 分钟）

2. **配置模型**
   - 切换到「模型配置」页面
   - 选择你的 AI 服务商（DeepSeek、智谱、通义千问等）
   - 填入 API Key 和模型名称
   - 点击「保存」

3. **启动服务**
   - 返回「控制台」
   - 点击「启动」按钮
   - 等待服务启动（约 10-30 秒）
   - 点击「打开 Web 界面」开始使用

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| [Electrobun](https://blackboard.sh/electrobun/docs/) | 1.16.0 | 跨平台桌面应用框架 |
| [Bun](https://bun.com/) | 1.3.11 | JavaScript 运行时 |
| [Vue 3](https://vuejs.org/) | 3.5.13 | 前端框架 |
| [Vite](https://vitejs.dev/) | 6.0.3 | 构建工具 |
| [OpenClaw](https://github.com/sliverp/openclaw) | latest | AI Agent 框架 |

## 开发指南

### 环境要求

- Bun 1.3.11+
- Git

### 本地开发

```bash
# 克隆项目
git clone https://github.com/vvhan/vh-claw.git
cd vh-claw

# 安装依赖
bun install

# 开发模式（带热重载）
bun run dev:hmr

# 或普通开发模式
bun run dev
```

### 构建

```bash
# 构建所有平台
bun run build:all

# 单独构建
bun run build:win    # Windows
bun run build:mac    # macOS
bun run build:linux  # Linux
```

## 预置中文技能

项目内置以下中文 AI 技能：

- 🔍 **中国搜索** - 中文搜索引擎
- 🌤️ **中国天气** - 天气预报
- 📝 **知乎写作** - 知乎风格文案
- 🍠 **小红书作家** - 小红书文案生成
- 🎵 **抖音脚本** - 短视频脚本
- 📰 **微信文章** - 公众号文章
- 🤖 **DeepSeek 助手** - DeepSeek 专用技能
- 📺 **B站助手** - 哔哩哔哩相关功能

## 国内网络优化

为确保国内用户流畅使用，项目做了以下优化：

1. **GitHub 下载加速**：使用 `https://cdn.gh-proxy.org/` 镜像
2. **NPM 镜像**：默认使用华为云镜像源
3. **国内 API 优先**：预置国内主流 AI 服务商配置

## 配置说明

### 支持的模型服务商

| 服务商 | 说明 | 配置类型 |
|--------|------|----------|
| DeepSeek | 深度求索 | OpenAI 兼容 |
| MiniMax | 智谱 AI | OpenAI 兼容 |
| Kimi | 月之暗面 | OpenAI 兼容 |
| 通义千问 | 阿里云 | OpenAI 兼容 |
| 豆包 | 字节跳动 | OpenAI 兼容 |
| 硅基流动 | SiliconFlow | OpenAI 兼容 |
| 智谱 GLM | 智谱 AI | 内置 Provider |
| OpenAI | OpenAI | OpenAI 兼容 |
| Claude | Anthropic | OpenAI 兼容 |
| Groq | Groq | OpenAI 兼容 |
| 自定义 | 任意 OpenAI 兼容接口 | 自定义 |

### 配置文件位置

配置文件保存在 `config/.openclaw/openclaw.json`，跨平台共享。

## 常见问题

### Q: 支持哪些 OpenClaw 功能？

A: 支持所有 OpenClaw 核心功能，包括：
- Agent 对话
- 技能调用
- 多渠道接入
- Workspace 管理

## 许可证

[MIT License](LICENSE)

## 致谢

- [OpenClaw](https://github.com/openclaw/openclaw) - 强大的 AI Agent 框架
- [Electrobun](https://github.com/blackboardsh/electrobun) - 优秀的跨平台桌面框架
- [Bun](https://github.com/oven-sh/bun) - 超快的 JavaScript 运行时

---

<div align="center">
  <p>Made with ❤️ by Han</p>
</div>
