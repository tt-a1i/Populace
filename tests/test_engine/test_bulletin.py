from engine.gossip import _GOOD_GOSSIP_DELTA
from engine.types import BulletinPost, RelationType, Relationship
from tests.conftest import make_agent


def test_bulletin_positive_post_improves_reader_impression_and_adds_like(mock_world):
    from engine.bulletin import process_bulletin_reactions

    author = mock_world.agents[0]
    reader = mock_world.agents[1]
    mock_world.set_relationship(
        Relationship(
            from_id=reader.resident.id,
            to_id=author.resident.id,
            type=RelationType.knows,
            intensity=0.1,
            familiarity=0.1,
            since=mock_world.simulation_time(),
        )
    )
    post = BulletinPost(
        id="post-festival",
        author_id=author.resident.id,
        content="春日祭太热闹了，和大家一起跳舞真的很开心。",
        tick=mock_world.current_tick,
        likes=[],
        category="festival",
        topic="spring_festival",
        tone="positive",
    )

    summary = process_bulletin_reactions(mock_world, [post], residents=[reader.resident])

    updated = mock_world.get_relationship(reader.resident.id, author.resident.id)
    assert updated is not None
    assert updated.intensity >= round(0.1 + _GOOD_GOSSIP_DELTA, 4)
    assert reader.resident.id in post.likes
    assert summary["reads"] == 1
    assert summary["likes"] == 1


def test_hot_topics_group_shared_topics_and_sentiment():
    from engine.bulletin import summarize_hot_topics

    posts = [
        BulletinPost(id="1", author_id="a1", content="春日祭很棒", tick=48, likes=["a2"], category="festival", topic="spring_festival", tone="positive"),
        BulletinPost(id="2", author_id="a2", content="春日祭让我认识新朋友", tick=49, likes=[], category="festival", topic="spring_festival", tone="positive"),
        BulletinPost(id="3", author_id="a3", content="商店今天断货了", tick=50, likes=[], category="market", topic="shop_shortage", tone="negative"),
    ]

    topics = summarize_hot_topics(posts)

    assert topics[0]["topic"] == "spring_festival"
    assert topics[0]["post_count"] == 2
    assert topics[0]["sentiment"] == "positive"
    assert topics[1]["topic"] == "shop_shortage"
    assert topics[1]["sentiment"] == "negative"


def test_build_bulletin_post_from_recent_experience_prefers_recent_signal():
    from engine.bulletin import build_bulletin_post

    resident = make_agent("a7", "阿雅").resident
    post = build_bulletin_post(
        resident,
        tick=96,
        experience={
            "category": "achievement",
            "topic": "social_star",
            "tone": "positive",
            "content": "今天解锁了人气王，没想到大家真的都认识我了。",
            "subject_id": resident.id,
        },
    )

    assert post is not None
    assert post.category == "achievement"
    assert post.topic == "social_star"
    assert post.subject_id == resident.id
    assert "人气王" in post.content
