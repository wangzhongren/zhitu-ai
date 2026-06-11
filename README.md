<p align="center">
  <img src="build/icon.png" width="128" alt="明心" />
</p>

# 明心 · AI 知识图谱学习助手

通过 AI 对话帮你梳理技术知识，自动生成结构化知识图谱（思维导图），把零散的学习变成清晰的脉络。

> 两个独立 Agent 协作 —— 一个负责对话引导，一个专门维护知识图谱。

## 预览

![聊天页面](assert/home.png)

![设置页面](assert/setting.png)

## 为什么做

学新技术时的痛点：看了很多文章脑子还是一团浆糊，和 AI 聊完就忘，知识没有沉淀。

明心把「对话学习」和「知识图谱」绑在一起 —— 左边聊，右边自动长出结构化图谱。学完一个话题，图就是你的笔记。

## 功能

- **AI 引导式学习**：先解答再追问，每次只问一个问题，逐步深入
- **知识图谱自动生成**：思维导图树形展开，概念层级一目了然
- **双 Agent 架构**：对话 Agent + 图谱编辑 Agent 分离，各司其职
- **增量更新**：追加、修改、删除节点，不整图重建
- **react-markdown 渲染**：代码块、标题、列表、引用、表格
- **节点选中讨论**：点击图谱节点可将其加入对话上下文
- **自动标题**：首次对话自动生成话题标题
- **历史记录**：所有学习话题独立保存，断点续聊
- **导出 HTML**：完整导出知识图谱为独立 HTML 文件
- **空状态引导**：提供示例话题建议，快速开始学习
- **桌面应用**：Electron 打包，双击即用
- **VS Code 风格暗色主题**：现代简约的深色界面设计
- **支持 OpenAI 兼容 API**：OpenAI / DeepSeek 等

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Tailwind CSS + Zustand |
| 图渲染 | SVG 树形布局 |
| 后端 | Node.js + Express + SSE 流式传输 |
| 数据库 | SQLite (better-sqlite3) |
| 桌面端 | Electron |
| AI | OpenAI SDK（兼容 DeepSeek 等） |
| UI 组件 | 自定义轻量组件 (lucide-react 图标) |

## 快速开始

### 前提

- Node.js 18+
- OpenAI 兼容的 API Key

### 1. 安装

```bash
git clone https://github.com/wangzhongren/mingxin-ai.git
cd mingxin-ai
npm install
```

### 2. 配置

编辑项目根目录的 `.env` 文件或在 UI 设置面板中配置：

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

**注意**：`OPENAI_BASE_URL` 需要包含 `/v1` 路径（如使用 OpenAI 官方 API）。

### 3. 启动

**浏览器模式：**
```bash
# 终端 1：启动后端
npm run server

# 终端 2：启动前端
npm run dev
```
打开 `http://localhost:5173`

**桌面应用（推荐）：**
```bash
npm run electron:dev
```

**生产构建：**
```bash
npm run build
npm run electron:build
```

## 项目结构

```
mingxin-ai/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.cjs             # Electron 入口
│   │   ├── launch.cjs           # 开发模式启动器
│   │   ├── window-manager.cjs   # 窗口管理
│   │   ├── ipc-handlers.cjs     # IPC 通信
│   │   ├── menu.cjs             # 原生菜单
│   │   └── preload.cjs          # 预加载脚本
│   ├── server/                  # Express 后端
│   │   ├── index.cjs            # 服务器入口
│   │   ├── routes.cjs           # API 路由
│   │   ├── database.cjs         # SQLite 数据库
│   │   └── socratic-agent.cjs   # 双 Agent 逻辑
│   └── renderer/                # React 前端
│       ├── components/
│       │   ├── ChatPanel.tsx    # 对话面板 + SSE
│       │   ├── MindCanvas.tsx   # SVG 图谱渲染
│       │   ├── Sidebar.tsx      # 侧边栏 + 会话列表
│       │   ├── SettingsPanel.tsx # 设置弹窗
│       │   ├── TitleBar.tsx     # 标题栏
│       │   └── ui/              # 自定义 UI 组件
│       ├── store/
│       │   └── scriptoriumStore.ts  # Zustand 状态管理
│       ├── lib/
│       │   └── utils.ts         # 工具函数
│       ├── index.css            # 全局样式 + 主题变量
│       └── api.ts               # API 客户端
├── .env                         # 环境变量配置
├── package.json
└── README.md
```

## 架构

```
用户输入 → Express API → Agent 1 对话助手（流式）→ 用户看到回复
                                     → Agent 2 图谱编辑器 → 知识图谱更新
                                     → 标题生成（首次消息）
```

## 开发

```bash
# 开发模式（Vite + Electron）
npm run electron:dev

# 仅启动前端开发服务器
npm run dev

# 仅启动后端服务器
npm run server

# 类型检查
npm run build
```

## 主题配置

项目使用 CSS 变量实现主题系统，可在 `src/renderer/index.css` 中自定义：

```css
:root {
  --background: 240 21% 15%;    /* 主背景色 */
  --foreground: 226 60% 88%;    /* 文字颜色 */
  --primary: 234 55% 60%;       /* 强调色 */
  --sidebar: 240 21% 12%;       /* 侧边栏背景 */
  /* ... 更多变量 */
}
```

## 常见问题

**Q: API 调用返回 404 错误？**  
A: 检查 `OPENAI_BASE_URL` 是否正确，OpenAI 官方 API 需要包含 `/v1` 路径。

**Q: 对话时没有流式输出？**  
A: 确保 API 支持流式响应（大多数 OpenAI 兼容 API 都支持）。

**Q: 知识图谱没有更新？**  
A: Agent 2 在后台异步运行，可能需要等待几秒钟。检查控制台是否有错误日志。

## License

Apache License 2.0

