"""الأمان: التحقق من كلمات السر، الحدّ من التخمين، وحراسة الجلسات."""
import hashlib
import hmac
import threading
import time
from functools import wraps
from urllib.parse import urlparse

from flask import current_app, jsonify, request, session

VALID_WHO = ("muhammad", "lara")


def make_hash(password: str, iterations: int = 210000) -> str:
    import secrets

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iters, salt, expected = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters)).hex()
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# ---------- الحدّ من محاولات التخمين ----------
_lock = threading.Lock()
_failures: dict[tuple, list] = {}


def _client_key(kind: str):
    return (kind, request.remote_addr or "?")


def lockout_remaining(kind: str) -> int:
    cfg = current_app.config
    with _lock:
        entry = _failures.get(_client_key(kind))
        if not entry:
            return 0
        count, until = entry
        if until and until > time.time():
            return int(until - time.time()) + 1
        if until and until <= time.time():
            _failures.pop(_client_key(kind), None)
        return 0


def register_failure(kind: str):
    cfg = current_app.config
    with _lock:
        key = _client_key(kind)
        count, until = _failures.get(key, [0, 0])
        count += 1
        if count >= cfg["MAX_FAILED_ATTEMPTS"]:
            _failures[key] = [0, time.time() + cfg["LOCKOUT_SECONDS"]]
        else:
            _failures[key] = [count, 0]


def register_success(kind: str):
    with _lock:
        _failures.pop(_client_key(kind), None)


def reset_limits():  # للاختبارات
    with _lock:
        _failures.clear()


# ---------- حراس الجلسة ----------
def _deny(message: str, status: int):
    return jsonify({"error": message}), status


def require_unlocked(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("u"):
            return _deny("التطبيق مقفل. أدخل الرمز أولًا.", 401)
        return fn(*args, **kwargs)

    return wrapper


def require_identity(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("u"):
            return _deny("التطبيق مقفل. أدخل الرمز أولًا.", 401)
        if session.get("who") not in VALID_WHO:
            return _deny("اختر من أنت أولًا.", 403)
        return fn(*args, **kwargs)

    return wrapper


def hidden_active() -> bool:
    return bool(session.get("u")) and float(session.get("h", 0) or 0) > time.time()


def require_hidden(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not hidden_active():
            # نفس الاستجابة العامة: لا تلميح لوجود مسار خاص
            return _deny("غير مسموح.", 403)
        if session.get("who") not in VALID_WHO:
            return _deny("غير مسموح.", 403)
        return fn(*args, **kwargs)

    return wrapper


def origin_ok() -> bool:
    """حماية CSRF إضافية: طلبات التعديل يجب أن تأتي من نفس الموقع."""
    origin = request.headers.get("Origin")
    if not origin:
        return True
    return urlparse(origin).netloc == request.host
