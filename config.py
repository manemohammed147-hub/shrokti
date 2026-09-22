"""إعدادات شروكتي.

كلمات السر لا تُخزَّن كنص صريح: تُحفظ كبصمات PBKDF2 مملّحة ويتم التحقق منها في الخادم فقط.
لتغييرها استعمل:  python tools/make_password_hash.py
ثم ضع الناتج في متغيّر البيئة المناسب أو مكان القيمة الافتراضية أدناه.
"""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


class Config:
    BASE_DIR = BASE_DIR
    DB_PATH = _env_path("SHROKTI_DB", BASE_DIR / "database" / "shrokti.db")
    ASSETS_DIR = BASE_DIR / "assets"
    UPLOAD_DIR = _env_path("SHROKTI_UPLOADS", BASE_DIR / "uploads")
    KNOWLEDGE_PATH = BASE_DIR / "data" / "muhammad" / "muhammad.json"
    PRIVATE_DIR = BASE_DIR / "private"

    # بصمات كلمات السر (PBKDF2-HMAC-SHA256)
    LOCK_PASSWORD_HASH = os.environ.get(
        "SHROKTI_LOCK_HASH",
        "pbkdf2_sha256$210000$7c8b25aeff18919129f0da209c9caa44$"
        "04ad861abaee434db38c44965aa7465bcbc0007d226582a34c2e8c35aa655bd0",
    )
    HIDDEN_PASSWORD_HASH = os.environ.get(
        "SHROKTI_HIDDEN_HASH",
        "pbkdf2_sha256$210000$4245d899ce6dddbf921a457fbf1af28a$"
        "42337b240d87e165aac6b7b0df9e7d8f963afb0ffbf7621c7ce4348420397cf4",
    )

    # الجلسة
    SESSION_COOKIE_NAME = "shrokti_session"
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SHROKTI_HTTPS", "0") == "1"
    HIDDEN_SESSION_SECONDS = 30 * 60

    # الحماية من التخمين
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_SECONDS = 60

    # الرفع
    MAX_CONTENT_LENGTH = 24 * 1024 * 1024
    MAX_IMAGE_BYTES = 12 * 1024 * 1024
    MAX_AUDIO_BYTES = 12 * 1024 * 1024
    MAX_MEMORY_CHARS = 4000
    MAX_MESSAGE_CHARS = 1500
    MAX_AI_CHARS = 400

    JSON_AS_ASCII = False


def load_secret_key(db_dir: Path) -> str:
    """مفتاح توقيع الجلسات: من البيئة أو يُولَّد مرة واحدة ويُحفظ محليًا."""
    env = os.environ.get("SHROKTI_SECRET_KEY")
    if env:
        return env
    db_dir.mkdir(parents=True, exist_ok=True)
    key_file = db_dir / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key
