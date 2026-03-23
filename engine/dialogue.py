from __future__ import annotations

from typing import TYPE_CHECKING

from engine.types import RelationType, WeatherType

if TYPE_CHECKING:
    from engine.agent import Agent
    from engine.world import World


_RELATION_OPENERS: dict[RelationType, tuple[str, str]] = {
    RelationType.friendship: ("老朋友", "你这句听着就让人放松"),
    RelationType.rivalry: ("老对手", "你这话还是一样带刺"),
    RelationType.love: ("亲爱的", "听你这么说我心都软了"),
    RelationType.knows: ("邻居", "听起来挺有意思"),
    RelationType.trust: ("搭档", "有你这句话我就放心"),
    RelationType.fear: ("你别突然这样说", "我先听着"),
    RelationType.dislike: ("今天倒是稀奇", "我姑且听完"),
}

_MOOD_LABELS = {
    "happy": "高兴",
    "excited": "兴奋",
    "content": "满足",
    "calm": "平静",
    "neutral": "平稳",
    "tired": "疲惫",
    "sad": "低落",
    "angry": "烦躁",
    "fearful": "紧张",
}

_WEATHER_LINES = {
    WeatherType.sunny: "晴朗的天色让街上都亮堂了些",
    WeatherType.cloudy: "天色阴阴的，大家说话都轻了点",
    WeatherType.rainy: "细雨把路面压得发亮，说话声也显得更近了",
    WeatherType.stormy: "风声一阵紧一阵，谁都忍不住想快点把话说明白",
    WeatherType.snowy: "雪意把四周压得安静，话一出口就像带着白气",
}

_SEASON_LINES = {
    "spring": "春意正好",
    "summer": "夏气正盛",
    "autumn": "秋风正起",
    "winter": "冬意很深",
}

_TIME_OF_DAY_LABELS = {
    "morning": "早晨",
    "afternoon": "午后",
    "evening": "傍晚",
    "night": "夜里",
}

_RELATION_BASE_DELTA = {
    RelationType.love: 6,
    RelationType.friendship: 3,
    RelationType.trust: 2,
    RelationType.knows: 1,
    RelationType.dislike: -2,
    RelationType.fear: -3,
    RelationType.rivalry: -4,
}

_POSITIVE_MOODS = {"happy", "excited", "content", "calm"}
_NEGATIVE_MOODS = {"tired", "sad", "angry", "fearful"}


def relation_type_for_agents(agent_a: "Agent", agent_b: "Agent", world: "World") -> RelationType:
    relationship = world.get_relationship(agent_a.resident.id, agent_b.resident.id)
    if relationship is None:
        return RelationType.knows
    return relationship.type


def get_time_of_day(world: "World") -> str:
    tick_in_day = world.current_tick % world.config.tick_per_day
    hour = tick_in_day * 24 / world.config.tick_per_day
    if hour < 11:
        return "morning"
    if hour < 17:
        return "afternoon"
    if hour < 21:
        return "evening"
    return "night"


def build_dialogue_context(
    speaker: "Agent",
    listener: "Agent",
    world: "World",
    relation_type: RelationType,
) -> dict[str, str]:
    weather = world.weather if isinstance(world.weather, WeatherType) else WeatherType(str(world.weather))
    season = world.season if world.season in _SEASON_LINES else "spring"
    time_of_day = get_time_of_day(world)
    return {
        "relation_type": relation_type.value,
        "time_of_day": time_of_day,
        "time_label": _TIME_OF_DAY_LABELS[time_of_day],
        "environment_line": f"{_SEASON_LINES[season]}，{_WEATHER_LINES[weather]}。",
        "speaker_mood_line": f"{speaker.resident.name}现在心情偏{_MOOD_LABELS.get(speaker.resident.mood, speaker.resident.mood or '平稳')}。",
        "listener_mood_line": f"{listener.resident.name}看起来有些{_MOOD_LABELS.get(listener.resident.mood, listener.resident.mood or '平稳')}。",
    }


def generate_template_dialogue(
    speaker: "Agent",
    listener: "Agent",
    world: "World",
    *,
    relation_type: RelationType | None = None,
    gossip: dict | None = None,
) -> dict[str, object]:
    relation = relation_type or relation_type_for_agents(speaker, listener, world)
    context = build_dialogue_context(speaker, listener, world, relation)
    opener, listener_reaction = _RELATION_OPENERS[relation]
    speaker_mood = _MOOD_LABELS.get(speaker.resident.mood, speaker.resident.mood or "平稳")
    listener_mood = _MOOD_LABELS.get(listener.resident.mood, listener.resident.mood or "平稳")

    if relation is RelationType.rivalry:
        first_line = (
            f"{listener.resident.name}，{context['time_label']}好啊。{context['environment_line']}"
            f" 连天气都像你一样爱抢风头。"
        )
        second_line = (
            f"{speaker.resident.name}，你还是这么会挖苦人。"
            f"{listener_reaction}，不过我今天只是有点{listener_mood}。"
        )
    elif relation is RelationType.love:
        first_line = (
            f"{listener.resident.name}，{context['time_label']}见到你真好。"
            f"{context['environment_line']} 可都比不上我刚刚那阵想你。"
        )
        second_line = (
            f"{speaker.resident.name}，{listener_reaction}。"
            f" 你看起来有些{speaker_mood}，要不要我陪你慢慢走一段。"
        )
    else:
        first_line = (
            f"{listener.resident.name}，{context['time_label']}好啊，{opener}。"
            f"{context['environment_line']} 我一看到你就想多聊两句。"
        )
        second_line = (
            f"{speaker.resident.name}，{listener_reaction}。"
            f" 你今天像是有点{speaker_mood}，我这边倒是有些{listener_mood}。"
        )

    third_line = (
        f"{speaker.resident.name}说：我刚路过街口，忽然觉得{context['speaker_mood_line']}"
        f" 你那边呢？"
    )
    fourth_line = (
        f"{listener.resident.name}笑了笑：{context['listener_mood_line']}"
        f" 不过和你聊几句，心口会松快些。"
    )

    if gossip is not None:
        third_line = f"{speaker.resident.name}压低声音说：对了，{gossip['content']}"
        fourth_line = (
            f"{listener.resident.name}接话：难怪大家都在议论{gossip['target_name']}。"
            " 这消息我先记下，不过别传得太张扬。"
        )

    messages = [
        {"speaker_id": speaker.resident.id, "text": first_line},
        {"speaker_id": listener.resident.id, "text": second_line},
        {"speaker_id": speaker.resident.id, "text": third_line},
        {"speaker_id": listener.resident.id, "text": fourth_line},
    ]

    delta = evaluate_dialogue_delta(speaker.resident.mood, listener.resident.mood, relation, gossip is not None)
    names = {
        speaker.resident.id: speaker.resident.name,
        listener.resident.id: listener.resident.name,
    }
    return {
        "messages": messages,
        "relationship_delta": delta,
        "is_important": abs(delta) >= 5,
        "context_history": "\n".join(f"{names[message['speaker_id']]}：{message['text']}" for message in messages),
    }


def evaluate_dialogue_delta(
    speaker_mood: str | None,
    listener_mood: str | None,
    relation_type: RelationType,
    includes_gossip: bool,
) -> int:
    delta = _RELATION_BASE_DELTA.get(relation_type, 0)

    if speaker_mood in _POSITIVE_MOODS:
        delta += 1
    if listener_mood in _POSITIVE_MOODS:
        delta += 1
    if speaker_mood in _NEGATIVE_MOODS:
        delta -= 1
    if listener_mood in _NEGATIVE_MOODS:
        delta -= 1
    if includes_gossip:
        delta += 1 if relation_type in {RelationType.friendship, RelationType.love, RelationType.trust} else -1

    return max(-10, min(10, delta))
