# Narrative Layer + Resident Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simulation's rich internal state visible to users through dialogue bubbles, mood icons, weather visuals, relationship milestone effects, and a story-driven resident panel.

**Architecture:** Five parallel tracks (1a–1e) that modify the PixiJS rendering layer (`TownRenderer`, `ResidentSprite`), add a backend gossip field to `DialogueUpdate`, add weather particle effects, enhance relationship milestone toasts, and rebuild the resident sidebar into a narrative panel. Each track produces independently testable output.

**Tech Stack:** PixiJS 8 (Graphics, Container, Text, ColorMatrixFilter), React 19, Zustand, FastAPI, pytest, vitest

---

## File Map

### Backend (engine + API)
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `engine/types.py` | Add `kind` field to `DialogueUpdate`, add `GossipUpdate` to `TickState` |
| Modify | `engine/social.py` | Populate `kind='dialogue'` on dialogue updates |
| Modify | `backend/api/simulation.py` | Surface gossip data in tick output, add `kind` to dialogue serialization |
| Modify | `engine/gossip.py` | Return gossip metadata so `_tick()` can include it |
| Test | `tests/test_engine/test_social.py` | Test `kind` field on DialogueUpdate |
| Test | `tests/test_engine/test_gossip_surfacing.py` | Test gossip appears in TickState |

### Frontend — Types & Store
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/types/index.ts` | Add `kind` to `DialogueUpdate`, add `GossipUpdate` type |
| Modify | `frontend/src/stores/simulation.ts` | Store gossip updates, pass dialogue kind to residents |

### Frontend — Rendering (1a: Dialogue Bubbles)
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/components/town/ResidentSprite.ts` | Enhance `showDialogue()` to accept kind, style bubble by kind |

### Frontend — Rendering (1b: Mood & Status Icons)
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/components/town/ResidentSprite.ts` | Add mood emoji above sprite, occupation badge, energy bar |

### Frontend — Rendering (1c: Weather Visuals)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/town/effects/WeatherFilter.ts` | Color matrix filters per weather type |
| Modify | `frontend/src/components/town/TownRenderer.ts` | Apply weather filter to world container |

### Frontend — Rendering (1d: Relationship Milestone Effects)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/town/effects/MilestoneEffect.ts` | Particle line between two residents on milestone |
| Modify | `frontend/src/components/town/TownRenderer.ts` | Trigger milestone effect from tick data |
| Modify | `frontend/src/components/town/TownCanvas.tsx` | Add CustomEvent listener to bridge WebSocket → renderer |
| Modify | `frontend/src/hooks/useWebSocket.ts` | Enhanced toast for relationship events |

### Frontend — UI (1e: Resident Story Panel)
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/town/ResidentStoryPanel.tsx` | New narrative sidebar replacing tab-based panel |
| Modify | `frontend/src/components/town/TownChrome.tsx` | Swap old sidebar for ResidentStoryPanel |
| Modify | `frontend/src/i18n/zh.json` | Add `resident_panel.*` keys |
| Modify | `frontend/src/i18n/en.json` | Add `resident_panel.*` keys |

---

## Task 1: Add `kind` field to DialogueUpdate (Backend)

**Files:**
- Modify: `engine/types.py:157-160` (DialogueUpdate dataclass)
- Modify: `backend/api/simulation.py:821-826` (where DialogueUpdate is constructed — the ONLY place it's built)
- Test: `tests/test_engine/test_dialogue_kind.py`

Note: `DialogueUpdate` is NOT constructed in `engine/social.py`. That module returns `DialogueResult`. The actual construction is in `backend/api/simulation.py` inside the dialogue harvesting loop.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_engine/test_dialogue_kind.py
"""Test that DialogueUpdate carries a 'kind' field."""
from engine.types import DialogueUpdate


def test_dialogue_update_has_kind_field():
    d = DialogueUpdate(from_id="a", to_id="b", text="hello", kind="dialogue")
    assert d.kind == "dialogue"


def test_dialogue_update_kind_defaults_to_dialogue():
    d = DialogueUpdate(from_id="a", to_id="b", text="hello")
    assert d.kind == "dialogue"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_engine/test_dialogue_kind.py -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'kind'`

- [ ] **Step 3: Add `kind` field to DialogueUpdate**

In `engine/types.py`, modify the `DialogueUpdate` dataclass:
```python
@dataclass
class DialogueUpdate:
    from_id: str
    to_id: str
    text: str
    kind: str = "dialogue"  # 'dialogue' | 'gossip' | 'monologue'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_engine/test_dialogue_kind.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add engine/types.py tests/test_engine/test_dialogue_kind.py
git commit -m "feat: add kind field to DialogueUpdate for bubble styling"
```

---

## Task 2: Surface gossip in TickState (Backend)

Currently gossip happens silently in `engine/social.py:initiate_dialogue()`. We need to:
1. Collect gossip events from `initiate_dialogue`
2. Add a `gossips` field to TickState
3. Include gossip in tick output so the frontend can render gossip bubbles

**Files:**
- Modify: `engine/types.py` (add GossipUpdate dataclass + field on TickState)
- Modify: `engine/social.py:426-429` (return gossip metadata from initiate_dialogue)
- Modify: `backend/api/simulation.py` (collect gossip from dialogue results, add to tick)
- Test: `tests/test_engine/test_gossip_surfacing.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_engine/test_gossip_surfacing.py
"""Test that GossipUpdate exists in TickState."""
from engine.types import GossipUpdate, TickState


def test_gossip_update_dataclass():
    g = GossipUpdate(
        speaker_id="a",
        listener_id="b",
        target_id="c",
        target_name="Carol",
        content="Carol is great",
        is_positive=True,
    )
    assert g.speaker_id == "a"
    assert g.is_positive is True


def test_tick_state_has_gossips_field():
    ts = TickState(tick=1, time="Day 1, 08:00")
    assert hasattr(ts, "gossips")
    assert ts.gossips == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/test_engine/test_gossip_surfacing.py -v`
Expected: FAIL with `ImportError: cannot import name 'GossipUpdate'`

- [ ] **Step 3: Add GossipUpdate dataclass and gossips field to TickState**

In `engine/types.py`, add after `RelationshipEvent`:
```python
@dataclass
class GossipUpdate:
    """A gossip event surfaced to the frontend for bubble rendering."""
    speaker_id: str
    listener_id: str
    target_id: str
    target_name: str
    content: str
    is_positive: bool
```

In `TickState`, add field:
```python
gossips: List["GossipUpdate"] = field(default_factory=list)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/test_engine/test_gossip_surfacing.py -v`
Expected: PASS

- [ ] **Step 5: Modify initiate_dialogue to return gossip data**

In `engine/social.py`, change the gossip section (around line 426) so `initiate_dialogue` returns gossip info in `DialogueResult`. Add a `gossip` field to `DialogueResult`:

```python
@dataclass
class DialogueResult:
    messages: list[dict] = field(default_factory=list)
    relationship_delta: int = 0
    is_important: bool = False
    gossip: dict | None = None  # gossip dict from generate_gossip, or None
```

Then at line ~428, store the gossip:
```python
gossip = generate_gossip(agent_a, world)
if gossip is not None:
    spread_gossip(agent_b, gossip, world)

return DialogueResult(
    messages=messages,
    relationship_delta=delta,
    is_important=is_important,
    gossip=gossip,
)
```

- [ ] **Step 6: Collect gossip in _tick() and add to tick_state**

In `backend/api/simulation.py`, where dialogue results are harvested (around line 819), collect gossip:

```python
gossip_updates: list = []
# ... inside the dialogue result harvesting loop:
if result.gossip is not None:
    from engine.types import GossipUpdate
    gossip_updates.append(GossipUpdate(
        speaker_id=a_id,
        listener_id=b_id,
        target_id=result.gossip["target_id"],
        target_name=result.gossip["target_name"],
        content=result.gossip["content"],
        is_positive=result.gossip["is_positive"],
    ))
```

Then add `gossips=gossip_updates` to the TickState construction.

- [ ] **Step 7: Run full test suite**

Run: `python3 -m pytest tests/ -x -q`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add engine/types.py engine/social.py backend/api/simulation.py tests/test_engine/test_gossip_surfacing.py
git commit -m "feat: surface gossip events in TickState for frontend rendering"
```

---

## Task 3: Frontend types + store updates

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/stores/simulation.ts`

- [ ] **Step 1: Add `kind` to DialogueUpdate and GossipUpdate type**

In `frontend/src/types/index.ts`:
```typescript
export interface DialogueUpdate {
  from_id: string
  to_id: string
  text: string
  kind?: 'dialogue' | 'gossip' | 'monologue'
}

export interface GossipUpdate {
  speaker_id: string
  listener_id: string
  target_id: string
  target_name: string
  content: string
  is_positive: boolean
}

// Add to TickState:
export interface TickState {
  // ... existing fields ...
  gossips?: GossipUpdate[]
}
```

- [ ] **Step 2: Change dialogueByResident from Map<string, string> to Map<string, {text, kind}>**

In `frontend/src/stores/simulation.ts`, the `dialogueByResident` map (line 249) currently stores raw strings. Change it to store objects:

```typescript
// Line 249: change type
const dialogueByResident = new Map<string, { text: string; kind: string }>()

// Lines 253-257: update dialogue processing loop
for (const dialogue of tickState.dialogues ?? []) {
  if (!dialogueByResident.has(dialogue.to_id)) {
    dialogueByResident.set(dialogue.to_id, { text: '\u{1F4AC}', kind: 'dialogue' })
  }
  dialogueByResident.set(dialogue.from_id, { text: dialogue.text, kind: dialogue.kind ?? 'dialogue' })
  // ... freshMessages push stays the same
}
```

Then update the TWO places that read from this map:

```typescript
// Line 270: where dialogueText is set during movement processing
const dialogueEntry = dialogueByResident.get(movement.id)
// ... and in the residentMap.set() call:
dialogueText: dialogueEntry?.text ?? movement.dialogueText ?? null,
dialogueKind: dialogueEntry?.kind ?? 'dialogue',
```

Add `dialogueKind` to the `ResidentPosition` interface (around line 25):
```typescript
dialogueKind?: 'dialogue' | 'gossip' | 'monologue'
```

- [ ] **Step 3: Store gossip updates for rendering**

In the store's `updateFromTick`, after the dialogue loop, add gossip processing:
```typescript
// After the dialogue loop, before movements:
for (const g of tickState.gossips ?? []) {
  dialogueByResident.set(g.listener_id, { text: g.content, kind: 'gossip' })
  const speakerName = residentMap.get(g.speaker_id)?.name ?? g.speaker_id
  freshMessages.push({ id: _feedId(), kind: 'event', text: `\u{1F442} ${speakerName} 传播了关于 ${g.target_name} 的八卦` })
}
```

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/stores/simulation.ts
git commit -m "feat: add dialogue kind + gossip types to frontend store"
```

---

## Task 4: Dialogue bubble styling by kind (1a)

**Files:**
- Modify: `frontend/src/components/town/ResidentSprite.ts`

- [ ] **Step 1: Add kind-based bubble styling**

In `ResidentSprite.ts`, find the `showDialogue(text, status?)` method. Extend its signature to accept `kind`:

```typescript
showDialogue(text: string, kind: 'dialogue' | 'gossip' | 'monologue' = 'dialogue'): void {
```

Update the bubble rendering to use different colors/icons by kind:
- `dialogue`: White background (0xffffff), black text — current behavior
- `gossip`: Light purple background (0xf3e8ff), purple text, prepend "👂 "
- `monologue`: Light blue background (0xeff6ff), gray text, prepend "💭 "

The bubble background is drawn in the `_drawBubble()` or equivalent method. Change fill color based on kind.

- [ ] **Step 2: Thread kind through the ResidentSprite call chain**

The call chain is: `TownRenderer.syncResidents()` → `sprite.applyResident(resident)` (line 299) → `this.updateStatus(resident.status, resident.dialogueText)` (line 275) → `this.showDialogue(text)` (line 321).

Changes needed:
1. In `ResidentSprite.applyResident()` (line 275), pass kind:
   ```typescript
   this.updateStatus(resident.status, resident.dialogueText, resident.dialogueKind)
   ```
2. In `ResidentSprite.updateStatus()` (line 337), add kind parameter:
   ```typescript
   updateStatus(status: ResidentStatus, dialogueText?: string | null, dialogueKind?: string): void {
     // ... existing logic ...
     if (dialogueText) {
       this.showDialogue(dialogueText, dialogueKind ?? 'dialogue')
     }
   }
   ```

No changes needed in `TownRenderer.syncResidents` — it already calls `sprite.applyResident(resident)` which passes the full `ResidentPosition` object including the new `dialogueKind` field.

- [ ] **Step 3: Visual verification**

Run: `cd frontend && npx vite --port 5174`
Open browser, start simulation, wait for dialogues. Verify:
- Normal dialogues show white bubbles
- (Gossip will only appear once backend is also running with new code)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/town/ResidentSprite.ts
git commit -m "feat: style dialogue bubbles by kind (dialogue/gossip/monologue)"
```

---

## Task 5: Mood emoji + occupation badge + energy bar (1b)

**Files:**
- Modify: `frontend/src/components/town/ResidentSprite.ts`

- [ ] **Step 1: Add mood emoji rendering**

In `ResidentSprite.ts`, add a new `Text` child for the mood emoji. Position it 4px above the sprite top (above the name label). Create a mood-to-emoji mapping:

```typescript
const MOOD_EMOJI: Record<string, string> = {
  happy: '\u{1F60A}',    // 😊
  excited: '\u{1F60A}',  // 😊
  ecstatic: '\u{1F929}', // 🤩
  sad: '\u{1F622}',      // 😢
  angry: '\u{1F620}',    // 😠
  fearful: '\u{1F628}',  // 😨
  tired: '\u{1F634}',    // 😴
  calm: '',              // no icon
  content: '',           // no icon
  neutral: '',           // no icon
}
```

Add a `moodEmoji` Text child in the constructor. In the `reuse()` or `updateAppearance()` method, set `this.moodEmoji.text = MOOD_EMOJI[mood] ?? ''`.

Position: centered above the sprite head, y offset = -26 (above the existing energyWarning at y=-20, above the head circle at y=-12).

- [ ] **Step 2: Add occupation badge**

Add a small `Text` child for occupation icon, positioned at bottom-left of sprite:

```typescript
const OCCUPATION_ICON: Record<string, string> = {
  barista: '\u2615',      // ☕
  teacher: '\u{1F4DA}',   // 📚
  shopkeeper: '\u{1F6D2}', // 🛒
  unemployed: '',
}
```

Only show when `resident.occupation` is set and not 'unemployed'.

Note: `ResidentPosition` already has `mood?: string` and `occupation?: string` fields, and `applyResident()` receives the full `ResidentPosition`. The mood emoji and occupation badge should be updated inside `applyResident()`, reading from `resident.mood` and `resident.occupation` directly.

- [ ] **Step 3: Add energy bar**

Add a `Graphics` child below the sprite body. Draw a 20×3px bar:
- Background: dark gray (0x374151), alpha 0.5
- Fill: width proportional to energy (0–20px)
- Color: green (0x22c55e) when > 0.5, yellow (0xeab308) when > 0.2, red (0xef4444) when <= 0.2
- When energy < 0.2, pulse alpha between 0.5 and 1.0

Draw the energy bar inside `updateEnergy(energy: number)` (the existing method called from `applyResident()`), not in `update(deltaMs)`. This follows the established pattern and avoids redundant polling.

- [ ] **Step 4: Run frontend tests + visual check**

Run: `cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/town/ResidentSprite.ts
git commit -m "feat: add mood emoji, occupation badge, energy bar to resident sprites"
```

---

## Task 6: Weather color filters (1c)

**Files:**
- Create: `frontend/src/components/town/effects/WeatherFilter.ts`
- Modify: `frontend/src/components/town/TownRenderer.ts`

- [ ] **Step 1: Create WeatherFilter module**

```typescript
// frontend/src/components/town/effects/WeatherFilter.ts
import { ColorMatrixFilter } from 'pixi.js'

export function createWeatherFilter(weather: string): ColorMatrixFilter | null {
  const filter = new ColorMatrixFilter()

  switch (weather) {
    case 'sunny':
      // Warm yellow tint: increase red/green slightly, desaturate blue
      filter.matrix = [
        1.08, 0.05, 0, 0, 0.02,
        0.02, 1.05, 0, 0, 0.01,
        0, 0, 0.92, 0, 0,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'cloudy':
      // Gray desaturation
      filter.desaturate()
      // Lighten slightly
      filter.matrix[4] = 0.03
      filter.matrix[9] = 0.03
      filter.matrix[14] = 0.03
      return filter

    case 'rainy':
      // Blue-gray tint
      filter.matrix = [
        0.88, 0, 0.05, 0, 0,
        0, 0.90, 0.05, 0, 0,
        0.02, 0.05, 1.05, 0, 0.03,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'stormy':
      // Deep blue-dark tint
      filter.matrix = [
        0.7, 0, 0.05, 0, -0.02,
        0, 0.72, 0.05, 0, -0.02,
        0.05, 0.05, 0.9, 0, 0.02,
        0, 0, 0, 1, 0,
      ]
      return filter

    case 'snowy':
      // Cold blue-white tint
      filter.matrix = [
        0.95, 0.05, 0.1, 0, 0.04,
        0.03, 0.95, 0.1, 0, 0.04,
        0.05, 0.08, 1.1, 0, 0.06,
        0, 0, 0, 1, 0,
      ]
      return filter

    default:
      return null
  }
}
```

- [ ] **Step 2: Apply filter in TownRenderer.updateWeather()**

In `TownRenderer.ts`, in the `updateWeather(weather)` method, after spawning particle effects, apply the color filter to the `world` container:

```typescript
import { createWeatherFilter } from './effects/WeatherFilter'

// In updateWeather():
const weatherFilter = createWeatherFilter(weather)
this.world.filters = weatherFilter ? [weatherFilter] : []
```

- [ ] **Step 3: Visual verification**

Start the app, use the weather API to change weather:
```bash
curl -X POST http://localhost:8000/api/world/weather -H 'Content-Type: application/json' -d '{"type":"rainy"}'
```
Verify: map takes on a blue tint. Try all 5 weather types.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/town/effects/WeatherFilter.ts frontend/src/components/town/TownRenderer.ts
git commit -m "feat: add weather color filters (sunny/cloudy/rainy/stormy/snowy)"
```

---

## Task 7: Relationship milestone map effects (1d)

**Files:**
- Create: `frontend/src/components/town/effects/MilestoneEffect.ts`
- Modify: `frontend/src/components/town/TownRenderer.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Create MilestoneEffect particle line**

```typescript
// frontend/src/components/town/effects/MilestoneEffect.ts
import { Container, Graphics } from 'pixi.js'

const EVENT_COLORS: Record<string, number> = {
  confession: 0xf472b6,       // pink
  best_friends: 0x34d399,     // green
  public_argument: 0xef4444,  // red
}

const DURATION_MS = 4000
const PARTICLE_COUNT = 12

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
}

export class MilestoneEffect {
  readonly container = new Container()
  private readonly graphics = new Graphics()
  private particles: Particle[] = []
  private elapsed = 0
  private readonly duration = DURATION_MS
  private readonly color: number
  private fromX: number
  private fromY: number
  private toX: number
  private toY: number
  done = false

  constructor(fromX: number, fromY: number, toX: number, toY: number, eventType: string) {
    this.fromX = fromX
    this.fromY = fromY
    this.toX = toX
    this.toY = toY
    this.color = EVENT_COLORS[eventType] ?? 0xfbbf24

    this.container.addChild(this.graphics)

    // Spawn particles along the line between the two residents
    const dx = toX - fromX
    const dy = toY - fromY
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.random()
      this.particles.push({
        x: fromX + dx * t,
        y: fromY + dy * t,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8 - 0.3,
        life: 0,
        maxLife: 1500 + Math.random() * 2000,
        size: 2 + Math.random() * 3,
      })
    }
  }

  update(deltaMs: number): void {
    this.elapsed += deltaMs
    if (this.elapsed >= this.duration) {
      this.done = true
      return
    }

    const progress = this.elapsed / this.duration
    const alpha = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2

    this.graphics.clear()

    // Draw connecting line
    this.graphics.moveTo(this.fromX, this.fromY)
    this.graphics.lineTo(this.toX, this.toY)
    this.graphics.stroke({ width: 2, color: this.color, alpha: alpha * 0.4 })

    // Draw particles
    for (const p of this.particles) {
      p.life += deltaMs
      if (p.life > p.maxLife) continue
      p.x += p.vx
      p.y += p.vy
      const pAlpha = alpha * (1 - p.life / p.maxLife)
      this.graphics.circle(p.x, p.y, p.size)
      this.graphics.fill({ color: this.color, alpha: pAlpha })
    }
  }

  destroy(): void {
    this.container.removeChildren()
    this.graphics.destroy()
  }
}
```

- [ ] **Step 2: Integrate MilestoneEffect into TownRenderer**

In `TownRenderer.ts`, add:
- A `milestoneEffects: MilestoneEffect[]` array
- A `triggerMilestone(fromId, toId, eventType)` public method that looks up resident positions and spawns a `MilestoneEffect`
- In `animate()`, update all active effects and remove done ones

```typescript
// In TownRenderer class:
private milestoneEffects: MilestoneEffect[] = []

triggerMilestone(fromId: string, toId: string, eventType: string): void {
  const fromSprite = this.residents.get(fromId)
  const toSprite = this.residents.get(toId)
  if (!fromSprite || !toSprite) return

  const effect = new MilestoneEffect(
    fromSprite.x, fromSprite.y,
    toSprite.x, toSprite.y,
    eventType,
  )
  this.effectLayer.addChild(effect.container)
  this.milestoneEffects.push(effect)
}

// In animate():
for (let i = this.milestoneEffects.length - 1; i >= 0; i--) {
  const effect = this.milestoneEffects[i]
  effect.update(deltaMs)
  if (effect.done) {
    this.effectLayer.removeChild(effect.container)
    effect.destroy()
    this.milestoneEffects.splice(i, 1)
  }
}
```

- [ ] **Step 3: Trigger milestone from useWebSocket**

In `useWebSocket.ts`, where `relationship_events` are processed, call the renderer's `triggerMilestone`:

```typescript
// In the tick processing section where relationship_events are handled:
for (const relEvent of tick.relationship_events ?? []) {
  rendererRef.current?.triggerMilestone(relEvent.from_id, relEvent.to_id, relEvent.event_type)
}
```

`useWebSocket` does NOT have access to the renderer ref. Use a CustomEvent to bridge them (same pattern as the existing `populace:open-settings` event):

In `useWebSocket.ts`:
```typescript
window.dispatchEvent(new CustomEvent('populace:milestone', {
  detail: { fromId: relEvent.from_id, toId: relEvent.to_id, eventType: relEvent.event_type }
}))
```

In `TownCanvas.tsx`, add a listener:
```typescript
useEffect(() => {
  const handler = (e: Event) => {
    const { fromId, toId, eventType } = (e as CustomEvent).detail
    rendererRef.current?.triggerMilestone(fromId, toId, eventType)
  }
  window.addEventListener('populace:milestone', handler)
  return () => window.removeEventListener('populace:milestone', handler)
}, [])
```

- [ ] **Step 4: Enhance relationship event toast**

In `useWebSocket.ts`, upgrade the toast for relationship events:

```typescript
const EVENT_TOAST: Record<string, { icon: string; label: string }> = {
  confession: { icon: '\u{1F495}', label: '坠入爱河' },
  best_friends: { icon: '\u{1F91D}', label: '成为挚友' },
  public_argument: { icon: '\u26A1', label: '公开争吵' },
}

for (const relEvent of tick.relationship_events ?? []) {
  const meta = EVENT_TOAST[relEvent.event_type] ?? { icon: '\u2728', label: relEvent.event_type }
  pushToast({
    type: relEvent.event_type === 'public_argument' ? 'warning' : 'success',
    category: 'relationship',
    title: `${meta.icon} ${relEvent.from_name} 和 ${relEvent.to_name} ${meta.label}！`,
    description: relEvent.dialogue,
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/town/effects/MilestoneEffect.ts frontend/src/components/town/TownRenderer.ts frontend/src/components/town/TownCanvas.tsx frontend/src/hooks/useWebSocket.ts
git commit -m "feat: add relationship milestone particle effects + enhanced toasts"
```

---

## Task 8: Resident Story Panel (1e)

**Files:**
- Create: `frontend/src/components/town/ResidentStoryPanel.tsx`
- Modify: `frontend/src/components/town/TownChrome.tsx`
- Modify: `frontend/src/i18n/zh.json`
- Modify: `frontend/src/i18n/en.json`

- [ ] **Step 1: Add i18n keys**

In `zh.json`, add under root:
```json
"resident_panel": {
  "now": "现在",
  "recent": "最近发生的事",
  "relationships": "关系",
  "no_recent": "暂无近期事件",
  "no_relationships": "还没有认识其他居民",
  "god_actions": "上帝操作",
  "edit_mood": "改情绪",
  "teleport": "传送",
  "inject_memory": "注入记忆",
  "generate_memoir": "回忆录",
  "coins": "金币",
  "energy": "能量",
  "goal": "目标",
  "on_the_edge": "在恋爱边缘",
  "close_friends": "亲密朋友",
  "acquaintance": "普通朋友",
  "tense": "有些不对付",
  "at_work_until": "在{{building}}工作，轮班到{{time}}",
  "wandering": "在小镇闲逛",
  "at_home": "在家休息",
  "in_building": "在{{building}}"
}
```

In `en.json`, add equivalent English keys.

- [ ] **Step 2: Create ResidentStoryPanel component**

```typescript
// frontend/src/components/town/ResidentStoryPanel.tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getResidentAchievements,
  getResidentMemories,
  getResidentRelationships,
  patchResidentAttributes,
  teleportResident,
  injectResidentMemory,
  generateMemoir,
} from '../../services/api'

// Types for API responses
interface MemoryEntry { id: string; content: string; timestamp: string; importance: number; emotion: string }
interface RelEntry { from_id: string; to_id: string; type: string; intensity: number; counterpart_name: string; direction: string }

// Mood emoji mapping (same as ResidentSprite)
const MOOD_EMOJI: Record<string, string> = {
  happy: '😊', excited: '😊', ecstatic: '🤩',
  sad: '😢', angry: '😠', fearful: '😨', tired: '😴',
  calm: '', content: '', neutral: '',
}

// Relationship type icons
const REL_ICON: Record<string, string> = {
  love: '💕', friendship: '🤝', rivalry: '⚔️',
  knows: '👋', trust: '🤝', fear: '😨', dislike: '👎',
}

interface Props {
  residentId: string
  residents: Array<{ id: string; name: string; mood?: string; occupation?: string; coins?: number; energy?: number; currentGoal?: string; currentBuildingId?: string | null }>
  buildings: Array<{ id: string; name: string; type: string }>
  onClose: () => void
}
```

The component renders:
1. **Header**: Avatar placeholder + name + mood emoji + occupation + coins + energy bar
2. **Current status**: What they're doing right now (derived from `location` + building lookup)
3. **Recent events**: Filter memories — skip heartbeat entries (those containing "Tick" and "mood="), show max 5
4. **Relationships**: Top 5 by intensity, with type icon + progress bar + descriptive label
5. **God actions**: Inline buttons for edit mood, teleport, inject memory, generate memoir

- [ ] **Step 3: Wire into TownChrome**

In `TownChrome.tsx`, replace the existing tab-based sidebar with `ResidentStoryPanel` when a resident is selected:

```typescript
{selectedResidentId && (
  <ResidentStoryPanel
    residentId={selectedResidentId}
    residents={residents}
    buildings={buildings}
    onClose={() => selectResident(null)}
  />
)}
```

Remove the old tab-based panel code (memories/diary/relationships/achievements tabs).

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All pass (update any TownChrome tests that reference the old tab structure)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/town/ResidentStoryPanel.tsx frontend/src/components/town/TownChrome.tsx frontend/src/i18n/zh.json frontend/src/i18n/en.json
git commit -m "feat: replace tab sidebar with narrative-driven ResidentStoryPanel"
```

---

## Task 9: Integration test — full narrative flow

**Files:**
- Test: `tests/test_engine/test_narrative_flow.py`
- Test: `frontend/src/__tests__/ResidentStoryPanel.test.tsx`

- [ ] **Step 1: Backend integration test**

```python
# tests/test_engine/test_narrative_flow.py
"""Integration: dialogue kind + gossip surface in tick output."""
import pytest
from engine.types import DialogueUpdate, TickState


def test_dialogue_update_kind_serializes():
    d = DialogueUpdate(from_id="a", to_id="b", text="hi", kind="gossip")
    from dataclasses import asdict
    data = asdict(d)
    assert data["kind"] == "gossip"


def test_tick_state_gossip_serializes():
    from engine.types import GossipUpdate
    ts = TickState(
        tick=1,
        time="Day 1, 08:00",
        gossips=[GossipUpdate(
            speaker_id="a", listener_id="b", target_id="c",
            target_name="Carol", content="Carol is nice", is_positive=True,
        )],
    )
    from dataclasses import asdict
    data = asdict(ts)
    assert len(data["gossips"]) == 1
    assert data["gossips"][0]["target_name"] == "Carol"
```

- [ ] **Step 2: Frontend component test**

```typescript
// frontend/src/__tests__/ResidentStoryPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mock API calls — vitest resolves mocks from the source file's perspective
vi.mock('../services/api', () => ({
  getResidentMemories: vi.fn().mockResolvedValue([]),
  getResidentRelationships: vi.fn().mockResolvedValue([]),
  getResidentAchievements: vi.fn().mockResolvedValue([]),
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ResidentStoryPanel } from '../components/town/ResidentStoryPanel'

describe('ResidentStoryPanel', () => {
  const defaultProps = {
    residentId: 'r1',
    residents: [{ id: 'r1', name: 'Alice', mood: 'happy', occupation: 'barista', coins: 42, energy: 0.8 }],
    buildings: [{ id: 'cafe_1', name: 'Tea House', type: 'cafe' }],
    onClose: vi.fn(),
  }

  it('renders resident name', async () => {
    render(<ResidentStoryPanel {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('shows mood emoji for happy', () => {
    render(<ResidentStoryPanel {...defaultProps} />)
    expect(screen.getByText('😊')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run all tests**

Run: `python3 -m pytest tests/ -x -q && cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add tests/test_engine/test_narrative_flow.py frontend/src/__tests__/ResidentStoryPanel.test.tsx
git commit -m "test: add integration tests for narrative layer"
```

---

## Task 10: Final polish + Memory source filtering

**Files:**
- Modify: `engine/types.py` (add `source` field to Memory)
- Modify: `engine/social.py` (set source='dialogue' on dialogue memories)
- Modify: `backend/api/simulation.py` (set source='heartbeat' on heartbeat memories)
- Modify: `frontend/src/components/town/ResidentStoryPanel.tsx` (filter out heartbeat memories)

- [ ] **Step 1: Add `source` field to Memory dataclass**

In `engine/types.py`, modify Memory:
```python
@dataclass
class Memory:
    id: str
    content: str
    timestamp: str
    importance: float
    emotion: str
    source: str = "system"  # 'system' | 'heartbeat' | 'dialogue' | 'event' | 'gossip' | 'injected'
```

- [ ] **Step 2: Tag memories by source in simulation loop**

In `backend/api/simulation.py`, where heartbeat memory is created:
```python
agent.memorize(heartbeat)  # heartbeat source is default
```
Change the heartbeat Event to include a marker, or set source directly on the Memory created in `agent.memorize()`. Since `memorize` creates a Memory internally, we need to pass source through. The simplest approach: tag the Event's source field and have `memorize()` use it.

In `engine/social.py`, where important dialogue memories are created (around line 404):
```python
mem_a = Memory(
    id=str(uuid.uuid4()),
    content=summary,
    timestamp=tick_time,
    importance=0.8,
    emotion="happy" if delta > 0 else "sad",
    source="dialogue",
)
```

In `engine/gossip.py`, where gossip memories are created (line 107):
```python
mem = Memory(
    id=str(uuid.uuid4()),
    content=f"[八卦] {content}",
    timestamp=world.simulation_time(),
    importance=0.3,
    emotion="curious",
    source="gossip",
)
```

- [ ] **Step 3: Filter heartbeat memories in ResidentStoryPanel**

In `ResidentStoryPanel.tsx`, when displaying "Recent events", filter:
```typescript
const recentEvents = memories
  .filter(m => m.source !== 'heartbeat' && !m.content.startsWith('Tick '))
  .slice(-5)
  .reverse()
```

- [ ] **Step 4: Run full test suite**

Run: `python3 -m pytest tests/ -x -q && cd frontend && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add engine/types.py engine/social.py engine/gossip.py backend/api/simulation.py frontend/src/components/town/ResidentStoryPanel.tsx
git commit -m "feat: add memory source field, filter heartbeat noise from story panel"
```
