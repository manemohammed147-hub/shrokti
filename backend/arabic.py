"""أدوات تطبيع النص العربي (لهجات شامية/خليجية/مصرية مكتوبة بالحروف العربية)."""
import re
import unicodedata

_DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]")

_CHAR_MAP = {
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي", "ء": "",
    "ک": "ك", "ی": "ي", "گ": "ك", "ڤ": "ف", "پ": "ب", "چ": "ج", "ژ": "ز",
}
for _i, _d in enumerate("٠١٢٣٤٥٦٧٨٩"):
    _CHAR_MAP[_d] = str(_i)
for _i, _d in enumerate("۰۱۲۳۴۵۶۷۸۹"):
    _CHAR_MAP[_d] = str(_i)
_TRANS = str.maketrans(_CHAR_MAP)


def norm_letters(text: str) -> str:
    """تطبيع الحروف فقط (يحافظ على رموز التعابير النمطية)."""
    t = unicodedata.normalize("NFKC", text or "")
    t = _DIACRITICS.sub("", t)
    return t.translate(_TRANS).lower()


def normalize(text: str) -> str:
    """تطبيع كامل: حروف + علامات ترقيم + تكرار الحروف (كتيررر → كتير)."""
    t = norm_letters(text)
    t = re.sub(r"[^\w\s]|_", " ", t)
    t = re.sub(r"(.)\1{2,}", r"\1", t)
    t = re.sub(r"([اويهرنم])\1\b", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()


_PREFIXES = [
    "وبال", "وال", "بال", "كال", "فال", "لل", "ال", "وب", "ول", "وي", "وت", "وا",
    "بي", "عم", "هال", "ب", "ل", "و", "ف", "ك", "ي", "ت", "ن", "ا", "م", "ع",
]
_SUFFIXES = [
    "هما", "ها", "هم", "هن", "كم", "كن", "نا", "ني", "ون", "ين", "ان", "وا", "ات",
    "ه", "ك", "ي", "و", "ت",
]


def variants(token: str) -> frozenset:
    """كل الأشكال الممكنة للكلمة بعد نزع السوابق واللواحق الشائعة."""
    out = {token}
    frontier = {token}
    for _ in range(2):
        nxt = set()
        for t in frontier:
            for p in _PREFIXES:
                if t.startswith(p) and len(t) - len(p) >= 2:
                    nxt.add(t[len(p):])
        out |= nxt
        frontier = nxt
    for _ in range(2):
        stripped = set()
        for t in out:
            for s in _SUFFIXES:
                if t.endswith(s) and len(t) - len(s) >= 2:
                    stripped.add(t[: -len(s)])
        out |= stripped
    return frozenset(out)


STOPWORDS = frozenset(
    """
    شو ايش اش ماذا ما مين من منو هل هو هي هاد هاي هذا هذه هيك هلا في فيه عن علي الي الى اللي الذي
    او و يا لو اذا بس كمان كتير كثير اكتر قد قدر كان كانت يكون بيكون عنده عندها عندو لك لي
    محمد لارا دايما فعلا شي اشيا اشياء هالشي انو انه انها ان اني تجاه حول بخصوص بالنسبه
    ممكن يعني طيب اوكي انا انت انتي نحن هم هن هما
    """.split()
)


def content_tokens(text: str) -> list:
    return [t for t in normalize(text).split() if t not in STOPWORDS and len(t) > 1 and not t.isdigit()]
