"""طبقة قاعدة البيانات (SQLite) مع تهيئة تلقائية وهجرات بسيطة."""
import sqlite3
from datetime import datetime, timezone
from flask import g, current_app

USERS = (("muhammad", "محمد"), ("lara", "لارا"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


MIGRATIONS = [
    (
        1,
        """
        CREATE TABLE users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            key        TEXT NOT NULL UNIQUE,
            name       TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE memories (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id     INTEGER NOT NULL REFERENCES users(id),
            body          TEXT NOT NULL DEFAULT '',
            image_file    TEXT,
            audio_file    TEXT,
            audio_seconds INTEGER,
            created_at    TEXT NOT NULL
        );
        CREATE INDEX idx_memories_order ON memories(created_at DESC, id DESC);

        CREATE TABLE messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id  INTEGER NOT NULL REFERENCES users(id),
            body       TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_messages_order ON messages(id);

        CREATE TABLE ai_messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
            text       TEXT NOT NULL,
            meta       TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_ai_user ON ai_messages(user_id, id);

        CREATE TABLE unanswered_questions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            question      TEXT NOT NULL,
            norm          TEXT NOT NULL,
            asker_id      INTEGER NOT NULL REFERENCES users(id),
            status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered')),
            answer        TEXT,
            times_asked   INTEGER NOT NULL DEFAULT 1,
            created_at    TEXT NOT NULL,
            last_asked_at TEXT NOT NULL,
            answered_at   TEXT,
            answered_by   INTEGER REFERENCES users(id)
        );
        CREATE INDEX idx_unanswered_status ON unanswered_questions(status, last_asked_at DESC);

        CREATE TABLE game_progress (
            user_id         INTEGER PRIMARY KEY REFERENCES users(id),
            max_level       INTEGER NOT NULL DEFAULT 1,
            total_score     INTEGER NOT NULL DEFAULT 0,
            total_hits      INTEGER NOT NULL DEFAULT 0,
            best_score      INTEGER NOT NULL DEFAULT 0,
            best_combo      INTEGER NOT NULL DEFAULT 0,
            plays           INTEGER NOT NULL DEFAULT 0,
            stars_json      TEXT NOT NULL DEFAULT '{}',
            challenges_json TEXT NOT NULL DEFAULT '[]',
            skin            TEXT NOT NULL DEFAULT 'gloves',
            updated_at      TEXT NOT NULL
        );
        """,
    ),
]


def _connect(path):
    conn = sqlite3.connect(str(path), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 8000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = _connect(current_app.config["DB_PATH"])
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db(app):
    """ينشئ الملف والجداول والمستخدمَين تلقائيًا إن لم يكونوا موجودين."""
    path = app.config["DB_PATH"]
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = _connect(path)
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        row = conn.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()
        current = int(row["value"]) if row else 0
        for version, sql in MIGRATIONS:
            if version > current:
                conn.executescript(sql)
                conn.execute(
                    "INSERT INTO schema_meta(key,value) VALUES('version',?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (str(version),),
                )
                conn.commit()
        for key, name in USERS:
            conn.execute(
                "INSERT OR IGNORE INTO users(key,name,created_at) VALUES(?,?,?)",
                (key, name, now_iso()),
            )
        conn.commit()
    finally:
        conn.close()
    app.teardown_appcontext(close_db)


def user_by_key(key: str):
    return get_db().execute("SELECT * FROM users WHERE key=?", (key,)).fetchone()
