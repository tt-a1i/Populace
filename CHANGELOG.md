# Changelog

All notable changes to Populace are recorded here.

---

## [Unreleased]

### Added
- Frontend polish: particle animation on welcome page, scene card emoji mini-map previews
- Skeleton loading screen matching real UI layout
- Dark / light theme toggle with `localStorage` persistence
- Keyboard shortcuts: `Space` pause/resume, `1–5` speed, `Escape` close panel

---

## Phase 9 — Relationship Milestone Events

### Added
- Relationship threshold triggers: friendship ≥ 0.8 → 成为挚友, love ≥ 0.9 → 告白, rivalry ≥ 0.8 → 公开争吵
- Generated Chinese dialogue text for each milestone type
- Mood effects on both parties and nearby residents (emotion contagion)
- `_rel_events_fired` set on `SimulationState` to prevent repeated milestone fires
- Frontend graph edge flash animation (gold pulse, 3 s) on milestone events
- `flashingEventKeys` in relationships store; `GraphRenderer.flashLinks()` public API
- Toast notification + audio cue on milestone trigger
- 10 backend tests for threshold logic, mood effects, and one-fire guarantee

---

## Phase 8 — Achievement System

### Added
- 5 achievements: 破冰者, 社交达人, 小富翁, 风雨无阻, 探险家
- Per-tick achievement checker; `GET /api/residents/{id}/achievements` endpoint
- Frontend achievement tab in resident detail panel
- Toast notification + ascending arpeggio sound on unlock
- `_achievements_store` initialisation guard for test environments

---

## Phase 7 — Occupation & Gossip Systems

### Added
- Occupation system: work-hour building entry assigns roles (咖啡师, 教师, 店主…) with income
- Economy system: resident gold, building revenue/expense, resident-to-resident transfers
- `GET /api/simulation/economy-stats` endpoint
- Gossip propagation module: residents share third-party info on encounter, adjusting relationship intensity
- Relationship heatmap visualisation in toolbar

---

## Phase 6 — Resident Diary, Mood Contagion & God Mode

### Added
- Daily diary generation at end of each simulation day; viewable in resident detail panel
- Mood contagion: residents in same building influence each other's emotion
- God Mode operations: patch resident attributes, inject memory, teleport resident
- Right-click context menu on map tiles for teleport
- `PATCH /api/residents/{id}/attributes`, `POST /api/residents/{id}/inject-memory`, `POST /api/residents/{id}/teleport`
- Mood history line chart and network analysis panel in stats dashboard

---

## Phase 5 — Docker, Speed Control, Graph Filter & Resident Wizard

### Added
- Docker Compose full-stack setup (frontend, backend, Neo4j, Redis)
- Simulation speed control: 1×/2×/5×/10×/50×; `POST /api/simulation/speed`
- D3 graph filter by relationship type and strength
- Relationship history timeline slider / playback
- ResidentCreationWizard UI for spawning new residents at runtime
- Building construction and demolition tools
- Data export (residents + relationships as JSON)

---

## Phase 4 — WebSocket Reliability & Mobile Adaptation

### Added
- WebSocket exponential-backoff reconnect (1 s→30 s, max 10 retries) with countdown display
- Mobile layout: tab-switching between map and graph; floating toolbar button
- Multi-language support (中文 / English); right-corner language switcher
- First-run onboarding guide overlay
- Save system: named multi-save, load, delete; `POST/GET /api/saves`

---

## Phase 3 — Reports, Stats & Simulation Dashboard

### Added
- Town daily report: AI-generated narrative summary; `POST /api/report/generate`
- Experiment report: configurable days, network density, emotion distribution; `POST /api/report/experiment`
- Stats panel: emotion history chart, network analysis (influence / in-degree / out-degree)
- `GET /api/simulation/mood-history` and `GET /api/simulation/network-analysis` endpoints
- Simulation stats overview: `GET /api/simulation/stats`

---

## Phase 2 — Extended World Systems

### Added
- Second scene: 海边渔村 (6 residents); scene picker with emoji mini-map preview
- A\* pathfinding replacing straight-line movement
- Weather system: ☀️ / ⛅ / 🌧 / ⛈ / ❄️; stormy weather forces residents home and worsens mood
- `POST /api/world/weather` endpoint
- Relationship dynamics: familiarity decay on inactivity; milestone events (initial version)
- Building lifecycle: construction / demolition in running simulation
- Daily schedule system: schedule-driven routing throughout the day
- Agent goal system: `current_goal` field; thought bubbles on sprite
- Neo4j persistence: relationship graph snapshot every 10 ticks; restore on startup
- Redis cache: agent positions, tick pub/sub, short-term memory
- CI workflow (GitHub Actions)
- Performance optimisation: spatial index, LLM semaphore, deterministic test mode

---

## Phase 1 — Core Simulation Engine

### Added
- `GenerativeAgent` Perceive → Plan → Act loop driven by LLM
- Memory stream with importance scoring and retrieval; reflection mechanism triggered by threshold
- `World` class: tick engine, spatial index, relationship management
- Relationship types: 认识 / 爱情 / 友谊 / 竞争 / 恐惧 / 信任 / 厌恶
- Day / night cycle affecting resident behaviour and scene colour
- FastAPI backend: REST + WebSocket real-time sync
- PixiJS 8 pixel map: zoom, pan, double-click camera follow
- D3 force-directed relationship graph: node and edge co-update
- Split-pane layout: map left, graph right, toolbar bottom
- Welcome page with floating-particle background and staggered fade-in
- Scene picker: 现代小区 (10 residents), AI-generated custom scene
- Loading skeleton screen matching real UI
- Web Audio synthesizer: dialogue / relationship / achievement / event tones
- Toast notification system (top-right, typed variants)
- OpenAI-compatible LLM integration (configurable base URL + key)
- Pytest backend test suite (177 tests); Vitest frontend test suite (99 tests)
- MIT licence

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Added | New feature |
| Changed | Behaviour change in existing feature |
| Fixed | Bug fix |
| Removed | Feature removed |
