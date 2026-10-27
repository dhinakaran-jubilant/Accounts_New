"""
Project: LoanDesk - Tally Payout Sync Service
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Description: Service for collecting Tally payout dates, saving into Neon DB (PostgreSQL), and syncing payment_date to loans based on Loan ID.
"""

import os
import re
import json
import urllib.request
import urllib.parse
import ssl
import datetime
from models import db, Loan, RepaymentSchedule, TallyPayout

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tally_config.json')

DEFAULT_CONFIG = {
    "render_api_url": "https://tally-loandesk-bridge.onrender.com",
    "enabled": True,
    "last_sync_time": None,
    "last_sync_status": "IDLE",
    "last_sync_message": None,
    "total_synced_count": 0
}


def load_tally_config(hide_key=True):
    """Loads Tally Bridge configuration from JSON file."""
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=4)
        cfg = DEFAULT_CONFIG.copy()
    else:
        try:
            with open(CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
        except Exception:
            cfg = DEFAULT_CONFIG.copy()

    for k, v in DEFAULT_CONFIG.items():
        if k not in cfg:
            cfg[k] = v

    return cfg


def save_tally_config(data):
    """Saves updated Tally Bridge configuration."""
    cfg = load_tally_config(hide_key=False)
    if "render_api_url" in data:
        cfg["render_api_url"] = str(data["render_api_url"]).rstrip("/").strip()
    if "enabled" in data:
        cfg["enabled"] = bool(data["enabled"])
    if "last_sync_time" in data:
        cfg["last_sync_time"] = data["last_sync_time"]
    if "last_sync_status" in data:
        cfg["last_sync_status"] = data["last_sync_status"]
    if "last_sync_message" in data:
        cfg["last_sync_message"] = data["last_sync_message"]
    if "total_synced_count" in data:
        cfg["total_synced_count"] = data["total_synced_count"]

    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=4)

    return cfg


def create_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def normalize_date_to_ddmmyyyy(raw_date):
    """
    Normalizes dates from various formats (YYYY-MM-DD, DD/MM/YYYY, etc.)
    into LoanDesk standard DD-MM-YYYY format.
    """
    if not raw_date:
        return ""
    d_str = str(raw_date).strip()
    if d_str in ('-', '—', 'None', 'null'):
        return ""

    # Match YYYY-MM-DD or YYYY/MM/DD
    m_iso = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', d_str)
    if m_iso:
        y, m, d = m_iso.group(1), m_iso.group(2).zfill(2), m_iso.group(3).zfill(2)
        return f"{d}-{m}-{y}"

    # Match DD-MM-YYYY or DD/MM/YYYY
    m_dmy = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', d_str)
    if m_dmy:
        d, m, y = m_dmy.group(1).zfill(2), m_dmy.group(2).zfill(2), m_dmy.group(3)
        return f"{d}-{m}-{y}"

    return d_str


def ingest_payout_records(payload):
    """
    Ingests payout date records sent by Tally (no API key required)
    and stores them into Neon DB (tally_payouts table) with status='pending'.
    """
    if not payload:
        return {"success": False, "error": "Empty payload received."}

    # Normalize payload into a list of items
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

    inserted_count = 0
    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        # Extract loan_id
        loan_id = (
            item.get("loan_id")
            or item.get("loanId")
            or item.get("loan_ref_id")
            or item.get("loan_no")
            or item.get("id")
        )
        if not loan_id:
            continue

        # Extract payout date
        payout_date = (
            item.get("payout_date")
            or item.get("payoutDate")
            or item.get("payment_date")
            or item.get("paymentDate")
            or item.get("date")
        )
        if not payout_date:
            continue

        norm_payout_date = normalize_date_to_ddmmyyyy(payout_date)
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

        record = TallyPayout(
            loan_id=str(loan_id).strip(),
            installment_no=installment_no,
            payout_date=norm_payout_date,
            amount=amt,
            cheque_no=item.get("cheque_no") or item.get("chequeNo"),
            voucher_no=item.get("voucher_no") or item.get("voucherNo"),
            bank_name=item.get("bank_name") or item.get("bankName"),
            narration=item.get("narration") or item.get("remarks"),
            raw_payload=json.dumps(item),
            status="pending",
            created_at=now_str
        )
        db.session.add(record)
        inserted_count += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {"success": False, "error": f"Failed to save to Neon DB: {str(e)}"}

    return {
        "success": True,
        "message": f"Successfully collected and stored {inserted_count} payout record(s) into Neon DB.",
        "count": inserted_count
    }


def test_tally_connection(cfg=None):
    """Tests connectivity to the Render Tally Bridge service."""
    if not cfg:
        cfg = load_tally_config(hide_key=False)

    base_url = (cfg.get("render_api_url") or "").rstrip("/").strip()
    if not base_url:
        return {"success": False, "message": "Render API URL is not configured."}

    health_url = f"{base_url}/health"
    req = urllib.request.Request(health_url, headers={
        "User-Agent": "LoanDesk-Client/1.0"
    })

    try:
        ctx = create_ssl_context()
        with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            pending_count = res_json.get("pending_transactions", res_json.get("pending_payouts", 0))
            return {
                "success": True,
                "message": f"Connected to Render Tally Bridge! ({pending_count} pending payouts in cloud)",
                "data": res_json
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Could not connect to Render Tally Bridge: {str(e)}"
        }


def pull_pending_from_render():
    """
    If a Render Bridge URL is configured, pull uncollected payouts from Render
    and store them into Neon DB.
    """
    cfg = load_tally_config(hide_key=False)
    base_url = (cfg.get("render_api_url") or "").rstrip("/").strip()
    if not base_url or not cfg.get("enabled", True):
        return 0

    fetch_url = f"{base_url}/api/v1/tally/payouts?status=pending"
    req = urllib.request.Request(fetch_url, headers={"User-Agent": "LoanDesk-Client/1.0"})

    try:
        ctx = create_ssl_context()
        with urllib.request.urlopen(req, context=ctx, timeout=15) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)

        payouts = res_json.get("payouts", res_json.get("transactions", []))
        if payouts:
            res = ingest_payout_records(payouts)
            fetched_count = res.get("count", 0)

            # Mark collected on Render
            matched_ids = [p["id"] for p in payouts if "id" in p]
            if matched_ids:
                try:
                    mark_url = f"{base_url}/api/v1/tally/payouts/mark-collected"
                    mark_payload = json.dumps({"ids": matched_ids}).encode('utf-8')
                    mark_req = urllib.request.Request(mark_url, data=mark_payload, headers={
                        "Content-Type": "application/json",
                        "User-Agent": "LoanDesk-Client/1.0"
                    })
                    with urllib.request.urlopen(mark_req, context=ctx, timeout=10) as _:
                        pass
                except Exception:
                    pass

            return fetched_count
    except Exception as e:
        print(f"[Tally Sync] Note: Render pull returned: {e}")
        return 0


def run_tally_sync():
    """
    Main function triggered when user clicks the 'Tally Sync' button:
    1. Optionally pulls any new pending payouts from Render into Neon DB.
    2. Reads all pending records in Neon DB (tally_payouts table).
    3. Reconciles and updates payout_date (payment_date) on loans matched by loan_id.
    4. Marks tally_payouts as 'synced'.
    """
    cfg = load_tally_config(hide_key=False)

    # Step 1: Pull from Render if available
    try:
        pull_pending_from_render()
    except Exception as e_pull:
        print(f"[Tally Sync] Render pull warning: {e_pull}")

    # Step 2: Query all pending payout records from Neon DB
    pending_records = TallyPayout.query.filter_by(status='pending').order_by(TallyPayout.id.asc()).all()

    if not pending_records:
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        cfg["last_sync_time"] = now_str
        cfg["last_sync_status"] = "SUCCESS"
        cfg["last_sync_message"] = "Neon DB checked: No pending payout dates to sync."
        save_tally_config(cfg)
        return {
            "success": True,
            "message": "Tally Sync: 0 pending payout dates found in Neon DB.",
            "synced_count": 0,
            "synced_items": [],
            "unmatched_count": 0,
            "unmatched_items": []
        }

    synced_items = []
    unmatched_items = []
    now_sync_time = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

    # Step 3: Match each record by loan_id
    for rec in pending_records:
        raw_lid = str(rec.loan_id or "").strip()
        if not raw_lid:
            rec.status = "error_missing_loan_id"
            unmatched_items.append({"record_id": rec.id, "reason": "Missing loan_id"})
            continue

        # Find loan in LoanDesk (by ID or loan_ref_id)
        loan = None
        if raw_lid.isdigit():
            loan = Loan.query.filter_by(id=int(raw_lid), is_deleted=False).first()
        if not loan:
            loan = Loan.query.filter(
                Loan.loan_ref_id.ilike(raw_lid),
                Loan.is_deleted == False
            ).first()

        if not loan:
            # Try stripping prefix like JL- or LOAN-
            num_match = re.search(r'\d+', raw_lid)
            if num_match:
                loan = Loan.query.filter_by(id=int(num_match.group(0)), is_deleted=False).first()

        if not loan:
            unmatched_items.append({
                "record_id": rec.id,
                "loan_id": raw_lid,
                "reason": f"Loan ID '{raw_lid}' not found in LoanDesk"
            })
            continue

        # Loan found! Now locate the target installment in repayment_schedule
        schedules = [s for s in loan.repayment_schedule if getattr(s, 'type', None) != 'manual']
        if not schedules:
            schedules = loan.repayment_schedule

        target_sch = None
        if rec.installment_no and rec.installment_no > 0:
            target_idx = rec.installment_no - 1
            if 0 <= target_idx < len(schedules):
                target_sch = schedules[target_idx]

        # If no specific installment_no or not found, pick the first unpaid installment
        if not target_sch:
            for s in schedules:
                p_date = (s.payment_date or '').strip()
                if not p_date or p_date in ('-', '—'):
                    target_sch = s
                    break

        # Fallback to the very first installment if all are filled
        if not target_sch and schedules:
            target_sch = schedules[0]

        if not target_sch:
            unmatched_items.append({
                "record_id": rec.id,
                "loan_id": raw_lid,
                "reason": f"No repayment schedule found for Loan #{loan.id}"
            })
            continue

        # Update payment_date (Payout Date)
        norm_date = normalize_date_to_ddmmyyyy(rec.payout_date)
        target_sch.payment_date = norm_date
        target_sch.payout_approval_status = 'APPROVED'
        target_sch.payout_approval_target = None
        target_sch.payout_approved_by = 'Tally Sync'
        target_sch.payout_approved_at = now_sync_time
        target_sch.payout_notes = f"Auto-synced from Tally Payout (Voucher: {rec.voucher_no or 'N/A'})"

        # Update JSON splits if present
        if target_sch.splits:
            try:
                split_dict = json.loads(target_sch.splits)
                if isinstance(split_dict, dict):
                    split_dict['dueDateA'] = norm_date
                    split_dict['dueDate'] = norm_date
                    split_dict['payoutApprovalStatusA'] = 'APPROVED'
                    split_dict['payoutApprovalStatus'] = 'APPROVED'
                    target_sch.splits = json.dumps(split_dict)
            except Exception:
                pass

        # Mark Neon DB record as synced
        rec.status = 'synced'
        rec.synced_at = now_sync_time

        installment_number = (schedules.index(target_sch) + 1) if target_sch in schedules else 1
        synced_items.append({
            "loan_id": loan.id,
            "loan_ref_id": loan.loan_ref_id or f"JL-{loan.id}",
            "client_name": loan.client_account_name,
            "installment_no": installment_number,
            "payout_date": norm_date,
            "amount": rec.amount or target_sch.amount,
            "voucher_no": rec.voucher_no or ""
        })

    # Step 4: Commit changes to Neon DB
    try:
        db.session.commit()
    except Exception as e_commit:
        db.session.rollback()
        return {
            "success": False,
            "message": f"Database commit failed: {str(e_commit)}",
            "synced_count": 0,
            "synced_items": []
        }

    # Step 5: Update tally_config.json
    cfg["last_sync_time"] = now_sync_time
    cfg["last_sync_status"] = "SUCCESS"
    cfg["total_synced_count"] = cfg.get("total_synced_count", 0) + len(synced_items)
    cfg["last_sync_message"] = f"Synced {len(synced_items)} payout date(s) into LoanDesk based on Loan ID."
    save_tally_config(cfg)

    return {
        "success": True,
        "message": f"Tally Sync Completed: {len(synced_items)} payout date(s) updated based on Loan ID.",
        "synced_count": len(synced_items),
        "synced_items": synced_items,
        "unmatched_count": len(unmatched_items),
        "unmatched_items": unmatched_items
    }
