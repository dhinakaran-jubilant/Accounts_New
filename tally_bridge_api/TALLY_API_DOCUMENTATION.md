# Tally ERP Integration: Payout Date API

This specification provides details for the **Tally ERP team** to post loan disbursement / payout dates to the LoanDesk system.

---

## 1. Quick Integration Summary

- **Endpoint**: `POST https://<YOUR-RENDER-APP>.onrender.com/api/v1/tally/payouts`
- **Method**: `POST`
- **Authentication**: **None** (No API Key required)
- **Content-Type**: `application/json`
- **Purpose**: Receive loan payout dates and store them in the cloud Neon database. LoanDesk reconciles these dates directly into loan accounts matched by **`loan_id`**.

---

## 2. Request Payload Schema

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

## 3. Example Request Payloads

### Option A: Batch of Payouts (Recommended)
```json
{
  "payouts": [
    {
      "loan_id": 1042,
      "payout_date": "27-10-2026",
      "installment_no": 1,
      "amount": 25000.00,
      "cheque_no": "CHQ889102",
      "voucher_no": "PAY-0081",
      "bank_name": "HDFC Bank",
      "narration": "Disbursement / payout for Loan #1042"
    },
    {
      "loan_id": 1043,
      "payout_date": "27-10-2026",
      "amount": 50000.00,
      "voucher_no": "PAY-0082"
    }
  ]
}
```

### Option B: Single Payout
```json
{
  "loan_id": 1042,
  "payout_date": "27-10-2026",
  "amount": 25000.00,
  "voucher_no": "PAY-0081"
}
```

### Option C: Direct JSON Array
```json
[
  {
    "loan_id": 1042,
    "payout_date": "27-10-2026"
  },
  {
    "loan_id": 1043,
    "payout_date": "27-10-2026"
  }
]
```

---

## 4. cURL Testing Example

```bash
curl -X POST "https://<YOUR-RENDER-APP>.onrender.com/api/v1/tally/payouts" \
     -H "Content-Type: application/json" \
     -d '{
       "payouts": [
         {
           "loan_id": 1042,
           "payout_date": "27-10-2026",
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
  "message": "Successfully collected and stored 1 payout record(s) in Neon DB.",
  "received_count": 1,
  "inserted_count": 1,
  "errors": null
}
```

---

## 5. Health Check

To test if the API is active and view current pending payouts:
```bash
curl -X GET "https://<YOUR-RENDER-APP>.onrender.com/health"
```
Response:
```json
{
  "status": "healthy",
  "database_type": "neon_postgres",
  "total_payouts": 42,
  "pending_payouts": 8
}
```
