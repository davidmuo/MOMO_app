import csv
import io
import os
import re
from datetime import datetime, timedelta

from flask import Flask, Response, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'momo_transactions.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(50))
    date = db.Column(db.DateTime, nullable=False)
    type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    fee = db.Column(db.Integer)
    sender = db.Column(db.String(100))
    recipient = db.Column(db.String(100))


def extract_type(body):
    body = body.lower()
    if any(k in body for k in ("bundle", "bundles", "data bundle", "umaze kugura")):
        return "Internet and Voice Bundle"
    if "deposit" in body: return "Bank Deposit"
    if "cash power" in body: return "Cash Power"
    if "withdrawn" in body: return "Withdrawal from Agent"
    if "airtime" in body: return "Airtime Bill"
    if "payment" in body: return "Payment to Code"
    if "transferred" in body: return "Transfer To Mobile Number"
    if "received" in body: return "Incoming Money"
    if "transaction" in body: return "Transaction Initiated by Third Party"
    if any(k in body for k in ("one time password", "otp", "be vigilant")):
        return "OTP Message"
    return "Other"


def parse_xml():
    xml_path = os.path.join(basedir, "data", "transactions.xml")
    if not os.path.exists(xml_path):
        print("XML file not found.")
        return

    db.drop_all()
    db.create_all()

    tree = ET.parse(xml_path)
    root = tree.getroot()

    for sms in root.findall("sms"):
        body = sms.get("body", "")
        readable_date = sms.get("readable_date", "")
        try:
            date = datetime.strptime(readable_date, "%d %b %Y %I:%M:%S %p")
        except ValueError:
            continue

        txn_id_match = re.search(r'TxId[:\s]*([\d]+)', body)
        transaction_id = txn_id_match.group(1).strip() if txn_id_match else "-"

        amount_match = re.search(r'(?:RWF\s*(\d[\d,]*)|(\d[\d,]*)\s*RWF)', body)
        if amount_match:
            amount_str = amount_match.group(1) or amount_match.group(2)
            amount = int(amount_str.replace(',', ''))
        else:
            amount = 0

        fee_match = re.search(r'Fee\s*(?:was|paid)?\s*:?\s*([\d,]+)\s*RWF', body, re.IGNORECASE)
        fee = int(fee_match.group(1).replace(',', '')) if fee_match else 0

        sender_match = re.search(r'from\s+(.+?)\s', body, re.IGNORECASE)
        recipient_match = re.search(r'to\s+(.+?)\s', body, re.IGNORECASE)

        db.session.add(Transaction(
            transaction_id=transaction_id,
            date=date,
            type=extract_type(body),
            amount=amount,
            fee=fee,
            sender=sender_match.group(1).strip() if sender_match else "Unknown",
            recipient=recipient_match.group(1).strip() if recipient_match else "Unknown",
        ))

    db.session.commit()
    print("XML parsed and saved to database.")


def _apply_filters(query):
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    tx_type = request.args.get("transaction_type")

    if from_date:
        query = query.filter(Transaction.date >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Transaction.date < to_dt)
    if tx_type and tx_type.lower() != "all":
        query = query.filter(db.func.lower(Transaction.type) == tx_type.lower())
    return query


def _month_over_month():
    latest = db.session.query(db.func.max(Transaction.date)).scalar()
    if not latest:
        return {"transactions": None, "amount": None, "fees": None}

    curr_start = latest.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_end = curr_start - timedelta(seconds=1)
    prev_start = prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    curr = Transaction.query.filter(Transaction.date >= curr_start).all()
    prev = Transaction.query.filter(
        Transaction.date >= prev_start,
        Transaction.date < curr_start
    ).all()

    def pct(a, b):
        return round((a - b) / b * 100, 1) if b else None

    return {
        "transactions": pct(len(curr), len(prev)),
        "amount": pct(sum(t.amount for t in curr), sum(t.amount for t in prev)),
        "fees": pct(sum(t.fee or 0 for t in curr), sum(t.fee or 0 for t in prev)),
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/dashboard-data')
def dashboard_data():
    transactions = _apply_filters(Transaction.query).order_by(Transaction.date.desc()).all()

    type_dist = {}
    for tx in transactions:
        type_dist[tx.type] = type_dist.get(tx.type, 0) + 1

    total_amount = sum(tx.amount for tx in transactions)
    total_fees = sum(tx.fee or 0 for tx in transactions)
    top_type = max(type_dist, key=type_dist.get) if type_dist else "N/A"

    recent = [
        {
            "transaction_id": tx.transaction_id,
            "date": tx.date.strftime("%Y-%m-%d %H:%M"),
            "type": tx.type,
            "amount": tx.amount,
            "fee": tx.fee or 0,
        }
        for tx in transactions[:10]
    ]

    return jsonify({
        "totalTransactions": len(transactions),
        "totalAmount": total_amount,
        "totalFees": total_fees,
        "topType": top_type,
        "typeDistribution": type_dist,
        "recentTransactions": recent,
        "trends": _month_over_month(),
    })


@app.route('/api/monthly-trends')
def monthly_trends():
    transactions = _apply_filters(Transaction.query).order_by(Transaction.date).all()

    buckets = {}
    for tx in transactions:
        key = tx.date.strftime("%b %Y")
        if key not in buckets:
            buckets[key] = {"amount": 0, "count": 0, "fees": 0}
        buckets[key]["amount"] += tx.amount
        buckets[key]["count"] += 1
        buckets[key]["fees"] += tx.fee or 0

    months = list(buckets.keys())
    return jsonify({
        "months": months,
        "amounts": [buckets[m]["amount"] for m in months],
        "counts": [buckets[m]["count"] for m in months],
        "fees": [buckets[m]["fees"] for m in months],
    })


@app.route('/api/activity-heatmap')
def activity_heatmap():
    rows = db.session.query(
        db.func.strftime('%Y-%m-%d', Transaction.date).label('day'),
        db.func.count(Transaction.id).label('count')
    ).group_by('day').order_by('day').all()
    return jsonify({row.day: row.count for row in rows})


@app.route('/transactions')
def all_transactions():
    transactions = Transaction.query.order_by(Transaction.date.desc()).all()
    return jsonify([
        {
            "transaction_id": tx.transaction_id,
            "date": tx.date.strftime("%Y-%m-%d %H:%M"),
            "type": tx.type,
            "amount": tx.amount,
            "fee": tx.fee or 0,
        }
        for tx in transactions
    ])


@app.route('/api/export-csv')
def export_csv():
    transactions = _apply_filters(Transaction.query).order_by(Transaction.date.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Transaction ID", "Date", "Type", "Amount (RWF)", "Fee (RWF)"])
    for tx in transactions:
        writer.writerow([
            tx.transaction_id,
            tx.date.strftime("%Y-%m-%d %H:%M"),
            tx.type,
            tx.amount,
            tx.fee or 0,
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=momo_transactions.csv"},
    )


import sys
if 'pytest' not in sys.modules:
    with app.app_context():
        parse_xml()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port,
            debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true')
