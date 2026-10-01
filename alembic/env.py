"""Alembic environment — RYSYL.

- The database URL always comes from DATABASE_URL (falls back to the dev
  SQLite file), NOT from alembic.ini — one script set drives dev/staging/prod.
- Async-driver URLs (postgresql+asyncpg://) are rewritten to their sync
  counterpart so `alembic upgrade head` works everywhere.
- target_metadata reflects the RYSYL SQLAlchemy models, so future schema
  changes autogenerate correct migrations (`alembic revision --autogenerate`).
"""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the `api` package importable when alembic runs from the project root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.extensions import db  # noqa: E402
from api import models  # noqa: E402,F401  (registers every table on db.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = db.metadata


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        # Dev default matches api/config.py (relative to project root).
        return "sqlite:///instance/rysyl.db"
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # required for SQLite ALTER support in future revisions
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # required for SQLite ALTER support in future revisions
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
