def test_health_is_up(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "UP"}


def test_ready_checks_database(client):
    res = client.get("/ready")
    assert res.status_code == 200
    assert res.json()["status"] == "READY"


def test_ready_returns_503_when_db_is_down(client):
    from sqlalchemy.exc import OperationalError

    from app.db import get_db
    from app.main import app

    class BrokenSession:
        def execute(self, *_args, **_kwargs):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    res = client.get("/ready")
    assert res.status_code == 503
    assert res.json()["status"] == "NOT_READY"


def test_root_reports_service_name(client):
    body = client.get("/").json()
    assert body["service"] == "StockSense API"
    assert body["docs"] == "/docs"


def test_metrics_endpoint_is_prometheus_format(client):
    client.get("/api/items")
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "http_requests_total" in res.text
    assert "stocksense_inventory_changes_total" in res.text
