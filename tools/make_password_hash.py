"""يولّد بصمة PBKDF2 لكلمة سر جديدة:  python tools/make_password_hash.py"""
import getpass
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from backend.security import make_hash  # noqa: E402

pw = getpass.getpass("كلمة السر الجديدة: ")
if getpass.getpass("أعد كتابتها: ") != pw or not pw:
    sys.exit("غير متطابقتين أو فارغة.")
print("\nضع هذه القيمة في config.py أو في متغيّر البيئة المناسب:\n")
print(make_hash(pw))
