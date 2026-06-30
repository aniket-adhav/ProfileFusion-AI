import fitz  # PyMuPDF


def parse_pdf(buf_or_path):
    """Extract concatenated text from a resume PDF."""
    if isinstance(buf_or_path, (bytes, bytearray)):
        doc = fitz.open(stream=bytes(buf_or_path), filetype="pdf")
    elif hasattr(buf_or_path, "read"):
        doc = fitz.open(stream=buf_or_path.read(), filetype="pdf")
    else:
        doc = fitz.open(buf_or_path)
    try:
        return "\n".join(page.get_text("text") for page in doc)
    finally:
        doc.close()
