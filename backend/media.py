"""معالجة آمنة لملفات الصور والصوت المرفوعة مع الذكريات."""
import io
import re
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 40_000_000

FILENAME_RE = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webm|ogg|m4a|wav|mp3)$")
AUDIO_MIME = {
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "m4a": "audio/mp4",
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
}


class MediaError(ValueError):
    """رسالة خطأ عربية مناسبة للعرض للمستخدم."""


def ensure_dirs(upload_dir: Path):
    (upload_dir / "images").mkdir(parents=True, exist_ok=True)
    (upload_dir / "audio").mkdir(parents=True, exist_ok=True)


def _read_limited(storage, limit: int) -> bytes:
    data = storage.stream.read(limit + 1)
    if len(data) > limit:
        raise MediaError("الملف كبير جدًا.")
    return data


def save_image(storage, upload_dir: Path, limit: int) -> str:
    raw = _read_limited(storage, limit)
    if not raw:
        raise MediaError("ملف الصورة فارغ.")
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()
        img = Image.open(io.BytesIO(raw))
        fmt = (img.format or "").upper()
        if fmt not in {"JPEG", "PNG", "WEBP", "GIF", "BMP"}:
            raise MediaError("صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.")
        img = ImageOps.exif_transpose(img)  # يزيل اعتماد الاتجاه على EXIF
        img.thumbnail((1600, 1600))
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        name = uuid.uuid4().hex
        if has_alpha:
            out_name, out = f"{name}.png", img.convert("RGBA")
            out.save(upload_dir / "images" / out_name, "PNG", optimize=True)
        else:
            out_name, out = f"{name}.jpg", img.convert("RGB")
            out.save(upload_dir / "images" / out_name, "JPEG", quality=86, optimize=True, progressive=True)
        return out_name
    except MediaError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise MediaError("تعذّرت قراءة الصورة. تأكد أنها ملف صورة سليم.")


def _sniff_audio(b: bytes):
    if b[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    if b[:4] == b"OggS":
        return "ogg"
    if b[4:8] == b"ftyp":
        return "m4a"
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return "wav"
    if b[:3] == b"ID3" or (len(b) > 2 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0):
        return "mp3"
    return None


def save_audio(storage, upload_dir: Path, limit: int) -> str:
    raw = _read_limited(storage, limit)
    if len(raw) < 64:
        raise MediaError("التسجيل الصوتي فارغ.")
    ext = _sniff_audio(raw)
    if not ext:
        raise MediaError("صيغة الصوت غير مدعومة.")
    name = f"{uuid.uuid4().hex}.{ext}"
    (upload_dir / "audio" / name).write_bytes(raw)
    return name


def remove_quietly(upload_dir: Path, kind: str, name: str | None):
    if not name or not FILENAME_RE.match(name):
        return
    try:
        (upload_dir / kind / name).unlink(missing_ok=True)
    except OSError:
        pass
