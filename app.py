import os
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'momo_transactions.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- Model ---
class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(50), unique=False)
    date = db.Column(db.DateTime, nullable=False)
    type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    fee = db.Column(db.Integer)
    sender = db.Column(db.String(100))
    recipient = db.Column(db.String(100))

# --- Helpers ---
def extract_type(body):
    body = body.lower()
    if ("bundle" in body or 
        "bundles" in body or 
        "bundles and packs" in body or 
        "data bundle" in body or 
        "umaze kugura" in body):
        return "Internet and Voice Bundle"
    if "deposit" in body: return "Bank Deposit"
    if "cash power" in body: return "Cash Power"
    if "withdrawn" in body: return "Withdrawal from Agent"
    if "airtime" in body: return "Airtime Bill"
    if "payment" in body: return "Payment to Code"
    if "transferred" in body: return "Transfer To Mobile Number"
    if "received" in body: return "Incoming Money"
    if "transaction" in body: return "Transaction Initiated by Third Party"
    if ("one time password" in body or
        "otp" in body or 
        "be vigilant" in body): return "OTP Message"
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
        body = sms.get("body")
        readable_date = sms.get("readable_date")
        try:
            date = datetime.strptime(readable_date, "%d %b %Y %I:%M:%S %p")
        except:
            continue

        # TransactionId extraction
        txn_id_match = re.search(r'TxId[:\s]*([\d]+)', body)
        transaction_id = txn_id_match.group(1).strip() if txn_id_match else "-"

        # amount_match = re.search(r'(\d[\d,]*)\s*RWF', body)
        # amount = int(amount_match.group(1).replace(',', '')) if amount_match else 0
        # To include the one deposit with amount starting with RWF
        amount_match = re.search(r'(?:RWF\s*(\d[\d,]*)|(\d[\d,]*)\s*RWF)', body)
        if amount_match:
            amount_str = amount_match.group(1) or amount_match.group(2)
            amount = int(amount_str.replace(',', ''))
        else:
            amount = 0

        fee_match = re.search(r'Fee\s*(?:was|paid)?\s*:?\s*([\d,]+)\s*RWF', body, re.IGNORECASE)
        fee = int(fee_match.group(1).replace(',', '')) if fee_match and fee_match.group(1).strip() else 0

        sender_match = re.search(r'from\s+(.+?)\s', body, re.IGNORECASE)
        recipient_match = re.search(r'to\s+(.+?)\s', body, re.IGNORECASE)

        tx = Transaction(
            transaction_id=transaction_id,
            date=date,
            type=extract_type(body),
            amount=amount,
            fee=fee,
            sender=sender_match.group(1).strip() if sender_match else "Unknown",
            recipient=recipient_match.group(1).strip() if recipient_match else "Unknown"
        )
        db.session.add(tx)

    db.session.commit()
    print("XML parsed and saved to database.")

# --- Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/dashboard-data')
def dashboard_data():
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    tx_type = request.args.get("transaction_type")

    print("Filters:", from_date, to_date, tx_type)

    query = Transaction.query

    from datetime import datetime, timedelta

    if from_date:
        query = query.filter(Transaction.date >= datetime.strptime(from_date, "%Y-%m-%d"))
    if to_date:
        to_dt = datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
        query = query.filter(Transaction.date < to_dt)

    if tx_type and tx_type.lower() != "all":
        query = query.filter(db.func.lower(Transaction.type) == tx_type.lower())

    transactions = query.order_by(Transaction.date.desc()).all()
    type_dist = {}
    recent = []

    for tx in transactions:
        type_dist[tx.type] = type_dist.get(tx.type, 0) + 1
        recent.append({
            "id": tx.id,
            "transaction_id": tx.transaction_id,
            "recipient": tx.recipient,
            "type": tx.type,
            "amount": tx.amount,
            "date": tx.date.strftime("%Y-%m-%d %H:%M"),
            "fee": tx.fee
            
        })

    return jsonify({
        "totalTransactions": len(transactions),
        "totalAmount": sum(tx.amount for tx in transactions),
        "typeDistribution": type_dist,
        "recentTransactions": recent[:10]
    })

@app.route('/transactions')
def all_transactions():
    transactions = Transaction.query.order_by(Transaction.date.desc()).all()
    result = []
    for tx in transactions:
        result.append({
            "id": tx.id,
            "transaction_id": tx.transaction_id,
            "date": tx.date.strftime("%Y-%m-%d %H:%M"),
            "type": tx.type,
            "amount": tx.amount,
            "fee": tx.fee,
            "sender": tx.sender,
            "recipient": tx.recipient
        })
    return jsonify(result)

# --- Main ---
if __name__ == '__main__':
    with app.app_context():
        parse_xml()
    app.run(debug=True)