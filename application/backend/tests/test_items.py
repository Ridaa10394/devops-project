def test_create_item(client):
    res = client.post(
        "/api/items",
        json={"sku": "elec-9", "name": "HDMI cable", "quantity": 3, "reorder_level": 5, "unit_price": "7.5"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["sku"] == "ELEC-9"  # normalised to upper case
    assert body["stock_status"] == "LOW_STOCK"
    assert body["id"] > 0


def test_create_rejects_duplicate_sku(client, make_item):
    make_item(sku="DUP-1")
    res = client.post("/api/items", json={"sku": "DUP-1", "name": "Again"})
    assert res.status_code == 409


def test_create_validates_payload(client):
    res = client.post("/api/items", json={"sku": "BAD SKU!", "name": "", "quantity": -1})
    assert res.status_code == 422
    fields = {err["loc"][-1] for err in res.json()["detail"]}
    assert {"sku", "name", "quantity"} <= fields


def test_list_and_get_item(client, make_item):
    created = make_item()
    listed = client.get("/api/items").json()
    assert [i["sku"] for i in listed] == ["TEST-001"]
    got = client.get(f"/api/items/{created['id']}")
    assert got.status_code == 200
    assert got.json()["name"] == "Test Widget"


def test_list_filters(client, make_item):
    make_item(sku="A-1", name="Laptop stand", category="Office", quantity=50)
    make_item(sku="B-1", name="Router", category="Networking", quantity=2, reorder_level=5)
    assert [i["sku"] for i in client.get("/api/items?q=router").json()] == ["B-1"]
    assert [i["sku"] for i in client.get("/api/items?category=Office").json()] == ["A-1"]
    assert [i["sku"] for i in client.get("/api/items?low_stock=true").json()] == ["B-1"]


def test_get_missing_item_is_404(client):
    assert client.get("/api/items/9999").status_code == 404


def test_update_item(client, make_item):
    item = make_item()
    res = client.put(f"/api/items/{item['id']}", json={"quantity": 0, "unit_price": "12.00"})
    assert res.status_code == 200
    body = res.json()
    assert body["quantity"] == 0
    assert body["stock_status"] == "OUT_OF_STOCK"
    assert body["name"] == "Test Widget"  # untouched fields stay


def test_update_missing_item_is_404(client):
    assert client.put("/api/items/9999", json={"name": "ghost"}).status_code == 404


def test_adjust_stock(client, make_item):
    item = make_item(quantity=10)
    res = client.post(f"/api/items/{item['id']}/adjust", json={"delta": -4})
    assert res.json()["quantity"] == 6
    res = client.post(f"/api/items/{item['id']}/adjust", json={"delta": 20})
    assert res.json()["quantity"] == 26
    too_much = client.post(f"/api/items/{item['id']}/adjust", json={"delta": -100})
    assert too_much.status_code == 400


def test_delete_item(client, make_item):
    item = make_item()
    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.get(f"/api/items/{item['id']}").status_code == 404
    assert client.delete(f"/api/items/{item['id']}").status_code == 404


def test_stats(client, make_item):
    make_item(sku="S-1", category="Office", quantity=10, reorder_level=2, unit_price="2.50")
    make_item(sku="S-2", category="Office", quantity=1, reorder_level=5, unit_price="100")
    make_item(sku="S-3", category="Tools", quantity=0, unit_price="1")
    stats = client.get("/api/items/stats").json()
    assert stats["total_items"] == 3
    assert stats["total_units"] == 11
    assert stats["low_stock"] == 1
    assert stats["out_of_stock"] == 1
    assert stats["categories"] == 2
    assert float(stats["inventory_value"]) == 125.0
