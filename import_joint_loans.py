"""
Project: LoanDesk / Accounts_New
Description: Script to import/create Joint Loans in accounts_new by reading files
             from 'New folder', extracting loan document data, querying matching
             loan details, secondary accounts, repayment schedules (with recd/payout dates
             and partial splits), and penal interest (manual schedule rows) from
             the source accounts_db database, and generating audit history under 'System Admin'.
"""

import os
import sys
import json
import datetime
import argparse
import psycopg2
from psycopg2.extras import RealDictCursor

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Ensure backend folder is accessible for module imports
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from db import PG_CREDENTIALS
except ImportError:
    PG_CREDENTIALS = {
        'user': 'postgres',
        'password': '1234',
        'host': 'localhost',
        'port': 5432
    }

try:
    from read_pdf import extract_document_data
except ImportError as e:
    print(f"Warning: Failed to import extract_document_data from read_pdf: {e}")
    extract_document_data = None


def get_pg_connection(dbname):
    """Establishes connection to specified PostgreSQL database."""
    return psycopg2.connect(
        dbname=dbname,
        user=PG_CREDENTIALS.get('user', 'postgres'),
        password=PG_CREDENTIALS.get('password', '1234'),
        host=PG_CREDENTIALS.get('host', 'localhost'),
        port=PG_CREDENTIALS.get('port', 5432)
    )


def build_system_admin_history(loan_ref_id, secondary_names, now=None):
    """
    Constructs comprehensive chronological audit history using 'System Admin'.
    Satisfies requirements for Header, Requests, and JointLoan frontend components.
    """
    if now is None:
        now = datetime.datetime.now()

    now_str = now.strftime("%d-%m-%Y %I:%M %p")
    iso_str = now.isoformat()
    sec_str = ", ".join(secondary_names) if secondary_names else "Secondary Partner"
    ts = int(now.timestamp() * 1000)

    creation_entry = {
        'id': f"hist_{ts}_created",
        'type': 'loan_created',
        'title': 'Loan Created & Initialized',
        'description': f"Joint loan facility ({loan_ref_id}) imported and initialized by System Admin.",
        'timestamp': now_str,
        'isoDate': iso_str,
        'userName': 'System Admin',
        'userRole': 'admin',
        'userEmployeeCode': 'admin',
        'accountName': sec_str
    }

    sec_approval_entry = {
        'id': f"hist_{ts + 100}_sec",
        'type': 'sec_manager_approval',
        'title': 'Secondary Partner Share Approved',
        'description': f"Secondary partner share verification approved by System Admin for {sec_str}.",
        'timestamp': now_str,
        'isoDate': iso_str,
        'userName': 'System Admin',
        'userRole': 'admin',
        'userEmployeeCode': 'admin',
        'accountName': sec_str
    }

    admin_approval_entry = {
        'id': f"hist_{ts + 200}_admin",
        'type': 'admin_approval',
        'title': 'Admin Final Approval Granted',
        'description': f"Facility officially authorized and activated for live loan servicing by Administrator System Admin (admin). Full access unlocked.",
        'timestamp': now_str,
        'isoDate': iso_str,
        'userName': 'System Admin',
        'userRole': 'admin',
        'userEmployeeCode': 'admin'
    }

    return [creation_entry, sec_approval_entry, admin_approval_entry]


def find_source_loan(source_cur, loan_number=None, client_name=None, override_loan_id=None):
    """
    Matches the loan in source accounts_db database using loan_id, loan_ref_id, or client name.
    """
    if override_loan_id:
        source_cur.execute("SELECT * FROM loans WHERE id = %s AND is_deleted = false", (override_loan_id,))
        return source_cur.fetchone()

    # Match by loan_ref_id variations (e.g. FC000072 matches JLFC000072)
    if loan_number:
        clean_no = loan_number.strip().upper()
        source_cur.execute(
            """
            SELECT * FROM loans 
            WHERE (
                loan_ref_id = %s 
                OR loan_ref_id = %s 
                OR UPPER(loan_ref_id) LIKE %s
            )
            AND is_deleted = false
            ORDER BY id ASC LIMIT 1
            """,
            (clean_no, f"JL{clean_no}", f"%{clean_no}%")
        )
        row = source_cur.fetchone()
        if row:
            return row

    # Match by client_account_name
    if client_name:
        clean_name = client_name.strip()
        source_cur.execute(
            """
            SELECT * FROM loans 
            WHERE (
                UPPER(client_account_name) = UPPER(%s)
                OR UPPER(client_account_name) LIKE UPPER(%s)
            )
            AND is_deleted = false
            ORDER BY id ASC LIMIT 1
            """,
            (clean_name, f"%{clean_name}%")
        )
        row = source_cur.fetchone()
        if row:
            return row

    return None


def fetch_source_loan_details(source_cur, loan_id):
    """
    Fetches secondary accounts, repayment schedule, and penal interest (manual type)
    from source accounts_db database using loan_id.
    Does not collect payout approval columns from source accounts_db, allowing auto-approval under System Admin.
    """
    # 1. Secondary accounts (name, principal/share, percentage/share %)
    source_cur.execute(
        """
        SELECT id, account_name, percentage, share, interest_amount, tds
        FROM remaining_accounts
        WHERE loan_id = %s
        ORDER BY id ASC
        """,
        (loan_id,)
    )
    secondary_accounts = source_cur.fetchall()

    # Query only core repayment schedule columns from source DB
    # (avoiding missing approval columns like payout_approval_status)
    source_cur.execute(
        """
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'repayment_schedule'
        """
    )
    col_rows = source_cur.fetchall()
    existing_cols = set(r['column_name'] if isinstance(r, dict) else r[0] for r in col_rows)

    core_cols = ['id', 'amount', 'interest_amount', 'cheque_no', 'date', 'received_date', 'payment_date', 'remarks', 'type', 'splits']
    select_cols = [c for c in core_cols if c in existing_cols]
    select_clause = ", ".join(select_cols) if select_cols else "*"

    type_condition = "AND (type IS NULL OR type != 'manual')" if 'type' in existing_cols else ""
    source_cur.execute(
        f"""
        SELECT {select_clause}
        FROM repayment_schedule
        WHERE loan_id = %s {type_condition}
        ORDER BY id ASC
        """,
        (loan_id,)
    )
    regular_schedule = source_cur.fetchall()

    penal_interest_rows = []
    if 'type' in existing_cols:
        source_cur.execute(
            f"""
            SELECT {select_clause}
            FROM repayment_schedule
            WHERE loan_id = %s AND type = 'manual'
            ORDER BY id ASC
            """,
            (loan_id,)
        )
        penal_interest_rows = source_cur.fetchall()

    return secondary_accounts, regular_schedule, penal_interest_rows


def fetch_accounts_name_lookup(target_conn):
    """
    Fetches account names from accounts_name table in accounts_new database.
    Returns:
      accounts_list: list of dicts [{'id', 'name', 'acronym', 'color', 'type', 'is_need_approval'}]
      lookup_map: dict mapping normalized keys (upper case name, upper case acronym, cleaned alphanumeric) to canonical account row
    """
    cur = target_conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT id, name, acronym, color, type, is_need_approval FROM accounts_name")
    rows = cur.fetchall()
    cur.close()

    lookup_map = {}
    for r in rows:
        c_name = str(r['name'] or '').strip()
        acronym = str(r.get('acronym') or '').strip()

        if c_name:
            lookup_map[c_name.upper()] = r
            lookup_map["".join(c for c in c_name.upper() if c.isalnum())] = r
        if acronym:
            lookup_map[acronym.upper()] = r
            lookup_map["".join(c for c in acronym.upper() if c.isalnum())] = r

    return rows, lookup_map


def find_matching_account(account_name, lookup_map):
    """Matches an account name or acronym against accounts_name lookup_map."""
    if not account_name:
        return None
    raw = str(account_name).strip()
    upper = raw.upper()
    if upper in lookup_map:
        return lookup_map[upper]
    clean = "".join(c for c in upper if c.isalnum())
    if clean in lookup_map:
        return lookup_map[clean]
    return None


def is_partial_schedule_item(sch):
    """
    Checks if a schedule item is a partial payment installment.
    In accounts_db, partial payment installments have 'splits' containing slice lists
    (e.g. {"FINOVA CAPITAL": [{"amount": 500000, ...}, ...], ...})
    or normalized keys like amountA, paidAmount.
    """
    splits_raw = sch.get('splits')
    if not splits_raw:
        return False
    try:
        data = json.loads(splits_raw) if isinstance(splits_raw, str) else splits_raw
    except Exception:
        return False
    if not isinstance(data, dict):
        return False

    if 'amountA' in data or 'paidAmount' in data or 'amountB' in data:
        return True

    for v in data.values():
        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict) and 'amount' in v[0]:
            return True
    return False


def normalize_installment_splits(splits_raw, s_no, installment_amount, primary_account_name, secondary_accounts, remarks=None, now_str=None):
    """
    Normalizes legacy splits format (account-to-slices dict) into standard split keys
    (amountA, paidAmount, amountB, priAmountA, priAmountB, secAmountA, secAmountB, etc.)
    expected by JointLoan.jsx while preserving raw account breakdowns under both
    canonical and legacy account names.
    CRITICAL: Partial payment recd and payout dates are NOT populated on import.
    """
    if not splits_raw:
        return None
    try:
        data = json.loads(splits_raw) if isinstance(splits_raw, str) else splits_raw
    except Exception:
        return splits_raw

    if not isinstance(data, dict):
        return splits_raw

    # If already normalized with standard fields, return JSON with cleared dates
    if 'amountA' in data or 'paidAmount' in data:
        cleared = dict(data)
        cleared.update({
            'recdDateA': '',
            'dueDateA': '-',
            'recdDateB': '',
            'dueDateB': '-',
            'recdDate': '',
            'dueDate': '-',
            'payoutDate': '-',
            'payout_approval_status': None,
            'payoutApprovalStatus': None,
            'payoutApprovalStatusA': None,
            'payoutApprovalStatusB': None
        })
        return json.dumps(cleared)

    primary_name = str(primary_account_name or '').strip().upper()
    sec_names = [str(s.get('account_name', '')).strip().upper() for s in (secondary_accounts or [])]

    # Check if data maps account names to lists of slices:
    pri_slices = data.get(primary_name)
    if not pri_slices or not isinstance(pri_slices, list):
        for k, v in data.items():
            if str(k).strip().upper() == primary_name and isinstance(v, list):
                pri_slices = v
                break

    if not pri_slices or not isinstance(pri_slices, list) or len(pri_slices) == 0:
        return json.dumps(data)

    num_slices = len(pri_slices)
    slices_info = []
    for i in range(num_slices):
        p_item = pri_slices[i] if i < len(pri_slices) else {}
        p_amt = float(p_item.get('amount', 0.0) or 0.0)
        p_rem = str(p_item.get('remarks', '') or '').strip()

        sec_amts = []
        sec_rems = []
        for s_name in sec_names:
            s_list = data.get(s_name)
            if not s_list or not isinstance(s_list, list):
                for k, v in data.items():
                    if str(k).strip().upper() == s_name and isinstance(v, list):
                        s_list = v
                        break
            s_item = s_list[i] if (s_list and i < len(s_list)) else {}
            sec_amts.append(float(s_item.get('amount', 0.0) or 0.0))
            if s_item.get('remarks'):
                sec_rems.append(str(s_item.get('remarks')).strip())

        tot_sec = sum(sec_amts)
        tot_amt = p_amt + tot_sec
        combined_rem = p_rem if p_rem else (", ".join(sec_rems) if sec_rems else '')
        slices_info.append({
            'index': i,
            'primaryAmount': p_amt,
            'secAmount': tot_sec,
            'secAmounts': sec_amts,
            'totalAmount': tot_amt,
            'remarks': combined_rem
        })

    # Part A is slice 0 (Payment #1)
    part_a = slices_info[0]

    # Balance is remaining after Payment #1
    bal_total = max(0.0, float(installment_amount) - part_a['totalAmount'])
    bal_pri = sum(s['primaryAmount'] for s in slices_info[1:])
    bal_sec_amts = []
    for idx_s in range(len(sec_names)):
        sec_sum = sum(slices_info[j]['secAmounts'][idx_s] for j in range(1, len(slices_info)))
        bal_sec_amts.append(sec_sum)
    bal_sec = sum(bal_sec_amts)

    if bal_pri + bal_sec > 0:
        bal_total = bal_pri + bal_sec

    normalized = dict(data)  # Preserve original account keys

    # Ensure canonical account names also map to slices
    if primary_account_name and pri_slices:
        normalized[primary_account_name] = pri_slices
    for s in (secondary_accounts or []):
        s_cname = s.get('account_name')
        if s_cname:
            for k, v in data.items():
                if str(k).strip().upper() == s_cname.strip().upper():
                    normalized[s_cname] = v
                    break

    # Do not set recd and payout dates on partial payment; leave unapproved so users/admins can enter dates
    normalized.update({
        'sNo': s_no,
        'paidAmount': part_a['totalAmount'],
        'amountA': part_a['totalAmount'],
        'amountB': bal_total,
        'priAmountA': part_a['primaryAmount'],
        'priAmountB': bal_pri,
        'priAmount': part_a['primaryAmount'],
        'secAmountA': part_a['secAmount'],
        'secAmountB': bal_sec,
        'secAmount': part_a['secAmount'],
        'secAmountsA': part_a['secAmounts'],
        'secAmountsB': bal_sec_amts,
        'secAmounts': part_a['secAmounts'],
        'recdDateA': '',
        'dueDateA': '-',
        'remarksA': part_a['remarks'] or remarks or '',
        'recdDateB': '',
        'dueDateB': '-',
        'remarksB': slices_info[1]['remarks'] if len(slices_info) > 1 and slices_info[1]['remarks'] else '',
        'recdDate': '',
        'dueDate': '-',
        'payoutDate': '-',
        'isFinalSettled': False,
        'payout_approval_status': None,
        'payoutApprovalStatus': None,
        'payoutApprovalStatusA': None,
        'payoutApprovalStatusB': None,
        'payoutApprovedBy': None,
        'payoutApprovedByA': None,
        'payoutApprovedByB': None,
        'payoutApprovedAt': None,
        'payoutApprovedAtA': None,
        'payoutApprovedAtB': None,
        'payoutRequestedBy': None,
        'payoutRequestedByA': None,
        'payoutRequestedByB': None,
        'payoutRequestedAt': None,
        'payoutRequestedAtA': None,
        'payoutRequestedAtB': None
    })

    return json.dumps(normalized)


def import_joint_loan_file(file_path, source_conn, target_conn, override_loan_id=None, dry_run=False):
    """
    Processes a single loan document file:
    1. Extracts document metadata via extract_document_data.
    2. Matches loan in accounts_db.
    3. Retrieves secondary account details, repayment schedule, and penal interest rows.
    4. Validates all secondary accounts against accounts_name table in accounts_new (aborts if not found).
    5. Creates System Admin audit history.
    6. Inserts into accounts_new without pre-populating partial payment recd/payout dates.
    """
    file_name = os.path.basename(file_path)
    print(f"\n{'='*70}")
    print(f"Processing File: {file_name}")
    print(f"{'='*70}")

    doc_data = {}
    if extract_document_data:
        try:
            doc_data = extract_document_data(file_path) or {}
            print(f" Extracted Document Data:")
            print(f"   Loan Number: {doc_data.get('loan_number')}")
            print(f"   Client Name: {doc_data.get('client_account')}")
            print(f"   Loan Amount: {doc_data.get('loan_amount'):,}" if doc_data.get('loan_amount') else "   Loan Amount: None")
            print(f"   Total Repayment: {doc_data.get('total_repayment'):,}" if doc_data.get('total_repayment') else "   Total Repayment: None")
            print(f"   Primary Account: {doc_data.get('primary_account')}")
            print(f"   Extracted Installments: {len(doc_data.get('table', []))}")
        except Exception as e:
            print(f" Error extracting document data from {file_name}: {e}")
            doc_data = {}

    extracted_loan_no = doc_data.get('loan_number')
    extracted_client = doc_data.get('client_account')

    source_cur = source_conn.cursor(cursor_factory=RealDictCursor)

    source_loan = find_source_loan(
        source_cur,
        loan_number=extracted_loan_no,
        client_name=extracted_client,
        override_loan_id=override_loan_id
    )

    if not source_loan:
        print(f" No matching loan found in accounts_db for file {file_name}.")
        source_cur.close()
        return False

    source_loan_id = source_loan['id']
    loan_ref_id = source_loan.get('loan_ref_id') or (f"JL{extracted_loan_no}" if extracted_loan_no else f"JL-2026-{source_loan_id:04d}")
    print(f" Matched Source Loan in accounts_db:")
    print(f"   ID: {source_loan_id}")
    print(f"   Loan Ref ID: {loan_ref_id}")
    print(f"   Client Name: {source_loan.get('client_account_name')}")
    print(f"   Loan Amount: {source_loan.get('loan_amount'):,}")
    print(f"   Primary Account: {source_loan.get('primary_account_name')}")

    # Fetch secondary accounts, schedule, and penal interest from accounts_db
    secondary_accounts, regular_schedule, penal_interest_rows = fetch_source_loan_details(
        source_cur, source_loan_id
    )
    source_cur.close()

    print(f"\n Retrieved from accounts_db for Loan ID {source_loan_id}:")
    print(f"   Secondary Accounts ({len(secondary_accounts)}):")
    for sec in secondary_accounts:
        print(f"     - Name: {sec['account_name']}, Principal/Share: Rs. {sec['share']:,.2f}, Share %: {sec['percentage']}%, Interest: Rs. {sec['interest_amount']:,.2f}, TDS: Rs. {sec['tds']:,.2f}")

    # VALIDATION: Check secondary account names against accounts_name table from accounts_new database
    accounts_list, lookup_map = fetch_accounts_name_lookup(target_conn)
    print(f"\n Available accounts in accounts_name ({len(accounts_list)}):")
    for acc in accounts_list:
        print(f"   - {acc['name']} (Acronym: {acc.get('acronym')})")

    if not secondary_accounts:
        print(f"\n❌ Loan '{loan_ref_id}' has NO secondary accounts. Joint loans require valid secondary accounts. Aborting creation.")
        return False

    matched_secondary_accounts = []
    for sec in secondary_accounts:
        sec_name = str(sec.get('account_name', '')).strip()
        matched_acc = find_matching_account(sec_name, lookup_map)
        if not matched_acc:
            print(f"\n❌ Secondary account '{sec_name}' NOT found in accounts_name table of accounts_new database.")
            print(f"   Loan '{loan_ref_id}' will NOT be created.")
            return False

        sec_copy = dict(sec)
        sec_copy['account_name'] = matched_acc['name']  # Set to exact canonical name from accounts_name
        matched_secondary_accounts.append(sec_copy)
        print(f"   ✓ Mapped secondary account '{sec_name}' -> '{matched_acc['name']}'")

    secondary_accounts = matched_secondary_accounts

    print(f"\n   Regular Repayment Schedule: {len(regular_schedule)} rows")
    recd_count = sum(1 for s in regular_schedule if s.get('received_date') and str(s['received_date']).strip())
    payout_count = sum(1 for s in regular_schedule if s.get('payment_date') and str(s['payment_date']).strip())
    partial_count = sum(1 for s in regular_schedule if is_partial_schedule_item(s))
    print(f"     - With Recd Date: {recd_count}")
    print(f"     - With Payout Date: {payout_count}")
    print(f"     - Partial Payment Rows (dates will NOT be updated): {partial_count}")

    print(f"   Penal Interest (Manual Type): {len(penal_interest_rows)} rows")
    for p in penal_interest_rows:
        print(f"     - Amount: Rs. {p['amount']:,.2f}, Date: {p['date']}, Recd Date: {p['received_date']}, Payout Date: {p['payment_date']}, Remarks: {p['remarks']}, Splits: {p['splits']}")

    # Formulate joint loan details for target DB (accounts_new)
    client_account_name = source_loan.get('client_account_name') or extracted_client or ''
    address = source_loan.get('address') or doc_data.get('address') or ''
    contact = source_loan.get('contact') or doc_data.get('contact') or ''
    loan_amount = float(source_loan.get('loan_amount') or doc_data.get('loan_amount') or 0.0)
    loan_date = source_loan.get('loan_date') or doc_data.get('loan_date') or datetime.date.today().strftime("%d-%m-%Y")
    raw_primary_name = (source_loan.get('primary_account_name') or doc_data.get('primary_account') or '').strip()
    matched_pri = find_matching_account(raw_primary_name, lookup_map)
    primary_account_name = matched_pri['name'] if matched_pri else raw_primary_name
    primary_account_share = float(source_loan.get('primary_account_share') or 100.0 - sum(float(s['percentage']) for s in secondary_accounts))
    primary_account_amount = float(source_loan.get('primary_account_amount') or (loan_amount - sum(float(s['share']) for s in secondary_accounts)))
    total_repayment_amount = float(source_loan.get('total_repayment_amount') or doc_data.get('total_repayment') or loan_amount)
    total_interest = float(source_loan.get('total_interest') or max(0.0, total_repayment_amount - loan_amount))
    primary_account_interest = float(source_loan.get('primary_account_interest') or (total_interest - sum(float(s['interest_amount']) for s in secondary_accounts)))
    interest_rate = source_loan.get('interest_rate') or doc_data.get('interest_rate') or ''

    # Generate audit history using System Admin name
    sec_names = [s['account_name'] for s in secondary_accounts]
    now = datetime.datetime.now()
    history_entries = build_system_admin_history(loan_ref_id, sec_names, now=now)
    history_json = json.dumps(history_entries)
    now_str = now.strftime("%d-%m-%Y %I:%M %p")

    if dry_run:
        print(f"\n DRY RUN: Skipping database insertion for {loan_ref_id}.")
        return True

    # Insert into target database accounts_new
    target_cur = target_conn.cursor()

    # 1. Clean existing record in accounts_new if exists to prevent duplication
    target_cur.execute("SELECT id FROM loans WHERE loan_ref_id = %s", (loan_ref_id,))
    existing_loan = target_cur.fetchone()
    if existing_loan:
        existing_id = existing_loan[0]
        print(f" Existing loan record with ref '{loan_ref_id}' (ID {existing_id}) found in accounts_new. Replacing...")
        target_cur.execute("DELETE FROM remaining_accounts WHERE loan_id = %s", (existing_id,))
        target_cur.execute("DELETE FROM repayment_schedule WHERE loan_id = %s", (existing_id,))
        target_cur.execute("DELETE FROM loans WHERE id = %s", (existing_id,))

    # 2. Insert Loan
    insert_loan_query = """
        INSERT INTO loans (
            loan_ref_id, client_account_name, address, contact,
            loan_amount, loan_date, primary_account_amount, primary_account_name,
            primary_account_share, primary_account_interest, total_repayment_amount,
            total_interest, interest_rate, is_deleted, verified_by,
            approval_status, requester_name, requested_at, actioned_by,
            actioned_at, edited_by, history
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        ) RETURNING id;
    """
    target_cur.execute(
        insert_loan_query,
        (
            loan_ref_id, client_account_name, address, contact,
            loan_amount, loan_date, primary_account_amount, primary_account_name,
            primary_account_share, primary_account_interest, total_repayment_amount,
            total_interest, interest_rate, False, 'System Admin',
            'APPROVED', 'System Admin', now_str, 'System Admin',
            now_str, None, history_json
        )
    )
    new_loan_id = target_cur.fetchone()[0]
    print(f"\n Created Loan in accounts_new with ID: {new_loan_id} (Ref: {loan_ref_id})")

    # 3. Insert Secondary Accounts with exact canonical names from accounts_name
    insert_sec_query = """
        INSERT INTO remaining_accounts (
            loan_id, account_name, percentage, share, interest_amount, tds
        ) VALUES (%s, %s, %s, %s, %s, %s);
    """
    for sec in secondary_accounts:
        target_cur.execute(
            insert_sec_query,
            (
                new_loan_id,
                sec['account_name'],
                float(sec['percentage']),
                float(sec['share']),
                float(sec['interest_amount']),
                float(sec['tds'])
            )
        )
    print(f" Inserted {len(secondary_accounts)} secondary accounts.")

    # 4. Insert Regular Repayment Schedule (type != 'manual')
    insert_sch_query = """
        INSERT INTO repayment_schedule (
            loan_id, amount, interest_amount, cheque_no, date,
            received_date, payment_date, remarks, type, splits,
            date_approval_status, date_editor_role, date_editor_name,
            payout_approval_status, payout_approved_by, payout_approved_at,
            payout_requested_by, payout_requested_at, payout_notes,
            payout_approval_target, payout_requested_role
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        );
    """
    schedule_to_insert = regular_schedule
    if not schedule_to_insert and doc_data.get('table'):
        schedule_to_insert = [
            {
                'amount': r.get('amount', 0.0),
                'interest_amount': r.get('interest_amount', 0.0),
                'cheque_no': r.get('cheque_no', ''),
                'date': r.get('date', ''),
                'received_date': r.get('received_date'),
                'payment_date': r.get('payment_date'),
                'remarks': None,
                'type': 'system',
                'splits': None,
            }
            for r in doc_data['table']
        ]

    for idx, sch in enumerate(schedule_to_insert):
        s_no = idx + 1
        is_partial = is_partial_schedule_item(sch)

        if is_partial:
            # Partial payment: DO NOT update recd and payout date, and leave unapproved
            rec_date_val = None
            pay_date_val = None
            date_status = None
            date_role = None
            date_name = None
            payout_status = None
            payout_by = None
            payout_at = None
            payout_req_by = None
            payout_req_at = None
            payout_req_role = None

            splits_json = normalize_installment_splits(
                splits_raw=sch.get('splits'),
                s_no=s_no,
                installment_amount=float(sch.get('amount') or 0.0),
                primary_account_name=primary_account_name,
                secondary_accounts=secondary_accounts,
                remarks=sch.get('remarks'),
                now_str=now_str
            )
        else:
            # Regular schedule row: Keep recd and payout dates if present and auto-approve under System Admin
            splits_json = sch.get('splits')

            raw_recd = sch.get('received_date')
            if raw_recd and str(raw_recd).strip():
                rec_date_val = str(raw_recd).strip()
                date_status = 'APPROVED'
                date_role = 'admin'
                date_name = 'System Admin'
            else:
                rec_date_val = None
                date_status = None
                date_role = None
                date_name = None

            raw_payout = sch.get('payment_date')
            if raw_payout and str(raw_payout).strip():
                pay_date_val = str(raw_payout).strip()
                payout_status = 'APPROVED'
                payout_by = 'System Admin'
                payout_at = now_str
                payout_req_by = 'System Admin'
                payout_req_at = now_str
                payout_req_role = 'admin'
            else:
                pay_date_val = None
                payout_status = None
                payout_by = None
                payout_at = None
                payout_req_by = None
                payout_req_at = None
                payout_req_role = None

        target_cur.execute(
            insert_sch_query,
            (
                new_loan_id,
                float(sch.get('amount') or 0.0),
                float(sch.get('interest_amount') or 0.0),
                sch.get('cheque_no') or '',
                sch.get('date') or '',
                rec_date_val,
                pay_date_val,
                sch.get('remarks'),
                sch.get('type') or 'system',
                splits_json,
                date_status,
                date_role,
                date_name,
                payout_status,
                payout_by,
                payout_at,
                payout_req_by,
                payout_req_at,
                None,  # payout_notes
                None,  # payout_approval_target
                payout_req_role
            )
        )
    print(f" Inserted {len(schedule_to_insert)} regular repayment schedule rows.")

    # 5. Insert Penal Interest Rows (type = 'manual')
    for penal in penal_interest_rows:
        raw_recd = penal.get('received_date')
        if raw_recd and str(raw_recd).strip():
            rec_date_val = str(raw_recd).strip()
            date_status = 'APPROVED'
            date_role = 'admin'
            date_name = 'System Admin'
        else:
            rec_date_val = None
            date_status = None
            date_role = None
            date_name = None

        raw_payout = penal.get('payment_date')
        if raw_payout and str(raw_payout).strip():
            pay_date_val = str(raw_payout).strip()
            payout_status = 'APPROVED'
            payout_by = 'System Admin'
            payout_at = now_str
            payout_req_by = 'System Admin'
            payout_req_at = now_str
            payout_req_role = 'admin'
        else:
            pay_date_val = None
            payout_status = None
            payout_by = None
            payout_at = None
            payout_req_by = None
            payout_req_at = None
            payout_req_role = None

        penal_splits = penal.get('splits')
        if penal_splits:
            try:
                p_data = json.loads(penal_splits) if isinstance(penal_splits, str) else penal_splits
                if isinstance(p_data, dict):
                    new_p_data = dict(p_data)
                    for sec in secondary_accounts:
                        sec_cname = sec['account_name']
                        for k, v in p_data.items():
                            if str(k).strip().upper() == sec_cname.upper():
                                new_p_data[sec_cname] = v
                                break
                    if primary_account_name:
                        for k, v in p_data.items():
                            if str(k).strip().upper() == primary_account_name.upper():
                                new_p_data[primary_account_name] = v
                                break
                    penal_splits = json.dumps(new_p_data)
            except Exception:
                pass

        target_cur.execute(
            insert_sch_query,
            (
                new_loan_id,
                float(penal.get('amount') or 0.0),
                float(penal.get('interest_amount') or 0.0),
                penal.get('cheque_no') or '',
                penal.get('date') or '',
                rec_date_val,
                pay_date_val,
                penal.get('remarks'),
                'manual',  # Explicit manual type for penal interest
                penal_splits,
                date_status,
                date_role,
                date_name,
                payout_status,
                payout_by,
                payout_at,
                payout_req_by,
                payout_req_at,
                None,
                None,
                payout_req_role
            )
        )
    print(f" Inserted {len(penal_interest_rows)} penal interest rows (type='manual').")

    target_conn.commit()
    target_cur.close()
    print(f" Successfully imported joint loan '{loan_ref_id}' into accounts_new!")
    return True


def main():
    parser = argparse.ArgumentParser(description="Import joint loans from 'New folder' and accounts_db into accounts_new.")
    parser.add_argument("--folder", default=os.path.join(ROOT_DIR, "New folder"), help="Path to folder containing loan files")
    parser.add_argument("--source-db", default="accounts_db", help="Source PostgreSQL database name")
    parser.add_argument("--target-db", default="accounts_new", help="Target PostgreSQL database name")
    parser.add_argument("--loan-id", type=int, default=None, help="Explicit source loan ID to map from source database")
    parser.add_argument("--dry-run", action="store_true", help="Inspect and display data without writing to target database")

    args = parser.parse_args()

    folder_path = os.path.abspath(args.folder)
    print(f"Starting Joint Loan Import Tool")
    print(f"Target Directory: {folder_path}")
    print(f"Source Database:  {args.source_db}")
    print(f"Target Database:  {args.target_db}")

    if not os.path.exists(folder_path):
        print(f"Error: Folder '{folder_path}' does not exist.")
        sys.exit(1)

    # Find candidate files
    valid_extensions = ('.pdf', '.docx', '.doc')
    files = [
        os.path.join(folder_path, f)
        for f in os.listdir(folder_path)
        if f.lower().endswith(valid_extensions) and not f.startswith("~$")
    ]

    if not files:
        print(f"No valid document files found in '{folder_path}'.")
        sys.exit(0)

    print(f"Found {len(files)} file(s) to process: {[os.path.basename(f) for f in files]}")

    try:
        source_conn = get_pg_connection(args.source_db)
        target_conn = get_pg_connection(args.target_db)
    except Exception as e:
        print(f"Database connection error: {e}")
        sys.exit(1)

    success_count = 0
    try:
        for file_path in files:
            res = import_joint_loan_file(
                file_path=file_path,
                source_conn=source_conn,
                target_conn=target_conn,
                override_loan_id=args.loan_id,
                dry_run=args.dry_run
            )
            if res:
                success_count += 1
    finally:
        source_conn.close()
        target_conn.close()

    print(f"\n{'='*70}")
    print(f"Import Complete: {success_count}/{len(files)} loans processed successfully.")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
