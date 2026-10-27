"""
Project: LoanDesk - Tally Cloud Bridge API (Payout Date Collector)
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Description: Standalone REST API deployable on Render to receive payout dates from the Tally team (no API key required) and store them in Neon DB (PostgreSQL) for loan reconciliation.
"""

import os
import re
import json
import sqlite3
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

try:
    import psycopg2
    import psycopg2.extras
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

app = Flask(__name__)
CORS(app)

# Configuration from Environment Variables
# If Neon DB DATABASE_URL is set, uses Neon PostgreSQL. Otherwise falls back to SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL")
SQLITE_DB_PATH = os.environ.get("SQLITE_DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "tally_payouts.db"))
TALLY_API_KEY = os.environ.get("TALLY_API_KEY", "tally_live_sec_8f92e4a19b0d4c728391")


def verify_auth(req):
    """
    Validates API key from request:
    1. Header: X-API-Key: <key>
    2. Header: Authorization: Bearer <key>
    3. Query param: ?api_key=<key>
    """
    if not TALLY_API_KEY:
        return True # Auth disabled if no key configured

    key = req.headers.get("X-API-Key")
    if not key:
        auth_header = req.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            key = auth_header[7:].strip()
        elif auth_header:
            key = auth_header.strip()
    if not key:
        key = req.args.get("api_key")

    return bool(key and key.strip() == TALLY_API_KEY.strip())


def is_neon_db():
    return bool(DATABASE_URL and PSYCOPG2_AVAILABLE)


def get_db_connection():
    if is_neon_db():
        # Handle Render postgres:// vs postgresql:// prefix
        url = (DATABASE_URL or "").strip()
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if "sslmode=" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}sslmode=require"
        conn = psycopg2.connect(url)
        return conn
    else:
        conn = sqlite3.connect(SQLITE_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def init_db():
    """Initializes tally_payouts table in Neon DB PostgreSQL or SQLite."""
    try:
        if is_neon_db():
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tally_payouts (
                    id SERIAL PRIMARY KEY,
                    loan_id VARCHAR(100) NOT NULL,
                    installment_no INT,
                    payout_date VARCHAR(100) NOT NULL,
                    amount NUMERIC,
                    cheque_no VARCHAR(100),
                    voucher_no VARCHAR(100),
                    bank_name VARCHAR(255),
                    narration TEXT,
                    raw_payload TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    created_at VARCHAR(100),
                    synced_at VARCHAR(100)
                );
                CREATE INDEX IF NOT EXISTS idx_tally_loan_id ON tally_payouts(loan_id);
                CREATE INDEX IF NOT EXISTS idx_tally_status ON tally_payouts(status);
            """)
            conn.commit()
            cur.close()
            conn.close()
            print(">> Connected and verified tally_payouts table on Neon DB PostgreSQL.")
        else:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tally_payouts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    loan_id TEXT NOT NULL,
                    installment_no INTEGER,
                    payout_date TEXT NOT NULL,
                    amount REAL,
                    cheque_no TEXT,
                    voucher_no TEXT,
                    bank_name TEXT,
                    narration TEXT,
                    raw_payload TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at TEXT,
                    synced_at TEXT
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tally_loan_id ON tally_payouts(loan_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_tally_status ON tally_payouts(status);")
            conn.commit()
            conn.close()
            print(">> Using SQLite fallback for tally_payouts.")
    except Exception as e:
        print(f"Warning: Failed to initialize database: {e}")


# Initialize table on startup
init_db()


def normalize_date(raw_date):
    """Converts YYYY-MM-DD or DD/MM/YYYY into standard DD-MM-YYYY format."""
    if not raw_date:
        return ""
    d_str = str(raw_date).strip()
    m_iso = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', d_str)
    if m_iso:
        return f"{m_iso.group(3).zfill(2)}-{m_iso.group(2).zfill(2)}-{m_iso.group(1)}"
    m_dmy = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', d_str)
    if m_dmy:
        return f"{m_dmy.group(1).zfill(2)}-{m_dmy.group(2).zfill(2)}-{m_dmy.group(3)}"
    return d_str


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "LoanDesk Tally Payout Bridge API",
        "description": "Receives payout dates from Tally ERP team (no API key required) and stores in Neon DB.",
        "database": "Neon DB (PostgreSQL)" if is_neon_db() else "SQLite",
        "status": "online",
        "deployed_on": "Render",
        "ingest_endpoint": "POST /api/v1/tally/payouts",
        "health": "/health"
    })


@app.route("/health", methods=["GET"])
def health():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM tally_payouts")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM tally_payouts WHERE status = 'pending'")
        pending = cur.fetchone()[0]
        cur.close()
        conn.close()
        return jsonify({
            "status": "healthy",
            "database_type": "neon_postgres" if is_neon_db() else "sqlite",
            "total_payouts": total,
            "pending_payouts": pending
        })
    except Exception as e:
        return jsonify({
            "status": "degraded",
            "error": str(e)
        }), 500


@app.route("/api/v1/tally/payouts", methods=["POST"])
@app.route("/api/v1/tally/transactions", methods=["POST"])
def ingest_payouts():
    """
    Ingestion endpoint for Tally team.
    Requires header: X-API-Key: <TALLY_API_KEY>
    Accepts single object or batch of payout dates with loan_id.
    """
    if not verify_auth(request):
        return jsonify({
            "success": False,
            "error": "Unauthorized: Invalid or missing API Key. Please provide header 'X-API-Key: <your_api_key>'."
        }), 401

    payload = request.get_json(force=True, silent=True)
    if not payload:
        return jsonify({
            "success": False,
            "error": "Missing or invalid JSON body. Please send Content-Type: application/json."
        }), 400

    raw_items = []
    if isinstance(payload, list):
        raw_items = payload
    elif isinstance(payload, dict):
        if "payouts" in payload and isinstance(payload["payouts"], list):
            raw_items = payload["payouts"]
        elif "transactions" in payload and isinstance(payload["transactions"], list):
            raw_items = payload["transactions"]
        elif "data" in payload and isinstance(payload["data"], list):
            raw_items = payload["data"]
        else:
            raw_items = [payload]

    if not raw_items:
        return jsonify({"success": False, "error": "No payout records found in payload."}), 400

    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    inserted_count = 0
    errors = []

    conn = get_db_connection()
    cur = conn.cursor()

    for idx, item in enumerate(raw_items):
        if not isinstance(item, dict):
            errors.append(f"Item #{idx}: Expected JSON object.")
            continue

        loan_id = (
            item.get("loan_id")
            or item.get("loanId")
            or item.get("loan_ref_id")
            or item.get("loan_no")
            or item.get("id")
        )
        if not loan_id:
            errors.append(f"Item #{idx}: Missing required 'loan_id'.")
            continue

        payout_date = (
            item.get("payout_date")
            or item.get("payoutDate")
            or item.get("payment_date")
            or item.get("paymentDate")
            or item.get("date")
        )
        if not payout_date:
            errors.append(f"Item #{idx} (Loan {loan_id}): Missing required 'payout_date'.")
            continue

        norm_date = normalize_date(payout_date)
        installment_no = item.get("installment_no") or item.get("installmentNumber") or item.get("s_no") or item.get("sNo")
        try:
            installment_no = int(installment_no) if installment_no is not None else None
        except Exception:
            installment_no = None

        amt = item.get("amount") or item.get("payout_amount") or item.get("disbursed_amount")
        try:
            amt = float(amt) if amt is not None else None
        except Exception:
            amt = None

        cheque_no = item.get("cheque_no") or item.get("chequeNo")
        voucher_no = item.get("voucher_no") or item.get("voucherNo")
        bank_name = item.get("bank_name") or item.get("bankName")
        narration = item.get("narration") or item.get("remarks")
        raw_str = json.dumps(item)

        try:
            if is_neon_db():
                cur.execute("""
                    INSERT INTO tally_payouts (
                        loan_id, installment_no, payout_date, amount, cheque_no,
                        voucher_no, bank_name, narration, raw_payload, status, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s)
                """, (
                    str(loan_id).strip(), installment_no, norm_date, amt, cheque_no,
                    voucher_no, bank_name, narration, raw_str, now_str
                ))
            else:
                cur.execute("""
                    INSERT INTO tally_payouts (
                        loan_id, installment_no, payout_date, amount, cheque_no,
                        voucher_no, bank_name, narration, raw_payload, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
                """, (
                    str(loan_id).strip(), installment_no, norm_date, amt, cheque_no,
                    voucher_no, bank_name, narration, raw_str, now_str
                ))
            inserted_count += 1
        except Exception as insert_err:
            errors.append(f"Item #{idx} insert error: {str(insert_err)}")

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Successfully collected and stored {inserted_count} payout record(s) in Neon DB.",
        "received_count": len(raw_items),
        "inserted_count": inserted_count,
        "errors": errors if errors else None
    }), 201 if inserted_count > 0 else 400


@app.route("/api/v1/tally/payouts", methods=["GET"])
@app.route("/api/v1/tally/transactions", methods=["GET"])
def get_payouts():
    """Returns stored payouts (default: pending only). Requires API Key."""
    if not verify_auth(request):
        return jsonify({
            "success": False,
            "error": "Unauthorized: Invalid or missing API Key."
        }), 401

    status_filter = request.args.get("status", "pending")
    limit = min(int(request.args.get("limit", 200)), 500)

    conn = get_db_connection()
    cur = conn.cursor()

    if is_neon_db():
        if status_filter == "all":
            cur.execute("SELECT id, loan_id, installment_no, payout_date, amount, cheque_no, voucher_no, bank_name, narration, status, created_at FROM tally_payouts ORDER BY id ASC LIMIT %s", (limit,))
        else:
            cur.execute("SELECT id, loan_id, installment_no, payout_date, amount, cheque_no, voucher_no, bank_name, narration, status, created_at FROM tally_payouts WHERE status = %s ORDER BY id ASC LIMIT %s", (status_filter, limit))
        rows = cur.fetchall()
        col_names = ["id", "loan_id", "installment_no", "payout_date", "amount", "cheque_no", "voucher_no", "bank_name", "narration", "status", "created_at"]
        results = [dict(zip(col_names, row)) for row in rows]
    else:
        if status_filter == "all":
            cur.execute("SELECT id, loan_id, installment_no, payout_date, amount, cheque_no, voucher_no, bank_name, narration, status, created_at FROM tally_payouts ORDER BY id ASC LIMIT ?", (limit,))
        else:
            cur.execute("SELECT id, loan_id, installment_no, payout_date, amount, cheque_no, voucher_no, bank_name, narration, status, created_at FROM tally_payouts WHERE status = ? ORDER BY id ASC LIMIT ?", (status_filter, limit))
        rows = cur.fetchall()
        results = [dict(r) for r in rows]

    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "count": len(results),
        "payouts": results,
        "transactions": results
    })


@app.route("/api/v1/tally/payouts/mark-collected", methods=["POST"])
@app.route("/api/v1/tally/transactions/mark-collected", methods=["POST"])
def mark_collected():
    """Marks synced records as collected. Requires API Key."""
    if not verify_auth(request):
        return jsonify({
            "success": False,
            "error": "Unauthorized: Invalid or missing API Key."
        }), 401

    payload = request.get_json(force=True, silent=True) or {}
    ids = payload.get("ids", [])
    if not ids:
        return jsonify({"success": False, "error": "No IDs provided"}), 400

    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    conn = get_db_connection()
    cur = conn.cursor()

    if is_neon_db():
        cur.execute("UPDATE tally_payouts SET status = 'synced', synced_at = %s WHERE id = ANY(%s)", (now_str, ids))
    else:
        placeholders = ",".join("?" * len(ids))
        cur.execute(f"UPDATE tally_payouts SET status = 'synced', synced_at = ? WHERE id IN ({placeholders})", [now_str] + ids)

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"success": True, "marked_count": len(ids)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
