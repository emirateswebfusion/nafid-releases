# NAFID POS — GST Phase 2A: Complete API-Ready GST Integration Infrastructure

## 1. Executive Summary & Architecture

GST Phase 2A establishes an end-to-end, enterprise-grade, multi-tenant GST integration infrastructure across the NAFID ecosystem:
- **NAFID POS (Electron Desktop Client)**
- **NAFID Server (Central Backend & Multi-Tenant Registry)**
- **NAFID Super Admin Console (Platform Administration)**

### Core Architectural Principle: Readiness Mode
In accordance with statutory and operational governance, **actual third-party GSP API connectivity remains intentionally disabled** in readiness mode until an authorized commercial GSP agreement (ClearTax, Masters India, Adaequare, or IRIS GST) is executed. All database schemas, cryptographic vaults, lifecycle handlers, UI workflows, validation engines, and test suites are 100% complete and verified.

---

## 2. Three Statutory GST Operating Modes

### Mode 1 — NAFID Managed GSP
- **Ownership:** Configured at the platform level by NAFID Super Admin in the Super Admin Console.
- **Tenant Scope:** Eligible tenant shops can route statutory filings through this managed gateway.
- **Taxpayer Delinking & Consent:** Platform credentials belong strictly to NAFID. Individual tenant shops must register explicit taxpayer authorization and consent for their specific GSTIN before utilizing the platform pipe.
- **Zero Secret Exposure:** Desktop POS clients and tenant staff **never** receive the platform GSP client ID, client secret, auth tokens, or private endpoints. All GSP interaction executes server-side.

### Mode 2 — Shop-Owned GSP
- **Ownership:** A shop owner connects their own direct subscription with a supported GSP provider.
- **Tenant Isolation:** Credentials and filing history are strictly scoped by `tenant_id`. Other shops and unauthorized actors can never access these connection details.
- **Server Vault:** Client credentials submitted by the shop owner are immediately encrypted server-side using AES-256-GCM before storage. Only masked tokens (`••••••••`) are ever returned to the client UI.

### Mode 3 — Offline Filing Only (Autonomous Statutory Engine)
- **Zero API Dependency:** Operates fully autonomously without network connectivity or third-party GSP subscriptions.
- **Full Reporting & Validation:** Computes complete GSTR-1 tables (B2B, B2CL, B2CS, CDNR, CDNUR, HSN Table 12, Doc series Table 13) and GSTR-3B summary tables.
- **Statutory Exports:** Exports official GSTN offline JSON packages and comprehensive multi-sheet Excel workbooks.
- **Manual Acknowledgement:** Stores official Acknowledgement Reference Numbers (ARN) and filing dates in local SQLite (`gst_local_filings`) and syncs to central records when online.

---

## 3. Database Architecture & Schema Design

### Central Database (`nafid-server`)
Migration: `091_gst_platform_connections.sql`
- `gst_platform_connections`: Stores platform-level GSP connection parameters, environment (`SANDBOX` / `PRODUCTION`), encrypted credentials, monthly tenant quota, and activation status.
- `gst_integration_audit_logs`: Central immutable audit trail tracking actor, action, tenant, IP address, and metadata.

### Tenant Databases (`nafid-server`)
Migration: `101_gst_integration_tables.sql`
- `gst_shop_settings`: Active integration mode (`MANAGED_GSP`, `SHOP_OWNED_GSP`, `OFFLINE`), active provider ID, environment.
- `gst_shop_connections`: Shop-owned GSP credentials, encrypted at rest via AES-256-GCM.
- `gst_taxpayer_authorizations`: Individual taxpayer GSTIN authorization status (`PENDING`, `AUTHORIZED`, `EXPIRED`, `REVOKED`), authorized service scopes, expiry dates.
- `gst_filing_records`: Filing lifecycle records, return type (`GSTR1`, `GSTR3B`), period, filing mode, status (`DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `FILED`), gross taxable turnover, total tax amount, official ARN, approved by, approved at.
- `gst_integration_jobs`: Asynchronous filing queue jobs and retry counters.

### Local SQLite Database (`nafid-pos`)
Migration: `013-gst-phase2a-local-filings.ts`
- `gst_local_filings`: Local offline-capable cache of return filing lifecycle records, ARNs, approval timestamps, and turnover figures.

---

## 4. Cryptographic Credential Vault

All GSP client secrets, authentication tokens, and portal credentials are encrypted using **AES-256-GCM** authenticated encryption:
- **Module:** `nafid-server/src/services/gst/credentialVault.ts`
- **Specification:**
  - Initialization Vector (IV): 12 bytes random per encryption operation
  - Authentication Tag: 16 bytes for message authentication & integrity
  - Master Key Derivation: PBKDF2 with SHA-256 (100,000 iterations) derived from server `GST_VAULT_KEY` or `JWT_SECRET`
  - Version Prefix: `v1:<iv>:<authTag>:<ciphertext>`
- **Masking Protocol:** `maskCredentialMap()` masks sensitive fields with bullet symbols before transmitting configuration metadata back to the client. Plaintext secrets never enter logs, responses, or client memory.

---

## 5. Filing Lifecycle & Permissions

Statutory returns follow a strict 4-stage lifecycle:
1. **DRAFT:** Aggregated from verified sales invoices, credit notes, and product classifications.
2. **AWAITING_APPROVAL:** Staged for authorized management sign-off.
3. **APPROVED:** Formally authorized by `OWNER` or `ADMIN` role. (Role guards block `STAFF` from approving filings or modifying GSP connections).
4. **FILED:** Acknowledged with official GSTN Acknowledgement Reference Number (ARN) and timestamp.

---

## 6. Input Tax Credit (ITC) & GSTR-3B Statutory Rules

Under Section 16(2)(aa) of the Central Goods and Services Tax (CGST) Act:
- Input Tax Credit (ITC) cannot be claimed solely on self-recorded purchase bills.
- Taxpayers must reconcile recorded purchase invoices against the supplier's filings auto-populated in **GSTR-2B** on the official GST Portal.
- The GSTR-3B interface clearly flags this statutory requirement and stages inward purchase figures as advisory until reconciled.

---

## 7. HOW TO INTEGRATE A REAL GSP PROVIDER LATER

When commercial authorized GSP credentials (e.g. ClearTax, Masters India, Adaequare, or IRIS GST) are obtained, follow this exact procedure to activate live connectivity:

### Step 1: Review Provider Documentation & Schema
Obtain the provider's API specification, sandbox credentials, and authentication endpoints.

### Step 2: Implement the Adapter Class
Create a concrete adapter in `nafid-server/src/services/gst/adapters/<providerName>Adapter.ts` implementing `IGstProviderAdapter`:
```typescript
import { IGstProviderAdapter, GstProviderAuthResult, GstFilingSubmissionResult } from '../providerAdapter.js';

export class ClearTaxGspAdapter implements IGstProviderAdapter {
  readonly providerId = 'CLEAR_TAX';
  readonly name = 'ClearTax GSP Gateway';

  async authenticateTaxpayer(params: {
    gstin: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    credentials: Record<string, string>;
    otp?: string;
  }): Promise<GstProviderAuthResult> {
    // 1. Call ClearTax auth endpoint with client_id and client_secret
    // 2. Exchange credentials / taxpayer OTP for session auth token
    // 3. Return session token and expiry
  }

  async uploadGstr1(params: {
    gstin: string;
    period: string;
    payload: unknown;
    environment: 'SANDBOX' | 'PRODUCTION';
    authToken: string;
  }): Promise<GstFilingSubmissionResult> {
    // 1. Map payload to ClearTax GSTR-1 JSON schema
    // 2. Post to provider endpoint
    // 3. Return referenceId, status, and preliminary ARN if synchronous
  }

  async checkFilingStatus(params: {
    gstin: string;
    referenceId: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    authToken: string;
  }): Promise<{ status: string; arn?: string; errors?: string[] }> {
    // Poll provider status endpoint
  }
}
```

### Step 3: Register the Adapter in Gateway Service
In `nafid-server/src/services/gst/gstGatewayService.ts`:
Replace the disabled adapter instantiation for that provider with your concrete adapter class:
```typescript
// Register concrete adapter
this.adapters.set('CLEAR_TAX', new ClearTaxGspAdapter());
```

### Step 4: Update Provider Registry Status
In `nafid-server/src/services/gst/providerRegistry.ts`:
Change the provider's status from `'READINESS'` to `'ACTIVE'`:
```typescript
{
  id: 'CLEAR_TAX',
  name: 'ClearTax (Defmacro Technologies)',
  status: 'ACTIVE',
  ...
}
```

### Step 5: Execute Sandbox Verification
1. Open Super Admin Console -> **Managed GSP** -> Select **Sandbox** -> Enter Sandbox Client ID & Secret -> Save.
2. Open a test shop in NAFID POS -> **GST Reports** -> **GSP Settings** -> Click **Test GSP Gateway Readiness**.
3. Verify that the sandbox handshake returns `200 OK`.
4. Run integration tests:
   ```powershell
   cd nafid-server
   pnpm test
   ```

### Step 6: Deploy & Rotate Keys
Once sandbox tests pass, configure production credentials securely in Super Admin Console or via environment secrets (`GST_VAULT_KEY`). No desktop Electron client rebuild or store-side re-installation is required!
