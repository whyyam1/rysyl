"""Run the API with `python -m api` from the project root."""
import os

from .app import create_app

app = create_app()

if __name__ == "__main__":
    # RYSYL_PORT (not generic PORT — sandbox environments inject that)
    port = int(os.environ.get("RYSYL_PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="127.0.0.1", port=port, debug=debug)
