# Vendora — Developer Onboarding Guide

Welcome to the **Vendora Retail POS** project. This document covers everything a new developer needs to understand, set up, and run the application.

---

## 📌 1. What is Vendora?

Vendora is a production-grade, **offline-first, multi-domain Retail Point of Sale** (POS) application built as a SaaS product. It is designed for Indian retail environments — including General Stores, Hardware Shops, and Jewelry Shops — where internet connectivity is unreliable.

**Key Capabilities:**
- **Offline-First Billing:** All billing, inventory, and printing operations work without an internet connection. Data is stored locally in SQLite and synced to the cloud when connectivity is restored.
- **Bi-directional Sync:** A background worker pushes local sales/stock up AND pulls latest cloud products/invoices down. This ensures a new machine gets the full shop history and catalog on first login.
- **Hardware Integration:** Native support for USB/Network Barcode Scanners, ESC/POS Thermal Receipt Printers (with RJ11 Cash Drawer Kick), and Serial Port Weighing Scales.
- **Sales History:** Premium UI to browse past invoices, view line-item details, and track billing history across all devices in the shop.
- **Owner Dashboard:** A centralized "Command Center" for shop owners to manage inventory, staff, and sales in a dedicated horizontal view.
- **Soft-Delete Support:** Products are never permanently removed from the database; they are flagged as `is_deleted` to maintain historical integrity and ensure correct synchronization across devices.
- **Indian Tax Compliance:** Built-in GST (CGST/SGST/IGST) calculation with inter-state detection, HSN/SAC code support, and Bill of Supply mode.
- **Multi-Tenant SaaS:** The cloud backend uses PostgreSQL Row-Level Security (RLS) to strictly isolate data between tenants. Each shop is a tenant.
- **Role-Based Access (RBAC):** Owner and Biller roles. Owners can manage inventory and create additional staff accounts via the Staff API.

---

## 🛠️ 2. Tech Stack

Vendora uses a **Tri-Tier Architecture**:

### Tier 1: Frontend (React UI) — Runs in Electron Renderer Process
| Technology | Version | Purpose |
|---|---|---|
| React | 19.x | UI framework |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Dev server and bundler |
| TailwindCSS | 4.x | Utility-first styling |
| Zustand | 5.x | State management (with `persist` middleware) |
| Lucide React | 1.x | Icon library |
| react-barcode | 1.x | Barcode SVG rendering |

### Tier 2: Edge Backend (Electron Main Process) — Runs on the cash register
| Technology | Version | Purpose |
|---|---|---|
| Electron | 42.x | Desktop shell |
| better-sqlite3 | 12.x | Synchronous local SQLite database |
| serialport | 13.x | COM port communication for weighing scales |

### Tier 3: Cloud API Server (Express) — Centrally hosted
| Technology | Version | Purpose |
|---|---|---|
| Express | 4.x | HTTP server |
| PostgreSQL | 14+ | Cloud database with RLS |
| pg | 8.x | PostgreSQL client |
| jsonwebtoken | 9.x | JWT auth tokens |
| bcryptjs | 2.x | Password hashing |
| nodemailer | 6.x | Email notifications (low stock alerts) |

---

## 📂 3. Project Structure

```
Vendora/
├── electron/                    # Electron Main Process (Tier 2)
│   ├── main.ts                  # App bootstrap, IPC handlers (auth, DB, products, invoices)
│   ├── preload.ts               # contextBridge — secure IPC API surface
│   ├── db/
│   │   └── localDb.ts           # SQLite schema (products, invoices, invoice_items)
│   ├── hardware/
│   │   ├── barcodeScanner.ts    # Keyboard event interception
│   │   ├── printer.ts           # ESC/POS network printer
│   │   └── weighingScale.ts     # SerialPort reader for scales
│   └── sync/
│       └── syncWorker.ts        # Background poller — Bi-directional sync (Push/Pull)
│
├── src/                         # React Frontend (Tier 1)
│   ├── App.tsx                  # Auth gate + hardware listeners + layout + Sync Loader
│   ├── components/
│   │   ├── LoginScreen.tsx      # Two-panel Login / Register screen
│   │   ├── CartPane.tsx         # Left 60% — product list, qty, margin display
│   │   ├── ActionPane.tsx       # Right 40% — totals, tax, checkout, shortcuts
│   │   ├── SalesHistory.tsx     # Historical billing records (searchable list + details)
│   │   ├── DomainWizard.tsx     # First-run domain selection modal
│   │   ├── InventoryManager.tsx # Full CRUD: List, Add, Edit, Delete, Stock ±1
│   │   ├── StaffManager.tsx     # Owner-only tool to manage staff accounts
│   │   └── OwnerDashboard.tsx   # Management hub (4-column horizontal view)
│   ├── store/
│   │   ├── authStore.ts         # login/register/logout/checkAuth
│   │   └── cartStore.ts         # cart items, invoice type, discount, role
│   └── global.d.ts              # IElectronAPI type declarations
│
├── server/                      # Cloud API Server (Tier 3)
│   ├── src/
│   │   ├── db/
│   │   │   ├── pg.ts            # PostgreSQL connection pool & RLS helpers
│   │   │   └── migrate.ts       # Automated migration runner
│   │   ├── index.ts             # Express bootstrap (calls migrate.ts)
│   │   ├── routes/
│   │   │   ├── auth.ts          # /auth/register, /auth/login, /auth/forgot-password, /auth/reset-password, /auth/change-password
│   │   │   ├── products.ts      # /api/products (CRUD)
│   │   │   ├── sync.ts          # /api/sync (Invoices/Products Push & Invoices Pull)
│   │   │   └── notifications.ts # /api/notifications
│   │   └── services/
│   │       └── notifications.ts # Low Stock alerts (In-app + Email)
│
├── db/
│   └── migrations/
│       └── 001_initial_schema.sql  # Full PG schema + RLS policies
```

---

## 🧩 4. Architecture Deep Dive

### IPC Communication Model
All communication goes through `contextBridge`.

**Key IPC Channels:**

| Channel | Purpose |
|---|---|
| `db:checkout` | Atomically creates invoice + items + deducts stock in SQLite |
| `db:getInvoices` | Fetches historical sales from local SQLite |
| `db:getProducts` | Fetches products for the POS and Inventory Manager |
| `sync:runInitial` | Forces an immediate cloud pull (used on new system login) |
| `settings:set` / `get` | Persists UI preferences (e.g., Domain Confirmation) locally |
| `auth:saveToken` | Persists shop details and JWT locally in `config.json` |
| `auth:deep-link` | Listens for `vendora://reset-password` protocol triggers |
| `hardware:barcode` | (Event) Emitted when a physical barcode scanner is used |
| `hardware:print...` | Sends raw ESC/POS commands to configured receipt printer |

### Deep Link & Protocol Handling
The app is registered as the handler for the `vendora://` protocol. This is primarily used for the **Password Reset** flow:
1. Cloud API sends an email with a link: `vendora://reset-password?token=XYZ`.
2. OS opens Vendora. Electron's `main.ts` captures the URL in `second-instance` or `argv`.
3. `handleDeepLink` extracts the token and sends it via the `auth:deep-link` IPC channel.
4. `LoginScreen.tsx` receives the token and switches the UI to the **Reset Password** tab automatically.

### Initial Sync (New System Login)
When a user logs in on a new device, the app detects an empty local database.
1. `App.tsx` calls `window.electronAPI.runInitialSync()`.
2. App shows a **Synchronizing Shop Data** loading overlay.
3. `syncWorker` performs a full pull of products and invoices.
4. Once complete, the overlay disappears, and the POS is ready with all historical data.

### Bi-directional Sync Flow
Every 30 seconds, `syncWorker.ts` runs:
1. **Push Products:** Sends locally added/edited products to cloud. Cloud triggers **Low Stock Alerts** if needed.
2. **Push Invoices:** Sends new offline invoices + line items. Cloud **deducts stock** and updates history.
3. **Pull Products:** Fetches latest catalog from cloud (updates local prices/stock).
4. **Pull Invoices:** Fetches latest history from cloud (syncs other machines' sales).

---

## 🔌 5. Hardware Integration & Testing

Vendora interacts with raw hardware through the Electron Main Process.

### 🖨️ Thermal Printer (ESC/POS)
The system uses raw TCP/IP (Port 9100) to send ESC/POS commands.
- **Config**: `electron/hardware/printer.ts` -> `PRINTER_CONFIG`.
- **Barcode Printing**: Uses the `GS k` command to print native barcodes.
- **Testing with a "Normal" Printer**:
  1. Go to Windows **Devices and Printers**.
  2. Add a new printer manually.
  3. Choose **Generic / Text Only** as the driver.
  4. Share this printer or use a "Print to File" port.
  5. (Advanced) Use a tool like **HW Virtual Serial Port** or a Raw-TCP redirector to map Port 9100 to your local printer.
  *Note: A standard Inkjet/Laser printer will print raw hex strings unless using a thermal-emulation driver.*

### ⚖️ Weighing Scale
Reads continuous data from a Serial (COM) port.
- **Config**: `electron/hardware/weighingScale.ts` -> `SERIAL_PORT_PATH`.
- **Baud Rate**: Typically 9600.
- **Testing**: Use a virtual COM port tool (like **com0com**) to simulate a scale sending strings like `ST,GS,+  1.250kg`.

### 🔍 Barcode Scanner
Operates as a "Keyboard Wedge".
- **Logic**: `electron/hardware/barcodeScanner.ts` listens for rapid keystrokes ending in `Enter`.
- **Testing**: Any USB barcode scanner or even typing quickly followed by Enter will trigger the listener.

---

## 🚀 6. Setup & Run Instructions

Prerequisite: Visual Studio Installer -> Web Dev C++

1. **Server Setup:**
   - `cd server && npm install`
   - Copy `.env.example` to `.env` and configure DB.
   - Set `FRONTEND_URL=vendora://` (or `http://localhost:5173` for web testing) for reset emails.
   - Run `npm run dev`.
2. **PostgreSQL Setup:**
   - Create database
      CREATE DATABASE vendora_db;

   - Create user
      CREATE USER vendora_user WITH PASSWORD 'your_secure_password_here';

   - Set user defaults
      ALTER ROLE vendora_user SET client_encoding TO 'utf8';
      ALTER ROLE vendora_user SET default_transaction_isolation TO 'read committed';
      ALTER ROLE vendora_user SET default_transaction_deferrable TO on;

   - Grant privileges (run from vendora db)
      GRANT ALL PRIVILEGES ON DATABASE vendora_db TO vendora_user;
      GRANT ALL ON SCHEMA public TO vendora_user;
      
    - **Note:** You no longer need to run `.sql` files manually. The server will automatically run all pending migrations from `db/migrations/` on startup.
3. **Electron Setup:**
   - `cd .. && npm install`
   - Copy `.env.example` to `.env` and adjust `VENDORA_SYNC_INTERVAL_MINUTES` if needed.
   - Run `npm run dev`.

---

## 📦 6. Packaging & Release Process

Vendora uses `electron-builder` and `electron-updater` for professional distribution.

### 🛠️ Prerequisites
- Set `GITHUB_REPO_URL` in your `.env` file (e.g., `https://github.com/iamajmalsaleem/vendora-pos`).
- Ensure `VITE_CLOUD_API` is set to your production server URL in `.env.production`.

### 🚀 Creating an Installer
Run the following command to generate a Windows `.exe` installer:
```bash
npm run package
```
The output will be located in the `/release` folder.

### 🔄 Publishing an Update
1. **Version Bump:** Increase the `"version"` field in `package.json` (e.g., `1.0.0` → `1.0.1`).
2. **Build:** Run `npm run package`.
3. **Github Release:**
   - Go to your GitHub repository -> **Releases** -> **Draft a new release**.
   - Use the version number as the tag (e.g., `v1.0.1`).
   - Upload the **`.exe`** file and the **`latest.yml`** file from the `/release` folder.
   - Publish the release.
4. **Client Notification:** Installed apps will automatically detect the new version (on startup or manual check) and prompt for installation.

---

## 📋 6. Pending Tasks & Next Steps

### High Priority
- [ ] **Notification UI:** Display in-app notifications (Low Stock, Sync Status) in the Electron UI.
- [ ] **Dashboard/Analytics:** Web-based owner dashboard for multi-store revenue reports.

### Medium Priority
- [ ] **Audit Logging:** Track all product edits and price changes.
- [ ] **Multi-store:** Better support for inventory movement between branches.

---

## 🐛 7. Troubleshooting
- **Native Module Error:** Run `npx @electron/rebuild` if `better-sqlite3` or `serialport` fails to load.
- **Blank Window:** Ensure Vite is running on port 5173.
- **DB Permission Error:** If you see `permission denied for schema public`, run `GRANT ALL ON SCHEMA public TO vendora_user;` as a superuser.
- **DB Ownership Error:** If you see `must be owner of table ...`, it means tables were created by a different user. Run `ALTER TABLE <table_name> OWNER TO vendora_user;` for all tables or drop the schema and let the migration runner recreate them.
- **DB Conflict:** Sync uses `ON CONFLICT` — check `sync_status` in SQLite if data isn't moving.
