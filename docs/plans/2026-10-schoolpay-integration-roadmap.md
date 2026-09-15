# Future Plan: SchoolPay Uganda Integration

> **Target Phase:** Post-Phase 8 / Payments & Collections Upgrade  
> **Full Architecture Blueprint:** [docs/architecture/schoolpay-integration-roadmap.md](../architecture/schoolpay-integration-roadmap.md)  
> **Official API Reference:** [SchoolPay Uganda API Documentation](https://www.schoolpay.co.ug/apidocumentation)

---

## 1. Objective

Integrate SchoolPay Uganda into SomaCampus to automate fee collections across MTN Mobile Money, Airtel Money, and major Ugandan commercial bank agent networks, eliminating manual deposit slip reconciliation and providing instant fee receipts.

---

## 2. Key Architecture Pillars

1. **Dual-Path Reliability Architecture**:
   - **Path 1 (Push / Real-Time)**: Inbound Webhook (`/functions/v1/schoolpay-webhook`) with SHA-256 HMAC signature verification (`SHA256(password + receiptNumber)`). Processes payments in < 800ms.
   - **Path 2 (Pull / Reconciliation)**: Automated daily and hourly sync cron via SchoolPay AndroidRS API (`SyncSchoolTransactions` & `SchoolRangeTransactions` with MD5 token verification). Guarantees zero lost transactions even if SchoolPay drops webhooks.

2. **Atomic PostgreSQL Ingestion**:
   - All inbound payments execute via `public.record_fee_payment(p_school_id, p_student_id, p_amount, ...)` in a single transaction.
   - Automatic cascade across oldest-due `student_charges`.
   - Overpayments safely retained as `unallocated_amount` credit.
   - Immutable entries in `financial_audit_logs`.

3. **Production Trust Gate Compliance**:
   - Zero mock data or in-memory arrays.
   - Server-side cryptography only: secrets held in Supabase Vault / Edge Function environment variables, never sent to Vite browser client.
   - Soft-archival, immutable receipts, and tenant isolation via `has_school_finance_access`.

---

## 3. Implementation Steps (When Activated)

- **Step 1: Database Migration**:
  - Add `schoolpay_school_code` to `schools`.
  - Add `schoolpay_payment_code` to `students` (unique per school).
  - Add `schoolpay_receipt_number` to `fee_payments` (unique external index).
  - Create `schoolpay_sync_audit_logs` table with finance RLS.
- **Step 2: Supabase Edge Functions**:
  - `supabase/functions/schoolpay-webhook/index.ts` (instant ingestion).
  - `supabase/functions/schoolpay-reconcile/index.ts` (batch sync & deduplication).
  - Configure `pg_cron` schedule for automated pull.
- **Step 3: Bursar Cockpit Integration**:
  - Add SchoolPay connection health and sync status card to `/fees`.
  - Add "Unmatched Payments" queue to resolve orphan transactions.
- **Step 4: Parent Portal Experience**:
  - Prominently display pupil's SchoolPay code on `/parent/home`.
  - Add "Pay via Mobile Money" button triggering SchoolPay Adhoc USSD prompt (STK Push).
- **Step 5: Verification & Testing**:
  - Automated test suite covering signature validation, duplicate discarding, and reconciliation matching.

---

*Refer to [docs/architecture/schoolpay-integration-roadmap.md](../architecture/schoolpay-integration-roadmap.md) for full endpoint specifications, payload JSON schemas, cryptographic formulas, and entity relationship diagrams.*
