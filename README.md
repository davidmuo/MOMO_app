# MTN MoMo SMS Data Processor & Dashboard

A full-stack web application that parses MTN Mobile Money SMS exports, stores them in a relational database, and visualizes spending patterns through an interactive dashboard.

## Live Demo

**[https://momo-app-k4fo.onrender.com](https://momo-app-k4fo.onrender.com)**

> Note: hosted on Render's free tier — first load after inactivity may take ~30 seconds to spin up.

## Features

- **Bento-grid dashboard** — Mondly-inspired layout with volume chart, transaction stats, top type card, and type breakdown
- **Monthly Volume Chart** — bar chart showing spending across 6 months
- **Transaction Type Breakdown** — ranked list with visual bars per type
- **Date-grouped Recent Transactions** — right panel with green/red credit/debit amounts and type icons
- **Activity Heatmap** — GitHub-style calendar showing transaction density by day
- **Date & type filters** — all charts and stats update in real time
- **CSV Export** — one-click download of filtered results
- **Dark mode** — persisted via localStorage
- **7 passing tests** — full API test coverage with pytest

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Backend | Python, Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Server | Gunicorn |
| Data Source | MTN MoMo XML SMS export |

## Getting Started

```bash
git clone https://github.com/davidmuo/MOMO_app.git
cd MOMO_app
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000. A sample dataset (`data/transactions.xml`) is included so the app runs immediately out of the box.

To use your own data, export MTN MoMo SMS messages as XML using the [SMS Backup & Restore](https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore) Android app and replace `data/transactions.xml`.

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
├── Procfile             # Gunicorn start command for Render
├── render.yaml          # Render deployment config
├── data/
│   └── transactions.xml # Anonymized sample dataset
├── templates/
│   └── index.html       # Dashboard UI
└── static/
    ├── script.js        # Chart.js rendering, heatmap, filters
    ├── styles.css       # Design system, dark mode
    └── logo.png
```

## Demo Video

Watch the demo: https://drive.google.com/file/d/1nuomSYfo3rf3J7jN3VNN_F4cf7hL8fRo/view?usp=sharing
