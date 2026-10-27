# Tally ERP Integration: Payout Date API

This specification provides details for the **Tally ERP team** to post loan disbursement / payout dates to the LoanDesk system.

---

## 1. Quick Integration Summary

- **Endpoint**: `POST https://accounts-new-ljja.onrender.com/api/v1/tally/payouts`
- **Method**: `POST`
- **Authentication**: **API Key Required**
- **Required Headers**:
  - `Content-Type: application/json`
  - `X-API-Key: tally_live_sec_8f92e4a19b0d4c728391`

---

## 2. API Key Authentication

Include the secret key in the request headers:

```http
X-API-Key: tally_live_sec_8f92e4a19b0d4c728391
```

*(Alternatively, you can send `Authorization: Bearer tally_live_sec_8f92e4a19b0d4c728391`)*.

Requests without a valid key will receive:
```json
{
  "success": false,
  "error": "Unauthorized: Invalid or missing API Key. Please provide header 'X-API-Key: <your_api_key>'."
}
```

---

## 3. Request Payload Schema

Each payout transaction requires two core fields:
1. `loan_id` *(Number or String, Required)*: The unique LoanDesk Loan ID (e.g. `1042` or `JL-1042`).
2. `payout_date` *(String, Required)*: The date the payout occurred in format `DD-MM-YYYY` or `YYYY-MM-DD`.

Optional fields:
- `installment_no` *(Number, Optional)*: Installment number (1, 2, 3...) if syncing a specific EMI payout. If omitted, the earliest pending installment is automatically updated.
- `amount` *(Number, Optional)*: Payout amount (e.g. `25000.00`).
- `cheque_no` *(String, Optional)*: Payment reference or cheque number.
- `voucher_no` *(String, Optional)*: Tally Payment Voucher number (e.g. `PAY-9912`).
- `bank_name` *(String, Optional)*: Bank account disbursed from.
- `narration` *(String, Optional)*: Tally payment narration / remarks.

---

## 4. Example Request Payloads

### Option A: Tally ERP Standard Voucher Payload (Direct from Tally)
You can directly send your standard Tally export payload with debit/credit entries, bill allocations, and instrument details:

```json
{
    "data": [
        {
            "vchNo": "LE2257-2717870",
            "date": "01-08-2025",
            "narration": "Ledger change Party Bank-ex",
            "debit_entries": [
                {
                    "account_name": "HDFC BANK",
                    "amount": 100000,
                    "Bank_Name": "HDFC BANK",
                    "TRANSACTIONTYPE": "e-Fund Transfer",
                    "Inst_No": "CHANGE-50200016652923-2257-1754018208",
                    "Inst_Date": "2025-08-01"
                }
            ],
            "credit_entries": [
                {
                    "account_name": "United Roofings And Constructions",
                    "amount": 100000,
                    "Bill_allocations": [
                        {
                            "Ref_No": "PDM/23-24/C/16527",
                            "Ref_Type": "Agst Ref",
                            "amount": "100000"
                        }
                    ]
                }
            ]
        }
    ]
}
```

#### How LoanDesk maps this payload:
- **Loan Matching**: Matched via `Bill_allocations[0].Ref_No` (`"PDM/23-24/C/16527"`), Party Name (`"United Roofings And Constructions"`), or voucher number.
- **Payout Date (`payment_date`)**: Set from `Inst_Date` or voucher `date` (`"01-08-2025"`).
- **Payment Reference**: `Inst_No` (`"CHANGE-50200016652923-2257-1754018208"`) stored as Cheque / UTR number.
- **Bank**: `Bank_Name` / `account_name` (`"HDFC BANK"`).
- **Amount**: Disbursed amount (`100000`).

---

### Option B: Batch of Flat Payout Records
```json
{
  "payouts": [
    {
      "loan_id": 1042,
      "payout_date": "01-08-2025",
      "installment_no": 1,
      "amount": 100000.00,
      "cheque_no": "CHQ889102",
      "voucher_no": "PAY-0081",
      "bank_name": "HDFC Bank",
      "narration": "Payout for Loan #1042"
    }
  ]
}
```

---

### Option C: Single Payout Record
```json
{
  "loan_id": 1042,
  "payout_date": "01-08-2025",
  "amount": 100000.00,
  "voucher_no": "PAY-0081"
}
```

---

### Option D: Direct JSON Array
```json
[
  {
    "loan_id": 1042,
    "payout_date": "01-08-2025"
  }
]
```

---

## 5. cURL Testing Example

```bash
curl -X POST "https://accounts-new-ljja.onrender.com/api/v1/tally/payouts" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: tally_live_sec_8f92e4a19b0d4c728391" \
     -d '{
       "payouts": [
         {
           "loan_id": 1042,
           "payout_date": "27-10-2026",
           "installment_no": 1,
           "amount": 25000,
           "voucher_no": "PAY-001"
         }
       ]
     }'
```

### Success Response (HTTP 201)
```json
{
  "success": true,
  "message": "Successfully collected and stored 1 payout record(s).",
  "received_count": 1,
  "inserted_count": 1,
  "errors": null
}
```

---

## 6. Python Request Example

```python
import requests

url = "https://accounts-new-ljja.onrender.com/api/v1/tally/payouts"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "tally_live_sec_8f92e4a19b0d4c728391"
}
payload = {
    "payouts": [
        {
            "loan_id": 1042,
            "payout_date": "27-10-2026",
            "amount": 25000,
            "voucher_no": "PAY-001"
        }
    ]
}

response = requests.post(url, json=payload, headers=headers)
print(response.status_code, response.json())
```
