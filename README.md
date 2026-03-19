# Populace

> Create a pixel town, watch AI residents live their drama.
>
> 创造一个像素小镇，围观 AI 居民的悲欢离合。

```bash
docker compose up
```

Populace 是一个开源的 AI 小镇模拟项目：左侧是一座可缩放、可拖拽、带昼夜变化的像素小镇，右侧是一张实时演化的关系图谱。你既可以像观众一样旁观居民恋爱、争吵、合作，也可以像“上帝模式”操作者一样投放事件、编辑人设、改变世界走向。

这个项目的核心吸引力不只是“AI 会动”，而是“AI 会生活”。每个居民都有性格、目标、记忆和关系网络；后端模拟循环负责推进世界状态，前端则用 PixiJS 和 D3 把这些变化实时渲染成一个可观察、可干预、可分享的戏剧舞台。

在产品层面，Populace 把“传播性”内置进体验：地图上的即时对话、图谱中的关系升温或破裂、以及可生成分享的小镇日报，都会自然沉淀成适合截图、录屏和演示的瞬间。它既可以是一个好玩的 AI 玩具，也可以是一个展示多 Agent 社会模拟能力的项目样板。

## 技术栈

| 层级 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React 19 + TypeScript + Vite | SPA 外壳、界面路由、开发构建 |
| 像素渲染 | PixiJS 8 | 小镇地图、角色、昼夜与交互镜头 |
| 图谱可视化 | D3.js | 力导向关系图谱、节点与边联动 |
| UI / 状态 | Tailwind CSS + Zustand | 样式系统、前端状态管理 |
| 后端 | FastAPI + WebSocket | REST API、实时同步、模拟控制 |
| 数据库 | Neo4j + Redis | 关系图谱持久化、实时状态缓存 |
| AI | OpenAI-compatible SDK | Agent 决策、对话与日报生成 |
| 部署 | Docker Compose | 一键启动前后端与基础设施 |

## 功能特性

- 🧠 AI 自主社交：居民基于性格、目标与记忆推进自己的生活
- 🕸️ 实时关系图谱：关系强弱、情绪和互动在图谱中动态演化
- ⚡ 上帝模式干预：投放事件、修改人设、改变世界走向
- 📰 小镇日报：自动汇总戏剧时刻，便于演示与分享
- 🌗 昼夜系统：模拟时间流逝，场景色调与氛围跟随变化

## 快速启动

### 前提

- 已安装 Docker / Docker Compose
- 已准备可用的 LLM API Key

### 步骤

1. 复制环境变量模板并填写 API Key

   ```bash
   cp .env.example .env
   ```

   然后编辑 `.env`，至少填写：

   ```env
   LLM_API_KEY=your_api_key_here
   ```

2. 启动所有服务

   ```bash
   docker compose up
   ```

3. 打开浏览器访问前端

   ```text
   http://localhost:3000
   ```

## 本地开发指南

如果你不想直接跑整套 Docker，也可以分别启动前后端。开始前请确保本地或容器中已有可用的 Neo4j、Redis，以及正确配置的 `.env`。

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

默认开发地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8000`

## 架构图

```mermaid
flowchart TB
    browser["Browser"]

    subgraph frontend["Frontend / React 19 + Vite"]
        town["PixiJS 8 town view"]
        graph["D3 relationship graph"]
        ui["Toolbar / reports / onboarding"]
    end

    subgraph backend["FastAPI backend"]
        api["REST API + WebSocket"]
        loop["Simulation loop"]
        llm["LLM scheduler"]
    end

    neo["Neo4j"]
    redis["Redis"]
    model["OpenAI-compatible LLM"]

    browser --> frontend
    frontend -->|"WebSocket / REST"| api
    api --> loop
    api --> llm
    loop --> neo
    loop --> redis
    llm --> model
```

## 项目目录结构

```text
Populace/
├── backend/              # FastAPI 后端、API、LLM 客户端、实时同步
├── engine/               # 社会模拟引擎核心（Agent、World、记忆、社交）
├── frontend/             # React + PixiJS + D3 前端
│   ├── src/components/   # 地图、图谱、工具栏、UI 组件
│   ├── src/stores/       # Zustand 状态管理
│   ├── src/hooks/        # WebSocket 等前端 hooks
│   └── src/types/        # 共享 TypeScript 类型
├── docs/                 # 设计文档、规格说明、规划资料
├── scripts/              # 辅助脚本
├── docker-compose.yml    # 一键启动前后端与基础设施
└── .env.example          # 环境变量模板
```

## 演示说明

- 首次进入先选择场景，随后会看到“正在生成小镇...”的过渡层
- 首帧快照到达后进入主界面：左侧地图、右侧图谱、底部工具栏与消息流
- 鼠标滚轮缩放地图，拖拽平移，双击角色进入镜头跟随并联动图谱高亮
- 如果后端未启动，前端会给出“请运行 docker compose up”的友好提示，而不是留下一块空白页

## License

MIT
