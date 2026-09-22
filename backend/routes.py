"""مسارات التطبيق (API + الصفحة الرئيسية + الوسائط)."""
import json
import os
import re
import time

from flask import (
    Blueprint, abort, current_app, jsonify, render_template, request, send_from_directory, session,
)

from . import game as game_cfg
from .arabic import normalize
from .db import get_db, now_iso, user_by_key
from .media import AUDIO_MIME, FILENAME_RE, MediaError, remove_quietly, save_audio, save_image
from .security import (
    hidden_active, lockout_remaining, register_failure, register_success, require_hidden,
    require_identity, require_unlocked, verify_password,
)

bp = Blueprint("main", __name__)

# الأصول الثابتة التي أسماؤها ومساراتها محددة من المستخدم (لا تُغيَّر)
FIXED_ASSETS = {
    "louk": "audio/lock-screen/louk.mp3",
    "pack": "audio/app/pack.mp3",
    "lara": "audio/memories/lara.mp3",
    "mohammed": "images/muhammad/game/mohammed.png",
    "mohammedsad": "images/muhammad/sad/mohammedsad.png",
    "we": "images/memories/we.png",
}
PUBLIC_ASSET_PREFIXES = ("audio/lock-screen/", "images/ui/")


def err(message, status=400):
    return jsonify({"error": message}), status


def body_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ------------------------------------------------------------------ pages
@bp.get("/")
def index():
    return render_template("index.html")


# ------------------------------------------------------------------ auth
@bp.get("/api/session")
def api_session():
    who = session.get("who") if session.get("u") else None
    names = {"muhammad": "محمد", "lara": "لارا"}
    return jsonify({"unlocked": bool(session.get("u")), "who": who, "who_name": names.get(who)})


@bp.post("/api/unlock")
def api_unlock():
    wait = lockout_remaining("lock")
    if wait:
        return err(f"محاولات كثيرة. انتظر {wait} ثانية ثم حاول مجددًا.", 429)
    password = str(body_json().get("password", ""))[:64]
    if verify_password(password, current_app.config["LOCK_PASSWORD_HASH"]):
        register_success("lock")
        session.clear()
        session["u"] = True
        return jsonify({"ok": True})
    register_failure("lock")
    return err("الرمز غير صحيح. حاول مرة أخرى.", 401)


@bp.post("/api/identify")
@require_unlocked
def api_identify():
    who = body_json().get("who")
    if who not in ("muhammad", "lara"):
        return err("اختيار غير صالح.")
    session["who"] = who
    return jsonify({"ok": True, "who": who})


@bp.post("/api/restart")
def api_restart():
    """إعادة تشغيل تجربة المستخدم: مسح الجلسة بالكامل (لا يمس الخادم ولا البيانات)."""
    session.clear()
    return jsonify({"ok": True})


# ------------------------------------------------------------------ assets
def _asset_path(rel):
    return current_app.config["ASSETS_DIR"] / rel


@bp.get("/api/assets/status")
def api_assets_status():
    out = {}
    for key, rel in FIXED_ASSETS.items():
        path = _asset_path(rel)
        exists = path.is_file()
        version = int(path.stat().st_mtime) if exists else 0
        out[key] = {"exists": exists, "url": f"/assets/{rel}?v={version}" if exists else None}
    return jsonify(out)


@bp.get("/assets/<path:rel>")
def serve_asset(rel):
    if not rel.startswith(PUBLIC_ASSET_PREFIXES) and not session.get("u"):
        abort(401)
    root = current_app.config["ASSETS_DIR"]
    target = (root / rel).resolve()
    if root.resolve() not in target.parents or not target.is_file() or target.name.startswith("."):
        abort(404)
    resp = send_from_directory(root, rel, conditional=True)
    resp.headers["Cache-Control"] = "private, max-age=3600"
    return resp


@bp.get("/media/<kind>/<name>")
@require_unlocked
def serve_media(kind, name):
    if kind not in ("images", "audio") or not FILENAME_RE.match(name):
        abort(404)
    directory = current_app.config["UPLOAD_DIR"] / kind
    if not (directory / name).is_file():
        abort(404)
    resp = send_from_directory(directory, name, conditional=True)
    if kind == "audio":
        resp.headers["Content-Type"] = AUDIO_MIME.get(name.rsplit(".", 1)[1], "application/octet-stream")
    resp.headers["Cache-Control"] = "private, max-age=86400"
    return resp


# ------------------------------------------------------------------ memories
def serialize_memory(row):
    upload = current_app.config["UPLOAD_DIR"]
    image_url = audio_url = None
    image_missing = audio_missing = False
    if row["image_file"]:
        if (upload / "images" / row["image_file"]).is_file():
            image_url = f"/media/images/{row['image_file']}"
        else:
            image_missing = True
    if row["audio_file"]:
        if (upload / "audio" / row["audio_file"]).is_file():
            audio_url = f"/media/audio/{row['audio_file']}"
        else:
            audio_missing = True
    return {
        "id": row["id"],
        "author": {"key": row["author_key"], "name": row["author_name"]},
        "body": row["body"],
        "image_url": image_url,
        "image_missing": image_missing,
        "audio_url": audio_url,
        "audio_missing": audio_missing,
        "audio_seconds": row["audio_seconds"],
        "created_at": row["created_at"],
    }


MEMORY_SELECT = (
    "SELECT m.*, u.key AS author_key, u.name AS author_name "
    "FROM memories m JOIN users u ON u.id = m.author_id "
)


@bp.get("/api/memories")
@require_unlocked
def api_memories():
    """الذكريات العادية — نفس الجدول الذي تقرأ منه الغرفة المخفية."""
    limit = min(max(request.args.get("limit", 20, type=int), 1), 100)
    before = request.args.get("before_id", type=int)
    db = get_db()
    if before:
        rows = db.execute(MEMORY_SELECT + "WHERE m.id < ? ORDER BY m.id DESC LIMIT ?", (before, limit + 1)).fetchall()
    else:
        rows = db.execute(MEMORY_SELECT + "ORDER BY m.id DESC LIMIT ?", (limit + 1,)).fetchall()
    total = db.execute("SELECT COUNT(*) c FROM memories").fetchone()["c"]
    return jsonify({
        "items": [serialize_memory(r) for r in rows[:limit]],
        "has_more": len(rows) > limit,
        "total": total,
    })


@bp.post("/api/memories")
@require_identity
def api_create_memory():
    cfg = current_app.config
    body = (request.form.get("body") or "").strip()
    image = request.files.get("image")
    audio = request.files.get("audio")
    image = image if image and image.filename else None
    audio = audio if audio and audio.filename else None
    if len(body) > cfg["MAX_MEMORY_CHARS"]:
        return err(f"النص طويل جدًا (الحد {cfg['MAX_MEMORY_CHARS']} حرف).")
    if not body and not image and not audio:
        return err("اكتب شيئًا، أو أضف صورة أو تسجيلًا صوتيًا.")
    seconds = request.form.get("audio_seconds", type=int)
    seconds = seconds if seconds is not None and 0 <= seconds <= 900 else None

    image_name = audio_name = None
    try:
        if image:
            image_name = save_image(image, cfg["UPLOAD_DIR"], cfg["MAX_IMAGE_BYTES"])
        if audio:
            audio_name = save_audio(audio, cfg["UPLOAD_DIR"], cfg["MAX_AUDIO_BYTES"])
    except MediaError as exc:
        remove_quietly(cfg["UPLOAD_DIR"], "images", image_name)
        return err(str(exc))

    user = user_by_key(session["who"])
    db = get_db()
    cur = db.execute(
        "INSERT INTO memories(author_id, body, image_file, audio_file, audio_seconds, created_at) VALUES(?,?,?,?,?,?)",
        (user["id"], body, image_name, audio_name, seconds if audio_name else None, now_iso()),
    )
    db.commit()
    row = db.execute(MEMORY_SELECT + "WHERE m.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize_memory(row)), 201


# ------------------------------------------------------------------ messages
def serialize_message(row):
    return {
        "id": row["id"],
        "sender": {"key": row["sender_key"], "name": row["sender_name"]},
        "body": row["body"],
        "created_at": row["created_at"],
    }


MESSAGE_SELECT = "SELECT m.*, u.key AS sender_key, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id "


@bp.get("/api/messages")
@require_unlocked
def api_messages():
    after = request.args.get("after_id", type=int)
    db = get_db()
    if after:
        rows = db.execute(MESSAGE_SELECT + "WHERE m.id > ? ORDER BY m.id ASC LIMIT 200", (after,)).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM (" + MESSAGE_SELECT + "ORDER BY m.id DESC LIMIT 200) ORDER BY id ASC"
        ).fetchall()
    return jsonify({"items": [serialize_message(r) for r in rows]})


@bp.post("/api/messages")
@require_identity
def api_send_message():
    text = str(body_json().get("body", "")).strip()
    limit = current_app.config["MAX_MESSAGE_CHARS"]
    if not text:
        return err("اكتب رسالتك أولًا.")
    if len(text) > limit:
        return err(f"الرسالة طويلة جدًا (الحد {limit} حرف).")
    user = user_by_key(session["who"])
    db = get_db()
    cur = db.execute("INSERT INTO messages(sender_id, body, created_at) VALUES(?,?,?)", (user["id"], text, now_iso()))
    db.commit()
    row = db.execute(MESSAGE_SELECT + "WHERE m.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize_message(row)), 201


# ------------------------------------------------------------------ Muhammad AI
def _history_for(db, user_id, limit=40):
    rows = db.execute(
        "SELECT id, role, text, meta, created_at FROM ai_messages WHERE user_id=? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    out = []
    for r in reversed(rows):
        try:
            meta = json.loads(r["meta"]) if r["meta"] else None
        except ValueError:
            meta = None
        out.append({"id": r["id"], "role": r["role"], "text": r["text"], "meta": meta, "created_at": r["created_at"]})
    return out


def _log_unanswered(db, user_id, question, ts):
    norm = normalize(question)
    row = db.execute(
        "SELECT id FROM unanswered_questions WHERE norm=? AND asker_id=? AND status='open'", (norm, user_id)
    ).fetchone()
    if row:
        db.execute(
            "UPDATE unanswered_questions SET times_asked = times_asked + 1, last_asked_at=? WHERE id=?", (ts, row["id"])
        )
    else:
        db.execute(
            "INSERT INTO unanswered_questions(question, norm, asker_id, status, created_at, last_asked_at) "
            "VALUES(?,?,?,'open',?,?)",
            (question, norm, user_id, ts, ts),
        )


@bp.get("/api/ai/history")
@require_identity
def api_ai_history():
    user = user_by_key(session["who"])
    items = _history_for(get_db(), user["id"], 60)
    return jsonify({"items": [{"id": i["id"], "role": i["role"], "text": i["text"], "created_at": i["created_at"]} for i in items]})


@bp.post("/api/ai/ask")
@require_identity
def api_ai_ask():
    text = str(body_json().get("message", "")).strip()
    limit = current_app.config["MAX_AI_CHARS"]
    if not text:
        return err("اكتب سؤالك أولًا.")
    if len(text) > limit:
        return err(f"السؤال طويل جدًا (الحد {limit} حرف).")

    db = get_db()
    who = session["who"]
    user = user_by_key(who)
    history = _history_for(db, user["id"], 40)
    learned = [
        {"question": r["question"], "answer": r["answer"]}
        for r in db.execute("SELECT question, answer FROM unanswered_questions WHERE status='answered' AND answer IS NOT NULL")
    ]
    memories = [
        {"author": r["author_name"], "body": r["body"]}
        for r in db.execute(MEMORY_SELECT + "WHERE m.body != '' ORDER BY m.id DESC LIMIT 300")
    ]
    engine = current_app.extensions["muhammad_ai"]
    result = engine.respond(text, who, history=history, learned=learned, memories=memories)

    ts = now_iso()
    db.execute("INSERT INTO ai_messages(user_id, role, text, meta, created_at) VALUES(?,?,?,?,?)", (user["id"], "user", text, None, ts))
    meta = json.dumps({"topics": result["topics"], "fact_ids": result["fact_ids"], "kind": result["kind"]}, ensure_ascii=False)
    cur = db.execute(
        "INSERT INTO ai_messages(user_id, role, text, meta, created_at) VALUES(?,?,?,?,?)",
        (user["id"], "assistant", result["text"], meta, ts),
    )
    if result["kind"] in ("unknown", "partial"):
        _log_unanswered(db, user["id"], text, ts)  # صامت: لا يظهر للمستخدم
    db.commit()
    return jsonify({
        "reply": {"id": cur.lastrowid, "text": result["text"], "suggestions": result["suggestions"], "created_at": ts}
    })


# ------------------------------------------------------------------ game
def _load_progress(db, user_id):
    row = db.execute("SELECT * FROM game_progress WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        db.execute("INSERT INTO game_progress(user_id, updated_at) VALUES(?,?)", (user_id, now_iso()))
        db.commit()
        row = db.execute("SELECT * FROM game_progress WHERE user_id=?", (user_id,)).fetchone()
    return row


def _progress_payload(row):
    stars = json.loads(row["stars_json"] or "{}")
    completed = max([int(k) for k, v in stars.items() if v > 0] or [0])
    unlocked = [s["id"] for s in game_cfg.SKINS if completed >= s["unlock_level"]]
    skin = row["skin"] if row["skin"] in unlocked else "gloves"
    return {
        "max_level": row["max_level"], "total_score": row["total_score"], "total_hits": row["total_hits"],
        "best_score": row["best_score"], "best_combo": row["best_combo"], "plays": row["plays"],
        "stars": stars, "challenges": json.loads(row["challenges_json"] or "[]"),
        "completed_level": completed, "unlocked_skins": unlocked, "skin": skin,
    }


@bp.get("/api/game/progress")
@require_identity
def api_game_progress():
    db = get_db()
    row = _load_progress(db, user_by_key(session["who"])["id"])
    return jsonify({"progress": _progress_payload(row), "levels": game_cfg.LEVELS, "skins": game_cfg.SKINS})


@bp.post("/api/game/result")
@require_identity
def api_game_result():
    data = body_json()
    try:
        level = int(data["level"])
        won = bool(data["won"])
        score = int(data["score"])
        hits = int(data["hits"])
        best_combo = int(data["best_combo"])
        time_left = float(data["time_left"])
    except (KeyError, TypeError, ValueError):
        return err("بيانات النتيجة غير صالحة.")
    if not 1 <= level <= game_cfg.MAX_LEVEL:
        return err("مستوى غير صالح.")
    cfg = game_cfg.LEVELS[level - 1]
    db = get_db()
    row = _load_progress(db, user_by_key(session["who"])["id"])
    if level > row["max_level"]:
        return err("هذا المستوى ما زال مقفلًا.", 403)
    # فحص منطقي بسيط ضد القيم المستحيلة
    if not (0 <= hits <= cfg["seconds"] * 20 + 5 and 0 <= score <= hits * 10 * 5 and 0 <= best_combo <= hits
            and 0 <= time_left <= cfg["seconds"]):
        return err("نتيجة غير منطقية.")
    if won and hits < cfg["target"]:
        return err("نتيجة غير منطقية.")

    before = _progress_payload(row)
    stars_before = json.loads(row["stars_json"] or "{}")
    stars = game_cfg.stars_for(cfg, won, score, best_combo, time_left)
    if stars > stars_before.get(str(level), 0):
        stars_before[str(level)] = stars
    challenges = set(json.loads(row["challenges_json"] or "[]"))
    done = won and game_cfg.challenge_done(cfg, score, best_combo, time_left)
    if done:
        challenges.add(f"L{level}")
    max_level = row["max_level"]
    if won and level < game_cfg.MAX_LEVEL:
        max_level = max(max_level, level + 1)
    db.execute(
        "UPDATE game_progress SET max_level=?, total_score=total_score+?, total_hits=total_hits+?, "
        "best_score=MAX(best_score,?), best_combo=MAX(best_combo,?), plays=plays+1, stars_json=?, "
        "challenges_json=?, updated_at=? WHERE user_id=?",
        (max_level, score, hits, score, best_combo, json.dumps(stars_before), json.dumps(sorted(challenges)),
         now_iso(), row["user_id"]),
    )
    db.commit()
    after = _progress_payload(_load_progress(db, row["user_id"]))
    new_skins = [s for s in after["unlocked_skins"] if s not in before["unlocked_skins"]]
    return jsonify({"stars": stars, "challenge_done": bool(done), "progress": after, "new_skins": new_skins})


@bp.post("/api/game/skin")
@require_identity
def api_game_skin():
    skin = body_json().get("skin")
    db = get_db()
    row = _load_progress(db, user_by_key(session["who"])["id"])
    if skin not in _progress_payload(row)["unlocked_skins"]:
        return err("هذا الشكل ما زال مقفلًا.", 403)
    db.execute("UPDATE game_progress SET skin=?, updated_at=? WHERE user_id=?", (skin, now_iso(), row["user_id"]))
    db.commit()
    return jsonify({"ok": True, "skin": skin})


# ------------------------------------------------------------------ بوابة الغرفة المخفية
@bp.post("/api/gate/verify")
@require_identity
def api_gate_verify():
    wait = lockout_remaining("gate")
    if wait:
        return err(f"محاولات كثيرة. انتظر {wait} ثانية.", 429)
    password = str(body_json().get("password", ""))[:64]
    if verify_password(password, current_app.config["HIDDEN_PASSWORD_HASH"]):
        register_success("gate")
        session["h"] = time.time() + current_app.config["HIDDEN_SESSION_SECONDS"]
        return jsonify({"ok": True})
    register_failure("gate")
    return err("الرمز غير صحيح.", 401)


@bp.post("/api/hidden/close")
@require_identity
def api_hidden_close():
    session.pop("h", None)
    return jsonify({"ok": True})


@bp.get("/hidden-room.js")
@require_hidden
def hidden_js():
    return send_from_directory(current_app.config["PRIVATE_DIR"], "hidden-room.js", mimetype="text/javascript")


@bp.get("/hidden-room.css")
@require_hidden
def hidden_css():
    return send_from_directory(current_app.config["PRIVATE_DIR"], "hidden-room.css", mimetype="text/css")


@bp.get("/api/hidden/memories")
@require_hidden
def api_hidden_memories():
    """الذكريات نفسها في الجدول نفسه: كل ذكرى جديدة تظهر هنا تلقائيًا (الأقدم أولًا كشريط سينمائي)."""
    rows = get_db().execute(MEMORY_SELECT + "ORDER BY m.created_at ASC, m.id ASC LIMIT 1000").fetchall()
    return jsonify({"items": [serialize_memory(r) for r in rows]})


def _serialize_question(r):
    return {
        "id": r["id"], "question": r["question"], "asker": r["asker_name"], "status": r["status"],
        "answer": r["answer"], "times_asked": r["times_asked"], "created_at": r["created_at"],
        "last_asked_at": r["last_asked_at"], "answered_at": r["answered_at"],
    }


QUESTION_SELECT = "SELECT q.*, u.name AS asker_name FROM unanswered_questions q JOIN users u ON u.id = q.asker_id "


@bp.get("/api/hidden/questions")
@require_hidden
def api_hidden_questions():
    rows = get_db().execute(QUESTION_SELECT + "ORDER BY (q.status='open') DESC, q.last_asked_at DESC LIMIT 300").fetchall()
    return jsonify({"items": [_serialize_question(r) for r in rows]})


@bp.post("/api/hidden/questions/<int:qid>/answer")
@require_hidden
def api_hidden_answer(qid):
    answer = str(body_json().get("answer", "")).strip()
    if not answer:
        return err("اكتب الجواب أولًا.")
    if len(answer) > 1000:
        return err("الجواب طويل جدًا.")
    db = get_db()
    user = user_by_key(session["who"])
    cur = db.execute(
        "UPDATE unanswered_questions SET answer=?, status='answered', answered_at=?, answered_by=? WHERE id=?",
        (answer, now_iso(), user["id"], qid),
    )
    db.commit()
    if cur.rowcount == 0:
        return err("السؤال غير موجود.", 404)
    row = db.execute(QUESTION_SELECT + "WHERE q.id=?", (qid,)).fetchone()
    return jsonify(_serialize_question(row))
