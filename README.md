# MTN MoMo SMS Data Processor & Dashboard

A full-stack web application that parses MTN Mobile Money SMS exports, stores them in a relational database, and visualizes spending patterns through an interactive dashboard.

## Features

- **4 Summary Stat Cards** — total transactions, total volume, fees paid, and top transaction type, all filter-aware
- **Transaction Type Chart** — switchable bar/pie chart breaking down spending by category
- **Monthly Spend Trends** — line chart showing volume, count, or fees across months
- **Filterable Tables** — recent and full transaction tables with date-range and type filters
- **CSV Export** — one-click download of filtered results
- **Automated XML Parsing** — reads MTN MoMo SMS backup files and categorizes 10+ transaction types

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Python, Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Data Source | MTN MoMo XML SMS export |

## Getting Started

```bash
git clone https://github.com/davidmuo/MOMO_app.git
cd MOMO_app
pip install -r requirements.txt
python app.py
```

Then open http://localhost:5000 in your browser. A sample dataset (`data/transactions.xml`) is included so the app runs immediately out of the box.

To use your own data, export your MTN MoMo SMS messages as XML using the [SMS Backup & Restore](https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore) Android app and replace `data/transactions.xml`.

## Running Tests

```bash
pip install pytest
pytest test_app.py -v
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FLASK_DEBUG` | `false` | Set to `true` to enable debug mode |

## Project Structure

```
MOMO_app/
├── app.py               # Flask app, DB models, API routes
├── test_app.py          # Pytest test suite
├── requirements.txt
├── data/
│   └── transactions.xml # SMS transaction data (sample included)
├── templates/
│   └── index.html       # Dashboard UI
└── static/
    ├── script.js        # Frontend logic, Chart.js rendering
    ├── styles.css       # Styles
    └── logo.png
```

## Demo

Watch the demo: https://drive.google.com/file/d/1nuomSYfo3rf3J7jN3VNN_F4cf7hL8fRo/view?usp=sharing
