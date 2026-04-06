# PARMS-IBMS API Integration Reference
 
Last updated: 2026-04-05
 
This document is the source-of-truth API contract for PARMS billing integration with IBMS.
 
## 1. Integration Topology
 
PARMS and IBMS communicate in both directions:
 
- IBMS -> PARMS (required): payment status webhook callback to PARMS.
- PARMS -> IBMS (required): billing intent submission and invoice reconciliation fetch.
 
For integration to work end-to-end, both directions must be implemented and configured.
 
## 2. IBMS -> PARMS Required Endpoint
 
### 2.1 Payment Status Sync Webhook
 
- Method: PATCH
- Path: /api/v1/billing/ibms/sync
- Auth model: shared token + HMAC signature + timestamp freshness + event id idempotency
- Content-Type: application/json
 
This endpoint is mounted in:
- backend/routes/billing.route.js
- backend/controllers/billing.controller.js
 
### 2.2 Required Headers
 
| Header | Required | Description |
|---|---|---|
| X-IBMS-Token | Yes | Must exactly match PARMS server value in IBMS_SYNC_TOKEN. |
| X-IBMS-Event-Id | Yes | Unique event id per webhook delivery logical event. Used for idempotency. |
| X-IBMS-Timestamp | Yes | Unix epoch seconds. Must be within allowed skew window. |
| X-IBMS-Signature | Yes | HMAC-SHA256 of raw request body, hex digest. Prefix sha256= is accepted but optional. |
| Content-Type | Yes | application/json |
 
Important:
- Signature is validated against the exact raw body bytes.
- Timestamp skew is enforced with IBMS_WEBHOOK_MAX_SKEW_SECONDS (default 300 seconds).
 
### 2.3 Signature Formula
 
- Algorithm: HMAC-SHA256
- Input key: IBMS_WEBHOOK_SIGNING_SECRET
- Input message: raw JSON request body exactly as sent
- Output: lowercase hex digest
 
Accepted header value forms:
- <hex>
- sha256=<hex>
 
### 2.4 Webhook Request Body Contract
 
The payload must include at least one selector and a status:
 
- Required:
  - status (string)
- At least one of:
  - billingId (Mongo ObjectId string)
  - invoiceNumber (string)
  - ibmsReference (string)
 
Optional fields:
 
- eventType (string)
- ibmsStatus (one of: draft, queued, submitted, pending, processing, synced, failed, cancelled, refunded)
- errorMessage (string)
- paidAt (ISO date-time or null)
- processedAt (ISO date-time or null)
- currency (3-letter code)
- totalAmountMinor, amountPaidMinor, balanceDueMinor (integer minor units)
- totalAmount, amountPaid, balanceDue (major units, decimal)
 
Status normalization accepted by PARMS:
 
- pending -> pending
- queued -> pending
- processing -> processing
- in_progress -> processing
- paid -> paid
- completed -> paid
- failed -> failed
- cancelled -> cancelled
- canceled -> cancelled
- refunded -> refunded
 
### 2.5 Sample Webhook Payload
 
```json
{
  "ibmsReference": "IBMS-INV-2026-000421",
  "status": "completed",
  "ibmsStatus": "synced",
  "eventType": "invoice.payment.updated",
  "processedAt": "2026-04-05T08:30:00.000Z",
  "paidAt": "2026-04-05T08:29:41.000Z",
  "currency": "PHP",
  "totalAmountMinor": 150000,
  "amountPaidMinor": 150000,
  "balanceDueMinor": 0
}
```
 
### 2.6 Response Semantics (Must Not Be Ignored)
 
| HTTP | Meaning | IBMS Action |
|---|---|---|
| 200 | Event processed successfully | Mark delivery successful. |
| 200 | Duplicate event already processed | Treat as success, do not resend as new event. |
| 200 | Stale out-of-order event ignored | Treat as success, do not retry this stale event. |
| 400 | Validation error (bad payload/header format) | Fix payload/header format, then resend with corrected data. |
| 401 | Unauthorized (bad token/signature/timestamp skew) | Fix credentials/signing/timestamp source before retrying. |
| 404 | Billing record not found by selector | Retry later only if eventual consistency is expected. |
| 409 | Same event id with different payload hash | Contract violation. Do not retry blindly; investigate producer bug. |
| 503 | Server missing required security config | Coordinate with PARMS ops to fix environment config. |
 
Idempotency behavior:
- Same X-IBMS-Event-Id + same payload hash is treated as duplicate/safe.
- Same X-IBMS-Event-Id + different payload hash returns 409 conflict.
 
Ordering behavior:
- Older event (based on processedAt or timestamp header) than last processed event is ignored as stale.
 
## 3. PARMS -> IBMS Required Endpoints (IBMS Must Expose)
 
PARMS calls IBMS through these endpoints from backend/services/ibmsHttpClient.service.js.
 
### 3.1 Upsert Billing Intent
 
- Method: POST
- Path: /api/v1/integrations/parms/billing-intents
- Called by PARMS when billing intent is created or revised.
 
Headers PARMS sends:
- Authorization: Bearer <IBMS_INTEGRATION_TOKEN>
- Content-Type: application/json
- X-Idempotency-Key: PARMS-BILLING-<billingId>-v<revision>
- X-Correlation-Id: <request-id> (when available)
 
Minimum expected request structure:
 
```json
{
  "intent_id": "<parms-billing-id>",
  "encounter_id": "<appointment-or-billing-id>",
  "patient": {
    "parms_patient_id": "<parms-patient-id>",
    "external_patient_code": "<mrn>",
    "first_name": "Juan",
    "last_name": "Dela Cruz",
    "full_name": "Juan Dela Cruz"
  },
  "service_lines": [
    {
      "line_id": "svc-1",
      "parms_service_code": "CONSULT-GEN-OPD",
      "service_type": "consultation",
      "quantity": 1,
      "metadata": {
        "provider_id": "<doctor-id>",
        "provider_name": "Dr. Sample Name"
      }
    }
  ],
  "prescription_lines": [],
  "encounter_completed_at": "2026-04-05T08:00:00.000Z",
  "submitted_at": "2026-04-05T08:01:00.000Z",
  "idempotency_key": "PARMS-BILLING-<billingId>-v1"
}
```
 
Patient and pharmacy requirements (must implement on IBMS side):
 
- IBMS must ingest and index `patient.full_name` (and/or first/last name fields) so staff can search patients by name in IBMS.
- `patient.parms_patient_id` and `patient.external_patient_code` (MRN) must be stored as stable cross-system identifiers.
- `prescription_lines[].generic_name` is the doctor-prescribed generic medicine from PARMS.
- IBMS pharmacy workflow should map this generic name to available brand options at dispense time.
- IBMS should retain both the selected brand and original generic name for traceability/audit.
 
Example pharmacy mapping flow (IBMS side):
 
```json
{
  "patient": {
    "parms_patient_id": "67f0123abcde901234567890",
    "external_patient_code": "MRN-000421",
    "full_name": "Juan Dela Cruz"
  },
  "prescription_lines": [
    {
      "rx_id": "67f0222abcde901234567891",
      "generic_name": "amoxicillin",
      "dosage": "500 mg",
      "frequency": "3 times daily"
    }
  ],
  "ibms_pharmacy_selection": [
    {
      "rx_id": "67f0222abcde901234567891",
      "generic_name": "amoxicillin",
      "selected_brand": "Amoxil",
      "selected_brand_sku": "PHARM-AMX-500-001"
    }
  ]
}
```
 
Minimum persistence recommended on IBMS:
 
- Keep `rx_id`, `generic_name`, and selected brand fields in the same transaction record.
- Keep patient searchable by `full_name` and linked by `parms_patient_id` and MRN.
 
IBMS response should return a projection object that includes enough invoice/payment data for PARMS to update:
- ibms_reference
- ibms_invoice_id
- ibms_invoice_number
- invoice_status
- payment_status
- totals: subtotal_minor, discount_minor, tax_minor, total_minor, amount_paid_minor, balance_due_minor
- currency
- paid_at (when applicable)
- priced_lines (when applicable)
 
Prescription line expectation:
 
- IBMS must accept and persist `generic_name` per prescription line.
- `medication_name` is provided for backward compatibility and may mirror `generic_name`.
 
### 3.2 Fetch Invoice by IBMS Reference
 
- Method: GET
- Path: /api/v1/integrations/parms/invoices/{ibmsReference}
- Called by PARMS for reconciliation pulls.
 
Headers PARMS sends:
- Authorization: Bearer <IBMS_INTEGRATION_TOKEN>
- X-Correlation-Id: <request-id> (when available)
 
Response should include the same projection fields listed in 3.1.
 
## 4. Required Environment Configuration
 
### 4.1 PARMS Backend (must be set)
 
- IBMS_SYNC_TOKEN
- IBMS_WEBHOOK_SIGNING_SECRET
- IBMS_WEBHOOK_MAX_SKEW_SECONDS (optional override; defaults to 300)
- IBMS_INTEGRATION_BASE_URL
- IBMS_INTEGRATION_TOKEN
- IBMS_HTTP_TIMEOUT_MS
- IBMS_HTTP_MAX_RETRIES
- IBMS_INVOICE_BASE_URL (for UI invoice links)
 
### 4.2 IBMS Side (must match PARMS)
 
- Use same shared token value as PARMS IBMS_SYNC_TOKEN.
- Use same signing secret value as PARMS IBMS_WEBHOOK_SIGNING_SECRET.
- Ensure webhook sender clock is NTP-synchronized to avoid timestamp skew rejection.
 
## 5. Non-Negotiable Go-Live Checklist
 
1. IBMS webhook sender includes all required headers in section 2.2.
2. IBMS signs the raw body exactly as sent.
3. IBMS sends unique X-IBMS-Event-Id per logical event.
4. IBMS sends at least one selector (billingId or invoiceNumber or ibmsReference).
5. IBMS status values are within accepted mapping in section 2.4.
6. IBMS exposes both PARMS-consumed endpoints in section 3.
7. PARMS and IBMS tokens/secrets are configured and identical where required.
8. IBMS handles 200 duplicate and 200 stale responses as successful terminal outcomes.
9. Retry policy avoids changing payload for a previously-used event id.
10. End-to-end test passes: intent submit -> IBMS invoice creation -> webhook paid update -> PARMS reflects paid state.
11. IBMS user can search patient by name using data ingested from PARMS billing intent payload.
12. IBMS pharmacy can map generic prescription name to selected brand while preserving original generic reference.
 
## 6. Suggested Retry Policy for IBMS Webhook Sender
 
- Retry on: 408, 429, 500, 502, 503, 504, and network timeouts.
- Do not retry without manual investigation on: 400, 401, 409.
- On 404, retry only if record creation race is possible; otherwise investigate selector mismatch.
- Reuse the same X-IBMS-Event-Id and same payload for retries of the same event.
 
## 7. Notes on Internal PARMS Endpoints
 
The following are internal PARMS operations endpoints and are not required for IBMS direct calls:
 
- POST /api/v1/billing/reconcile-all
- POST /api/v1/billing/:id/reconcile
- GET /api/v1/billing/integration/metrics
 
These are used by PARMS frontdesk/admin workflows, not by IBMS webhook producers.