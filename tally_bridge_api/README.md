# Deploying Tally Payout Bridge API to Render

Deploy this microservice on Render to collect loan payout dates sent by the Tally team and store them into Neon DB.

---

### Step 1: Get Neon DB Connection String
1. Log into your [Neon Console](https://console.neon.tech).
2. Copy your PostgreSQL connection string:
   `postgresql://username:password@ep-xyz.neon.tech/neondb?sslmode=require`

---

### Step 2: Deploy to Render
1. Log into [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Select your repository and set:
   - **Root Directory**: `tally_bridge_api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
4. Under **Environment Variables**, add:
   - `DATABASE_URL`: Paste your Neon DB connection string.
5. Click **Deploy Web Service**.

---

### Step 3: Provide the API URL to Tally Team
Give the Tally ERP team your Render service URL:
`POST https://<YOUR-RENDER-APP>.onrender.com/api/v1/tally/payouts`

No API key or special headers are required. Refer to `TALLY_API_DOCUMENTATION.md` for full payload schemas.
