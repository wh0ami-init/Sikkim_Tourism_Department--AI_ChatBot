"""
Tests for the read-only /api/destinations endpoints.
"""

VALID_CATEGORIES = {"nature", "culture", "adventure", "pilgrimage", "wildlife"}


def test_list_destinations_returns_seeded_data(client):
    resp = client.get("/api/destinations/")
    assert resp.status_code == 200

    body = resp.json()
    assert body["total"] > 0
    assert len(body["destinations"]) == body["total"]
    # Every summary card should have the fields the frontend cards rely on
    first = body["destinations"][0]
    assert {"id", "name", "slug", "category", "district"} <= first.keys()


def test_get_destination_by_id(client):
    resp = client.get("/api/destinations/1")
    assert resp.status_code == 200

    dest = resp.json()
    assert dest["id"] == 1
    assert dest["name"] == "Gangtok"
    assert dest["category"] in VALID_CATEGORIES


def test_get_destination_not_found_returns_404(client):
    resp = client.get("/api/destinations/999999")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Destination not found."


def test_invalid_category_filter_rejected(client):
    resp = client.get("/api/destinations/", params={"category": "not-a-real-category"})
    assert resp.status_code == 400


def test_valid_category_filter_only_returns_that_category(client):
    resp = client.get("/api/destinations/", params={"category": "nature"})
    assert resp.status_code == 200
    for d in resp.json()["destinations"]:
        assert d["category"] == "nature"


def test_categories_endpoint_lists_all_five(client):
    resp = client.get("/api/destinations/categories")
    assert resp.status_code == 200
    assert set(resp.json()["categories"]) == VALID_CATEGORIES


def test_public_advisories_are_a_safe_empty_feed_when_no_records_exist(client):
    response = client.get("/api/destinations/advisories")
    assert response.status_code == 200
    assert response.json() == []


def test_search_by_name(client):
    resp = client.get("/api/destinations/", params={"search": "Gangtok"})
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()["destinations"]]
    assert any("Gangtok" in n for n in names)
