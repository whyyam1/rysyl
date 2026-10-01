"""RYSYL API configuration — everything overridable by env, safe defaults for dev."""
import os

from .settings import PlatformSettings  # noqa: F401  (re-exported for handlers)


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


class Config(PlatformSettings):
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-key")
    # Locked decision (RECAP.md §1): money is integer minor units, never floats.
    MONEY_UNITS = os.environ.get("MONEY_UNITS", "minor")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Postgres when DATABASE_URL is set (staging/prod), SQLite file for dev/tests.
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///rysyl.db")
    CORS_ORIGINS = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:5183,http://localhost:5173").split(",")
        if o.strip()
    ]
    MAX_CONTENT_LENGTH = 1 * 1024 * 1024  # 1 MiB requests are plenty
    RATE_LIMIT_AUTH = _int("RATE_LIMIT_AUTH", 10)  # login/register attempts per window
    RATE_LIMIT_WINDOW_S = _int("RATE_LIMIT_WINDOW_S", 60)


class TestConfig(Config):
    SECRET_KEY = "test-key"
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    TESTING = True
