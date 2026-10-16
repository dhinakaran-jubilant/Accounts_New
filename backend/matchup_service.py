"""
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Bank statement and ledger reconciliation service for processing Excel spreadsheets and generating matchup reports.
"""

import os
import io
import re
import datetime
import tempfile
import json
import uuid
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# List of known bank keywords for ledger resolution
BANK_NAMES = ['KOTAK', 'KMB', 'ICICI', 'HDFC', 'AXIS', 'SBI', 'BOB', 'PNB', 'CANARA', 'IDFC', 'YES', 'IDBI', 'IDIB']


def normalize_instrument_no(val):
    """
    Normalizes instrument/cheque numbers across various formats (e.g. '000165', '165', 165, 165.0)
    by stripping leading zeros and whitespace.
    """
    if val is None or pd.isna(val):
        return ""
    s = str(val).strip()
    if s.lower() in ('nan', 'none', ''):
        return ""
    if s.endswith('.0'):
        s = s[:-2]
    s_clean = s.lstrip('0')
    return s_clean if s_clean else '0'


def is_valid_column_amount(series):
    """
    Checks if values in series represent a valid, non-zero amount.
    """
    if series is None or series.empty:
        return pd.Series(False, index=series.index if series is not None else [])
    s_num = pd.to_numeric(series.astype(str).str.replace(',', '', regex=False), errors='coerce')
    return s_num.notna() & (s_num != 0)


def format_date_str(val):
    """
    Standardizes date string or datetime object to DD-MM-YYYY format.
    """
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
    return s


def extract_cheque_and_date(row):
    """
    Extracts Cheque No and Cheque Date from row (checking Description, Chq /Ref No, etc.).
    Returns empty strings ('', '') if not a cheque transaction.
    """
    desc = str(row.get('Original_Description') if ('Original_Description' in row and pd.notna(row.get('Original_Description'))) else row.get('Description', ''))

    chq_ref_candidates = ['Cheque No', 'Chq No', 'Chq / Ref No', 'Chq /Ref No', 'Chq /Ref N', 'Chq / Ref N', 'Chq/Ref No', 'Ref No', 'Reference Number', 'Cheque / Ref. No.']
    chq_ref_col = next((c for c in chq_ref_candidates if c in row and pd.notna(row.get(c)) and str(row.get(c)).strip() and str(row.get(c)).strip().lower() not in ('nan', 'none')), None)
    chq_ref = str(row.get(chq_ref_col)).strip() if chq_ref_col else ''

    chq_no = ''
    chk_date = ''

    # 1. BY CLG INST in description (e.g. BY CLG INST 165/09-10-26/EQUI or BY CLG INST 000423)
    m_clg = re.search(r"BY\s+CLG\s+INST\s+(\d+)(?:/(\d+[\-\/]\d+[\-\/]\d+))?", desc, re.IGNORECASE)
    if m_clg:
        chq_no = m_clg.group(1).strip()
        if m_clg.group(2):
            chk_date = format_date_str(m_clg.group(2).strip())

    # 2. REJECT in description (e.g. starts with REJECT:099021:SIB-Funds insufficient)
    if not chq_no:
        m_reject = re.search(r"^\s*REJECT:\s*(\d{6})\s*:", desc, re.IGNORECASE)
        if not m_reject:
            m_reject = re.search(r"\bREJECT:\s*(\d{6})\s*:", desc, re.IGNORECASE)
        if not m_reject:
            m_reject = re.search(r"^\s*REJECT:\s*(\d+)\s*:", desc, re.IGNORECASE)
        if m_reject:
            chq_no = m_reject.group(1).strip()

    # 3. RTN in description (e.g. RTN:165: or RTN:000165)
    if not chq_no:
        m_rtn = re.search(r"RTN:([^:\s]+)", desc, re.IGNORECASE)
        if m_rtn:
            chq_no = m_rtn.group(1).strip()

    # 4. Explicit CHQ / CHEQUE in description
    if not chq_no:
        m_chq = re.search(r"(?:CHQ|CHEQUE)\s*(?:NO\.?|#)?\s*(\d+)", desc, re.IGNORECASE)
        if m_chq:
            chq_no = m_chq.group(1).strip()

    # 5. Chq / Ref No column (split on '/' if e.g. 165/09-10-26)
    if chq_ref and chq_ref.lower() not in ('nan', 'none', ''):
        parts = chq_ref.split('/')
        first_part = parts[0].strip()
        if not chq_no and first_part and first_part.isdigit() and len(first_part) <= 10:
            chq_no = first_part
        if len(parts) > 1 and not chk_date and re.search(r"\d+[\-\/]\d+[\-\/]\d+", parts[1]):
            chk_date = format_date_str(parts[1].strip())

    # 5. Fallback from matched instrument if set during reconciliation rounds
    if not chq_no and pd.notna(row.get('Matched_Inst_No')):
        m_no = str(row.get('Matched_Inst_No')).strip()
        if m_no.lower() not in ('nan', 'none', ''):
            chq_no = m_no
    if not chk_date and pd.notna(row.get('Matched_Inst_Date')):
        chk_date = format_date_str(row.get('Matched_Inst_Date'))

    # 6. Fallback candidates from raw columns (only actual cheque/instrument number columns)
    if not chq_no:
        for cand in ['Cheque No', 'Chq No', 'Instrument No', 'Inst No', 'Cheque Number']:
            val = row.get(cand)
            if pd.notna(val) and str(val).strip() and str(val).strip().lower() not in ('nan', 'none'):
                v_s = str(val).strip()
                if v_s.isdigit() and len(v_s) <= 10:
                    chq_no = v_s
                    break

    # Clean and validate chq_no before using it
    if not chq_no or str(chq_no).strip().lower() in ('nan', 'none', ''):
        chq_no = ''
    else:
        chq_no = str(chq_no).strip()

    # 7. If valid chq_no exists but chk_date is still empty, fallback to Value Date or Transaction Date
    if chq_no and not chk_date:
        v_dt = row.get('Value Date') if pd.notna(row.get('Value Date')) else row.get('Transaction Date')
        if pd.notna(v_dt):
            chk_date = format_date_str(v_dt)

    if not chk_date or str(chk_date).strip().lower() in ('nan', 'none', ''):
        chk_date = ''
    else:
        chk_date = str(chk_date).strip()

    return chq_no, chk_date


def generate_voucher_no(start_val, index_offset):
    """
    Generates voucher sequence number based on starting value and 0-based offset.
    Supports:
    - Pure numbers: e.g. '101' or 101 -> 101, 102, 103...
    - Prefix + numbers: e.g. 'PAY-001' -> PAY-001, PAY-002...
    - None / empty: defaults to 1 + index_offset (1, 2, 3...)
    """
    if start_val is None:
        return 1 + index_offset
    s = str(start_val).strip()
    if not s:
        return 1 + index_offset

    try:
        num = int(s)
        return num + index_offset
    except ValueError:
        pass

    m = re.search(r'^(.*?)(\d+)$', s)
    if m:
        prefix = m.group(1)
        num_str = m.group(2)
        pad_len = len(num_str) if num_str.startswith('0') else 0
        new_num = int(num_str) + index_offset
        if pad_len > 0:
            formatted_num = f"{new_num:0{pad_len}d}"
        else:
            formatted_num = str(new_num)
        return f"{prefix}{formatted_num}"

    return f"{s}{index_offset + 1}"


def read_data_file(file_input, header=0):
    """
    Safely and robustly reads any uploaded file (FileStorage, path, or BytesIO buffer)
    into a pandas DataFrame.
    Handles:
      - Modern Excel (.xlsx) using openpyxl engine
      - Legacy binary Excel (.xls) using xlrd engine
      - Comma / Tab / Pipe delimited files (.csv, .tsv, .txt)
      - HTML table bank statements disguised as .xls
      - Flask FileStorage objects without extension on their internal streams
    """
    filename = ''
    if hasattr(file_input, 'filename') and file_input.filename:
        filename = file_input.filename
    elif isinstance(file_input, str):
        filename = os.path.basename(file_input)

    ext = os.path.splitext(filename)[1].lower() if filename else ''

    if hasattr(file_input, 'seek'):
        file_input.seek(0)

    # 1. Delimited text files (.csv, .txt, .tsv)
    if ext in ['.csv', '.txt', '.tsv']:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        sep = '\t' if ext == '.tsv' else ','
        try:
            return pd.read_csv(file_input, sep=sep, header=header)
        except Exception:
            if hasattr(file_input, 'seek'):
                file_input.seek(0)
            return pd.read_csv(file_input, sep=None, engine='python', header=header)

    # 2. If filename explicitly ends with .xls, try xlrd first
    if ext == '.xls':
        try:
            if hasattr(file_input, 'seek'):
                file_input.seek(0)
            return pd.read_excel(file_input, engine='xlrd', header=header)
        except Exception:
            pass

    # 3. Try openpyxl engine (standard for modern .xlsx and Excel FileStorage streams)
    try:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        return pd.read_excel(file_input, engine='openpyxl', header=header)
    except Exception:
        pass

    # 4. Try xlrd engine (for .xls streams)
    try:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        return pd.read_excel(file_input, engine='xlrd', header=header)
    except Exception:
        pass

    # 5. Try default pandas read_excel without explicit engine
    try:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        return pd.read_excel(file_input, header=header)
    except Exception:
        pass

    # 6. Try reading as CSV (frequently, statements exported from ERPs are CSV with .xls/.xlsx filename)
    try:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        return pd.read_csv(file_input, header=header)
    except Exception:
        pass

    # 7. Try reading as HTML table (frequently, bank portals export HTML tables with .xls extension)
    try:
        if hasattr(file_input, 'seek'):
            file_input.seek(0)
        tables = pd.read_html(file_input, header=header)
        if tables:
            return tables[0]
    except Exception:
        pass

    # 8. Fallback: Save to a temporary file on disk with the detected or .xlsx extension
    if hasattr(file_input, 'read'):
        temp_dir = tempfile.gettempdir()
        safe_ext = ext if ext else '.xlsx'
        temp_path = os.path.join(temp_dir, f"matchup_temp_{uuid.uuid4().hex[:8]}{safe_ext}")
        try:
            if hasattr(file_input, 'seek'):
                file_input.seek(0)
            if hasattr(file_input, 'save'):
                file_input.save(temp_path)
            else:
                with open(temp_path, 'wb') as f_out:
                    f_out.write(file_input.read())

            # Attempt 1: openpyxl
            try:
                return pd.read_excel(temp_path, engine='openpyxl', header=header)
            except Exception:
                pass

            # Attempt 2: xlrd
            try:
                return pd.read_excel(temp_path, engine='xlrd', header=header)
            except Exception:
                pass

            # Attempt 3: csv
            try:
                return pd.read_csv(temp_path, header=header)
            except Exception:
                pass

            # Attempt 4: html
            try:
                tables = pd.read_html(temp_path, header=header)
                if tables:
                    return tables[0]
            except Exception:
                pass
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    raise ValueError(f"Could not read file '{filename or 'unknown'}'. Please verify the file is a valid Excel (.xlsx, .xls) or CSV file.")


def is_cloud_filename(name):
    """
    Checks if a filename or path represents the All Cloud File.
    Matches 'day book report' (or variations like 'daybook report', 'day book').
    """
    if not name:
        return False
    norm = re.sub(r'[\s_\-]+', ' ', str(name).lower()).strip()
    return 'day book report' in norm or 'daybook report' in norm or 'day book' in norm


def is_sl_no_cell(val):
    """
    Checks if a cell represents the header for 'Sl. No.' / 'Sl.No' / 'S.No' / 'Sr. No.'.
    """
    if pd.isna(val):
        return False
    val_str = str(val).strip()
    norm = re.sub(r'[\s\.\-_]+', '', val_str).lower()
    return (
        norm in ['slno', 'sno', 'srno'] or
        'slno' in norm or
        'sno' in norm or
        bool(re.search(r'\b(sl|sr|s)[\.\s]*no\b', val_str, re.IGNORECASE))
    )


def is_closing_balance_cell(val):
    """
    Checks if a cell represents the 'Closing Balance' / 'Closing Ba' footer boundary.
    """
    if pd.isna(val):
        return False
    val_str = str(val).strip().lower()
    return (
        'closing ba' in val_str or
        'closing balance' in val_str or
        'closing bal' in val_str
    )


def clean_bank_statement(bank_source):
    """
    Cleans bank statement file (e.g., Kotak, SBI, IDFC, HDFC):
    1. Reads raw file with header=None so all metadata rows are accessible.
    2. Checks Column A (or leading columns) for 'Sl.No' header row.
       Removes all marked metadata rows above it and sets this row as headers.
    3. Checks Column A for 'Closing Balance' / 'Closing Ba'.
       Removes the Closing Balance row and all unwanted footer descriptions/notes below it.
    4. Handles IDFC statements with multi-table structure via extract_tables().
    """
    df_raw = read_data_file(bank_source, header=None)
    if df_raw.empty:
        return df_raw

    # Check for IDFC multi-table statement
    df_str_all = df_raw.astype(str)
    if df_str_all.apply(lambda c: c.str.contains("Customer Name", case=False, na=False)).any().any():
        if hasattr(bank_source, 'seek'):
            bank_source.seek(0)
        return extract_tables(bank_source)

    # 1. Search Column A (and leading columns 0-2) for 'Sl.No' header row
    header_idx = None
    cols_to_check = min(3, df_raw.shape[1])
    for idx in range(len(df_raw)):
        for c_idx in range(cols_to_check):
            if is_sl_no_cell(df_raw.iloc[idx, c_idx]):
                header_idx = idx
                break
        if header_idx is not None:
            break

    if header_idx is not None:
        headers = [
            str(c).strip() if pd.notna(c) and str(c).strip().lower() not in ('nan', 'none') else f"Col_{i}"
            for i, c in enumerate(df_raw.iloc[header_idx])
        ]
        data_start = header_idx + 1
    else:
        # Fallback: check if any row has standard date headers
        for idx in range(min(30, len(df_raw))):
            row_strs = [str(c).strip().lower() for c in df_raw.iloc[idx] if pd.notna(c)]
            if any(h in row_strs for h in ['transaction date', 'value date', 'txn date', 'date']):
                header_idx = idx
                headers = [
                    str(c).strip() if pd.notna(c) and str(c).strip().lower() not in ('nan', 'none') else f"Col_{i}"
                    for i, c in enumerate(df_raw.iloc[header_idx])
                ]
                data_start = header_idx + 1
                break
        else:
            headers = [f"Col_{i}" for i in range(df_raw.shape[1])]
            data_start = 0

    # 2. Search Column A for 'Closing Balance' to remove bottom unwanted descriptions
    close_idx = len(df_raw)
    for idx in range(data_start, len(df_raw)):
        if is_closing_balance_cell(df_raw.iloc[idx, 0]):
            close_idx = idx
            break
    else:
        # Check first 3 columns just in case
        for idx in range(data_start, len(df_raw)):
            row_check = [df_raw.iloc[idx, c] for c in range(min(3, df_raw.shape[1]))]
            if any(is_closing_balance_cell(v) for v in row_check):
                close_idx = idx
                break

    df_cleaned = df_raw.iloc[data_start:close_idx].copy()
    if header_idx is not None:
        df_cleaned.columns = headers
    else:
        df_cleaned = read_data_file(bank_source, header=0)
        col_0_vals = df_cleaned.iloc[:, 0].tolist()
        for idx, v in enumerate(col_0_vals):
            if is_closing_balance_cell(v):
                df_cleaned = df_cleaned.iloc[:idx].copy()
                break

    return df_cleaned.dropna(how='all').reset_index(drop=True)


def read_cloud_data_file(cloud_source):
    """
    Reads the All Cloud File (Day Book report). If metadata rows precede the table,
    detects the header row containing 'Voucher Type' or 'Particulars' and promotes it.
    """
    df = read_data_file(cloud_source, header=0)
    cols_upper = [str(c).strip().upper() for c in df.columns]
    if 'VOUCHER TYPE' in cols_upper or 'PARTICULARS' in cols_upper or 'COMMENTS' in cols_upper:
        return df

    df_raw = read_data_file(cloud_source, header=None)
    for idx in range(min(25, len(df_raw))):
        row_vals = [str(c).strip().upper() for c in df_raw.iloc[idx] if pd.notna(c)]
        if 'VOUCHER TYPE' in row_vals or 'PARTICULARS' in row_vals or 'INSTRUMENT NO.' in row_vals:
            headers = [
                str(c).strip() if pd.notna(c) and str(c).strip().lower() not in ('nan', 'none') else f"Col_{i}"
                for i, c in enumerate(df_raw.iloc[idx])
            ]
            df_promoted = df_raw.iloc[idx + 1:].copy()
            df_promoted.columns = headers
            return df_promoted.dropna(how='all').reset_index(drop=True)
    return df


def extract_bank_account_number(bank_source=None, bank_basename='', df_bank=None, df_cloud=None):
    """
    Extracts bank account number (at least 6 digits) from bank filename,
    bank statement header metadata, or candidate ledger columns.
    """
    if bank_basename:
        m = re.search(r'\d{8,18}', str(bank_basename)) or re.search(r'\d{6,}', str(bank_basename))
        if m:
            return m.group(0)

    if bank_source:
        try:
            if hasattr(bank_source, 'seek'):
                bank_source.seek(0)
            df_raw = read_data_file(bank_source, header=None)
            if hasattr(bank_source, 'seek'):
                bank_source.seek(0)
            if df_raw is not None and not df_raw.empty:
                for idx in range(min(40, len(df_raw))):
                    row_str = " ".join([str(c).strip() for c in df_raw.iloc[idx] if pd.notna(c)])
                    m_label = re.search(
                        r'(?:account\s*(?:no\.?|number|#)?|a/c\s*(?:no\.?|#)?|acc\s*no\.?)\s*[:\-]?\s*(\d{6,18})',
                        row_str, re.IGNORECASE
                    )
                    if m_label:
                        return m_label.group(1)
                for idx in range(min(40, len(df_raw))):
                    row_str = " ".join([str(c).strip() for c in df_raw.iloc[idx] if pd.notna(c)])
                    if not any(k in row_str.lower() for k in ['date', 'sl.no', 'phone', 'mobile', 'micr', 'ifsc', 'pin', 'pincode']):
                        m_num = re.search(r'\b\d{8,18}\b', row_str)
                        if m_num:
                            return m_num.group(0)
        except Exception:
            pass

    for df in [df_cloud, df_bank]:
        if df is not None and not df.empty:
            for col in ['Details', 'Particulars']:
                if col in df.columns:
                    for v in df[col].dropna().unique():
                        v_str = str(v).strip()
                        if any(k in v_str.upper() for k in ('KOTAK', 'KMB')):
                            m = re.search(r'\d{6,}', v_str)
                            if m:
                                return m.group(0)

    return ''


def format_output_bank_cash(val, fallback_acc='', detected_bank=''):
    """
    Ensures that in the downloaded output file, any Kotak bank entry in the
    'Bank / Cash' column is formatted as 'Kmb Bank Acc - {account number}'.
    """
    if not val or pd.isna(val) or str(val).strip().lower() in ('nan', 'none', ''):
        tgt = (detected_bank or '').upper()
        if tgt in ('KOTAK', 'KMB'):
            return f"Kmb Bank Acc - {fallback_acc}" if fallback_acc else "Kmb Bank Acc"
        return ''

    s = str(val).strip()
    # Check if s represents KOTAK or KMB
    if re.search(r'\b(KOTAK|KMB)\b', s, re.IGNORECASE) or (detected_bank and detected_bank.upper() in ('KOTAK', 'KMB')):
        acc_m = re.search(r'\d{6,}', s)
        acc_no = acc_m.group(0) if acc_m else fallback_acc
        if acc_no:
            return f"Kmb Bank Acc - {acc_no}"
        return "Kmb Bank Acc"

    return s


# Stopwords and generic tokens to exclude when checking for repeated entity names
BANKING_STOPWORDS = {
    'AND', 'THE', 'FOR', 'FROM', 'VIA', 'WITH', 'NON', 'NOT', 'OUT', 'PER', 'ALL',
    'ANY', 'OUR', 'ARE', 'BUT',
    'BANK', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'INB', 'MB', 'IB', 'MOB', 'NET', 'ECOM',
    'TRANSFER', 'TRF', 'PAYMENT', 'PAID', 'DEP', 'DEPOSIT', 'WITHDRAWAL', 'WDL',
    'CHQ', 'CHEQUE', 'CLG', 'CLEARING', 'INST', 'INSTRUMENT',
    'REF', 'NO', 'NUM', 'NUMBER', 'TXN', 'TRANSACTION',
    'A/C', 'ACC', 'ACCOUNT', 'DR', 'CR', 'DEBIT', 'CREDIT',
    'BILL', 'INFO', 'CHARGES', 'COMM', 'COMMISSION', 'TAX', 'GST', 'TDS', 'CGST', 'SGST', 'IGST',
    'RTN', 'RETURN', 'REJECT', 'BOUNCE', 'REVERSAL', 'REV', 'SELF', 'CASH',
    'ATM', 'POS', 'ONLINE', 'INT', 'INTEREST', 'CMS', 'COLLECTION',
    'BRANCH', 'FEES', 'FEE', 'CHARG', 'CHARGE',
    'PVT', 'LTD', 'LIMITED', 'PRIVATE', 'LLP', 'CORP', 'CORPORATION', 'INC',
    'ENTERPRISES', 'ENTERPRISE', 'COMPANY', 'SERVICES',
    'NAN', 'NONE', 'NULL', 'NA'
}

# 13 Chart of accounts bank ledgers specified for Contra transactions
CONTRA_BANK_ACCOUNTS = {
    'IDFC': 'Idfc Bank Acc -10191983484',
    'IDBI': 'Idbi Bank Acc - 1141102000010168',
    'KMB': 'Kmb Bank Acc -6950973111',
    'FD': 'Fd Bank Acc -18020200007118',
    'CUB': 'Cub Bank Acc -510909010237259',
    'SBI': 'SBI Bank Acc -44985826596',
    'TMB': 'Tmb Bank Acc - 136150310875458',
    'HDFC': 'Hdfc Bank Acc -50200108256011',
    'AXIS': 'Axis Bank Acc -924020000937725',
    'KVB': 'Kvb Bank Acc -1122011000000084',
    'SIB': 'Sib Bank Acc -0310073000001230',
    'INDIAN': 'Indian Bank Acc - 8001030366',
    'UCO': 'Uco Bank Acc -33470210002636',
}

CONTRA_BANK_KEY_MAP = {
    # HDFC
    'HDFC': 'HDFC',
    # IDBI / IBKL / IBDI
    'IBKL': 'IDBI',
    'IDBI': 'IDBI',
    # AXIS / UTIB
    'UTIB': 'AXIS',
    'AXIS': 'AXIS',
    # IDFC / IDFB
    'IDFB': 'IDFC',
    'IDFC': 'IDFC',
    # KOTAK / KMB / KKBK
    'KKBK': 'KMB',
    'KOTAK': 'KMB',
    'KMB': 'KMB',
    # FEDERAL / FD / FDRL
    'FDRL': 'FDRL',
    'FEDERAL': 'FDRL',
    # CITY UNION / CUB / CIUB
    'CIUB': 'CUB',
    'CUB': 'CUB',
    # STATE BANK / SBI / SBIN
    'SBIN': 'SBI',
    'SBI': 'SBI',
    # TAMILNAD MERCANTILE / TMB / TMBL
    'TMBL': 'TMB',
    'TMB': 'TMB',
    # KARUR VYSYA / KVB / KVBL
    'KVBL': 'KVB',
    'KVB': 'KVB',
    # SOUTH INDIAN / SIB / SIBL
    'SIBL': 'SIB',
    'SIB': 'SIB',
    # INDIAN BANK / IDIB
    'IDIB': 'INDIAN',
    'INDIAN': 'INDIAN',
    # UCO BANK / UCBA
    'UCBA': 'UCO',
    'UCO': 'UCO',
}

# Generic IFSC prefix fallback
BANK_IFSC_MAP = {
    'HDFC': 'HDFC',
    'IBKL': 'IDBI',
    'UTIB': 'AXIS',
    'ICIC': 'ICICI',
    'SBIN': 'SBI',
    'BARB': 'BOB',
    'KKBK': 'KMB',
    'PUNB': 'PNB',
    'IDFB': 'IDFC',
    'YESB': 'YES',
    'CNRB': 'CANARA',
    'CBIN': 'CBI',
    'UBIN': 'UNION',
    'IOBA': 'IOB',
    'IDIB': 'INDIAN',
}


def check_contra_description(desc):
    """
    Checks if description indicates a Contra transaction by checking if the same name
    appears 2 times in the description using regex (e.g. 'UTIBR52026070400361299 ASCEND SOLUTIONS ASCEND S').
    Returns (True, name) if matched, else (False, None).
    """
    if not desc or pd.isna(desc):
        return False, None
    s = str(desc).strip()
    if not s or s.lower() in ('nan', 'none', ''):
        return False, None

    # 1. Regex to find repeated word of >= 3 characters: \b([A-Za-z]{3,})\b.*\b\1\b
    matches = re.finditer(r'\b([A-Za-z]{3,})\b(?=.*\b\1\b)', s, re.IGNORECASE)
    for m in matches:
        w = m.group(1).upper()
        if w not in BANKING_STOPWORDS:
            return True, m.group(1)

    # 2. Token frequency fallback for non-stopword words of length >= 3
    words = re.findall(r'\b[A-Za-z]{3,}\b', s)
    seen = {}
    for w in words:
        w_u = w.upper()
        if w_u not in BANKING_STOPWORDS:
            seen[w_u] = seen.get(w_u, 0) + 1
            if seen[w_u] >= 2:
                return True, w

    return False, None


def resolve_contra_credit_account(desc):
    """
    Resolves Credit Account for Contra transaction based on description and the
    13 chart of accounts bank ledgers:
      - HDFC -> 'Hdfc Bank Acc -50200108256011'
      - IDBI / IBKL / IBDI -> 'Idbi Bank Acc - 1141102000010168'
      - AXIS / UTIB -> 'Axis Bank Acc -924020000937725'
      - IDFC / IDFB -> 'Idfc Bank Acc -10191983484'
      - KMB / KOTAK / KKBK -> 'Kmb Bank Acc -6950973111'
      - FD / FEDERAL / FDRL -> 'Fd Bank Acc -18020200007118'
      - CUB / CIUB -> 'Cub Bank Acc -510909010237259'
      - SBI / SBIN -> 'SBI Bank Acc -44985826596'
      - TMB / TMBL -> 'Tmb Bank Acc - 136150310875458'
      - KVB / KVBL -> 'Kvb Bank Acc -1122011000000084'
      - SIB / SIBL -> 'Sib Bank Acc -0310073000001230'
      - INDIAN / IDIB -> 'Indian Bank Acc - 8001030366'
      - UCO / UCBA -> 'Uco Bank Acc -33470210002636'
    """
    if not desc or pd.isna(desc):
        return ''
    s = str(desc).strip()
    s_upper = s.upper()

    # 1. Check if description directly starts with bank code / IFSC prefix
    # Check longer prefixes first to avoid false short matches
    sorted_prefixes = sorted(CONTRA_BANK_KEY_MAP.keys(), key=lambda x: len(x), reverse=True)
    for pref in sorted_prefixes:
        if s_upper.startswith(pref):
            b_key = CONTRA_BANK_KEY_MAP[pref]
            return CONTRA_BANK_ACCOUNTS.get(b_key, b_key)

    # 3. Check transaction prefixes (NEFT-UTIB..., RTGS/IBKL..., IMPS/HDFC..., etc.)
    m = re.match(r'^(?:(?:NEFT|RTGS|IMPS|UPI|TRF|TRANSFER|BY|TO|CHQ|CLG)[\-\s/:]+)?([A-Z]{2,7})', s_upper)
    if m:
        pref = m.group(1)
        for p in sorted_prefixes:
            if pref.startswith(p):
                b_key = CONTRA_BANK_KEY_MAP[p]
                return CONTRA_BANK_ACCOUNTS.get(b_key, b_key)

    # 4. Multi-word bank names anywhere in description (to avoid collisions, e.g. SOUTH INDIAN before INDIAN)
    phrase_map = [
        (r'\bSOUTH\s+INDIAN\b', 'SIB'),
        (r'\bCITY\s+UNION\b', 'CUB'),
        (r'\bSTATE\s+BANK\b', 'SBI'),
        (r'\bTAMILNAD\s+MERCANTILE\b', 'TMB'),
        (r'\bKARUR\s+VYSYA\b', 'KVB'),
        (r'\bIDFC\s+FIRST\b', 'IDFC'),
        (r'\bKOTAK\s+MAHINDRA\b', 'KMB'),
        (r'\bFEDERAL\s+BANK\b', 'FD'),
        (r'\bFD\s+BANK\b', 'FD'),
        (r'\bINDIAN\s+BANK\b', 'INDIAN'),
        (r'\bHDFC\s+BANK\b', 'HDFC'),
        (r'\bIDBI\s+BANK\b', 'IDBI'),
        (r'\bAXIS\s+BANK\b', 'AXIS'),
        (r'\bUCO\s+BANK\b', 'UCO'),
        (r'\bCUB\s+BANK\b', 'CUB'),
        (r'\bSBI\s+BANK\b', 'SBI'),
        (r'\bTMB\s+BANK\b', 'TMB'),
        (r'\bKVB\s+BANK\b', 'KVB'),
        (r'\bSIB\s+BANK\b', 'SIB'),
        (r'\bKMB\s+BANK\b', 'KMB'),
    ]
    for pattern, b_key in phrase_map:
        if re.search(pattern, s_upper):
            return CONTRA_BANK_ACCOUNTS.get(b_key, b_key)

    # 5. Check 4-letter IFSC prefixes anywhere in description (e.g. ... UTIBR... or ... IBKL0...)
    for ifsc_code in ['UTIB', 'IBKL', 'HDFC', 'KKBK', 'FDRL', 'CIUB', 'SBIN', 'TMBL', 'KVBL', 'SIBL', 'IDIB', 'UCBA', 'IDFB']:
        if re.search(r'(?:\b|[_\-/])' + ifsc_code, s_upper):
            b_key = CONTRA_BANK_KEY_MAP[ifsc_code]
            return CONTRA_BANK_ACCOUNTS.get(b_key, b_key)

    # 6. Check single bank keywords with word boundaries
    single_bank_order = ['AXIS', 'HDFC', 'IDBI', 'IBDI', 'IDFC', 'KOTAK', 'KMB', 'FEDERAL', 'CUB', 'SBI', 'TMB', 'KVB', 'SIB', 'INDIAN', 'UCO', 'FD']
    for b in single_bank_order:
        if re.search(r'\b' + b + r'\b', s_upper):
            b_key = CONTRA_BANK_KEY_MAP[b]
            return CONTRA_BANK_ACCOUNTS.get(b_key, b_key)

    # 7. Fallback check for any other bank in BANK_IFSC_MAP or generic banks
    for code, b_name in BANK_IFSC_MAP.items():
        if re.search(r'\b' + code, s_upper):
            return b_name

    for b in ['ICICI', 'BOB', 'PNB', 'CANARA', 'YES', 'UNION', 'CBI', 'IOB']:
        if re.search(r'\b' + b + r'\b', s_upper):
            return b

    return ''


def normalize_contra_bank_account(account_str, detected_bank=''):
    """
    Normalizes bank ledger name in the Contra sheet against the 13 company accounts
    from the chart of accounts image.
    """
    if not account_str or pd.isna(account_str) or str(account_str).strip().lower() in ('nan', 'none', ''):
        if detected_bank:
            b_key = CONTRA_BANK_KEY_MAP.get(detected_bank.upper())
            if b_key and b_key in CONTRA_BANK_ACCOUNTS:
                return CONTRA_BANK_ACCOUNTS[b_key]
        return ''

    s = str(account_str).strip()
    s_upper = s.upper()

    # 1. Exact match to one of the 13 ledgers
    for acc in CONTRA_BANK_ACCOUNTS.values():
        if s.lower() == acc.lower():
            return acc

    # 2. Match using detected_bank
    if detected_bank:
        b_key = CONTRA_BANK_KEY_MAP.get(detected_bank.upper())
        if b_key and b_key in CONTRA_BANK_ACCOUNTS:
            return CONTRA_BANK_ACCOUNTS[b_key]

    # 4. Check if bank name keyword is in string
    for b in ['AXIS', 'HDFC', 'IDBI', 'IBDI', 'IDFC', 'KOTAK', 'KMB', 'FEDERAL', 'CUB', 'SBI', 'TMB', 'KVB', 'SIB', 'INDIAN', 'UCO']:
        if re.search(r'\b' + b + r'\b', s_upper):
            b_key = CONTRA_BANK_KEY_MAP.get(b)
            if b_key and b_key in CONTRA_BANK_ACCOUNTS:
                return CONTRA_BANK_ACCOUNTS[b_key]

    return s


def resolve_bank_ledger(bank_source, df_bank, df_cloud, detected_bank=''):
    """
    Resolves the bank name with account number formatted as 'BANK - ACCOUNT_NO'
    (or 'Kmb Bank Acc - ACCOUNT_NO' for KOTAK) from the 'Details' (or 'Particulars')
    column of the bank statement / cloud file.
    """
    bank_filename = getattr(bank_source, 'filename', '') or (bank_source if isinstance(bank_source, str) else '')
    bank_basename = os.path.basename(bank_filename)
    extracted_acc_no = extract_bank_account_number(bank_source, bank_basename, df_bank, df_cloud)

    def format_bank_account_ledger(cand, default_bank=''):
        acc_m = re.search(r'\d{6,}', str(cand)) if cand else None
        acc_no = acc_m.group(0) if acc_m else extracted_acc_no

        b_name = ''
        if cand:
            for b in BANK_NAMES:
                if b in str(cand).upper():
                    b_name = b
                    break
        if not b_name:
            b_name = default_bank

        b_upper = (b_name or '').upper()
        def_upper = (default_bank or '').upper()

        # Update KOTAK as 'Kmb Bank Acc - {account number}'
        if b_upper in ('KOTAK', 'KMB') or def_upper in ('KOTAK', 'KMB'):
            if acc_no:
                return f"Kmb Bank Acc - {acc_no}"
            return "Kmb Bank Acc"

        if b_name and acc_no:
            return f"{b_name} - {acc_no}"
        elif acc_no and default_bank:
            return f"{default_bank} - {acc_no}"
        return str(cand).strip() if cand else (default_bank or '')

    # 1. Collect candidate ledgers from Details and Particulars columns in df_cloud and df_bank
    details_vals = []
    for df in [df_cloud, df_bank]:
        if df is not None:
            for col in ['Details', 'Particulars']:
                if col in df.columns:
                    for v in df[col].dropna().unique():
                        v_str = str(v).strip()
                        if v_str and v_str.lower() not in ('nan', 'none') and v_str not in details_vals:
                            details_vals.append(v_str)

    if not details_vals:
        acc_match = re.search(r'\d{6,}', bank_basename)
        acc_val = acc_match.group(0) if acc_match else extracted_acc_no
        tgt = (detected_bank or '').upper()
        if tgt in ('KOTAK', 'KMB'):
            return f"Kmb Bank Acc - {acc_val}" if acc_val else "Kmb Bank Acc"
        if acc_val and detected_bank:
            return f"{detected_bank} - {acc_val}"
        return detected_bank or ''

    # Filter candidate ledgers that have account numbers (at least 6 digits) and bank identifiers
    bank_candidates = [
        d for d in details_vals
        if re.search(r'\d{6,}', d) and any(b in d.upper() for b in BANK_NAMES)
    ]
    if not bank_candidates:
        bank_candidates = [d for d in details_vals if re.search(r'\d{6,}', d)]

    # 2. Check if an account number is present in bank filename (e.g. 6950973111)
    acc_match = re.search(r'\d{8,18}', bank_basename) or re.search(r'\d{6,}', bank_basename)
    if acc_match:
        acc_no = acc_match.group(0)
        for cand in bank_candidates:
            if acc_no in cand:
                return format_bank_account_ledger(cand, detected_bank)

    # 3. Match by detected bank name (e.g. 'KOTAK', 'IDBI')
    target_bank = (detected_bank or '').upper()
    if not target_bank:
        for b in BANK_NAMES:
            if b in bank_basename.upper():
                target_bank = b
                break

    if target_bank:
        matching = [
            c for c in bank_candidates
            if target_bank in c.upper() or (target_bank in ('KOTAK', 'KMB') and any(k in c.upper() for k in ('KOTAK', 'KMB')))
        ]
        if len(matching) == 1:
            return format_bank_account_ledger(matching[0], target_bank)
        elif len(matching) > 1:
            # Refine using filename tokens (e.g. 'AS')
            tokens = [t for t in re.split(r'[\s_\-]+', bank_basename.upper()) if len(t) >= 2 and t not in ('EXCEL', 'CSV', 'XLSX', 'XLS', 'BANK', 'STATEMENT')]
            for cand in matching:
                cand_u = cand.upper()
                if any(t in cand_u for t in tokens):
                    return format_bank_account_ledger(cand, target_bank)
            return format_bank_account_ledger(matching[0], target_bank)

    # 4. Match by any bank name in filename
    for b in BANK_NAMES:
        if b in bank_basename.upper():
            matching = [
                c for c in bank_candidates
                if b in c.upper() or (b in ('KOTAK', 'KMB') and any(k in c.upper() for k in ('KOTAK', 'KMB')))
            ]
            if matching:
                return format_bank_account_ledger(matching[0], b)

    if bank_candidates:
        return format_bank_account_ledger(bank_candidates[0], detected_bank)

    tgt = (detected_bank or '').upper()
    if tgt in ('KOTAK', 'KMB'):
        return f"Kmb Bank Acc - {extracted_acc_no}" if extracted_acc_no else "Kmb Bank Acc"

    return detected_bank or ''


def save_uploaded_file_to_folder(file_item, folder, default_name="file.xlsx"):
    """
    Saves a FileStorage or file-like object to the destination folder with its original extension,
    returning the concrete file path on disk. Preserves the sanitized original base name in the path.
    """
    if isinstance(file_item, str) and os.path.exists(file_item):
        return file_item

    orig_name = getattr(file_item, 'filename', '') or default_name
    ext = os.path.splitext(orig_name)[1].lower() or '.xlsx'
    base_name = os.path.splitext(orig_name)[0]
    safe_base = re.sub(r'[^a-zA-Z0-9_\-\. ]', '_', base_name)[:50].strip() or 'upload'
    dest_path = os.path.join(folder, f"{uuid.uuid4().hex[:6]}_{safe_base}{ext}")

    if hasattr(file_item, 'seek'):
        file_item.seek(0)
    if hasattr(file_item, 'save'):
        file_item.save(dest_path)
    else:
        with open(dest_path, 'wb') as f:
            f.write(file_item.read())
    return dest_path


def parse_date_series(series):
    """
    Safely parses dates into datetime64[ns], preserving day-first formatting
    and seamlessly handling both 2-digit (%d-%m-%y) and 4-digit (%d-%m-%Y) years.
    """
    if series is None or series.empty:
        return series
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    try:
        # Modern pandas mixed format with dayfirst prioritizes DD-MM-YYYY / DD-MM-YY
        return pd.to_datetime(series, format='mixed', dayfirst=True, errors='coerce')
    except Exception:
        # Fallback for older pandas or unusual encodings
        s1 = pd.to_datetime(series, format='%d-%m-%y', errors='coerce')
        mask_na = s1.isna() & series.notna()
        if mask_na.any():
            s2 = pd.to_datetime(series[mask_na], format='%d-%m-%Y', errors='coerce')
            s1 = s1.fillna(s2)
        mask_na2 = s1.isna() & series.notna()
        if mask_na2.any():
            s3 = pd.to_datetime(series[mask_na2], dayfirst=True, errors='coerce')
            s1 = s1.fillna(s3)
        return s1


def extract_tables(file_path):
    """
    Extracts transaction tables from multi-header IDFC bank statements.
    """
    df = read_data_file(file_path, header=None)

    # Vectorized string conversion for fast searching
    df_str = df.astype(str)

    # Pre-compute masks to avoid row-by-row iteration
    header_mask = df_str.apply(lambda c: c.str.contains("Transaction Date", case=False, na=False)).any(axis=1)

    # For constraints checking the leading columns
    cols_to_check = min(5, df_str.shape[1])
    df_str_lead = df_str.iloc[:, :cols_to_check]
    ob_mask = df_str_lead.apply(lambda c: c.str.contains("Opening Balance", case=False, na=False)).any(axis=1)
    msg_mask = df_str_lead.apply(lambda c: c.str.contains("IMPORTANT MESSAGE", case=False, na=False)).any(axis=1)

    header_indices = df[header_mask].index.tolist()
    ob_indices = set(df[ob_mask].index.tolist())
    msg_indices = df[msg_mask].index.tolist()

    # Table ends entirely if an important message is encountered
    end_idx = msg_indices[0] if msg_indices else len(df)

    all_tables = []
    first_table = True

    for idx_pos, h_idx in enumerate(header_indices):
        if h_idx >= end_idx:
            break

        header = [str(col).strip() if pd.notna(col) else "" for col in df.iloc[h_idx]]
        start_data = h_idx + 1

        # Chunk spans up to the next header or the absolute end_idx
        next_h = header_indices[idx_pos + 1] if idx_pos + 1 < len(header_indices) else len(df)
        end_data = min(next_h, end_idx)

        chunk_end = end_data
        for i in range(start_data, end_data):
            if i in ob_indices:
                if first_table and i == start_data:
                    # Include ONLY first row of FIRST table
                    pass
                else:
                    chunk_end = i
                    break

        table_df = df.iloc[start_data:chunk_end].copy()
        table_df.columns = header
        table_df = table_df.dropna(how='all')

        if not table_df.empty:
            all_tables.append(table_df)

        first_table = False

    final_df = pd.concat(all_tables, ignore_index=True) if all_tables else pd.DataFrame()

    if not final_df.empty:
        final_df = final_df.iloc[1:].reset_index(drop=True)
        expected_cols = ["Transaction Date", "Value Date", "Description", "Cheque No", "Debit", "Credit", "Balance"]
        # Normalize columns
        final_df.columns = [str(col).strip() for col in final_df.columns]
        final_df.rename(columns={'Particulars': 'Description'}, inplace=True)

        # Keep only existing expected columns
        applicable_cols = [c for c in expected_cols if c in final_df.columns]
        final_df = final_df[applicable_cols]

    return final_df


def process_files(bank_path, cloud_path, output_folder=None, payment_no_start=1, receipt_no_start=1):
    """
    Processes the bank statement and cloud file to identify matches using a multi-round reconciliation engine.
    Optimized with hash-indexed candidate lookups (O(1) search) for maximum speed.
    Generates 'Matched_Cheques.xlsx' in output_folder and returns:
    (output_file_path, total_entries, sw_categorized, remaining)
    """
    if output_folder is None:
        output_folder = tempfile.gettempdir()
    os.makedirs(output_folder, exist_ok=True)

    try:
        # Determine which file is Bank Statement and which is All Cloud File:
        # Easiest way: If filename contains 'day book report', it's the All Cloud File and the remaining is Bank Statement.
        name_a = getattr(bank_path, 'filename', None) or (os.path.basename(bank_path) if isinstance(bank_path, str) else '')
        name_b = getattr(cloud_path, 'filename', None) or (os.path.basename(cloud_path) if isinstance(cloud_path, str) else '')

        if is_cloud_filename(name_a) and not is_cloud_filename(name_b):
            # First file is Cloud File (Day Book Report), second is Bank Statement
            bank_source, cloud_source = cloud_path, bank_path
        elif is_cloud_filename(name_b) and not is_cloud_filename(name_a):
            # Second file is Cloud File (Day Book Report), first is Bank Statement
            bank_source, cloud_source = bank_path, cloud_path
        else:
            # Fallback heuristic: peek content/columns
            try:
                df_peek_a = read_data_file(bank_path, header=0)
                df_peek_b = read_data_file(cloud_path, header=0)
                cols_a = [str(c).strip().upper() for c in df_peek_a.columns]
                cols_b = [str(c).strip().upper() for c in df_peek_b.columns]
                is_a_cloud = ('COMMENTS' in cols_a) or ('VOUCHER TYPE' in cols_a)
                is_b_cloud = ('COMMENTS' in cols_b) or ('VOUCHER TYPE' in cols_b)
                if is_a_cloud and not is_b_cloud:
                    bank_source, cloud_source = cloud_path, bank_path
                else:
                    bank_source, cloud_source = bank_path, cloud_path
            except Exception:
                bank_source, cloud_source = bank_path, cloud_path

        # Clean Bank Statement (removes top marked part above Sl.No, and removes bottom unwanted description at Closing Balance)
        df1 = clean_bank_statement(bank_source)

        # Read Cloud File (Day Book report)
        df2 = read_cloud_data_file(cloud_source)

        # --- Preprocessing ---

        # Clean 'Amount' to handle commas and dots
        if 'Amount' in df1.columns:
            df1['Amount'] = pd.to_numeric(df1['Amount'].astype(str).str.replace(',', '', regex=False), errors='coerce')
            if 'Dr / Cr' in df1.columns:
                df1["Debit"] = df1["Amount"].where(df1["Dr / Cr"] == "DR")
                df1["Credit"] = df1["Amount"].where(df1["Dr / Cr"] == "CR")

        if 'Amount (INR)' in df1.columns:
            df1['Amount (INR)'] = pd.to_numeric(df1['Amount (INR)'].astype(str).str.replace(',', '', regex=False), errors='coerce')
            if 'CR/DR' in df1.columns:
                df1["Debit"] = df1["Amount (INR)"].where(df1["CR/DR"] == "Dr.")
                df1["Credit"] = df1["Amount (INR)"].where(df1["CR/DR"] == "Cr.")

        # Ensure Credit and Debit are numeric in df1
        if 'Credit' in df1.columns:
            df1['Credit'] = pd.to_numeric(df1['Credit'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        else:
            df1['Credit'] = pd.Series(index=df1.index, dtype=float)

        if 'Debit' in df1.columns:
            df1['Debit'] = pd.to_numeric(df1['Debit'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        else:
            df1['Debit'] = pd.Series(index=df1.index, dtype=float)

        # Ensure Credit and Debit are numeric in df2
        if 'Credit' in df2.columns:
            df2['Credit'] = pd.to_numeric(df2['Credit'].astype(str).str.replace(',', '', regex=False), errors='coerce')
        if 'Debit' in df2.columns:
            df2['Debit'] = pd.to_numeric(df2['Debit'].astype(str).str.replace(',', '', regex=False), errors='coerce')

        # Ensure Description is present
        if 'Description' not in df1.columns:
            desc_candidates = ['Particulars', 'Narrative', 'Transaction Remarks', 'Narration', 'Remarks']
            desc_found = next((c for c in desc_candidates if c in df1.columns), None)
            if desc_found:
                df1['Description'] = df1[desc_found]
            else:
                df1['Description'] = ''

        # If bank statement has a separate Cheque/Ref column, ensure it's searchable in Description
        chq_ref_candidates = ['Cheque No', 'Chq No', 'Chq / Ref No', 'Chq /Ref No', 'Chq /Ref N', 'Chq / Ref N', 'Chq/Ref No', 'Ref No', 'Reference Number', 'Cheque / Ref. No.']
        chq_ref_col = next((c for c in chq_ref_candidates if c in df1.columns), None)
        df1['Original_Description'] = df1['Description'].copy()
        if chq_ref_col:
            df1['Description'] = df1['Description'].astype(str) + " " + df1[chq_ref_col].fillna('').astype(str)

        # Clean 'Transaction Date' in Bank Statement if present
        txn_col_df1 = next((c for c in ['Transaction Date', 'Txn Date', 'Trans Date'] if c in df1.columns), None)
        if txn_col_df1:
            df1['Transaction Date'] = parse_date_series(df1[txn_col_df1])

        # Clean 'Value Date' in Bank Statement
        date_col_df1 = next((c for c in ['Value Date', 'Value Dt', 'Date'] if c in df1.columns), None)
        if date_col_df1:
            df1['Value Date'] = parse_date_series(df1[date_col_df1])
        elif 'Value Date' in df1.columns:
            df1['Value Date'] = parse_date_series(df1['Value Date'])
        elif 'Transaction Date' in df1.columns:
            df1['Value Date'] = df1['Transaction Date'].copy()
        else:
            df1['Value Date'] = pd.Series(index=df1.index, dtype='datetime64[ns]')

        # Clean 'Transaction Date' in Cloud File
        date_col_df2 = next((c for c in ['Transaction Date', 'Txn Date', 'Value Date', 'Date'] if c in df2.columns), None)
        if date_col_df2:
            df2['Transaction Date'] = parse_date_series(df2[date_col_df2])

        # Normalize Instrument No. in Cloud File if under an alternative column name
        inst_col_df2 = next((c for c in ['Instrument No.', 'Instrument No', 'Cheque No', 'Chq No', 'Ref No', 'Cheque / Ref No'] if c in df2.columns), None)
        if inst_col_df2 and inst_col_df2 != 'Instrument No.':
            df2['Instrument No.'] = df2[inst_col_df2]

        # Initialize result columns in df1 if not present
        if 'Ledger' not in df1.columns:
            df1['Ledger'] = None
        if 'Value' not in df1.columns:
            df1['Value'] = None
        if 'Diff' not in df1.columns:
            df1['Diff'] = None

        # -------------------------------------------------------------------
        # Build High-Speed In-Memory Lookup Index for df1 (Bank Statement)
        # -------------------------------------------------------------------
        from collections import defaultdict

        df1_indices = df1.index.tolist()
        df1_desc_raw = df1['Description'].astype(str).tolist()
        df1_desc_lower = [str(d).lower() if pd.notna(d) else '' for d in df1_desc_raw]
        df1_vdate_raw = df1['Value Date'].tolist()
        df1_credit_raw = df1['Credit'].tolist()

        # Precompute normalized dates and rounded credits for exact matching
        df1_vdates = [d.date() if hasattr(d, 'date') and pd.notna(d) else None for d in df1_vdate_raw]
        df1_txndates = [
            d.date() if hasattr(d, 'date') and pd.notna(d) else None
            for d in (df1['Transaction Date'].tolist() if 'Transaction Date' in df1.columns else df1_vdate_raw)
        ]
        df1_credits_rounded = [
            round(float(c), 2) if (pd.notna(c) and c != '') else None for c in df1_credit_raw
        ]

        # Key: (date, rounded_credit_amount) -> list of (dataframe_index, list_position)
        credit_index = defaultdict(list)
        # Key: rounded_credit_amount -> list of (dataframe_index, list_position)
        credit_amount_index = defaultdict(list)
        for pos_i, idx in enumerate(df1_indices):
            d_val = df1_vdates[pos_i]
            c_val = df1_credits_rounded[pos_i]
            if c_val is not None:
                credit_amount_index[c_val].append((idx, pos_i))
            if d_val is not None and c_val is not None:
                credit_index[(d_val, c_val)].append((idx, pos_i))

        # -------------------------------------------------------------------
        # Matching Round 1: Receipt Vouchers (Cheque / Amount / Date match)
        # -------------------------------------------------------------------
        if 'Voucher Type' in df2.columns:
            mask_receipts = df2['Voucher Type'].astype(str).str.strip().str.lower() == 'receipt voucher'
            df2_receipts = df2[mask_receipts].copy()

            if not df2_receipts.empty:
                df2_receipts['Instrument No.'] = df2_receipts['Instrument No.'].astype(str).str.lstrip('0').str.strip()

                for _, row in df2_receipts.iterrows():
                    raw_inst = row.get('Instrument No.')
                    cheque_no = str(raw_inst).strip() if pd.notna(raw_inst) else ''
                    ledger = row.get('Particulars')
                    amount = row.get('Credit')
                    txn_date = row.get('Transaction Date')

                    if not cheque_no or cheque_no in ('nan', 'None') or pd.isna(amount) or pd.isna(txn_date):
                        continue

                    t_date = txn_date.date() if hasattr(txn_date, 'date') else txn_date
                    t_date_str = txn_date.strftime('%d-%m-%Y') if hasattr(txn_date, 'strftime') else format_date_str(txn_date)
                    target_date_obj = t_date.date() if hasattr(t_date, 'date') else t_date
                    if isinstance(target_date_obj, str):
                        try:
                            target_date_obj = datetime.datetime.strptime(format_date_str(target_date_obj), '%d-%m-%Y').date()
                        except Exception:
                            target_date_obj = None

                    try:
                        amt_val = round(float(amount), 2)
                    except (ValueError, TypeError):
                        continue

                    cheque_lower = cheque_no.lower()

                    # 1. First attempt: compare txn date from bank statement with allcloud (date difference <= 1 day)
                    matched = []
                    amt_cands = credit_amount_index.get(amt_val, [])
                    first_attempt_cands = []
                    for cand_idx, pos_i in amt_cands:
                        if pd.notna(df1.at[cand_idx, 'Ledger']) and str(df1.at[cand_idx, 'Ledger']).strip():
                            continue  # Already matched

                        if cheque_lower in df1_desc_lower[pos_i]:
                            b_txn = df1_txndates[pos_i] if pos_i < len(df1_txndates) else None
                            b_val = df1_vdates[pos_i] if pos_i < len(df1_vdates) else None

                            diff_txn = abs((b_txn - target_date_obj).days) if (b_txn and target_date_obj) else 999
                            diff_val = abs((b_val - target_date_obj).days) if (b_val and target_date_obj) else 999
                            diff_days = min(diff_txn, diff_val)

                            if diff_days <= 1:
                                first_attempt_cands.append((diff_days, cand_idx))

                    if first_attempt_cands:
                        first_attempt_cands.sort(key=lambda x: x[0])
                        best_diff = first_attempt_cands[0][0]
                        best_cands = [c_idx for diff, c_idx in first_attempt_cands if diff == best_diff]
                        if len(best_cands) == 1:
                            matched.append(best_cands[0])
                        else:
                            matched.append(first_attempt_cands[0][1])

                    # 2. If txn_date of all cloud not matched with value date of bank statement,
                    # use regex (?i)^BY\s+CLG\s+INST\s+\d+\/(\d{2}-\d{2}-\d{2}) to get date from description of bank statement.
                    # After that compare this date with txn_date of all cloud file (allowing date difference <= 1 day),
                    # before compare date convert extracted date 16-07-26 to 16-07-2026
                    if len(matched) == 0:
                        amt_cands = credit_amount_index.get(amt_val, [])
                        alt_candidates = []
                        for cand_idx, pos_i in amt_cands:
                            if pd.notna(df1.at[cand_idx, 'Ledger']) and str(df1.at[cand_idx, 'Ledger']).strip():
                                continue  # Already matched

                            desc_val = str(df1.at[cand_idx, 'Original_Description'] if ('Original_Description' in df1.columns and pd.notna(df1.at[cand_idx, 'Original_Description'])) else df1_desc_raw[pos_i]).strip()
                            m_clg = re.search(r"(?i)^BY\s+CLG\s+INST\s+\d+\/(\d{2}-\d{2}-\d{2})", desc_val)
                            if m_clg:
                                ext_dt_str = m_clg.group(1)  # e.g. '16-07-26'
                                dt_parts = ext_dt_str.split('-')
                                conv_dt_str = f"{dt_parts[0]}-{dt_parts[1]}-20{dt_parts[2]}"  # '16-07-2026'

                                # Parse converted date and target cloud transaction date
                                try:
                                    conv_date_obj = datetime.date(2000 + int(dt_parts[2]), int(dt_parts[1]), int(dt_parts[0]))
                                except Exception:
                                    conv_date_obj = None

                                target_date_obj = t_date.date() if hasattr(t_date, 'date') else t_date
                                if isinstance(target_date_obj, str):
                                    try:
                                        target_date_obj = datetime.datetime.strptime(format_date_str(target_date_obj), '%d-%m-%Y').date()
                                    except Exception:
                                        target_date_obj = None

                                # Compare converted date with txn_date of all cloud file with tolerance of 1 day difference
                                date_matches = False
                                diff_days = 999
                                if conv_date_obj is not None and target_date_obj is not None:
                                    diff_days = abs((conv_date_obj - target_date_obj).days)
                                    date_matches = (diff_days <= 1)
                                elif conv_dt_str == t_date_str:
                                    diff_days = 0
                                    date_matches = True

                                if date_matches and cheque_lower in df1_desc_lower[pos_i]:
                                    alt_candidates.append((diff_days, cand_idx))

                        if alt_candidates:
                            # Prioritize closest date (exact match diff=0 first, then diff=1)
                            alt_candidates.sort(key=lambda x: x[0])
                            best_diff = alt_candidates[0][0]
                            best_cands = [c_idx for diff, c_idx in alt_candidates if diff == best_diff]
                            if len(best_cands) == 1:
                                matched.append(best_cands[0])
                            else:
                                matched.append(alt_candidates[0][1])

                    if len(matched) == 1:
                        idx = matched[0]
                        df1.at[idx, 'Ledger'] = ledger
                        df1.at[idx, 'Value'] = amount
                        c_orig = df1.at[idx, 'Credit']
                        df1.at[idx, 'Diff'] = (c_orig - amount) if pd.notna(c_orig) else 0.0

        # -------------------------------------------------------------------
        # Matching Round 2: Payment Vouchers
        # -------------------------------------------------------------------
        if 'Voucher Type' in df2.columns and 'Comments' in df2.columns:
            mask_payments = df2['Voucher Type'].astype(str).str.strip().str.lower() == 'payment voucher'
            df2_payments = df2[mask_payments].copy()

            if not df2_payments.empty:
                df2_payments['Instrument No.'] = df2_payments['Instrument No.'].astype(str).str.strip('-').str.strip()

                for _, row in df2_payments.iterrows():
                    raw_inst = row.get('Instrument No.')
                    rtgs_no = str(raw_inst).strip() if pd.notna(raw_inst) else ''
                    txn_date = row.get('Transaction Date')
                    amount = row.get('Credit')

                    if not rtgs_no or rtgs_no in ('', 'nan', 'None') or pd.isna(amount) or pd.isna(txn_date):
                        continue

                    t_date = txn_date.date() if hasattr(txn_date, 'date') else txn_date
                    try:
                        amt_val = round(float(amount), 2)
                    except (ValueError, TypeError):
                        continue

                    cands = credit_index.get((t_date, amt_val), [])
                    if not cands:
                        continue

                    rtgs_lower = rtgs_no.lower()
                    matched = [
                        idx for idx, pos_i in cands
                        if rtgs_lower in df1_desc_lower[pos_i]
                    ]

                    particulars_str = str(row.get('Particulars')) if pd.notna(row.get('Particulars')) else ''
                    details_val = row.get('Details')
                    if any(bank in particulars_str for bank in BANK_NAMES) and pd.notna(details_val) and str(details_val).strip():
                        ledger = details_val
                    else:
                        ledger = row.get('Particulars')

                    if len(matched) == 1 and pd.notna(ledger) and str(ledger).strip():
                        idx = matched[0]
                        df1.at[idx, 'Ledger'] = ledger
                        df1.at[idx, 'Value'] = amount
                        c_orig = df1.at[idx, 'Credit']
                        df1.at[idx, 'Diff'] = (c_orig - amount) if pd.notna(c_orig) else 0.0

        # -------------------------------------------------------------------
        # Matching Round 3: Receipt Vouchers with RTGS instrument
        # -------------------------------------------------------------------
        if 'Voucher Type' in df2.columns and 'Comments' in df2.columns:
            mask_receipts_r3 = df2['Voucher Type'].astype(str).str.strip().str.lower() == 'receipt voucher'
            df2_receipts_r3 = df2[mask_receipts_r3].copy()

            if not df2_receipts_r3.empty:
                df2_receipts_r3['Instrument No.'] = df2_receipts_r3['Instrument No.'].astype(str).str.strip('-').str.strip()

                for _, row in df2_receipts_r3.iterrows():
                    raw_inst = row.get('Instrument No.')
                    rtgs_no = str(raw_inst).strip() if pd.notna(raw_inst) else ''
                    txn_date = row.get('Transaction Date')
                    amount = row.get('Credit')

                    if not rtgs_no or rtgs_no in ('', 'nan', 'None') or pd.isna(amount) or pd.isna(txn_date):
                        continue

                    t_date = txn_date.date() if hasattr(txn_date, 'date') else txn_date
                    try:
                        amt_val = round(float(amount), 2)
                    except (ValueError, TypeError):
                        continue

                    cands = credit_index.get((t_date, amt_val), [])
                    if not cands:
                        continue

                    rtgs_lower = rtgs_no.lower()
                    matched = [
                        idx for idx, pos_i in cands
                        if rtgs_lower in df1_desc_lower[pos_i]
                    ]

                    particulars_str = str(row.get('Particulars')) if pd.notna(row.get('Particulars')) else ''
                    details_val = row.get('Details')
                    if any(bank in particulars_str for bank in BANK_NAMES) and pd.notna(details_val) and str(details_val).strip():
                        ledger = details_val
                    else:
                        ledger = row.get('Particulars')

                    if len(matched) == 1 and pd.notna(ledger) and str(ledger).strip():
                        idx = matched[0]
                        df1.at[idx, 'Ledger'] = ledger
                        df1.at[idx, 'Value'] = amount
                        c_orig = df1.at[idx, 'Credit']
                        df1.at[idx, 'Diff'] = (c_orig - amount) if pd.notna(c_orig) else 0.0

        # -------------------------------------------------------------------
        # Matching Round 4: FUNDS TRANSFER FROM transactions in Bank Statement
        # -------------------------------------------------------------------
        if 'Description' in df1.columns or 'Original_Description' in df1.columns:
            part_col = next((c for c in ['Particulars', 'Ledger', 'Account', 'Party Name'] if c in df2.columns), 'Particulars')

            def _to_date_obj(val):
                if val is None or pd.isna(val) or str(val).strip().lower() in ('nan', 'none', ''):
                    return None
                if hasattr(val, 'date'):
                    return val.date()
                f_str = format_date_str(val)
                if f_str:
                    try:
                        return datetime.datetime.strptime(f_str, '%d-%m-%Y').date()
                    except Exception:
                        pass
                return None

            # Pre-parse cloud records for matching
            cloud_ft_cands = []
            for c_idx, c_row in df2.iterrows():
                c_part = str(c_row.get(part_col, '')).strip() if pd.notna(c_row.get(part_col)) else ''
                c_credit = c_row.get('Credit')
                c_debit = c_row.get('Debit')
                c_amt = c_credit if (pd.notna(c_credit) and str(c_credit).strip() not in ('', 'nan', 'None')) else c_debit
                try:
                    c_amt_val = round(float(str(c_amt).replace(',', '')), 2) if (pd.notna(c_amt) and str(c_amt).strip() not in ('', 'nan', 'None')) else None
                except Exception:
                    c_amt_val = None

                c_date_raw = c_row.get('Transaction Date') if 'Transaction Date' in c_row else c_row.get('Date')
                c_date_obj = _to_date_obj(c_date_raw)
                v_type = str(c_row.get('Voucher Type', '')).strip().lower()

                cloud_ft_cands.append({
                    'c_idx': c_idx,
                    'row': c_row,
                    'particulars': c_part,
                    'amount': c_amt_val,
                    'date_obj': c_date_obj,
                    'v_type': v_type
                })

            ft_matched_cloud_indices = set()

            for idx in df1.index:
                if pd.notna(df1.at[idx, 'Ledger']) and str(df1.at[idx, 'Ledger']).strip():
                    continue  # Already matched

                desc = str(df1.at[idx, 'Original_Description'] if ('Original_Description' in df1.columns and pd.notna(df1.at[idx, 'Original_Description'])) else (df1.at[idx, 'Description'] if 'Description' in df1.columns and pd.notna(df1.at[idx, 'Description']) else '')).strip()
                if not desc:
                    continue

                m_ft = re.search(r"FUNDS\s+TRANSFER\s+FROM\s+(.*)", desc, re.IGNORECASE)
                if not m_ft:
                    continue

                extracted_party = m_ft.group(1).strip()
                if not extracted_party:
                    continue

                clean_party = extracted_party.split('/')[0].strip()
                norm_extracted = ' '.join(extracted_party.lower().split())
                norm_clean = ' '.join(clean_party.lower().split())

                b_credit = df1.at[idx, 'Credit'] if 'Credit' in df1.columns else None
                b_debit = df1.at[idx, 'Debit'] if 'Debit' in df1.columns else None
                b_amt = b_credit if (pd.notna(b_credit) and str(b_credit).strip() not in ('', 'nan', 'None')) else b_debit
                try:
                    b_amt_val = round(float(str(b_amt).replace(',', '')), 2) if (pd.notna(b_amt) and str(b_amt).strip() not in ('', 'nan', 'None')) else None
                except Exception:
                    b_amt_val = None

                if b_amt_val is None:
                    continue

                b_vdate = df1.at[idx, 'Value Date'] if 'Value Date' in df1.columns else None
                b_txndate = df1.at[idx, 'Transaction Date'] if 'Transaction Date' in df1.columns else None
                b_vdate_obj = _to_date_obj(b_vdate)
                b_txndate_obj = _to_date_obj(b_txndate)

                candidates = []
                for cr in cloud_ft_cands:
                    if cr['c_idx'] in ft_matched_cloud_indices:
                        continue
                    if cr['amount'] is None or cr['amount'] != b_amt_val:
                        continue

                    c_part = cr['particulars']
                    norm_c_part = ' '.join(c_part.lower().split())
                    if not (norm_extracted in norm_c_part or (norm_clean and norm_clean in norm_c_part)):
                        continue

                    diff_days = 999
                    c_date_obj = cr['date_obj']
                    if c_date_obj:
                        if b_vdate_obj and b_vdate_obj == c_date_obj:
                            diff_days = 0
                        elif b_txndate_obj and b_txndate_obj == c_date_obj:
                            diff_days = 0

                    if diff_days == 0:
                        # Priority: receipt voucher > others
                        is_receipt = 0 if 'receipt' in cr['v_type'] else 1
                        candidates.append((is_receipt, cr))

                if candidates:
                    candidates.sort(key=lambda x: x[0])
                    best_cand = candidates[0][1]
                    ft_matched_cloud_indices.add(best_cand['c_idx'])

                    c_row = best_cand['row']
                    particulars_str = str(c_row.get('Particulars')) if pd.notna(c_row.get('Particulars')) else ''
                    details_val = c_row.get('Details')
                    if any(bank in particulars_str for bank in BANK_NAMES) and pd.notna(details_val) and str(details_val).strip():
                        ledger = str(details_val).strip()
                    else:
                        ledger = c_row.get('Particulars')

                    df1.at[idx, 'Ledger'] = ledger
                    df1.at[idx, 'Value'] = best_cand['amount']
                    c_orig = df1.at[idx, 'Credit'] if ('Credit' in df1.columns and pd.notna(df1.at[idx, 'Credit'])) else df1.at[idx, 'Debit']
                    try:
                        c_orig_f = float(str(c_orig).replace(',', ''))
                        df1.at[idx, 'Diff'] = c_orig_f - best_cand['amount']
                    except Exception:
                        df1.at[idx, 'Diff'] = 0.0

        # Track rows where RTN, IDBI REJECT, and matching clearing/deposit ledgers are updated to apply yellow background color
        rtn_highlight_rows = set()

        # -------------------------------------------------------------------
        # Matching Round 5: Returned transactions (RTN / IDBI REJECT) in Bank Statement -> Cloud File & Clearing Rows
        # -------------------------------------------------------------------
        if 'Description' in df1.columns:
            # Build normalized instrument lookup for Cloud File (df2)
            cloud_inst_map = {}
            if 'Instrument No.' in df2.columns:
                part_col = next((c for c in ['Particulars', 'Ledger', 'Account', 'Party Name'] if c in df2.columns), 'Particulars')
                for _, c_row in df2.iterrows():
                    raw_inst = c_row.get('Instrument No.')
                    norm_key = normalize_instrument_no(raw_inst)
                    if norm_key:
                        p_val = c_row.get(part_col)
                        p_str = str(p_val).strip() if pd.notna(p_val) else ''
                        d_val = c_row.get('Details')
                        if any(b in p_str for b in BANK_NAMES) and pd.notna(d_val) and str(d_val).strip():
                            resolved_p = str(d_val).strip()
                        else:
                            resolved_p = p_str if p_str and p_str.lower() not in ('nan', 'none') else (str(d_val).strip() if pd.notna(d_val) else '')

                        resolved_name = resolved_p or p_str
                        amt_val = c_row.get('Credit') if pd.notna(c_row.get('Credit')) else c_row.get('Debit')

                        if norm_key not in cloud_inst_map or (not cloud_inst_map[norm_key]['particulars'] and resolved_name):
                            cloud_inst_map[norm_key] = {
                                'particulars': resolved_name,
                                'amount': amt_val,
                                'row': c_row
                            }

            clg_pattern = re.compile(r"^BY\s+CLG\s+INST\s+(\d+)", re.IGNORECASE)

            for idx in df1.index:
                desc = str(df1.at[idx, 'Description'])

                # 1. Match return entries:
                # - IDBI bank statement returned pattern: starts with REJECT: {6 digit num}: (e.g. "REJECT:099021:SIB-Funds insufficient")
                # - General RTN pattern: "RTN:165:" or "RTN:000165"
                chq_match = re.search(r"^\s*REJECT:\s*(\d{6})\s*:", desc, re.IGNORECASE)
                if not chq_match:
                    chq_match = re.search(r"\bREJECT:\s*(\d{6})\s*:", desc, re.IGNORECASE)
                if not chq_match:
                    chq_match = re.search(r"^\s*REJECT:\s*(\d+)\s*:", desc, re.IGNORECASE)
                if not chq_match:
                    chq_match = re.search(r"RTN:(.*?):", desc, re.IGNORECASE)
                if not chq_match:
                    chq_match = re.search(r"RTN:(\d+)", desc, re.IGNORECASE)
                if not chq_match:
                    continue

                chq_no_raw = chq_match.group(1).strip()
                norm_chq = normalize_instrument_no(chq_no_raw)
                if not norm_chq:
                    continue

                # Mark returned entry yellow same as existing method
                rtn_highlight_rows.add(idx)
                df1.at[idx, 'Matched_Inst_No'] = chq_no_raw

                particulars_name = None
                cloud_amt = None
                inst_date_str = ''

                # Check this number on Instrument No. (e.g. 000165 or 099021) in cloud file
                if norm_chq in cloud_inst_map:
                    cloud_info = cloud_inst_map[norm_chq]
                    particulars_name = cloud_info['particulars']
                    cloud_amt = cloud_info['amount']
                    c_row = cloud_info.get('row')
                    c_date = c_row.get('Transaction Date') if c_row is not None else None

                    if particulars_name:
                        # Place Particulars name in ledger column of respected returned (RTN/REJECT) row
                        df1.at[idx, 'Ledger'] = particulars_name
                        inst_date_str = format_date_str(c_date) if pd.notna(c_date) else ''
                        if inst_date_str:
                            df1.at[idx, 'Matched_Inst_Date'] = inst_date_str

                        if pd.notna(cloud_amt):
                            try:
                                amt_f = float(cloud_amt)
                                df1.at[idx, 'Value'] = amt_f
                                debit_val = df1.at[idx, 'Debit'] if 'Debit' in df1.columns else None
                                credit_val = df1.at[idx, 'Credit'] if 'Credit' in df1.columns else None
                                if pd.notna(debit_val):
                                    df1.at[idx, 'Diff'] = float(debit_val) - amt_f
                                elif pd.notna(credit_val):
                                    df1.at[idx, 'Diff'] = float(credit_val) - amt_f
                                else:
                                    df1.at[idx, 'Diff'] = 0.0
                            except (ValueError, TypeError):
                                pass

                # 2. Check bank statement for matching clearing / deposit row with chq_match number
                for b_idx in df1.index:
                    if b_idx == idx:
                        continue
                    b_desc = str(df1.at[b_idx, 'Description']).strip()
                    clg_match = clg_pattern.search(b_desc)
                    clg_num = normalize_instrument_no(clg_match.group(1)) if clg_match else ''

                    b_chq, b_chk_date = extract_cheque_and_date(df1.loc[b_idx])
                    b_norm = normalize_instrument_no(b_chq) if b_chq else ''

                    is_clg_match = False
                    if clg_num and clg_num == norm_chq:
                        is_clg_match = True
                    elif b_norm and b_norm == norm_chq:
                        is_clg_match = True
                    elif re.search(r"(?:CLG|CLEARING|DEP|CHEQUE|CHQ|BY\s+CLG)[\s/:]*0*" + re.escape(norm_chq) + r"\b", b_desc, re.IGNORECASE):
                        is_clg_match = True

                    if is_clg_match:
                        # Mark matching clearing row yellow same as existing method
                        rtn_highlight_rows.add(b_idx)
                        df1.at[b_idx, 'Matched_Inst_No'] = chq_no_raw
                        clg_dt_m = re.search(r"BY\s+CLG\s+INST\s+\d+/(\d+[\-\/]\d+[\-\/]\d+)", b_desc, re.IGNORECASE)
                        clg_date_str = format_date_str(clg_dt_m.group(1)) if clg_dt_m else (b_chk_date or '')
                        final_date = clg_date_str or inst_date_str
                        if final_date:
                            df1.at[b_idx, 'Matched_Inst_Date'] = final_date
                            if not df1.at[idx, 'Matched_Inst_Date']:
                                df1.at[idx, 'Matched_Inst_Date'] = final_date

                        if particulars_name:
                            df1.at[b_idx, 'Ledger'] = particulars_name
                            if pd.notna(cloud_amt):
                                try:
                                    amt_f = float(cloud_amt)
                                    df1.at[b_idx, 'Value'] = amt_f
                                    credit_val = df1.at[b_idx, 'Credit'] if 'Credit' in df1.columns else None
                                    debit_val = df1.at[b_idx, 'Debit'] if 'Debit' in df1.columns else None
                                    if pd.notna(credit_val):
                                        df1.at[b_idx, 'Diff'] = float(credit_val) - amt_f
                                    elif pd.notna(debit_val):
                                        df1.at[b_idx, 'Diff'] = float(debit_val) - amt_f
                                    else:
                                        df1.at[b_idx, 'Diff'] = 0.0
                                except (ValueError, TypeError):
                                    pass
                        elif pd.notna(df1.at[b_idx, 'Ledger']) and str(df1.at[b_idx, 'Ledger']).strip():
                            # If clearing row already had a ledger resolved, copy it to the return row
                            if not df1.at[idx, 'Ledger']:
                                df1.at[idx, 'Ledger'] = df1.at[b_idx, 'Ledger']

        # -------------------------------------------------------------------
        # Matching Round 6: SWEEP TRANSFER transactions in Bank Statement
        # -------------------------------------------------------------------
        if 'Description' in df1.columns:
            mask_sweep = df1['Description'].astype(str).str.upper().str.startswith('SWEEP', na=False)
            df1.loc[mask_sweep, 'Ledger'] = "SWEEP TRANSFER"

        # --- Finalization ---
        df1['Value'] = pd.to_numeric(df1['Value'], errors='coerce')
        if 'Value Date' in df1.columns and pd.api.types.is_datetime64_any_dtype(df1['Value Date']):
            df1['Value Date'] = df1['Value Date'].dt.strftime('%d-%m-%Y')

        # Resolve detected bank name
        detected_bank = ""
        bank_filename = getattr(bank_source, 'filename', '') or (os.path.basename(bank_source) if isinstance(bank_source, str) else '')
        for b in BANK_NAMES:
            if b in bank_filename.upper():
                detected_bank = b
                break

        if not detected_bank:
            for b in BANK_NAMES:
                if 'Description' in df1.columns and df1['Description'].astype(str).str.contains(b, case=False).any():
                    detected_bank = b
                    break
                if 'Particulars' in df2.columns and df2['Particulars'].astype(str).str.contains(b, case=False).any():
                    detected_bank = b
                    break

        resolved_bank_ledger = resolve_bank_ledger(bank_source, df1, df2, detected_bank)
        output_acc_no = extract_bank_account_number(bank_source, bank_filename, df1, df2)

        # --- Check for Contra Transactions (same name appears 2 times in description) ---
        def is_row_contra(r):
            desc = r.get('Original_Description') if ('Original_Description' in r and pd.notna(r.get('Original_Description'))) else (r.get('Description') or '')
            return check_contra_description(desc)[0]

        mask_contra = df1.apply(is_row_contra, axis=1) if not df1.empty else pd.Series(False, index=df1.index)

        raw_contra = df1[mask_contra].copy()
        raw_non_contra = df1[~mask_contra].copy()

        # Build Contra Sheet records: Date, Debit Account, Credit Account, Amount, Cheque No, Cheque date, Narration
        contra_records = []
        contra_indices = []
        for orig_idx, row in raw_contra.iterrows():
            chq_no, chk_dt = extract_cheque_and_date(row)
            date_val = row.get('Value Date') if pd.notna(row.get('Value Date')) else row.get('Transaction Date')
            date_str = date_val.strftime('%d-%m-%Y') if hasattr(date_val, 'strftime') else (str(date_val).strip() if pd.notna(date_val) and str(date_val).strip().lower() not in ('nan', 'none') else '')
            raw_bank_val = resolved_bank_ledger or row.get('Bank / Cash') or row.get('Bank') or detected_bank or ''
            bank_name = format_output_bank_cash(raw_bank_val, fallback_acc=output_acc_no, detected_bank=detected_bank)
            bank_name = normalize_contra_bank_account(bank_name, detected_bank=detected_bank)
            desc_val = row.get('Original_Description') if ('Original_Description' in row and pd.notna(row.get('Original_Description'))) else (row.get('Description') or '')
            desc_str = str(desc_val).strip() if pd.notna(desc_val) and str(desc_val).strip().lower() not in ('nan', 'none') else ''
            desc_account = resolve_contra_credit_account(desc_val)

            # Check if amount is on the debit side
            is_debit_side = False
            if pd.notna(row.get('Debit')):
                try:
                    val_f = float(str(row.get('Debit')).replace(',', '').strip())
                    if val_f != 0:
                        is_debit_side = True
                except (ValueError, TypeError):
                    pass

            amt_val = row.get('Debit') if is_debit_side else row.get('Credit')

            debit_acc = bank_name
            credit_acc = desc_account

            # Swap debit account value to credit account value if amount is debit side
            if is_debit_side:
                debit_acc, credit_acc = credit_acc, debit_acc

            chq_no_val = ''
            chk_dt_val = ''

            contra_records.append({
                'Date': date_str,
                'Debit Account': debit_acc,
                'Credit Account': credit_acc,
                'Amount': amt_val,
                'Cheque No': chq_no_val,
                'Cheque date': chk_dt_val,
                'Narration': desc_str
            })
            contra_indices.append(orig_idx)

            if pd.isna(df1.loc[orig_idx, 'Ledger']) or not df1.loc[orig_idx, 'Ledger']:
                df1.loc[orig_idx, 'Ledger'] = desc_account or 'Contra'

        cols_contra = ['Date', 'Debit Account', 'Credit Account', 'Amount', 'Cheque No', 'Cheque date', 'Narration']
        df_contra = pd.DataFrame(contra_records, index=contra_indices if contra_indices else None, columns=cols_contra)
        for col in ['Cheque No', 'Cheque date']:
            if col in df_contra.columns:
                df_contra[col] = df_contra[col].fillna('').astype(str).replace({'nan': '', 'None': '', 'NaN': '', '<NA>': ''})

        # --- Split remaining (non-contra) into Payment (Debit) and Receipt (Credit) Sheets ---
        mask_payment = is_valid_column_amount(raw_non_contra['Debit']) if 'Debit' in raw_non_contra.columns else pd.Series(False, index=raw_non_contra.index)
        mask_receipt = is_valid_column_amount(raw_non_contra['Credit']) if 'Credit' in raw_non_contra.columns else pd.Series(False, index=raw_non_contra.index)

        raw_payment = raw_non_contra[mask_payment].copy()
        raw_receipt = raw_non_contra[mask_receipt].copy()

        # Build Payment Sheet records: Date (Value date), Payment No, Bank / Cash, Debit Account (Ledger), Amount (Debit), Cheque No, Cheque Date, Narration(Description)
        payment_records = []
        payment_indices = []
        for p_idx_offset, (orig_idx, row) in enumerate(raw_payment.iterrows(), start=0):
            p_seq = generate_voucher_no(payment_no_start, p_idx_offset)
            chq_no, chk_dt = extract_cheque_and_date(row)
            date_val = row.get('Value Date') if pd.notna(row.get('Value Date')) else row.get('Transaction Date')
            date_str = date_val.strftime('%d-%m-%Y') if hasattr(date_val, 'strftime') else (str(date_val).strip() if pd.notna(date_val) and str(date_val).strip().lower() not in ('nan', 'none') else '')
            raw_bank_val = resolved_bank_ledger or row.get('Bank / Cash') or row.get('Bank') or detected_bank or ''
            bank_val = format_output_bank_cash(raw_bank_val, fallback_acc=output_acc_no, detected_bank=detected_bank)
            debit_acc = row.get('Ledger') or ''
            amt_val = row.get('Debit')
            desc_val = row.get('Original_Description') if ('Original_Description' in row and pd.notna(row.get('Original_Description'))) else (row.get('Description') or '')
            desc_str = str(desc_val).strip() if pd.notna(desc_val) and str(desc_val).strip().lower() not in ('nan', 'none') else ''

            chq_no_val = ''
            chk_dt_val = ''

            payment_records.append({
                'Date': date_str,
                'Payment No': p_seq,
                'Bank / Cash': bank_val,
                'Debit Account': debit_acc,
                'Amount': amt_val,
                'Cheque No': chq_no_val,
                'Cheque Date': chk_dt_val,
                'Narration': desc_str
            })
            payment_indices.append(orig_idx)

        cols_payment = ['Date', 'Payment No', 'Bank / Cash', 'Debit Account', 'Amount', 'Cheque No', 'Cheque Date', 'Narration']
        df_payment = pd.DataFrame(payment_records, index=payment_indices if payment_indices else None, columns=cols_payment)
        if 'Bank / Cash' in df_payment.columns:
            df_payment['Bank / Cash'] = df_payment['Bank / Cash'].apply(lambda v: format_output_bank_cash(v, fallback_acc=output_acc_no, detected_bank=detected_bank))
        for col in ['Cheque No', 'Cheque Date']:
            if col in df_payment.columns:
                df_payment[col] = df_payment[col].fillna('').astype(str).replace({'nan': '', 'None': '', 'NaN': '', '<NA>': ''})

        # Build Receipt Sheet records: Date (Value date), Receipt No, Bank / Cash, Credit Account (Ledger), Amount (Credit), Cheque No, Cheque Date, Narration(Description)
        receipt_records = []
        receipt_indices = []
        for r_idx_offset, (orig_idx, row) in enumerate(raw_receipt.iterrows(), start=0):
            r_seq = generate_voucher_no(receipt_no_start, r_idx_offset)
            chq_no, chk_dt = extract_cheque_and_date(row)
            date_val = row.get('Value Date') if pd.notna(row.get('Value Date')) else row.get('Transaction Date')
            date_str = date_val.strftime('%d-%m-%Y') if hasattr(date_val, 'strftime') else (str(date_val).strip() if pd.notna(date_val) and str(date_val).strip().lower() not in ('nan', 'none') else '')
            raw_bank_val = resolved_bank_ledger or row.get('Bank / Cash') or row.get('Bank') or detected_bank or ''
            bank_val = format_output_bank_cash(raw_bank_val, fallback_acc=output_acc_no, detected_bank=detected_bank)
            credit_acc = row.get('Ledger') or ''
            amt_val = row.get('Credit')
            desc_val = row.get('Original_Description') if ('Original_Description' in row and pd.notna(row.get('Original_Description'))) else (row.get('Description') or '')
            desc_str = str(desc_val).strip() if pd.notna(desc_val) and str(desc_val).strip().lower() not in ('nan', 'none') else ''

            chq_no_val = ''
            chk_dt_val = ''

            receipt_records.append({
                'Date': date_str,
                'Receipt No': r_seq,
                'Bank / Cash': bank_val,
                'Credit Account': credit_acc,
                'Amount': amt_val,
                'Cheque No': chq_no_val,
                'Cheque Date': chk_dt_val,
                'Narration': desc_str
            })
            receipt_indices.append(orig_idx)

        cols_receipt = ['Date', 'Receipt No', 'Bank / Cash', 'Credit Account', 'Amount', 'Cheque No', 'Cheque Date', 'Narration']
        df_receipt = pd.DataFrame(receipt_records, index=receipt_indices if receipt_indices else None, columns=cols_receipt)
        if 'Bank / Cash' in df_receipt.columns:
            df_receipt['Bank / Cash'] = df_receipt['Bank / Cash'].apply(lambda v: format_output_bank_cash(v, fallback_acc=output_acc_no, detected_bank=detected_bank))
        for col in ['Cheque No', 'Cheque Date']:
            if col in df_receipt.columns:
                df_receipt[col] = df_receipt[col].fillna('').astype(str).replace({'nan': '', 'None': '', 'NaN': '', '<NA>': ''})

        output_file_path = os.path.join(output_folder, 'Matched_Cheques.xlsx')
        with pd.ExcelWriter(output_file_path, engine='openpyxl') as writer:
            df_payment.to_excel(writer, sheet_name='Payment', index=False, na_rep='')
            df_receipt.to_excel(writer, sheet_name='Receipt', index=False, na_rep='')
            df_contra.to_excel(writer, sheet_name='Contra', index=False, na_rep='')

        # Apply borders, full column widths, and highlight color to Ledger account cells
        try:
            wb = openpyxl.load_workbook(output_file_path)
            thin_border = Border(
                left=Side(style='thin', color='000000'),
                right=Side(style='thin', color='000000'),
                top=Side(style='thin', color='000000'),
                bottom=Side(style='thin', color='000000')
            )

            # 1. Apply thin borders and full column width across all sheets, ensuring empty string for blank cheque cells
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                cheque_col_indices = []
                for c_idx in range(1, ws.max_column + 1):
                    hdr = ws.cell(row=1, column=c_idx).value
                    if hdr and str(hdr).strip().lower() in ('cheque no', 'cheque date', 'chk date'):
                        cheque_col_indices.append(c_idx)

                if ws.max_row >= 1 and ws.max_column >= 1:
                    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
                        for cell in row:
                            cell.border = thin_border
                            if cell.row > 1 and cell.column in cheque_col_indices:
                                if cell.value is None or str(cell.value).strip().lower() in ('nan', 'none'):
                                    cell.value = ''

                # Auto-fit full column width
                for col in ws.columns:
                    max_len = 0
                    col_letter = get_column_letter(col[0].column)
                    for cell in col:
                        if cell.value is not None:
                            val_str = str(cell.value)
                            for line in val_str.split('\n'):
                                if len(line) > max_len:
                                    max_len = len(line)
                    ws.column_dimensions[col_letter].width = max(max_len, 10)

            # 2. Apply background color to Debit Account (Payment) and Credit Account (Receipt) cells for returned entries (RTN / IDBI REJECT) and matching clearing rows
            if rtn_highlight_rows:
                highlight_fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")
                for sheet_name, df_sheet, target_acc_col in [
                    ('Payment', df_payment, 'Debit Account'),
                    ('Receipt', df_receipt, 'Credit Account')
                ]:
                    if sheet_name in wb.sheetnames and not df_sheet.empty:
                        ws = wb[sheet_name]
                        account_col_idx = None
                        for col in range(1, ws.max_column + 1):
                            val = ws.cell(row=1, column=col).value
                            if val and str(val).strip().lower() == target_acc_col.lower():
                                account_col_idx = col
                                break

                        if account_col_idx is not None:
                            for r_idx in rtn_highlight_rows:
                                if r_idx in df_sheet.index:
                                    row_pos = df_sheet.index.get_loc(r_idx)
                                    excel_row = row_pos + 2  # +1 for 1-based, +1 for header
                                    ws.cell(row=excel_row, column=account_col_idx).fill = highlight_fill

            wb.save(output_file_path)
        except Exception as style_err:
            print(f"Warning: Failed to apply styling/borders to Matched_Cheques.xlsx: {style_err}")

        # Calculate metrics for Google Sheet / Dashboard
        total_entries = len(df1)
        sw_categorized = int(df1['Ledger'].notna().sum())
        remaining = total_entries - sw_categorized

        return output_file_path, total_entries, sw_categorized, remaining

    except Exception as e:
        print(f"Error processing files: {e}")
        raise e

def upload_files():
    """
    Direct Flask handler for file uploads returning the generated Excel attachment
    with metric headers.
    """
    from flask import request, jsonify, send_file, current_app

    file1 = request.files.get('bank_file') or request.files.get('file1')
    file2 = request.files.get('cloud_file') or request.files.get('file2')

    if not file1 or not file2:
        return jsonify({'error': 'No file part. Please provide bank_file and cloud_file.'}), 400

    if file1.filename == '' or file2.filename == '':
        return jsonify({'error': 'No selected file.'}), 400

    allowed_ext = {'.xlsx', '.xls', '.csv'}
    def is_valid(filename):
        return os.path.splitext(filename)[1].lower() in allowed_ext

    if not is_valid(file1.filename):
        return jsonify({'error': f'Bank file "{file1.filename}" is not a valid Excel file. Only .xlsx and .xls are allowed.'}), 400
    if not is_valid(file2.filename):
        return jsonify({'error': f'Cloud file "{file2.filename}" is not a valid Excel file. Only .xlsx and .xls are allowed.'}), 400

    upload_folder = os.path.join(tempfile.gettempdir(), 'accounts_reconcile')
    os.makedirs(upload_folder, exist_ok=True)

    bank_path = os.path.join(upload_folder, f"bank_{file1.filename}")
    cloud_path = os.path.join(upload_folder, f"cloud_{file2.filename}")

    file1.save(bank_path)
    file2.save(cloud_path)

    payment_no_start = request.form.get('payment_no_start') or request.form.get('payment_start') or 1
    receipt_no_start = request.form.get('receipt_no_start') or request.form.get('receipt_start') or 1

    try:
        output_file, total_entries, sw_categorized, remaining = process_files(
            bank_path, cloud_path, upload_folder,
            payment_no_start=payment_no_start, receipt_no_start=receipt_no_start
        )

        response = send_file(output_file, as_attachment=True, download_name='Matched_Cheques.xlsx')
        response.headers['X-Total-Entries'] = str(total_entries)
        response.headers['X-SW-Categorized'] = str(sw_categorized)
        response.headers['X-Remaining'] = str(remaining)
        response.headers['Access-Control-Expose-Headers'] = 'X-Total-Entries, X-SW-Categorized, X-Remaining, Content-Disposition'
        return response
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Compatibility Adapters for Flask Application Routes
# ---------------------------------------------------------------------------

def read_uploaded_file(file_storage_or_path):
    """
    Reads an uploaded file into a pandas DataFrame and returns (df, filename).
    If it's the cloud file ('day book report'), applies cloud header promotion.
    If it's the bank statement, applies Sl.No / Closing Balance cleanup.
    """
    filename = getattr(file_storage_or_path, 'filename', None)
    if not filename and isinstance(file_storage_or_path, str):
        filename = os.path.basename(file_storage_or_path)

    if is_cloud_filename(filename):
        df = read_cloud_data_file(file_storage_or_path)
    else:
        df = clean_bank_statement(file_storage_or_path)

    return df, filename or 'uploaded_file.xlsx'


def compare_datasets(df1, df2, match_key=None, filename1='Bank Statement', filename2='All Cloud File', tolerance=0.01):
    """
    Compares two datasets and generates summary metrics and sample splits for preview UI.
    """
    total_df1 = len(df1)
    total_df2 = len(df2)

    df_matched = df1[df1['Ledger'].notna()] if 'Ledger' in df1.columns else pd.DataFrame()
    df_discrepancies = df1[df1['Diff'].notna() & (df1['Diff'] != 0)] if 'Diff' in df1.columns else pd.DataFrame()
    df_only1 = df1[df1['Ledger'].isna()] if 'Ledger' in df1.columns else df1
    df_only2 = pd.DataFrame()

    matched_count = len(df_matched)
    remaining_count = total_df1 - matched_count
    match_rate = round((matched_count / max(1, total_df1)) * 100, 1)

    summary = {
        'file1_rows': total_df1,
        'file2_rows': total_df2,
        'matched_count': matched_count,
        'discrepancy_count': len(df_discrepancies),
        'only_file1_count': remaining_count,
        'only_file2_count': 0,
        'match_rate': match_rate,
        'total_entries': total_df1,
        'sw_categorized': matched_count,
        'remaining': remaining_count
    }

    return summary, df_matched, df_discrepancies, df_only1, df_only2


def generate_matchup_excel(df_matched, df_discrepancies, df_only1, df_only2, summary, filename1, filename2):
    """
    Generates a multi-sheet formatted workbook in a BytesIO buffer.
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if not df_matched.empty:
            df_matched.to_excel(writer, sheet_name='Matched Records', index=False)
        if not df_discrepancies.empty:
            df_discrepancies.to_excel(writer, sheet_name='Discrepancies', index=False)
        if not df_only1.empty:
            df_only1.to_excel(writer, sheet_name='Unmatched Bank', index=False)
        pd.DataFrame([summary]).to_excel(writer, sheet_name='Summary', index=False)
    output.seek(0)
    return output


def reconcile_uploaded_files(file1, file2, match_key=None, tolerance=0.01, output_folder=None, payment_no_start=1, receipt_no_start=1):
    """
    Executes the 5-round reconciliation engine on two uploaded files and returns:
    (excel_io, summary, 'Matched_Cheques.xlsx', df_bank, df_cloud)
    """
    if output_folder is None:
        output_folder = tempfile.gettempdir()
    os.makedirs(output_folder, exist_ok=True)

    name1 = getattr(file1, 'filename', '') or (os.path.basename(file1) if isinstance(file1, str) else '')
    name2 = getattr(file2, 'filename', '') or (os.path.basename(file2) if isinstance(file2, str) else '')

    if is_cloud_filename(name1) and not is_cloud_filename(name2):
        bank_item, cloud_item = file2, file1
    elif is_cloud_filename(name2) and not is_cloud_filename(name1):
        bank_item, cloud_item = file1, file2
    else:
        bank_item, cloud_item = file1, file2

    path_bank = save_uploaded_file_to_folder(bank_item, output_folder, "bank.xlsx")
    path_cloud = save_uploaded_file_to_folder(cloud_item, output_folder, "cloud.xlsx")

    output_path, total_entries, sw_categorized, remaining = process_files(
        path_bank, path_cloud, output_folder,
        payment_no_start=payment_no_start, receipt_no_start=receipt_no_start
    )

    # Read output file into in-memory BytesIO
    with open(output_path, 'rb') as f:
        excel_bytes = f.read()
    excel_io = io.BytesIO(excel_bytes)
    excel_io.seek(0)

    summary = {
        'file1_rows': total_entries,
        'matched_count': sw_categorized,
        'only_file1_count': remaining,
        'discrepancy_count': 0,
        'only_file2_count': 0,
        'match_rate': round((sw_categorized / max(1, total_entries)) * 100, 1),
        'total_entries': total_entries,
        'sw_categorized': sw_categorized,
        'remaining': remaining
    }

    try:
        dict_dfs = pd.read_excel(io.BytesIO(excel_bytes), sheet_name=None, engine='openpyxl')
        df_result = pd.concat(dict_dfs.values(), ignore_index=True) if dict_dfs else pd.DataFrame()
    except Exception:
        df_result = pd.DataFrame()

    return excel_io, summary, 'Matched_Cheques.xlsx', df_result, None