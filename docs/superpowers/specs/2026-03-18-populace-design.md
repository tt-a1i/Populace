# Populace — AI 小镇模拟引擎设计文档

> "Create a pixel town, watch AI residents live their drama."
> 创造一个像素小镇，围观 AI 居民的悲欢离合。

## 1. 项目概述

**Populace（众生）** 是一个开源的 AI 小镇模拟引擎。用户可以创建一个像素风虚拟小镇，在其中放入具有独立性格、记忆和目标的 AI 居民，然后观察他们自主社交、恋爱、争吵、合作。用户以"上帝视角"干预世界——投放事件、修改人设、建造建筑——并通过实时关系图谱观察社交网络的动态演化。

### 核心定位

- **V1（当前）**：娱乐向 — "AI 版模拟人生"，面向所有人
- **V2（未来）**：工具向 — 开放场景 API，面向研究者/产品经理
- **V3（未来）**：哲学向 — AI 伦理探讨、社会实验报告

### MVP 范围（V1）

- 1 个预设场景（现代小区）+ 自定义描述生成
- 8-12 个 AI 居民
- 上帝模式干预
- 可变速播放（暂停/1x/2x/5x）
- 关系图谱实时联动
- 小镇日报（一键生成 + 分享）

### 学术与技术支撑

- **理论基础**：Stanford Generative Agents 论文（"Generative Agents: Interactive Simulacra of Human Behavior", 2023）— 该论文首次证明 LLM 驱动的 Agent 可以在虚拟小镇中展现可信的人类行为，是 Populace 行为引擎的直接学术来源
- **引擎策略**：自研社会模拟引擎（`engine/` 模块），不依赖第三方框架（如 OASIS），保证完全独立可控
- **引擎独立性**：引擎设计为可独立使用的模块，V2 计划抽取为独立 Python 包（`populace-engine`），实现一个项目两份曝光
- **与 MiroFish 的差异**：MiroFish 调用 CAMEL-AI/OASIS 引擎（第三方），Populace 自研引擎 + 引用更知名的 Stanford 研究

---

## 2. 技术栈

| 层 | 技术 | 用途 |
|---|------|------|
| 前端框架 | React 19 + TypeScript + Vite | SPA 框架 |
| 像素渲染 | PixiJS 8 | 小镇地图、角色动画、特效 |
| 图谱可视化 | D3.js | 力导向关系图谱 |
| UI 样式 | Tailwind CSS | 界面样式 |
| 状态管理 | Zustand | 轻量状态管理，适配命令式渲染 |
| 后端 | Python FastAPI | 异步 API + WebSocket |
| 图数据库 | Neo4j | 关系图谱存储与查询 |
| 缓存 | Redis | 实时状态缓存 + pub/sub |
| LLM | OpenAI 兼容 SDK | 居民行为决策 |
| 部署 | Docker Compose | 一键启动 |

---

## 3. 架构总览

```
┌─ 浏览器 ──────────────────────────────────┐
│  React 19 + TypeScript                     │
│  ┌─────────────┐  ┌──────────────────┐    │
│  │ PixiJS 8    │  │ D3.js 力导向图    │    │
│  │ 像素小镇地图 │  │ 关系图谱面板      │    │
│  └──────┬──────┘  └────────┬─────────┘    │
│         └────── WebSocket ─┘              │
└───────────────────┬───────────────────────┘
                    │
┌───────────────────┴───────────────────────┐
│  FastAPI 后端                              │
│  ├── Agent 模拟引擎（async 事件循环）       │
│  ├── WebSocket 实时推送                    │
│  ├── REST API（干预操作、场景管理）         │
│  └── LLM 调度器（OpenAI 兼容）            │
│           │              │                 │
│     ┌─────┴────┐   ┌────┴─────┐           │
│     │  Neo4j   │   │  Redis   │           │
│     │ 关系图谱  │   │ 实时状态  │           │
│     └──────────┘   └──────────┘           │
└────────────────────────────────────────────┘
```

---

## 4. 模块设计

### 4.1 AI 居民行为引擎

每个 AI 居民是一个 Agent，每个时间步执行以下决策循环：

1. **感知（Perceive）** — 查询：我在哪？周围有谁？刚发生了什么？
2. **回忆（Retrieve）** — 从记忆中检索相关经历（Neo4j 查询）
3. **反思（Reflect）** — 定期总结经历，形成高层认知（"我好像喜欢上了小明"）
4. **规划（Plan）** — LLM 生成接下来的行动计划
5. **行动（Act）** — 执行：移动、对话、交互
6. **记忆（Memorize）** — 将本轮经历存入记忆流（Neo4j）

**记忆系统：**

| 类型 | 存储 | 说明 |
|------|------|------|
| 短期记忆 | Redis | 最近 N 个事件，快速访问 |
| 长期记忆 | Neo4j | 所有经历，带时间戳和重要度评分 |
| 关系记忆 | Neo4j 边 | 和其他角色的好感度、信任度、熟悉度 |
| 反思记忆 | Neo4j | LLM 定期生成的高层认知总结 |

**设计依据：** 借鉴 Stanford Generative Agents 论文的"感知-回忆-反思-规划-行动"循环，用 Neo4j 图数据库替代平面记忆流。V1 的 8-12 个 Agent 规模下 Neo4j 的性能优势不大（内存查询即可），但选择 Neo4j 是面向 V2/V3 的前瞻设计——当 Agent 数量扩展到 50+ 时，多跳关系查询（如"朋友的敌人"）在图数据库中天然高效。

**Token 成本控制：**
- 日常行为（走路、吃饭、回家）用规则引擎，不调 LLM（约 80% tick）
- 仅在"决策点"调 LLM：遇人交谈、事件反应、定期反思（约 20% tick）
- 每个 Agent 每次 LLM 调用：输入 ≤ 800 token，输出 ≤ 200 token
- 每个 Agent 独立调用（不做批量合并，避免解析歧义）
- 每 tick 最多 3 个 Agent 并发调 LLM，其余排入下一 tick

---

### 4.2 像素小镇渲染引擎（PixiJS 8）

**地图系统：**

| 层 | 内容 |
|----|------|
| 瓦片层 | 地面、道路、水域、草地 |
| 建筑层 | 咖啡馆、住宅、公园、商店、学校 |
| 角色层 | AI 居民精灵，带行走动画 |
| 特效层 | 天气、昼夜循环、事件动画 |
| UI 层 | 对话气泡、角色名字、状态图标 |

**角色渲染：**
- 每个 AI 居民是 32x32 像素精灵
- 4 方向行走动画（上下左右各 3-4 帧）
- 头顶状态指示：对话气泡、心形、怒气、思考
- 靠近时自动触发交互动画（面对面 + 对话气泡）

**镜头控制：**
- 默认鸟瞰全镇
- 鼠标滚轮缩放，拖拽平移
- 双击角色 → 镜头跟随 + 右侧图谱高亮关系网

**昼夜系统：**
- 模拟时间从早到晚，色调变化（暖黄→白→暗蓝）
- 居民有作息规律，增强"活的世界"感觉

**美术资源策略：**
- V1 使用开源像素素材包（Kenney 等）
- 角色外观程序化生成：基础身体 + 随机发型/颜色/服装

---

### 4.3 关系图谱面板（D3.js）

**节点（= 居民）：**
- 头像：像素精灵缩略图
- 光环颜色：反映当前情绪（开心=黄、伤心=蓝、愤怒=红）
- 大小：社交活跃度（社牛大、社恐小）

**边（= 关系）：**
- 颜色：恋爱=粉、友谊=绿、敌对=红、认识=灰
- 粗细：关系强度（好感度越高越粗）
- 标签：悬停显示关系描述

**交互联动：**
- 点地图角色 → 图谱节点放大 + 脉冲动画 + 相关边高亮
- 点图谱节点 → 地图镜头定位到该角色
- 悬停关系线 → 弹出关系详情卡片
- 时间轴回放 → 图谱动画演示关系演化过程

**关系变化动效：**
- 新关系建立：飞线连接动画
- 关系升温：边从细变粗，颜色渐变
- 关系破裂：闪烁 → 碎裂粒子 → 消失
- 三角关系：自动高亮三角形结构

---

### 4.4 上帝模式交互系统

**四大干预能力：**

**1. 事件投放（⚡）**
- 点击地图位置，弹出事件选择器
- 预设事件：来了个陌生人、暴风雨、丢钱包、匿名情书、免费蛋糕
- 自定义事件：用户输入描述，LLM 解析并注入模拟

**2. 人设修改（👤）**
- 点击角色弹出属性面板
- 可调属性：性格特征（外向/内向、善良/自私）、兴趣、秘密、目标
- 滑块式交互，修改立即生效

**3. 环境建造（🏗️）**
- 拖拽放置新建筑
- 删除现有建筑
- 改变天气/季节

**4. 小镇日报（📋）**
- 一键生成当前周期的"报纸"
- LLM 撰写：标题新闻、八卦专栏、关系变动、天气预报
- 配图：关键时刻截图 + 关系图谱快照
- 输出：精美 HTML 卡片，一键复制/下载为图片
- **核心传播功能** — 用户截图发社交媒体

**操作反馈：**
- 干预后画面出现"涟漪"特效
- 底部消息栏滚动显示事件影响

**工具栏布局：**

```
┌──────────────────────────────────────┐
│  ⚡事件投放  👤人设  🏗️建造  📋日报     │
│  ⏸️暂停  ▶️播放  ⏩x2  ⏩x5            │
└──────────────────────────────────────┘
```

---

### 4.5 数据架构

**Neo4j 图模型：**

```
节点类型：
  (Resident)     — name, personality, goals, mood, location
  (Building)     — type, name, capacity, position
  (Memory)       — content, timestamp, importance, emotion
  (Event)        — description, timestamp, source(user/system)
  (Reflection)   — summary, timestamp, derived_from[]

关系类型：
  (Resident)-[:KNOWS {since, familiarity}]->(Resident)
  (Resident)-[:FEELS {type, intensity, reason}]->(Resident)
      type: love | friendship | rivalry | fear | trust | dislike
  (Resident)-[:LIVES_IN]->(Building)
  (Resident)-[:REMEMBERS]->(Memory)
  (Resident)-[:WITNESSED]->(Event)
  (Resident)-[:REFLECTED]->(Reflection)
  (Memory)-[:INVOLVES]->(Resident)
  (Memory)-[:HAPPENED_AT]->(Building)
```

**WebSocket 消息格式：**

```json
{
  "tick": 42,
  "time": "Day 3, 14:30",
  "movements": [{"id": "r1", "x": 120, "y": 85, "action": "walking"}],
  "dialogues": [{"from": "r1", "to": "r3", "text": "今天天气不错"}],
  "relationships": [{"from": "r1", "to": "r3", "type": "friendship", "delta": 5}],
  "events": [{"desc": "小明和小红在咖啡馆偶遇"}]
}
```

---

### 4.6 项目目录结构（后端）

```
engine/                            # 独立社会模拟引擎（可单独使用）
├── __init__.py
├── agent.py                       # Generative Agent 核心类
├── perceive.py                    # 感知模块
├── memory.py                      # 记忆系统（短期/长期/关系/反思）
├── reflect.py                     # 反思生成（LLM）
├── plan.py                        # 行动规划（LLM）
├── act.py                         # 行为执行
├── social.py                      # 社交交互协议
├── world.py                       # 世界状态管理
└── types.py                       # 引擎类型定义

backend/
├── main.py                        # FastAPI 入口 + WebSocket
├── core/
│   ├── simulation.py              # 模拟主循环（调用 engine）
│   ├── clock.py                   # 时间系统（暂停/变速控制）
│   └── config.py                  # 全局配置
├── world/
│   ├── town.py                    # 小镇状态管理
│   ├── buildings.py               # 建筑逻辑
│   ├── events.py                  # 事件系统
│   └── templates/                 # 预设场景模板 JSON
├── api/
│   ├── simulation.py              # REST: 创建/控制模拟
│   ├── residents.py               # REST: 查询/修改居民
│   ├── world.py                   # REST: 环境干预
│   ├── report.py                  # REST: 生成小镇日报
│   └── ws.py                      # WebSocket: 实时状态推送
├── llm/
│   ├── client.py                  # OpenAI 兼容 LLM 客户端
│   ├── prompts.py                 # Prompt 模板管理
│   └── token_budget.py            # Token 预算控制
└── db/
    ├── neo4j.py                   # Neo4j 连接与查询
    └── redis.py                   # Redis 状态缓存
```

### 4.7 前端目录结构

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── package.json
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # 主布局（双面板 + 工具栏）
│   ├── components/
│   │   ├── town/                   # 像素小镇（PixiJS）
│   │   │   ├── TownCanvas.tsx
│   │   │   ├── TownRenderer.ts
│   │   │   ├── ResidentSprite.ts
│   │   │   ├── BuildingSprite.ts
│   │   │   └── effects/
│   │   ├── graph/                  # 关系图谱（D3）
│   │   │   ├── GraphPanel.tsx
│   │   │   ├── GraphRenderer.ts
│   │   │   └── RelationCard.tsx
│   │   ├── toolbar/                # 上帝模式工具栏
│   │   │   ├── Toolbar.tsx
│   │   │   ├── EventInjector.tsx
│   │   │   ├── PersonaEditor.tsx
│   │   │   ├── BuildingPlacer.tsx
│   │   │   └── SpeedControl.tsx
│   │   ├── report/                 # 小镇日报
│   │   │   ├── DailyReport.tsx
│   │   │   └── ReportShare.tsx
│   │   └── ui/                     # 通用 UI
│   │       ├── MessageBar.tsx
│   │       ├── ResidentPanel.tsx
│   │       └── ScenePicker.tsx
│   ├── stores/
│   │   ├── simulation.ts           # Zustand
│   │   ├── residents.ts
│   │   └── relationships.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useTownSync.ts
│   │   └── useGraphSync.ts
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── index.ts
```

**数据流：**

```
WebSocket 消息 → Zustand Store 更新
    ├── useTownSync → PixiJS 命令式更新（角色位置/动画）
    └── useGraphSync → D3 命令式更新（节点/边/动效）
```

---

## 5. 界面布局

```
┌─────────────────────────────────────────────────┐
│  🏘️ Populace          [场景名]    ⏸ ▶ ⏩x2 ⏩x5  │
├────────────────────────┬────────────────────────┤
│                        │                        │
│    PixiJS 像素小镇      │    D3 关系图谱          │
│    （60%，可缩放拖拽）   │    （40%，力导向交互）   │
│                        │                        │
├────────────────────────┴────────────────────────┤
│  ⚡事件投放  👤人设  🏗️建造  📋日报  │ 消息滚动栏   │
└─────────────────────────────────────────────────┘
```

面板分割比例 60:40，用户可拖拽调整。

---

## 6. 部署方案

```yaml
# docker-compose.yml
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [neo4j, redis]
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - REDIS_URL=redis://redis:6379
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_MODEL_NAME=${LLM_MODEL_NAME}

  neo4j:
    image: neo4j:5.26
    ports: ["7474:7474", "7687:7687"]
    volumes: [neo4j_data:/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  neo4j_data:
```

`docker compose up` 一键启动全部服务。

---

## 7. 传播策略（内置于产品）

**小镇日报** 是核心传播功能：
- LLM 自动生成图文并茂的"报纸"
- 精美 HTML 卡片，一键下载为图片
- 内容自带故事性 — 用户截图发社交媒体即是传播

**README 首屏**：
- 一段 15 秒 GIF：像素小镇 + 关系图谱联动
- 一句 slogan："Create a pixel town, watch AI residents live their drama."
- 一行启动命令：`docker compose up`

---

## 8. 模拟循环与 Tick 模型

### Tick 定义

- 1 tick = 模拟中的 30 分钟（小镇时间）
- 1x 速度：每 3 秒推进 1 tick（现实 3 秒 = 小镇 30 分钟）
- 2x 速度：每 1.5 秒推进 1 tick
- 5x 速度：每 0.6 秒推进 1 tick
- 暂停：不推进，用户可自由查看状态和干预
- 一天（小镇时间）= 48 tick

### Tick 执行流程

```
每个 tick：
  1. 冻结世界状态快照（snapshot）
  2. 所有 Agent 基于同一快照并行执行"感知"
  3. 规则引擎 Agent 同步决策；LLM Agent 异步发起请求（不阻塞 tick）
  4. 提交本 tick 所有已就绪的行动结果，更新世界状态
  5. 通过 WebSocket 推送 diff 给前端
  6. 等待下一 tick 计时器触发
```

**LLM 调用与 tick 的关系（关键）：** tick 推进不阻塞 LLM 调用。LLM 请求在后台异步执行，结果在返回后的下一个 tick 中应用。这意味着：在高速模式（5x）下，LLM 密集型行为（对话、反思）可能延迟 1-2 个 tick 才体现，但前端始终流畅不卡顿。如果连续 3 个 tick 无 LLM 响应返回，该 Agent 自动切换为规则模式直到 LLM 恢复。

### Agent 执行策略

- 并非每个 Agent 每个 tick 都调 LLM
- **规则驱动行为**（不调 LLM）：走路、吃饭、睡觉、日常通勤 — 约占 80% tick
- **LLM 驱动行为**（调 LLM）：遇人对话、事件反应、定期反思 — 约占 20% tick
- 每个 tick 最多 3 个 Agent 并发调 LLM（防止 API 限流）
- 其余 Agent 排入下一 tick 队列

---

## 9. LLM 故障与延迟策略

### 延迟应对

- LLM 调用设置 5 秒超时
- 超时后回退到**规则引擎默认行为**（随机闲逛、待在原地、做默认活动）
- 前端不等待 LLM 响应 — 后端先推送角色的"行走中"动画，LLM 结果返回后再追加对话/行为更新

### 故障回退

| 故障类型 | 回退策略 |
|---------|---------|
| API 超时 | 角色执行默认行为，下一 tick 重试 |
| API 报错（500/503） | 指数退避重试（最多 3 次），失败后标记该 Agent 为"休息中" |
| Token 预算耗尽 | 所有 Agent 切换为纯规则模式，UI 提示"AI 居民进入自动模式" |
| API Key 无效 | 阻止模拟启动，前端显示配置错误提示 |

### Token 预算模型

- 每个 Agent 每次 LLM 调用：输入 ≤ 800 token，输出 ≤ 200 token
- 不使用批量合并（避免歧义），每个 Agent 独立调用
- 每个模拟日（48 tick）预估消耗：10 个 Agent × 20% LLM tick × 48 tick × 1000 token ≈ 96K token/天
- 可通过配置降低 LLM 调用频率以降低成本

---

## 10. 空间与寻路系统

### 地图模型

- 瓦片网格（Tile Grid）：每个瓦片 32x32 像素
- 预设场景地图尺寸：40x30 瓦片（1280x960 像素）
- 每个瓦片标记：可行走 / 不可行走 / 建筑入口 / 建筑内部

### 寻路算法

- 使用 **A* 算法** 在瓦片网格上计算路径
- 路径缓存：同一 tick 内相同起终点复用路径
- 每个 Agent 每 tick 移动 1-2 个瓦片（取决于距离和速度）

### 空间交互触发

- **对话触发**：两个 Agent 位于相邻瓦片（曼哈顿距离 ≤ 2）时，概率触发交互
- **建筑内交互**：同一建筑内的 Agent 视为"在同一空间"，交互概率更高
- **事件传播**：用户投放的事件有影响半径（如暴风雨=全图，丢钱包=5 瓦片范围）

### 建筑逻辑

- 建筑有类型和容量上限（咖啡馆最多 4 人、公园无上限）
- Agent 进入建筑后从地图上消失，状态显示为"在 XX 中"
- 不同建筑影响 Agent 行为倾向（咖啡馆=社交场所、家=休息恢复）

---

## 11. 对话协议

### 对话触发

- 两个 Agent 在交互范围内且都处于空闲状态时，按概率触发对话
- 概率基于：关系亲密度（高=更常聊）+ 性格外向度 + 随机因素
- 每个 tick 最多发生 2 组对话（控制 LLM 调用量）

### 对话流程

```
1. Agent A 发起对话（LLM 生成开场白，限 50 token）
2. Agent B 回应（LLM 生成回复，限 50 token）
3. 最多 3 轮来回（共 6 条消息）
4. 对话结束 → 双方更新记忆 → 更新关系值
```

### 对话结果

- 每次对话后，LLM 评估对话效果：好感度变化（-10 到 +10）
- 重要对话（好感度变化 ≥ 5）自动写入长期记忆
- 对话内容显示在地图上的对话气泡 + 底部消息栏

### 群体对话

- V1 不支持 3 人以上群聊
- 同一地点多人时，随机选 2 人配对对话，其余 Agent 等待

---

## 12. 持久化与会话模型

### V1 会话模型

- **单用户、单会话**模式
- 模拟状态通过 Neo4j 持久化（关系、记忆、反思）
- 小镇地图状态和 Agent 位置通过 Redis 缓存，定期快照到 Neo4j
- 服务重启后从 Neo4j 恢复，Agent 位置重置到各自住所（home building）作为安全默认值
- 关系和记忆数据每 tick 实时写入 Neo4j（数据量小，10 Agent 无性能问题）
- Agent 位置等轻量状态通过 Redis 缓存，每 10 tick 快照到 Neo4j 作为备份

### 安全模型

- V1 为**本地单用户部署**，无需用户认证
- Docker Compose 中 Neo4j/Redis 仅绑定 127.0.0.1（不暴露公网）
- LLM API Key 通过 .env 文件配置，不硬编码

---

## 13. 前后端状态同步

### 连接建立

- 前端连接 WebSocket 时，后端发送完整状态快照（全量同步）
- 此后每个 tick 发送增量 diff

### 断线重连

- WebSocket 断开后前端自动重连（指数退避，最大间隔 10 秒）
- 重连成功后请求完整快照重新同步
- 重连期间前端显示"连接中..."遮罩，冻结画面

### 干预同步

- 上帝模式操作通过 REST API 发送
- 后端收到干预后在下一个 tick 生效
- 通过 WebSocket 广播干预结果，前端统一在 tick 更新中渲染

---

## 14. 事件系统详细设计

### 事件类型

| 类型 | 持续时间 | 影响范围 | 示例 |
|------|---------|---------|------|
| 即时事件 | 1 tick | 指定位置 | 丢钱包、匿名情书 |
| 持续事件 | N tick（可配置）| 全图或区域 | 暴风雨（10 tick）、停电（5 tick）|
| 角色事件 | 即时 | 指定角色 | 来了个陌生人（生成新 Agent）|

### 自定义事件安全

- 用户输入的自定义事件文本经 LLM 解析为结构化事件
- LLM 解析时附加约束 prompt："保持事件合理，不允许毁灭性事件"
- 解析失败时回退到"什么也没发生"

### 事件队列

- 同一 tick 多个事件按优先级排序：用户事件 > 系统事件 > 随机事件
- 每个 tick 最多处理 3 个事件（防止过载）

---

## 15. 测试策略

### 确定性模式

- 提供 `--seed` 参数，固定随机种子 + Mock LLM 响应
- 用于回归测试和 demo 录制

### 测试层级

| 层级 | 对象 | 方法 |
|------|------|------|
| 单元测试 | engine/ 核心逻辑 | pytest，Mock LLM |
| 集成测试 | API 端点 | pytest + httpx，内存数据库 |
| E2E 测试 | 完整模拟流程 | 确定性模式运行 N tick，验证状态一致性 |

---

## 16. 配置模型

所有可调参数集中在 `backend/core/config.py`：

```python
# 模拟参数
TICK_INTERVAL_SECONDS = 3.0      # 1x 速度下每 tick 间隔
TICK_PER_DAY = 48                # 每天 tick 数
MAX_CONCURRENT_LLM_CALLS = 3    # 每 tick 最大 LLM 并发
LLM_TIMEOUT_SECONDS = 5.0       # LLM 调用超时
LLM_CALL_PROBABILITY = 0.2      # Agent 每 tick 调 LLM 概率

# 记忆参数
SHORT_TERM_MEMORY_SIZE = 20     # 短期记忆容量
REFLECTION_THRESHOLD = 10       # 累计 N 条记忆后触发反思
RELATIONSHIP_DECAY_RATE = 0.01  # 关系自然衰减率/tick

# 空间参数
MAP_WIDTH_TILES = 40
MAP_HEIGHT_TILES = 30
TILE_SIZE_PX = 32
INTERACTION_DISTANCE = 2        # 交互触发距离（瓦片）
MAX_DIALOGUES_PER_TICK = 2

# 快照
SNAPSHOT_INTERVAL_TICKS = 10    # 自动保存间隔
```
