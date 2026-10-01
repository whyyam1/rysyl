"""WSGI entry point — `gunicorn wsgi:app` from the project root.

gunicorn is only needed in deployment; this import is deferred so the
module stays importable on dev machines without the [deploy] extra.
"""
import os


def app():
    from api.app import create_app

    return create_app()


if __name__ == "__main__":
    # Local production-mode smoke: python wsgi.py (dev server, not gunicorn)
    from api.app import create_app

    port = int(os.environ.get("RYSYL_PORT", "5001"))
    create_app().run(host="127.0.0.1", port=port, debug=False)
