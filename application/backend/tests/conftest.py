"""Test fixtures.

The tests never touch the real (production) database. By default they run on an
in-memory SQLite database; set TEST_DATABASE_URL to point them at a throwaway
Postgres instead (CI does this with a postgres service container).
"""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite://")

if TEST_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
else:
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def make_item(client):
    def _make(**overrides):
        payload = {
            "sku": "TEST-001",
            "name": "Test Widget",
            "category": "Testing",
            "quantity": 25,
            "reorder_level": 5,
            "unit_price": "9.99",
            "supplier": "Acme",
        }
        payload.update(overrides)
        res = client.post("/api/items", json=payload)
        assert res.status_code == 201, res.text
        return res.json()

    return _make
