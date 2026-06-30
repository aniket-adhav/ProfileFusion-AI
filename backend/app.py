"""Flask REST API exposing the transformation pipeline.

Endpoints:
  GET  /api/health      → liveness probe
  POST /api/transform   → multipart form with optional csv/ats/pdf/txt files
"""
import json
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from backend.services.pipeline import transform


def create_app():
    app = Flask(__name__)
    CORS(app)

    default_config_path = os.path.join(
        os.path.dirname(__file__), "config", "default_projection.json"
    )

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "candidate-data-harmonizer", "version": "1.0.0"})

    @app.post("/api/transform")
    def do_transform():
        files = request.files
        sources = {}
        for key in ("csv", "ats", "pdf", "txt"):
            f = files.get(key)
            if f is not None and f.filename:
                sources[key] = f.read()

        structured = any(k in sources for k in ("csv", "ats"))
        unstructured = any(k in sources for k in ("pdf", "txt"))
        if not (structured and unstructured):
            return jsonify({
                "error": "At least one structured source (CSV or ATS) AND one unstructured source (PDF or TXT) are required."
            }), 400

        # Projection config can be supplied per request; otherwise use default.
        config = None
        raw_cfg = request.form.get("config")
        if raw_cfg:
            try:
                config = json.loads(raw_cfg)
            except json.JSONDecodeError as exc:
                return jsonify({"error": f"Invalid config JSON: {exc}"}), 400
        elif os.path.exists(default_config_path):
            with open(default_config_path, "r", encoding="utf-8") as f:
                config = json.load(f)

        try:
            result = transform(sources, config=config)
        except Exception as exc:  # pragma: no cover - surfaced to client
            app.logger.exception("transform failed")
            return jsonify({"error": str(exc)}), 500

        return jsonify(result)

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=bool(os.environ.get("FLASK_DEBUG")))
