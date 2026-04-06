# PARMS <-> IBMS Billing Integration Specification
 
Version: 1.0  
Date: 2026-04-04  
Owners: PARMS Backend, PARMS Frontend, IBMS Integration Team
 
## 1. Objective
 
Define a production-grade integration between PARMS and IBMS so that:
 
- PARMS contributes billable context (encounter, service lines, prescription context).
- IBMS is the source of truth for pricing, invoice totals, and payment status.
- Cashier workflow is reliable, auditable, and near real-time.
 
This specification includes:
 
- API contracts (PARMS -> IBMS and IBMS -> PARMS)
- Billing state machine and idempotency rules
- A phased implementation plan mapped to current PARMS files and endpoints
 
## 2. Current-State Assessment (As-Is)
 
### 2.1 What Exists Today
 
- Billing record creation is triggered when consultation is completed/locked.
- PARMS stores service type, prescription links, and sync/payment status fields.
- PARMS exposes billing APIs for list/detail/update and IBMS callback sync.
- Patient UI shows synchronized billing records and statuses.
 
### 2.2 Gaps and Risks
 
- Outbound handoff to IBMS is a placeholder and not a real API/queue integration.
- Pricing contract is missing (no guaranteed item/price authority from IBMS).
- GET billing endpoint performs write side effects (backfill), which is operationally risky.
- Prescription linkage can attach to the latest pending billing record instead of exact encounter.
- Manual payment status edits in PARMS can conflict with IBMS source-of-truth.
- Callback security is token-only; lacks replay protection and event idempotency.
- Invoice numbering and money arithmetic patterns need hardening for production finance use.
 
## 3. Target Operating Model (To-Be)
 
### 3.1 Source of Truth Split
 
- PARMS owns: clinical/encounter context and bill intent submission.
- IBMS owns: prices, line totals, discounts, taxes, payment collection, final settlement.
 
### 3.2 Cashier Workflow
 
1. Doctor completes consultation in PARMS.
2. PARMS submits Billing Intent to IBMS (idempotent).
3. IBMS creates/updates invoice and returns authoritative totals.
4. PARMS marks record "ready for cashier" and displays IBMS reference.
5. Cashier collects payment in IBMS.
6. IBMS sends signed payment events to PARMS.
7. PARMS mirrors status for portals, notifications, and audit.
 
## 4. Canonical Data Model (Integration Level)
 
### 4.1 PARMS Billing Intent (Outbound)
 
- intent_id: PARMS billing record id
- idempotency_key: deterministic key for safe retries
- encounter_id: appointment id (or medical record id fallback)
- patient:
  - parms_patient_id
  - external_patient_code (optional if IBMS already maps PARMS patient)
- service_lines[]:
  - line_id
  - parms_service_code
  - service_type (consultation, laboratory, procedure, pharmacy, other)
  - quantity
  - metadata (provider, timestamp, notes)
- prescription_lines[]:
  - line_id
  - rx_id
  - medication_name
  - dosage
  - frequency
  - duration_days
  - quantity (optional)
- timestamps:
  - encounter_completed_at
  - submitted_at
 
### 4.2 IBMS Invoice Projection (Inbound to PARMS)
 
- ibms_invoice_id
- ibms_invoice_number
- ibms_reference
- invoice_status
- payment_status
- currency
- priced_lines[]:
  - line_id (mirrors outbound line if possible)
  - ibms_item_code
  - description
  - quantity
  - unit_price_minor
  - line_total_minor
- totals:
  - subtotal_minor
  - discount_minor
  - tax_minor
  - total_minor
  - amount_paid_minor
  - balance_due_minor
- payment:
  - paid_at
  - payment_method (cash, card, wallet, split)
- synchronization:
  - event_id
  - event_type
  - event_created_at
 
Use minor units for money (for example, cents) to avoid floating-point errors.
 
## 5. API Contracts
 
## 5.1 PARMS -> IBMS: Create or Upsert Invoice
 
Endpoint (IBMS): `POST /api/v1/integrations/parms/billing-intents`
 
Headers:
 
- `Authorization: Bearer <integration-token>`
- `Content-Type: application/json`
- `X-Idempotency-Key: <idempotency_key>`
- `X-Correlation-Id: <request_id>`
 
Request body example:
 
```json
{
  "intent_id": "67f0123abcde901234567890",
  "idempotency_key": "PARMS-BILLING-67f0123abcde901234567890-v1",
  "encounter_id": "67f01111abcd901234567111",
  "patient": {
    "parms_patient_id": "67f000001111222233334444",
    "external_patient_code": "PARMS-MRN-240001"
  },
  "service_lines": [
    {
      "line_id": "svc-1",
      "parms_service_code": "CONSULT-GEN-OPD",
      "service_type": "consultation",
      "quantity": 1,
      "metadata": {
        "provider_id": "67d0aaaa1111222233334444",
        "provider_name": "Dr. Jane Doe",
        "notes": "General consultation"
      }
    }
  ],
  "prescription_lines": [
    {
      "line_id": "rx-1",
      "rx_id": "67f099991111222233334444",
      "medication_name": "Amoxicillin",
      "dosage": "500 mg",
      "frequency": "TID",
      "duration_days": 7
    }
  ],
  "encounter_completed_at": "2026-04-04T09:21:13.000Z",
  "submitted_at": "2026-04-04T09:21:14.120Z"
}
```
 
Success response example:
 
```json
{
  "success": true,
  "data": {
    "ibms_invoice_id": "inv_6f9a2c",
    "ibms_invoice_number": "IBMS-2026-004291",
    "ibms_reference": "IBMS-2026-004291",
    "invoice_status": "open",
    "payment_status": "pending",
    "currency": "PHP",
    "priced_lines": [
      {
        "line_id": "svc-1",
        "ibms_item_code": "SV-1001",
        "description": "General Consultation",
        "quantity": 1,
        "unit_price_minor": 50000,
        "line_total_minor": 50000
      }
    ],
    "totals": {
      "subtotal_minor": 50000,
      "discount_minor": 0,
      "tax_minor": 0,
      "total_minor": 50000,
      "amount_paid_minor": 0,
      "balance_due_minor": 50000
    }
  }
}
```
 
Error responses:
 
- 400 validation_error
- 401/403 unauthorized
- 409 idempotency_conflict
- 422 mapping_error (unknown service code)
- 503 upstream_unavailable
 
### 5.2 IBMS -> PARMS: Billing Event Webhook
 
Endpoint (PARMS): `PATCH /api/v1/billing/ibms/sync`
 
Headers:
 
- `Content-Type: application/json`
- `X-IBMS-Token: <shared-token>` (existing)
- `X-IBMS-Event-Id: <unique-event-id>`
- `X-IBMS-Signature: <hmac-sha256(payload)>`
- `X-IBMS-Timestamp: <unix-epoch-seconds>`
 
Request body example:
 
```json
{
  "billingId": "67f0123abcde901234567890",
  "invoiceNumber": "BLG-2026-00123",
  "ibmsReference": "IBMS-2026-004291",
  "status": "paid",
  "ibmsStatus": "synced",
  "errorMessage": null,
  "paidAt": "2026-04-04T09:31:40.000Z",
  "processedAt": "2026-04-04T09:31:42.000Z",
  "totalAmountMinor": 50000,
  "amountPaidMinor": 50000,
  "balanceDueMinor": 0,
  "currency": "PHP"
}
```
 
Success response example:
 
```json
{
  "success": true,
  "message": "IBMS billing status synchronized successfully.",
  "data": {
    "billingId": "67f0123abcde901234567890",
    "paymentStatus": "paid",
    "ibmsStatus": "synced"
  }
}
```
 
Mandatory webhook validation rules:
 
- Reject if timestamp skew > 300 seconds.
- Reject if signature is invalid.
- Reject duplicate `X-IBMS-Event-Id` unless exact same payload hash.
- Persist event log before mutating billing record.
 
### 5.3 PARMS -> IBMS: Optional Reconciliation Pull
 
Endpoint (IBMS): `GET /api/v1/integrations/parms/invoices/{ibms_reference}`
 
Purpose:
 
- Manual reconciliation when webhook delivery is delayed or failed.
- Support frontdesk "resync" action without manual payment edits.
 
## 6. Billing State Machine
 
### 6.1 States
 
PARMS local state should mirror but never override IBMS truth.
 
- draft: intent assembled but not yet submitted
- queued: submission queued for IBMS
- submitted: accepted by IBMS (invoice created)
- pending: awaiting payment
- processing: payment in progress
- paid: fully settled
- failed: integration or processing failed
- cancelled: voided/cancelled
- refunded: paid then refunded (optional phase 2)
 
### 6.2 Allowed Transitions
 
- draft -> queued
- queued -> submitted
- submitted -> pending
- pending -> processing
- processing -> paid
- processing -> failed
- pending -> cancelled
- paid -> refunded
- Any non-terminal state -> failed (integration failure)
 
Disallow direct transition:
 
- pending -> paid without IBMS event
- failed -> paid without successful resubmission and new IBMS event
 
### 6.3 Event Mapping
 
- `invoice.created` -> submitted/pending
- `payment.processing` -> processing
- `payment.completed` -> paid
- `payment.failed` -> failed
- `invoice.cancelled` -> cancelled
- `payment.refunded` -> refunded
 
## 7. Idempotency and Consistency Rules
 
### 7.1 Outbound (PARMS -> IBMS)
 
Idempotency key format:
 
- `PARMS-BILLING-{billingId}-v{revision}`
 
Rules:
 
- Same key + same payload: return prior success response (safe retry).
- Same key + different payload: 409 conflict.
- Revisions increment only when line items are intentionally changed.
 
### 7.2 Inbound (IBMS -> PARMS)
 
Rules:
 
- `event_id` is globally unique per IBMS event.
- PARMS stores processed event IDs in an event log collection/table.
- If duplicate `event_id` arrives, return 200 with "already processed" and do nothing.
- Apply updates only when event timestamp is newer than record's last synced event.
 
### 7.3 Concurrency and Ordering
 
- Use optimistic locking or version checks on billing record updates.
- Ignore out-of-order stale events.
- Never recalculate paid totals in PARMS if IBMS sent authoritative totals.
 
## 8. Security and Compliance Controls
 
- Keep token check (`X-IBMS-Token`) for backward compatibility.
- Add HMAC payload signature verification (`X-IBMS-Signature`).
- Enforce timestamp freshness window.
- Store raw webhook payload, headers, and verification result for audit.
- Redact protected health data from integration logs unless required.
- Track correlation id across PARMS request logs and IBMS interactions.
 
## 9. Non-Functional Requirements
 
- End-to-end handoff latency target: <= 5 seconds p95
- Webhook processing latency target: <= 3 seconds p95
- Duplicate invoice creation rate: 0
- Billing event loss: 0 (at-least-once delivery + idempotent processing)
- Availability target for billing integration path: >= 99.5%
 
## 10. Phased Implementation Plan (Mapped to Current Codebase)
 
## Phase 0: Contract and Governance (1-2 days)
 
Scope:
 
- Finalize service code mapping between PARMS and IBMS.
- Align webhook headers and signature algorithm.
- Define error code matrix and retry policy.
 
Deliverables:
 
- Signed API contract with IBMS team.
- Service code mapping table owned by operations.
 
## Phase 1: Harden Existing PARMS Billing Flow (2-4 days)
 
Backend changes:
 
- Replace placeholder handoff in backend/services/ibmsBilling.service.js with real HTTP client integration.
- Remove side-effect backfill from GET billing list in backend/controllers/billing.controller.js.
- Restrict manual payment updates in backend/routes/billing.route.js to reconciliation-only actions.
- Add strict validation for minor-unit money fields (integer) in billing routes/controller.
- Replace count-based invoice number strategy in backend/models/billing.model.js with collision-safe sequence/UUID-backed strategy.
 
Acceptance criteria:
 
- No billing records created by read/list endpoints.
- Each completed consultation produces one stable billing intent.
- Payment status updates from IBMS path only (except privileged break-glass admin route).
 
## Phase 2: Implement Reliable Outbound Integration (3-5 days)
 
Backend changes:
 
- Extend backend/services/appointmentBilling.service.js to build full Billing Intent payload.
- Call IBMS create/upsert endpoint with idempotency key and correlation id.
- Persist ibms_invoice_id, ibms_reference, and priced totals in minor units.
- Add retry with exponential backoff for transient failures.
 
Recommended new module:
 
- backend/services/ibmsHttpClient.service.js (token auth, retry, timeout, error normalization)
 
Acceptance criteria:
 
- Retry-safe invoice creation with no duplicates.
- PARMS billing record reflects IBMS reference and totals after submission.
 
## Phase 3: Secure and Idempotent Webhook Processing (3-4 days)
 
Backend changes:
 
- Enhance backend/routes/billing.route.js + controller webhook path:
  - verify signature
  - verify timestamp
  - enforce event idempotency
- Add event log model for inbound webhook events.
- Reject stale/out-of-order events safely.
 
Recommended new module:
 
- backend/models/billingEventLog.model.js
 
Acceptance criteria:
 
- Duplicate webhook events do not mutate state twice.
- Invalid signature or stale timestamp requests are rejected.
 
## Phase 4: Cashier and Frontdesk Experience Alignment (2-4 days)
 
Frontend changes:
 
- Add frontdesk billing reconciliation actions (sync now, view IBMS invoice link/reference).
- Hide direct payment status editing in PARMS UI.
- Keep patient view read-only and sourced from synchronized status.
 
Suggested frontend files:
 
- frontend/src/services/BillingService.js
- frontend/src/pages/staff-portal (billing/admin view page)
- frontend/src/pages/patient/BillingEnhanced.jsx (minor UX updates for status clarity)
 
Acceptance criteria:
 
- Frontdesk can request re-sync but cannot override IBMS payment truth.
- Patient sees accurate near real-time status and IBMS reference.
 
## Phase 5: Reconciliation and Monitoring (2-3 days)
 
Backend changes:
 
- Add reconciliation job to compare PARMS pending records against IBMS invoice state.
- Add metrics and dashboard endpoints for integration health.
 
Suggested additions:
 
- backend/jobs/billingReconciliation.job.js
- backend/routes/system.route.js (trigger endpoint if needed)
 
Acceptance criteria:
 
- Stuck records are detected automatically.
- Team can monitor sync success, failures, and latency.
 
## 11. Endpoint and File Mapping Summary
 
Current endpoints to keep:
 
- `PATCH /api/v1/billing/ibms/sync` (harden with signature/idempotency)
- `POST /api/v1/billing` (keep for explicit billing intent creation if needed)
- `GET /api/v1/billing` and `GET /api/v1/billing/:id` (read-only, no writes)
 
Current triggers that must remain single source for intent creation:
 
- `PATCH /api/v1/medical-records/:id/lock`
- `PATCH /api/v1/appointments/:id/status` when status = completed
 
Primary PARMS files impacted:
 
- backend/services/ibmsBilling.service.js
- backend/services/appointmentBilling.service.js
- backend/controllers/billing.controller.js
- backend/routes/billing.route.js
- backend/models/billing.model.js
- backend/controllers/prescription.controller.js
- frontend/src/services/BillingService.js
- frontend/src/pages/patient/BillingEnhanced.jsx
 
## 12. Test Strategy
 
### 12.1 Unit Tests
 
- Status transition validation
- Idempotency key generation and conflict detection
- Webhook signature validation
- Event deduplication logic
 
### 12.2 Integration Tests
 
- Completed consultation -> billing intent submitted -> IBMS response persisted
- Webhook duplicate delivery -> single state mutation
- Stale webhook event -> ignored/rejected
 
### 12.3 UAT Scenarios
 
- Patient completes consultation and appears in cashier queue within SLA
- Cashier records payment in IBMS and patient portal reflects paid status
- Temporary IBMS outage and subsequent successful retry
 
## 13. KPIs and Success Metrics
 
- Billing intent submission success rate >= 99.5%
- Webhook verification failure rate < 0.1%
- Median sync delay from IBMS payment to PARMS update <= 60 seconds
- Manual reconciliation volume reduced by >= 80% from baseline
- Duplicate billing incidents = 0
 
## 14. Open Decisions Required
 
- Final canonical list of PARMS service codes and IBMS item mappings
- Whether pharmacy pricing must always be resolved at dispensing time in IBMS
- Whether partial payments and installment handling are required in phase 1
- Final retention policy for webhook payload audit logs
 
## 15. Execution Notes for This Repository
 
- Keep API versioning under `/api/v1/*`.
- Preserve existing route-controller-service layering.
- Use existing validation and centralized error middleware patterns.
- Keep PARMS and frontend role semantics unchanged.
- Ensure all new integrations are compatible with current multi-database setup and environment validation.