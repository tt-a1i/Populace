import unittest
from unittest.mock import patch

from engine.agent import Agent
from engine.social import decay_relationships, evolve_relationship, update_relationships_from_dialogue
from engine.types import Event, RelationType, Relationship, Resident, WorldConfig
from engine.world import World


class DummyAgent(Agent):
    def perceive(self, world: World) -> list[Event]:
        return []

    def retrieve(self, query: str) -> list:
        return []

    def reflect(self, memories: list) -> None:
        return None

    def plan(self, context: dict) -> dict:
        return {}

    def act(self, plan: dict, world: World) -> None:
        return None

    def memorize(self, event: Event) -> None:
        return None


def make_agent(agent_id: str, name: str) -> DummyAgent:
    return DummyAgent(
        Resident(
            id=agent_id,
            name=name,
            personality="外向",
            x=0,
            y=0,
        )
    )


class RelationshipSystemTests(unittest.TestCase):
    def setUp(self) -> None:
        self.world = World(config=WorldConfig(relationship_decay_rate=0.01))
        self.agent_a = make_agent("a", "Alice")
        self.agent_b = make_agent("b", "Bob")
        self.world.add_agent(self.agent_a)
        self.world.add_agent(self.agent_b)

    def test_decay_relationships_reduces_intensity_and_preserves_familiarity(self) -> None:
        self.world.set_relationship(
            Relationship(
                from_id="a",
                to_id="b",
                type=RelationType.friendship,
                intensity=0.5,
                since="Day 1, 00:00",
                familiarity=0.7,
            )
        )

        updates = decay_relationships(self.world, self.world.config)

        relationship = self.world.get_relationship("a", "b")
        self.assertIsNotNone(relationship)
        self.assertAlmostEqual(relationship.intensity, 0.49)
        self.assertAlmostEqual(relationship.familiarity, 0.7)
        self.assertEqual(updates[0].type, RelationType.friendship.value)
        self.assertAlmostEqual(updates[0].delta, -0.01)

    def test_decay_relationships_removes_zeroed_relation_without_familiarity(self) -> None:
        self.world.set_relationship(
            Relationship(
                from_id="a",
                to_id="b",
                type=RelationType.friendship,
                intensity=0.005,
                since="Day 1, 00:00",
                familiarity=0.0,
            )
        )

        updates = decay_relationships(self.world, self.world.config)

        self.assertIsNone(self.world.get_relationship("a", "b"))
        self.assertEqual(updates[0].type, RelationType.friendship.value)
        self.assertAlmostEqual(updates[0].delta, -0.005)

    def test_evolve_relationship_can_upgrade_friendship_to_love(self) -> None:
        with patch("engine.social.random.random", return_value=0.0):
            new_type = evolve_relationship(
                self.agent_a,
                self.agent_b,
                0.4,
                RelationType.friendship,
                intensity=0.85,
                familiarity=0.6,
            )

        self.assertEqual(new_type, RelationType.love)

    def test_knows_relationship_can_evolve_into_friendship(self) -> None:
        for _ in range(3):
            update_relationships_from_dialogue(self.world, self.agent_a, self.agent_b, 4.0)

        relationship = self.world.get_relationship("a", "b")
        self.assertIsNotNone(relationship)
        self.assertEqual(relationship.type, RelationType.friendship)
        self.assertGreaterEqual(relationship.familiarity, 0.2)
        self.assertEqual(relationship.since, "Day 1, 00:00")

    def test_friendship_can_degrade_into_rivalry(self) -> None:
        self.world.set_relationship(
            Relationship(
                from_id="a",
                to_id="b",
                type=RelationType.friendship,
                intensity=0.4,
                since="Day 1, 00:00",
                familiarity=0.5,
            )
        )

        updates = update_relationships_from_dialogue(self.world, self.agent_a, self.agent_b, -4.0)

        relationship = self.world.get_relationship("a", "b")
        self.assertIsNotNone(relationship)
        self.assertEqual(relationship.type, RelationType.rivalry)
        self.assertEqual(updates[0].type, RelationType.rivalry.value)

    def test_rivalry_can_recover_into_friendship(self) -> None:
        self.world.set_relationship(
            Relationship(
                from_id="a",
                to_id="b",
                type=RelationType.rivalry,
                intensity=0.3,
                since="Day 1, 00:00",
                familiarity=0.5,
            )
        )

        updates = update_relationships_from_dialogue(self.world, self.agent_a, self.agent_b, 4.0)

        relationship = self.world.get_relationship("a", "b")
        self.assertIsNotNone(relationship)
        self.assertEqual(relationship.type, RelationType.friendship)
        self.assertEqual(updates[0].type, RelationType.friendship.value)


if __name__ == "__main__":
    unittest.main()
