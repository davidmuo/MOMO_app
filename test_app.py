import pytest
from app import app, db, parse_xml


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLASK_DEBUG", "false")
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    with app.app_context():
        db.create_all()
        parse_xml()
        yield app.test_client()


def test_index(client):
    res = client.get("/")
    assert res.status_code == 200


def test_dashboard_data(client):
    res = client.get("/api/dashboard-data")
    assert res.status_code == 200
    data = res.get_json()
    assert "totalTransactions" in data
    assert "totalAmount" in data
    assert "totalFees" in data
    assert "topType" in data
    assert "typeDistribution" in data
    assert "recentTransactions" in data
    assert data["totalTransactions"] > 0


def test_monthly_trends(client):
    res = client.get("/api/monthly-trends")
    assert res.status_code == 200
    data = res.get_json()
    assert "months" in data
    assert "amounts" in data
    assert "counts" in data
    assert len(data["months"]) == len(data["amounts"])


def test_all_transactions(client):
    res = client.get("/transactions")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "transaction_id" in data[0]


def test_export_csv(client):
    res = client.get("/api/export-csv")
    assert res.status_code == 200
    assert res.content_type == "text/csv; charset=utf-8"
    lines = res.data.decode().strip().split("\n")
    assert lines[0].startswith("Transaction ID")
    assert len(lines) > 1


def test_date_filter(client):
    res = client.get("/api/dashboard-data?from_date=2024-03-01&to_date=2024-03-31")
    assert res.status_code == 200
    data = res.get_json()
    assert data["totalTransactions"] > 0


def test_type_filter(client):
    res = client.get("/api/dashboard-data?transaction_type=Bank Deposit")
    assert res.status_code == 200
    data = res.get_json()
    for tx in data["recentTransactions"]:
        assert tx["type"] == "Bank Deposit"
