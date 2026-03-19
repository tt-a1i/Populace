"""Prompt template functions for the Agent decision loop.

Each function returns an OpenAI messages list (list[dict]).
All prompts are designed to stay within the 800-token input budget
from spec §4.1 / §9 by truncating context when necessary.

Token estimation: 1 token ≈ 4 characters (rough English/Chinese average).
TARGET_CHARS = 800 * 4 = 3200 characters total per prompt.
"""
from __future__ import annotations

from engine.types import Memory, Reflection, Resident

# Conservative character budget so the whole prompt stays ≤ ~800 tokens
_CHAR_BUDGET = 3200


def _truncate(text: str, max_chars: int) -> str:
    """Truncate *text* to *max_chars*, appending '…' if cut."""
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"


def _format_memories(memories: list[Memory], max_chars: int) -> str:
    lines: list[str] = []
    used = 0
    for m in memories:
        line = f"[{m.timestamp}] {m.content} (重要度:{m.importance:.1f}, 情绪:{m.emotion})"
        if used + len(line) > max_chars:
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines) if lines else "（无相关记忆）"


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

def build_perceive_prompt(
    resident: Resident,
    nearby_agents: list[Resident],
    recent_events: list[str],
    lang: str = "zh",
) -> list[dict]:
    """Prompt for the Perceive phase: describe observable environment.

    Args:
        resident:      The acting agent's data.
        nearby_agents: Residents within interaction distance.
        recent_events: Short descriptions of events this tick.
        lang:          Response language: ``"zh"`` (default) or ``"en"``.

    Returns:
        OpenAI messages list.
    """
    if lang == "en":
        nearby_str = ", ".join(a.name for a in nearby_agents) if nearby_agents else "no one"
        events_str = "\n".join(f"- {e}" for e in recent_events) if recent_events else "- none"
        content = _truncate(
            f"You are {resident.name}, personality: {resident.personality}, current mood: {resident.mood}.\n"
            f"You are currently at: {resident.location or 'somewhere in town'}.\n"
            f"Nearby people: {nearby_str}.\n"
            f"Recent events:\n{events_str}\n\n"
            f"Describe in one sentence what you notice (≤50 words).",
            _CHAR_BUDGET,
        )
        return [
            {"role": "system", "content": "You are an AI resident of a pixel town. Reply briefly in first person."},
            {"role": "user", "content": content},
        ]

    nearby_str = "、".join(a.name for a in nearby_agents) if nearby_agents else "无人"
    events_str = "\n".join(f"- {e}" for e in recent_events) if recent_events else "- 无"
    content = _truncate(
        f"你是{resident.name}，性格：{resident.personality}，当前心情：{resident.mood}。\n"
        f"你现在在：{resident.location or '小镇某处'}。\n"
        f"附近的人：{nearby_str}。\n"
        f"刚刚发生的事：\n{events_str}\n\n"
        f"请用一句话描述你注意到了什么（≤50字）。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个生活在像素小镇的AI居民，用第一人称简短回答。"},
        {"role": "user", "content": content},
    ]


def build_plan_prompt(
    resident: Resident,
    memories: list[Memory],
    reflections: list[Reflection],
    lang: str = "zh",
) -> list[dict]:
    """Prompt for the Plan phase: decide next action.

    Args:
        resident:    The acting agent's data.
        memories:    Retrieved relevant memories.
        reflections: High-level reflections relevant to context.

    Returns:
        OpenAI messages list.
    """
    mem_budget = _CHAR_BUDGET // 2
    refl_budget = _CHAR_BUDGET // 4

    mem_str = _format_memories(memories, mem_budget)
    refl_str = _truncate(
        "\n".join(f"- {r.summary}" for r in reflections) if reflections else "（无反思）",
        refl_budget,
    )

    if lang == "en":
        goals_str = "; ".join(resident.goals) if resident.goals else "no specific goals"
        refl_str = _truncate(
            "\n".join(f"- {r.summary}" for r in reflections) if reflections else "(no reflections)",
            _CHAR_BUDGET // 4,
        )
        content = _truncate(
            f"You are {resident.name}, personality: {resident.personality}, mood: {resident.mood}.\n"
            f"Goals: {goals_str}.\n\n"
            f"Relevant memories:\n{_format_memories(memories, _CHAR_BUDGET // 2)}\n\n"
            f"Recent reflections:\n{refl_str}\n\n"
            f"What will you do next? Give one concrete action (move/talk/wait), ≤50 words.",
            _CHAR_BUDGET,
        )
        return [
            {"role": "system", "content": "You are an AI resident of a pixel town. Reply briefly in first person."},
            {"role": "user", "content": content},
        ]

    goals_str = "；".join(resident.goals) if resident.goals else "无明确目标"

    content = _truncate(
        f"你是{resident.name}，性格：{resident.personality}，心情：{resident.mood}。\n"
        f"目标：{goals_str}。\n\n"
        f"相关记忆：\n{mem_str}\n\n"
        f"近期反思：\n{refl_str}\n\n"
        f"接下来你打算做什么？请给出一个具体行动（移动/交谈/等待），≤50字。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个生活在像素小镇的AI居民，用第一人称简短回答。"},
        {"role": "user", "content": content},
    ]


def build_dialogue_prompt(
    speaker: Resident,
    listener: Resident,
    context: str,
    lang: str = "zh",
) -> list[dict]:
    """Prompt for generating one dialogue turn (spec §11: ≤50 tokens).

    Args:
        speaker:  The resident who is about to speak.
        listener: The resident being spoken to.
        context:  Recent conversation history or triggering situation.
        lang:     Response language: ``"zh"`` (default) or ``"en"``.

    Returns:
        OpenAI messages list.
    """
    if lang == "en":
        content = _truncate(
            f"You are {speaker.name} (personality: {speaker.personality}, mood: {speaker.mood}),\n"
            f"talking to {listener.name} (personality: {listener.personality}).\n\n"
            f"Context: {context}\n\n"
            f"Generate your next line, ≤20 words, natural spoken style.",
            _CHAR_BUDGET,
        )
        return [
            {"role": "system", "content": "You are an AI resident of a pixel town. Speak in first person naturally."},
            {"role": "user", "content": content},
        ]

    content = _truncate(
        f"你是{speaker.name}（性格：{speaker.personality}，心情：{speaker.mood}），\n"
        f"正在和{listener.name}（性格：{listener.personality}）说话。\n\n"
        f"对话背景：{context}\n\n"
        f"请生成你的下一句话，≤30字，自然口语化。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个生活在像素小镇的AI居民，用第一人称说话，语气自然。"},
        {"role": "user", "content": content},
    ]


def build_reflect_prompt(
    resident: Resident,
    memories: list[Memory],
    lang: str = "zh",
) -> list[dict]:
    """Prompt for the Reflect phase: synthesise memories into insight.

    Called when accumulated memory count exceeds the reflection threshold
    (spec §4.1, §16: REFLECTION_THRESHOLD = 10).

    Args:
        resident: The reflecting agent.
        memories: Recent memories to synthesise.

    Returns:
        OpenAI messages list.
    """
    mem_str = _format_memories(memories, _CHAR_BUDGET - 300)

    if lang == "en":
        content = _truncate(
            f"You are {resident.name}, personality: {resident.personality}.\n\n"
            f"Recent experiences:\n{mem_str}\n\n"
            f"Summarise the most important insight you gained from these experiences, in one sentence, ≤50 words.",
            _CHAR_BUDGET,
        )
        return [
            {"role": "system", "content": "You are a thoughtful AI resident who reflects on life experiences."},
            {"role": "user", "content": content},
        ]

    content = _truncate(
        f"你是{resident.name}，性格：{resident.personality}。\n\n"
        f"最近的经历：\n{mem_str}\n\n"
        f"请总结你从这些经历中得到的最重要感悟，一句话，≤50字。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个有深度的AI居民，善于从生活中总结感悟。"},
        {"role": "user", "content": content},
    ]


def build_dialogue_eval_prompt(dialogue_text: str) -> list[dict]:
    """Prompt to evaluate a completed dialogue and score its impact.

    The LLM returns a JSON-like string with a sentiment delta in [-10, 10]
    (spec §11: "好感度变化 -10 到 +10").

    Args:
        dialogue_text: The full dialogue exchange as a plain string.

    Returns:
        OpenAI messages list.
    """
    content = _truncate(
        f"以下是两个居民之间的一段对话：\n\n{dialogue_text}\n\n"
        f"请评估这段对话对双方关系的影响。"
        f"只输出一个整数，范围 -10 到 10，正数表示关系改善，负数表示关系恶化。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个社交关系分析师，只输出一个整数，不要解释。"},
        {"role": "user", "content": content},
    ]


def build_scenario_prompt(user_description: str) -> list[dict]:
    """Prompt for generating a town scenario from a user description.

    The LLM must return a single valid JSON object matching the
    ``modern_community.json`` schema (no extra text, no code fences).

    Args:
        user_description: Free-form description, e.g. "一个海边渔村，6个渔民".

    Returns:
        OpenAI messages list.
    """
    content = _truncate(
        f"用户描述：{user_description}\n\n"
        "根据上述描述生成一个小镇场景。只输出一个合法的 JSON 对象，不要有任何解释文字或 Markdown 代码块。\n"
        "JSON 结构如下（严格遵守字段名和类型）：\n"
        '{"name":"场景名称","description":"场景简介","map":{"width":40,"height":30,'
        '"roads":[{"x":0,"y":14,"width":40,"height":2}],"water":[]},'
        '"buildings":[{"id":"home_1","type":"home","name":"民居A","capacity":4,"position":[5,8]},'
        '{"id":"cafe_1","type":"cafe","name":"茶馆","capacity":4,"position":[20,8]}],'
        '"residents":[{"id":"r1","name":"张三","personality":"热情开朗","goals":["探索小镇"],'
        '"mood":"neutral","home_id":"home_1","x":5,"y":14}]}\n\n'
        "要求：\n"
        "- 居民数量与描述一致（最多 10 人）\n"
        "- 每栋建筑 position 的 x 在 2-38、y 在 2-26 之间，且各建筑之间至少间隔 4 格\n"
        "- home_id 指向 buildings 中 type=home 的建筑 id\n"
        "- 居民 x/y 设置在道路上（y=14 或 y=15）\n"
        "- 只输出 JSON，不要有任何其他内容",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是一个游戏场景生成器，只输出 JSON，绝对不要输出任何 JSON 以外的内容。"},
        {"role": "user", "content": content},
    ]


def build_report_prompt(
    residents: list[dict],
    events: list[str],
    relationships: list[dict],
    tick_info: dict,
) -> list[dict]:
    resident_lines = "\n".join(
        f"- {resident['name']} | 心情:{resident.get('mood', 'unknown')} | 地点:{resident.get('location') or '地图上'}"
        for resident in residents[:8]
    ) or "- 当前没有可用居民数据"
    event_lines = "\n".join(f"- {event}" for event in events[:6]) or "- 本周期暂无事件"
    relationship_lines = "\n".join(
        f"- {item['from_id']} -> {item['to_id']} | {item['type']} | 变化:{item['delta']}"
        for item in relationships[:6]
    ) or "- 本周期暂无显著关系变化"

    content = _truncate(
        f"请为像素小镇生成一份日报。\n"
        f"当前 tick: {tick_info.get('tick')}，模拟时间: {tick_info.get('time')}。\n\n"
        f"居民状态：\n{resident_lines}\n\n"
        f"最近事件：\n{event_lines}\n\n"
        f"关系变化：\n{relationship_lines}\n\n"
        "请严格按以下结构输出，每段之间空一行：\n"
        "第一行：日报标题\n"
        "第二段：标题新闻\n"
        "第三段：八卦专栏\n"
        "第四段：关系变动\n"
        "第五段：天气预报\n"
        "语言要有戏剧感、适合社交分享，但控制在简洁短段落。",
        _CHAR_BUDGET,
    )
    return [
        {"role": "system", "content": "你是像素小镇八卦报编辑，擅长写带戏剧张力的短日报。"},
        {"role": "user", "content": content},
    ]
