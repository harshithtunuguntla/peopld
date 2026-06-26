"""Book-a-demo lead capture — POST /demo-requests (public, unauthenticated).

The lead is stored in `demo_requests`; the notification email is best-effort and
skipped in tests (no SMTP configured), so these never touch the network.
"""


def test_create_demo_request_stores_lead(client, db):
    r = client.post(
        "/demo-requests",
        json={
            "name": "  Asha Rao ",
            "email": "asha@example.com",
            "company": "  Acme  ",
            "message": "  ~40 people, founder mixer  ",
        },
    )
    assert r.status_code == 201
    assert r.json() == {"ok": True}

    rows = db.store.get("demo_requests", [])
    assert len(rows) == 1
    lead = rows[0]
    assert lead["name"] == "Asha Rao"          # trimmed
    assert lead["email"] == "asha@example.com"
    assert lead["company"] == "Acme"           # trimmed
    assert lead["message"] == "~40 people, founder mixer"


def test_demo_request_needs_no_auth(client, db):
    # No Authorization header — the marketing form is anonymous.
    r = client.post("/demo-requests", json={"name": "Jo", "email": "jo@x.io"})
    assert r.status_code == 201
    assert len(db.store.get("demo_requests", [])) == 1


def test_optional_fields_blank_to_null(client, db):
    r = client.post(
        "/demo-requests",
        json={"name": "Jo", "email": "jo@x.io", "company": "   ", "message": ""},
    )
    assert r.status_code == 201
    lead = db.store["demo_requests"][0]
    assert lead["company"] is None
    assert lead["message"] is None


def test_invalid_email_rejected(client, db):
    r = client.post("/demo-requests", json={"name": "Jo", "email": "not-an-email"})
    assert r.status_code == 422
    assert db.store.get("demo_requests", []) == []


def test_missing_required_fields_rejected(client, db):
    assert client.post("/demo-requests", json={"email": "jo@x.io"}).status_code == 422
    assert client.post("/demo-requests", json={"name": "Jo"}).status_code == 422
    assert client.post("/demo-requests", json={"name": "  ", "email": "jo@x.io"}).status_code == 422
    assert db.store.get("demo_requests", []) == []
