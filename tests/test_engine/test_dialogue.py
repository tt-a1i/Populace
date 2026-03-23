from engine.dialogue import build_dialogue_context, generate_template_dialogue
from engine.types import RelationType, Relationship, WeatherType


def test_generate_template_dialogue_changes_tone_by_relationship(mock_world):
    speaker = mock_world.agents[0]
    listener = mock_world.agents[1]

    friendship = generate_template_dialogue(
        speaker,
        listener,
        mock_world,
        relation_type=RelationType.friendship,
    )
    rivalry = generate_template_dialogue(
        speaker,
        listener,
        mock_world,
        relation_type=RelationType.rivalry,
    )
    love = generate_template_dialogue(
        speaker,
        listener,
        mock_world,
        relation_type=RelationType.love,
    )

    friendship_text = " ".join(message["text"] for message in friendship["messages"])
    rivalry_text = " ".join(message["text"] for message in rivalry["messages"])
    love_text = " ".join(message["text"] for message in love["messages"])

    assert "老朋友" in friendship_text
    assert "抢风头" in rivalry_text
    assert "想你" in love_text


def test_build_dialogue_context_includes_mood_weather_season_and_time(mock_world):
    speaker = mock_world.agents[0]
    listener = mock_world.agents[1]
    speaker.resident.mood = "happy"
    listener.resident.mood = "tired"
    mock_world.weather = WeatherType.rainy
    mock_world.season = "winter"
    mock_world.current_tick = 43  # 21:30

    context = build_dialogue_context(speaker, listener, mock_world, RelationType.friendship)

    assert context["time_of_day"] == "night"
    assert "雨" in context["environment_line"]
    assert "冬" in context["environment_line"]
    assert "高兴" in context["speaker_mood_line"]
    assert "疲惫" in context["listener_mood_line"]


def test_generate_template_dialogue_naturally_blends_gossip(mock_world):
    speaker = mock_world.agents[0]
    listener = mock_world.agents[1]
    target = mock_world.agents[2]
    mock_world.set_relationship(
        Relationship(
            from_id=speaker.resident.id,
            to_id=target.resident.id,
            type=RelationType.friendship,
            intensity=0.8,
            since="Day 1, 08:00",
            familiarity=0.5,
        )
    )
    gossip = {
        "target_id": target.resident.id,
        "target_name": target.resident.name,
        "content": f"听说{target.resident.name}今天在集市帮了不少人。",
        "is_positive": True,
    }

    dialogue = generate_template_dialogue(
        speaker,
        listener,
        mock_world,
        relation_type=RelationType.friendship,
        gossip=gossip,
    )

    combined = " ".join(message["text"] for message in dialogue["messages"])
    assert target.resident.name in combined
    assert "听说" in combined
