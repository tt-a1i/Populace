# Contract: Resident Jealousy & Rivalry System (#98)

## Task
Add a jealousy system where residents develop envy toward others based on wealth, reputation, romance, and job performance comparisons. Jealousy triggers negative behaviors and can be resolved through positive interactions.

## Acceptance Criteria

### Functional
- [ ] `JealousyEntry` dataclass in `engine/types.py` with fields: target_id, reason, intensity
- [ ] `Resident.jealousy_targets` field of type `List[JealousyEntry]`
- [ ] Jealousy triggers: wealthier neighbor, higher reputation, romance rival, more popular friend
- [ ] Jealousy behavior: negative bulletin posts (target reputation down), social coldness (relationship intensity down)
- [ ] Competition: same-occupation residents compare performance, lower-ranked get jealousy increase
- [ ] Resolution: jealousy decays over time; friendship/gift interactions reduce intensity
- [ ] `GET /api/world/rivalries` returns rivalry network and jealousy hotspots
- [ ] Frontend: rivalry data available via API (graph marking is out of scope for engine task)

### Edge Cases
- [ ] Resident with empty jealousy_targets handled gracefully
- [ ] Self-jealousy prevented (cannot be jealous of self)
- [ ] Jealousy intensity clamped to [0.0, 1.0]

### Regression
- [ ] All existing pytest tests pass (455+)
- [ ] All existing vitest tests pass (176+)
- [ ] Frontend build succeeds with no TypeScript errors

## Verification Commands
- `python3 -m pytest tests/test_engine/test_jealousy.py -v`
- `python3 -m pytest tests/ -v`
- `cd frontend && npx vitest run`
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npx vite build`

## Out of Scope
- LLM-generated jealousy dialogue
- Frontend graph visualization changes (rivalry lines)
- Jealousy-driven violence or crime events
