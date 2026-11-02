import sys
import os

_bdir = os.path.dirname(os.path.abspath(__file__))
_proot = os.path.dirname(_bdir)
if _bdir not in sys.path:
    sys.path.insert(0, _bdir)
if _proot not in sys.path:
    sys.path.append(_proot)

import re
import datetime
import time
import json
import openpyxl

try:
    from models import db, Loan
except ImportError:
    from backend.models import db, Loan

DEFAULT_EXCEL_BASE_DIR = r"X:\ASHWITHA EVANGELIN\ACCOUNT STATEMENTS\PAYMENT LIST\NEW PAYMENT LIST\Payment details - 2024 & 2025\JAN - DEC - 2026"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uncreated_loans_config.json')

def get_configured_base_dir():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                custom = cfg.get('base_dir')
                if custom and isinstance(custom, str) and custom.strip():
                    return custom.strip()
        except Exception:
            pass
    return DEFAULT_EXCEL_BASE_DIR

def save_configured_base_dir(path):
    try:
        clean_path = path.strip() if path else DEFAULT_EXCEL_BASE_DIR
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'base_dir': clean_path,
                'updated_at': datetime.datetime.now().isoformat()
            }, f, indent=2)
    except Exception as e:
        print(f"Error saving uncreated_loans_config: {e}")

_cache = {
    'timestamp': 0,
    'data': None,
    'base_dir': None
}

def is_green_fill(fill):
    if not fill or fill.fill_type != 'solid':
        return False
    sc = fill.start_color
    if not sc:
        return False
    # Office Theme accent6 (green) is theme index 9
    if sc.type == 'theme' and sc.theme == 9:
        return True
    # Explicit RGB green shades
    if sc.type == 'rgb' and isinstance(sc.rgb, str):
        rgb_str = sc.rgb.upper()
        if len(rgb_str) == 8:
            r = int(rgb_str[2:4], 16)
            g = int(rgb_str[4:6], 16)
            b = int(rgb_str[6:8], 16)
            if g > 140 and g > r and g > b:
                return True
            if rgb_str in (
                'FFE2EFDA', '00E2EFDA', 'FFC6EFCE', '00C6EFCE', 
                'FFD9EAD3', '00D9EAD3', 'FF92D050', '0092D050', 
                'FF70AD47', '0070AD47', 'FF385723', 'FF548235',
                'FFA9D08E', 'FF00B050'
            ):
                return True
    return False

def extract_primary_tag(filename):
    m = re.search(r'\((.*?)\)', filename)
    if m:
        return m.group(1).strip().replace('.', '')
    m2 = re.search(r'PAYMENT\s+LIST\s*-\s*([A-Za-z0-9]+)', filename, re.IGNORECASE)
    if m2:
        return m2.group(1).strip()
    return None

def parse_date_str(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime('%d-%m-%Y')
    if val:
        s = str(val).strip()
        # YYYY-MM-DD
        m = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})', s)
        if m:
            return f"{int(m.group(3)):02d}-{int(m.group(2)):02d}-{m.group(1)}"
        # DD-MM-YYYY or D-M-YYYY
        m2 = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})', s)
        if m2:
            return f"{int(m2.group(1)):02d}-{int(m2.group(2)):02d}-{m2.group(3)}"
        return s
    return None

def clean_client_name(name):
    if not name:
        return ''
    s = str(name).strip()
    # Take first line if multiline
    s = s.split('\n')[0].strip()
    # Remove trailing "- SHARE", "- SHARE TO ...", "- HL", etc.
    s = re.sub(r'\s*-\s*share\b.*', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r'\s*-\s*hl\b.*', '', s, flags=re.IGNORECASE).strip()
    return s.strip()

def clean_alphanumeric(s):
    return re.sub(r'[^a-z0-9]+', '', str(s or '').lower())

def strip_jl_prefix(s):
    if not s:
        return ''
    cleaned = str(s).strip()
    # Remove leading 'JL' or 'JL-' or 'JL_' or 'JL ' (case-insensitive)
    cleaned = re.sub(r'^JL[-_\s]*', '', cleaned, flags=re.IGNORECASE).strip()
    return clean_alphanumeric(cleaned)

def get_id_match_keys(lid_str):
    """
    Builds a comprehensive set of normalized matching keys for a Loan ID string.
    Supports variations with or without 'JL' prefix, with or without leading zeroes in digits,
    and with or without separators (e.g. 'AS000598', 'JLAS000598', 'JL-AS-000598', 'AS598', 'JLAS598').
    """
    if not lid_str:
        return set()
    s = str(lid_str).strip()
    if s in ('-', '—', 'None', '', 'null'):
        return set()

    keys = set()
    clean = clean_alphanumeric(s)
    if clean:
        keys.add(clean)

    # Strip JL prefix
    no_jl = re.sub(r'^JL[-_\s]*', '', s, flags=re.IGNORECASE).strip()
    clean_no_jl = clean_alphanumeric(no_jl)
    if clean_no_jl:
        keys.add(clean_no_jl)
        keys.add(f"jl{clean_no_jl}")

    # Normalize alphanumeric by removing leading zeroes between letters and digits:
    # e.g. 'as000598' -> 'as598', 'jlas000598' -> 'jlas598'
    norm = re.sub(r'([a-z]+)0+(\d+)', r'\1\2', clean_no_jl)
    if norm:
        keys.add(norm)
        keys.add(f"jl{norm}")

    return keys

def ensure_drive_connected(path):
    if path and len(path) >= 2 and path[1] == ':':
        drive = path[:2].upper()
        try:
            import subprocess
            subprocess.run(f"net use {drive}", shell=True, capture_output=True, timeout=5)
        except Exception:
            pass

def scan_excel_files(base_dir=None):
    target_dir = base_dir or DEFAULT_EXCEL_BASE_DIR
    if not os.path.exists(target_dir):
        ensure_drive_connected(target_dir)
    if not os.path.exists(target_dir):
        raise FileNotFoundError(f"Directory not accessible: {target_dir}")

    folders = sorted([f for f in os.listdir(target_dir) if os.path.isdir(os.path.join(target_dir, f))])
    all_loans = []
    primary_accounts_set = set()

    # Regex to detect standard loan ID patterns like AS000598, JLAS000598, SCS001883, FC000072
    loan_id_pattern = re.compile(r'^(JL[-_\s]*)?[A-Z]{1,5}[-_\s]*0*\d{2,8}$', re.IGNORECASE)

    for folder in folders:
        folder_path = os.path.join(target_dir, folder)
        files = sorted([f for f in os.listdir(folder_path) if f.endswith('.xlsx') and not f.startswith('~$')])
        
        for file in files:
            primary_tag = extract_primary_tag(file)
            if primary_tag:
                primary_accounts_set.add(primary_tag.upper())
                
            filepath = os.path.join(folder_path, file)
            try:
                wb = openpyxl.load_workbook(filepath, data_only=True)
                ws = wb.active

                header_row = 2
                for r in range(1, 6):
                    vals = [str(ws.cell(row=r, column=c).value or '').strip().lower() for c in range(1, 16)]
                    if any('party' in v or 'client' in v or 'borrower' in v for v in vals):
                        header_row = r
                        break

                col_date = 1
                col_party = 2
                col_pay_share = 3
                col_repay_share = 4
                col_acc = 6
                col_payment = 7
                col_repayment = 8
                col_terms = 9
                col_loan_id = 12

                for c in range(1, 18):
                    h_val = str(ws.cell(row=header_row, column=c).value or '').strip().lower()
                    if 'date' in h_val and c <= 2:
                        col_date = c
                    elif 'party' in h_val or 'client' in h_val or 'name' in h_val or 'borrower' in h_val:
                        col_party = c
                    elif 'pay' in h_val and 'share' in h_val or h_val == 'pay':
                        col_pay_share = c
                    elif 'repay' in h_val and 'share' in h_val or h_val == 'repay':
                        col_repay_share = c
                    elif h_val in ('acc', 'account', 'a/c'):
                        col_acc = c
                    elif ('repayment' in h_val or 'repay' in h_val) and c > 5:
                        col_repayment = c
                    elif ('payment' in h_val or 'principal' in h_val or 'disbursed' in h_val) and c > 5:
                        col_payment = c
                    elif 'terms' in h_val or 'term' in h_val or 'tenure' in h_val:
                        col_terms = c
                    elif any(k in h_val for k in ('loan', 'lan', 'sanction', 'agreement', 'file no')):
                        col_loan_id = c

                current_main_row = None
                current_sub_shares = []

                for r in range(header_row + 1, ws.max_row + 1):
                    cell_date = ws.cell(row=r, column=col_date)
                    cell_party = ws.cell(row=r, column=col_party)
                    cell_pay_share = ws.cell(row=r, column=col_pay_share)

                    date_val = cell_date.value
                    party_val = cell_party.value
                    pay_share_val = cell_pay_share.value

                    has_green = is_green_fill(cell_party.fill) or is_green_fill(cell_pay_share.fill)
                    is_sub_row = bool(has_green and party_val and (date_val is None or str(date_val).strip() == ''))

                    if is_sub_row and current_main_row:
                        rep_share = ws.cell(row=r, column=col_repay_share).value
                        current_sub_shares.append({
                            'account': str(party_val).strip(),
                            'principal': float(pay_share_val) if pay_share_val and str(pay_share_val).strip() not in ('-', '—') and not isinstance(pay_share_val, str) else (float(re.sub(r'[^\d.]', '', str(pay_share_val))) if pay_share_val and re.search(r'\d', str(pay_share_val)) else 0.0),
                            'repayment': float(rep_share) if rep_share and str(rep_share).strip() not in ('-', '—') and not isinstance(rep_share, str) else (float(re.sub(r'[^\d.]', '', str(rep_share))) if rep_share and re.search(r'\d', str(rep_share)) else None),
                        })
                    else:
                        if current_main_row and current_sub_shares:
                            current_main_row['shares'] = current_sub_shares
                            all_loans.append(current_main_row)
                        current_main_row = None
                        current_sub_shares = []

                        if date_val and party_val:
                            lid = ws.cell(row=r, column=col_loan_id).value

                            # Intelligent Loan ID recovery: if col_loan_id value is empty, '-' or does not look like a loan ID,
                            # scan columns 10 to 18 for any cell matching loan ID pattern (e.g. AS000598, JLAS000546)
                            is_valid_lid = bool(lid and str(lid).strip() not in ('-', '—', 'None', '', 'null'))
                            if not is_valid_lid or (is_valid_lid and not loan_id_pattern.match(str(lid).strip())):
                                for col_scan in range(10, min(ws.max_column + 1, 20)):
                                    val_scan = ws.cell(row=r, column=col_scan).value
                                    if val_scan:
                                        v_str = str(val_scan).strip()
                                        if loan_id_pattern.match(v_str):
                                            lid = v_str
                                            break

                            tot_p = ws.cell(row=r, column=col_payment).value
                            tot_r = ws.cell(row=r, column=col_repayment).value
                            terms_val = ws.cell(row=r, column=col_terms).value
                            acc_val = ws.cell(row=r, column=col_acc).value

                            tot_p_num = float(tot_p) if tot_p and not isinstance(tot_p, str) else (float(re.sub(r'[^\d.]', '', str(tot_p))) if tot_p and re.search(r'\d', str(tot_p)) else 0.0)
                            tot_r_num = float(tot_r) if tot_r and not isinstance(tot_r, str) else (float(re.sub(r'[^\d.]', '', str(tot_r))) if tot_r and re.search(r'\d', str(tot_r)) else 0.0)

                            clean_lid = None
                            raw_lid = None
                            if lid and str(lid).strip() not in ('-', '—', 'None', ''):
                                raw_lid = str(lid).strip()
                                # Remove JL prefix if present after collecting from excel files
                                lid_without_jl = re.sub(r'^JL[-_\s]*', '', raw_lid, flags=re.IGNORECASE).strip()
                                clean_lid = lid_without_jl if lid_without_jl else raw_lid

                            current_main_row = {
                                'folder': folder,
                                'file': file,
                                'row': r,
                                'date': parse_date_str(date_val),
                                'raw_client_name': str(party_val).strip(),
                                'client_name': clean_client_name(party_val),
                                'primary_account': primary_tag or str(acc_val or '').strip(),
                                'total_principal': tot_p_num,
                                'total_repayment': tot_r_num,
                                'terms': str(terms_val).strip() if terms_val else '',
                                'loan_id': clean_lid or raw_lid,
                                'raw_loan_id': raw_lid,
                            }

                if current_main_row and current_sub_shares:
                    current_main_row['shares'] = current_sub_shares
                    all_loans.append(current_main_row)

            except Exception as e:
                print(f"Error processing {filepath}: {e}")

    return all_loans, sorted(list(primary_accounts_set)), folders

def get_uncreated_joint_loans_audit(force_refresh=False, base_dir=None):
    global _cache
    now = time.time()
    
    if base_dir and str(base_dir).strip():
        target_dir = str(base_dir).strip()
        save_configured_base_dir(target_dir)
    else:
        target_dir = get_configured_base_dir()

    # Cache for 10 minutes unless force_refresh
    if not force_refresh and _cache['data'] and _cache['base_dir'] == target_dir and (now - _cache['timestamp'] < 600):
        return _cache['data']

    raw_loans, primary_accounts, folders = scan_excel_files(target_dir)

    # 1. Fetch from current SQLAlchemy DB (active non-deleted loans, including where is_deleted is NULL)
    try:
        db_loans = Loan.query.filter(
            db.or_(Loan.is_deleted == False, Loan.is_deleted.is_(None))
        ).all()
    except Exception as e_q:
        try:
            db_loans = Loan.query.all()
        except Exception:
            db_loans = []

    db_list = []
    seen_db_refs = set()

    for l in db_loans:
        ref = str(l.loan_ref_id or '').strip()
        keys = get_id_match_keys(ref)
        if l.id:
            keys.add(clean_alphanumeric(str(l.id)))
            keys.add(f"jl{l.id}")
        db_list.append({
            'id': l.id,
            'loan_ref_id': ref,
            'id_keys': keys,
            'client_name': str(l.client_account_name or '').strip(),
            'clean_client_name': clean_alphanumeric(l.client_account_name),
            'loan_date': parse_date_str(l.loan_date),
            'amount': float(l.loan_amount or 0),
            'primary_account': str(l.primary_account_name or '').strip(),
            'approval_status': str(l.approval_status or '').strip()
        })
        if ref:
            seen_db_refs.add(clean_alphanumeric(ref))

    # 2. Also check if alternate DB (e.g. accounts_db if current is accounts_new, or vice-versa) has loans
    try:
        from db import PG_CREDENTIALS
        current_db = PG_CREDENTIALS.get('dbname', 'accounts_new')
        alt_db = 'accounts_db' if current_db != 'accounts_db' else 'accounts_new'
        import psycopg2
        alt_conn = psycopg2.connect(
            dbname=alt_db,
            user=PG_CREDENTIALS.get('user', 'postgres'),
            password=PG_CREDENTIALS.get('password', '1234'),
            host=PG_CREDENTIALS.get('host', 'localhost'),
            port=PG_CREDENTIALS.get('port', 5432),
            connect_timeout=2
        )
        alt_cur = alt_conn.cursor()
        alt_cur.execute("""
            SELECT id, loan_ref_id, client_account_name, loan_date, loan_amount, primary_account_name, approval_status 
            FROM loans 
            WHERE is_deleted = false OR is_deleted IS NULL
        """)
        for r in alt_cur.fetchall():
            alt_id, alt_ref, alt_client, alt_date, alt_amount, alt_pri, alt_status = r
            alt_ref_clean = clean_alphanumeric(alt_ref or '')
            if not alt_ref_clean or alt_ref_clean not in seen_db_refs:
                ref_str = str(alt_ref or '').strip()
                keys = get_id_match_keys(ref_str)
                if alt_id:
                    keys.add(clean_alphanumeric(str(alt_id)))
                    keys.add(f"jl{alt_id}")
                db_list.append({
                    'id': f"alt_{alt_id}",
                    'loan_ref_id': ref_str,
                    'id_keys': keys,
                    'client_name': str(alt_client or '').strip(),
                    'clean_client_name': clean_alphanumeric(alt_client),
                    'loan_date': parse_date_str(alt_date),
                    'amount': float(alt_amount or 0),
                    'primary_account': str(alt_pri or '').strip(),
                    'approval_status': str(alt_status or '').strip()
                })
                if alt_ref_clean:
                    seen_db_refs.add(alt_ref_clean)
        alt_cur.close()
        alt_conn.close()
    except Exception:
        pass

    structured_loans = []
    total_not_created = 0
    total_not_created_amount = 0.0
    total_created = 0
    total_created_amount = 0.0

    for idx, jl in enumerate(raw_loans):
        primary_acc = (jl.get('primary_account') or '').upper().strip()
        shares = jl.get('shares') or []

        # Find primary share vs secondary shares
        pri_share_obj = None
        sec_share_objs = []

        for s in shares:
            acc_name = s['account'].upper().strip()
            if acc_name == primary_acc and pri_share_obj is None:
                pri_share_obj = s
            else:
                sec_share_objs.append(s)

        # Fallback if primary share wasn't explicitly labeled with primary_acc
        if not pri_share_obj and shares:
            pri_share_obj = shares[0]
            sec_share_objs = shares[1:]

        pri_principal = pri_share_obj['principal'] if pri_share_obj else 0.0
        pri_repayment = pri_share_obj.get('repayment') if pri_share_obj else None

        tot_p = jl['total_principal']
        # If total principal from row is 0 or less than sum of shares, compute from sum of shares
        shares_principal_sum = sum(s.get('principal', 0.0) for s in shares)
        if tot_p == 0.0 and shares_principal_sum > 0:
            tot_p = shares_principal_sum

        tot_r = jl['total_repayment']
        shares_repay_sum = sum(s.get('repayment', 0.0) for s in shares if s.get('repayment') is not None)
        if tot_r == 0.0 and shares_repay_sum > 0:
            tot_r = shares_repay_sum

        # Calculate primary %
        pri_pct = round((pri_principal / tot_p * 100), 1) if tot_p > 0 else 0.0

        # Build secondary share list
        sec_accounts = []
        for s in sec_share_objs:
            s_p = s.get('principal', 0.0)
            s_r = s.get('repayment')
            s_pct = round((s_p / tot_p * 100), 1) if tot_p > 0 else 0.0
            sec_accounts.append({
                'account': s['account'],
                'principal': s_p,
                'repayment': s_r,
                'share_pct': s_pct
            })

        # Match against DB using multi-tier strategy
        matched_db = None
        excel_lid = jl.get('loan_id')
        raw_excel_lid = jl.get('raw_loan_id')

        # Tier 1: Match by Loan ID (using get_id_match_keys for seamless matching across AS000598, JLAS000598, AS598, etc.)
        candidate_id_keys = get_id_match_keys(excel_lid) | get_id_match_keys(raw_excel_lid)
        if candidate_id_keys:
            for db_l in db_list:
                db_keys = db_l.get('id_keys') or get_id_match_keys(db_l['loan_ref_id'])
                if candidate_id_keys & db_keys:
                    matched_db = db_l
                    break

        # Tier 2: Match by Date + Client Name (fallback if Tier 1 did not find a match)
        if not matched_db and jl.get('date') and jl.get('client_name'):
            jl_date = parse_date_str(jl['date'])
            clean_client = clean_alphanumeric(jl['client_name'])
            clean_raw_client = clean_alphanumeric(jl.get('raw_client_name'))
            for db_l in db_list:
                db_date = parse_date_str(db_l['loan_date'])
                if db_date and jl_date and db_date == jl_date:
                    c_db_client = db_l['clean_client_name']
                    if (clean_client and c_db_client and (clean_client in c_db_client or c_db_client in clean_client)) or \
                       (clean_raw_client and c_db_client and (clean_raw_client in c_db_client or c_db_client in clean_raw_client)):
                        matched_db = db_l
                        break

        # Tier 3: Match by Client Name + Amount (fallback if Date format varied)
        if not matched_db and jl.get('client_name') and tot_p > 0:
            clean_client = clean_alphanumeric(jl['client_name'])
            if len(clean_client) >= 4:
                for db_l in db_list:
                    c_db_client = db_l['clean_client_name']
                    if clean_client and c_db_client and (clean_client in c_db_client or c_db_client in clean_client):
                        db_amt = float(db_l.get('amount') or 0)
                        if db_amt > 0 and (abs(db_amt - tot_p) < 1.0 or abs(db_amt - pri_principal) < 1.0):
                            matched_db = db_l
                            break

        is_created = bool(matched_db)
        if is_created:
            total_created += 1
            total_created_amount += tot_p
        else:
            total_not_created += 1
            total_not_created_amount += tot_p

        # Display loan ID: prefer matched DB loan ref ID if matched, else clean excel loan ID or raw ID
        display_loan_id = (matched_db['loan_ref_id'] if matched_db and matched_db.get('loan_ref_id') else (excel_lid or raw_excel_lid))

        structured_loans.append({
            'id': f"audit_{jl['folder']}_{display_loan_id or idx}",
            'unique_key': f"{jl['folder']}_{jl['file']}_{jl['row']}",
            'folder': jl['folder'],
            'file': jl['file'],
            'row': jl['row'],
            'loan_date': jl['date'],
            'loan_id': display_loan_id,
            'client_name': jl['client_name'],
            'raw_client_name': jl['raw_client_name'],
            'primary_account': primary_acc,
            'primary_principal': pri_principal,
            'primary_repayment': pri_repayment,
            'primary_share_pct': pri_pct,
            'secondary_accounts': sec_accounts,
            'secondary_accounts_str': ", ".join(s['account'] for s in sec_accounts),
            'total_principal': tot_p,
            'total_repayment': tot_r,
            'terms': jl['terms'],
            'is_created': is_created,
            'matched_db_loan': {
                'id': matched_db['id'],
                'loan_ref_id': matched_db['loan_ref_id'],
                'client_name': matched_db['client_name'],
                'amount': matched_db['amount'],
                'approval_status': matched_db['approval_status']
            } if matched_db else None
        })

    # Sort loans: Not created first, then by date descending
    structured_loans.sort(key=lambda x: (x['is_created'], x['loan_date'] or ''), reverse=False)

    result = {
        'success': True,
        'scan_timestamp': datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p"),
        'base_dir': target_dir,
        'default_dir': DEFAULT_EXCEL_BASE_DIR,
        'is_custom_dir': (target_dir.rstrip(r'\/').lower() != DEFAULT_EXCEL_BASE_DIR.rstrip(r'\/').lower()),
        'folders': folders,
        'primary_accounts': primary_accounts,
        'summary': {
            'total_found': len(structured_loans),
            'not_created_count': total_not_created,
            'not_created_amount': total_not_created_amount,
            'created_count': total_created,
            'created_amount': total_created_amount
        },
        'loans': structured_loans
    }

    _cache = {
        'timestamp': now,
        'data': result,
        'base_dir': target_dir
    }

    return result
