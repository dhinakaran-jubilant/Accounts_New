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
    "api_key": "tally_live_sec_8f92e4a19b0d4c728391",
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

    if hide_key and cfg.get("api_key"):
        raw_key = cfg["api_key"]
        if len(raw_key) > 6:
            cfg["api_key_masked"] = raw_key[:4] + "..." + raw_key[-4:]
        else:
            cfg["api_key_masked"] = "***"

    return cfg


def save_tally_config(data):
    """Saves updated Tally Bridge configuration."""
    cfg = load_tally_config(hide_key=False)
    if "render_api_url" in data:
        cfg["render_api_url"] = str(data["render_api_url"]).rstrip("/").strip()
    if "api_key" in data and data["api_key"] and not str(data["api_key"]).startswith("***"):
        cfg["api_key"] = str(data["api_key"]).strip()
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

    return load_tally_config(hide_key=True)


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


def extract_records_from_item(item):
    """
    Parses an item from the incoming payload.
    Supports:
    1. Tally Voucher format:
       {
           "vchNo": "LE2257-2717870",
           "date": "01-08-2025",
           "narration": "Ledger change Party Bank-ex",
           "debit_entries": [ ... ],
           "credit_entries": [ ... ]
       }
    2. Flat payout record:
       {
           "loan_id": "PDM/23-24/C/16527",
           "payout_date": "01-08-2025",
           "amount": 100000
       }
    """
    records = []
    has_entries = bool(item.get("debit_entries") or item.get("credit_entries"))

    if has_entries:
        vch_no = item.get("vchNo") or item.get("voucher_no") or item.get("vch_no") or ""
        vch_date = item.get("date") or item.get("vchDate") or ""
        narration = item.get("narration") or item.get("remarks") or ""

        debits = item.get("debit_entries") or []
        credits = item.get("credit_entries") or []
        all_entries = debits + credits

        # Extract Bank information
        bank_name = ""
        inst_no = ""
        inst_date = ""
        for e in all_entries:
            if not isinstance(e, dict):
                continue
            if e.get("Bank_Name"):
                bank_name = e.get("Bank_Name")
            elif not bank_name and "BANK" in (e.get("account_name") or "").upper():
                bank_name = e.get("account_name")
            if e.get("Inst_No"):
                inst_no = e.get("Inst_No")
            if e.get("Inst_Date"):
                inst_date = e.get("Inst_Date")

        norm_payout_date = normalize_date_to_ddmmyyyy(inst_date or vch_date)

        # Extract Party and Bill allocations
        party_found = False
        for e in all_entries:
            if not isinstance(e, dict):
                continue
            acc_name = (e.get("account_name") or "").strip()
            allocs = e.get("Bill_allocations") or []

            if allocs:
                party_found = True
                for al in allocs:
                    if not isinstance(al, dict):
                        continue
                    ref_no = al.get("Ref_No") or al.get("ref_no") or al.get("bill_no") or al.get("Bill_No") or ""
                    amt = al.get("amount") or e.get("amount")
                    try:
                        amt = float(amt) if amt is not None else None
                    except Exception:
                        amt = None
                    records.append({
                        "loan_id": str(ref_no).strip() if ref_no else acc_name,
                        "party_name": acc_name,
                        "installment_no": None,
                        "payout_date": norm_payout_date,
                        "amount": amt,
                        "cheque_no": inst_no,
                        "voucher_no": vch_no,
                        "bank_name": bank_name or acc_name,
                        "narration": f"{narration} | Party: {acc_name}".strip(" |"),
                        "raw_payload": json.dumps(item)
                    })
            elif acc_name and acc_name != bank_name and "BANK" not in acc_name.upper():
                party_found = True
                amt = e.get("amount")
                try:
                    amt = float(amt) if amt is not None else None
                except Exception:
                    amt = None
                records.append({
                    "loan_id": acc_name,
                    "party_name": acc_name,
                    "installment_no": None,
                    "payout_date": norm_payout_date,
                    "amount": amt,
                    "cheque_no": inst_no,
                    "voucher_no": vch_no,
                    "bank_name": bank_name,
                    "narration": f"{narration} | Party: {acc_name}".strip(" |"),
                    "raw_payload": json.dumps(item)
                })

        if not party_found:
            records.append({
                "loan_id": vch_no or "UNKNOWN",
                "party_name": "",
                "installment_no": None,
                "payout_date": norm_payout_date,
                "amount": None,
                "cheque_no": inst_no,
                "voucher_no": vch_no,
                "bank_name": bank_name,
                "narration": narration,
                "raw_payload": json.dumps(item)
            })
    else:
        # Flat format
        loan_id = (
            item.get("loan_id")
            or item.get("loanId")
            or item.get("loan_ref_id")
            or item.get("loan_no")
            or item.get("id")
            or item.get("account_name")
        )
        payout_date = (
            item.get("payout_date")
            or item.get("payoutDate")
            or item.get("payment_date")
            or item.get("paymentDate")
            or item.get("date")
        )
        if loan_id and payout_date:
            amt = item.get("amount") or item.get("payout_amount") or item.get("disbursed_amount")
            try:
                amt = float(amt) if amt is not None else None
            except Exception:
                amt = None

            installment_no = item.get("installment_no") or item.get("installmentNumber") or item.get("s_no") or item.get("sNo")
            try:
                installment_no = int(installment_no) if installment_no is not None else None
            except Exception:
                installment_no = None

            records.append({
                "loan_id": str(loan_id).strip(),
                "party_name": item.get("account_name") or item.get("client_name") or "",
                "installment_no": installment_no,
                "payout_date": normalize_date_to_ddmmyyyy(payout_date),
                "amount": amt,
                "cheque_no": item.get("cheque_no") or item.get("chequeNo") or item.get("Inst_No"),
                "voucher_no": item.get("voucher_no") or item.get("voucherNo") or item.get("vchNo"),
                "bank_name": item.get("bank_name") or item.get("bankName") or item.get("Bank_Name"),
                "narration": item.get("narration") or item.get("remarks"),
                "raw_payload": json.dumps(item)
            })

    return records


def ingest_payout_records(payload):
    """
    Ingests payout date records sent by Tally (no API key required)
    and stores them into Neon DB (tally_payouts table) with status='pending'.
    Supports both Tally voucher payload structure and flat format.
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

    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue

        extracted_records = extract_records_from_item(raw_item)
        for rec in extracted_records:
            record = TallyPayout(
                loan_id=rec["loan_id"],
                installment_no=rec["installment_no"],
                payout_date=rec["payout_date"],
                amount=rec["amount"],
                cheque_no=rec["cheque_no"],
                voucher_no=rec["voucher_no"],
                bank_name=rec["bank_name"],
                narration=rec["narration"],
                raw_payload=rec["raw_payload"],
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
        msg = "Render API URL is empty. Please enter your Render Web Service URL."
        return {"success": False, "message": msg, "error": msg}

    # Ensure protocol is present
    if not base_url.startswith("http://") and not base_url.startswith("https://"):
        base_url = "https://" + base_url

    api_key = cfg.get("api_key") or "tally_live_sec_8f92e4a19b0d4c728391"
    if str(api_key).startswith("***"):
        saved_cfg = load_tally_config(hide_key=False)
        api_key = saved_cfg.get("api_key", "tally_live_sec_8f92e4a19b0d4c728391")

    health_url = f"{base_url}/health"
    req = urllib.request.Request(health_url, headers={
        "User-Agent": "LoanDesk-Client/1.0",
        "X-API-Key": api_key
    })

    try:
        ctx = create_ssl_context()
        # 25-second timeout to allow Render free tier wake-up from cold sleep
        with urllib.request.urlopen(req, context=ctx, timeout=25) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            pending_count = res_json.get("pending_transactions", res_json.get("pending_payouts", 0))
            db_type = res_json.get("database_type", "connected")
            return {
                "success": True,
                "message": f"Connected to Render Tally Bridge! ({pending_count} pending payouts in {db_type})",
                "data": res_json
            }
    except urllib.error.HTTPError as he:
        code = he.code
        if code in (401, 403):
            msg = f"HTTP {code} Unauthorized: The API Key does not match the TALLY_API_KEY environment variable configured on Render."
        elif code == 404:
            msg = f"HTTP 404 Not Found: Could not find /health on {base_url}. Verify that your Render Web Service URL is correct."
        elif code in (502, 503, 504):
            msg = f"HTTP {code} Starting Up: Render service is currently waking up from cold sleep. Please wait 15-20 seconds and click Test again."
        else:
            msg = f"HTTP Error {code} from Render: {he.reason}"
        return {"success": False, "message": msg, "error": msg}
    except urllib.error.URLError as ue:
        err_str = str(ue.reason)
        if "getaddrinfo failed" in err_str or "Name or service not known" in err_str:
            msg = f"Invalid Render domain '{base_url}'. The domain could not be found. Please check your Render Web Service URL in the dashboard."
        elif "timed out" in err_str:
            msg = "Connection timed out. If your Render service is on the free tier, it takes ~45s to wake up on first access. Please retry shortly."
        elif "Connection refused" in err_str:
            msg = f"Connection refused at {base_url}. Please ensure the service is running and active on Render."
        else:
            msg = f"Network connection error: {err_str}"
        return {"success": False, "message": msg, "error": msg}
    except Exception as e:
        msg = f"Could not connect to Render Tally Bridge: {str(e)}"
        return {"success": False, "message": msg, "error": msg}


def pull_pending_from_render():
    """
    If a Render Bridge URL is configured, pull uncollected payouts from Render
    and store them into Neon DB.
    """
    cfg = load_tally_config(hide_key=False)
    base_url = (cfg.get("render_api_url") or "").rstrip("/").strip()
    if not base_url or not cfg.get("enabled", True):
        return 0

    api_key = cfg.get("api_key", "tally_live_sec_8f92e4a19b0d4c728391")
    fetch_url = f"{base_url}/api/v1/tally/payouts?status=pending"
    req = urllib.request.Request(fetch_url, headers={
        "User-Agent": "LoanDesk-Client/1.0",
        "X-API-Key": api_key
    })

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
                        "User-Agent": "LoanDesk-Client/1.0",
                        "X-API-Key": api_key
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

        # Find loan in LoanDesk (by ID, loan_ref_id, client name, or bill allocation reference)
        loan = None
        if raw_lid.isdigit():
            loan = Loan.query.filter_by(id=int(raw_lid), is_deleted=False).first()

        if not loan:
            loan = Loan.query.filter(
                Loan.loan_ref_id.ilike(raw_lid),
                Loan.is_deleted == False
            ).first()

        # Try matching by Client Account Name (e.g. "United Roofings And Constructions")
        if not loan:
            loan = Loan.query.filter(
                Loan.client_account_name.ilike(raw_lid),
                Loan.is_deleted == False
            ).first()

        if not loan and len(raw_lid) >= 3:
            loan = Loan.query.filter(
                Loan.client_account_name.ilike(f"%{raw_lid}%"),
                Loan.is_deleted == False
            ).first()

        # Try extracting Party Name from narration if present
        if not loan and rec.narration:
            m_party = re.search(r'Party:\s*([^|]+)', rec.narration)
            if m_party:
                p_name = m_party.group(1).strip()
                loan = Loan.query.filter(
                    Loan.client_account_name.ilike(f"%{p_name}%"),
                    Loan.is_deleted == False
                ).first()

        # Try numeric tokens from ref string (e.g. '16527' from 'PDM/23-24/C/16527')
        if not loan:
            num_tokens = re.findall(r'\d+', raw_lid)
            for token in reversed(num_tokens):
                # Check if matches loan primary id
                try:
                    candidate = Loan.query.filter_by(id=int(token), is_deleted=False).first()
                    if candidate:
                        loan = candidate
                        break
                except Exception:
                    pass
                # Check if matches loan_ref_id substring
                if not loan and len(token) >= 2:
                    candidate = Loan.query.filter(
                        Loan.loan_ref_id.ilike(f"%{token}%"),
                        Loan.is_deleted == False
                    ).first()
                    if candidate:
                        loan = candidate
                        break

        # Try matching by Voucher No if present
        if not loan and rec.voucher_no:
            v_num = re.search(r'\d+', str(rec.voucher_no))
            if v_num:
                loan = Loan.query.filter_by(id=int(v_num.group(0)), is_deleted=False).first()

        if not loan:
            unmatched_items.append({
                "record_id": rec.id,
                "loan_id": raw_lid,
                "reason": f"Loan ID or Party '{raw_lid}' not found in LoanDesk"
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

        notes_parts = []
        if rec.voucher_no:
            notes_parts.append(f"Vch: {rec.voucher_no}")
        if rec.cheque_no:
            notes_parts.append(f"Inst: {rec.cheque_no}")
        if rec.bank_name:
            notes_parts.append(f"Bank: {rec.bank_name}")
        notes_str = ", ".join(notes_parts) if notes_parts else "N/A"
        target_sch.payout_notes = f"Auto-synced from Tally ({notes_str})"

        # If instrument/cheque number provided from Tally, update installment cheque_no if blank
        if rec.cheque_no and (not target_sch.cheque_no or target_sch.cheque_no in ('-', '—', 'CHQ')):
            target_sch.cheque_no = rec.cheque_no

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
