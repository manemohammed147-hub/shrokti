"""إعدادات لعبة «اضرب محمد» — مصدر الحقيقة الوحيد للمستويات والمكافآت (الخادم يتحقق من النتائج)."""

MAX_LEVEL = 10

SKINS = [
    {"id": "gloves", "name": "قفازات الملاكمة", "emojis": ["🥊", "💥", "⭐"], "unlock_level": 0},
    {"id": "hearts", "name": "قلوب", "emojis": ["💗", "💞", "✨"], "unlock_level": 2},
    {"id": "stars", "name": "نجوم", "emojis": ["🌟", "💫", "⭐"], "unlock_level": 4},
    {"id": "rainbow", "name": "قوس قزح", "emojis": ["🌈", "🎈", "🎉"], "unlock_level": 6},
    {"id": "sweets", "name": "حلويات", "emojis": ["🍭", "🍩", "🧁"], "unlock_level": 8},
]


def build_levels():
    levels = []
    for i in range(1, MAX_LEVEL + 1):
        target = 12 + 5 * i            # 17 .. 62 ضربة
        seconds = 20 + (i // 2) * 2    # 20 .. 30 ثانية
        kind = ("combo", "score", "speed")[i % 3]
        if kind == "combo":
            value, text = 4 + i, f"حقّق كومبو {4 + i} ضربات متتالية"
        elif kind == "score":
            value = target * 14
            text = f"اجمع {value} نقطة"
        else:
            value, text = 35, "أنهِ المستوى وما زال معك 35% من الوقت"
        levels.append({
            "level": i, "target": target, "seconds": seconds,
            "move": 0 if i < 3 else (1 if i < 6 else (2 if i < 8 else 3)),
            "challenge": {"type": kind, "value": value, "text": text},
        })
    return levels


LEVELS = build_levels()


def challenge_done(level_cfg, score, best_combo, time_left):
    ch = level_cfg["challenge"]
    if ch["type"] == "combo":
        return best_combo >= ch["value"]
    if ch["type"] == "score":
        return score >= ch["value"]
    return time_left / level_cfg["seconds"] * 100 >= ch["value"]


def stars_for(level_cfg, won, score, best_combo, time_left):
    if not won:
        return 0
    stars = 1
    if challenge_done(level_cfg, score, best_combo, time_left):
        stars += 1
    if time_left / level_cfg["seconds"] >= 0.3:
        stars += 1
    return stars
