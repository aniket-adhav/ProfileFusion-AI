import json


def parse_ats(buf_or_path):
    """Load an ATS JSON export. Accepts path, bytes, or file-like object."""
    if isinstance(buf_or_path, (bytes, bytearray)):
        return json.loads(buf_or_path.decode("utf-8"))
    if hasattr(buf_or_path, "read"):
        data = buf_or_path.read()
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return json.loads(data)
    with open(buf_or_path, "r", encoding="utf-8") as f:
        return json.load(f)
