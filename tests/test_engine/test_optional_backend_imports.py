from pathlib import Path


def test_engine_tree_has_no_direct_backend_import_statements():
    engine_root = Path(__file__).resolve().parents[2] / "engine"
    offenders: list[str] = []

    for path in engine_root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "from backend" in text:
            offenders.append(str(path.relative_to(engine_root.parent)))

    assert offenders == []
