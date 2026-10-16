"""
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: SQLAlchemy database models and table schema definitions for loans, repayment schedules, and user credentials.
"""

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Loan(db.Model):
    __tablename__ = 'loans'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_ref_id = db.Column(db.String(50), nullable=True)
    client_account_name = db.Column(db.String(255), nullable=False)
    address = db.Column(db.Text, nullable=True)
    contact = db.Column(db.String(100), nullable=True)
    loan_amount = db.Column(db.Float, nullable=False)
    loan_date = db.Column(db.String(100), nullable=False)
    primary_account_amount = db.Column(db.Float, nullable=False)
    primary_account_name = db.Column(db.String(255), nullable=False)
    primary_account_share = db.Column(db.Float, nullable=False)
    primary_account_interest = db.Column(db.Float, nullable=False)
    total_repayment_amount = db.Column(db.Float, nullable=False)
    total_interest = db.Column(db.Float, nullable=False)
    interest_rate = db.Column(db.String(100), nullable=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    verified_by = db.Column(db.Text, nullable=True) # JSON list of secondary manager names, or 'System Admin'
    approval_status = db.Column(db.String(20), default='PENDING', nullable=False) # PENDING, APPROVED, REJECTED
    requester_name = db.Column(db.String(100), nullable=True)
    requested_at = db.Column(db.String(100), nullable=True)
    actioned_by = db.Column(db.String(100), nullable=True)
    actioned_at = db.Column(db.String(100), nullable=True)
    edited_by = db.Column(db.String(100), nullable=True)
    history = db.Column(db.Text, nullable=True) # JSON array of chronological audit history entries
    
    # Relationships
    remaining_accounts = db.relationship('RemainingAccount', backref='loan', cascade="all, delete-orphan")
    repayment_schedule = db.relationship('RepaymentSchedule', backref='loan', cascade="all, delete-orphan", order_by="RepaymentSchedule.id")

class RemainingAccount(db.Model):
    __tablename__ = 'remaining_accounts'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    account_name = db.Column(db.String(255), nullable=False)
    percentage = db.Column(db.Float, nullable=False)
    share = db.Column(db.Float, nullable=False)
    interest_amount = db.Column(db.Float, nullable=False)
    tds = db.Column(db.Float, nullable=False)

class RepaymentSchedule(db.Model):
    __tablename__ = 'repayment_schedule'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    interest_amount = db.Column(db.Float, nullable=True, default=0)
    cheque_no = db.Column(db.String(100), nullable=False)
    date = db.Column(db.String(100), nullable=False)
    received_date = db.Column(db.String(100), nullable=True)
    payment_date = db.Column(db.String(100), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    type = db.Column(db.String(50), default='system')
    splits = db.Column(db.Text, nullable=True)
    date_approval_status = db.Column(db.String(50), default='APPROVED', nullable=True)
    date_editor_role = db.Column(db.String(50), nullable=True)
    date_editor_name = db.Column(db.String(100), nullable=True)
    payout_approval_status = db.Column(db.String(50), default='APPROVED', nullable=True)
    payout_approved_by = db.Column(db.String(100), nullable=True)
    payout_approved_at = db.Column(db.String(100), nullable=True)
    payout_requested_by = db.Column(db.String(100), nullable=True)
    payout_requested_at = db.Column(db.String(100), nullable=True)
    payout_notes = db.Column(db.Text, nullable=True)
    payout_approval_target = db.Column(db.String(50), nullable=True)
    payout_requested_role = db.Column(db.String(50), nullable=True)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    employee_code = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(100), nullable=True)
    role = db.Column(db.String(50), default='admin')
    status = db.Column(db.String(20), default='active', nullable=True) # 'active' or 'inactive'
    is_initial_password = db.Column(db.Boolean, default=True)
    email = db.Column(db.String(255), nullable=True)
    mobile = db.Column(db.String(50), nullable=True)
    permissions = db.Column(db.Text, nullable=True) # JSON array of codes
    allowed_menus = db.Column(db.Text, nullable=True) # JSON array of menu keys
    security_question = db.Column(db.String(255), nullable=True)
    security_answer = db.Column(db.String(255), nullable=True)

class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_name = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    link = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.String(100), nullable=False)
    is_read = db.Column(db.Boolean, default=False, nullable=False)

class ShortLoan(db.Model):
    __tablename__ = 'short_loans'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_id = db.Column(db.String(100), nullable=True)
    client_name = db.Column(db.String(255), nullable=False)
    loan_amount = db.Column(db.Float, nullable=False)
    int_per_day = db.Column(db.Float, nullable=False)
    loan_date = db.Column(db.String(100), nullable=False)
    days = db.Column(db.Integer, nullable=False)
    days_received = db.Column(db.Integer, nullable=True, default=0)
    remarks = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='ACTIVE')
    created_by = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.String(100), nullable=True)
    follower = db.Column(db.String(100), nullable=True)
    account = db.Column(db.String(100), nullable=True)
    close_date = db.Column(db.String(100), nullable=True)
    renew_history = db.Column(db.Text, nullable=True)

class AccountName(db.Model):
    __tablename__ = 'accounts_name'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(255), nullable=False)
    acronym = db.Column(db.String(50), nullable=False, unique=True)
    color = db.Column(db.String(50), default='blue')
    type = db.Column(db.String(50), default='jl_report', nullable=True) # 'jl_report' or 'short_loan'
    is_need_approval = db.Column(db.Boolean, default=True, nullable=True)

