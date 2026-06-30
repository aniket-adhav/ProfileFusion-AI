def parse_txt(buf_or_path):
    """Read plain-text resume / notes content."""
    if isinstance(buf_or_path, (bytes, bytearray)):
        return bytes(buf_or_path).decode("utf-8", errors="replace")
    if hasattr(buf_or_path, "read"):
        data = buf_or_path.read()
        if isinstance(data, (bytes, bytearray)):
            return data.decode("utf-8", errors="replace")
        return data
    with open(buf_or_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()
