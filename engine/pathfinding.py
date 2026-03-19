"""A* pathfinding and per-tick path cache for the Populace simulation engine.

Implements the spatial navigation subsystem described in spec §10.
"""
from __future__ import annotations

import heapq
from typing import Dict, List, Optional, Tuple


def astar(
    grid: List[List[bool]],
    start: Tuple[int, int],
    goal: Tuple[int, int],
) -> Optional[List[Tuple[int, int]]]:
    """A* shortest path on a 2-D boolean tile grid.

    Args:
        grid:  2-D list indexed as ``grid[y][x]``; ``True`` = walkable.
        start: ``(x, y)`` start tile.
        goal:  ``(x, y)`` goal tile.

    Returns:
        List of ``(x, y)`` tiles from *start* to *goal* (both inclusive),
        or ``None`` if no path exists or either endpoint is not walkable.
    """
    rows = len(grid)
    cols = len(grid[0]) if rows else 0

    def walkable(x: int, y: int) -> bool:
        return 0 <= x < cols and 0 <= y < rows and grid[y][x]

    if not walkable(*start) or not walkable(*goal):
        return None

    if start == goal:
        return [start]

    def h(x: int, y: int) -> int:
        """Manhattan distance heuristic."""
        return abs(x - goal[0]) + abs(y - goal[1])

    # Min-heap entries: (f, g, (x, y))
    open_heap: List[Tuple[int, int, Tuple[int, int]]] = []
    heapq.heappush(open_heap, (h(*start), 0, start))

    g_score: Dict[Tuple[int, int], int] = {start: 0}
    came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}

    DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]

    while open_heap:
        _, g, current = heapq.heappop(open_heap)

        if current == goal:
            # Reconstruct path from goal back to start
            path: List[Tuple[int, int]] = []
            node = goal
            while node in came_from:
                path.append(node)
                node = came_from[node]
            path.append(start)
            path.reverse()
            return path

        # Stale entry — a better path was already found
        if g > g_score.get(current, float("inf")):  # type: ignore[arg-type]
            continue

        cx, cy = current
        for dx, dy in DIRS:
            nx, ny = cx + dx, cy + dy
            neighbor = (nx, ny)
            if not walkable(nx, ny):
                continue
            new_g = g + 1
            if new_g < g_score.get(neighbor, float("inf")):  # type: ignore[arg-type]
                g_score[neighbor] = new_g
                came_from[neighbor] = current
                heapq.heappush(open_heap, (new_g + h(nx, ny), new_g, neighbor))

    return None  # Goal unreachable


class PathCache:
    """Per-tick A* path cache.

    Caches paths keyed by ``(start, goal)`` within a single simulation tick.
    Call :meth:`clear` at the start of each tick to discard stale entries
    (e.g. from ``World.tick()``).
    """

    def __init__(self) -> None:
        self._cache: Dict[
            Tuple[Tuple[int, int], Tuple[int, int]],
            Optional[List[Tuple[int, int]]],
        ] = {}

    def get(
        self,
        start: Tuple[int, int],
        goal: Tuple[int, int],
    ) -> Optional[List[Tuple[int, int]]]:
        """Return cached path, or ``None`` if not cached (also ``None`` if cached as unreachable)."""
        return self._cache.get((start, goal))

    def has(self, start: Tuple[int, int], goal: Tuple[int, int]) -> bool:
        """Return True if this (start, goal) pair has been cached (even if path is None)."""
        return (start, goal) in self._cache

    def set(
        self,
        start: Tuple[int, int],
        goal: Tuple[int, int],
        path: Optional[List[Tuple[int, int]]],
    ) -> None:
        """Store a computed path (``None`` represents an unreachable goal)."""
        self._cache[(start, goal)] = path

    def clear(self) -> None:
        """Discard all cached paths. Call once per tick."""
        self._cache.clear()
