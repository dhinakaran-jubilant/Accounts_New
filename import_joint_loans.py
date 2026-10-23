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

    # 2. Regular repayment schedule (type != 'manual' or type IS NULL)
    source_cur.execute(
        """
        SELECT id, amount, interest_amount, cheque_no, date, received_date, payment_date,
               remarks, type, splits, date_approval_status, date_editor_role, date_editor_name,
               payout_approval_status, payout_approved_by, payout_approved_at,
               payout_requested_by, payout_requested_at, payout_notes,
               payout_approval_target, payout_requested_role
        FROM repayment_schedule
        WHERE loan_id = %s AND (type IS NULL OR type != 'manual')
        ORDER BY id ASC
        """,
        (loan_id,)
    )
    regular_schedule = source_cur.fetchall()

    # 3. Penal Interest data (type = 'manual')
    source_cur.execute(
        """
        SELECT id, amount, interest_amount, cheque_no, date, received_date, payment_date,
               remarks, type, splits, date_approval_status, date_editor_role, date_editor_name,
               payout_approval_status, payout_approved_by, payout_approved_at,
               payout_requested_by, payout_requested_at, payout_notes,
               payout_approval_target, payout_requested_role
        FROM repayment_schedule
        WHERE loan_id = %s AND type = 'manual'
        ORDER BY id ASC
        """,
        (loan_id,)
    )
    penal_interest_rows = source_cur.fetchall()

    return secondary_accounts, regular_schedule, penal_interest_rows


def normalize_installment_splits(splits_raw, s_no, installment_amount, primary_account_name, secondary_accounts, recd_date=None, payout_date=None, remarks=None):
    """
    Normalizes legacy splits format (account-to-slices dict) into standard split keys
    (amountA, paidAmount, amountB, priAmountA, priAmountB, secAmountA, secAmountB, etc.)
    expected by JointLoan.jsx while preserving the raw account breakdown.
    """
    if not splits_raw:
        return None
    try:
        data = json.loads(splits_raw) if isinstance(splits_raw, str) else splits_raw
    except Exception:
        return splits_raw

    if not isinstance(data, dict):
        return splits_raw

    # If already normalized with standard fields, return JSON as is
    if 'amountA' in data or 'paidAmount' in data:
        return json.dumps(data) if isinstance(data, dict) else str(data)

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

    # We have account slice breakdown!
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

    r_date_a = recd_date or ''
    d_date_a = payout_date or '-'

    normalized = dict(data)  # Preserve original account keys
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
        'recdDateA': r_date_a,
        'dueDateA': d_date_a,
        'remarksA': part_a['remarks'] or remarks or '',
        'recdDateB': '',
        'dueDateB': '-',
        'remarksB': slices_info[1]['remarks'] if len(slices_info) > 1 and slices_info[1]['remarks'] else '',
        'recdDate': r_date_a,
        'dueDate': d_date_a,
        'payoutDate': d_date_a,
        'isFinalSettled': False,
        'payout_approval_status': 'APPROVED',
        'payoutApprovalStatus': 'APPROVED',
        'payoutApprovalStatusA': 'APPROVED'
    })

    return json.dumps(normalized)


def import_joint_loan_file(file_path, source_conn, target_conn, override_loan_id=None, dry_run=False):
    """
    Processes a single loan document file:
    1. Extracts document metadata via extract_document_data.
    2. Matches loan in accounts_db.
    3. Retrieves secondary account details, repayment schedule, and penal interest rows.
    4. Creates System Admin audit history.
    5. Inserts into accounts_new.
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
    print(f" Matched Source Loan in accounts_db:")
    print(f"   ID: {source_loan_id}")
    print(f"   Loan Ref ID: {source_loan.get('loan_ref_id')}")
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

    print(f"   Regular Repayment Schedule: {len(regular_schedule)} rows")
    recd_count = sum(1 for s in regular_schedule if s.get('received_date') and str(s['received_date']).strip())
    payout_count = sum(1 for s in regular_schedule if s.get('payment_date') and str(s['payment_date']).strip())
    split_count = sum(1 for s in regular_schedule if s.get('splits') and str(s['splits']).strip())
    print(f"     - With Recd Date: {recd_count}")
    print(f"     - With Payout Date: {payout_count}")
    print(f"     - With Partial Splits: {split_count}")

    print(f"   Penal Interest (Manual Type): {len(penal_interest_rows)} rows")
    for p in penal_interest_rows:
        print(f"     - Amount: Rs. {p['amount']:,.2f}, Date: {p['date']}, Recd Date: {p['received_date']}, Payout Date: {p['payment_date']}, Remarks: {p['remarks']}, Splits: {p['splits']}")

    # Formulate joint loan details for target DB (accounts_new)
    loan_ref_id = source_loan.get('loan_ref_id') or (f"JL{extracted_loan_no}" if extracted_loan_no else f"JL-2026-{source_loan_id:04d}")
    client_account_name = source_loan.get('client_account_name') or extracted_client or ''
    address = source_loan.get('address') or doc_data.get('address') or ''
    contact = source_loan.get('contact') or doc_data.get('contact') or ''
    loan_amount = float(source_loan.get('loan_amount') or doc_data.get('loan_amount') or 0.0)
    loan_date = source_loan.get('loan_date') or doc_data.get('loan_date') or datetime.date.today().strftime("%d-%m-%Y")
    primary_account_name = (source_loan.get('primary_account_name') or doc_data.get('primary_account') or '').strip().upper()
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

    # 3. Insert Secondary Accounts
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
    # Use regular_schedule from accounts_db if available, else fallback to doc_data table
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
                'date_approval_status': 'APPROVED',
                'date_editor_role': None,
                'date_editor_name': None,
                'payout_approval_status': 'APPROVED',
                'payout_approved_by': None,
                'payout_approved_at': None,
                'payout_requested_by': None,
                'payout_requested_at': None,
                'payout_notes': None,
                'payout_approval_target': None,
                'payout_requested_role': None
            }
            for r in doc_data['table']
        ]

    for idx, sch in enumerate(schedule_to_insert):
        s_no = idx + 1
        splits_json = normalize_installment_splits(
            splits_raw=sch.get('splits'),
            s_no=s_no,
            installment_amount=float(sch.get('amount') or 0.0),
            primary_account_name=primary_account_name,
            secondary_accounts=secondary_accounts,
            recd_date=sch.get('received_date'),
            payout_date=sch.get('payment_date'),
            remarks=sch.get('remarks')
        )
        target_cur.execute(
            insert_sch_query,
            (
                new_loan_id,
                float(sch.get('amount') or 0.0),
                float(sch.get('interest_amount') or 0.0),
                sch.get('cheque_no') or '',
                sch.get('date') or '',
                sch.get('received_date'),
                sch.get('payment_date'),
                sch.get('remarks'),
                sch.get('type') or 'system',
                splits_json,
                sch.get('date_approval_status') or 'APPROVED',
                sch.get('date_editor_role'),
                sch.get('date_editor_name'),
                sch.get('payout_approval_status') or 'APPROVED',
                sch.get('payout_approved_by'),
                sch.get('payout_approved_at'),
                sch.get('payout_requested_by'),
                sch.get('payout_requested_at'),
                sch.get('payout_notes'),
                sch.get('payout_approval_target'),
                sch.get('payout_requested_role')
            )
        )
    print(f" Inserted {len(schedule_to_insert)} regular repayment schedule rows.")

    # 5. Insert Penal Interest Rows (type = 'manual')
    for penal in penal_interest_rows:
        target_cur.execute(
            insert_sch_query,
            (
                new_loan_id,
                float(penal.get('amount') or 0.0),
                float(penal.get('interest_amount') or 0.0),
                penal.get('cheque_no') or '',
                penal.get('date') or '',
                penal.get('received_date'),
                penal.get('payment_date'),
                penal.get('remarks'),
                'manual',  # Explicit manual type for penal interest
                penal.get('splits'),
                penal.get('date_approval_status') or 'APPROVED',
                penal.get('date_editor_role'),
                penal.get('date_editor_name'),
                penal.get('payout_approval_status') or 'APPROVED',
                penal.get('payout_approved_by'),
                penal.get('payout_approved_at'),
                penal.get('payout_requested_by'),
                penal.get('payout_requested_at'),
                penal.get('payout_notes'),
                penal.get('payout_approval_target'),
                penal.get('payout_requested_role')
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
