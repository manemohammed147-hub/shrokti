"""شروكتي — نقطة تشغيل التطبيق.

التشغيل:   python app.py
"""
import os

from flask import Flask, jsonify, request

from backend.db import init_db
from backend.media import ensure_dirs
from backend.muhammad_ai import MuhammadAI
from backend.routes import bp
from backend.security import origin_ok
from config import Config, load_secret_key

CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; "
    "media-src 'self' blob:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
)


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)
    app.config["SECRET_KEY"] = load_secret_key(app.config["DB_PATH"].parent)
    app.json.ensure_ascii = False

    # مجلدات تُنشأ تلقائيًا
    for rel in (
        "images/muhammad/game", "images/muhammad/sad", "images/memories", "images/romantic", "images/ui",
        "audio/lock-screen", "audio/app", "audio/memories",
    ):
        (app.config["ASSETS_DIR"] / rel).mkdir(parents=True, exist_ok=True)
    ensure_dirs(app.config["UPLOAD_DIR"])
    init_db(app)
    app.extensions["muhammad_ai"] = MuhammadAI(app.config["KNOWLEDGE_PATH"])
    app.register_blueprint(bp)

    @app.before_request
    def csrf_guard():
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and not origin_ok():
            return jsonify({"error": "طلب مرفوض."}), 403

    @app.after_request
    def security_headers(resp):
        resp.headers["Content-Security-Policy"] = CSP
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "same-origin"
        resp.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
        if request.path.startswith("/api/") or request.path in ("/", "/hidden-room.js", "/hidden-room.css"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.errorhandler(404)
    def not_found(_e):
        if request.path.startswith(("/api/", "/media/", "/assets/")):
            return jsonify({"error": "غير موجود."}), 404
        return jsonify({"error": "الصفحة غير موجودة."}), 404

    @app.errorhandler(401)
    def unauthorized(_e):
        return jsonify({"error": "غير مسموح."}), 401

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify({"error": "الملفات كبيرة جدًا."}), 413

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"error": "حدث خطأ غير متوقع. حاول مرة أخرى."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"\n  شروكتي تعمل على:  http://{'localhost' if host == '127.0.0.1' else host}:{port}\n")
    app.run(host=host, port=port, debug=os.environ.get("SHROKTI_DEBUG") == "1", threaded=True)
