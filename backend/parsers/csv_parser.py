import io
import pandas as pd


def parse_csv(buf_or_path):
    """Read a recruiter CSV and return a list of normalized dict rows.

    Accepts a filesystem path, bytes, or a file-like object. Empty cells are
    converted to None so downstream code can treat them uniformly.
    """
    if isinstance(buf_or_path, (bytes, bytearray)):
        df = pd.read_csv(io.BytesIO(buf_or_path))
    elif hasattr(buf_or_path, "read"):
        df = pd.read_csv(buf_or_path)
    else:
        df = pd.read_csv(buf_or_path)

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    rows = df.where(pd.notna(df), None).to_dict(orient="records")
    return rows
