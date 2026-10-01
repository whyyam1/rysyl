"""Pytest fixtures for the RYSYL API tests."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.app import create_app  # noqa: E402
from api.config import TestConfig  # noqa: E402
from api.extensions import db as _db  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The auth rate limiter is in-memory and would leak across tests."""
    from api.blueprints import auth as auth_mod
    auth_mod._attempts.clear()
    yield
    auth_mod._attempts.clear()


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})
