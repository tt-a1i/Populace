from __future__ import annotations

import json
from pathlib import Path


_DEFAULT_TEMPLATES = {
    "modern_community.json": {
        "name": "现代小区",
        "description": "默认现代小区场景",
        "map": {
            "width": 40,
            "height": 30,
            "roads": [{"x": 0, "y": 14, "width": 40, "height": 2}],
            "water": [],
        },
        "buildings": [
            {"id": "home_1", "type": "home", "name": "晨光公寓", "capacity": 4, "position": [4, 8]},
            {"id": "home_2", "type": "home", "name": "枫叶公寓", "capacity": 4, "position": [10, 8]},
            {"id": "home_3", "type": "home", "name": "晴空公寓", "capacity": 4, "position": [16, 8]},
            {"id": "home_4", "type": "home", "name": "春风公寓", "capacity": 4, "position": [22, 8]},
            {"id": "cafe_1", "type": "cafe", "name": "晨曦咖啡馆", "capacity": 6, "position": [28, 8]},
            {"id": "park_1", "type": "park", "name": "中央公园", "capacity": 12, "position": [6, 20]},
            {"id": "shop_1", "type": "shop", "name": "便利店", "capacity": 4, "position": [18, 20]},
            {"id": "school_1", "type": "school", "name": "社区学校", "capacity": 8, "position": [30, 20]},
        ],
        "residents": [
            {"id": "r1", "name": "小明", "personality": "外向热情", "goals": ["结交朋友"], "mood": "happy", "home_id": "home_1", "x": 4, "y": 8},
            {"id": "r2", "name": "小红", "personality": "细腻温柔", "goals": ["经营生活"], "mood": "calm", "home_id": "home_1", "x": 5, "y": 8},
            {"id": "r3", "name": "阿强", "personality": "健谈乐观", "goals": ["扩大人脉"], "mood": "content", "home_id": "home_2", "x": 10, "y": 8},
            {"id": "r4", "name": "阿雅", "personality": "独立果断", "goals": ["提升事业"], "mood": "neutral", "home_id": "home_2", "x": 11, "y": 8},
            {"id": "r5", "name": "安娜", "personality": "好奇活泼", "goals": ["探索小镇"], "mood": "happy", "home_id": "home_3", "x": 16, "y": 8},
            {"id": "r6", "name": "老周", "personality": "沉稳可靠", "goals": ["照顾邻里"], "mood": "calm", "home_id": "home_3", "x": 17, "y": 8},
            {"id": "r7", "name": "林姐", "personality": "善于倾听", "goals": ["帮助别人"], "mood": "content", "home_id": "home_4", "x": 22, "y": 8},
            {"id": "r8", "name": "阿哲", "personality": "理性内敛", "goals": ["观察世界"], "mood": "neutral", "home_id": "home_4", "x": 23, "y": 8},
            {"id": "r9", "name": "可可", "personality": "开朗健谈", "goals": ["组织活动"], "mood": "excited", "home_id": "home_1", "x": 8, "y": 18},
            {"id": "r10", "name": "若雨", "personality": "温和安静", "goals": ["记录日常"], "mood": "calm", "home_id": "home_2", "x": 14, "y": 18},
        ],
        "initial_relationships": [
            {"from_id": "r1", "to_id": "r2", "type": "friendship", "intensity": 0.7, "familiarity": 0.8, "reason": "老同学"},
            {"from_id": "r2", "to_id": "r1", "type": "friendship", "intensity": 0.7, "familiarity": 0.8, "reason": "老同学"},
        ],
    },
    "seaside_village.json": {
        "name": "海边渔村",
        "description": "默认海边渔村场景",
        "map": {
            "width": 40,
            "height": 30,
            "roads": [{"x": 0, "y": 16, "width": 40, "height": 2}],
            "water": [{"x": 0, "y": 0, "width": 40, "height": 6}],
        },
        "buildings": [
            {"id": "home_a", "type": "home", "name": "潮声木屋", "capacity": 3, "position": [4, 10]},
            {"id": "home_b", "type": "home", "name": "灯塔小屋", "capacity": 3, "position": [10, 10]},
            {"id": "home_c", "type": "home", "name": "海风小屋", "capacity": 3, "position": [16, 10]},
            {"id": "dock", "type": "shop", "name": "渔具铺", "capacity": 4, "position": [24, 10]},
            {"id": "cafe_sea", "type": "cafe", "name": "海盐茶馆", "capacity": 4, "position": [30, 10]},
            {"id": "square", "type": "park", "name": "海湾广场", "capacity": 10, "position": [20, 20]},
        ],
        "residents": [
            {"id": "s1", "name": "渔叔", "personality": "爽朗豪迈", "goals": ["出海丰收"], "mood": "content", "home_id": "home_a", "x": 4, "y": 10},
            {"id": "s2", "name": "海琴", "personality": "安静坚韧", "goals": ["守望灯塔"], "mood": "calm", "home_id": "home_a", "x": 5, "y": 10},
            {"id": "s3", "name": "小舟", "personality": "机灵热情", "goals": ["认识新朋友"], "mood": "happy", "home_id": "home_b", "x": 10, "y": 10},
            {"id": "s4", "name": "阿澜", "personality": "细心敏锐", "goals": ["照看村子"], "mood": "neutral", "home_id": "home_b", "x": 11, "y": 10},
            {"id": "s5", "name": "木槿", "personality": "温柔浪漫", "goals": ["写下海边故事"], "mood": "content", "home_id": "home_c", "x": 16, "y": 10},
            {"id": "s6", "name": "阿浪", "personality": "自由洒脱", "goals": ["四处闲逛"], "mood": "excited", "home_id": "home_c", "x": 17, "y": 10},
        ],
    },
}


def ensure_runtime_assets(templates_dir: Path) -> None:
    templates_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in _DEFAULT_TEMPLATES.items():
        file_path = templates_dir / filename
        if file_path.exists():
            continue
        file_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
