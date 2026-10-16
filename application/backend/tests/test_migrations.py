"""Run the real Alembic migrations against a scratch SQLite file, so a broken
migration fails CI before it ever reaches the Postgres in Kubernetes."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_and_downgrade(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrate.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.upgrade(cfg, "head")
    engine = create_engine(url)
    assert "items" in inspect(engine).get_table_names()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM items")).scalar() == 6  # seed rows

    command.downgrade(cfg, "base")
    assert "items" not in inspect(engine).get_table_names()
