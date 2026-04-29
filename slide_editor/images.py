"""Image uploads — drag-drop and button uploads land here.

Images are written to <docroot>/images/<timestamp>-<safe-name>.<ext>
and referenced by the editor JS via the relative path returned to the
client.  Self-contained multipart parser (no `cgi` dependency).
"""
import os
import re
from datetime import datetime

ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif", "svg"}
ALLOWED_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]")


def parse_multipart_upload(handler):
    """Minimal multipart/form-data parser. Returns list of parts:
    [{name, filename, content_type, data}, ...]. No external deps."""
    content_type = handler.headers.get("Content-Type", "")
    m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type)
    if not m:
        return []
    boundary = (m.group(1) or m.group(2)).strip()

    length = int(handler.headers.get("Content-Length", 0))
    if length <= 0:
        return []
    body = handler.rfile.read(length)

    delim = b"--" + boundary.encode("utf-8", errors="replace")
    raw_parts = body.split(delim)

    parts = []
    for raw in raw_parts:
        raw = raw.lstrip(b"\r\n")
        if not raw or raw.startswith(b"--"):
            continue
        sep = raw.find(b"\r\n\r\n")
        if sep < 0:
            continue
        headers_raw = raw[:sep].decode("utf-8", errors="replace")
        data = raw[sep + 4:]
        if data.endswith(b"\r\n"):
            data = data[:-2]

        name = ""
        filename = None
        ctype = "application/octet-stream"
        for line in headers_raw.split("\r\n"):
            ll = line.lower()
            if ll.startswith("content-disposition:"):
                cd = line.split(":", 1)[1]
                for piece in cd.split(";"):
                    piece = piece.strip()
                    if piece.startswith("name="):
                        name = piece[5:].strip().strip('"')
                    elif piece.startswith("filename="):
                        filename = piece[9:].strip().strip('"')
            elif ll.startswith("content-type:"):
                ctype = line.split(":", 1)[1].strip()

        parts.append(
            {
                "name": name,
                "filename": filename,
                "content_type": ctype,
                "data": data,
            }
        )
    return parts


def save_image_upload(parts, docroot):
    """Find a file part among `parts`, save to <docroot>/images/.
    Returns (relative_path_or_None, error_or_None)."""
    file_part = None
    for p in parts:
        if p.get("filename"):
            file_part = p
            break
    if not file_part:
        return None, "no file in upload"

    data = file_part["data"] or b""
    if len(data) == 0:
        return None, "empty file"
    if len(data) > MAX_IMAGE_SIZE:
        return None, "file too large (max %dMB)" % (MAX_IMAGE_SIZE // (1024 * 1024))

    filename = file_part["filename"] or "image"
    ext = ""
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        return None, "extension not allowed: %s (allowed: %s)" % (
            ext or "(none)",
            ", ".join(sorted(ALLOWED_IMAGE_EXTS)),
        )

    ctype = (file_part.get("content_type") or "").split(";")[0].strip().lower()
    if ctype and ctype not in ALLOWED_IMAGE_MIMES:
        return None, "content-type not allowed: %s" % ctype

    base = os.path.basename(filename)
    base = SAFE_NAME_RE.sub("_", base)
    if not base or base.startswith("."):
        base = "image." + ext

    ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    final = "%s-%s" % (ts, base)

    images_dir = os.path.join(docroot, "images")
    try:
        os.makedirs(images_dir, exist_ok=True)
    except OSError as e:
        return None, "make images dir: %s" % e

    final_path = os.path.join(images_dir, final)
    real_images = os.path.realpath(images_dir)
    real_final = os.path.realpath(final_path)
    if not real_final.startswith(real_images + os.sep):
        return None, "path traversal blocked"

    try:
        with open(final_path, "wb") as f:
            f.write(data)
    except OSError as e:
        return None, "write file: %s" % e

    return "images/" + final, None
