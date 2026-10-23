"""
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Main Flask application server providing REST API routing, loan servicing, auth, file uploads, and approval workflow endpoints.
"""

import os
import re
import json
import tempfile
import datetime
from flask import Flask, jsonify, request, send_file
from matchup_service import (
    read_uploaded_file,
    compare_datasets,
    generate_matchup_excel,
    reconcile_uploaded_files,
    is_cloud_filename
)
from flask_cors import CORS
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from models import db, Loan, RemainingAccount, RepaymentSchedule, User, Notification, ShortLoan, AccountName
from werkzeug.security import generate_password_hash, check_password_hash
try:
    from read_pdf import extract_pdf_data, extract_document_data, build_final_output
    PDF_EXTRACTION_AVAILABLE = True
except ImportError as e:
    PDF_EXTRACTION_AVAILABLE = False
    import logging
    logging.warning(f"read_pdf not available: {e}")

app = Flask(__name__)

# Secret key configuration for sessions, cookies, and signing
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or 'loandesk-default-secret-key-change-in-production'

# Enable CORS for frontend - configurable via CORS_ORIGINS environment variable
cors_origins_env = os.environ.get('CORS_ORIGINS', '*').strip()
cors_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()] if cors_origins_env != '*' else '*'
CORS(app, resources={r"/api/*": {"origins": cors_origins}}, supports_credentials=True)

# ------------------------------------------------------------------
# PostgreSQL Database Configuration using resolved credentials from db module
# ------------------------------------------------------------------
from db import PG_CREDENTIALS, get_pg_connection, get_database_url, ensure_pg_database_exists

# Check if target database exists on PostgreSQL server; if not, create it
ensure_pg_database_exists()
app.config['SQLALCHEMY_DATABASE_URI'] = get_database_url()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    try:
        db.create_all()
        # Ensure address, contact, user status, and history columns exist in PostgreSQL
        try:
            with db.engine.begin() as conn:
                conn.execute(db.text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS address TEXT;"))
                conn.execute(db.text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS contact VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS history TEXT;"))
                conn.execute(db.text("ALTER TABLE loans ADD COLUMN IF NOT EXISTS interest_rate VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_approval_status VARCHAR(50) DEFAULT 'APPROVED';"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_approved_by VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_approved_at VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_requested_by VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_requested_at VARCHAR(100);"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_notes TEXT;"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_approval_target VARCHAR(50);"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD COLUMN IF NOT EXISTS payout_requested_role VARCHAR(50);"))
                conn.execute(db.text("ALTER TABLE remaining_accounts DROP CONSTRAINT IF EXISTS remaining_accounts_loan_id_fkey;"))
                conn.execute(db.text("ALTER TABLE remaining_accounts ADD CONSTRAINT remaining_accounts_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE;"))
                conn.execute(db.text("ALTER TABLE repayment_schedule DROP CONSTRAINT IF EXISTS repayment_schedule_loan_id_fkey;"))
                conn.execute(db.text("ALTER TABLE repayment_schedule ADD CONSTRAINT repayment_schedule_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE;"))
        except Exception as e_col:
            app.logger.warning(f"Note on table columns migration: {e_col}")

        app.logger.info("Connected to PostgreSQL and verified tables via SQLAlchemy.")
        # Ensure default Super Admin credentials exist
        admin_code = 'JC0033'
        admin_user = User.query.filter(db.func.lower(User.employee_code) == admin_code.lower()).first()
        if not admin_user:
            admin_user = User(
                employee_code=admin_code,
                password=generate_password_hash('Admin@123'),
                name='Dhinakaran Sekar',
                role='Super Admin',
                status='active',
                is_initial_password=False,
                email='dhinakaran.s@jubilantenterprises.in',
                mobile=None,
                permissions=json.dumps({"primary": [], "secondary": [], "isAdmin": True}),
                allowed_menus=json.dumps(['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings']),
                security_question=None,
                security_answer=None
            )
            db.session.add(admin_user)
            db.session.commit()
            app.logger.info(f"Created Super Admin user ({admin_code}) successfully.")
        else:
            app.logger.info(f"Super Admin user ({admin_code}) verified.")
    except Exception as e:
        app.logger.error(f"PostgreSQL SQLAlchemy init error: {e}")

# --- Health check ---
@app.route('/api/health', methods=['GET'])
def health():
    pg_status = "connected"
    try:
        with db.engine.connect() as conn:
            conn.execute(db.text("SELECT 1"))
    except Exception as e:
        pg_status = f"error: {e}"

    return jsonify({
        "status": "ok",
        "service": "LoanDesk Accounts Backend",
        "version": "1.0.0",
        "database": "postgresql",
        "postgres": {
            "status": pg_status,
            "database": PG_CREDENTIALS['dbname'],
            "host": PG_CREDENTIALS['host'],
            "port": PG_CREDENTIALS['port'],
            "user": PG_CREDENTIALS['user']
        }
    })

# --- Dashboard APIs ---
@app.route('/api/dashboard/metrics', methods=['GET'])
def get_metrics():
    try:
        loans = Loan.query.filter_by(is_deleted=False).all()
        total_volume = sum(float(l.loan_amount or 0) for l in loans)
        active_loans = sum(1 for l in loans if l.approval_status == 'APPROVED')
        pending_loans = sum(1 for l in loans if l.approval_status != 'APPROVED')
        return jsonify([
            {
                "id": "total-volume",
                "title": "Total Volume",
                "value": f"₹{total_volume:,.0f}",
                "subtext": f"{len(loans)} registered facilities"
            },
            {
                "id": "approved-active",
                "title": "Approved & Active",
                "value": str(active_loans),
                "subtext": "Active facilities"
            },
            {
                "id": "pending-approval",
                "title": "Pending Approval",
                "value": str(pending_loans),
                "subtext": "Awaiting verification"
            }
        ])
    except Exception as e:
        app.logger.warning(f"Error computing dashboard metrics from PostgreSQL: {e}")
        return jsonify([])

@app.route('/api/dashboard/pipeline', methods=['GET'])
def get_pipeline():
    try:
        loans = Loan.query.filter_by(is_deleted=False).order_by(Loan.id.desc()).limit(20).all()
        return jsonify([serialize_pg_loan_to_joint(l) for l in loans])
    except Exception as e:
        app.logger.warning(f"Error computing pipeline from PostgreSQL: {e}")
        return jsonify([])

def format_pct_val(val):
    if val is None:
        return 0
    try:
        f = float(val)
        return int(f) if f.is_integer() else round(f, 1)
    except Exception:
        return 0

# Helper to serialize PostgreSQL Loan to joint loan frontend format
def serialize_pg_loan_to_joint(l):
    borrower_name = l.client_account_name or 'Borrower'
    initials = ''.join(w[0] for w in borrower_name.split()[:2]).upper() or 'BW'
    
    sec_names = [r.account_name for r in l.remaining_accounts]
    co_name = sec_names[0] if sec_names else (l.primary_account_name or 'Secondary Partner')
    co_initials = ''.join(w[0] for w in co_name.split()[:2]).upper() or 'SP'
    
    # Retrieve interest rate from loan record
    rate_val = getattr(l, 'interest_rate', None)

    if not rate_val:
        rate_val = ''

    num_rate = None
    if rate_val:
        m_num = re.search(r'[\d.]+', str(rate_val))
        if m_num:
            try:
                num_rate = float(m_num.group())
            except ValueError:
                num_rate = None

    primary_tag = get_acronym(l.primary_account_name) or 'SCS'
    
    pri_share_val = l.primary_account_share if l.primary_account_share is not None else (
        (100.0 - sum(float(r.percentage or 0) for r in l.remaining_accounts)) if l.remaining_accounts else 60.0
    )
    pri_share_formatted = format_pct_val(pri_share_val)

    primary_details = {
        'id': f"acc-pri-{l.id}",
        'isPrimary': True,
        'accountCategory': 'Primary Account',
        'accountName': l.primary_account_name,
        'accountTag': primary_tag,
        'role': 'Primary Account',
        'initials': primary_tag,
        'principal': round(float(l.primary_account_amount or 0), 2),
        'interest': round(float(l.primary_account_interest or 0), 2),
        'interestRate': num_rate if num_rate is not None else '',
        'repayAmount': round(float((l.primary_account_amount or 0) + (l.primary_account_interest or 0)), 2),
        'share': pri_share_formatted,
    }
    
    account_details = [primary_details]
    
    for r in l.remaining_accounts:
        sec_tag = get_acronym(r.account_name) or (r.account_name[:2].upper() if r.account_name else 'SEC')
        sec_rate = round(num_rate + 0.2, 2) if num_rate is not None else ''
        account_details.append({
            'id': f"acc-sec-{r.id}",
            'isPrimary': False,
            'accountCategory': 'Secondary Account',
            'accountName': r.account_name,
            'accountTag': sec_tag,
            'role': 'Secondary Account',
            'initials': sec_tag,
            'principal': round(float(r.share or 0), 2),
            'interest': round(float(r.interest_amount or 0), 2),
            'interestRate': sec_rate,
            'repayAmount': round(float((r.share or 0) + (r.interest_amount or 0)), 2),
            'share': format_pct_val(r.percentage),
            'tds': round(float(r.tds or 0), 2)
        })
        
    today_dt = datetime.date.today()
    repayment_schedule_list = []
    penal_interest_list = []
    has_overdue = False

    sys_schedule = [s for s in l.repayment_schedule if getattr(s, 'type', None) != 'manual']
    manual_schedule = [s for s in l.repayment_schedule if getattr(s, 'type', None) == 'manual']

    for idx, s in enumerate(sys_schedule):
        splits_data = None
        if s.splits:
            try:
                splits_data = json.loads(s.splits)
            except Exception:
                splits_data = None

        row_status = 'Active'
        if splits_data and not splits_data.get('isFinalSettled'):
            row_status = 'Partial'
        elif s.received_date:
            row_status = 'Collected'
        elif l.approval_status == 'CLOSED':
            row_status = 'Settled'
        else:
            try:
                parts = s.date.strip().split('-')
                if len(parts) == 3 and len(parts[2]) == 4:
                    s_date = datetime.date(int(parts[2]), int(parts[1]), int(parts[0]))
                    if s_date < today_dt:
                        row_status = 'Overdue'
                        has_overdue = True
            except Exception:
                pass

        p_status = getattr(s, 'payout_approval_status', None)
        p_target = getattr(s, 'payout_approval_target', None)
        p_role = getattr(s, 'payout_requested_role', None)

        has_recd = bool(s.received_date and str(s.received_date).strip() not in ('', '-', '—', 'None'))
        has_pay = bool(s.payment_date and str(s.payment_date).strip() not in ('', '-', '—', 'None'))
        is_p_approved = has_pay and bool(getattr(s, 'payout_approved_by', None))

        if not has_recd and not has_pay:
            p_status = None
            p_target = None
            p_role = None
        elif is_p_approved or p_status == 'APPROVED':
            p_status = 'APPROVED'
            p_target = None
        elif p_status == 'PENDING' or (has_recd and not is_p_approved):
            p_status = 'PENDING'
            if not p_target:
                p_target = 'PRIMARY' if p_role == 'SECONDARY' else 'SECONDARY'
            if not p_role:
                p_role = 'SECONDARY' if p_target == 'PRIMARY' else 'PRIMARY'
        elif not p_status and s.payment_date:
            p_status = 'APPROVED'
            p_target = None
        else:
            p_target = None

        repayment_schedule_list.append({
            'id': s.id,
            'sNo': idx + 1,
            'installmentNumber': idx + 1,
            'date': s.date,
            'amount': float(s.amount or 0),
            'interest': float(s.interest_amount or 0),
            'interest_amount': float(s.interest_amount or 0),
            'cheque_no': s.cheque_no or '',
            'received_date': s.received_date or '',
            'receivedDate': s.received_date or '',
            'payment_date': s.payment_date or '',
            'paymentDate': s.payment_date or '',
            'status': row_status,
            'payout_approval_status': p_status,
            'payoutApprovalStatus': p_status,
            'payout_approval_target': p_target,
            'payoutApprovalTarget': p_target,
            'payout_requested_role': p_role,
            'payoutRequestedRole': p_role,
            'payout_editor_role': p_role,
            'payoutEditorRole': p_role,
            'payout_approved_by': getattr(s, 'payout_approved_by', None),
            'payoutApprovedBy': getattr(s, 'payout_approved_by', None),
            'payout_approved_at': getattr(s, 'payout_approved_at', None),
            'payoutApprovedAt': getattr(s, 'payout_approved_at', None),
            'payout_requested_by': getattr(s, 'payout_requested_by', None),
            'payoutRequestedBy': getattr(s, 'payout_requested_by', None),
            'payout_requested_at': getattr(s, 'payout_requested_at', None),
            'payoutRequestedAt': getattr(s, 'payout_requested_at', None),
            'payout_notes': getattr(s, 'payout_notes', None),
            'remarks': s.remarks or '',
            'splits': splits_data
        })

    for p_idx, p in enumerate(manual_schedule):
        p_splits = None
        if p.splits:
            try:
                p_splits = json.loads(p.splits) if isinstance(p.splits, str) else p.splits
            except Exception:
                p_splits = None

        pri_amt = 0.0
        sec_accounts_list = []
        sec_sum = 0.0
        sec_amts = []
        if isinstance(p_splits, dict):
            pri_amt = float(p_splits.get(l.primary_account_name, 0.0) or 0.0)
            for r in l.remaining_accounts:
                s_amt = float(p_splits.get(r.account_name, 0.0) or 0.0)
                sec_sum += s_amt
                sec_amts.append(s_amt)
                sec_accounts_list.append({
                    'accountName': r.account_name,
                    'accountTag': get_acronym(r.account_name) or (r.account_name[:2].upper() if r.account_name else 'SEC'),
                    'amount': s_amt,
                    'payoutDate': p.payment_date or '',
                    'dueDate': p.payment_date or ''
                })
        else:
            pri_pct = float(pri_share_val or 60.0)
            pri_amt = round((float(p.amount or 0) * pri_pct) / 100.0, 2)
            sec_sum = round(float(p.amount or 0) - pri_amt, 2)
            for r in l.remaining_accounts:
                s_pct = float(r.percentage or 0.0)
                s_amt = round((float(p.amount or 0) * s_pct) / 100.0, 2)
                sec_amts.append(s_amt)
                sec_accounts_list.append({
                    'accountName': r.account_name,
                    'accountTag': get_acronym(r.account_name) or (r.account_name[:2].upper() if r.account_name else 'SEC'),
                    'amount': s_amt,
                    'payoutDate': p.payment_date or '',
                    'dueDate': p.payment_date or ''
                })

        penal_interest_list.append({
            'id': p.id,
            'sNo': p_idx + 1,
            'date': p.date,
            'amount': float(p.amount or 0),
            'receivedDate': p.received_date or '',
            'recdDate': p.received_date or '',
            'primaryAmount': pri_amt,
            'primaryAccountName': l.primary_account_name,
            'primaryTag': primary_tag,
            'dueDate': p.payment_date or '',
            'payoutDate': p.payment_date or '',
            'secAmounts': sec_amts,
            'secAmount': sec_sum,
            'secondaryAccounts': sec_accounts_list,
            'remarks': p.remarks or '',
            'type': 'manual',
            'splits': p_splits
        })

        
    has_payout_pending = False
    all_settled = len(repayment_schedule_list) > 0
    for s_item in repayment_schedule_list:
        p_stat = (s_item.get('payout_approval_status') or s_item.get('payoutApprovalStatus') or '').upper()
        p_approved_by = s_item.get('payout_approved_by') or s_item.get('payoutApprovedBy')
        has_recd = bool(s_item.get('received_date') and str(s_item.get('received_date')).strip() not in ('', '-', '—', 'None'))
        has_pay = bool(s_item.get('payment_date') and str(s_item.get('payment_date')).strip() not in ('', '-', '—', 'None'))

        if (has_recd or has_pay) and (p_stat != 'APPROVED' and not p_approved_by):
            has_payout_pending = True

        sp_data = s_item.get('splits')
        if sp_data and isinstance(sp_data, dict):
            if not sp_data.get('isFinalSettled'):
                stat_a = (sp_data.get('payoutApprovalStatusA') or '').upper()
                stat_b = (sp_data.get('payoutApprovalStatusB') or '').upper()
                due_a = sp_data.get('dueDateA')
                due_b = sp_data.get('dueDateB')
                recd_a = sp_data.get('recdDateA') or sp_data.get('recdDate')
                recd_b = sp_data.get('recdDateB')
                has_a = bool((recd_a and str(recd_a).strip() not in ('', '-', '—', 'None')) or (due_a and str(due_a).strip() not in ('', '-', '—', 'None')))
                has_b = bool((recd_b and str(recd_b).strip() not in ('', '-', '—', 'None')) or (due_b and str(due_b).strip() not in ('', '-', '—', 'None')))
                if (has_a and stat_a != 'APPROVED') or (has_b and stat_b != 'APPROVED'):
                    has_payout_pending = True
                if not recd_a or not due_a or stat_a != 'APPROVED':
                    all_settled = False
                if (recd_b or due_b) and (not recd_b or not due_b or stat_b != 'APPROVED'):
                    all_settled = False
        else:
            if not has_recd or not has_pay or (p_stat != 'APPROVED' and not p_approved_by):
                all_settled = False

    if l.approval_status == 'REJECTED':
        badge_status = 'Rejected'
    elif l.approval_status in ['PENDING_SECONDARY', 'PENDING'] and not l.verified_by:
        badge_status = 'Pending Secondary'
    elif l.approval_status in ['PENDING_ADMIN', 'VERIFIED']:
        badge_status = 'Pending Admin'
    elif (all_settled or l.approval_status == 'CLOSED') and not has_payout_pending:
        badge_status = 'Closed'
    elif has_payout_pending:
        badge_status = 'Pending'
    elif has_overdue and l.approval_status == 'APPROVED':
        badge_status = 'Overdue'
    elif l.approval_status == 'APPROVED':
        badge_status = 'Active'
    else:
        badge_status = 'Pending'

    if badge_status == 'Active':
        status_color = 'bg-emerald-50 text-emerald-700 ring-emerald-300'
        status_dot = 'bg-emerald-500'
    elif badge_status == 'Overdue':
        status_color = 'bg-rose-50 text-rose-700 ring-rose-300'
        status_dot = 'bg-rose-500'
    elif badge_status == 'Closed':
        status_color = 'bg-slate-100 text-slate-700 ring-slate-300'
        status_dot = 'bg-slate-400'
    elif badge_status == 'Pending Secondary':
        status_color = 'bg-amber-50 text-amber-700 ring-amber-300'
        status_dot = 'bg-amber-500'
    elif badge_status == 'Pending Admin':
        status_color = 'bg-purple-50 text-purple-700 ring-purple-300'
        status_dot = 'bg-purple-500'
    elif badge_status == 'Rejected':
        status_color = 'bg-rose-50 text-rose-700 ring-rose-300'
        status_dot = 'bg-rose-500'
    else:
        status_color = 'bg-amber-50 text-amber-700 ring-amber-300'
        status_dot = 'bg-amber-500'

    due_date = l.repayment_schedule[-1].date if l.repayment_schedule else (l.loan_date or 'Active')
    first_amount = l.repayment_schedule[0].amount if l.repayment_schedule else (l.loan_amount / 10 if l.loan_amount else 0)

    return {
        'id': l.loan_ref_id or f"JL-2026-{l.id:04d}",
        'db_id': l.id,
        'primary': primary_tag,
        'primaryAccountName': l.primary_account_name,
        'primaryBorrower': {
            'name': borrower_name,
            'role': 'Primary Applicant',
            'score': 740,
            'initials': initials,
            'address': getattr(l, 'address', '') or '',
            'contact': getattr(l, 'contact', '') or ''
        },
        'address': getattr(l, 'address', '') or '',
        'contact': getattr(l, 'contact', '') or '',
        'client_account_name': l.client_account_name,
        'coBorrower': {
            'name': co_name,
            'role': 'Secondary Partner',
            'score': 720,
            'initials': co_initials
        },
        'secondaryAccounts': [
            {
                'id': r.id,
                'accountName': r.account_name,
                'amount': str(int(r.share)) if r.share else '0',
                'share': format_pct_val(r.percentage),
                'interest': r.interest_amount,
                'tds': r.tds
            } for r in l.remaining_accounts
        ],
        'accountDetails': account_details,
        'uploadedFiles': [],
        'purpose': f"Facility Ref: {l.loan_ref_id or l.id}",
        'category': 'Commercial',
        'categoryColor': 'bg-purple-50 text-purple-700 ring-purple-300',
        'amount': float(l.loan_amount or 0),
        'total_repayment_amount': float(l.total_repayment_amount or 0),
        'total_repayment': float(l.total_repayment_amount or 0),
        'totalRepayAmount': float(l.total_repayment_amount or 0),
        'total_interest': float(l.total_interest or 0),
        'totalInterest': float(l.total_interest or 0),
        'primaryShare': pri_share_formatted,
        'coShare': format_pct_val(100.0 - float(pri_share_val)),
        'rate': rate_val,
        'interest_rate': rate_val,
        'interestRate': rate_val,
        'total_due': f"{len(l.repayment_schedule)} Dues" if l.repayment_schedule else '',
        'total_dues': f"{len(l.repayment_schedule)} Dues" if l.repayment_schedule else '',
        'total_emi': f"{len(l.repayment_schedule)} EMIs" if l.repayment_schedule else '',
        'total_emis': f"{len(l.repayment_schedule)} EMIs" if l.repayment_schedule else '',
        'total_installments': len(l.repayment_schedule) if l.repayment_schedule else 0,
        'tenure': f"{len(l.repayment_schedule)} Dues" if l.repayment_schedule else '',
        'monthlyPayment': f"₹{first_amount:,.0f}",
        'riskGrade': 'Grade A',
        'riskColor': 'bg-emerald-50 text-emerald-700 ring-emerald-300',
        'status': badge_status,
        'statusColor': status_color,
        'statusDot': status_dot,
        'appliedDate': l.loan_date,
        'loan_date': l.loan_date,
        'loanDate': l.loan_date,
        'dueDate': due_date,
        'approval_status': getattr(l, 'approval_status', 'PENDING'),
        'approvalStatus': getattr(l, 'approval_status', 'PENDING'),
        'verified_by': getattr(l, 'verified_by', None),
        'verifiedBy': getattr(l, 'verified_by', None),
        'requester_name': getattr(l, 'requester_name', None),
        'requesterName': getattr(l, 'requester_name', None),
        'requested_at': getattr(l, 'requested_at', None),
        'requestedAt': getattr(l, 'requested_at', None),
        'actioned_by': getattr(l, 'actioned_by', None),
        'actionedBy': getattr(l, 'actioned_by', None),
        'actioned_at': getattr(l, 'actioned_at', None),
        'actionedAt': getattr(l, 'actioned_at', None),
        'edited_by': getattr(l, 'edited_by', None),
        'editedBy': getattr(l, 'edited_by', None),
        'history': (json.loads(l.history) if getattr(l, 'history', None) and isinstance(l.history, str) else (l.history if isinstance(getattr(l, 'history', None), list) else [])) if hasattr(l, 'history') else [],
        'repaymentSchedule': repayment_schedule_list,
        'repayment_schedule': repayment_schedule_list,
        'penal_interest': penal_interest_list,
        'penalInterests': penal_interest_list
    }

# Helper to safely convert values to float
def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        s = str(val).replace(',', '').strip()
        return float(s) if s else default
    except (ValueError, TypeError):
        return default

# Helper to find a PostgreSQL Loan record flexibly
def find_pg_loan(loan_id, payload=None, include_deleted=False):
    if not loan_id and not payload:
        return None
    base_query = Loan.query
    if not include_deleted:
        base_query = base_query.filter(Loan.is_deleted == False)

    # 1. Payload db_id if provided
    if payload and isinstance(payload, dict):
        db_id = payload.get('db_id')
        if db_id is not None and str(db_id).isdigit():
            loan = base_query.filter(Loan.id == int(db_id)).first()
            if loan:
                return loan

    s_id = str(loan_id).strip() if loan_id else ""
    if not s_id:
        return None

    # 2. Pure digits = primary key ID
    if s_id.isdigit():
        loan = base_query.filter(Loan.id == int(s_id)).first()
        if loan:
            return loan

    # 3. Exact loan_ref_id match
    loan = base_query.filter(Loan.loan_ref_id == s_id).first()
    if loan:
        return loan

    # 4. Case-insensitive loan_ref_id match
    loan = base_query.filter(Loan.loan_ref_id.ilike(s_id)).first()
    if loan:
        return loan

    # 5. Extract trailing digits (e.g. JL-2026-0012 -> 12, JL-12 -> 12)
    m = re.search(r'(\d+)$', s_id)
    if m:
        try:
            cand_id = int(m.group(1))
            loan = base_query.filter(Loan.id == cand_id).first()
            if loan:
                return loan
        except Exception:
            pass

    return None

# --- Joint Loans CRUD from PostgreSQL ---
@app.route('/api/joint-loans', methods=['GET'])
def get_joint_loans():
    try:
        pg_loans = Loan.query.filter_by(is_deleted=False).order_by(Loan.id.desc()).all()
        return jsonify([serialize_pg_loan_to_joint(l) for l in pg_loans])
    except Exception as e:
        app.logger.warning(f"Failed to query PostgreSQL loans: {e}")
        return jsonify([]), 500

@app.route('/api/joint-loans/<loan_id>', methods=['GET'])
def get_joint_loan(loan_id):
    try:
        pg_loan = find_pg_loan(loan_id)
        if pg_loan:
            return jsonify(serialize_pg_loan_to_joint(pg_loan))
        return jsonify({"error": "Loan not found"}), 404
    except Exception as e:
        app.logger.error(f"Error fetching loan {loan_id}: {e}")
        return jsonify({"error": "Loan not found"}), 404

@app.route('/api/joint-loans/check-id', methods=['GET'])
def check_joint_loan_id():
    loan_id = request.args.get('loan_id', '').strip()
    client_name = request.args.get('client_name', '').strip()
    loan_date = request.args.get('loan_date', '').strip()
    if not loan_id and not (client_name and loan_date):
        return jsonify({"exists": False}), 200
    
    existing = check_loan_ref_id_exists(ref_id=loan_id, client_name=client_name, loan_date=loan_date)
    if existing:
        if loan_id and strip_loan_ref_prefix(existing.loan_ref_id).lower() == strip_loan_ref_prefix(loan_id).lower():
            msg = f"Loan ID '{existing.loan_ref_id or loan_id}' already exists in database."
        elif client_name and loan_date:
            msg = f"Loan for client '{existing.client_account_name}' on date '{existing.loan_date}' already exists in database (ID: {existing.loan_ref_id or existing.id})."
        else:
            msg = f"Loan ID '{existing.loan_ref_id or loan_id}' already exists in database."

        return jsonify({
            "exists": True,
            "loan_id": existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
            "existing_loan": {
                "id": existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                "loan_id": existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                "client_account_name": existing.client_account_name,
                "loan_amount": existing.loan_amount,
                "loan_date": existing.loan_date,
                "primary_account_name": existing.primary_account_name,
                "status": existing.approval_status
            },
            "message": msg
        }), 200
    
    return jsonify({"exists": False}), 200

def find_users_with_primary_access_for_loan(loan):
    """Find active users who have primary access for any of this loan's secondary accounts."""
    if not loan:
        return []
    
    sec_names = []
    if hasattr(loan, 'remaining_accounts') and loan.remaining_accounts:
        sec_names = [r.account_name for r in loan.remaining_accounts if r.account_name]
    
    if not sec_names:
        return []
    
    target_tokens = set()
    for name in sec_names:
        s = str(name).strip()
        target_tokens.add(s.lower())
        acr = get_acronym(s)
        if acr:
            target_tokens.add(acr.lower())
        try:
            acc_obj = AccountName.query.filter(
                (db.func.lower(AccountName.name) == s.lower()) |
                (db.func.lower(AccountName.acronym) == s.lower())
            ).first()
            if acc_obj:
                if acc_obj.name:
                    target_tokens.add(acc_obj.name.lower())
                if acc_obj.acronym:
                    target_tokens.add(acc_obj.acronym.lower())
        except Exception:
            pass
    
    matched_users = []
    for u in User.query.filter_by(status='active').all():
        # Never send secondary approval to system admin
        if (getattr(u, 'role', '') or '').strip().lower() in ('admin', 'super admin') or u.employee_code.lower() in ('admin', 'jc0033'):
            continue
        if not u.permissions:
            continue
        try:
            perms = json.loads(u.permissions) if isinstance(u.permissions, str) else u.permissions
            pri_list = []
            if isinstance(perms, dict):
                pri_list = perms.get('primary', [])
            elif isinstance(perms, list):
                pri_list = perms
            
            if not isinstance(pri_list, list):
                continue
            
            user_tokens = set()
            for p in pri_list:
                if not p:
                    continue
                p_str = str(p).strip()
                user_tokens.add(p_str.lower())
                p_acr = get_acronym(p_str)
                if p_acr:
                    user_tokens.add(p_acr.lower())
            
            if user_tokens & target_tokens:
                matched_users.append(u)
        except Exception:
            pass
            
    return matched_users

def find_users_with_primary_access_for_loan_primary(loan):
    """Find active users who have primary access for this loan's primary account."""
    if not loan or not loan.primary_account_name:
        return []
    pri_name = str(loan.primary_account_name).strip()
    target_tokens = set()
    target_tokens.add(pri_name.lower())
    acr = get_acronym(pri_name)
    if acr:
        target_tokens.add(acr.lower())
    try:
        acc_obj = AccountName.query.filter(
            (db.func.lower(AccountName.name) == pri_name.lower()) |
            (db.func.lower(AccountName.acronym) == pri_name.lower())
        ).first()
        if acc_obj:
            if acc_obj.name:
                target_tokens.add(acc_obj.name.lower())
            if acc_obj.acronym:
                target_tokens.add(acc_obj.acronym.lower())
    except Exception:
        pass

    matched_users = []
    for u in User.query.filter_by(status='active').all():
        if (getattr(u, 'role', '') or '').strip().lower() in ('admin', 'super admin') or u.employee_code.lower() in ('admin', 'jc0033'):
            continue
        if not u.permissions:
            continue
        try:
            perms = json.loads(u.permissions) if isinstance(u.permissions, str) else u.permissions
            pri_list = []
            if isinstance(perms, dict):
                pri_list = perms.get('primary', [])
            elif isinstance(perms, list):
                pri_list = perms
            if not isinstance(pri_list, list):
                continue
            user_tokens = set()
            for p in pri_list:
                if not p:
                    continue
                p_str = str(p).strip()
                user_tokens.add(p_str.lower())
                p_acr = get_acronym(p_str)
                if p_acr:
                    user_tokens.add(p_acr.lower())
            if user_tokens & target_tokens:
                matched_users.append(u)
        except Exception:
            pass
    return matched_users

def send_loan_creation_notifications(loan, requester_name='Staff'):
    if not loan or loan.approval_status in ['APPROVED', 'Active']:
        return
    try:
        matched_users = find_users_with_primary_access_for_loan(loan)
        sec_names = [r.account_name for r in loan.remaining_accounts] if hasattr(loan, 'remaining_accounts') else []
        sec_str = ", ".join(sec_names) if sec_names else "Secondary Account"
        client = loan.client_account_name or 'Borrower'
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        
        target_display_list = []
        for u in matched_users:
            label = f"{u.name or u.employee_code} ({u.employee_code})"
            target_display_list.append(label)
            db.session.add(Notification(
                user_name=u.employee_code,
                title=f"Secondary Approval Required: {loan.loan_ref_id or loan.id}",
                message=f"Loan for {client} of amount ₹{loan.loan_amount:,.2f} ({sec_str}) requires your verification as Primary Manager.",
                link=f"/joint-loans",
                created_at=now_str,
                is_read=False
            ))
            if u.name and u.name != u.employee_code:
                db.session.add(Notification(
                    user_name=u.name,
                    title=f"Secondary Approval Required: {loan.loan_ref_id or loan.id}",
                    message=f"Loan for {client} of amount ₹{loan.loan_amount:,.2f} ({sec_str}) requires your verification as Primary Manager.",
                    link=f"/joint-loans",
                    created_at=now_str,
                    is_read=False
                ))

        curr_hist = []
        try:
            curr_hist = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
        except Exception:
            curr_hist = []
        
        targets_str = ", ".join(target_display_list) if target_display_list else f"Primary Manager for {sec_str}"
        creation_entry = {
            'id': f"hist_{int(datetime.datetime.now().timestamp()*1000)}_created",
            'type': 'loan_created',
            'title': 'Loan Created & Approval Dispatched',
            'description': f"Loan facility created by {requester_name}. Approval request dispatched to {targets_str} for secondary partner verification.",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': requester_name,
            'userRole': 'staff',
            'accountName': sec_str
        }
        curr_hist = [creation_entry] + [h for h in curr_hist if h.get('type') != 'loan_created']
        loan.history = json.dumps(curr_hist)
        db.session.commit()
    except Exception as e:
        app.logger.warning(f"Failed to send loan creation notifications: {e}")

def check_loan_secondary_requires_approval(loan):
    if not loan:
        return True
    try:
        sec_names = []
        if hasattr(loan, 'remaining_accounts') and loan.remaining_accounts:
            sec_names = [r.account_name for r in loan.remaining_accounts if r.account_name]
        if not sec_names:
            return True
        for s_name in sec_names:
            s = str(s_name).strip()
            acc_obj = AccountName.query.filter(
                (db.func.lower(AccountName.name) == s.lower()) |
                (db.func.lower(AccountName.acronym) == s.lower())
            ).first()
            if acc_obj and acc_obj.is_need_approval is False:
                return False
        return True
    except Exception:
        return True

def send_payout_approval_notifications(loan, s_no, payout_date, requester_name='Staff', target_role='SECONDARY'):
    if not loan:
        return
    try:
        client = loan.client_account_name or 'Borrower'
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        if target_role == 'PRIMARY':
            matched_users = find_users_with_primary_access_for_loan_primary(loan)
            title_str = f"EMI #{s_no} Payout Approval Required: {loan.loan_ref_id or loan.id}"
            msg_str = f"Secondary Manager ({requester_name}) updated payout date to {payout_date} for EMI #{s_no} ({client}). Please review and approve settlement."
        else:
            matched_users = find_users_with_primary_access_for_loan(loan)
            sec_names = [r.account_name for r in loan.remaining_accounts] if hasattr(loan, 'remaining_accounts') else []
            sec_str = ", ".join(sec_names) if sec_names else "Secondary Partner"
            title_str = f"EMI #{s_no} Payout Approval Required: {loan.loan_ref_id or loan.id}"
            msg_str = f"Primary Manager ({requester_name}) updated payout date to {payout_date} for EMI #{s_no} ({client}). Please verify remittance to {sec_str} and approve settlement."

        for u in matched_users:
            db.session.add(Notification(
                user_name=u.employee_code,
                title=title_str,
                message=msg_str,
                link="/joint-loans",
                created_at=now_str,
                is_read=False
            ))
            if u.name and u.name != u.employee_code:
                db.session.add(Notification(
                    user_name=u.name,
                    title=title_str,
                    message=msg_str,
                    link="/joint-loans",
                    created_at=now_str,
                    is_read=False
                ))
        db.session.commit()
    except Exception as e:
        app.logger.warning(f"Failed to send payout approval notifications: {e}")

@app.route('/api/joint-loans', methods=['POST'])
def create_joint_loan():
    payload = request.get_json(force=True, silent=True) or {}
    if not payload:
        return jsonify({"error": "Invalid request body"}), 400

    try:
        borrower_name = payload.get('primaryBorrower', {}).get('name') or payload.get('primaryBorrowerName') or 'Borrower'
        borrower_address = payload.get('primaryBorrower', {}).get('address') or payload.get('address') or ''
        borrower_contact = payload.get('primaryBorrower', {}).get('contact') or payload.get('contact') or ''
        amount = float(payload.get('amount') or 500000)
        sec_accs = payload.get('secondaryAccounts') or []
        pri_share_in = payload.get('primaryShare')
        if pri_share_in is not None and str(pri_share_in).strip() != '':
            pri_share = float(pri_share_in)
        elif sec_accs:
            sec_pct_sum = sum(float(s.get('share') or s.get('percentage') or 0) for s in sec_accs)
            pri_share = max(0.0, 100.0 - sec_pct_sum)
        else:
            pri_share = 60.0

        pri_name = payload.get('primaryAccountName') or payload.get('primary') or ''
        pri_amount = float(payload['primary_account_amount']) if payload.get('primary_account_amount') is not None else round((amount * pri_share) / 100.0, 2)
        pri_interest = float(payload['primary_account_interest']) if payload.get('primary_account_interest') is not None else round(pri_amount * 0.072 * 1.5, 2)
        sec_total_share = 100.0 - pri_share
        sec_share_per = sec_total_share / len(sec_accs) if sec_accs else sec_total_share
        
        total_sec_interest = 0
        rem_objs = []
        for s in sec_accs:
            s_name = s.get('accountName') or 'Secondary Account'
            s_amount = float(s.get('amount') or round(amount * sec_share_per / 100.0, 2))
            s_interest = round(s_amount * 0.074 * 1.5, 2)
            total_sec_interest += s_interest
            rem_objs.append((s_name, sec_share_per, s_amount, s_interest, round(s_interest * 0.10, 2)))
            
        total_interest = pri_interest + total_sec_interest
        total_repayment = amount + total_interest
        
        ref_id = payload.get('id') or payload.get('loan_id')
        req_client_name = borrower_name or payload.get('client_account_name')
        req_loan_date = payload.get('appliedDate') or payload.get('loan_date')
        if ref_id or (req_client_name and req_loan_date):
            existing = check_loan_ref_id_exists(ref_id=ref_id, client_name=req_client_name, loan_date=req_loan_date)
            if existing:
                return jsonify({
                    "error": f"Loan ID '{existing.loan_ref_id or ref_id}' already exists in database.",
                    "loan_exists": True,
                    "existing_loan": {
                        "id": existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                        "loan_id": existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                        "client_account_name": existing.client_account_name,
                        "loan_amount": existing.loan_amount,
                        "loan_date": existing.loan_date,
                        "primary_account_name": existing.primary_account_name,
                        "status": existing.approval_status
                    }
                }), 400
        else:
            last_loan = Loan.query.order_by(Loan.id.desc()).first()
            new_id = (last_loan.id + 1) if last_loan else 1001
            ref_id = f"JL-2026-{new_id}"

        raw_status = payload.get('status')
        req_approval = payload.get('approval_status') or payload.get('approvalStatus')
        if req_approval == 'APPROVED':
            init_approval = 'APPROVED'
        elif raw_status == 'Closed' or req_approval in ['CLOSED', 'Closed']:
            init_approval = 'CLOSED'
        elif req_approval == 'PENDING_ADMIN':
            init_approval = 'PENDING_ADMIN'
        else:
            init_approval = 'PENDING_SECONDARY'

        req_user = payload.get('requester_name') or payload.get('requesterName') or 'Staff Officer'

        loan = Loan(
            loan_ref_id=ref_id,
            client_account_name=borrower_name,
            address=borrower_address,
            contact=borrower_contact,
            loan_amount=amount,
            loan_date=payload.get('appliedDate') or datetime.date.today().strftime('%d-%m-%Y'),
            primary_account_name=pri_name,
            primary_account_share=pri_share,
            primary_account_amount=pri_amount,
            primary_account_interest=pri_interest,
            total_repayment_amount=total_repayment,
            total_interest=total_interest,
            interest_rate=payload.get('interest_rate') or payload.get('rate') or None,
            approval_status=init_approval,
            is_deleted=False,
            requester_name=req_user,
            requested_at=datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
        )
        db.session.add(loan)
        db.session.flush()

        for s_name, pct, s_amt, s_int, s_tds in rem_objs:
            rem = RemainingAccount(
                loan_id=loan.id,
                account_name=s_name,
                percentage=pct,
                share=s_amt,
                interest_amount=s_int,
                tds=s_tds
            )
            db.session.add(rem)

        count = 10
        emi_amount = round(total_repayment / count, 2)
        emi_int = round(total_interest / count, 2)
        base_chq = 482100 + (loan.id * 100)
        
        for i in range(1, count + 1):
            m = (6 + i - 1) % 12 + 1
            y = 2026 + (6 + i - 1) // 12
            sch = RepaymentSchedule(
                loan_id=loan.id,
                amount=emi_amount,
                interest_amount=emi_int,
                cheque_no=f"CHQ-{base_chq + i}",
                date=f"18-{m:02d}-{y}",
                received_date=None,
                payment_date=None
            )
            db.session.add(sch)

        db.session.commit()
        send_loan_creation_notifications(loan, requester_name=req_user)

        matched_users = find_users_with_primary_access_for_loan(loan)
        target_display_names = [u.name or u.employee_code for u in matched_users if (u.name or u.employee_code)]
        sec_names = [r.account_name for r in loan.remaining_accounts] if hasattr(loan, 'remaining_accounts') else []
        sec_str = ", ".join(sec_names) if sec_names else "Secondary Account"
        sec_manager_display = ", ".join(target_display_names) if target_display_names else (f"{sec_str} Manager" if sec_names else "Secondary Manager")

        return jsonify({
            "success": True,
            "loan": serialize_pg_loan_to_joint(loan),
            "sec_manager_name": sec_manager_display
        }), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error creating joint loan: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/joint-loans/<loan_id>', methods=['PUT'])
def update_joint_loan(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    try:
        if 'approval_status' in payload or 'approvalStatus' in payload:
            loan.approval_status = str(payload.get('approval_status') or payload.get('approvalStatus')).strip()
        elif 'status' in payload:
            st = payload['status']
            if st == 'Active':
                loan.approval_status = 'APPROVED'
            elif st == 'Closed':
                loan.approval_status = 'CLOSED'
            elif st in ['PENDING_SECONDARY', 'PENDING_ADMIN', 'REJECTED']:
                loan.approval_status = st
            else:
                loan.approval_status = 'PENDING'

        # Accept both camelCase and snake_case for primary account fields
        pri_name = payload.get('primaryAccountName') or payload.get('primary_account_name')
        if pri_name:
            loan.primary_account_name = str(pri_name).strip()

        pri_share = payload.get('primaryShare')
        if pri_share is not None and str(pri_share).strip() != '':
            loan.primary_account_share = safe_float(pri_share, loan.primary_account_share if loan.primary_account_share is not None else 60.0)

        if 'amount' in payload and payload['amount'] is not None and str(payload['amount']).strip() != '':
            loan.loan_amount = safe_float(payload['amount'], loan.loan_amount or 0.0)

        pri_amount = payload.get('primary_account_amount')
        if pri_amount is not None and str(pri_amount).strip() != '':
            loan.primary_account_amount = safe_float(pri_amount, loan.primary_account_amount or 0.0)

        pri_interest = payload.get('primary_account_interest')
        if pri_interest is not None and str(pri_interest).strip() != '':
            loan.primary_account_interest = safe_float(pri_interest, loan.primary_account_interest or 0.0)

        if 'address' in payload:
            loan.address = payload['address']
        elif 'primaryBorrower' in payload and isinstance(payload['primaryBorrower'], dict) and 'address' in payload['primaryBorrower']:
            loan.address = payload['primaryBorrower']['address']
        if 'contact' in payload:
            loan.contact = payload['contact']
        elif 'primaryBorrower' in payload and isinstance(payload['primaryBorrower'], dict) and 'contact' in payload['primaryBorrower']:
            loan.contact = payload['primaryBorrower']['contact']

        # --- Secondary accounts: replace remaining_accounts when provided ---
        sec_list = payload.get('secondaryAccounts')
        if sec_list is None and 'accountDetails' in payload:
            sec_list = [a for a in (payload.get('accountDetails') or []) if not a.get('isPrimary')]

        if sec_list is not None:
            # Also update primary fields from accountDetails if not already set above
            if 'accountDetails' in payload and payload.get('accountDetails'):
                pri_detail = next((a for a in payload['accountDetails'] if a.get('isPrimary')), None)
                if pri_detail:
                    if not pri_name and pri_detail.get('accountName'):
                        loan.primary_account_name = str(pri_detail['accountName']).strip()
                    if pri_share is None and pri_detail.get('share') is not None:
                        loan.primary_account_share = safe_float(pri_detail['share'], loan.primary_account_share if loan.primary_account_share is not None else 60.0)
                    if pri_amount is None and pri_detail.get('principal') is not None:
                        loan.primary_account_amount = safe_float(pri_detail['principal'], loan.primary_account_amount or 0.0)
                    if pri_interest is None and pri_detail.get('interest') is not None:
                        loan.primary_account_interest = safe_float(pri_detail['interest'], loan.primary_account_interest or 0.0)

            # Delete existing secondary accounts then re-insert
            RemainingAccount.query.filter_by(loan_id=loan.id).delete()
            for sec in sec_list:
                acc_name = (sec.get('accountName') or sec.get('name') or '').strip()
                if not acc_name:
                    continue
                pct = safe_float(sec.get('share') or sec.get('percentage'), 0.0)
                principal = safe_float(sec.get('principal') or sec.get('amount'), 0.0)
                interest = safe_float(sec.get('interest') or sec.get('interest_amount'), 0.0)
                tds = safe_float(sec.get('tds'), round(interest * 0.1, 2))
                rem = RemainingAccount(
                    loan_id=loan.id,
                    account_name=acc_name,
                    percentage=pct,
                    share=principal,
                    interest_amount=interest,
                    tds=tds
                )
                db.session.add(rem)

            # Recalculate loan totals
            total_principal = safe_float(loan.primary_account_amount, 0.0) + sum(
                safe_float(s.get('principal') or s.get('amount'), 0.0) for s in sec_list
            )
            total_interest = safe_float(loan.primary_account_interest, 0.0) + sum(
                safe_float(s.get('interest'), 0.0) for s in sec_list
            )
            if total_principal > 0:
                loan.loan_amount = round(total_principal, 2)
            loan.total_interest = round(total_interest, 2)
            loan.total_repayment_amount = round((loan.loan_amount or 0.0) + loan.total_interest, 2)

        if 'history' in payload and payload['history'] is not None:
            loan.history = json.dumps(payload['history']) if isinstance(payload['history'], list) else str(payload['history'])
        if 'approval_status' in payload:
            loan.approval_status = str(payload['approval_status'])
        if 'verified_by' in payload:
            loan.verified_by = json.dumps(payload['verified_by']) if isinstance(payload['verified_by'], list) else str(payload['verified_by'])
        if 'actioned_by' in payload:
            loan.actioned_by = str(payload['actioned_by'])
        if 'actioned_at' in payload:
            loan.actioned_at = str(payload['actioned_at'])
        if 'edited_by' in payload:
            loan.edited_by = str(payload['edited_by'])
        else:
            loan.edited_by = 'User'

        db.session.commit()
        return jsonify({"success": True, "loan": serialize_pg_loan_to_joint(loan)})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error updating loan: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/joint-loans/<loan_id>/history', methods=['POST'])
def add_loan_history_entry(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404
    entry = payload.get('entry') or payload
    curr_hist = []
    try:
        curr_hist = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
    except Exception:
        curr_hist = []
    curr_hist.append(entry)
    loan.history = json.dumps(curr_hist)
    db.session.commit()
    return jsonify({"success": True, "history": curr_hist})

@app.route('/api/joint-loans/<loan_id>', methods=['DELETE'])
def delete_joint_loan(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload=payload, include_deleted=True)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    target_id = loan.id
    # Explicitly remove all child records from remaining_accounts and repayment_schedule
    try:
        RemainingAccount.query.filter_by(loan_id=target_id).delete(synchronize_session=False)
    except Exception as e:
        app.logger.warning(f"Error explicitly deleting remaining_accounts for loan {target_id}: {e}")

    try:
        RepaymentSchedule.query.filter_by(loan_id=target_id).delete(synchronize_session=False)
    except Exception as e:
        app.logger.warning(f"Error explicitly deleting repayment_schedule for loan {target_id}: {e}")

    # Explicitly remove all notifications table entries referencing this removed joint loan
    try:
        ref_patterns = set()
        if loan.loan_ref_id:
            ref_patterns.add(str(loan.loan_ref_id).strip())
        if loan_id:
            ref_patterns.add(str(loan_id).strip())
        if payload.get('loan_ref_id'):
            ref_patterns.add(str(payload['loan_ref_id']).strip())
        if payload.get('id'):
            ref_patterns.add(str(payload['id']).strip())

        db_id = str(loan.id)
        ref_patterns.add(f"JL-2026-{loan.id:04d}")
        ref_patterns.add(f"JL-2026-{loan.id}")
        ref_patterns = {p for p in ref_patterns if p}

        notif_filters = []
        for pat in ref_patterns:
            notif_filters.append(Notification.title.ilike(f"%{pat}%"))
            notif_filters.append(Notification.message.ilike(f"%{pat}%"))
            notif_filters.append(Notification.link.ilike(f"%{pat}%"))

        notif_filters.append(Notification.link.ilike(f"%loanId={db_id}%"))
        notif_filters.append(Notification.link.ilike(f"%/joint-loans/{db_id}%"))
        notif_filters.append(Notification.title.ilike(f"%: {db_id}%"))
        notif_filters.append(Notification.title.ilike(f"%#{db_id} %"))

        if notif_filters:
            deleted_notifs = Notification.query.filter(db.or_(*notif_filters)).delete(synchronize_session=False)
            app.logger.info(f"Deleted {deleted_notifs} notifications for loan {target_id} ({loan.loan_ref_id})")
    except Exception as e_notif:
        app.logger.warning(f"Error deleting notifications for loan {target_id}: {e_notif}")

    # Hard delete from PostgreSQL to completely remove record
    db.session.delete(loan)
    db.session.commit()
    return jsonify({"success": True, "deleted": loan_id, "db_id": target_id})

@app.route('/api/joint-loans/<loan_id>/approve-secondary', methods=['POST'])
def approve_joint_loan_secondary(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    try:
        user_name = payload.get('userName') or payload.get('user_name') or 'Secondary Manager'
        user_code = payload.get('userCode') or payload.get('employee_code') or ''
        sec_account = payload.get('accountName') or ''
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

        loan.approval_status = 'PENDING_ADMIN'
        verified_label = f"{user_name}{f' ({user_code})' if user_code else ''}"
        loan.verified_by = verified_label

        curr_hist = []
        try:
            curr_hist = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
        except Exception:
            curr_hist = []
        
        hist_entry = {
            'id': f"hist_{int(datetime.datetime.now().timestamp()*1000)}_sec",
            'type': 'sec_manager_approval',
            'title': 'Secondary Manager Approved',
            'description': f"Secondary partner share verification approved by {verified_label}{f' for {sec_account}' if sec_account else ''}. Request moved to Admin for final approval.",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': user_name,
            'userRole': 'manager',
            'userEmployeeCode': user_code,
            'accountName': sec_account
        }
        curr_hist = [hist_entry] + curr_hist
        loan.history = json.dumps(curr_hist)

        admins = User.query.filter(db.func.lower(User.role).in_(['admin', 'super admin']), db.func.lower(User.status) == 'active').all()
        client = loan.client_account_name or 'Borrower'
        for a in admins:
            db.session.add(Notification(
                user_name=a.employee_code,
                title=f"Final Approval Required: {loan.loan_ref_id or loan.id}",
                message=f"Loan for {client} of amount ₹{loan.loan_amount:,.2f} has been approved by secondary manager {verified_label}. Awaiting your final authorization.",
                link=f"/joint-loans",
                created_at=now_str,
                is_read=False
            ))
            if a.name and a.name != a.employee_code:
                db.session.add(Notification(
                    user_name=a.name,
                    title=f"Final Approval Required: {loan.loan_ref_id or loan.id}",
                    message=f"Loan for {client} of amount ₹{loan.loan_amount:,.2f} has been approved by secondary manager {verified_label}. Awaiting your final authorization.",
                    link=f"/joint-loans",
                    created_at=now_str,
                    is_read=False
                ))

        db.session.commit()
        return jsonify({"success": True, "loan": serialize_pg_loan_to_joint(loan)})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error in approve_joint_loan_secondary: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/joint-loans/<loan_id>/approve-admin', methods=['POST'])
def approve_joint_loan_admin(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    try:
        admin_name = payload.get('userName') or payload.get('user_name') or 'Administrator'
        admin_code = payload.get('userCode') or payload.get('employee_code') or ''
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

        loan.approval_status = 'APPROVED'
        loan.actioned_by = admin_name
        loan.actioned_at = now_str

        curr_hist = []
        try:
            curr_hist = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
        except Exception:
            curr_hist = []
        
        hist_entry = {
            'id': f"hist_{int(datetime.datetime.now().timestamp()*1000)}_admin",
            'type': 'admin_approval',
            'title': 'Admin Final Approval Granted',
            'description': f"Facility officially authorized and activated for live loan servicing by Administrator {admin_name}{f' ({admin_code})' if admin_code else ''}. Full access unlocked.",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': admin_name,
            'userRole': 'admin',
            'userEmployeeCode': admin_code
        }
        curr_hist = [hist_entry] + curr_hist
        loan.history = json.dumps(curr_hist)

        client = loan.client_account_name or 'Borrower'
        notify_users = set()
        if loan.requester_name:
            notify_users.add(loan.requester_name)
        if loan.verified_by:
            notify_users.add(loan.verified_by)
        
        for u_target in notify_users:
            db.session.add(Notification(
                user_name=u_target,
                title=f"Loan Approved & Activated: {loan.loan_ref_id or loan.id}",
                message=f"Loan for {client} of amount ₹{loan.loan_amount:,.2f} has received final administrator approval and is now Active.",
                link=f"/joint-loans",
                created_at=now_str,
                is_read=False
            ))

        db.session.commit()
        return jsonify({"success": True, "loan": serialize_pg_loan_to_joint(loan)})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error in approve_joint_loan_admin: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/joint-loans/<loan_id>/reject', methods=['POST'])
def reject_joint_loan(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    loan = find_pg_loan(loan_id, payload)
    if not loan:
        return jsonify({"error": "Loan not found"}), 404

    try:
        user_name = payload.get('userName') or payload.get('user_name') or 'Officer'
        user_role = payload.get('userRole') or 'manager'
        reason = payload.get('reason') or 'Terms not accepted during verification.'
        now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

        loan.approval_status = 'REJECTED'

        curr_hist = []
        try:
            curr_hist = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
        except Exception:
            curr_hist = []

        hist_entry = {
            'id': f"hist_{int(datetime.datetime.now().timestamp()*1000)}_reject",
            'type': 'loan_rejected',
            'title': 'Loan Rejected',
            'description': f"Loan rejected by {user_name} ({user_role}). Reason: {reason}",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': user_name,
            'userRole': user_role
        }
        curr_hist = [hist_entry] + curr_hist
        loan.history = json.dumps(curr_hist)
        db.session.commit()
        return jsonify({"success": True, "loan": serialize_pg_loan_to_joint(loan)})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route('/api/notifications', methods=['GET'])
def get_user_notifications():
    user = request.args.get('user', '').strip()
    try:
        query = Notification.query
        if user:
            query = query.filter(
                (db.func.lower(Notification.user_name) == user.lower()) |
                (Notification.user_name == 'all')
            )
        notifs = query.order_by(Notification.id.desc()).limit(50).all()
        return jsonify([{
            'id': n.id,
            'userName': n.user_name,
            'title': n.title,
            'message': n.message,
            'link': n.link,
            'createdAt': n.created_at,
            'isRead': bool(n.is_read)
        } for n in notifs])
    except Exception as e:
        return jsonify([]), 200

@app.route('/api/notifications/<int:notif_id>/read', methods=['PUT', 'POST'])
def mark_notification_as_read(notif_id):
    try:
        notif = Notification.query.get(notif_id)
        if notif:
            notif.is_read = True
            db.session.commit()
            return jsonify({'success': True})
        return jsonify({'error': 'Notification not found'}), 404
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# --- Joint Loan Splits & Schedule Overrides with PostgreSQL ---
@app.route('/api/joint-loans/<loan_id>/splits', methods=['GET'])
def get_loan_splits(loan_id):
    splits = {}
    overrides = {}
    
    loan = find_pg_loan(loan_id)
    if loan and loan.repayment_schedule:
        for idx, sch in enumerate(loan.repayment_schedule):
            s_no = idx + 1
            s_no_str = str(s_no)
            if sch.splits:
                try:
                    split_data = json.loads(sch.splits)
                    splits[s_no_str] = split_data
                    # Populate overrides from split data for Part A and Part B
                    if split_data.get('recdDateA') or split_data.get('dueDateA'):
                        key_a = f"{s_no_str}A"
                        if key_a not in overrides:
                            overrides[key_a] = {}
                        if split_data.get('recdDateA'):
                            overrides[key_a]['receivedDate'] = split_data['recdDateA']
                        if split_data.get('dueDateA'):
                            overrides[key_a]['dueDate'] = split_data['dueDateA']
                        if split_data.get('remarksA'):
                            overrides[key_a]['remarks'] = split_data['remarksA']
                        if split_data.get('payoutApprovalStatusA'):
                            overrides[key_a]['payout_approval_status'] = split_data['payoutApprovalStatusA']
                            overrides[key_a]['payoutApprovalStatus'] = split_data['payoutApprovalStatusA']
                        if split_data.get('payout_approved_by'):
                            overrides[key_a]['payout_approved_by'] = split_data['payout_approved_by']
                    if split_data.get('recdDateB') or split_data.get('dueDateB'):
                        key_b = f"{s_no_str}B"
                        if key_b not in overrides:
                            overrides[key_b] = {}
                        if split_data.get('recdDateB'):
                            overrides[key_b]['receivedDate'] = split_data['recdDateB']
                        if split_data.get('dueDateB'):
                            overrides[key_b]['dueDate'] = split_data['dueDateB']
                        if split_data.get('remarksB'):
                            overrides[key_b]['remarks'] = split_data['remarksB']
                        if split_data.get('payoutApprovalStatusB'):
                            overrides[key_b]['payout_approval_status'] = split_data['payoutApprovalStatusB']
                            overrides[key_b]['payoutApprovalStatus'] = split_data['payoutApprovalStatusB']
                        if split_data.get('payout_approved_by'):
                            overrides[key_b]['payout_approved_by'] = split_data['payout_approved_by']
                except Exception:
                    pass

            if sch.payment_date or sch.received_date or getattr(sch, 'payout_approval_status', None):
                if s_no_str not in overrides:
                    overrides[s_no_str] = {}
                if sch.received_date:
                    overrides[s_no_str]['receivedDate'] = sch.received_date
                if sch.payment_date:
                    overrides[s_no_str]['dueDate'] = sch.payment_date
                if getattr(sch, 'payout_approval_status', None):
                    overrides[s_no_str]['payout_approval_status'] = sch.payout_approval_status
                    overrides[s_no_str]['payoutApprovalStatus'] = sch.payout_approval_status
                if getattr(sch, 'payout_approval_target', None):
                    overrides[s_no_str]['payout_approval_target'] = sch.payout_approval_target
                    overrides[s_no_str]['payoutApprovalTarget'] = sch.payout_approval_target
                if getattr(sch, 'payout_requested_role', None):
                    overrides[s_no_str]['payout_requested_role'] = sch.payout_requested_role
                    overrides[s_no_str]['payout_editor_role'] = sch.payout_requested_role
                    overrides[s_no_str]['payoutRequestedRole'] = sch.payout_requested_role
                if getattr(sch, 'payout_approved_by', None):
                    overrides[s_no_str]['payout_approved_by'] = sch.payout_approved_by
                if getattr(sch, 'payout_approved_at', None):
                    overrides[s_no_str]['payout_approved_at'] = sch.payout_approved_at
                if getattr(sch, 'payout_notes', None):
                    overrides[s_no_str]['payout_notes'] = sch.payout_notes
                    
    return jsonify({
        "loanId": loan_id,
        "splits": splits,
        "overrides": overrides
    })

@app.route('/api/joint-loans/<loan_id>/splits', methods=['POST'])
def save_loan_split(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    s_no = payload.get('sNo')
    if s_no is None:
        return jsonify({"error": "Missing installment sNo"}), 400

    loan = find_pg_loan(loan_id, payload)
    if loan and loan.repayment_schedule:
        try:
            target_idx = int(s_no) - 1
            if 0 <= target_idx < len(loan.repayment_schedule):
                sch = loan.repayment_schedule[target_idx]
                existing = {}
                if sch.splits:
                    try:
                        existing = json.loads(sch.splits)
                    except Exception:
                        existing = {}
                existing.update(payload)
                sch.splits = json.dumps(existing)
                first_recd = payload.get('recdDateA') or payload.get('firstRecdDate') or payload.get('recdDate')
                if first_recd:
                    sch.received_date = first_recd
                first_payout = payload.get('dueDateA') or payload.get('firstPayoutDate') or payload.get('payoutDate') or payload.get('dueDate')
                if first_payout and first_payout not in ('-', '—'):
                    sch.payment_date = first_payout
                if payload.get('remarks') is not None:
                    sch.remarks = payload['remarks']

                p_status = payload.get('payout_approval_status') or payload.get('payoutApprovalStatus')
                if p_status:
                    sch.payout_approval_status = p_status
                    if p_status == 'APPROVED':
                        sch.payout_approval_target = None
                        sch.payout_approved_by = payload.get('payout_approved_by') or 'System Admin'
                        sch.payout_approved_at = payload.get('payout_approved_at') or datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")
                        sch.payout_notes = payload.get('payout_notes') or 'Auto-approved by System Admin'
                
                if payload.get('historyEntry'):
                    try:
                        curr_h = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
                    except Exception:
                        curr_h = []
                    curr_h.append(payload['historyEntry'])
                    loan.history = json.dumps(curr_h)

                db.session.commit()
        except Exception as e:
            app.logger.warning(f"Error persisting split to PostgreSQL: {e}")
            db.session.rollback()

    return get_loan_splits(loan_id)

@app.route('/api/joint-loans/<loan_id>/splits/<s_no>', methods=['DELETE'])
def revert_loan_split(loan_id, s_no):
    loan = find_pg_loan(loan_id)
    if loan and loan.repayment_schedule:
        try:
            target_idx = int(s_no) - 1
            if 0 <= target_idx < len(loan.repayment_schedule):
                loan.repayment_schedule[target_idx].splits = None
                loan.repayment_schedule[target_idx].received_date = None
                loan.repayment_schedule[target_idx].payment_date = None
                db.session.commit()
        except Exception as e:
            db.session.rollback()

    return jsonify({
        "success": True,
        "reverted": s_no
    })

@app.route('/api/joint-loans/<loan_id>/overrides', methods=['POST'])
def save_schedule_override(loan_id):
    payload = request.get_json(force=True, silent=True) or {}
    s_no = payload.get('sNo')
    field = payload.get('field')
    value = payload.get('value')

    if s_no is None or not field:
        return jsonify({"error": "Missing sNo or field"}), 400

    loan = find_pg_loan(loan_id, payload)
    if loan and loan.repayment_schedule:
        try:
            s_no_str = str(s_no).strip()
            m = re.match(r'^(\d+)([a-zA-Z])?$', s_no_str)
            if m:
                target_idx = int(m.group(1)) - 1
                sub_part = m.group(2).upper() if m.group(2) else None
                if 0 <= target_idx < len(loan.repayment_schedule):
                    sch = loan.repayment_schedule[target_idx]

                    user_name_val = str(payload.get('userName') or payload.get('user_name') or payload.get('payout_requested_by') or payload.get('payout_approved_by') or '').strip().lower()
                    user_role_val = str(payload.get('userRole') or payload.get('user_role') or payload.get('payout_editor_role') or '').strip().lower()
                    payout_status_val = str(payload.get('payout_approval_status') or payload.get('payoutApprovalStatus') or '').strip().upper()

                    is_admin_user = (
                        user_name_val in ('system admin', 'admin') or
                        user_role_val in ('admin', 'super admin') or
                        payout_status_val == 'APPROVED'
                    )
                    admin_approver = payload.get('payout_approved_by') or payload.get('userName') or payload.get('user_name') or 'System Admin'
                    now_str = payload.get('payout_approved_at') or datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

                    if sub_part:
                        curr_splits = json.loads(sch.splits) if sch.splits else {}
                        if sub_part == 'A':
                            if field == 'receivedDate':
                                curr_splits['recdDateA'] = value
                                curr_splits['recdDate'] = value
                                if is_admin_user:
                                    if value and str(value).strip() not in ('-', '—', ''):
                                        curr_splits['payoutApprovalStatusA'] = 'APPROVED'
                                        curr_splits['payoutApprovalStatus'] = 'APPROVED'
                                        sch.payout_approval_status = 'APPROVED'
                                        sch.payout_approval_target = None
                                        sch.payout_approved_by = admin_approver
                                        sch.payout_approved_at = now_str
                                elif value and str(value).strip() not in ('-', '—', '') and curr_splits.get('payoutApprovalStatusA') != 'APPROVED':
                                    curr_splits['payoutApprovalStatusA'] = 'PENDING'
                                    sch.payout_approval_status = 'PENDING'
                                    sch.payout_approval_target = 'SECONDARY'
                                    sch.payout_requested_role = 'PRIMARY'
                                    sch.payout_requested_by = payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Primary Manager'
                                    sch.payout_requested_at = now_str
                            elif field in ('dueDate', 'paymentDate', 'payment_date', 'payoutDate'):
                                curr_splits['dueDateA'] = value
                                payout_override_status = payload.get('payout_approval_status') or payload.get('payoutApprovalStatus')
                                payout_target = payload.get('payout_approval_target') or payload.get('payoutApprovalTarget')
                                payout_role = payload.get('payout_requested_role') or ('SECONDARY' if payout_target == 'PRIMARY' else 'PRIMARY')
                                if not payout_target:
                                    payout_target = 'PRIMARY' if payout_role == 'SECONDARY' else 'SECONDARY'

                                is_auto_app = is_admin_user or payout_override_status == 'APPROVED'
                                if is_auto_app:
                                    if value and str(value).strip() not in ('-', '—', ''):
                                        curr_splits['payoutApprovalStatusA'] = 'APPROVED'
                                        curr_splits['payoutApprovalStatus'] = 'APPROVED'
                                        sch.payout_approval_status = 'APPROVED'
                                        sch.payout_approval_target = None
                                        sch.payout_requested_role = payout_role
                                        sch.payout_approved_by = admin_approver
                                        sch.payout_approved_at = now_str
                                        sch.payout_notes = payload.get('payout_notes') or 'Auto-approved by System Admin'
                                elif value and str(value).strip() not in ('-', '—', ''):
                                    curr_splits['payoutApprovalStatusA'] = 'PENDING'
                                    sch.payout_approval_status = 'PENDING'
                                    sch.payout_approval_target = payout_target
                                    sch.payout_requested_role = payout_role
                                    sch.payout_approved_by = None
                                    sch.payout_approved_at = None
                                    sch.payout_notes = None
                                    req_by = payload.get('payout_requested_by') or payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Staff'
                                    sch.payout_requested_by = req_by
                                    sch.payout_requested_at = payload.get('payout_requested_at') or now_str
                                    send_payout_approval_notifications(loan, target_idx + 1, value, req_by, target_role=payout_target)
                                else:
                                    curr_splits['payoutApprovalStatusA'] = None
                                    sch.payout_approval_status = None
                                    sch.payout_approval_target = None
                                    sch.payout_requested_role = None
                                    sch.payout_requested_by = None
                                    sch.payout_requested_at = None
                                    sch.payout_approved_by = None
                                    sch.payout_approved_at = None
                                    sch.payout_notes = None
                            elif field == 'remarks':
                                curr_splits['remarksA'] = value
                        elif sub_part == 'B':
                            if field == 'receivedDate':
                                curr_splits['recdDateB'] = value
                                if is_admin_user:
                                    if value and str(value).strip() not in ('-', '—', ''):
                                        curr_splits['payoutApprovalStatusB'] = 'APPROVED'
                                        sch.payout_approval_status = 'APPROVED'
                                        sch.payout_approval_target = None
                                        sch.payout_approved_by = admin_approver
                                        sch.payout_approved_at = now_str
                                elif value and str(value).strip() not in ('-', '—', '') and curr_splits.get('payoutApprovalStatusB') != 'APPROVED':
                                    curr_splits['payoutApprovalStatusB'] = 'PENDING'
                                    sch.payout_approval_status = 'PENDING'
                                    sch.payout_approval_target = 'SECONDARY'
                                    sch.payout_requested_role = 'PRIMARY'
                                    sch.payout_requested_by = payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Primary Manager'
                                    sch.payout_requested_at = now_str
                            elif field in ('dueDate', 'paymentDate', 'payment_date', 'payoutDate'):
                                curr_splits['dueDateB'] = value
                                payout_override_status = payload.get('payout_approval_status') or payload.get('payoutApprovalStatus')
                                payout_target = payload.get('payout_approval_target') or payload.get('payoutApprovalTarget')
                                payout_role = payload.get('payout_editor_role') or payload.get('payout_requested_role') or ('SECONDARY' if payout_target == 'PRIMARY' else 'PRIMARY')
                                if not payout_target:
                                    payout_target = 'PRIMARY' if payout_role == 'SECONDARY' else 'SECONDARY'

                                is_auto_app = is_admin_user or payout_override_status == 'APPROVED'
                                if is_auto_app:
                                    if value and str(value).strip() not in ('-', '—', ''):
                                        curr_splits['payoutApprovalStatusB'] = 'APPROVED'
                                        curr_splits['payoutApprovalStatus'] = 'APPROVED'
                                        sch.payout_approval_status = 'APPROVED'
                                        sch.payout_approval_target = None
                                        sch.payout_requested_role = payout_role
                                        sch.payout_approved_by = admin_approver
                                        sch.payout_approved_at = now_str
                                        sch.payout_notes = payload.get('payout_notes') or 'Auto-approved by System Admin'
                                elif value and str(value).strip() not in ('-', '—', ''):
                                    curr_splits['payoutApprovalStatusB'] = 'PENDING'
                                    sch.payout_approval_status = 'PENDING'
                                    sch.payout_approval_target = payout_target
                                    sch.payout_requested_role = payout_role
                                    sch.payout_approved_by = None
                                    sch.payout_approved_at = None
                                    sch.payout_notes = None
                                    req_by = payload.get('payout_requested_by') or payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Staff'
                                    sch.payout_requested_by = req_by
                                    sch.payout_requested_at = payload.get('payout_requested_at') or now_str
                                    send_payout_approval_notifications(loan, target_idx + 1, value, req_by, target_role=payout_target)
                                else:
                                    curr_splits['payoutApprovalStatusB'] = None
                                    sch.payout_approval_status = None
                                    sch.payout_approval_target = None
                                    sch.payout_requested_role = None
                                    sch.payout_requested_by = None
                                    sch.payout_requested_at = None
                                    sch.payout_approved_by = None
                                    sch.payout_approved_at = None
                                    sch.payout_notes = None
                            elif field == 'remarks':
                                curr_splits['remarksB'] = value
                        sch.splits = json.dumps(curr_splits)
                    else:
                        if field == 'receivedDate':
                            sch.received_date = value
                            if is_admin_user:
                                if value and str(value).strip() not in ('-', '—', ''):
                                    sch.payout_approval_status = 'APPROVED'
                                    sch.payout_approval_target = None
                                    sch.payout_approved_by = admin_approver
                                    sch.payout_approved_at = now_str
                            elif value and str(value).strip() not in ('-', '—', '') and not getattr(sch, 'payout_approved_by', None):
                                sch.payout_approval_status = 'PENDING'
                                sch.payout_approval_target = 'SECONDARY'
                                sch.payout_requested_role = 'PRIMARY'
                                sch.payout_requested_by = payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Primary Manager'
                                sch.payout_requested_at = now_str
                        elif field == 'date':
                            sch.date = value
                        elif field == 'chequeNo':
                            sch.cheque_no = value
                        elif field in ('dueDate', 'paymentDate', 'payment_date', 'payoutDate'):
                            sch.payment_date = value
                            payout_override_status = payload.get('payout_approval_status') or payload.get('payoutApprovalStatus')
                            payout_target = payload.get('payout_approval_target') or payload.get('payoutApprovalTarget')
                            payout_role = payload.get('payout_editor_role') or payload.get('payout_requested_role') or ('SECONDARY' if payout_target == 'PRIMARY' else 'PRIMARY')
                            if not payout_target:
                                payout_target = 'PRIMARY' if payout_role == 'SECONDARY' else 'SECONDARY'

                            is_auto_app = is_admin_user or payout_override_status == 'APPROVED'
                            if is_auto_app:
                                if value and str(value).strip() not in ('-', '—', ''):
                                    sch.payout_approval_status = 'APPROVED'
                                    sch.payout_approval_target = None
                                    sch.payout_requested_role = payout_role
                                    sch.payout_approved_by = admin_approver
                                    sch.payout_approved_at = now_str
                                    sch.payout_notes = payload.get('payout_notes') or 'Auto-approved by System Admin'
                                else:
                                    sch.payout_approval_status = None
                                    sch.payout_approval_target = None
                                    sch.payout_requested_role = None
                                    sch.payout_requested_by = None
                                    sch.payout_requested_at = None
                                    sch.payout_approved_by = None
                                    sch.payout_approved_at = None
                                    sch.payout_notes = None
                            elif value and str(value).strip() not in ('-', '—', ''):
                                sch.payout_approval_status = 'PENDING'
                                sch.payout_approval_target = payout_target
                                sch.payout_requested_role = payout_role
                                sch.payout_approved_by = None
                                sch.payout_approved_at = None
                                sch.payout_notes = None
                                req_by = payload.get('payout_requested_by') or payload.get('userName') or payload.get('user_name') or payload.get('employee_code') or 'Staff'
                                sch.payout_requested_by = req_by
                                sch.payout_requested_at = payload.get('payout_requested_at') or now_str
                                send_payout_approval_notifications(loan, target_idx + 1, value, req_by, target_role=payout_target)
                            else:
                                sch.payout_approval_status = None
                                sch.payout_approval_target = None
                                sch.payout_requested_role = None
                                sch.payout_requested_by = None
                                sch.payout_requested_at = None
                                sch.payout_approved_by = None
                                sch.payout_approved_at = None
                                sch.payout_notes = None
                        elif field == 'remarks':
                            sch.remarks = value
                    
                    if payload.get('historyEntry'):
                        try:
                            curr_h = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
                        except Exception:
                            curr_h = []
                        curr_h.append(payload['historyEntry'])
                        loan.history = json.dumps(curr_h)

                    db.session.commit()
        except Exception as e:
            app.logger.warning(f"Error persisting schedule override to PostgreSQL: {e}")
            db.session.rollback()

    return get_loan_splits(loan_id)

@app.route('/api/joint-loans/<loan_id>/schedule/<int:s_no>/payout-approval', methods=['POST'])
def handle_payout_approval(loan_id, s_no):
    payload = request.get_json(force=True, silent=True) or {}
    action = (payload.get('action') or 'APPROVE').upper()
    approver_code = payload.get('approver_employee_code') or payload.get('employee_code') or 'SYSTEM'
    approver_name = payload.get('approver_name') or payload.get('userName') or approver_code
    notes = payload.get('notes') or ''

    loan = find_pg_loan(loan_id, payload)
    if not loan or not loan.repayment_schedule:
        return jsonify({'error': 'Loan or repayment schedule not found'}), 404

    target_idx = s_no - 1
    if target_idx < 0 or target_idx >= len(loan.repayment_schedule):
        return jsonify({'error': f'Invalid installment number #{s_no}'}), 400

    sch = loan.repayment_schedule[target_idx]
    now_str = datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p")

    curr_h = []
    try:
        curr_h = json.loads(loan.history) if getattr(loan, 'history', None) and isinstance(loan.history, str) else (loan.history if isinstance(getattr(loan, 'history', None), list) else [])
    except Exception:
        curr_h = []

    approver_role = payload.get('approver_role') or ('PRIMARY' if getattr(sch, 'payout_approval_target', None) == 'PRIMARY' else 'SECONDARY')
    approver_role_label = "Primary Manager" if approver_role == 'PRIMARY' else "Secondary Account Manager"

    if action == 'APPROVE':
        sch.payout_approval_status = 'APPROVED'
        sch.payout_approval_target = None
        sch.payout_approved_by = approver_name
        sch.payout_approved_at = now_str
        if notes:
            sch.payout_notes = notes

        # Update splits if row is split
        if sch.splits:
            try:
                curr_splits = json.loads(sch.splits)
                curr_splits['payoutApprovalStatus'] = 'APPROVED'
                curr_splits['payoutApprovalStatusA'] = 'APPROVED'
                curr_splits['payoutApprovalStatusB'] = 'APPROVED'
                curr_splits['payoutApprovalTarget'] = None
                curr_splits['payoutApprovalTargetA'] = None
                curr_splits['payoutApprovalTargetB'] = None
                sch.splits = json.dumps(curr_splits)
            except Exception:
                pass

        hist_entry = {
            'id': f"hist_payout_app_{int(datetime.datetime.now().timestamp() * 1000)}",
            'type': 'payout_approval',
            'title': f"EMI #{s_no} Payout Approved & Settled",
            'description': f"{approver_role_label} {approver_name} ({approver_code}) approved payout remittance on {sch.payment_date or 'scheduled date'}. EMI #{s_no} is now full settled.",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': approver_name,
            'userEmployeeCode': approver_code,
            'emiNo': s_no,
            'status': 'APPROVED',
            'notes': notes
        }
        curr_h.append(hist_entry)
        loan.history = json.dumps(curr_h)

        # Mark all pending notifications for this loan & EMI as read/resolved!
        try:
            target_str = f"EMI #{s_no} Payout Approval Required: {loan.loan_ref_id or loan.id}"
            notifs = Notification.query.filter(Notification.title == target_str).all()
            for n in notifs:
                n.is_read = True
        except Exception:
            pass

        # Record payout approved notification for requester, partner manager, and admin
        try:
            client = loan.client_account_name or 'Borrower'
            notif_title = f"EMI #{s_no} Payout Date Approved: {loan.loan_ref_id or loan.id}"
            approver_display = f"{approver_name} ({approver_code})" if approver_code else approver_name
            notif_msg = f"Payout date ({sch.payment_date or 'scheduled date'}) for EMI #{s_no} ({client}) was approved & settled by {approver_display}."

            recipients = set()
            if getattr(sch, 'payout_requested_by', None):
                recipients.add(str(sch.payout_requested_by).strip())
            if loan.requester_name:
                recipients.add(str(loan.requester_name).strip())

            pri_users = find_users_with_primary_access_for_loan_primary(loan)
            sec_users = find_users_with_primary_access_for_loan(loan)
            for u in pri_users:
                if u.employee_code:
                    recipients.add(u.employee_code)
                if u.name:
                    recipients.add(u.name)
            for u in sec_users:
                if u.employee_code:
                    recipients.add(u.employee_code)
                if u.name:
                    recipients.add(u.name)
            recipients.add('admin')

            for r in recipients:
                db.session.add(Notification(
                    user_name=r,
                    title=notif_title,
                    message=notif_msg,
                    link=f"/joint-loan/{loan.loan_ref_id or loan.id}",
                    created_at=now_str,
                    is_read=False
                ))
        except Exception as e:
            app.logger.warning(f"Error creating payout approved notification: {e}")

        # Check if all installments are now collected & payout approved -> mark loan closed
        all_settled = True
        for item in loan.repayment_schedule:
            sp_data = None
            if item.splits:
                try:
                    sp_data = json.loads(item.splits) if isinstance(item.splits, str) else item.splits
                except Exception:
                    sp_data = None
            if sp_data and isinstance(sp_data, dict):
                if not sp_data.get('isFinalSettled'):
                    stat_a = (sp_data.get('payoutApprovalStatusA') or '').upper()
                    stat_b = (sp_data.get('payoutApprovalStatusB') or '').upper()
                    recd_a = sp_data.get('recdDateA') or sp_data.get('recdDate')
                    recd_b = sp_data.get('recdDateB')
                    due_a = sp_data.get('dueDateA')
                    due_b = sp_data.get('dueDateB')
                    if not recd_a or not due_a or stat_a != 'APPROVED':
                        all_settled = False
                        break
                    if (recd_b or due_b) and (not recd_b or not due_b or stat_b != 'APPROVED'):
                        all_settled = False
                        break
            else:
                p_stat = getattr(item, 'payout_approval_status', None)
                if not item.received_date or not item.payment_date or p_stat != 'APPROVED':
                    all_settled = False
                    break
        if all_settled and len(loan.repayment_schedule) > 0:
            loan.approval_status = 'CLOSED'
            loan.status = 'Closed'

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f"EMI #{s_no} payout approved successfully! EMI is now full settled.",
            'loan': serialize_pg_loan_to_joint(loan)
        })

    elif action == 'REJECT':
        sch.payout_approval_status = 'REJECTED'
        sch.payout_approval_target = None
        sch.payout_notes = notes

        hist_entry = {
            'id': f"hist_payout_rej_{int(datetime.datetime.now().timestamp() * 1000)}",
            'type': 'payout_rejection',
            'title': f"EMI #{s_no} Payout Discrepancy / Rejected",
            'description': f"{approver_role_label} {approver_name} ({approver_code}) flagged payout date discrepancy for EMI #{s_no}. Reason: {notes or 'No reason provided'}",
            'timestamp': now_str,
            'isoDate': datetime.datetime.now().isoformat(),
            'userName': approver_name,
            'userEmployeeCode': approver_code,
            'emiNo': s_no,
            'status': 'REJECTED',
            'notes': notes
        }
        curr_h.append(hist_entry)
        loan.history = json.dumps(curr_h)

        if sch.payout_requested_by:
            db.session.add(Notification(
                user_name=sch.payout_requested_by,
                title=f"EMI #{s_no} Payout Rejected: {loan.loan_ref_id or loan.id}",
                message=f"{approver_role_label} {approver_name} rejected payout for EMI #{s_no}: {notes or 'Please review and re-submit.'}",
                link="/joint-loans",
                created_at=now_str,
                is_read=False
            ))

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f"EMI #{s_no} payout marked as rejected.",
            'loan': serialize_pg_loan_to_joint(loan)
        })

    return jsonify({'error': 'Invalid action. Expected APPROVE or REJECT.'}), 400

# --- Database Sync / Refresh Endpoint ---
@app.route('/api/sync', methods=['GET', 'POST'])
def sync_data():
    from sftp_service import load_sftp_config, run_sftp_sync, process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER
    sftp_res = None
    if request.method == 'POST':
        try:
            sftp_cfg = load_sftp_config(hide_password=False)
            if sftp_cfg.get('host') and sftp_cfg.get('enabled', True):
                sftp_res = run_sftp_sync(process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER)
        except Exception as e_sftp:
            app.logger.warning(f"SFTP DayBook sync during /api/sync warning: {e_sftp}")

    sftp_cfg_safe = load_sftp_config(hide_password=True)
    pg_loans = Loan.query.filter_by(is_deleted=False).order_by(Loan.id.desc()).all()
    return jsonify({
        "status": "synced",
        "totalLoans": len(pg_loans),
        "database": "postgresql",
        "last_sync_time": sftp_cfg_safe.get("last_sync_time"),
        "last_sync_status": sftp_cfg_safe.get("last_sync_status"),
        "sftp_result": sftp_res
    })

# --- Accounts Name CRUD Endpoints ---
@app.route('/api/account-names', methods=['GET'])
def get_account_names():
    try:
        accs = AccountName.query.order_by(AccountName.id.asc()).all()
        return jsonify([{
            'id': a.id,
            'name': a.name,
            'acronym': a.acronym,
            'color': a.color,
            'type': a.type,
            'is_need_approval': a.is_need_approval
        } for a in accs])
    except Exception as e:
        app.logger.warning(f"Failed to query account names: {e}")
        return jsonify([])

@app.route('/api/account-names', methods=['POST'])
def create_account_name():
    payload = request.get_json(force=True, silent=True) or {}
    name = (payload.get('name') or '').strip()
    acronym = (payload.get('acronym') or '').strip().upper()
    color = (payload.get('color') or 'blue').strip().lower()
    acc_type = (payload.get('type') or 'jl_report').strip()
    is_need_approval = payload.get('is_need_approval', True)

    if not name:
        return jsonify({'error': 'Account name is required'}), 400
    if not acronym:
        words = name.split()
        acronym = (''.join(w[0] for w in words)[:4] if len(words) > 1 else name[:4]).upper()

    existing = AccountName.query.filter(
        db.func.upper(AccountName.acronym) == acronym
    ).first()
    if existing:
        return jsonify({'error': f"An account with acronym '{acronym}' already exists ({existing.name})"}), 400

    try:
        new_acc = AccountName(
            name=name,
            acronym=acronym,
            color=color,
            type=acc_type,
            is_need_approval=bool(is_need_approval)
        )
        db.session.add(new_acc)
        db.session.commit()
        return jsonify({
            'success': True,
            'account': {
                'id': new_acc.id,
                'name': new_acc.name,
                'acronym': new_acc.acronym,
                'color': new_acc.color,
                'type': new_acc.type,
                'is_need_approval': new_acc.is_need_approval
            }
        }), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error creating account name: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/account-names/<int:acc_id>', methods=['PUT'])
def update_account_name(acc_id):
    payload = request.get_json(force=True, silent=True) or {}
    acc = AccountName.query.get(acc_id)
    if not acc:
        return jsonify({'error': 'Account name not found'}), 404

    name = payload.get('name')
    acronym = payload.get('acronym')
    color = payload.get('color')
    acc_type = payload.get('type')
    is_need_approval = payload.get('is_need_approval')

    if name is not None:
        name = name.strip()
        if not name:
            return jsonify({'error': 'Account name cannot be empty'}), 400
        acc.name = name

    if acronym is not None:
        acronym = acronym.strip().upper()
        if not acronym:
            return jsonify({'error': 'Acronym cannot be empty'}), 400
        conflict = AccountName.query.filter(
            db.func.upper(AccountName.acronym) == acronym,
            AccountName.id != acc_id
        ).first()
        if conflict:
            return jsonify({'error': f"Acronym '{acronym}' is already used by '{conflict.name}'"}), 400
        acc.acronym = acronym

    if color is not None:
        acc.color = color.strip().lower()
    if acc_type is not None:
        acc.type = acc_type.strip()
    if is_need_approval is not None:
        acc.is_need_approval = bool(is_need_approval)

    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'account': {
                'id': acc.id,
                'name': acc.name,
                'acronym': acc.acronym,
                'color': acc.color,
                'type': acc.type,
                'is_need_approval': acc.is_need_approval
            }
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error updating account name {acc_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/account-names/<int:acc_id>', methods=['DELETE'])
def delete_account_name(acc_id):
    acc = AccountName.query.get(acc_id)
    if not acc:
        return jsonify({'error': 'Account name not found'}), 404

    try:
        deleted_name = acc.name
        db.session.delete(acc)
        db.session.commit()
        return jsonify({
            'success': True,
            'deleted': acc_id,
            'name': deleted_name
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error deleting account name {acc_id}: {e}")
        return jsonify({'error': str(e)}), 500


# ------------------------------------------------------------------
# User Management CRUD Endpoints
# ------------------------------------------------------------------
def serialize_user(u):
    """Serialize User model to JSON dictionary without exposing password hash."""
    allowed_menus = []
    if u.allowed_menus:
        try:
            allowed_menus = json.loads(u.allowed_menus) if isinstance(u.allowed_menus, str) else u.allowed_menus
            if not isinstance(allowed_menus, list):
                allowed_menus = []
        except Exception:
            allowed_menus = []
    if not allowed_menus:
        if (getattr(u, 'role', '') or '').strip().lower() in ('admin', 'super admin'):
            allowed_menus = ['dashboard', 'joint-loan', 'short-loan', 'matchup', 'requests', 'users', 'settings']
        else:
            allowed_menus = ['dashboard', 'joint-loan']

    permissions = {}
    if u.permissions:
        try:
            permissions = json.loads(u.permissions) if isinstance(u.permissions, str) else u.permissions
            if not isinstance(permissions, (dict, list)):
                permissions = {}
        except Exception:
            permissions = {}

    return {
        'id': u.id,
        'employee_code': u.employee_code,
        'name': u.name or '',
        'role': u.role or 'user',
        'status': getattr(u, 'status', None) or 'active',
        'is_initial_password': bool(u.is_initial_password),
        'email': u.email or '',
        'mobile': u.mobile or '',
        'allowed_menus': allowed_menus,
        'permissions': permissions,
        'security_question': u.security_question or '',
    }

@app.route('/api/login', methods=['POST'])
def login():
    payload = request.get_json(force=True, silent=True) or {}
    employee_code = (payload.get('employee_code') or payload.get('username') or '').strip()
    password = payload.get('password') or ''

    if not employee_code:
        return jsonify({'error': 'Employee Code / Login ID is required.'}), 400
    if not password:
        return jsonify({'error': 'Password is required.'}), 400

    user = User.query.filter(
        db.func.lower(User.employee_code) == employee_code.lower()
    ).first()

    if not user:
        return jsonify({'error': 'Invalid Employee Code or password.'}), 401

    user_status = (getattr(user, 'status', None) or 'active').strip().lower()
    if user_status == 'inactive':
        return jsonify({'error': 'This account has been deactivated. Please contact your system administrator.'}), 403

    is_valid = False
    try:
        is_valid = check_password_hash(user.password, password)
    except Exception:
        pass
    if not is_valid and user.password == password:
        is_valid = True

    # Fallback check for common password case variations (e.g. Admin123 vs admin123)
    if not is_valid:
        try:
            if check_password_hash(user.password, password.lower()):
                is_valid = True
            elif check_password_hash(user.password, password.capitalize()):
                is_valid = True
        except Exception:
            pass

    if not is_valid:
        return jsonify({'error': 'Invalid Employee Code or password.'}), 401

    token = f"ld_token_{user.id}_{int(datetime.datetime.utcnow().timestamp())}"
    return jsonify({
        'success': True,
        'message': f"Welcome back, {user.name or user.employee_code}!",
        'user': serialize_user(user),
        'token': token
    })

@app.route('/api/initial-setup', methods=['POST'])
def initial_setup():
    payload = request.get_json(force=True, silent=True) or {}
    user_id = payload.get('user_id')
    employee_code = (payload.get('employee_code') or '').strip()
    new_password = payload.get('new_password') or ''
    security_question = (payload.get('security_question') or '').strip()
    security_answer = (payload.get('security_answer') or '').strip()

    user = None
    if user_id:
        user = User.query.get(user_id)
    if not user and employee_code:
        user = User.query.filter(db.func.lower(User.employee_code) == employee_code.lower()).first()

    if not user:
        return jsonify({'error': 'User not found. Please log in again.'}), 404

    if not new_password or len(str(new_password).strip()) < 6:
        return jsonify({'error': 'New password must be at least 6 characters long.'}), 400

    valid_questions = [
        "What is your mother's maiden name?",
        "What was the name of your first pet?",
        "What city were you born in?",
        "What was the name of your elementary school?"
    ]

    if not security_question or security_question not in valid_questions:
        return jsonify({'error': 'Please select a valid security question from the provided list.'}), 400

    if not security_answer or len(security_answer) < 2:
        return jsonify({'error': 'Please provide an answer to your security question (minimum 2 characters).'}), 400

    try:
        user.password = generate_password_hash(str(new_password).strip())
        user.is_initial_password = False
        user.security_question = security_question
        user.security_answer = security_answer
        db.session.commit()

        token = f"ld_token_{user.id}_{int(datetime.datetime.utcnow().timestamp())}"
        return jsonify({
            'success': True,
            'message': 'Initial security setup completed successfully. Welcome to LoanDesk!',
            'user': serialize_user(user),
            'token': token
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error completing initial setup for user {user.id}: {e}")
        return jsonify({'error': f'Failed to save initial setup: {str(e)}'}), 500

@app.route('/api/forgot-password/get-question', methods=['GET', 'POST'])
def forgot_password_get_question():
    if request.method == 'POST':
        payload = request.get_json(force=True, silent=True) or {}
        employee_code = (payload.get('employee_code') or '').strip()
    else:
        employee_code = (request.args.get('employee_code') or '').strip()

    if not employee_code:
        return jsonify({'error': 'Employee Code is required.'}), 400

    user = User.query.filter(db.func.lower(User.employee_code) == employee_code.lower()).first()
    if not user:
        return jsonify({'error': f"No account found matching employee code '{employee_code}'."}), 404

    user_status = (getattr(user, 'status', None) or 'active').strip().lower()
    if user_status == 'inactive':
        return jsonify({'error': 'This account has been deactivated. Please contact your system administrator.'}), 403

    if not user.security_question:
        return jsonify({
            'error': 'No security question configured for this account. Please log in with your initial password or contact your administrator.'
        }), 400

    return jsonify({
        'success': True,
        'employee_code': user.employee_code,
        'name': user.name or '',
        'security_question': user.security_question
    })

@app.route('/api/forgot-password/verify', methods=['POST'])
def forgot_password_verify():
    payload = request.get_json(force=True, silent=True) or {}
    employee_code = (payload.get('employee_code') or '').strip()
    security_question = (payload.get('security_question') or '').strip()
    security_answer = (payload.get('security_answer') or '').strip()

    if not employee_code:
        return jsonify({'error': 'Please enter your Employee Code.'}), 400
    if not security_answer:
        return jsonify({'error': 'Please enter your security answer.'}), 400

    user = User.query.filter(db.func.lower(User.employee_code) == employee_code.lower()).first()
    if not user:
        return jsonify({'error': f"No account found with Employee Code '{employee_code}'."}), 404

    user_status = (getattr(user, 'status', None) or 'active').strip().lower()
    if user_status == 'inactive':
        return jsonify({'error': 'This account has been deactivated. Please contact your system administrator.'}), 403

    if not user.security_question or not user.security_answer:
        return jsonify({
            'error': 'Security question has not been configured for this account. Please contact your administrator.'
        }), 400

    if security_question and user.security_question.strip().lower() != security_question.strip().lower():
        return jsonify({'error': 'Selected security question does not match the question on record.'}), 400

    if user.security_answer.strip().lower() != security_answer.strip().lower():
        return jsonify({'error': 'Incorrect security answer. Please check and try again.'}), 400

    ts = int(datetime.datetime.utcnow().timestamp())
    token = f"reset_{user.id}_{ts}"

    return jsonify({
        'success': True,
        'message': 'Identity verified successfully.',
        'employee_code': user.employee_code,
        'user_name': user.name or user.employee_code,
        'reset_token': token
    })

@app.route('/api/forgot-password/reset-password', methods=['POST'])
def forgot_password_reset():
    payload = request.get_json(force=True, silent=True) or {}
    employee_code = (payload.get('employee_code') or '').strip()
    security_answer = (payload.get('security_answer') or '').strip()
    reset_token = (payload.get('reset_token') or '').strip()
    new_password = payload.get('new_password') or ''

    if not employee_code:
        return jsonify({'error': 'Employee Code is required.'}), 400
    if not new_password or len(str(new_password).strip()) < 6:
        return jsonify({'error': 'New password must be at least 6 characters long.'}), 400

    user = User.query.filter(db.func.lower(User.employee_code) == employee_code.lower()).first()
    if not user:
        return jsonify({'error': 'User not found.'}), 404

    token_valid = False
    if reset_token and reset_token.startswith(f"reset_{user.id}_"):
        token_valid = True
    elif security_answer and user.security_answer and user.security_answer.strip().lower() == security_answer.strip().lower():
        token_valid = True

    if not token_valid:
        return jsonify({'error': 'Security authorization failed or session expired. Please verify your credentials again.'}), 403

    try:
        user.password = generate_password_hash(str(new_password).strip())
        user.is_initial_password = False
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully! You can now sign in with your new password.',
            'employee_code': user.employee_code
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error resetting password for user {user.id}: {e}")
        return jsonify({'error': f'Failed to reset password: {str(e)}'}), 500

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        users = User.query.order_by(User.id.asc()).all()
        return jsonify([serialize_user(u) for u in users])
    except Exception as e:
        app.logger.error(f"Error fetching users: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def create_user():
    payload = request.get_json(force=True, silent=True) or {}
    employee_code = (payload.get('employee_code') or '').strip()
    name = (payload.get('name') or '').strip()
    role = (payload.get('role') or 'user').strip().lower()
    status = (payload.get('status') or 'active').strip().lower()
    password = payload.get('password') or ''
    email = (payload.get('email') or '').strip()
    mobile = (payload.get('mobile') or '').strip()
    allowed_menus = payload.get('allowed_menus')
    permissions = payload.get('permissions')
    security_question = (payload.get('security_question') or '').strip()
    security_answer = (payload.get('security_answer') or '').strip()

    if not employee_code:
        return jsonify({'error': 'Employee Code / Login ID is required.'}), 400
    if not name:
        return jsonify({'error': 'Full Name is required.'}), 400
    if not password:
        return jsonify({'error': 'Initial Password is required.'}), 400
    if role.lower() not in ['admin', 'manager', 'user', 'super admin']:
        role = 'user'
    elif role.lower() == 'super admin':
        role = 'Super Admin'
    if status not in ['active', 'inactive']:
        status = 'active'

    existing = User.query.filter(
        db.func.lower(User.employee_code) == employee_code.lower()
    ).first()
    if existing:
        return jsonify({'error': f"A user with Employee Code '{employee_code}' already exists."}), 400

    try:
        hashed_password = generate_password_hash(password)
        menus_json = json.dumps(allowed_menus) if isinstance(allowed_menus, list) else None
        perms_json = json.dumps(permissions) if isinstance(permissions, (dict, list)) else None

        new_user = User(
            employee_code=employee_code,
            name=name,
            role=role,
            status=status,
            password=hashed_password,
            is_initial_password=True,
            email=email or None,
            mobile=mobile or None,
            allowed_menus=menus_json,
            permissions=perms_json,
            security_question=security_question or None,
            security_answer=security_answer or None
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({
            'success': True,
            'user': serialize_user(new_user)
        }), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error creating user: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    payload = request.get_json(force=True, silent=True) or {}
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found.'}), 404

    employee_code = payload.get('employee_code')
    name = payload.get('name')
    role = payload.get('role')
    status = payload.get('status')
    email = payload.get('email')
    mobile = payload.get('mobile')
    password = payload.get('password')
    allowed_menus = payload.get('allowed_menus')
    permissions = payload.get('permissions')
    security_question = payload.get('security_question')
    security_answer = payload.get('security_answer')

    if employee_code is not None:
        emp_trimmed = employee_code.strip()
        if not emp_trimmed:
            return jsonify({'error': 'Employee Code cannot be empty.'}), 400
        conflict = User.query.filter(
            db.func.lower(User.employee_code) == emp_trimmed.lower(),
            User.id != user_id
        ).first()
        if conflict:
            return jsonify({'error': f"Employee Code '{emp_trimmed}' is already in use by another user."}), 400
        user.employee_code = emp_trimmed

    if name is not None:
        name_trimmed = name.strip()
        if not name_trimmed:
            return jsonify({'error': 'Name cannot be empty.'}), 400
        user.name = name_trimmed

    if role is not None:
        role_trimmed = role.strip()
        role_norm = role_trimmed.lower()
        if role_norm in ['admin', 'manager', 'user', 'super admin']:
            if (user.role or '').strip().lower() in ('admin', 'super admin') and role_norm not in ('admin', 'super admin'):
                other_admins = User.query.filter(db.func.lower(User.role).in_(['admin', 'super admin']), User.id != user_id).count()
                if other_admins == 0:
                    return jsonify({'error': 'Cannot change role: System requires at least one Administrator.'}), 400
            user.role = 'Super Admin' if role_norm == 'super admin' else role_norm

    if status is not None:
        status_trimmed = status.strip().lower()
        if status_trimmed in ['active', 'inactive']:
            if user.employee_code.lower() in ('admin', 'jc0033') and status_trimmed == 'inactive':
                return jsonify({'error': 'The primary system admin account cannot be deactivated.'}), 400
            user.status = status_trimmed

    if email is not None:
        user.email = email.strip() or None

    if mobile is not None:
        user.mobile = mobile.strip() or None

    if password:
        pw_str = str(password).strip()
        if len(pw_str) > 0:
            user.password = generate_password_hash(pw_str)
            user.is_initial_password = False

    if allowed_menus is not None:
        user.allowed_menus = json.dumps(allowed_menus) if isinstance(allowed_menus, list) else None

    if permissions is not None:
        user.permissions = json.dumps(permissions) if isinstance(permissions, (dict, list)) else None

    if security_question is not None:
        user.security_question = security_question.strip() or None

    if security_answer is not None:
        user.security_answer = security_answer.strip() or None

    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'user': serialize_user(user)
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error updating user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found.'}), 404

    # Safeguards: Protect root admin or last admin
    if user.employee_code.lower() in ('admin', 'jc0033'):
        return jsonify({'error': 'The primary system admin account cannot be deleted.'}), 400

    if (user.role or '').strip().lower() in ('admin', 'super admin'):
        other_admins = User.query.filter(db.func.lower(User.role).in_(['admin', 'super admin']), User.id != user_id).count()
        if other_admins == 0:
            return jsonify({'error': 'Cannot delete the only remaining Administrator.'}), 400

    try:
        deleted_name = user.name or user.employee_code
        db.session.delete(user)
        db.session.commit()
        return jsonify({
            'success': True,
            'deleted': user_id,
            'name': deleted_name
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Error deleting user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# Loan Processing & Configuration Helpers
# ------------------------------------------------------------------
CONFIG_FILE_PATH = os.environ.get('APP_CONFIG_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app_config.json'))

def load_system_config():
    default_config = {
        'require_secondary_approval': True,
        'require_admin_approval': True
    }
    if not os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, 'w') as f:
                json.dump(default_config, f, indent=4)
        except Exception:
            pass
        return default_config
    try:
        with open(CONFIG_FILE_PATH, 'r') as f:
            config = json.load(f)
            for k, v in default_config.items():
                if k not in config:
                    config[k] = v
            return config
    except Exception:
        return default_config

def get_acronym(name):
    if not name:
        return ''
    raw_str = str(name).strip()
    if not raw_str:
        return ''
    n = raw_str.lower()
    try:
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

def strip_loan_ref_prefix(ref_id):
    if not ref_id:
        return ""
    s = str(ref_id).strip()
    return re.sub(r'^(?:jl[-_]?)+', '', s, flags=re.IGNORECASE).strip()

def normalize_date_str(date_str):
    if not date_str:
        return ""
    s = str(date_str).strip()
    if not s:
        return ""
    s = re.sub(r'[/.]', '-', s)
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%m-%d-%Y", "%Y/%m/%d", "%d/%m/%Y"):
        try:
            dt = datetime.datetime.strptime(s, fmt)
            return dt.strftime("%d-%m-%Y")
        except (ValueError, TypeError):
            continue
    parts = s.split('-')
    if len(parts) == 3:
        if len(parts[0]) == 4:
            return f"{parts[2].zfill(2)}-{parts[1].zfill(2)}-{parts[0]}"
        return f"{parts[0].zfill(2)}-{parts[1].zfill(2)}-{parts[2]}"
    return s.lower()

def normalize_client_name(name):
    if not name:
        return ""
    return re.sub(r'\s+', ' ', str(name)).strip().lower()

def format_loan_ref_id(ref_id):
    if not ref_id:
        return None
    ref_str = str(ref_id).strip()
    if not ref_str:
        return None
    if not ref_str.upper().startswith('JL'):
        ref_str = f"JL{ref_str}"
    if ref_str.lower().startswith('jl'):
        ref_str = f"JL{ref_str[2:]}"
    return ref_str[:50]

def check_loan_ref_id_exists(ref_id=None, client_name=None, loan_date=None):
    """
    Check if an active (non-deleted) loan already exists in the database by:
    1. Loan reference ID compared without 'JL' prefix (e.g. 'SS000040' matches 'JLSS000040').
    2. Client account name and loan date combination.
    """
    existing = None

    # --- 1. Check by Loan Reference ID (ignoring 'JL' / 'JL-' / 'JL_' prefix) ---
    if ref_id:
        raw = str(ref_id).strip()
        if raw:
            stripped = strip_loan_ref_prefix(raw)
            candidates = {raw, raw.upper(), raw.lower()}
            if stripped:
                candidates.update([
                    stripped, stripped.upper(), stripped.lower(),
                    f"JL{stripped}", f"JL{stripped.upper()}", f"JL{stripped.lower()}",
                    f"JL-{stripped}", f"JL-{stripped.upper()}", f"JL-{stripped.lower()}",
                    f"JL_{stripped}", f"JL_{stripped.upper()}", f"JL_{stripped.lower()}",
                ])
                if '-' in stripped:
                    no_dash = stripped.replace('-', '')
                    candidates.update([no_dash, no_dash.upper(), no_dash.lower(), f"JL{no_dash}", f"JL{no_dash.upper()}"])
                if '_' in stripped:
                    no_us = stripped.replace('_', '')
                    candidates.update([no_us, no_us.upper(), no_us.lower(), f"JL{no_us}", f"JL{no_us.upper()}"])

            # Prefer active loan, fallback to any matching loan in DB table
            existing = Loan.query.filter(
                Loan.is_deleted == False,
                Loan.loan_ref_id.in_(list(candidates))
            ).first()

            if not existing:
                existing = Loan.query.filter(
                    Loan.loan_ref_id.in_(list(candidates))
                ).first()

            # Deep check on loans: compare stripped IDs ignoring case and non-alphanumerics
            if not existing and stripped:
                target_stripped = re.sub(r'[^a-zA-Z0-9]', '', stripped).lower()
                if target_stripped:
                    all_loans = Loan.query.filter(
                        Loan.loan_ref_id.isnot(None)
                    ).order_by(Loan.is_deleted.asc()).all()
                    for l in all_loans:
                        l_stripped = re.sub(r'[^a-zA-Z0-9]', '', strip_loan_ref_prefix(l.loan_ref_id)).lower()
                        if l_stripped and l_stripped == target_stripped:
                            existing = l
                            break

    # --- 2. Check by client_account_name AND loan_date ---
    if not existing and client_name and loan_date:
        norm_client = normalize_client_name(client_name)
        norm_date = normalize_date_str(loan_date)

        if norm_client and norm_date:
            all_loans = Loan.query.filter(
                Loan.client_account_name.isnot(None),
                Loan.loan_date.isnot(None)
            ).order_by(Loan.is_deleted.asc()).all()

            for l in all_loans:
                db_client = normalize_client_name(l.client_account_name)
                db_date = normalize_date_str(l.loan_date)
                if db_client and db_date and db_client == norm_client and db_date == norm_date:
                    existing = l
                    break

    return existing

def parse_verified_by(verified_by_val):
    if not verified_by_val:
        return []
    try:
        parsed = json.loads(verified_by_val)
        if isinstance(parsed, list):
            return parsed
        return [str(parsed)]
    except (ValueError, TypeError):
        return [str(verified_by_val)]

def find_secondary_managers(secondary_accounts):
    managers = []
    try:
        for acc in secondary_accounts:
            acc_name = acc.get('account_name') or acc.get('name') or ''
            acr = get_acronym(acc_name)
            users = User.query.filter_by(role='manager').all()
            for u in users:
                if u.name and u.name not in managers:
                    managers.append(u.name)
    except Exception:
        pass
    return managers if managers else ['System Admin']

def user_has_company_approval(user, acronym, menu='jl-due-report'):
    if not user:
        return False
    if (getattr(user, 'role', '') or '').strip().lower() in ('admin', 'super admin') or getattr(user, 'name', '') == 'System Admin' or getattr(user, 'employee_code', '') in ('admin', 'JC0033'):
        return True
    perms = getattr(user, 'permissions', '')
    if not perms:
        return True
    try:
        parsed = json.loads(perms) if isinstance(perms, str) else perms
        target = (acronym or '').strip().upper()
        if isinstance(parsed, list):
            return target in [str(x).strip().upper() for x in parsed] or '*' in parsed
        if isinstance(parsed, dict):
            # 1. Check user's assigned primary accounts
            pri_list = parsed.get('primary', [])
            if isinstance(pri_list, list):
                if target in [str(p).strip().upper() for p in pri_list] or '*' in pri_list:
                    return True
                for p in pri_list:
                    p_acr = (get_acronym(p) or '').strip().upper()
                    if p_acr and p_acr == target:
                        return True
                    if str(p).strip().upper() == target:
                        return True

            # 2. Check legacy menu permissions
            menu_perms = parsed.get(menu, [])
            if isinstance(menu_perms, list):
                if target in [str(m).strip().upper() for m in menu_perms] or '*' in menu_perms:
                    return True
                for m in menu_perms:
                    m_acr = (get_acronym(m) or '').strip().upper()
                    if m_acr and m_acr == target:
                        return True
            return False
    except Exception:
        pass
    return True


# --- PDF Upload, Parsing & Database Storage Endpoint ---
@app.route('/api/upload-pdf', methods=['POST'])
def handle_pdf_upload():
    if not PDF_EXTRACTION_AVAILABLE:
        return jsonify({
            'error': 'PDF extraction is not available. pdfplumber/pandas are not installed.'
        }), 503

    # Accepts either 'docx_file' or 'file' for maximum compatibility
    file = request.files.get('docx_file') or request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error': 'No file uploaded. Please provide a PDF or Word document.'}), 400

    filename_lower = file.filename.lower()
    is_pdf = filename_lower.endswith('.pdf')
    is_docx = filename_lower.endswith('.docx') or filename_lower.endswith('.doc')
    if not (is_pdf or is_docx):
        return jsonify({'error': 'Only PDF and Word (.docx) files are supported.'}), 400

    ext = '.docx' if is_docx else '.pdf'
    temp_dir = tempfile.gettempdir()
    temp_file_path = os.path.join(temp_dir, f"loan_intake_{os.getpid()}_{int(datetime.datetime.utcnow().timestamp())}{ext}")
    try:
        try:
            file.save(temp_file_path)
            pdf_data = extract_document_data(temp_file_path)
        finally:
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass

        # Check if caller wants to parse only (e.g. frontend preview modal)
        accounts_str = request.form.get('remaining_accounts')
        is_preview = request.form.get('preview', '').lower() in ('true', '1')

        # If remaining_accounts is not provided or preview requested, return parsed metadata for intake
        if not accounts_str or is_preview:
            extracted_loan_number = pdf_data.get('loan_number')
            extracted_client = pdf_data.get('client_account')
            extracted_date = pdf_data.get('loan_date')
            existing = check_loan_ref_id_exists(
                ref_id=extracted_loan_number,
                client_name=extracted_client,
                loan_date=extracted_date
            )
            return jsonify({
                'success': True,
                'data': pdf_data,
                'loan_exists': bool(existing),
                'existing_loan': {
                    'id': existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                    'loan_id': existing.loan_ref_id or f"JL-2026-{existing.id:04d}",
                    'client_account_name': existing.client_account_name,
                    'loan_amount': existing.loan_amount,
                    'loan_date': existing.loan_date,
                    'primary_account_name': existing.primary_account_name,
                    'status': existing.approval_status
                } if existing else None,
                'message': (
                    f"Loan ID '{existing.loan_ref_id or extracted_loan_number}' already exists in database."
                    if existing else 'PDF extracted successfully'
                )
            }), 200

        # Caller wants to build final output and store to database
        try:
            remaining_accounts = json.loads(accounts_str) if isinstance(accounts_str, str) else accounts_str
        except Exception:
            remaining_accounts = []

        loan_ref_id_raw = request.form.get('loan_ref_id', '').strip()
        loan_ref_id_input = format_loan_ref_id(loan_ref_id_raw)

        extracted_id = format_loan_ref_id(pdf_data.get('loan_number')) if pdf_data.get('loan_number') else None
        final_loan_ref_id = loan_ref_id_input or extracted_id

        # Build final formatted output (shares, interest splits)
        final_output = build_final_output(pdf_data, remaining_accounts)

        # --- PREVENT SAME PRIMARY AND SECONDARY ACRONYM ---
        primary_acc_name = final_output.get('primary_account_name', '')
        primary_acronym = get_acronym(primary_acc_name).strip().upper()

        for acc in remaining_accounts:
            sec_name = acc.get('name', '').strip().upper()
            if sec_name and sec_name == primary_acronym:
                return jsonify({
                    'success': False,
                    'error': 'Primary and secondary account name is same, please check and correct.'
                }), 400
        # --------------------------------------------------

        # --- PERMISSION VALIDATION ---
        emp_code = request.form.get('employee_code')
        user = None
        if emp_code:
            user = User.query.filter_by(employee_code=emp_code).first()
            if user and (getattr(user, 'role', '') or '').strip().lower() not in ('admin', 'super admin'):
                primary_acc = final_output.get('primary_account_name')
                acronym = get_acronym(primary_acc)
                if not user_has_company_approval(user, acronym, menu='jl-due-report'):
                    return jsonify({
                        'success': False,
                        'error': f"Unauthorized: You do not have permission to upload loans for '{primary_acc}' ({acronym})."
                    }), 403
        # -----------------------------

        # Determine status and verifier based on configuration
        loan_status = 'PENDING_SECONDARY'
        target_verifier = 'Secondary Manager'
        actioned_by = None
        actioned_at = None

        # --- DUPLICATE LOAN CHECK ---
        existing_duplicate = check_loan_ref_id_exists(
            ref_id=final_loan_ref_id,
            client_name=final_output.get('client_account_name'),
            loan_date=final_output.get('loan_date')
        )
        if existing_duplicate:
            dup_id = existing_duplicate.loan_ref_id or final_loan_ref_id
            return jsonify({
                'success': False,
                'error': f"Loan ID '{dup_id}' already exists in database.",
                'loan_exists': True,
                'existing_loan': {
                    'id': existing_duplicate.loan_ref_id or f"JL-2026-{existing_duplicate.id:04d}",
                    'loan_id': existing_duplicate.loan_ref_id or f"JL-2026-{existing_duplicate.id:04d}",
                    'client_account_name': existing_duplicate.client_account_name,
                    'loan_amount': existing_duplicate.loan_amount,
                    'loan_date': existing_duplicate.loan_date,
                    'primary_account_name': existing_duplicate.primary_account_name,
                    'status': existing_duplicate.approval_status
                }
            }), 400
        # ----------------------------

        # Store loan record into PostgreSQL
        loan = Loan(
            loan_ref_id=final_loan_ref_id,
            client_account_name=final_output['client_account_name'],
            address=final_output.get('address') or '',
            contact=final_output.get('contact') or '',
            loan_amount=final_output['loan_amount'],
            loan_date=final_output['loan_date'],
            primary_account_amount=final_output['primary_account_amount'],
            primary_account_name=final_output['primary_account_name'],
            primary_account_share=final_output['primary_account_share'],
            primary_account_interest=final_output['primary_account_interest'],
            total_repayment_amount=final_output['total_repayment_amount'],
            total_interest=final_output['total_interest'],
            interest_rate=final_output.get('interest_rate') or pdf_data.get('interest_rate') or None,
            verified_by=target_verifier,
            approval_status=loan_status,
            requester_name=user.name if user else 'Anonymous',
            requested_at=datetime.datetime.now().strftime("%d-%m-%Y %I:%M %p"),
            actioned_by=actioned_by,
            actioned_at=actioned_at
        )
        db.session.add(loan)
        db.session.flush()

        if not loan.loan_ref_id:
            loan.loan_ref_id = f"JL-2026-{loan.id:04d}"
            final_loan_ref_id = loan.loan_ref_id

        # Store secondary accounts
        for acc in final_output['remaining_accounts']:
            rem_acc = RemainingAccount(
                loan_id=loan.id,
                account_name=acc['account_name'],
                percentage=acc['percentage'],
                share=acc['share'],
                interest_amount=acc['interest_amount'],
                tds=acc['tds']
            )
            db.session.add(rem_acc)

        # Store repayment schedule entries
        for entry in final_output['table']:
            schedule = RepaymentSchedule(
                loan_id=loan.id,
                amount=entry['amount'],
                interest_amount=entry.get('interest_amount', 0),
                cheque_no=entry.get('cheque_no') or '',
                date=entry['date'],
                received_date=entry.get('received_date'),
                payment_date=entry.get('payment_date')
            )
            db.session.add(schedule)

        db.session.commit()
        send_loan_creation_notifications(loan, requester_name=user.name if user else 'Staff')

        matched_users = find_users_with_primary_access_for_loan(loan)
        target_display_names = [u.name or u.employee_code for u in matched_users if (u.name or u.employee_code)]
        sec_names = [r.account_name for r in loan.remaining_accounts] if hasattr(loan, 'remaining_accounts') else []
        sec_str = ", ".join(sec_names) if sec_names else "Secondary Account"
        sec_manager_display = ", ".join(target_display_names) if target_display_names else (f"{sec_str} Manager" if sec_names else "Secondary Manager")

        return jsonify({
            'success': True,
            'loan_id': loan.id,
            'loan_ref_id': final_loan_ref_id,
            'data': final_output,
            'sec_manager_name': sec_manager_display,
            'message': 'PDF data processed correctly and loan stored on database!'
        }), 200

    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'PDF extraction & storage error: {e}')
        return jsonify({'error': f'Failed to process PDF: {str(e)}'}), 500


# --- Loans List Endpoint from PostgreSQL ---
@app.route('/api/loans', methods=['GET'])
def get_loans():
    loans = Loan.query.filter_by(is_deleted=False).order_by(Loan.id.desc()).all()
    results = []
    for l in loans:
        results.append({
            'id': l.id,
            'loan_ref_id': l.loan_ref_id,
            'client_account_name': l.client_account_name,
            'address': l.address or '',
            'contact': l.contact or '',
            'loan_amount': l.loan_amount,
            'loan_date': l.loan_date,
            'primary_account_name': l.primary_account_name,
            'primary_account_amount': l.primary_account_amount,
            'primary_account_share': l.primary_account_share,
            'primary_account_interest': l.primary_account_interest,
            'total_repayment_amount': l.total_repayment_amount,
            'total_interest': l.total_interest,
            'approval_status': l.approval_status,
            'verified_by': l.verified_by,
            'requester_name': l.requester_name,
            'requested_at': l.requested_at,
            'actioned_by': l.actioned_by,
            'actioned_at': l.actioned_at,
            'remaining_accounts': [
                {
                    'id': r.id,
                    'account_name': r.account_name,
                    'share': r.share,
                    'percentage': r.percentage,
                    'interest_amount': r.interest_amount,
                    'tds': r.tds
                } for r in l.remaining_accounts
            ],
            'repayment_schedule': [
                {
                    'id': s.id,
                    'amount': s.amount,
                    'interest_amount': s.interest_amount,
                    'cheque_no': s.cheque_no,
                    'date': s.date,
                    'received_date': s.received_date,
                    'payment_date': s.payment_date,
                    'type': s.type,
                    'date_approval_status': s.date_approval_status
                } for s in l.repayment_schedule
            ]
        })
    return jsonify(results)


# --- Matchup File Comparison & Reconciliation Endpoints ---
@app.route('/api/matchup/compare', methods=['POST'])
@app.route('/api/upload-files', methods=['POST'])
def matchup_compare():
    files_list = request.files.getlist('files')
    if len(files_list) >= 2:
        file1 = files_list[0]
        file2 = files_list[1]
    else:
        file1 = request.files.get('file1') or request.files.get('bank_file')
        file2 = request.files.get('file2') or request.files.get('cloud_file')

    if not file1 or not file2:
        return jsonify({'error': 'Please upload 2 files (Bank Statement and All Cloud File) for matchup.'}), 400

    if not file1.filename or not file2.filename:
        return jsonify({'error': 'Both files must have valid filenames'}), 400

    fn1 = getattr(file1, 'filename', '') or ''
    fn2 = getattr(file2, 'filename', '') or ''

    # Classify by filename ('day book report' is All Cloud File, remaining is Bank Statement)
    if is_cloud_filename(fn1) and not is_cloud_filename(fn2):
        bank_file, cloud_file = file2, file1
    elif is_cloud_filename(fn2) and not is_cloud_filename(fn1):
        bank_file, cloud_file = file1, file2
    else:
        bank_file = request.files.get('bank_file') or file1
        cloud_file = request.files.get('cloud_file') or file2

    match_key = request.form.get('match_key', '').strip() or None
    try:
        tolerance_val = float(request.form.get('tolerance', 0.01))
    except (ValueError, TypeError):
        tolerance_val = 0.01

    payment_start = request.form.get('payment_no_start', '').strip() or request.form.get('payment_start', '').strip() or 1
    receipt_start = request.form.get('receipt_no_start', '').strip() or request.form.get('receipt_start', '').strip() or 1

    try:
        excel_io, summary, download_name, _, _ = reconcile_uploaded_files(
            bank_file, cloud_file, match_key=match_key, tolerance=tolerance_val,
            payment_no_start=payment_start, receipt_no_start=receipt_start
        )

        response = send_file(
            excel_io,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=download_name
        )
        response.headers['X-Matchup-Summary'] = json.dumps(summary)
        response.headers['X-Total-Entries'] = str(summary.get('file1_rows', 0))
        response.headers['X-SW-Categorized'] = str(summary.get('matched_count', 0))
        response.headers['X-Remaining'] = str(summary.get('only_file1_count', 0))
        response.headers['Access-Control-Expose-Headers'] = 'X-Matchup-Summary, X-Total-Entries, X-SW-Categorized, X-Remaining, Content-Disposition'
        return response

    except Exception as e:
        app.logger.error(f"Matchup comparison error: {e}")
        return jsonify({'error': f"Failed to compare files: {str(e)}"}), 500


@app.route('/api/matchup/preview', methods=['POST'])
def matchup_preview():
    files_list = request.files.getlist('files')
    if len(files_list) >= 2:
        file1 = files_list[0]
        file2 = files_list[1]
    else:
        file1 = request.files.get('file1') or request.files.get('bank_file')
        file2 = request.files.get('file2') or request.files.get('cloud_file')

    if not file1 or not file2:
        return jsonify({'error': 'Please provide 2 files for comparison preview'}), 400

    fn1 = getattr(file1, 'filename', '') or ''
    fn2 = getattr(file2, 'filename', '') or ''

    if is_cloud_filename(fn1) and not is_cloud_filename(fn2):
        bank_file, cloud_file = file2, file1
    elif is_cloud_filename(fn2) and not is_cloud_filename(fn1):
        bank_file, cloud_file = file1, file2
    else:
        bank_file = request.files.get('bank_file') or file1
        cloud_file = request.files.get('cloud_file') or file2

    match_key = request.form.get('match_key', '').strip() or None
    try:
        tolerance_val = float(request.form.get('tolerance', 0.01))
    except (ValueError, TypeError):
        tolerance_val = 0.01

    try:
        df1, fn1 = read_uploaded_file(bank_file)
        df2, fn2 = read_uploaded_file(cloud_file)

        # Auto-classify orientation for preview
        cols1 = [str(c).strip().upper() for c in df1.columns]
        cols2 = [str(c).strip().upper() for c in df2.columns]
        if ('COMMENTS' in cols1 or 'VOUCHER TYPE' in cols1) and not ('COMMENTS' in cols2 or 'VOUCHER TYPE' in cols2):
            df1, df2 = df2, df1
            fn1, fn2 = fn2, fn1

        summary, df_matched, df_discrepancies, df_only1, df_only2 = compare_datasets(
            df1, df2, match_key=match_key, filename1=fn1, filename2=fn2, tolerance=tolerance_val
        )

        def sanitize_records(df, limit=25):
            if df.empty:
                return []
            return json.loads(df.head(limit).to_json(orient='records', date_format='iso'))

        return jsonify({
            'success': True,
            'summary': summary,
            'matched_sample': sanitize_records(df_matched, 25),
            'discrepancies_sample': sanitize_records(df_discrepancies, 25),
            'only1_sample': sanitize_records(df_only1, 25),
            'only2_sample': sanitize_records(df_only2, 25),
            'columns1': list(df1.columns),
            'columns2': list(df2.columns)
        }), 200

    except Exception as e:
        app.logger.error(f"Matchup preview error: {e}")
# ==============================================================================
# SFTP Configuration & Daily Sync Routes
# ==============================================================================

@app.route('/api/sftp/config', methods=['GET', 'POST'])
def handle_sftp_config():
    from sftp_service import load_sftp_config, save_sftp_config
    if request.method == 'GET':
        return jsonify(load_sftp_config(hide_password=True))
    
    payload = request.get_json(force=True, silent=True) or {}
    updated_config = save_sftp_config(payload)
    return jsonify({
        "success": True,
        "message": "SFTP configuration saved successfully.",
        "config": updated_config
    })


@app.route('/api/sftp/test', methods=['POST'])
def handle_sftp_test():
    from sftp_service import test_sftp_connection
    payload = request.get_json(force=True, silent=True) or {}
    result = test_sftp_connection(payload if payload else None)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code


@app.route('/api/sftp/sync-now', methods=['POST'])
def handle_sftp_sync_now():
    from sftp_service import run_sftp_sync, process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER
    try:
        res = run_sftp_sync(process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER)
        status_code = 200 if res.get('success') else 400
        return jsonify(res), status_code
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# Start background SFTP scheduler on app startup
try:
    from sftp_service import start_sftp_scheduler, process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER
    start_sftp_scheduler(app, process_day_book_for_joint_loans, DEFAULT_DOWNLOAD_FOLDER)
except Exception as _e_sched:
    app.logger.warning(f"Could not start SFTP scheduler: {_e_sched}")


if __name__ == '__main__':
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', os.environ.get('BACKEND_PORT', 1110)))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')

    base_dir = os.path.dirname(os.path.abspath(__file__))
    cert_path = os.environ.get('SSL_CERT_PATH', os.path.join(base_dir, 'cert.pem'))
    key_path = os.environ.get('SSL_KEY_PATH', os.path.join(base_dir, 'key.pem'))
    ssl_enabled = os.environ.get('ENABLE_SSL', 'true').lower() in ('true', '1', 't')

    if ssl_enabled and os.path.exists(cert_path) and os.path.exists(key_path):
        print(f">> LoanDesk Flask Backend running on https://{host}:{port} (SSL Enabled, debug={debug})")
        app.run(host=host, port=port, debug=debug, ssl_context=(cert_path, key_path))
    else:
        print(f">> LoanDesk Flask Backend running on http://{host}:{port} (debug={debug})")
        app.run(host=host, port=port, debug=debug)

