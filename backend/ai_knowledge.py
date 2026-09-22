"""تحميل قاعدة معرفة محمد AI من data/muhammad/muhammad.json مع إعادة تحميل تلقائية عند التعديل."""
import json
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path

from .arabic import norm_letters, normalize, STOPWORDS


@dataclass
class Fact:
    id: str
    topic: str
    kind: str                      # item | statement | detail
    text: str
    sentence: str
    sentence_lara: str | None
    polarity: str | None
    keys: frozenset
    opposites: frozenset
    requires_terms: frozenset
    dynamic: str | None = None


@dataclass
class Topic:
    id: str
    title: str
    tone: str
    intro: list
    keys: frozenset
    phrases: list                  # [(compiled_regex, weight, when_flags)]
    facts: list
    compose: list
    follow_ups: list
    requires: str | None = None
    muhammad_only: bool = False
    explains_why: bool = False
    polarity: str | None = None
    max_general: int | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class Trap:
    id: str
    label: str
    words: frozenset
    phrase: object | None
    requires: str | None
    with_topic: str | None
    partial: list
    partial_lead: str


def _keys(words) -> frozenset:
    out = set()
    for w in words or []:
        n = normalize(w)
        if n:
            out.add(n)
    return frozenset(out)


def _auto_keys(text: str) -> frozenset:
    return frozenset(t for t in normalize(text).split() if t not in STOPWORDS and len(t) > 2)


class Knowledge:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._mtime = None
        self._lock = threading.Lock()
        self.data = {}
        self.topics: list[Topic] = []
        self.topic_by_id: dict[str, Topic] = {}
        self.fact_by_id: dict[str, Fact] = {}
        self.traps: list[Trap] = []
        self.vocab = frozenset()
        self.fact_vocab = frozenset()
        self.error = None
        self.reload_if_changed()

    # ------------------------------------------------------------
    def reload_if_changed(self):
        try:
            mtime = self.path.stat().st_mtime
        except OSError:
            self.error = "ملف المعرفة غير موجود"
            return
        with self._lock:
            if mtime == self._mtime:
                return
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self._build(data)
                self._mtime = mtime
                self.error = None
            except (json.JSONDecodeError, KeyError, TypeError, re.error) as exc:
                # نُبقي النسخة السابقة الصالحة إن وُجدت
                self.error = f"خطأ في muhammad.json: {exc}"
                self._mtime = mtime

    # ------------------------------------------------------------
    @staticmethod
    def _compile_phrases(items):
        out = []
        for item in items or []:
            if isinstance(item, str):
                item = {"re": item, "weight": 6}
            rx = re.compile(norm_letters(item["re"]))
            out.append((rx, float(item.get("weight", 6)), tuple(item.get("when", []))))
        return out

    def _build(self, data):
        topics, topic_by_id, fact_by_id = [], {}, {}
        vocab, fact_vocab = set(), set()
        for t in data.get("topics", []):
            facts = []
            for f in t.get("facts", []):
                explicit = f.get("keywords")
                keys = _keys(explicit) if explicit else _auto_keys(f.get("text", "") or f.get("sentence", ""))
                fact = Fact(
                    id=f["id"],
                    topic=t["id"],
                    kind=f.get("kind", "statement"),
                    text=f.get("text") or f.get("sentence", ""),
                    sentence=f.get("sentence") or f.get("text", ""),
                    sentence_lara=f.get("sentence_lara"),
                    polarity=f.get("polarity"),
                    keys=keys,
                    opposites=_keys(f.get("opposites")),
                    requires_terms=_keys(f.get("requires_terms")),
                    dynamic=f.get("dynamic"),
                )
                facts.append(fact)
                fact_by_id[fact.id] = fact
                fact_vocab |= keys
            tkeys = _keys(t.get("keywords"))
            topic = Topic(
                id=t["id"],
                title=t.get("title", t["id"]),
                tone=t.get("tone", "casual"),
                intro=t.get("intro") or [],
                keys=tkeys,
                phrases=self._compile_phrases(t.get("phrases")),
                facts=facts,
                compose=t.get("compose") or [],
                follow_ups=t.get("follow_ups") or [],
                requires=t.get("requires"),
                muhammad_only=bool(t.get("muhammad_only")),
                explains_why=bool(t.get("explains_why")),
                polarity=t.get("polarity"),
                max_general=t.get("max_general"),
                raw=t,
            )
            topics.append(topic)
            topic_by_id[topic.id] = topic
            vocab |= tkeys
        vocab |= fact_vocab

        traps = []
        for tr in data.get("detail_traps", []):
            partial = tr.get("partial") or []
            if isinstance(partial, str):
                partial = [partial]
            traps.append(
                Trap(
                    id=tr["id"],
                    label=tr.get("label", "هالشي"),
                    words=_keys(tr.get("words")),
                    phrase=re.compile(norm_letters(tr["phrase"])) if tr.get("phrase") else None,
                    requires=tr.get("requires"),
                    with_topic=tr.get("with_topic"),
                    partial=partial,
                    partial_lead=tr.get("partial_lead", "بس بعرف إنه "),
                )
            )

        self.data = data
        self.topics, self.topic_by_id, self.fact_by_id = topics, topic_by_id, fact_by_id
        self.traps = traps
        self.vocab, self.fact_vocab = frozenset(vocab), frozenset(fact_vocab)
