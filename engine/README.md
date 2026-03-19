# populace-engine

AI town simulation engine inspired by Stanford Generative Agents.

`populace-engine` 把 Populace 项目里的社会模拟核心单独抽出来，方便你在没有 FastAPI、WebSocket 或 PixiJS 前端的情况下，独立构建自己的 Agent 世界、规则实验和离线模拟流程。

它提供最小但完整的世界模型：居民、建筑、路径移动、建筑生命周期、关系边与 tick diff。你可以把它嵌入后端服务，也可以直接当作一个纯 Python 包，在脚本或研究原型里运行。

## 安装

```bash
pip install populace-engine
```

本地开发版安装：

```bash
cd engine
pip install -e .
```

## 快速开始

```python
from engine import GenerativeAgent, Resident, World

world = World()
world.add_agent(
    GenerativeAgent(
        Resident(
            id="r-alice",
            name="Alice",
            personality="外向、健谈、喜欢认识新朋友",
            x=4,
            y=6,
        )
    )
)

for tick in range(3):
    for agent in world.agents:
        agent.act({"action": "move"}, world)
    diff = world.tick()
    print(diff.tick, diff.movements)
```

## 运行示例

仓库内置了一个纯 engine demo：

```bash
cd engine
python examples/demo.py
```

它会创建 3 个 `GenerativeAgent`，运行 10 个 tick，并打印每一轮的 movement diff。

## API 概览

### 核心类型

- `World`：世界状态容器，维护 agents、buildings、grid、relationships 和 tick 循环
- `GenerativeAgent`：默认 Agent 实现，封装 perceive / retrieve / reflect / plan / act / memorize 生命周期
- `Resident`：居民数据模型（位置、心情、目标、当前建筑）
- `Building`：建筑数据模型（类型、容量、入口位置）
- `TickState`：每个 tick 产生的 diff（movements、dialogues、relationships、events）

### 常用入口

- `world.add_agent(agent)`：把 Agent 加入世界
- `world.add_building(building)`：注册建筑
- `agent.act(plan, world)`：执行移动/停留等行为
- `world.tick()`：推进一轮模拟并生成 `TickState`
- `world.get_social_candidates(agent)`：查询当前可社交对象

### 建筑生命周期支持

- 走到建筑入口时可自动进入建筑
- 建筑容量可控，`park` 视为无限容量
- 室内居民不再出现在地图 movement diff 中
- `home` 会恢复心情，`cafe` 会提升社交概率
