# Invoice AI Tracker

Upload invoice PDFs/images → Gemini AI extracts vendor/amount/GST/etc → review → push to the **MasterData** tab of your Google Sheet. Master Site Data (vendor / cost-center master records) lives in the **SitesList** tab of the same spreadsheet and is used for cost-center lookups during the push.

## Stack
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **AI**: Google Gemini API (`gemini-2.5-flash-lite`)
- **Database**: Google Sheets API v4 — `SitesList` tab (Master Site Data) + `MasterData` tab (Master Invoice Data)
- **Audit log**: MongoDB (optional — falls back to stdout if unreachable)
- **Auth**: JWT in httpOnly cookies, bcrypt password hash, AES-256-CBC encrypted audit details
- **Hosting**: Vercel

## Setup

### 1. Install dependencies
```bash
bun install
```

### 2. Configure environment variables
Copy `.env.example` → `.env.local` and fill in:

| Var | Required | Description |
|---|---|---|
| `ADMIN_USERNAME` | yes | Login username |
| `ADMIN_PASSWORD_PLAIN` | dev | Plaintext password (used because bcrypt `$` chars conflict with dotenv expansion). For production use `ADMIN_PASSWORD_HASH` via Vercel env dashboard. |
| `ADMIN_PASSWORD_HASH` | prod | bcrypt hash of password. Generate: `bun run scripts/hash-password.ts "<your-password>"` |
| `ENCRYPTION_KEY` | yes | 32-byte hex (256-bit) AES key for audit log encryption. Generate: `openssl rand -hex 32` |
| `JWT_SECRET` | yes | Long random string. Generate: `openssl rand -hex 48` |
| `MONGO_URI` | optional | MongoDB connection string for audit log. If unset, audit entries fall back to stdout. |
| `GEMINI_API_KEY` | yes | From https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | yes | Defaults to `gemini-2.5-flash-lite`. |
| `GOOGLE_SHEET_ID` | yes | The spreadsheet ID (pre-filled with `1r5rOF3aLzfIaYT-5hdrgKjx8uxo_PhU94a-CtblcAKU`) |
| `GOOGLE_SHEET_TAB` | yes | Tab name for Master Invoice Data (defaults to `MasterData`) |
| `SITES_SHEET_TAB` | yes | Tab name for Master Site Data (defaults to `SitesList`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | yes | Minified JSON of your Google service-account key file |

### 3. Set up your Google Sheet
Your spreadsheet must contain TWO tabs:

**Tab 1: `SitesList`** — Master Site Data (17 columns, A–Q)
Row 1 is the header. The app expects these exact column names:
```
Entity | Status | Type | Tag | Region | State | Address | Vendor Code | Vendor Name | Vendor Email | Vendor Mobile | Cost Center | HANA Name | Business Area Code | Tax Code | Frequency | Remarks
```
If the tab is empty, the app will create the header row automatically the first time you seed a site.

**Tab 2: `MasterData`** — Master Invoice Data (25 columns, A–Y)
Row 1 is the header matching the user spec section B. The app appends invoice rows starting at row 2.

### 4. Set up Google Service Account
1. Go to Google API Console → APIs & Services → enable **Google Sheets API**
2. Credentials → Create credentials → Service account
3. Give it a name, no roles needed
4. Click the service account → KEYS → Add key → JSON → download
5. Open the JSON file, minify it (remove all newlines), paste the whole thing as the value of `GOOGLE_SERVICE_ACCOUNT_JSON`
6. Open your Google Sheet → Share → give **Editor** permission to the service account's `client_email` (looks like `xxx@yyy.iam.gserviceaccount.com`)

### 5. Run dev server
```bash
bun run dev
```

### 6. Deploy to Vercel
1. Push repo to GitHub
2. Import into Vercel
3. In Vercel project settings → Environment Variables, add **every** variable from `.env.local`
4. Set `NODE_ENV=production`
5. Deploy

## Security
- All passwords stored as bcrypt hashes (10 rounds)
- Session JWT signed with HS256, stored in httpOnly + sameSite=strict + secure cookies
- AES-256-CBC encryption for audit log details stored in MongoDB
- Rate limiting on login (10/min/IP) and extraction (20/min/user)
- CSRF-lite: cross-origin POST/PUT/PATCH/DELETE blocked at the Next.js proxy layer
- Input validation with Zod at every API boundary
- All actions logged to `audit_logs` MongoDB collection with encrypted details
- **Note**: PII fields in the SitesList tab (vendor email, vendor mobile, address) are stored as plain text in Google Sheets — the sheet's share permissions are the access control. If you need encrypted-at-rest PII, swap the sheets service for MongoDB.

## Column mapping

### `SitesList` tab (Master Site Data — 17 columns)
Read from columns A–Q in this exact order (defined in `src/lib/types/invoice.ts` → `SITE_SHEET_COLUMN_ORDER`):
```
Entity, Status, Type, Tag, Region, State, Address, Vendor Code,
Vendor Name, Vendor Email, Vendor Mobile, Cost Center, HANA Name,
Business Area Code, Tax Code, Frequency, Remarks
```
`HANA Name` is the lookup key — when seeding a site with an existing HANA Name, the row is updated in place (not duplicated).

### `MasterData` tab (Master Invoice Data — 25 columns)
Pushed in the order defined in `SHEET_COLUMN_ORDER`. Fields marked "A" in the user spec are left empty (auto-populated downstream by SAP / mail / payment systems). Fields derived from Master Site Data (`Legal Entity`, `Cost Center Description (HANA Name)`) are populated by looking up the chosen site's `HANA Name` against the `SitesList` tab.

## Default credentials (dev)
- Username: `admin`
- Password: `Admin@123` (set via `ADMIN_PASSWORD_PLAIN` in `.env.local`)
- **Change these immediately** by running `bun run scripts/hash-password.ts "<new-password>"` and setting `ADMIN_PASSWORD_HASH` in your Vercel env dashboard (remove `ADMIN_PASSWORD_PLAIN` in production).
