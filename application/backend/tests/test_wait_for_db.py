from app import wait_for_db
from app.config import settings


def test_wait_for_db_succeeds_on_reachable_db(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path / 'ok.db'}")
    assert wait_for_db.main(attempts=1, delay=0) == 0


def test_wait_for_db_gives_up(monkeypatch, capsys):
    # a postgres URL on a port nothing listens on -> OperationalError every time
    monkeypatch.setattr(
        settings, "database_url", "postgresql+psycopg://u:p@127.0.0.1:1/none?connect_timeout=1"
    )
    assert wait_for_db.main(attempts=2, delay=0) == 1
    assert "giving up" in capsys.readouterr().out
