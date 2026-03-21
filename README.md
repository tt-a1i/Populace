# Populace

[![CI](https://github.com/tt-a1i/Populace/actions/workflows/ci.yml/badge.svg)](https://github.com/tt-a1i/Populace/actions/workflows/ci.yml)

> Create a pixel town, watch AI residents live their drama.
>
> 创造一个像素小镇，围观 AI 居民的悲欢离合。

```bash
docker compose up
```

Populace 是一个开源的 AI 小镇模拟项目：左侧是一座可缩放、可拖拽、带昼夜变化的像素小镇，右侧是一张实时演化的关系图谱。你既可以像观众一样旁观居民恋爱、争吵、合作，也可以像"上帝模式"操作者一样投放事件、编辑人设、改变世界走向。

这个项目的核心吸引力不只是"AI 会动"，而是"AI 会生活"。每个居民都有性格、目标、记忆和关系网络；后端模拟循环负责推进世界状态，前端则用 PixiJS 和 D3 把这些变化实时渲染成一个可观察、可干预、可分享的戏剧舞台。

---

## 项目截图

> 主界面：左侧像素小镇 · 右侧关系图谱 · 底部工具栏

![Populace 主界面](docs/screenshot-main.png)

*（截图描述：左侧 PixiJS 像素地图展示居民实时移动与对话气泡，右侧 D3 力导向图谱呈现关系强度与类型，底部工具栏包含事件注入、速度控制、统计分析等面板。详见 `/tmp/populace-ui-final.png`）*

---

## 完整功能清单

### 世界与模拟引擎

| 功能 | 说明 |
|------|------|
| 多场景 | 现代小区（10人）、海边渔村（6人）、AI 生成自定义场景 |
| Tick 系统 | 可调节模拟速度（1×/2×/5×/10×/50×），支持暂停 |
| 昼夜系统 | 日出→白天→傍晚→深夜，影响居民行为与场景色调 |
| 天气系统 | 晴/多云/雨/暴风雨/雪，暴风雨影响居民行动与情绪 |
| 情绪传染 | 同一建筑内居民情绪相互影响 |
| 职业系统 | 工作时段进入建筑分配职业（咖啡师/教师/店主/…），有对应收入 |
| 经济系统 | 居民金币、建筑消费/收入、居民间金币转账、经济统计 |

### 居民 AI

| 功能 | 说明 |
|------|------|
| 自主行为 | Perceive → Plan → Act 循环，基于性格、目标、记忆决策 |
| 记忆流 | 短期记忆（可配置容量）+ 重要度评分，支持检索 |
| 反思机制 | 达到阈值后自动从记忆中提炼长期观点 |
| 日记系统 | 每日结束自动生成日记条目，可在居民详情面板查看 |
| 八卦传播 | 居民交谈时随机分享第三方信息，影响关系强度 |

### 社交与关系

| 功能 | 说明 |
|------|------|
| 关系类型 | 认识 / 爱情 / 友谊 / 竞争 / 恐惧 / 信任 / 厌恶 |
| 实时变化 | 每次对话后增减关系强度，图谱即时更新 |
| 关系衰减 | 长期无互动自然降低 familiarity 与 intensity |
| 里程碑事件 | friendship≥0.8 → 成为挚友；love≥0.9 → 告白；rivalry≥0.8 → 公开争吵；触发特殊对话 + 情绪扩散 + 图谱闪烁 |

### 成就系统

| 成就 | 触发条件 |
|------|----------|
| 💬 破冰者 | 第一次与其他居民交谈 |
| 🤝 社交达人 | 与 ≥5 名居民建立关系 |
| 💰 小富翁 | 积累 ≥500 金币 |
| ⛈️ 风雨无阻 | 在暴风雨天气中生存 |
| 🗺️ 探险家 | 探索所有建筑物 |

成就解锁时触发 Toast 通知 + 上行琶音音效（C5→E5→G5→C6）。

### 上帝模式（God Mode）

| 操作 | 入口 |
|------|------|
| 投放自定义事件 | 工具栏 → 事件注入 |
| 预设事件（市集/暴风雨/明星等） | 工具栏 → 事件注入 → 预设 |
| 编辑居民属性（姓名/性格/情绪/目标） | 工具栏 → 人设编辑 / 居民详情 |
| 注入记忆 | 居民详情 → 记忆 Tab → 注入 |
| 传送居民 | 右键地图 → 传送 / 居民详情 → 传送 |
| 建造 / 拆除建筑 | 工具栏 → 建造 |

### 可视化

| 功能 | 说明 |
|------|------|
| 像素地图 | PixiJS 8，鼠标滚轮缩放，拖拽平移，双击角色镜头跟随 |
| 关系图谱 | D3 力导向图，按类型/强度过滤，历史回放时间轴 |
| 三角关系 | 自动识别并高亮三方互知关系 |
| 关系事件动画 | 里程碑事件触发时图谱边金色闪烁（2 s 脉冲） |
| 热力图 | 建筑访问频次可视化（工具栏 → 热力图） |

### 报告与分析

| 报告 | 说明 |
|------|------|
| 小镇日报 | AI 生成当日叙事报告，包含戏剧性事件摘要 |
| 实验报告 | 可配置天数，包含网络密度变化、情绪分布、社交热点 |
| 统计面板 | 情绪历史折线图、网络分析（影响力/入度/出度）、关系总量 |

### 前端体验

| 功能 | 说明 |
|------|------|
| 欢迎页动画 | 12 个浮动粒子背景 + 分阶段 fade-in |
| 场景选择 | 每个场景卡片内嵌 emoji mini-map 预览 |
| 骨架屏 | 首次加载时显示与真实 UI 同构的灰色占位块 |
| 主题切换 | 右上角 ☀️/🌙 按钮，localStorage 持久化 |
| 音效系统 | 对话/关系变化/成就/事件各有音色，可静音 |
| WebSocket 重连 | 指数退避重连（1s→30s），最多 10 次，倒计时显示 |
| 移动端适配 | Tab 切换地图/图谱，底部悬浮工具按钮 |
| 多语言 | 中文 / English，右上角切换 |
| 新手引导 | 首次进入显示功能提示 |

### 持久化与部署

| 功能 | 说明 |
|------|------|
| 存档系统 | 工具栏 → 存档，支持多存档命名、读取、删除 |
| 数据导出 | 导出居民数据、关系数据为 JSON |
| Neo4j | 关系图谱持久化，每 10 tick 快照 |
| Redis | 实时状态缓存 |
| Docker Compose | 一键启动全栈（前端/后端/Neo4j/Redis） |

---

## 键盘快捷键

| 按键 | 功能 |
|------|------|
| `Space` | 暂停 / 恢复模拟 |
| `1` | 速度 1× |
| `2` | 速度 2× |
| `3` | 速度 5× |
| `4` | 速度 10× |
| `5` | 速度 50× |
| `Escape` | 关闭居民详情面板 |

> 在输入框或文本区域聚焦时快捷键自动禁用。

---

## 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React 19 + TypeScript + Vite | SPA 外壳、界面路由、开发构建 |
| 像素渲染 | PixiJS 8 | 小镇地图、角色动画、昼夜与交互镜头 |
| 图谱可视化 | D3.js | 力导向关系图谱、节点与边联动 |
| UI / 状态 | Tailwind CSS + Zustand | 样式系统、全局前端状态管理 |
| 后端 | Python 3.11 + FastAPI + WebSocket | REST API、实时同步、模拟控制 |
| 数据库 | Neo4j + Redis | 关系图谱持久化、实时状态缓存 |
| AI | OpenAI-compatible SDK | Agent 决策、对话与报告生成 |
| 测试 | Pytest + Vitest + Testing Library | 后端单元/集成 + 前端组件测试 |
| 部署 | Docker Compose | 一键启动前后端与基础设施 |

---

## 快速启动

### 前提

- Docker / Docker Compose
- 可用的 LLM API Key（兼容 OpenAI 接口）

### Docker（推荐）

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 填写 API Key（至少需要）
# 编辑 .env，设置：
#   LLM_API_KEY=your_api_key_here

# 3. 一键启动
docker compose up

# 4. 打开浏览器
open http://localhost:3000
```

### 本地开发

确保本地已有 Neo4j 和 Redis，或通过 Docker 单独启动基础设施：

```bash
docker compose up neo4j redis
```

**后端：**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**前端：**

```bash
cd frontend
npm install
npm run dev
```

默认开发地址：

| 服务 | 地址 |
|------|------|
| 前端（Vite） | `http://localhost:5173` |
| 后端（FastAPI） | `http://localhost:8000` |
| API 文档（Swagger） | `http://localhost:8000/docs` |
| Neo4j 控制台 | `http://localhost:7474` |

**运行测试：**

```bash
# 后端测试（177 tests）
python3 -m pytest tests/ -v

# 前端测试（99 tests）
cd frontend && npx vitest run
```

---

## API 文档

后端通过 FastAPI 自动生成 OpenAPI 文档，启动后访问：

- **Swagger UI**：`http://localhost:8000/docs`
- **ReDoc**：`http://localhost:8000/redoc`

主要端点分组：

| 前缀 | 说明 |
|------|------|
| `POST /api/simulation/start` | 启动模拟 |
| `POST /api/simulation/stop` | 暂停模拟 |
| `POST /api/simulation/speed` | 设置速度 |
| `GET  /api/simulation/stats` | 统计概要 |
| `GET  /api/simulation/economy-stats` | 经济统计 |
| `GET  /api/simulation/mood-history` | 情绪历史 |
| `GET  /api/simulation/network-analysis` | 网络分析 |
| `GET  /api/residents` | 全部居民列表 |
| `PATCH /api/residents/{id}/attributes` | 修改居民属性 |
| `POST /api/residents/{id}/inject-memory` | 注入记忆 |
| `POST /api/residents/{id}/teleport` | 传送居民 |
| `GET  /api/residents/{id}/achievements` | 成就列表 |
| `GET  /api/world/buildings` | 建筑列表 |
| `POST /api/world/events` | 注入世界事件 |
| `POST /api/world/generate-scenario` | AI 生成场景 |
| `POST /api/report/generate` | 生成日报 |
| `POST /api/report/experiment` | 生成实验报告 |
| `POST /api/saves` | 存档 |
| `GET  /api/saves` | 存档列表 |
| `WS   /ws` | WebSocket 实时同步 |

---

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
        ach["Achievement / Event checker"]
    end

    neo["Neo4j"]
    redis["Redis"]
    model["OpenAI-compatible LLM"]

    browser --> frontend
    frontend -->|"WebSocket / REST"| api
    api --> loop
    api --> llm
    api --> ach
    loop --> neo
    loop --> redis
    llm --> model
```

---

## 项目目录结构

```text
Populace/
├── backend/
│   ├── api/              # FastAPI 路由（simulation、residents、world、report、saves）
│   └── main.py           # 应用入口，WebSocket 端点
├── engine/
│   ├── world.py          # World 类，tick 驱动、空间索引、关系管理
│   ├── generative_agent.py # GenerativeAgent，perceive/plan/act 循环
│   ├── types.py          # 核心数据类型（Resident、Building、TickState 等）
│   ├── gossip.py         # 八卦传播模块
│   ├── relationship_events.py # 关系里程碑事件
│   └── memory_stream.py  # 记忆流与检索
├── frontend/
│   ├── src/components/   # 地图、图谱、工具栏、UI 组件
│   ├── src/stores/       # Zustand 状态管理（simulation、relationships、theme）
│   ├── src/hooks/        # useWebSocket、useKeyboardShortcuts 等
│   ├── src/audio/        # Web Audio API 音效合成器
│   └── src/__tests__/    # Vitest 组件与 hook 测试
├── tests/                # Pytest 后端测试（177 tests）
├── docs/                 # 设计文档、规格说明
├── docker-compose.yml    # 一键启动全栈
└── .env.example          # 环境变量模板
```

---

## 演示说明

1. 选择场景（现代小区 / 海边渔村 / 自定义 AI 生成）
2. 等待骨架屏消失，首帧快照到达后进入主界面
3. **地图操作**：鼠标滚轮缩放，拖拽平移，双击角色进入镜头跟随并联动图谱高亮
4. **图谱操作**：按关系类型/强度过滤，拖拽时间轴回放历史
5. **干预世界**：底部工具栏注入事件、改变天气、编辑居民
6. **右键菜单**：右键地图格子可传送居民或查看格子信息
7. 如果后端未启动，前端会给出友好提示而不是空白页

---

## License

MIT
