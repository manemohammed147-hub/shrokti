"""محرّك محمد AI.

لا يعتمد على أسئلة محفوظة حرفيًا: يطبّع النص العربي، يستخرج الكلمات مع نزع السوابق واللواحق،
يقيّم المواضيع في قاعدة المعرفة، ثم يركّب الجواب من الحقائق المتوفرة فقط.
ما لا يعرفه يُقال بصراحة ويُسجَّل كسؤال بلا جواب (يتولّى ذلك مسار الـ API).
"""
import random
import re
from datetime import date

from .arabic import normalize, variants, STOPWORDS
from .ai_knowledge import Knowledge, Fact, Topic

WH = frozenset(
    "شو ايش اش ماذا مين منو وين اين ليش لماذا ليه كيف كم قديش امتي متي ايمتي شنو شنوه شلون".split()
)
WHY = frozenset("ليش لماذا ليه".split())
NEG = frozenset("ما مش مو لا ليس لم لن بلا مب".split())
LARA_WORDS = frozenset({"لارا", "لاره", "لولي", "شروكتي"})
NICK_WORDS = LARA_WORDS | {"حمودي"}
ME_TOKENS = frozenset("انا عني معي فيني تجاهي بالي مني عندي اسمي عمري طولي وزني شكلي بلدي اهلي عيلتي حياتي".split())
LIKE_KEYS = frozenset({"حب", "عشق", "هوي"})
DISLIKE_KEYS = frozenset({"كره", "بغض"})
MORE_WORDS = frozenset({"كمان", "اكتر", "زياده", "غير", "تاني", "كمل"})
GENERIC_OBJ = frozenset("هيك شي اشيا كتير دايما بجد الناس حدا احد كل اي شيء حاجه هالحكي".split())
TIME_WORDS = frozenset(
    "اليوم مبارح امبارح البارح البارحه امس هلا هلق هلكيت حاليا الان بكرا بكره غدا الليله الصبح الظهر المسا الساعه الاسبوع هالاسبوع هالفتره".split()
)
LOCATION_CUES = frozenset("كان كانت بيكون يكون موجود ساكن بيسكن يسكن راح يروح رايح عايش محمد هو حاليا".split())

RE_GREETING = re.compile(r"^(مرحبا|مرحبتين|اهلا|اهلين|هلا|هلو|هاي|هالو|سلام|السلام عليكم|صباح الخير|مساء الخير|يسعد صباحك|يسعد مساك|هلا والله|اهلا وسهلا|هاي محمد)( \w+){0,2}$")
RE_HOW = re.compile(r"(كيفك|كيف حالك|كيف الحال|شلونك|اخبارك|شو اخبارك|شو الاخبار|كيف صحتك|شو عامل|كيفكم)")
RE_THANKS = re.compile(r"^(شكرا|شكرا كتير|شكرا لك|يسلمو|يسلموا|مشكور|تسلم|ممنون|thanks|thank you|thx)( \w+){0,2}$")
RE_BYE = re.compile(r"^(باي|مع السلامه|تصبح علي خير|تصبحين علي خير|الي اللقاء|بشوفك|يلا باي|سلام بعدين|تصبحو علي خير)( \w+){0,2}$")
RE_WHO = re.compile(r"(^|\s)(مين انت|من انت|انت مين|شو انت|انت شو|شو اسمك|ما اسمك|عرفني عن نفسك|انت ذكاء|انت روبوت|انت بوت|انت محمد)( |$)")
RE_CAPS = re.compile(r"^(شو|ايش|ماذا) (بتعرف|تعرف|بتقدر|تقدر|بتعمل|تعمل|فيك|فيني اسالك)( بقا| كمان| اصلا)?$|^(ساعدني|مساعده|help|كيف بستخدمك|كيف استخدمك)$")
RE_HISTORY = re.compile(r"(شو|ايش|ماذا) (سالتك|سالتني|حكينا|تكلمنا|قلت لك|كنا نحكي|كنت اسال)|اخر (سوال|شي سالت)|(تتذكر|بتذكر|بتتذكر|تذكر) (شو|ايش|ماذا|اسالتي|سوالي)|ذكرني (شو|ب)|سالتك قبل")


def join_list(items):
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return "، ".join(items[:-1]) + " و" + items[-1]


def end_sentence(s: str) -> str:
    s = s.strip()
    if not s:
        return s
    if s[-1] in ".!؟?…:" or not ("\u0600" <= s[-1] <= "\u06ff"):
        return s
    return s + "."


def strip_waw(s: str) -> str:
    if len(s) > 3 and s[0] == "و" and s[1] != " " and s[1] not in "اعف":
        return s[1:]
    return s


def age_on(birth: dict, today: date):
    """العمر بتفسيرَي (يوم/شهر) و(شهر/يوم). يعيد (العمر, هل التفسيران متطابقان)."""
    y = birth["year"]
    a, b = birth["day"], birth["month"]

    def calc(month, day):
        try:
            return today.year - y - ((today.month, today.day) < (month, day))
        except ValueError:
            return None

    first = calc(b, a)
    second = calc(a, b) if a <= 12 else first
    return first, first == second


class Ctx:
    """سياق سؤال واحد."""

    def __init__(self, raw: str, asker: str, ai: "MuhammadAI"):
        self.raw = raw.strip()
        self.asker = asker
        self.lara = asker == "lara"
        n = normalize(self.raw)
        n = re.sub(r"\bكره (ال)?قدم\b", "فوتبول", n)  # لا نخلط «كرة القدم» مع «كره»
        self.norm = n
        self.toks = n.split()
        self.vars = [variants(t) for t in self.toks]
        self.allvars = frozenset().union(*self.vars) if self.vars else frozenset()
        self.is_question = ("؟" in raw) or ("?" in raw)
        first3 = self.toks[:3]
        self.has_wh = any(t in WH for t in self.toks)
        self.is_yesno = bool(self.toks) and (self.toks[0] == "هل" or not self.has_wh)
        self.is_why = any(t in WHY for t in self.toks) or "سبب" in self.toks
        self.lara_mention = any(v & LARA_WORDS for v in self.vars)
        me = any(t in ME_TOKENS for t in self.toks) or any(
            len(t) >= 5 and t.endswith("ني") and t[0] in "بيت" for t in self.toks
        )
        self.lara_ref = self.lara_mention or (self.lara and me)
        self.qpol = self._polarity()

    def _polarity(self):
        like = dislike = False
        for i, v in enumerate(self.vars):
            neg = i > 0 and self.toks[i - 1] in NEG
            if v & DISLIKE_KEYS:
                dislike = True
            elif v & LIKE_KEYS:
                if neg:
                    dislike = True
                else:
                    like = True
        if dislike:
            return "dislike"
        return "like" if like else None

    def flag(self, name: str) -> bool:
        return {
            "yesno": self.is_yesno and not self.has_wh,
            "wh": self.has_wh,
            "lara": self.lara_ref,
            "why": self.is_why,
        }.get(name, False)


class MuhammadAI:
    def __init__(self, knowledge_path):
        self.kb = Knowledge(knowledge_path)
        self.rng = random.Random()

    # ------------------------------------------------------------------ utils
    def pick(self, options, default=""):
        return self.rng.choice(options) if options else default

    def _style(self, key):
        return self.kb.data.get("style", {}).get(key, [])

    def _addr(self, ctx):
        return "لارا" if ctx.lara else "محمد"

    def _person_name(self):
        return self.kb.data.get("person", {}).get("name", "محمد")

    # ---------------------------------------------------------------- render
    def _fact_ok(self, f: Fact, ctx: Ctx, allow_gated=True):
        if f.requires_terms and not (f.requires_terms & ctx.allvars):
            return False
        return True

    def _sentence(self, f: Fact, ctx: Ctx, today: date):
        s = f.sentence_lara if (ctx.lara and f.sentence_lara) else f.sentence
        if f.dynamic == "birth":
            birth = self.kb.data.get("person", {}).get("birth")
            if birth:
                age, sure = age_on(birth, today)
                if age is not None and age >= 0:
                    approx = "" if sure else "حوالي "
                    s = f"تاريخ ميلاده {birth['raw']} 🎂 وعمره {approx}{age} سنة"
        return s

    def _render_facts(self, topic: Topic, ctx: Ctx, today, only=None, mode=None, kind=None,
                      lead=None, intro=None, limit=None, general=False, used=None):
        facts = [f for f in topic.facts if self._fact_ok(f, ctx)]
        if only:
            facts = [f for f in facts if f.id in only]
        else:
            facts = [f for f in facts if f.kind != "detail"]
        if kind:
            facts = [f for f in facts if f.kind == kind]
        if general and topic.max_general:
            statements = [f for f in facts if f.kind != "item"]
            keep = {f.id for f in statements[: topic.max_general]}
            facts = [f for f in facts if f.kind == "item" or f.id in keep]
        if limit:
            facts = facts[:limit]
        if not facts:
            return ""
        if used is not None:
            used.extend(f.id for f in facts)

        name = self._person_name()
        if mode == "list":
            head = (lead if lead is not None else (intro if intro is not None else self.pick(topic.intro)))
            body = join_list([f.text for f in facts])
            return end_sentence((head or "").replace("{name}", name) + body)
        if mode == "sentences":
            return " ".join(end_sentence(self._sentence(f, ctx, today)) for f in facts)

        # الافتراضي: العناصر كقائمة بعد المقدمة، ثم الجمل المستقلة
        items = [f for f in facts if f.kind == "item"]
        others = [f for f in facts if f.kind != "item"]
        parts = []
        if items:
            head = intro if intro is not None else self.pick(topic.intro)
            parts.append(end_sentence(f"{head} {join_list([f.text for f in items])}".strip()))
        for f in others:
            parts.append(end_sentence(self._sentence(f, ctx, today)))
        if parts and not items and parts[0].startswith("بس "):
            parts[0] = parts[0][3:]
        return " ".join(parts)

    def render_topic(self, topic: Topic, ctx: Ctx, today, used, general=True, depth=0):
        if topic.compose and depth == 0:
            chunks = []
            for part in topic.compose:
                if part.get("if_asker") and part["if_asker"] != ctx.asker:
                    continue
                tgt = self.kb.topic_by_id.get(part["topic"])
                if not tgt:
                    continue
                text = self._render_facts(
                    tgt, ctx, today,
                    only=part.get("only"), mode=part.get("mode"), kind=part.get("kind"),
                    lead=part.get("lead"), intro=part.get("intro"), limit=part.get("limit"),
                    general=True, used=used,
                )
                if text:
                    chunks.append(text)
            return " ".join(chunks)
        return self._render_facts(topic, ctx, today, general=general, used=used)

    # --------------------------------------------------------------- scoring
    def score_topics(self, ctx: Ctx):
        scored = []
        pos_fact_hit = any(
            f.polarity == "pos" and (f.keys & ctx.allvars)
            for t in self.kb.topics for f in t.facts
        )
        for t in self.kb.topics:
            if t.requires == "lara" and not ctx.lara_ref:
                continue
            score = 0.0
            seen = set()
            for k in t.keys:
                if k in ctx.allvars:
                    score += 2
                    seen.add(k)
            spec = []
            for f in t.facts:
                hits = [k for k in f.keys if k in ctx.allvars]
                if hits:
                    spec.append(f)
                    for k in hits:
                        if k not in seen:
                            score += 2
                            seen.add(k)
                if f.opposites & ctx.allvars:
                    if f not in spec:
                        spec.append(f)
                    score += 2
            for rx, weight, when in t.phrases:
                if when and not all(ctx.flag(w) for w in when):
                    continue
                if rx.search(ctx.norm):
                    score += weight
            if score <= 0:
                continue
            if ctx.qpol == "dislike":
                if t.id == "likes":
                    score = 0
                elif t.polarity == "neg":
                    if pos_fact_hit and not any(f.polarity == "neg" and f in spec for f in t.facts):
                        score = 0
                    else:
                        score += 6
            if ctx.lara_ref and t.muhammad_only:
                score *= 0.4
            if t.requires == "lara":
                score += 2
            if score >= 2:
                scored.append((score, t, spec))
        scored.sort(key=lambda x: -x[0])
        return scored

    # ---------------------------------------------------------------- traps
    def find_trap(self, ctx: Ctx, selected_ids):
        for tr in self.kb.traps:
            if tr.requires == "lara" and not ctx.lara_ref:
                continue
            if tr.requires == "lara_only" and not ctx.lara_ref:
                continue
            if tr.requires == "nickname" and not any(v & NICK_WORDS for v in ctx.vars):
                continue
            if tr.with_topic and tr.with_topic not in selected_ids:
                continue
            hits = tr.words & ctx.allvars
            phr = tr.phrase.search(ctx.norm) if tr.phrase else None
            if not hits and not phr:
                continue
            if hits and not phr and not tr.requires and hits <= self.kb.fact_vocab:
                continue  # المعلومة موجودة فعلًا في قاعدة المعرفة
            return tr
        return None

    def _time_trap(self, ctx: Ctx):
        if not any(t in TIME_WORDS for t in ctx.toks):
            return None
        now = any(t in ctx.toks for t in ("هلا", "هلق", "هلكيت", "الان", "حاليا"))
        if "وين" in ctx.toks or "اين" in ctx.toks:
            return "وين هو هلأ" if now else "وين كان بهالوقت"
        if now and any(t in ctx.toks for t in ("شو", "ايش", "ماذا", "شنو")):
            return "شو عم يعمل هلأ"
        return "هالشي بهالوقت"

    def _location_trap(self, ctx: Ctx):
        if not ({"وين", "اين"} & set(ctx.toks)):
            return False
        if re.search(r"(^|\s)(من وين|منين|من اين)", ctx.norm):
            return False
        return bool(LOCATION_CUES & set(ctx.toks))

    def _unknown_object(self, ctx: Ctx):
        """مثال: «هل محمد بيحب السباحة؟» والسباحة غير موجودة في المعرفة."""
        if ctx.qpol is None or not ctx.is_yesno or ctx.has_wh:
            return None
        raw_words = re.findall(r"\w+", ctx.raw)
        aligned = len(raw_words) == len(ctx.toks)
        for i, t in enumerate(ctx.toks):
            if t in STOPWORDS or t in WH or t in NEG or t in GENERIC_OBJ or (ctx.vars[i] & NICK_WORDS):
                continue
            if len(t) < 2 or t.isdigit():
                continue
            v = ctx.vars[i]
            if v & LIKE_KEYS or v & DISLIKE_KEYS or v & self.kb.vocab:
                continue
            return raw_words[i] if aligned else t
        return None

    # ---------------------------------------------------------------- output
    def _unknown(self, label):
        return self.pick(self._style("unknown_replies"), "ما بعرف، ما عندي معلومة عن {label}.").replace("{label}", label)

    def _partial_facts(self, tr, ctx, today, used):
        if not tr.partial:
            return ""
        sentences = []
        for fid in tr.partial:
            f = self.kb.fact_by_id.get(fid)
            if not f:
                continue
            if used is not None:
                used.append(f.id)
            sentences.append(f)
        if not sentences:
            return ""
        # نحاول دمج العناصر في جملة واحدة
        texts = []
        for f in sentences:
            base = f.text if f.kind == "item" else strip_waw(self._sentence(f, ctx, today))
            texts.append(base)
        return end_sentence(tr.partial_lead + join_list(texts))

    def _suggestions(self, topics, ctx):
        out = []
        for t in topics:
            for q in t.follow_ups:
                if q not in out and normalize(q) != ctx.norm:
                    out.append(q)
        if len(out) < 3:
            for q in self.kb.data.get("suggestions_default", []):
                if q not in out and normalize(q) != ctx.norm:
                    out.append(q)
        return out[:3]

    def _flair(self, text, topic: Topic):
        if topic.tone == "personal":
            opener = self.pick(self._style("personal_openers"))
            tail = self.pick(self._style("personal_tails"))
        else:
            opener = self.pick(self._style("casual_openers"))
            tail = self.pick(self._style("casual_tails"))
        if opener and not text.startswith(("أيوه", "لأ")):
            text = opener + text
        if text and not ("\u0600" <= text[-1] <= "\u06ff" or text[-1] in ".!؟?"):
            tail = ""
        return text + tail

    def _result(self, text, kind, topics=(), fact_ids=(), suggestions=None, label=None):
        return {
            "text": text,
            "kind": kind,
            "topics": [t.id if hasattr(t, "id") else t for t in topics],
            "fact_ids": list(dict.fromkeys(fact_ids)),
            "suggestions": suggestions if suggestions is not None else [],
            "label": label,
        }

    # ------------------------------------------------------------- specific
    def _answer_specific(self, spec_pairs, ctx, today, used):
        """جواب مركّز على حقائق محددة ذكرها السائل (مع أيوه/لأ للأسئلة المغلقة)."""
        verdicts, sentences = [], []
        for f in spec_pairs[:4]:
            opp = bool(f.opposites & ctx.allvars) and not (f.keys & ctx.allvars)
            if opp:
                verdict = "no_opp"
            elif f.polarity == "neg" and ctx.qpol == "like":
                verdict = "no"
            elif f.polarity == "pos" and ctx.qpol == "dislike":
                verdict = "no_opp"
            else:
                verdict = "yes"
            verdicts.append(verdict)
            sentences.append(strip_waw(self._sentence(f, ctx, today)) if not sentences else self._sentence(f, ctx, today))
            used.append(f.id)
        lead = ""
        if ctx.is_yesno and not ctx.has_wh:
            if all(v == "yes" for v in verdicts):
                lead = "أيوه، "
            elif all(v == "no" for v in verdicts):
                lead = "لأ، "
            elif all(v == "no_opp" for v in verdicts):
                lead = "لأ، بالعكس، "
        text = lead + " ".join(end_sentence(s) for s in sentences)
        return text

    # ---------------------------------------------------------------- main
    def respond(self, question, asker, history=(), learned=(), memories=(), today=None):
        self.kb.reload_if_changed()
        today = today or date.today()
        ctx = Ctx(question[:500], asker, self)
        used: list = []

        if not ctx.toks:
            return self._result(self.pick(self._style("unclear_replies")), "chat", suggestions=self.kb.data.get("suggestions_default", [])[:3])
        if self.kb.error and not self.kb.topics:
            return self._result("بيانات محمد مو متوفرة عندي حاليًا 😕", "chat")

        st = self.kb.data.get("smalltalk", {})
        sugg_default = self.kb.data.get("suggestions_default", [])[:3]
        n = ctx.norm

        # ---- محادثة عامة
        if len(ctx.toks) <= 4 and RE_GREETING.match(n):
            return self._result(self.pick(st.get("greetings")).replace("{addr}", self._addr(ctx)), "chat", suggestions=sugg_default)
        if RE_THANKS.match(n):
            return self._result(self.pick(st.get("thanks")), "chat", suggestions=sugg_default)
        if RE_BYE.match(n):
            return self._result(self.pick(st.get("bye")), "chat")
        if RE_WHO.search(n):
            return self._result(self.pick(st.get("who_are_you")), "chat", suggestions=sugg_default)
        if RE_CAPS.match(n):
            return self._result(self.pick(st.get("capabilities")), "chat", suggestions=sugg_default)
        if RE_HOW.search(n) and len(ctx.toks) <= 5 and "محمد" not in ctx.toks:
            return self._result(self.pick(st.get("how_are_you")), "chat", suggestions=sugg_default)

        # ---- ذاكرة المحادثة
        prev_users = [h["text"] for h in history if h["role"] == "user"]
        if RE_HISTORY.search(n):
            recent = prev_users[-3:][::-1]
            if not recent:
                return self._result(self.pick(st.get("history_empty")), "chat", suggestions=sugg_default)
            lines = "\n".join(f"• {q}" for q in recent)
            return self._result(f"{self.pick(st.get('history_lead'))}\n{lines}", "chat", suggestions=sugg_default)

        # ---- سؤال «كمان/أكتر» يتابع الموضوع السابق
        if len(ctx.toks) <= 4 and any(v & MORE_WORDS for v in ctx.vars):
            last_topics, shown = [], set()
            for h in reversed(history):
                if h["role"] == "assistant" and h.get("meta"):
                    m = h["meta"]
                    if not last_topics and m.get("topics"):
                        last_topics = m["topics"]
                    shown.update(m.get("fact_ids", []))
                    if len(shown) > 60:
                        break
            if last_topics:
                remaining = []
                for tid in last_topics:
                    t = self.kb.topic_by_id.get(tid)
                    if t:
                        remaining += [f for f in t.facts if f.id not in shown and self._fact_ok(f, ctx)]
                if not remaining:
                    return self._result(self.pick(st.get("more_done")), "chat", topics=last_topics, fact_ids=list(shown))
                chunk = remaining[:3]
                text = " ".join(end_sentence(strip_waw(self._sentence(f, ctx, today)) if i == 0 else self._sentence(f, ctx, today)) for i, f in enumerate(chunk))
                return self._result(text, "answer", topics=last_topics, fact_ids=[f.id for f in chunk] + list(shown),
                                    suggestions=self._suggestions([self.kb.topic_by_id[t] for t in last_topics if t in self.kb.topic_by_id], ctx))

        # ---- أجوبة أُضيفت لاحقًا من الغرفة السرّية
        learned_hit = self._match_learned(ctx, learned)
        if learned_hit:
            return self._result(f"حسب المعلومة اللي انضافت عندي: {learned_hit}", "learned", suggestions=sugg_default)

        # ---- تقييم المواضيع
        scored = self.score_topics(ctx)
        selected = []
        spec_facts = []
        if scored:
            best = scored[0][0]
            selected = [(s, t, sp) for (s, t, sp) in scored if s >= max(2, best * 0.55)][:2]
            for _, t, sp in selected:
                for f in sp:
                    if f not in spec_facts:
                        spec_facts.append(f)
        selected_topics = [t for _, t, _ in selected]
        selected_ids = {t.id for t in selected_topics}

        # ---- ذكريات التطبيق كمصدر إضافي عندما لا يوجد موضوع مطابق
        if not selected_topics:
            mem = self._match_memory(ctx, memories)
            if mem:
                return self._result(mem, "memory", suggestions=sugg_default)

        # ---- فخاخ التفاصيل المجهولة
        time_label = self._time_trap(ctx)
        if time_label and not RE_GREETING.match(n):
            return self._result(self._unknown(time_label), "unknown", label=time_label, suggestions=sugg_default)

        trap = self.find_trap(ctx, selected_ids)
        if trap:
            head = self._unknown(trap.label)
            tail = self._partial_facts(trap, ctx, today, used)
            text = f"{head} {tail}".strip()
            return self._result(text, "partial" if tail else "unknown", topics=selected_topics, fact_ids=used,
                                suggestions=self._suggestions(selected_topics, ctx) or sugg_default, label=trap.label)

        if self._location_trap(ctx):
            tail = "بس بعرف إنه سوري ومن حمص."
            label = "وين هو أو وين ساكن هلأ"
            return self._result(f"{self._unknown(label)} {tail}", "partial", label=label, suggestions=sugg_default)

        if "عم" in ctx.toks and ({"شو", "ايش"} & set(ctx.toks)):
            label = "شو عم يعمل هلأ"
            return self._result(self._unknown(label), "unknown", label=label, suggestions=sugg_default)

        unknown_obj = self._unknown_object(ctx)
        if unknown_obj and not (spec_facts and not selected_topics):
            verb = "بيكرهها" if ctx.qpol == "dislike" else "بيحبها"
            label = f"إذا بيحب {unknown_obj}" if ctx.qpol == "like" else f"إذا بيكره {unknown_obj}"
            # إن وُجدت حقيقة معروفة مطابقة نتابع، وإلا نعترف بعدم المعرفة
            if not spec_facts:
                text = f"ما بعرف {label}، ما عندي أي معلومة عن هالشي."
                return self._result(text, "unknown", label=label, suggestions=sugg_default)

        # ---- سؤال «لماذا» عن أمر سببه غير معروف
        if selected_topics and ctx.is_why and not any(t.explains_why for t in selected_topics):
            t = selected_topics[0]
            spec_here = [f for f in spec_facts if f.topic == t.id]
            if spec_here:
                body = " ".join(end_sentence(self._sentence(f, ctx, today)) for f in spec_here[:2])
                used.extend(f.id for f in spec_here[:2])
            else:
                body = self.render_topic(t, ctx, today, used)
            label = "السبب"
            head = self._unknown(label)
            text = f"{head} بس اللي بعرفه: {strip_waw(body)}" if body else head
            return self._result(text, "partial", topics=selected_topics, fact_ids=used, label=label,
                                suggestions=self._suggestions(selected_topics, ctx))

        # ---- جواب مركّز أو عام
        if selected_topics:
            use_spec = [f for f in spec_facts if f.topic in selected_ids and self._fact_ok(f, ctx)]
            direct_only = all(not t.compose for t in selected_topics)
            if use_spec and 1 <= len(use_spec) <= 3 and direct_only and (ctx.is_yesno or len(use_spec) <= 2):
                text = self._answer_specific(use_spec, ctx, today, used)
                if self._repeat(ctx, prev_users):
                    text = self.pick(self._style("repeat_notes")) + text
                return self._result(text, "answer", topics=selected_topics, fact_ids=used,
                                    suggestions=self._suggestions(selected_topics, ctx))
            chunks = []
            for t in selected_topics:
                body = self.render_topic(t, ctx, today, used)
                if body:
                    chunks.append(body)
            text = "\n".join(chunks)
            if text:
                text = self._flair(text, selected_topics[0])
                if self._repeat(ctx, prev_users):
                    text = self.pick(self._style("repeat_notes")) + text
                return self._result(text, "answer", topics=selected_topics, fact_ids=used,
                                    suggestions=self._suggestions(selected_topics, ctx))

        # ---- بحث في ذكريات التطبيق كمصدر إضافي
        mem = self._match_memory(ctx, memories)
        if mem:
            return self._result(mem, "memory", suggestions=sugg_default)

        # ---- ليس سؤالًا واضحًا؟
        if not (ctx.is_question or ctx.has_wh or (ctx.toks and ctx.toks[0] == "هل")) and len(ctx.toks) <= 3:
            return self._result(self.pick(self._style("unclear_replies")), "chat", suggestions=sugg_default)

        label = "هالشي"
        return self._result(self._unknown(label), "unknown", label=label, suggestions=sugg_default)

    # ---------------------------------------------------------------- misc
    def _repeat(self, ctx, prev_users):
        return any(normalize(q) == ctx.norm for q in prev_users)

    @staticmethod
    def _sig(text):
        out = set()
        for t in normalize(text).split():
            if t in STOPWORDS or len(t) < 2 or t.isdigit() or t in WH:
                continue
            out.add(t[2:] if t.startswith("ال") and len(t) > 4 else t)
        return out

    def _match_learned(self, ctx, learned):
        q = self._sig(ctx.raw)
        if len(q) < 2:
            return None
        best, best_score = None, 0.0
        for item in learned:
            s = self._sig(item["question"])
            if len(s) < 2:
                continue
            j = len(q & s) / len(q | s)
            if j > best_score:
                best, best_score = item, j
        if best and best_score >= 0.6:
            return best["answer"]
        return None

    def _match_memory(self, ctx, memories):
        q = self._sig(ctx.raw)
        if len(q) < 2:
            return None
        best, score = None, 0
        for m in memories:
            common = q & self._sig(m["body"])
            if len(common) > score:
                best, score = m, len(common)
        if best and score >= 2:
            snippet = best["body"].strip().replace("\n", " ")
            if len(snippet) > 180:
                snippet = snippet[:180].rstrip() + "…"
            return f"لقيت ذكرى كتبها {best['author']} بتحكي عن هالشي: «{snippet}»"
        return None
