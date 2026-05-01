# Inventory and Billing Management System (IBMS)
## Database Data Dictionary

**Document Version:** 1.0  
**Last Updated:** April 28, 2026  
**Database Type:** MongoDB  
**System:** Inventory and Billing Management System (IBMS)

---

## Table of Contents
1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Collections Dictionary](#collections-dictionary)
4. [Data Standards](#data-standards)

---

## Overview

This document defines the structure, content, format, and usage of IBMS database collections. The IBMS is a comprehensive system for managing inventory, billing, and user operations with support for integration with PARMS (Patient Records and Medical Services) system.

### Key Features:
- **Dual-role system:** Owner and Staff users
- **Inventory management:** Products, batches, stock logs
- **Billing system:** Transactions with PARMS integration
- **Request management:** Stock requests, inventory requests, price changes
- **Audit trails:** Activity logs and disposal logs
- **Archive support:** Historical data retention

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER                                 │
│  ─────────────────────────────────────────────────────────  │
│  Roles: Owner, Staff                                         │
│  Status: Active, Suspended                                   │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴─────────┬──────────┬──────────┬───────────┐
    │                  │          │          │           │
    ▼                  ▼          ▼          ▼           ▼
┌────────────┐  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
│  PRODUCT   │  │TRANSACTION│ │ STOCK   │ │ACTIVITY│ │DISPOSAL  │
│            │  │          │ │ REQUEST │ │  LOG   │ │   LOG    │
└────┬───────┘  └──────────┘ └─────────┘ └────────┘ └──────────┘
     │                                                     
     ├─────────────────────────────────────────────────────┐
     │                                                     │
     ▼                                                     ▼
┌──────────────────┐                        ┌──────────────────┐
│ INVENTORY_BATCH  │                        │   ARCHIVED_      │
│                  │                        │   PRODUCT        │
└──────────────────┘                        └──────────────────┘
     │
     │
     ▼
┌─────────────────┐
│ BILLING_        │
│ TRANSACTION     │
└─────────────────┘
```

---

## Collections Dictionary

### 1. USER

**Description:** Stores user account information including staff and owner profiles with authentication and role management.

**Collection Name:** `users`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `name` | String | ✗ | ✗ | null | User's full name |
| `email` | String | ✓ | ✓ | - | User's email address (lowercase, unique) |
| `hrmsId` | String | ✗ | ✗ | null | HRMS system identifier (indexed, sparse) |
| `password` | String | ✓ | ✗ | - | Hashed password for authentication |
| `role` | String | ✓ | ✗ | - | User's system role: `owner`, `staff` |
| `status` | String | ✗ | ✗ | active | Account status: `active`, `suspended` (indexed) |
| `isActive` | Boolean | ✗ | ✗ | true | Whether account is active |
| `archivedAt` | Date | ✗ | ✗ | null | Timestamp when user was archived |
| `archiveReason` | String | ✗ | ✗ | null | Reason for archiving the user account |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Account creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{email: 1}` (unique)
- `{hrmsId: 1}` (sparse)
- `{status: 1}`

**Notes:**
- Email is case-insensitive and trimmed
- `hrmsId` is sparse indexed for optional integration with HRMS

---

### 2. PRODUCT

**Description:** Core inventory items including medicines, supplies, and other products with pricing, expiry tracking, and stock status.

**Collection Name:** `products`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `name` | String | ✓ | ✗ | - | Product name |
| `category` | String | ✓ | ✗ | - | Product category |
| `quantity` | Number | ✓ | ✗ | - | Current stock quantity (min: 0) |
| `unitPrice` | Number | ✗ | ✗ | 0 | Price per unit (min: 0) |
| `unit` | String | ✗ | ✗ | pcs | Unit of measurement (e.g., pcs, box, bottle) |
| `minStock` | Number | ✗ | ✗ | 10 | Minimum stock threshold (min: 0) |
| `supplier` | String | ✗ | ✗ | null | Supplier name |
| `description` | String | ✗ | ✗ | "" | Product description |
| `genericName` | String | ✗ | ✗ | null | Generic name (for medicines) |
| `brandName` | String | ✗ | ✗ | null | Brand name (for medicines) |
| `dosageForm` | String | ✗ | ✗ | null | Dosage form (e.g., tablet, capsule) |
| `strength` | String | ✗ | ✗ | null | Medication strength |
| `medicineName` | String | ✗ | ✗ | null | Medicine name |
| `expiryDate` | Date | ✗ | ✗ | null | Product expiration date |
| `batchNumber` | String | ✗ | ✗ | null | Batch or lot number |
| `status` | String | ✗ | ✗ | available | Stock status: `available`, `low`, `out` |
| `physicalCount` | Number | ✗ | ✗ | null | Physical inventory count (min: 0) |
| `expectedRemaining` | Number | ✗ | ✗ | null | Expected remaining quantity (min: 0) |
| `variance` | Number | ✗ | ✗ | 0 | Difference between expected and physical count |
| `discrepancyStatus` | String | ✗ | ✗ | Balanced | Status: `Balanced`, `With Variance` |
| `isArchived` | Boolean | ✗ | ✗ | false | Whether product is archived |
| `archivedAt` | Date | ✗ | ✗ | null | Archive timestamp |
| `archivedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who archived the product |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{status: 1, isArchived: 1, quantity: 1}` (compound)

**Status Auto-update Logic:**
- If `quantity <= 0`: status = "out"
- If `quantity <= minStock`: status = "low"
- Otherwise: status = "available"

**Notes:**
- Status is automatically updated before saving based on quantity
- Supports medical/pharmaceutical product attributes

---

### 3. TRANSACTION

**Description:** Point-of-sale transactions recording product sales, payment methods, and transaction details.

**Collection Name:** `transactions`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `transactionNo` | String | ✓ | ✓ | - | Unique transaction number |
| `items` | Array | ✓ | ✗ | - | Array of transaction items (see items schema) |
| `items[].product` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product |
| `items[].quantity` | Number | ✓ | ✗ | - | Quantity sold (min: 1) |
| `items[].price` | Number | ✓ | ✗ | - | Price per unit (min: 0) |
| `totalAmount` | Number | ✓ | ✗ | - | Total transaction amount (min: 0) |
| `processedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who processed the transaction |
| `paymentMethod` | String | ✗ | ✗ | cash | Payment method: `cash`, `gcash`, `card` |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Transaction timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{transactionNo: 1}` (unique)
- `{processedBy: 1, createdAt: -1}` (compound)

**Notes:**
- Immutable record of sales transactions
- Items include product reference, quantity, and price

---

### 4. INVENTORY_BATCH

**Description:** Batch-level inventory tracking with expiry dates, source tracking, and batch-specific status management.

**Collection Name:** `inventorybatches`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `product` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product (indexed) |
| `batchNumber` | String | ✓ | ✗ | - | Batch/lot number (indexed, trimmed) |
| `quantity` | Number | ✓ | ✗ | - | Quantity in batch (min: 0) |
| `currentQuantity` | Number | ✓ | ✗ | - | Current remaining quantity (min: 0, indexed) |
| `initialQuantity` | Number | ✓ | ✗ | - | Initial quantity when created (min: 0) |
| `expiryDate` | Date | ✗ | ✗ | null | Batch expiration date (indexed) |
| `supplier` | String | ✗ | ✗ | null | Supplier name |
| `sourceRequest` | ObjectId (Ref: InventoryRequest) | ✗ | ✗ | null | Reference to source inventory request |
| `createdBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who created the batch |
| `notes` | String | ✗ | ✗ | "" | Additional notes about the batch |
| `status` | String | ✗ | ✗ | Active | Batch status: `Active`, `Low Stock`, `Out of Stock`, `Pending Disposal`, `Disposed`, `Empty` (indexed) |
| `lastDisposalReferenceId` | String | ✗ | ✗ | null | Reference to last disposal record |
| `disposedAt` | Date | ✗ | ✗ | null | Date when batch was disposed |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{product: 1, expiryDate: 1}` (compound)
- `{product: 1, createdAt: -1}` (compound)
- `{status: 1}`
- `{expiryDate: 1}`
- `{currentQuantity: 1}`

**Validation Rules:**
- Ensures quantity values are finite and non-negative
- Auto-sets `currentQuantity` equal to `quantity` if not specified
- Auto-sets `initialQuantity` equal to `quantity` on creation

**Notes:**
- Batch-level tracking for products like medicines
- Supports expiry tracking and disposal

---

### 5. INVENTORY_REQUEST

**Description:** Requests to add new items or restock existing products. Supports two request types: ADD_ITEM and RESTOCK.

**Collection Name:** `inventoryrequests`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `requestType` | String | ✓ | ✗ | - | Type of request: `ADD_ITEM`, `RESTOCK` |
| **ADD_ITEM specific fields:** | | | | | |
| `itemName` | String | *Req if ADD_ITEM | ✗ | null | Name of new item |
| `category` | String | *Req if ADD_ITEM | ✗ | null | Item category |
| `initialQuantity` | Number | *Req if ADD_ITEM | ✗ | null | Initial quantity (min: 1) |
| `unitPrice` | Number | ✗ | ✗ | 0 | Price per unit (min: 0) |
| `unit` | String | ✗ | ✗ | pcs | Unit of measurement |
| `minStock` | Number | ✗ | ✗ | 10 | Minimum stock threshold (min: 0) |
| `description` | String | ✗ | ✗ | "" | Item description |
| `supplier` | String | ✗ | ✗ | null | Supplier name |
| `genericName` | String | ✗ | ✗ | null | Generic name (for medicines) |
| `brandName` | String | ✗ | ✗ | null | Brand name |
| `dosageForm` | String | ✗ | ✗ | null | Dosage form (for medicines) |
| `strength` | String | ✗ | ✗ | null | Medication strength |
| `medicineName` | String | ✗ | ✗ | null | Medicine name |
| `expiryDate` | Date | ✗ | ✗ | null | Expiration date |
| `batchNumber` | String | ✗ | ✗ | null | Batch number |
| **RESTOCK specific fields:** | | | | | |
| `product` | ObjectId (Ref: Product) | *Req if RESTOCK | ✗ | null | Reference to product being restocked |
| `requestedQuantity` | Number | *Req if RESTOCK | ✗ | null | Quantity requested for restock |
| **COMMON fields:** | | | | | |
| `requestedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who made the request |
| `date_requested` | Date | ✗ | ✗ | Current timestamp | Request submission date |
| `status` | String | ✗ | ✗ | pending | Status: `pending`, `approved`, `rejected` |
| `reviewedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who reviewed the request |
| `reviewedAt` | Date | ✗ | ✗ | null | Review timestamp |
| `rejectionReason` | String | ✗ | ✗ | null | Reason for rejection |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{requestedBy: 1, createdAt: -1}` (compound)
- `{status: 1, createdAt: -1}` (compound)
- `{requestType: 1, status: 1, createdAt: -1}` (compound)
- `{status: 1, date_requested: -1, createdAt: -1}` (compound)

**Validation Rules:**
- ADD_ITEM: requires `itemName`, `category`, `initialQuantity`
- RESTOCK: requires `product`, `requestedQuantity`
- `product` is set to null for ADD_ITEM requests
- `requestedQuantity` is set to null for ADD_ITEM requests

**Notes:**
- Dual-purpose request system for inventory management
- Supports conditional required fields based on request type

---

### 6. STAFF_STOCK_REQUEST

**Description:** Staff requests for product stock with per-item approval tracking and review workflow.

**Collection Name:** `staff_stockrequests`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `requestId` | String | ✓ | ✓ | - | Unique request identifier |
| `staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff member making the request (indexed) |
| `staffName` | String | ✓ | ✗ | - | Staff member's name |
| `items` | Array | ✓ | ✗ | - | Array of requested items (min 1 item, see items schema) |
| `items[].productId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product |
| `items[].productName` | String | ✓ | ✗ | - | Product name |
| `items[].currentStock` | Number | ✓ | ✗ | - | Current stock when requested (min: 0) |
| `items[].requestedQuantity` | Number | ✓ | ✗ | - | Quantity requested (min: 1) |
| `items[].status` | String | ✗ | ✗ | Pending | Item status: `Pending`, `Approved`, `Rejected` |
| `items[].approvedQuantity` | Number | ✗ | ✗ | null | Approved quantity if partially approved |
| `items[].expirationDate` | Date | ✗ | ✗ | null | Expiration date if specified |
| `items[].batchNumber` | String | ✗ | ✗ | null | Batch number |
| `status` | String | ✗ | ✗ | Pending | Overall status: `Pending`, `Partially Approved`, `Approved`, `Rejected` |
| `reviewedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who reviewed the request |
| `reviewedAt` | Date | ✗ | ✗ | null | Review timestamp |
| `notes` | String | ✗ | ✗ | "" | Additional notes |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{staffId: 1, createdAt: -1}` (compound)
- `{status: 1, createdAt: -1}` (compound)

**Validation Rules:**
- Request must have at least one item
- Items are embedded without separate `_id`

**Notes:**
- Tracks individual item approval for granular control
- Supports partial approval workflows

---

### 7. STAFF_EXPENSE

**Description:** Staff expense reports with approval workflow and receipt tracking.

**Collection Name:** `staff_expenses`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `title` | String | ✓ | ✗ | - | Expense title |
| `category` | String | ✓ | ✗ | - | Expense category: `Meals`, `Supplies`, `Transportation`, `Others` |
| `amount` | Number | ✓ | ✗ | - | Expense amount (min: 0) |
| `description` | String | ✗ | ✗ | "" | Detailed description |
| `date` | Date | ✓ | ✗ | Current timestamp | Expense date |
| `staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff member ID (indexed) |
| `staffName` | String | ✓ | ✗ | - | Staff member name |
| `receiptImage` | String | ✗ | ✗ | null | URL or path to receipt image |
| `status` | String | ✗ | ✗ | Pending | Status: `Pending`, `Reviewed`, `Approved`, `Rejected` |
| `reviewedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who reviewed the expense |
| `reviewedAt` | Date | ✗ | ✗ | null | Review timestamp |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{staffId: 1, createdAt: -1}` (compound)
- `{status: 1, date: -1}` (compound)
- `{category: 1, date: -1}` (compound)

**Notes:**
- Supports categorized expense tracking
- Receipt image storage for documentation

---

### 8. STAFF_ACTIVITY_LOG

**Description:** Audit trail of staff actions for monitoring and compliance.

**Collection Name:** `staff_activitylogs`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff member ID (indexed) |
| `actionType` | String | ✓ | ✗ | - | Type of action performed (indexed) |
| `targetItemId` | ObjectId (Ref: Product) | ✗ | ✗ | null | Referenced product or item |
| `description` | String | ✓ | ✗ | - | Description of the action |
| `status` | String | ✗ | ✗ | completed | Status: `pending`, `approved`, `rejected`, `completed`, `viewed`, `requested` (indexed) |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{staffId: 1, createdAt: -1}` (compound)
- `{staffId: 1}` (indexed)
- `{actionType: 1}` (indexed)
- `{status: 1, createdAt: -1}` (compound)

**Notes:**
- Comprehensive audit trail for staff activities
- Tracks action status for workflow monitoring

---

### 9. NOTIFICATION

**Description:** System notifications for users with read status and routing information.

**Collection Name:** `notifications`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `userId` | ObjectId (Ref: User) | ✓ | ✗ | - | Recipient user ID |
| `role` | String | ✓ | ✗ | - | Target role: `staff`, `owner` |
| `message` | String | ✓ | ✗ | - | Notification message (trimmed) |
| `type` | String | ✓ | ✗ | - | Notification type: `out_of_stock`, `stock_request_sent`, `stock_request_approved`, `stock_request_rejected`, `item_expiration`, `inventory_adjustment_request`, `expense_submitted`, `expense_reviewed`, `expense_approved`, `expense_rejected`, `low_stock`, `expiry_risk_red`, `promotion_candidate` |
| `redirectUrl` | String | ✗ | ✗ | null | URL to redirect to when clicked |
| `isRead` | Boolean | ✗ | ✗ | false | Whether notification has been read |
| `relatedId` | ObjectId | ✗ | ✗ | null | Reference to related entity |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{userId: 1, isRead: 1, createdAt: -1}` (compound)
- `{role: 1, createdAt: -1}` (compound)

**Notification Types:**
- **Inventory:** `out_of_stock`, `low_stock`, `item_expiration`
- **Requests:** `stock_request_sent`, `stock_request_approved`, `stock_request_rejected`, `inventory_adjustment_request`
- **Expenses:** `expense_submitted`, `expense_reviewed`, `expense_approved`, `expense_rejected`
- **Promotions:** `promotion_candidate`, `expiry_risk_red`

**Notes:**
- Role-based notification routing
- Unread notification tracking for UI

---

### 10. OWNER_DISPOSAL_LOG

**Description:** Records of product disposal with approval workflow and disposal methods.

**Collection Name:** `disposal_logs`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `referenceId` | String | ✓ | ✓ | - | Unique disposal reference ID (indexed, trimmed) |
| `itemId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product (indexed) |
| `batchId` | ObjectId (Ref: InventoryBatch) | ✓ | ✗ | - | Reference to batch (indexed) |
| `itemName` | String | ✓ | ✗ | - | Item name |
| `genericName` | String | ✗ | ✗ | null | Generic name |
| `batchNumber` | String | ✓ | ✗ | - | Batch number (indexed) |
| `expirationDate` | Date | ✗ | ✗ | null | Item expiration date |
| `quantityDisposed` | Number | ✓ | ✗ | - | Quantity disposed (min: 1) |
| `reason` | String | ✓ | ✗ | - | Disposal reason: `Expired`, `Damaged`, `Contaminated`, `Manufacturer Recall`, `Incorrect Storage`, `Other` (indexed) |
| `remarks` | String | ✗ | ✗ | "" | Additional remarks |
| `requestedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who requested disposal (indexed) |
| `requestedByName` | String | ✗ | ✗ | null | Name of requesting user |
| `approvedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who approved disposal (indexed) |
| `disposalMethod` | String | ✗ | ✗ | null | Method: `Incineration`, `Return to Supplier`, `Chemical Neutralization`, `Waste Contractor Pickup`, `Other` |
| `dateRequested` | Date | ✗ | ✗ | Current timestamp | Request date (indexed, has alias: date_requested) |
| `dateApproved` | Date | ✗ | ✗ | null | Approval date |
| `dateDisposed` | Date | ✗ | ✗ | null | Actual disposal date |
| `status` | String | ✗ | ✗ | Pending | Status: `Pending`, `Approved`, `Disposed`, `Rejected` (indexed) |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{referenceId: 1}` (unique)
- `{itemId: 1}`
- `{batchId: 1}`
- `{batchNumber: 1}`
- `{reason: 1}`
- `{requestedBy: 1}`
- `{approvedBy: 1}`
- `{dateRequested: -1, status: 1}` (compound)
- `{itemName: 1, batchNumber: 1}` (compound)
- `{status: 1}`

**Disposal Methods:**
- **Safe Disposal:** Incineration, Chemical Neutralization
- **Return:** Return to Supplier
- **Contractor:** Waste Contractor Pickup
- **Other:** Other

**Notes:**
- Comprehensive audit trail for disposed items
- Tracks both request and approval lifecycle
- Immutable record for compliance

---

### 11. STAFF_QUANTITY_ADJUSTMENT

**Description:** Requests for inventory quantity adjustments with discrepancy tracking and approval.

**Collection Name:** `staff_quantityadjustments`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `productId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product |
| `productName` | String | ✓ | ✗ | - | Product name |
| `systemQuantity` | Number | ✓ | ✗ | - | System recorded quantity (min: 0) |
| `actualQuantity` | Number | ✓ | ✗ | - | Actual physical quantity (min: 0) |
| `difference` | Number | ✓ | ✗ | - | Difference (actual - system) |
| `reason` | String | ✓ | ✗ | - | Reason for adjustment |
| `staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff member making request |
| `date_requested` | Date | ✗ | ✗ | Current timestamp | Request date |
| `staffName` | String | ✓ | ✗ | - | Staff member name |
| `status` | String | ✗ | ✗ | Pending | Status: `Pending`, `Approved`, `Rejected` |
| `reviewedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who reviewed the request |
| `reviewedAt` | Date | ✗ | ✗ | null | Review timestamp |
| `rejectionReason` | String | ✗ | ✗ | null | Reason for rejection |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{staffId: 1, createdAt: -1}` (compound)
- `{status: 1, createdAt: -1}` (compound)
- `{productId: 1, status: 1}` (compound)
- `{status: 1, date_requested: -1, createdAt: -1}` (compound)

**Notes:**
- Tracks inventory discrepancies for reconciliation
- Calculates difference automatically from system vs actual

---

### 12. STAFF_BILLING_TRANSACTION

**Description:** Comprehensive billing records with PARMS integration, batch allocation, and payment tracking.

**Collection Name:** `staff_billingtransactions`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff member processing billing (indexed) |
| `patientId` | String | ✓ | ✗ | - | Patient identifier (trimmed) |
| `patientName` | String | ✓ | ✗ | - | Patient name (trimmed) |
| `isGuest` | Boolean | ✗ | ✗ | false | Whether patient is guest (indexed) |
| **PARMS Integration Fields:** | | | | | |
| `parmsIntentId` | String | ✗ | ✗ | null | PARMS billing intent ID (trimmed, indexed) |
| `parmsEncounterId` | String | ✗ | ✗ | null | PARMS encounter ID (trimmed) |
| `parmsInvoiceReference` | String | ✗ | ✗ | null | PARMS invoice reference (trimmed, indexed) |
| `parmsInvoiceNumber` | String | ✗ | ✗ | null | PARMS invoice number (trimmed) |
| `parmsSyncStatus` | String | ✗ | ✗ | NOT_QUEUED | Sync status: `NOT_QUEUED`, `PENDING`, `SYNCING`, `SYNCED`, `FAILED` (indexed) |
| `parmsSyncAttempts` | Number | ✗ | ✗ | 0 | Number of sync attempts (min: 0) |
| `parmsLastSyncAt` | Date | ✗ | ✗ | null | Last successful sync timestamp |
| `parmsLastSyncError` | String | ✗ | ✗ | null | Last sync error message (trimmed) |
| `parmsLastSyncCorrelationId` | String | ✗ | ✗ | null | Correlation ID for last sync (trimmed) |
| `parmsLastSyncEventId` | String | ✗ | ✗ | null | Event ID for last sync (trimmed) |
| `parmsNextRetryAt` | Date | ✗ | ✗ | null | Next retry timestamp (indexed) |
| `parmsPendingBalances` | Array | ✗ | ✗ | [] | Pending balance items from PARMS |
| `parmsPendingBalances[].sourceType` | String | ✗ | ✗ | other | Source type: `laboratory`, `prescription`, `other` |
| `parmsPendingBalances[].referenceId` | String | ✗ | ✗ | null | Reference ID (trimmed) |
| `parmsPendingBalances[].description` | String | ✓ | ✗ | - | Description (trimmed) |
| `parmsPendingBalances[].amount` | Number | ✓ | ✗ | - | Amount (min: 0) |
| `parmsPendingTotal` | Number | ✗ | ✗ | 0 | Total pending balance (min: 0) |
| **Items:** | | | | | |
| `items` | Array | ✓ | ✗ | [] | Billing items array |
| `items[].productId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Product reference |
| `items[].name` | String | ✓ | ✗ | - | Product name (trimmed) |
| `items[].unitPrice` | Number | ✓ | ✗ | - | Unit price (min: 0) |
| `items[].quantity` | Number | ✓ | ✗ | - | Quantity (min: 1) |
| `items[].lineTotal` | Number | ✓ | ✗ | - | Line total (min: 0) |
| `items[].batchAllocations` | Array | ✗ | ✗ | [] | Batch allocations for this item |
| `items[].batchAllocations[].batchId` | ObjectId (Ref: InventoryBatch) | ✓ | ✗ | - | Batch reference |
| `items[].batchAllocations[].batchNumber` | String | ✗ | ✗ | null | Batch number (trimmed) |
| `items[].batchAllocations[].quantity` | Number | ✓ | ✗ | - | Quantity allocated (min: 1) |
| `items[].batchAllocations[].expiryDate` | Date | ✗ | ✗ | null | Batch expiry date |
| `items[].batchAllocations[].expiryRisk` | String | ✗ | ✗ | null | Expiry risk indicator (trimmed) |
| **Financial Fields:** | | | | | |
| `subtotal` | Number | ✓ | ✗ | - | Subtotal before discount/tax (min: 0) |
| `discountRate` | Number | ✗ | ✗ | 0 | Discount rate as decimal (min: 0, max: 1) |
| `discountAmount` | Number | ✗ | ✗ | 0 | Discount amount (min: 0) |
| `vatRate` | Number | ✗ | ✗ | 0.12 | VAT rate (default 12%) |
| `vatAmount` | Number | ✗ | ✗ | 0 | VAT amount (min: 0) |
| `vatIncluded` | Number | ✗ | ✗ | 0 | VAT included in total (min: 0) |
| `netAmount` | Number | ✗ | ✗ | 0 | Net amount after discount (min: 0) |
| `totalAmount` | Number | ✓ | ✗ | - | Total amount including tax (min: 0) |
| **Payment Fields:** | | | | | |
| `cashReceived` | Number | ✗ | ✗ | null | Cash received (min: 0) |
| `change` | Number | ✗ | ✗ | null | Change amount (min: 0) |
| `paymentMethod` | String | ✗ | ✗ | cash | Payment method: `cash` |
| **Modification Fields:** | | | | | |
| `editedPatientId` | String | ✗ | ✗ | null | Modified patient ID (trimmed) |
| `editedPatientName` | String | ✗ | ✗ | null | Modified patient name (trimmed) |
| `editedItems` | Array | ✗ | ✗ | null | Previously edited items |
| **Status Fields:** | | | | | |
| `status` | String | ✗ | ✗ | PENDING_PAYMENT | Status: `PENDING_PAYMENT`, `COMPLETED`, `VOIDED` (indexed) |
| `completedAt` | Date | ✗ | ✗ | null | Completion timestamp |
| `voidedAt` | Date | ✗ | ✗ | null | Void timestamp |
| `voidedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who voided the transaction |
| `voidNotes` | String | ✗ | ✗ | null | Reason for void (trimmed) |
| `voidReason` | String | ✗ | ✗ | null | Void reason (trimmed) |
| **Receipt Snapshot:** | | | | | |
| `receiptSnapshot` | Object | ✗ | ✗ | null | Complete receipt snapshot |
| `receiptSnapshot.receiptNumber` | String | ✓ | ✗ | - | Receipt number |
| `receiptSnapshot.clinic.name` | String | ✓ | ✗ | - | Clinic name |
| `receiptSnapshot.transactionDateTime` | Date | ✓ | ✗ | - | Transaction date/time |
| `receiptSnapshot.patientId` | String | ✓ | ✗ | - | Patient ID |
| `receiptSnapshot.patientName` | String | ✓ | ✗ | - | Patient name (trimmed) |
| `receiptSnapshot.isGuest` | Boolean | ✗ | ✗ | false | Whether patient is guest |
| `receiptSnapshot.staffId` | ObjectId (Ref: User) | ✓ | ✗ | - | Staff ID |
| `receiptSnapshot.items` | Array | ✗ | ✗ | [] | Items from receipt |
| `receiptSnapshot.pendingBalances` | Array | ✗ | ✗ | [] | Pending balances from receipt |
| `receiptSnapshot.pendingBalanceTotal` | Number | ✗ | ✗ | 0 | Total pending balance (min: 0) |
| `receiptSnapshot.subtotal` | Number | ✓ | ✗ | - | Subtotal from receipt (min: 0) |
| `receiptSnapshot.discountRate` | Number | ✗ | ✗ | - | Discount rate from receipt |
| `receiptSnapshot.discountAmount` | Number | ✗ | ✗ | - | Discount amount from receipt |
| `receiptSnapshot.vatRate` | Number | ✗ | ✗ | - | VAT rate from receipt |
| `receiptSnapshot.vatAmount` | Number | ✗ | ✗ | - | VAT amount from receipt |
| `receiptSnapshot.vatIncluded` | Number | ✗ | ✗ | - | VAT included from receipt (min: 0) |
| `receiptSnapshot.netAmount` | Number | ✗ | ✗ | - | Net amount from receipt (min: 0) |
| `receiptSnapshot.totalAmount` | Number | ✓ | ✗ | - | Total from receipt (min: 0) |
| `receiptSnapshot.cashReceived` | Number | ✓ | ✗ | - | Cash received from receipt (min: 0) |
| `receiptSnapshot.change` | Number | ✓ | ✗ | - | Change from receipt (min: 0) |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{staffId: 1, createdAt: -1}` (compound)
- `{staffId: 1, status: 1, completedAt: -1}` (compound)
- `{parmsSyncStatus: 1, completedAt: -1}` (compound)
- `{parmsSyncStatus: 1, parmsNextRetryAt: 1}` (compound)
- `{"receiptSnapshot.receiptNumber": 1}` (unique, sparse)
- `{isGuest: 1}` (indexed)
- `{parmsIntentId: 1}` (indexed)
- `{parmsInvoiceReference: 1}` (indexed)
- `{status: 1}` (indexed)

**Notes:**
- Comprehensive billing transaction with PARMS integration
- Supports batch-level product allocation
- Full audit trail with receipt snapshots
- Guest patient support for walk-in customers
- Automatic retry mechanism for PARMS sync failures

---

### 13. OWNER_STOCK_LOG

**Description:** Append-only immutable stock movement audit trail for reconciliation and compliance.

**Collection Name:** `owner_stocklogs`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `product` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product (indexed) |
| `movementType` | String | ✓ | ✗ | - | Type of movement: `SALE`, `RESTOCK`, `ADJUST`, `VOID_REVERSAL`, `ADJUSTMENT`, `ITEM_CREATED`, `DISPOSAL` (indexed) |
| `quantityChange` | Number | ✓ | ✗ | - | Change in quantity (positive or negative) |
| `beforeQuantity` | Number | ✓ | ✗ | - | Quantity before movement (min: 0) |
| `afterQuantity` | Number | ✓ | ✗ | - | Quantity after movement (min: 0) |
| `performedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who performed the action (indexed) |
| `referenceId` | String | ✓ | ✓ | - | Unique reference ID (unique, indexed, trimmed) |
| `batchNumber` | String | ✗ | ✗ | null | Batch number if applicable (trimmed) |
| `source` | String | ✓ | ✗ | - | Source: `POS`, `MANUAL`, `SYSTEM` (indexed) |
| `notes` | String | ✗ | ✗ | null | Additional notes (trimmed) |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp (indexed) |

**Indexes:**
- `{referenceId: 1}` (unique)
- `{product: 1}` (indexed)
- `{movementType: 1}` (indexed)
- `{performedBy: 1}` (indexed)
- `{source: 1}` (indexed)
- `{createdAt: 1}` (indexed)

**Immutability Rules:**
- Cannot be updated (throws error on update attempts)
- Cannot be deleted (throws error on delete attempts)
- Append-only log for audit compliance

**Movement Types:**
- **Sales:** SALE
- **Inventory:** RESTOCK, ITEM_CREATED, DISPOSAL
- **Adjustments:** ADJUST, ADJUSTMENT, VOID_REVERSAL

**Notes:**
- Immutable audit trail for regulatory compliance
- Tracks all stock movements with full context
- Essential for reconciliation and auditing

---

### 14. PRICE_CHANGE_REQUEST

**Description:** Tracks requests to change product pricing with approval workflow.

**Collection Name:** `pricechangerequests`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `productId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product (indexed) |
| `productName` | String | ✓ | ✗ | - | Product name (trimmed) |
| `oldPrice` | Number | ✓ | ✗ | - | Previous price (min: 0) |
| `requestedPrice` | Number | ✓ | ✗ | - | New requested price (min: 0) |
| `requestedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User requesting the change (indexed) |
| `requestedByName` | String | ✗ | ✗ | null | Name of requesting user (trimmed) |
| `requestedByRole` | String | ✓ | ✗ | - | Role of requesting user: `owner`, `staff` |
| `reason` | String | ✗ | ✗ | "" | Reason for price change (trimmed) |
| `status` | String | ✗ | ✗ | pending | Status: `pending`, `approved`, `rejected` (indexed) |
| `reviewedBy` | ObjectId (Ref: User) | ✗ | ✗ | null | User who reviewed the request |
| `reviewedAt` | Date | ✗ | ✗ | null | Review timestamp |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{productId: 1}` (indexed)
- `{requestedBy: 1}` (indexed)
- `{status: 1}` (indexed)
- `{status: 1, createdAt: -1}` (compound)
- `{productId: 1, status: 1, createdAt: -1}` (compound)
- `{requestedBy: 1, createdAt: -1}` (compound)

**Notes:**
- Tracks all price change requests for audit purposes
- Supports role-based approval workflows

---

### 15. PHYSICAL_INVENTORY_CHECK

**Description:** Records of physical inventory counts against system inventory for reconciliation.

**Collection Name:** `physicalinventorychecks`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `product` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to product (indexed) |
| `batch` | ObjectId (Ref: InventoryBatch) | ✗ | ✗ | null | Reference to batch if applicable (indexed) |
| `month` | String | ✓ | ✗ | - | Month of check in YYYY-MM format (indexed, pattern: ^\d{4}-\d{2}$) |
| `systemStock` | Number | ✓ | ✗ | - | System recorded stock |
| `variance` | Number | ✓ | ✗ | - | Difference between physical and system |
| `physicalCount` | Number | ✓ | ✗ | - | Physical count performed |
| `checkedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who performed the check |
| `checkedByEmail` | String | ✓ | ✗ | - | Email of user who performed check (trimmed) |
| `dateChecked` | Date | ✓ | ✗ | Current timestamp | Check date |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{product: 1, batch: 1, month: 1}` (unique, compound)

**Unique Constraint:**
- Combination of product, batch, and month must be unique

**Notes:**
- One record per product per month
- Batch field is optional for non-batch-tracked items
- Essential for inventory reconciliation

---

### 16. PARMS_BILLING_INTENT

**Description:** Integration with PARMS system for encounter-based billing with service and prescription tracking.

**Collection Name:** `parms_billingintents`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `intentId` | String | ✓ | ✓ | - | Unique intent identifier (indexed, unique, trimmed) |
| `encounterId` | String | ✗ | ✗ | null | PARMS encounter ID (indexed, trimmed) |
| `revision` | Number | ✗ | ✗ | 1 | Revision number (min: 1) |
| `idempotencyKey` | String | ✗ | ✗ | null | Idempotency key for duplicate prevention (indexed, trimmed) |
| `payloadHash` | String | ✗ | ✗ | null | Hash of payload for verification (trimmed) |
| `correlationId` | String | ✗ | ✗ | null | Correlation ID for request tracking (trimmed) |
| **Patient Info:** | | | | | |
| `patient` | Object | ✓ | ✗ | - | Patient information (embedded, required) |
| `patient.parmsPatientId` | String | ✗ | ✗ | null | PARMS patient ID (trimmed) |
| `patient.externalPatientCode` | String | ✗ | ✗ | null | External patient code (trimmed) |
| `patient.firstName` | String | ✗ | ✗ | null | First name (trimmed) |
| `patient.lastName` | String | ✗ | ✗ | null | Last name (trimmed) |
| `patient.fullName` | String | ✓ | ✗ | - | Full name (trimmed) |
| **Service Lines:** | | | | | |
| `serviceLines` | Array | ✗ | ✗ | [] | Array of service line items |
| `serviceLines[].lineId` | String | ✓ | ✗ | - | Service line identifier (trimmed) |
| `serviceLines[].parmsServiceCode` | String | ✗ | ✗ | null | PARMS service code (trimmed) |
| `serviceLines[].serviceType` | String | ✗ | ✗ | null | Type of service (trimmed) |
| `serviceLines[].quantity` | Number | ✗ | ✗ | 1 | Quantity (min: 0) |
| `serviceLines[].totalMinor` | Number | ✗ | ✗ | 0 | Total in minor units (min: 0) |
| `serviceLines[].metadata` | Mixed | ✗ | ✗ | {} | Additional metadata |
| **Prescription Lines:** | | | | | |
| `prescriptionLines` | Array | ✗ | ✗ | [] | Array of prescription items |
| `prescriptionLines[].rxId` | String | ✓ | ✗ | - | Prescription line identifier (trimmed) |
| `prescriptionLines[].genericName` | String | ✗ | ✗ | null | Generic medication name (trimmed) |
| `prescriptionLines[].medicationName` | String | ✗ | ✗ | null | Medication name (trimmed) |
| `prescriptionLines[].dosage` | String | ✗ | ✗ | null | Dosage information (trimmed) |
| `prescriptionLines[].frequency` | String | ✗ | ✗ | null | Frequency of use (trimmed) |
| `prescriptionLines[].quantity` | Number | ✗ | ✗ | 1 | Quantity (min: 0) |
| `prescriptionLines[].totalMinor` | Number | ✗ | ✗ | 0 | Total in minor units (min: 0) |
| `prescriptionLines[].selectedBrand` | String | ✗ | ✗ | null | Selected brand name (trimmed) |
| `prescriptionLines[].selectedBrandSku` | String | ✗ | ✗ | null | Selected brand SKU (trimmed) |
| **Timestamps:** | | | | | |
| `submittedAt` | Date | ✗ | ✗ | null | Submission timestamp |
| `encounterCompletedAt` | Date | ✗ | ✗ | null | Encounter completion timestamp |
| **IBMS Reference:** | | | | | |
| `ibmsReference` | String | ✓ | ✓ | - | IBMS reference number (unique, indexed, trimmed) |
| `ibmsInvoiceNumber` | String | ✓ | ✓ | - | IBMS invoice number (unique, indexed, trimmed) |
| **Financial Info:** | | | | | |
| `currency` | String | ✗ | ✗ | PHP | Currency code (trimmed) |
| `subtotalMinor` | Number | ✗ | ✗ | 0 | Subtotal in minor units (min: 0) |
| `discountMinor` | Number | ✗ | ✗ | 0 | Discount in minor units (min: 0) |
| `taxMinor` | Number | ✗ | ✗ | 0 | Tax in minor units (min: 0) |
| `totalMinor` | Number | ✗ | ✗ | 0 | Total in minor units (min: 0) |
| `amountPaidMinor` | Number | ✗ | ✗ | 0 | Amount paid in minor units (min: 0) |
| `balanceDueMinor` | Number | ✗ | ✗ | 0 | Balance due in minor units (min: 0) |
| **Status Fields:** | | | | | |
| `invoiceStatus` | String | ✗ | ✗ | pending | Invoice status: `draft`, `queued`, `submitted`, `pending`, `processing`, `paid`, `failed`, `cancelled`, `refunded` (indexed) |
| `paymentStatus` | String | ✗ | ✗ | pending | Payment status: `pending`, `processing`, `paid`, `failed`, `cancelled`, `refunded` |
| `paidAt` | Date | ✗ | ✗ | null | Payment timestamp |
| `processedAt` | Date | ✗ | ✗ | null | Processing timestamp |
| `lastTransactionId` | ObjectId (Ref: STAFF_BillingTransaction) | ✗ | ✗ | null | Reference to last transaction |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{intentId: 1}` (unique)
- `{encounterId: 1}`
- `{idempotencyKey: 1}`
- `{ibmsReference: 1}` (unique)
- `{ibmsInvoiceNumber: 1}` (unique)
- `{invoiceStatus: 1}`
- `{"patient.fullName": 1}` (compound)
- `{"patient.parmsPatientId": 1}` (compound)
- `{"patient.externalPatientCode": 1}` (compound)
- `{submittedAt: -1, createdAt: -1}` (compound)

**Notes:**
- Critical bridge between IBMS and PARMS systems
- Supports service and prescription line items
- Tracks invoice and payment status separately
- All amounts stored in minor units (cents)

---

### 17. OWNER_ARCHIVED_PRODUCT

**Description:** Archive of deleted or retired products with historical snapshots.

**Collection Name:** `archived_products`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `originalProductId` | ObjectId (Ref: Product) | ✓ | ✗ | - | Reference to original product (indexed) |
| `name` | String | ✓ | ✗ | - | Product name (trimmed) |
| `category` | String | ✓ | ✗ | - | Product category (trimmed) |
| `quantity` | Number | ✓ | ✗ | - | Quantity at archive time (min: 0) |
| `unit` | String | ✗ | ✗ | pcs | Unit of measurement (trimmed) |
| `statusAtArchive` | String | ✓ | ✗ | - | Status when archived: `available`, `low`, `out` |
| `archivedBy` | ObjectId (Ref: User) | ✓ | ✗ | - | User who archived the product |
| `archivedAt` | Date | ✗ | ✗ | Current timestamp | Archive timestamp |
| `archiveReason` | String | ✗ | ✗ | Owner archived product | Reason for archiving (trimmed) |
| `snapshot` | Mixed | ✗ | ✗ | null | Full product snapshot at archive time |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{originalProductId: 1}` (indexed)
- `{archivedAt: -1}` (indexed)

**Notes:**
- Preserves historical product data
- Snapshot field stores complete product state at archive
- Supports audit trails for deleted products

---

### 18. ACTIVITY_LOG

**Description:** General activity audit log for all system actions across owner and staff operations.

**Collection Name:** `activitylogs`

| Field | Type | Required | Unique | Default | Description |
|-------|------|----------|--------|---------|-------------|
| `_id` | ObjectId | ✓ | ✓ | Auto | MongoDB auto-generated unique identifier |
| `actorId` | ObjectId (Ref: User) | ✗ | ✗ | null | User performing the action (indexed) |
| `actorRole` | String | ✗ | ✗ | null | Role of actor: `OWNER`, `STAFF` (indexed) |
| `actorName` | String | ✗ | ✗ | null | Name of actor (trimmed) |
| `actorEmail` | String | ✗ | ✗ | null | Email of actor (trimmed) |
| `actionType` | String | ✗ | ✗ | null | Type of action (indexed) |
| `description` | String | ✗ | ✗ | null | Description of action (trimmed) |
| `category` | String | ✗ | ✗ | null | Category: `User Management`, `Inventory`, `Payment`, `Request` (indexed) |
| `action` | String | ✓ | ✗ | - | Action performed (required) |
| `performedBy` | ObjectId (Ref: User) | ✗ | ✗ | - | User who performed the action |
| `entityType` | String | ✗ | ✗ | null | Type of entity affected |
| `entityId` | ObjectId | ✗ | ✗ | null | ID of entity affected |
| `details` | Mixed | ✗ | ✗ | null | Additional details/metadata |
| `createdAt` | Date | Auto | ✗ | Current timestamp | Creation timestamp |
| `updatedAt` | Date | Auto | ✗ | Current timestamp | Last update timestamp |

**Indexes:**
- `{createdAt: -1}` (indexed)
- `{category: 1, createdAt: -1}` (compound)
- `{actorId: 1}` (indexed)
- `{actorRole: 1}` (indexed)
- `{actionType: 1}` (indexed)

**Action Categories:**
- **User Management:** User creation, modifications, role changes
- **Inventory:** Product changes, stock updates, batch operations
- **Payment:** Billing transactions, refunds
- **Request:** Requests for approvals (stock, expenses, price changes)

**Notes:**
- Comprehensive audit trail for system operations
- Tracks both actor information and details of action
- Supports detailed compliance reporting

---

## Data Standards

### Field Types and Standards

#### String Fields
- Maximum length: 2000 characters unless specified
- Trimmed automatically before storage
- Case-sensitive unless otherwise specified
- Stored as UTF-8 encoded text

#### Number Fields
- Stored as IEEE 754 double-precision floating point
- Financial amounts stored in integer minor units (cents) for PARMS integration
- Precision: 2 decimal places for currency

#### Date Fields
- ISO 8601 format
- Stored in UTC timezone
- Automatically managed timestamps: `createdAt`, `updatedAt`

#### ObjectId References
- MongoDB native ObjectId format
- Stored as hexadecimal strings in 24 characters
- Supports lazy population via `.populate()` in queries

#### Boolean Fields
- Values: `true`, `false`
- Default values explicitly specified per field

#### Enum Fields
- Predefined list of valid values
- Case-sensitive matching
- Default value specified

#### Array Fields
- Stored as MongoDB arrays
- Embedded documents use mixed schema
- Indexed for query performance where applicable

### Naming Conventions

- **Collections:** lowercase, plural form or descriptive name (e.g., `users`, `products`, `disposal_logs`)
- **Fields:** camelCase (e.g., `firstName`, `productName`, `isActive`)
- **Status Fields:** specific enum values in consistent case
- **Reference Fields:** named after referenced entity (e.g., `productId`, `staffId`, `approvedBy`)
- **Timestamp Fields:** consistent naming (`createdAt`, `updatedAt`, `reviewedAt`, `disposedAt`)

### Index Strategy

**Primary Indexes:**
- All reference fields (ObjectId foreign keys)
- All status fields for filtering
- All user identification fields

**Compound Indexes:**
- Common query combinations (e.g., `{userId, createdAt}`)
- Sorted results (descending timestamps)
- Unique constraints on business keys

**Sparse Indexes:**
- Optional fields that are frequently queried (e.g., `hrmsId`, `receiptSnapshot.receiptNumber`)

### Constraints and Validation

#### Uniqueness
- Email must be unique and lowercase
- Transaction numbers must be unique
- Reference IDs must be unique within their context
- Receipt numbers must be unique when present

#### Required Fields
- Critical business identifiers
- Financial amounts and pricing
- Status fields (with defaults)
- Timestamps

#### Numeric Constraints
- Non-negative values: Quantities, prices, amounts
- Range constraints: Discount rates (0-1), VAT rates
- Minimum values: Most quantities (min: 0 or min: 1)

#### Referential Integrity
- Foreign key references to User collection
- References maintained at query time (no cascade delete)
- Optional references for flexible schema design

### Data Lifecycle

#### Creation
- `createdAt` automatically set to current timestamp
- `updatedAt` automatically set to current timestamp
- Default values applied per schema

#### Modification
- `updatedAt` automatically updated on modification
- Historical fields preserved (e.g., `oldPrice`, `beforeQuantity`)
- Edit history captured in specific fields

#### Archival
- Products can be archived (`isArchived`, `archivedAt`, `archivedBy`)
- User accounts can be archived with reason
- Archived data preserved for compliance

#### Deletion
- Soft delete pattern used (archived flag)
- Hard deletion restricted on audit trails
- Historical snapshots maintained

### Query Optimization

#### Frequently Used Indexes
1. User authentication: `{email: 1}`
2. Role-based queries: `{status: 1}`, `{role: 1}`
3. Inventory status: `{status: 1, quantity: 1}`
4. Time-based queries: `{createdAt: -1}`, `{date_requested: -1}`
5. User activity: `{userId: 1, createdAt: -1}`
6. Approval workflows: `{status: 1, createdAt: -1}`

#### Query Best Practices
- Use indexed fields in WHERE clauses
- Sort on indexed fields
- Limit document size with projection
- Use compound indexes for multi-field filters
- Leverage sparse indexes for optional fields

### Security Considerations

#### Sensitive Data
- Passwords: Hashed using bcrypt (never stored in plaintext)
- Personal information: Accessible based on role permissions
- Financial data: Audit logged with access tracking

#### Access Control
- User role determines data visibility (owner vs staff)
- Activity logs track all data access
- PARMS integration requires authentication

#### Data Privacy
- User data archived with timestamps
- GDPR compliance support via archival
- Patient information handled per HIPAA standards

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-28 | Technical Writer | Initial data dictionary creation |

---

## Appendix: Entity Relationships

### User Relationships
- Creates: Products, Transactions, Requests, Expenses
- Reviews: Requests, Expenses, Price Changes
- Performs: Stock movements, Activity logs
- Archives: Products, Users

### Product Relationships
- Has: Inventory Batches, Transaction Items
- References: Stock Logs, Disposal Logs
- Archive: Archived Product snapshots

### Transaction Relationships
- Contains: Multiple items
- References: Products via items
- Processed by: Single staff member

### Batch Relationships
- Belongs to: Product
- Source: Inventory Request
- Tracked in: Disposal Logs
- Allocated to: Billing Transactions

### Request Types
- **Inventory Request:** ADD_ITEM creates new products, RESTOCK references existing
- **Stock Request:** Staff requests specific quantities
- **Price Change:** Staff/Owner requests price modifications

---

**End of Document**

