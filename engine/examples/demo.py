from __future__ import annotations

try:
    from engine import Building, GenerativeAgent, Resident, World
except ModuleNotFoundError:  # Allow running from the source tree before install completes.
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from engine import Building, GenerativeAgent, Resident, World


def build_demo_world() -> World:
    world = World()
    world.add_building(Building(id="cafe_1", type="cafe", name="Morning Cafe", capacity=4, position=(6, 5)))
    world.add_building(Building(id="home_1", type="home", name="Home Block", capacity=3, position=(2, 2)))

    agents = [
        GenerativeAgent(Resident(id="r-ava", name="Ava", personality="外向、健谈、喜欢热闹", x=1, y=1)),
        GenerativeAgent(Resident(id="r-milo", name="Milo", personality="内向、沉稳、观察力强", x=8, y=4)),
        GenerativeAgent(Resident(id="r-juno", name="Juno", personality="外向、开朗、总想认识新朋友", x=10, y=7)),
    ]

    for agent in agents:
        world.add_agent(agent)

    return world


def main() -> None:
    world = build_demo_world()

    for step in range(10):
        for agent in world.agents:
            agent.act({"action": "move"}, world)

        tick_state = world.tick()
        movement_summary = [
            f"{movement.id}@({movement.x},{movement.y})/{movement.action}"
            for movement in tick_state.movements
        ]
        print(f"tick {step + 1}: {movement_summary}")


if __name__ == "__main__":
    main()
