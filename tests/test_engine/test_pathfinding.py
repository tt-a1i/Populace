"""Tests for engine/pathfinding.py — A* and PathCache."""
import pytest

from engine.pathfinding import PathCache, astar


def _open_grid(w: int = 10, h: int = 10):
    return [[True] * w for _ in range(h)]


def _blocked_grid(w: int = 10, h: int = 10):
    return [[False] * w for _ in range(h)]


def test_astar_simple_horizontal():
    grid = _open_grid()
    path = astar(grid, (0, 0), (3, 0))
    assert path is not None
    assert len(path) >= 2
    assert path[0] == (0, 0)
    assert path[-1] == (3, 0)


def test_astar_simple_vertical():
    grid = _open_grid()
    path = astar(grid, (0, 0), (0, 4))
    assert path is not None
    assert path[-1] == (0, 4)


def test_astar_diagonal_route():
    grid = _open_grid()
    path = astar(grid, (0, 0), (5, 5))
    assert path is not None
    assert path[-1] == (5, 5)


def test_astar_start_equals_goal():
    grid = _open_grid()
    path = astar(grid, (3, 3), (3, 3))
    # Should return path with just the start tile (or empty)
    assert path is not None
    assert len(path) <= 1


def test_astar_no_path_when_blocked():
    grid = _open_grid(5, 5)
    # Wall across column 2
    for row in grid:
        row[2] = False
    path = astar(grid, (0, 0), (4, 0))
    assert path == [] or path is None


def test_astar_out_of_bounds_goal_returns_empty():
    grid = _open_grid(5, 5)
    path = astar(grid, (0, 0), (10, 10))
    assert not path


def test_astar_avoids_obstacles():
    grid = _open_grid(5, 5)
    grid[0][1] = False  # block (1,0)
    path = astar(grid, (0, 0), (2, 0))
    assert path is not None
    assert path[-1] == (2, 0)
    for x, y in path:
        assert grid[y][x] is True


def test_path_cache_hit():
    cache = PathCache()
    path = [(0, 0), (1, 0), (2, 0)]
    cache.set((0, 0), (2, 0), path)
    assert cache.has((0, 0), (2, 0))
    assert cache.get((0, 0), (2, 0)) == path


def test_path_cache_miss():
    cache = PathCache()
    assert not cache.has((0, 0), (5, 5))
    assert cache.get((0, 0), (5, 5)) is None


def test_path_cache_clear():
    cache = PathCache()
    cache.set((0, 0), (1, 0), [(0, 0), (1, 0)])
    cache.clear()
    assert not cache.has((0, 0), (1, 0))
