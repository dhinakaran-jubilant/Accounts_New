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
import pandas as pd
try:
    import paramiko
except Exception as _p_err:
    print(f"[SFTP] Failed to import paramiko: {_p_err}")
    import traceback
    traceback.print_exc()
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

    global paramiko
    if paramiko is None:
        try:
            import paramiko as _p
            paramiko = _p
        except Exception:
            try:
                import subprocess, sys
                subprocess.run([sys.executable, "-m", "pip", "install", "paramiko"], capture_output=True, timeout=90)
                import paramiko as _p
                paramiko = _p
            except Exception:
                pass

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
    """
    Connects to the SFTP server, locates the configured folder path, finds the last uploaded
    DayBook file (most recent based on filename date and modified timestamp), and downloads it.
    """
    if not target_folder:
        target_folder = DEFAULT_DOWNLOAD_FOLDER

    if not os.path.exists(target_folder):
        os.makedirs(target_folder, exist_ok=True)

    ssh, sftp = get_sftp_connection(config_data)
    config = config_data or load_sftp_config(hide_password=False)
    remote_dir = config.get("remote_dir", "/").strip() or "/"

    downloaded_files = []

    try:
        # Locate remote folder path
        try:
            file_list = sftp.listdir_attr(remote_dir)
        except Exception:
            clean_remote = remote_dir.strip('"').strip("'").rstrip('/')
            try:
                file_list = sftp.listdir_attr(clean_remote)
                remote_dir = clean_remote
            except Exception:
                remote_dir = "."
                file_list = sftp.listdir_attr(remote_dir)

        # Filter valid DayBook files (ignore hidden or temporary lock files starting with . or ~$)
        daybook_items = []
        for attr in file_list:
            fname = attr.filename
            if fname.startswith('.') or fname.startswith('~$'):
                continue
            if fname.lower().endswith(('.xlsx', '.xls', '.csv')):
                daybook_items.append(attr)

        if daybook_items:
            def file_sort_key(attr):
                fname = attr.filename
                # Extract date from filename (e.g. 20261027 or 2026-10-27)
                m = re.search(r'(\d{4})[-_]?(\d{2})[-_]?(\d{2})', fname)
                date_num = 0
                if m:
                    try:
                        date_num = int(m.group(1) + m.group(2) + m.group(3))
                    except Exception:
                        pass
                mtime = getattr(attr, 'st_mtime', 0) or 0
                return (date_num, mtime)

            # Sort descending to get newest files first
            daybook_items.sort(key=file_sort_key, reverse=True)
            # Download recent files (up to 5 most recent DayBook files)
            for attr in daybook_items[:5]:
                fname = attr.filename
                remote_path = fname if remote_dir in (".", "/") else f"{remote_dir.rstrip('/')}/{fname}"
                local_path = os.path.join(target_folder, fname)
                try:
                    sftp.get(remote_path, local_path)
                    downloaded_files.append((local_path, fname))
                except Exception as _e_dl:
                    print(f"[SFTP] Warning downloading {fname}: {_e_dl}")

        return downloaded_files
    finally:
        if sftp:
            try: sftp.close()
            except Exception: pass
        if ssh:
            try: ssh.close()
            except Exception: pass


def parse_date_robustly(val):
    """Parse various date formats into datetime.datetime object."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except Exception:
        pass
    if isinstance(val, datetime.datetime):
        return val
    if isinstance(val, datetime.date):
        return datetime.datetime(val.year, val.month, val.day)
    s = str(val).strip()
    if not s or s.lower() in ('nan', 'none', 'null', '-', '—', 'dd-mm-yyyy'):
        return None
    s = re.sub(r'[/.]', '-', s)
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%m-%d-%Y", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return datetime.datetime.strptime(s, fmt)
        except (ValueError, TypeError):
            continue
    m = re.match(r"^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$", s)
    if m:
        try:
            return datetime.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except Exception:
            pass
    return None


def get_acronym(name):
    """Resolve acronym for a primary account name."""
    if not name:
        return ''
    raw_str = str(name).strip()
    if not raw_str:
        return ''
    n = raw_str.lower()
    try:
        from models import AccountName
        all_accounts = AccountName.query.all()
        for acc in all_accounts:
            acr = (acc.acronym or '').strip().upper()
            acc_name = (acc.name or '').strip().lower()
            if acr.lower() == n or acc_name == n:
                return acr
    except Exception:
        pass
    words = raw_str.split()
    if len(words) > 1:
        return ''.join(w[0] for w in words).upper()
    return raw_str[:4].upper()


def is_installment_received_filled(inst):
    """
    Check if an installment already has a valid received date filled,
    either in received_date column or inside splits JSON.
    User requirement: "if recd date is filled dont sync that"
    """
    if not inst:
        return False
    import json
    recd = str(inst.received_date or '').strip()
    if recd and recd.lower() not in ('-', '—', 'none', 'null', 'dd-mm-yyyy', ''):
        return True
    if getattr(inst, 'splits', None):
        try:
            sp = json.loads(inst.splits) if isinstance(inst.splits, str) else inst.splits
            if isinstance(sp, dict):
                r_a = str(sp.get('recdDateA') or '').strip()
                if r_a and r_a.lower() not in ('-', '—', 'none', 'null', 'dd-mm-yyyy', ''):
                    return True
                r_d = str(sp.get('recdDate') or '').strip()
                if r_d and r_d.lower() not in ('-', '—', 'none', 'null', 'dd-mm-yyyy', ''):
                    return True
        except Exception:
            pass
    return False


def process_day_book_file_internal(file_path, account_name='Unknown'):
    """
    Parses a DayBook Excel file, handles Reversal Payment Vouchers, validates account folder,
    and updates matching Joint Loan repayment schedule received dates and splits in PostgreSQL.
    """
    import pandas as pd
    from models import db, Loan, RepaymentSchedule

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
        df = pd.read_excel(file_path)
        cols = [str(c).strip() for c in df.columns]
        if 'Voucher Type' not in cols or 'Particulars' not in cols:
            # Header not in row 0, inspect top 30 rows for the table header row
            raw_df = pd.read_excel(file_path, header=None)
            header_idx = None
            for idx, row in raw_df.head(30).iterrows():
                row_str = [str(x).strip() for x in row.values if pd.notna(x)]
                if 'Voucher Type' in row_str or ('Particulars' in row_str and 'Transaction Date' in row_str):
                    header_idx = idx
                    break
            if header_idx is not None:
                df = pd.read_excel(file_path, header=header_idx)

        # Clean column names to prevent matching issues from trailing spaces
        df.columns = df.columns.str.strip()

        # Clean Voucher Type values
        if "Voucher Type" in df.columns:
            df["Voucher Type"] = df["Voucher Type"].astype(str).str.strip()

        receipt_df = df[df["Voucher Type"] == "Receipt Voucher"].copy()

        # --- Pre-check for Reversals and Execute DB Reversals ---
        reversed_instruments = set()
        reversed_vouchers = set()

        # Clean values (like Instrument No or Voucher Number): remove .0 and strip whitespace
        def clean_val(v):
            if pd.isna(v) or v is None:
                return None
            s = str(v).strip()
            if s.endswith('.0'):
                s = s[:-2]
            return s if s else None

        def extract_vnum_from_comment(comment):
            if not isinstance(comment, str):
                return None
            match = re.search(r'([A-Za-z0-9]+)_\d+', comment)
            if match:
                return clean_val(match.group(1))
            return None

        # Build mapping of Receipt Voucher Number -> EMI number from receipt vouchers
        voucher_to_emi_map = {}
        for _, r_row in df[df["Voucher Type"] == "Receipt Voucher"].iterrows():
            v_num = clean_val(r_row.get("Voucher Number"))
            r_comm = str(r_row.get("Comments", ""))
            r_part = str(r_row.get("Particulars", ""))
            emi_no = None
            if '_' in r_comm:
                try:
                    emi_m = re.search(r'_(\d+)\b', r_comm)
                    if emi_m:
                        emi_no = int(emi_m.group(1))
                    else:
                        emi_no = int(r_comm.split('_')[-1].strip())
                except (ValueError, TypeError):
                    pass
            if v_num and emi_no:
                voucher_to_emi_map[v_num] = (r_part, emi_no)

        updated_count = 0
        updated_items = []
        updated_details = []
        skipped_details = []
        mismatch_details = []

        # Snapshot of all loan installments where received date is ALREADY filled in PostgreSQL
        # User requirement: "if recd date is filled dont sync that"
        already_filled_installments = set()
        for l_rec in Loan.query.filter_by(approval_status='APPROVED', is_deleted=False).all():
            sys_s = [s for s in l_rec.repayment_schedule if s.type != 'manual']
            for s_idx, s_inst in enumerate(sys_s):
                if is_installment_received_filled(s_inst):
                    already_filled_installments.add((l_rec.id, s_idx + 1))
                    if l_rec.loan_ref_id:
                        already_filled_installments.add((l_rec.loan_ref_id.strip().upper(), s_idx + 1))

        if "Voucher Type" in df.columns and "Comments" in df.columns:
            rev_mask = (df["Voucher Type"] == "Payment Voucher") & (df["Comments"].astype(str).str.contains("Reversal EMI", na=False, case=False))

            if "Instrument No." in df.columns:
                reversed_instruments = {clean_val(v) for v in df[rev_mask]["Instrument No."].dropna() if clean_val(v)}

            receipt_vcs = set()
            if "Voucher Number" in df.columns:
                receipt_vcs = {clean_val(v) for v in df[df["Voucher Type"] == "Receipt Voucher"]["Voucher Number"].dropna() if clean_val(v)}

            for rc in df[df["Voucher Type"] == "Receipt Voucher"]["Comments"].dropna().astype(str):
                ev = extract_vnum_from_comment(rc)
                if ev:
                    receipt_vcs.add(ev)

            rev_comments = df[rev_mask]["Comments"].dropna().astype(str).tolist()
            for comment in rev_comments:
                for vnum in receipt_vcs:
                    if vnum and vnum in comment:
                        reversed_vouchers.add(vnum)

            # --- Clear DB received_date for Reversal Payment Vouchers ---
            all_approved_loans_rev = [l for l in Loan.query.filter_by(approval_status='APPROVED', is_deleted=False).all() if l.loan_ref_id]
            for _, rev_row in df[rev_mask].iterrows():
                rev_comm = str(rev_row.get("Comments", ""))
                rev_part = str(rev_row.get("Particulars", ""))
                rev_det = str(rev_row.get("Details", ""))
                row_full_text = f"{rev_part} {rev_det} {rev_comm}"

                rev_vnum = extract_vnum_from_comment(rev_comm)
                if not rev_vnum and "_" in rev_comm:
                    rev_vnum = rev_comm.split('_')[-1].strip()

                if rev_vnum and rev_vnum in voucher_to_emi_map:
                    mapped_text, _ = voucher_to_emi_map[rev_vnum]
                    row_full_text += f" {mapped_text}"

                loan_obj = None
                row_text_upper = row_full_text.upper()
                for l in all_approved_loans_rev:
                    lid = (l.loan_ref_id or "").strip()
                    lid_upper = lid.upper()
                    core_lid = lid_upper[2:] if lid_upper.startswith('JL') else lid_upper
                    if lid in row_full_text or lid_upper in row_text_upper:
                        loan_obj = l
                        break
                    if core_lid and core_lid in row_text_upper:
                        loan_obj = l
                        break

                emi_no = None
                if rev_vnum and rev_vnum in voucher_to_emi_map:
                    _, emi_no = voucher_to_emi_map[rev_vnum]
                elif '_' in rev_comm:
                    try:
                        emi_m = re.search(r'_(\d+)\b', rev_comm)
                        if emi_m:
                            emi_no = int(emi_m.group(1))
                        else:
                            emi_no = int(rev_comm.split('_')[-1].strip())
                    except (ValueError, TypeError):
                        pass

                if loan_obj and emi_no:
                    sys_schedule = [s for s in loan_obj.repayment_schedule if s.type != 'manual']
                    if 1 <= emi_no <= len(sys_schedule):
                        target_inst = sys_schedule[emi_no - 1]
                        # User requirement: "if recd date is filled dont sync that"
                        # If received date is already filled, never clear or re-sync it
                        if (loan_obj.id, emi_no) in already_filled_installments or is_installment_received_filled(target_inst):
                            skipped_details.append(
                                f"Reversal skipped for Loan #{loan_obj.id} ({loan_obj.loan_ref_id}) EMI {emi_no}: "
                                f"Received date is already filled ('{target_inst.received_date}')."
                            )
                            continue

                        if target_inst.received_date and str(target_inst.received_date).strip() and str(target_inst.received_date).strip() != 'dd-mm-yyyy':
                            target_inst.received_date = ''
                            if target_inst.splits:
                                try:
                                    sp_d = json.loads(target_inst.splits) if isinstance(target_inst.splits, str) else target_inst.splits
                                    if isinstance(sp_d, dict):
                                        sp_d['recdDateA'] = ''
                                        sp_d['recdDate'] = ''
                                        target_inst.splits = json.dumps(sp_d)
                                except Exception:
                                    pass
                            updated_count += 1
                            updated_details.append(f"REVERSED & CLEARED: Loan #{loan_obj.id} - {loan_obj.loan_ref_id} - {loan_obj.client_account_name} - EMI {emi_no}")
        # -------------------------------

        # --- Validation: Ensure file matches the account folder ---
        mismatch_found = False
        mismatch_acronym = ""
        valid_sample_count = 0

        # Skip validation for individual imports (where account_name is "Unknown")
        if account_name != 'Unknown':
            for _, row in receipt_df.iterrows():
                try:
                    p_text = str(row.get("Particulars", ""))
                    p_parts = p_text.split('-')
                    if len(p_parts) < 2:
                        continue
                    l_ref = p_parts[-1].strip()

                    loan_obj = Loan.query.filter_by(loan_ref_id=l_ref, is_deleted=False).first()
                    if not loan_obj and not l_ref.upper().startswith('JL'):
                        loan_obj = Loan.query.filter_by(loan_ref_id=f"JL{l_ref}", is_deleted=False).first()
                    if loan_obj:
                        loan_acronym = get_acronym(loan_obj.primary_account_name)
                        if loan_acronym != account_name:
                            mismatch_found = True
                            mismatch_acronym = loan_acronym
                            break
                        valid_sample_count += 1
                        if valid_sample_count >= 5: # Checked 5 and they all match
                            break
                except Exception:
                    continue

            if mismatch_found:
                return {
                    'success': False,
                    'error': f'Incorrect Folder: This file appears to contain data for {mismatch_acronym}, but was uploaded to the {account_name} folder. Please upload to the correct folder.'
                }
        # ---------------------------------------------------------

        # Get all approved loans for substring matching (sorted by length descending for precision)
        all_approved_loans = [l for l in Loan.query.filter_by(approval_status='APPROVED', is_deleted=False).all() if l.loan_ref_id]
        all_approved_loans.sort(key=lambda x: len(x.loan_ref_id), reverse=True)

        for index, row in receipt_df.iterrows():
            try:
                # Robust cleaning for Instrument No
                inst_raw = row.get("Instrument No.")
                instrument_no = clean_val(inst_raw) if pd.notna(inst_raw) else ""

                if instrument_no and instrument_no in reversed_instruments:
                    skipped_details.append(f"Row {index+1}: Instrument No '{instrument_no}' is in Reversal Set")
                    continue

                vnum_raw = row.get("Voucher Number")
                vnum = clean_val(vnum_raw) if pd.notna(vnum_raw) else ""

                if not vnum:
                    vnum = extract_vnum_from_comment(str(row.get("Comments", "")))

                if vnum and vnum in reversed_vouchers:
                    skipped_details.append(f"Row {index+1}: Voucher Number '{vnum}' is in Reversal Set")
                    continue

                particulars = str(row.get("Particulars", ""))
                comments = str(row.get("Comments", ""))
                trans_date_raw = row.get("Transaction Date")

                # --- New Substring Matching Logic ---
                # Check which DB loan ID is present in the daybook particulars or comments
                loan = None
                p_upper = particulars.upper()
                c_upper = comments.upper()
                for l in all_approved_loans:
                    lid = (l.loan_ref_id or "").strip()
                    lid_upper = lid.upper()
                    core_lid = lid_upper[2:] if lid_upper.startswith('JL') else lid_upper
                    if lid in particulars or lid in comments or lid_upper in p_upper or lid_upper in c_upper:
                        loan = l
                        break
                    if core_lid and (core_lid in p_upper or core_lid in c_upper):
                        loan = l
                        break

                if not loan:
                    skipped_details.append(f"Row {index+1}: No matching Loan ID found in Particulars '{particulars}'")
                    continue

                loan_ref_id = loan.loan_ref_id
                # -------------------------------------

                emi_parts = comments.split('_')
                if len(emi_parts) < 2:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): Comments '{comments}' missing '_'")
                    continue
                try:
                    emi_m = re.search(r'_\s*(\d+)\b', comments)
                    if emi_m:
                        emi_no = int(emi_m.group(1))
                    else:
                        emi_no = int(emi_parts[-1].strip())
                except ValueError:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): EMI '{emi_parts[-1]}' not a number")
                    continue

                rec_dt = parse_date_robustly(trans_date_raw)
                if not rec_dt:
                    skipped_details.append(f"Row {index+1} ({loan_ref_id}): Missing or Invalid Transaction Date")
                    continue
                received_date = rec_dt.strftime("%d-%m-%Y")

                if loan.approval_status != 'APPROVED':
                    skipped_details.append(f"{loan_ref_id}: Status '{loan.approval_status}' is not APPROVED")
                    continue

                system_schedule = [s for s in loan.repayment_schedule if s.type != 'manual']
                if emi_no < 1 or emi_no > len(system_schedule):
                    skipped_details.append(f"{loan_ref_id}: EMI {emi_no} out of range (Total {len(system_schedule)})")
                    continue

                target_installment = system_schedule[emi_no - 1]

                loan_key_id = (loan.id, emi_no)
                loan_key_ref = (loan.loan_ref_id.strip().upper(), emi_no) if loan.loan_ref_id else None

                # User requirement: "if recd date is filled dont sync that"
                # Strictly skip if received date is already filled in received_date or splits
                if (loan_key_id in already_filled_installments or 
                    (loan_key_ref and loan_key_ref in already_filled_installments) or 
                    is_installment_received_filled(target_installment)):
                    existing_dt = str(target_installment.received_date or '').strip()
                    if not existing_dt and target_installment.splits:
                        try:
                            sp_t = json.loads(target_installment.splits) if isinstance(target_installment.splits, str) else target_installment.splits
                            existing_dt = sp_t.get('recdDateA') or sp_t.get('recdDate') or ''
                        except Exception:
                            pass
                    skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Already has received date '{existing_dt or 'filled'}', skipping sync.")
                    continue

                try:
                    due_dt = parse_date_robustly(target_installment.date)
                    if not due_dt:
                        skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Installment due date '{target_installment.date}' format invalid")
                        continue
                except Exception as e:
                    skipped_details.append(f"{loan_ref_id} EMI {emi_no}: Date Error ({str(e)})")
                    continue

                # Compare Credit with total installment amount - checked only after EMI number and Date checks pass
                expected_amount = target_installment.amount

                credit_val = row.get("Credit")
                try:
                    # Clean and parse Credit amount
                    credit_str = str(credit_val).replace(',', '').strip() if pd.notna(credit_val) else "0"
                    credit_amount = float(credit_str)
                except ValueError:
                    credit_amount = 0.0

                if round(abs(expected_amount - credit_amount), 2) > 0.05:
                    mismatch_details.append(
                        f"Row {index+1} ({loan_ref_id} EMI {emi_no}): Installment amount is {expected_amount:.2f}, but Credit column has {credit_amount:.2f}."
                    )
                    continue

                target_installment.received_date = received_date

                # Update splits JSON if present (only received date)
                if target_installment.splits:
                    try:
                        sp_data = json.loads(target_installment.splits) if isinstance(target_installment.splits, str) else target_installment.splits
                        if isinstance(sp_data, dict):
                            sp_data['recdDateA'] = received_date
                            sp_data['recdDate'] = received_date
                            target_installment.splits = json.dumps(sp_data)
                    except Exception:
                        pass

                # Mark as filled so subsequent rows in this run will not re-sync it
                already_filled_installments.add(loan_key_id)
                if loan_key_ref:
                    already_filled_installments.add(loan_key_ref)

                updated_count += 1
                updated_items.append({
                    'id': f"{loan.id}-{target_installment.id}",
                    'loanId': loan.loan_ref_id or f"JL-{loan.id}",
                    'dbLoanId': loan.id,
                    'clientName': loan.client_account_name or 'Client',
                    'emiNo': emi_no,
                    'emiDate': target_installment.date or '',
                    'receivedDate': received_date,
                    'amount': float(target_installment.amount or 0),
                    'primaryAccount': loan.primary_account_name or '',
                    'status': 'Collected'
                })
                updated_details.append(f"Loan #{loan.id} - {loan.loan_ref_id} - {loan.client_account_name} - EMI {emi_no} ({received_date})")

            except Exception as e_row:
                skipped_details.append(f"Row {index+1} error: {e_row}")
                continue

        db.session.commit()
        message = f'Successfully updated {updated_count} installments from Day Book.' if updated_count > 0 else "No updates"
        return {
            'success': True,
            'message': message,
            'updated_count': updated_count,
            'updated_items': updated_items,
            'updated_details': updated_details,
            'skipped_details': skipped_details,
            'mismatch_details': mismatch_details
        }
    except Exception as e:
        db.session.rollback()
        return {'success': False, 'error': str(e)}
    finally:
        if ctx:
            try: ctx.pop()
            except Exception: pass


process_day_book_for_joint_loans = process_day_book_file_internal


def run_sftp_sync(process_day_book_func=None, target_folder=None):
    """Execute complete SFTP sync: download daybook files and process each with process_day_book_func."""
    if process_day_book_func is None:
        process_day_book_func = process_day_book_for_joint_loans
    if target_folder is None:
        target_folder = DEFAULT_DOWNLOAD_FOLDER

    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    config = load_sftp_config(hide_password=False)

    try:
        download_err = None
        try:
            downloaded = download_sftp_daybooks(target_folder, config)
        except Exception as e_dl:
            download_err = str(e_dl)
            downloaded = []

        # If remote download returned no files or threw an error, check local target_folder as fallback
        if not downloaded and os.path.exists(target_folder):
            local_files = [
                f for f in os.listdir(target_folder)
                if not f.startswith('.') and not f.startswith('~$') and f.lower().endswith(('.xlsx', '.xls', '.csv'))
            ]
            def local_sort_key(f):
                m = re.search(r'(\d{4})[-_]?(\d{2})[-_]?(\d{2})', f)
                d_num = int(m.group(1) + m.group(2) + m.group(3)) if m else 0
                try:
                    m_t = os.path.getmtime(os.path.join(target_folder, f))
                except Exception:
                    m_t = 0
                return (d_num, m_t)

            local_files.sort(key=local_sort_key, reverse=True)
            for lf in local_files[:5]:
                downloaded.append((os.path.join(target_folder, lf), lf))

        if not downloaded:
            err_msg = download_err or "Connected to SFTP, but no Excel (.xlsx/.xls) DayBook files were found."
            sync_result = {
                "success": False if download_err else True,
                "message": err_msg,
                "total_files": 0,
                "updated_count": 0,
                "updated_items": [],
                "updated_details": [],
                "skipped_details": [err_msg],
                "mismatch_details": []
            }
        else:
            total_updated = 0
            all_updated_items = []
            all_updated_details = []
            all_skipped_details = []
            all_mismatch_details = []

            for local_path, fname in downloaded:
                acc_name = 'Unknown'
                if '_DayBook' in fname:
                    cand = fname.split('_DayBook')[0].strip()
                    if cand and not cand.isdigit() and not re.match(r'^\d{4}', cand):
                        acc_name = cand
                elif '_' in fname:
                    cand = fname.split('_')[0].strip()
                    if cand and not cand.isdigit() and not re.match(r'^\d{4}', cand):
                        acc_name = cand

                res = process_day_book_func(local_path, account_name=acc_name)

                if res.get('success'):
                    u_cnt = res.get('updated_count', 0)
                    total_updated += u_cnt
                    all_updated_items.extend(res.get('updated_items', []))
                    all_updated_details.extend([f"[{fname}] {d}" for d in res.get('updated_details', [])])
                    all_skipped_details.extend([f"[{fname}] {d}" for d in res.get('skipped_details', [])])
                    all_mismatch_details.extend([f"[{fname}] {d}" for d in res.get('mismatch_details', [])])
                else:
                    all_skipped_details.append(f"[{fname}] Processing failed: {res.get('error', 'Unknown error')}")

            if download_err:
                msg = f"Processed {len(downloaded)} DayBook file(s) (SFTP notice: {download_err}), updated {total_updated} installment(s)."
            else:
                msg = f"SFTP Sync Completed: Processed {len(downloaded)} file(s), updated {total_updated} installment(s)."

            sync_result = {
                "success": True,
                "message": msg,
                "total_files": len(downloaded),
                "updated_count": total_updated,
                "updated_items": all_updated_items,
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

                # Normalize scheduled_time to HH:MM format (e.g. '9:00' -> '09:00')
                parts = scheduled_time.split(":")
                if len(parts) == 2:
                    try:
                        scheduled_time = f"{int(parts[0]):02d}:{int(parts[1]):02d}"
                    except Exception:
                        pass

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
