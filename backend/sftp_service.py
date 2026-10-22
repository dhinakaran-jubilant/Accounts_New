"""
Project: Accounts Team
Module: sftp_service
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Description: SFTP Connection, Configuration, DayBook file download, and daily background synchronization service for Joint Loans.
"""

import os
import re
import json
import time
import datetime
import threading
try:
    import paramiko
except ImportError:
    paramiko = None

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'sftp_config.json')
DEFAULT_DOWNLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'downloads', 'sftp_daybooks')

DEFAULT_CONFIG = {
    "enabled": False,
    "host": "",
    "port": 22,
    "username": "",
    "password": "",
    "key_path": "",
    "remote_dir": "/",
    "daily_sync_time": "09:00",
    "last_sync_time": None,
    "last_sync_status": None,
    "last_sync_details": None
}


def load_sftp_config(hide_password=False):
    """Load SFTP configuration from JSON file."""
    if not os.path.exists(CONFIG_FILE):
        save_sftp_config(DEFAULT_CONFIG)
        config = dict(DEFAULT_CONFIG)
    else:
        try:
            with open(CONFIG_FILE, 'r') as f:
                config = json.load(f)
        except Exception as e:
            print(f"Error loading SFTP config: {e}")
            config = dict(DEFAULT_CONFIG)

    # Fill any missing keys with defaults
    for key, value in DEFAULT_CONFIG.items():
        if key not in config:
            config[key] = value

    if hide_password and config.get("password"):
        config["password"] = "********"

    return config


def save_sftp_config(new_config):
    """Save SFTP configuration to JSON file."""
    existing_config = load_sftp_config(hide_password=False) if os.path.exists(CONFIG_FILE) else dict(DEFAULT_CONFIG)

    # If password is masked string, preserve existing password
    if new_config.get("password") == "********":
        new_config["password"] = existing_config.get("password", "")

    existing_config.update(new_config)

    with open(CONFIG_FILE, 'w') as f:
        json.dump(existing_config, f, indent=4)

    return load_sftp_config(hide_password=True)


def get_sftp_connection(config=None):
    """Establish SSH & SFTP client connection using provided or saved configuration."""
    if config is None:
        config = load_sftp_config(hide_password=False)

    host = config.get("host", "").strip()
    port = int(config.get("port", 22))
    username = config.get("username", "").strip()
    password = config.get("password", "")
    key_path = config.get("key_path", "").strip()

    if paramiko is None:
        raise ValueError("The 'paramiko' library is required for SFTP. Please run: pip install paramiko")

    if not host or not username:
        raise ValueError("SFTP Host and Username are required.")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": 10,
        "banner_timeout": 10,
        "auth_timeout": 10
    }

    if key_path and os.path.exists(key_path):
        connect_kwargs["key_filename"] = key_path
    elif password:
        connect_kwargs["password"] = password
    else:
        raise ValueError("Either Password or SSH Key Path must be provided.")

    ssh.connect(**connect_kwargs)
    sftp = ssh.open_sftp()
    return ssh, sftp


def test_sftp_connection(config_data=None):
    """Test SFTP connection with given or saved configuration."""
    ssh = None
    sftp = None
    try:
        if config_data and config_data.get("password") == "********":
            existing = load_sftp_config(hide_password=False)
            config_data["password"] = existing.get("password", "")

        ssh, sftp = get_sftp_connection(config_data)

        remote_dir = (config_data or load_sftp_config()).get("remote_dir", "/").strip() or "/"
        try:
            files = sftp.listdir(remote_dir)
        except Exception:
            # Fallback to root if remote_dir listing fails
            files = sftp.listdir(".")
            remote_dir = "."

        excel_files = [f for f in files if f.lower().endswith(('.xlsx', '.xls'))]

        return {
            "success": True,
            "message": f"SFTP connection successful! Found {len(excel_files)} Excel file(s) in '{remote_dir}'.",
            "remote_dir": remote_dir,
            "total_files": len(files),
            "excel_files": excel_files
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"SFTP connection failed: {str(e)}"
        }
    finally:
        if sftp:
            try:
                sftp.close()
            except Exception:
                pass
        if ssh:
            try:
                ssh.close()
            except Exception:
                pass


def download_sftp_daybooks(target_folder=None, config_data=None):
    """Download only the latest uploaded daybook Excel file from remote SFTP server to local target folder."""
    if not target_folder:
        target_folder = DEFAULT_DOWNLOAD_FOLDER

    if not os.path.exists(target_folder):
        os.makedirs(target_folder, exist_ok=True)

    ssh, sftp = get_sftp_connection(config_data)
    config = config_data or load_sftp_config(hide_password=False)
    remote_dir = config.get("remote_dir", "/").strip() or "/"

    downloaded_files = []

    try:
        try:
            file_list = sftp.listdir_attr(remote_dir)
        except Exception:
            remote_dir = "."
            file_list = sftp.listdir_attr(remote_dir)

        # Filter valid Excel files (ignore hidden / temp files starting with . or ~$)
        excel_items = []
        for attr in file_list:
            fname = attr.filename
            if fname.startswith('.') or fname.startswith('~$'):
                continue
            if fname.lower().endswith(('.xlsx', '.xls')):
                excel_items.append(attr)

        if excel_items:
            def file_sort_key(attr):
                fname = attr.filename
                m = re.search(r'\d{8}', fname)
                date_num = int(m.group(0)) if m else 0
                mtime = getattr(attr, 'st_mtime', 0)
                return (date_num, mtime)

            excel_items.sort(key=file_sort_key, reverse=True)
            latest_attr = excel_items[0]
            fname = latest_attr.filename

            remote_path = fname if remote_dir in (".", "/") else f"{remote_dir.rstrip('/')}/{fname}"
            local_path = os.path.join(target_folder, fname)
            sftp.get(remote_path, local_path)
            downloaded_files.append((local_path, fname))

        return downloaded_files
    finally:
        if sftp:
            try: sftp.close()
            except Exception: pass
        if ssh:
            try: ssh.close()
            except Exception: pass


def process_day_book_for_joint_loans(file_path, account_name=None):
    """
    Parses a DayBook Excel file (from SFTP or manual upload), identifies collection/receipt
    transactions, and automatically updates the corresponding Joint Loan repayment schedule's
    received_date (`recd_date`) in PostgreSQL.
    """
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File '{file_path}' does not exist."}

    import pandas as pd
    from models import db, Loan, RepaymentSchedule

    # 1. Read Excel file with auto-header promotion
    try:
        df_raw = pd.read_excel(file_path, header=None)
        header_idx = None
        for idx in range(min(30, len(df_raw))):
            row_vals = [str(c).strip().upper() for c in df_raw.iloc[idx] if pd.notna(c)]
            if len(row_vals) >= 4:
                has_date = any('DATE' in v for v in row_vals)
                has_particulars_or_vch = any(k in v for v in row_vals for k in ('PARTICULARS', 'DETAILS', 'VOUCHER', 'INSTRUMENT'))
                if has_date and has_particulars_or_vch:
                    header_idx = idx
                    break

        if header_idx is not None:
            headers = [
                str(c).strip() if pd.notna(c) and str(c).strip().lower() not in ('nan', 'none') else f"Col_{i}"
                for i, c in enumerate(df_raw.iloc[header_idx])
            ]
            df = df_raw.iloc[header_idx + 1:].copy()
            df.columns = headers
            df = df.dropna(how='all').reset_index(drop=True)
        else:
            df = pd.read_excel(file_path)
    except Exception as e:
        return {"success": False, "error": f"Could not read Excel file: {str(e)}"}

    if df.empty:
        return {
            "success": True,
            "updated_count": 0,
            "updated_details": [],
            "skipped_details": ["Excel file contains no data rows."],
            "mismatch_details": []
        }

    # 2. Identify relevant column names
    col_map = {}
    for col in df.columns:
        c_norm = re.sub(r'[\s_\-]+', ' ', str(col).strip().lower())
        if not col_map.get('date') and any(k in c_norm for k in ('txn date', 'trans date', 'value date', 'date')):
            col_map['date'] = col
        elif not col_map.get('inst_no') and any(k in c_norm for k in ('instrument no', 'cheque no', 'chq no', 'ref no', 'instrument', 'cheque')):
            col_map['inst_no'] = col
        elif not col_map.get('credit') and ('credit' in c_norm or 'cr' == c_norm):
            col_map['credit'] = col
        elif not col_map.get('debit') and ('debit' in c_norm or 'dr' == c_norm):
            col_map['debit'] = col
        elif not col_map.get('amount') and any(k in c_norm for k in ('amount', 'total')):
            col_map['amount'] = col
        elif not col_map.get('particulars') and any(k in c_norm for k in ('particulars', 'party', 'ledger', 'customer', 'description', 'narration', 'details')):
            col_map['particulars'] = col
        elif not col_map.get('voucher_type') and any(k in c_norm for k in ('voucher type', 'vch type')):
            col_map['voucher_type'] = col

    # Helper date formatter
    def normalize_date_str(val):
        if pd.isna(val) or val is None:
            return ''
        if hasattr(val, 'strftime'):
            return val.strftime('%d-%m-%Y')
        s = str(val).strip()
        if s.lower() in ('nan', 'none', ''):
            return ''
        m = re.match(r"^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$", s)
        if m:
            return f"{int(m.group(1)):02d}-{int(m.group(2)):02d}-{m.group(3)}"
        m2 = re.match(r"^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2})$", s)
        if m2:
            return f"{int(m2.group(1)):02d}-{int(m2.group(2)):02d}-20{m2.group(3)}"
        m3 = re.match(r"^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})", s)
        if m3:
            return f"{int(m3.group(3)):02d}-{int(m3.group(2)):02d}-{m3.group(1)}"
        return s

    # 3. Fetch active Joint Loans from DB
    from flask import current_app
    ctx = None
    if not current_app:
        try:
            from app import app
            ctx = app.app_context()
            ctx.push()
        except Exception:
            pass

    try:
        loans = Loan.query.filter(Loan.is_deleted == False).all()
        joint_loans = [
            l for l in loans 
            if not getattr(l, 'loan_type', None) or str(l.loan_type).lower() in ('joint', 'joint_loan', 'joint-loan')
        ]
        if not joint_loans:
            joint_loans = loans
    except Exception as db_err:
        return {"success": False, "error": f"Database query failed: {str(db_err)}"}

    # Clean cheque function: remove non-alphanumeric, strip leading zeroes, uppercase
    def clean_chq(val):
        if not val or pd.isna(val):
            return ''
        return re.sub(r'[^A-Za-z0-9]', '', str(val)).lstrip('0').upper()

    chq_to_schedules = {}
    for loan in joint_loans:
        for sch in loan.repayment_schedule:
            c = clean_chq(sch.cheque_no)
            if c:
                chq_to_schedules.setdefault(c, []).append((loan, sch))

    updated_count = 0
    updated_details = []
    skipped_details = []
    mismatch_details = []
    matched_sch_ids = set()

    for idx, row in df.iterrows():
        # A. Filter for Receipt vouchers if Voucher Type column is present
        vch_type = str(row.get(col_map.get('voucher_type', ''), '')).lower() if col_map.get('voucher_type') else ''
        if vch_type and 'receipt' not in vch_type and 'rcpt' not in vch_type:
            continue

        # Determine credit/receipt amount
        credit_val = 0.0
        if col_map.get('credit') and pd.notna(row[col_map['credit']]):
            try:
                credit_val = float(str(row[col_map['credit']]).replace(',', '').strip() or 0)
            except Exception:
                credit_val = 0.0
        elif col_map.get('amount') and pd.notna(row[col_map['amount']]):
            try:
                credit_val = float(str(row[col_map['amount']]).replace(',', '').strip() or 0)
            except Exception:
                credit_val = 0.0

        if credit_val <= 0:
            continue

        # B. Get transaction date
        raw_date = row.get(col_map.get('date', '')) if col_map.get('date') else None
        txn_date_str = normalize_date_str(raw_date)
        if not txn_date_str:
            continue

        # C. Get instrument number & particulars
        raw_inst = str(row.get(col_map.get('inst_no', ''), '')).strip() if col_map.get('inst_no') else ''
        cleaned_inst = clean_chq(raw_inst)

        particulars_str = str(row.get(col_map.get('particulars', ''), '')).strip() if col_map.get('particulars') else ''
        particulars_lower = particulars_str.lower()

        matched_pair = None

        # Stage 1: Exact Cheque / Instrument No match
        if cleaned_inst and len(cleaned_inst) >= 2:
            candidates = chq_to_schedules.get(cleaned_inst, [])
            for loan, sch in candidates:
                if sch.id not in matched_sch_ids:
                    if len(candidates) == 1 or abs(float(sch.amount or 0) - credit_val) < 1.0:
                        matched_pair = (loan, sch)
                        break

        # Stage 2: Cheque number inside Description/Particulars + Amount match
        if not matched_pair:
            for loan in joint_loans:
                for sch in loan.repayment_schedule:
                    if sch.id in matched_sch_ids:
                        continue
                    c_num = clean_chq(sch.cheque_no)
                    if c_num and len(c_num) >= 4 and c_num in particulars_str.upper():
                        if abs(float(sch.amount or 0) - credit_val) < 1.0 or abs(float(sch.amount or 0) + float(sch.interest_amount or 0) - credit_val) < 1.0:
                            matched_pair = (loan, sch)
                            break
                if matched_pair:
                    break

        # Stage 3: Client Account Name in Particulars + Amount match
        if not matched_pair:
            for loan in joint_loans:
                client_name = (loan.client_account_name or '').lower().strip()
                if client_name and len(client_name) >= 3 and client_name in particulars_lower:
                    for sch in loan.repayment_schedule:
                        if sch.id in matched_sch_ids:
                            continue
                        sch_amt = float(sch.amount or 0)
                        tot_amt = sch_amt + float(sch.interest_amount or 0)
                        if abs(sch_amt - credit_val) < 1.0 or abs(tot_amt - credit_val) < 1.0:
                            if not sch.received_date or str(sch.received_date).strip() in ('', 'None', '-', '—'):
                                matched_pair = (loan, sch)
                                break
                if matched_pair:
                    break

        # Apply update if matched
        if matched_pair:
            loan, sch = matched_pair
            matched_sch_ids.add(sch.id)
            current_recd = str(sch.received_date or '').strip()

            if current_recd != txn_date_str:
                sch.received_date = txn_date_str

                # Update splits JSON if present
                if sch.splits:
                    try:
                        sp_data = json.loads(sch.splits) if isinstance(sch.splits, str) else sch.splits
                        if isinstance(sp_data, dict):
                            if not sp_data.get('recdDateA'):
                                sp_data['recdDateA'] = txn_date_str
                            if not sp_data.get('recdDate'):
                                sp_data['recdDate'] = txn_date_str
                            sch.splits = json.dumps(sp_data)
                    except Exception:
                        pass

                # Update payout approval workflow (consistent with app.py)
                if not getattr(sch, 'payout_approved_by', None):
                    sch.payout_approval_status = 'PENDING'
                    sch.payout_approval_target = 'SECONDARY'
                    sch.payout_requested_role = 'PRIMARY'
                    sch.payout_requested_by = 'SFTP Sync'
                    sch.payout_requested_at = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

                updated_count += 1
                updated_details.append(
                    f"Loan #{loan.id} ({loan.client_account_name}) Inst #{sch.id} [Date: {sch.date}, Chq: {sch.cheque_no or 'N/A'}, Amt: {sch.amount}]: received_date updated from '{current_recd or 'None'}' to '{txn_date_str}'"
                )
            else:
                skipped_details.append(
                    f"Loan #{loan.id} ({loan.client_account_name}) Inst #{sch.id}: received_date already set to '{txn_date_str}'"
                )
        else:
            if credit_val >= 1000:
                mismatch_details.append(
                    f"DayBook entry unmatched: Date={txn_date_str}, Amount={credit_val}, InstNo='{raw_inst}', Particulars='{particulars_str[:60]}'"
                )

    # Commit changes
    try:
        db.session.commit()
    except Exception as e_comm:
        db.session.rollback()
        return {"success": False, "error": f"Database commit failed: {str(e_comm)}"}
    finally:
        if ctx:
            try:
                ctx.pop()
            except Exception:
                pass

    return {
        "success": True,
        "updated_count": updated_count,
        "updated_details": updated_details,
        "skipped_details": skipped_details,
        "mismatch_details": mismatch_details
    }


def run_sftp_sync(process_day_book_func=None, target_folder=None):
    """Execute complete SFTP sync: download daybook files and process each with process_day_book_func."""
    if process_day_book_func is None:
        process_day_book_func = process_day_book_for_joint_loans
    if target_folder is None:
        target_folder = DEFAULT_DOWNLOAD_FOLDER

    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    config = load_sftp_config(hide_password=False)

    try:
        downloaded = download_sftp_daybooks(target_folder, config)

        if not downloaded:
            sync_result = {
                "success": True,
                "message": "Connected to SFTP, but no Excel (.xlsx/.xls) DayBook files were found.",
                "total_files": 0,
                "updated_count": 0,
                "updated_details": [],
                "skipped_details": ["No Excel files found on SFTP server"],
                "mismatch_details": []
            }
        else:
            total_updated = 0
            all_updated_details = []
            all_skipped_details = []
            all_mismatch_details = []

            for local_path, fname in downloaded:
                acc_name = 'Unknown'
                if '_DayBook' in fname:
                    acc_name = fname.split('_DayBook')[0]
                elif '_' in fname:
                    acc_name = fname.split('_')[0]

                res = process_day_book_func(local_path, account_name=acc_name)

                if res.get('success'):
                    u_cnt = res.get('updated_count', 0)
                    total_updated += u_cnt
                    all_updated_details.extend([f"[{fname}] {d}" for d in res.get('updated_details', [])])
                    all_skipped_details.extend([f"[{fname}] {d}" for d in res.get('skipped_details', [])])
                    all_mismatch_details.extend([f"[{fname}] {d}" for d in res.get('mismatch_details', [])])
                else:
                    all_skipped_details.append(f"[{fname}] Processing failed: {res.get('error', 'Unknown error')}")

            msg = f"SFTP Sync Completed: Downloaded {len(downloaded)} file(s), updated {total_updated} installment(s)."
            sync_result = {
                "success": True,
                "message": msg,
                "total_files": len(downloaded),
                "updated_count": total_updated,
                "updated_details": all_updated_details,
                "skipped_details": all_skipped_details,
                "mismatch_details": all_mismatch_details
            }

        # Update last sync status in config
        config["last_sync_time"] = now_str
        config["last_sync_status"] = "SUCCESS" if sync_result["success"] else "FAILED"
        config["last_sync_details"] = sync_result
        save_sftp_config(config)

        return sync_result

    except Exception as e:
        is_auth_err = paramiko and isinstance(e, getattr(paramiko, 'AuthenticationException', ()))
        if is_auth_err:
            err_msg = f"SFTP Authentication Failed for user '{config.get('username')}' at '{config.get('host')}'. Please verify SFTP credentials in Settings."
        else:
            err_msg = f"SFTP Sync Error: {str(e)}"
        sync_result = {
            "success": False,
            "error": err_msg,
            "total_files": 0,
            "updated_count": 0,
            "updated_details": [],
            "skipped_details": [err_msg],
            "mismatch_details": []
        }

        config["last_sync_time"] = now_str
        config["last_sync_status"] = "FAILED"
        config["last_sync_details"] = sync_result
        save_sftp_config(config)

        return sync_result


_scheduler_running = False
_last_run_date = None

def start_sftp_scheduler(app, process_day_book_func=None, target_folder=None, on_sync_complete=None):
    """Start background daemon thread that checks every 30 seconds for scheduled daily SFTP sync."""
    global _scheduler_running
    if _scheduler_running:
        return

    _scheduler_running = True

    if process_day_book_func is None:
        process_day_book_func = process_day_book_for_joint_loans
    if target_folder is None:
        target_folder = DEFAULT_DOWNLOAD_FOLDER

    def scheduler_loop():
        global _last_run_date
        print("[SFTP Scheduler] Background daily SFTP scheduler started.")

        while True:
            try:
                time.sleep(30)
                config = load_sftp_config(hide_password=False)

                if not config.get("enabled"):
                    continue

                scheduled_time = config.get("daily_sync_time", "09:00").strip()
                now = datetime.datetime.now()
                current_time = now.strftime("%H:%M")
                today_date = now.strftime("%Y-%m-%d")

                if current_time == scheduled_time and _last_run_date != today_date:
                    print(f"[SFTP Scheduler] Daily sync triggered at {now.strftime('%d-%m-%Y %H:%M:%S')}")
                    _last_run_date = today_date
                    with app.app_context():
                        sync_res = run_sftp_sync(process_day_book_func, target_folder)
                        if on_sync_complete:
                            try:
                                on_sync_complete(sync_res)
                            except Exception as _cb_err:
                                print(f"[SFTP Scheduler] Notification callback error: {_cb_err}")

            except Exception as e:
                print(f"[SFTP Scheduler] Error in loop: {e}")

    thread = threading.Thread(target=scheduler_loop, daemon=True)
    thread.start()
