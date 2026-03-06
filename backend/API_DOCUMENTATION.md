# IBMS System Revision - API Documentation

## Summary of Changes

### 1. VAT Computation Fix
- **Issue**: System was adding 12% VAT on top of already VAT-inclusive prices
- **Solution**: Implemented reverse VAT calculation
- **Formula**: 
  - Net Price = Total / 1.12
  - VAT Included = Total - Net Price

### 2. New Features Implemented
1. Expenses Module
2. Multi-item Stock Request System
3. Inventory Quantity Adjustment Request
4. Expiration Warnings & Filters
5. Functional Notification System
6. Patient Name Support in Billing
7. Enhanced Void Transaction with Edit Modal

---

## API Endpoints

### 📊 Expenses Module

#### Staff: Create Expense
```http
POST /api/staff/expenses
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Office Supplies",
  "category": "Supplies", // Meals | Supplies | Transportation | Others
  "amount": 500,
  "description": "Pens and notebooks",
  "date": "2026-03-05",
  "receiptImage": "base64_or_url" // Optional
}

Response: 201 Created
{
  "message": "Expense created successfully",
  "data": {
    "_id": "...",
    "title": "Office Supplies",
    "category": "Supplies",
    "amount": 500,
    "status": "Pending",
    "staffId": "...",
    "staffName": "John Doe",
    ...
  }
}
```

#### Staff: Get Own Expenses
```http
GET /api/staff/expenses
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 15,
  "data": [...]
}
```

#### Owner: Get All Expenses (with filters)
```http
GET /api/owner/expenses?category=Meals&startDate=2026-03-01&endDate=2026-03-31&status=Pending
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 25,
  "summary": {
    "totalExpenses": 15000,
    "pendingCount": 5,
    "approvedCount": 20
  },
  "data": [...]
}
```

#### Owner: Update Expense Status
```http
PATCH /api/owner/expenses/:id/status
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "Approved" // Pending | Reviewed | Approved
}

Response: 200 OK
{
  "message": "Expense status updated",
  "data": {...}
}
```

#### Owner: Get Expense Summary
```http
GET /api/owner/expenses/summary
Authorization: Bearer {token}

Response: 200 OK
{
  "data": {
    "today": 500,
    "thisWeek": 3500,
    "thisMonth": 12000
  }
}
```

---

### 📦 Multi-Item Stock Request System

#### Staff: Get Low Stock Items
```http
GET /api/staff/stock-requests/low-stock-items
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 5,
  "data": [
    {
      "_id": "...",
      "name": "Syringe 3ml",
      "quantity": 3,
      "minStock": 10,
      ...
    }
  ]
}
```

#### Staff: Create Multi-Item Stock Request
```http
POST /api/staff/stock-requests
Authorization: Bearer {token}
Content-Type: application/json

{
  "items": [
    {
      "productId": "product_id_1",
      "requestedQuantity": 10
    },
    {
      "productId": "product_id_2",
      "requestedQuantity": 20
    }
  ],
  "notes": "Weekly restock request"
}

Response: 201 Created
{
  "message": "Stock request created successfully",
  "data": {
    "requestId": "REQ-20260305-1234",
    "staffId": "...",
    "staffName": "John Doe",
    "items": [
      {
        "productId": "...",
        "productName": "Syringe 3ml",
        "currentStock": 3,
        "requestedQuantity": 10,
        "status": "Pending"
      }
    ],
    "status": "Pending",
    ...
  }
}
```

#### Staff: Get Own Stock Requests
```http
GET /api/staff/stock-requests
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 8,
  "data": [...]
}
```

#### Owner: Get All Stock Requests
```http
GET /api/owner/stock-requests?status=Pending
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 12,
  "data": [...]
}
```

#### Owner: Approve Stock Request Items
```http
PATCH /api/owner/stock-requests/:id/approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "approvals": [
    {
      "productId": "product_id_1",
      "status": "Approved",
      "approvedQuantity": 10,
      "expirationDate": "2027-03-05",
      "batchNumber": "BATCH-2026-001"
    },
    {
      "productId": "product_id_2",
      "status": "Rejected"
    }
  ]
}

Response: 200 OK
{
  "message": "Stock request processed successfully",
  "data": {...}
}
```

---

### 🔧 Quantity Adjustment Request System

#### Staff: Create Quantity Adjustment Request
```http
POST /api/staff/quantity-adjustments
Authorization: Bearer {token}
Content-Type: application/json

{
  "productId": "product_id",
  "actualQuantity": 15,
  "reason": "Physical count shows 15 units, system shows 20"
}

Response: 201 Created
{
  "message": "Quantity adjustment request created successfully",
  "data": {
    "_id": "...",
    "productId": "...",
    "productName": "Gloves",
    "systemQuantity": 20,
    "actualQuantity": 15,
    "difference": -5,
    "reason": "Physical count shows 15 units",
    "status": "Pending",
    ...
  }
}
```

#### Staff: Get Own Adjustment Requests
```http
GET /api/staff/quantity-adjustments
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 3,
  "data": [...]
}
```

#### Owner: Get All Adjustment Requests
```http
GET /api/owner/quantity-adjustments?status=Pending
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 5,
  "data": [...]
}
```

#### Owner: Review Adjustment Request
```http
PATCH /api/owner/quantity-adjustments/:id/review
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "Approved", // Approved | Rejected
  "rejectionReason": "Reason for rejection (if rejected)"
}

Response: 200 OK
{
  "message": "Adjustment request approved",
  "data": {...}
}
```

---

### 📅 Inventory Expiration Filters

#### Get Inventory with Expiration Filters
```http
GET /api/staff/inventory?expirationFilter=expiring_week
Authorization: Bearer {token}

Query Parameters:
- expirationFilter: expiring_week | expiring_month | out_of_stock

Response: 200 OK
{
  "count": 8,
  "data": [
    {
      "itemId": "...",
      "itemName": "Alcohol 70%",
      "quantity": 20,
      "expiryDate": "2026-03-10",
      "expirationStatus": "expiring_week", // good | expiring_month | expiring_week | expired
      "daysUntilExpiry": 5,
      ...
    }
  ]
}
```

---

### 🔔 Notification System

#### Get Notifications
```http
GET /api/notifications
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 15,
  "unreadCount": 5,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "role": "staff",
      "message": "Alcohol 70% expires in 5 day(s)",
      "type": "item_expiration",
      "redirectUrl": "/inventory",
      "isRead": false,
      "createdAt": "2026-03-05T10:00:00Z"
    }
  ]
}
```

#### Get Unread Count
```http
GET /api/notifications/unread-count
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 5
}
```

#### Mark Notification as Read
```http
PATCH /api/notifications/:id/read
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "Notification marked as read",
  "data": {...}
}
```

#### Mark All as Read
```http
PATCH /api/notifications/mark-all-read
Authorization: Bearer {token}

Response: 200 OK
{
  "message": "All notifications marked as read"
}
```

---

### 🧾 Updated Billing Endpoints

#### Create Transaction (with Patient Name)
```http
POST /api/staff/billing/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "patientId": "PT-20260305-1234",
  "patientName": "Juan Dela Cruz", // Optional - auto-generated if not provided
  "items": [
    {
      "productId": "...",
      "quantity": 2
    }
  ],
  "discountRate": 0
}

Response: 201 Created
{
  "message": "Billing transaction created",
  "data": {
    "transactionId": "...",
    "patientId": "PT-20260305-1234",
    "patientName": "Juan Dela Cruz",
    "items": [...],
    "subtotal": 100,
    "discountAmount": 0,
    "totalAmount": 100,
    "vatIncluded": 10.71, // Reverse calculated
    "netAmount": 89.29,   // Reverse calculated
    ...
  }
}
```

#### Void Transaction (with Edit Modal)
```http
PATCH /api/staff/billing/:id/void
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Incorrect item quantity",
  "editedData": {
    "patientId": "PT-20260305-5678",
    "patientName": "Maria Santos",
    "items": [...], // Updated items
    "notes": "Updated patient information before void"
  }
}

Response: 200 OK
{
  "message": "Transaction voided successfully",
  "data": {
    "transactionId": "...",
    "status": "VOIDED",
    "voidedAt": "2026-03-05T10:30:00Z",
    "voidReason": "Incorrect item quantity",
    "editedPatientId": "PT-20260305-5678",
    "editedPatientName": "Maria Santos",
    "editedItems": [...],
    "voidNotes": "Updated patient information before void"
  }
}
```

#### Get Billing History
```http
GET /api/staff/billing/history
Authorization: Bearer {token}

Response: 200 OK
{
  "count": 50,
  "data": [
    {
      "transactionId": "...",
      "patientId": "PT-20260305-1234",
      "patientName": "Juan Dela Cruz", // Now included
      "dateTime": "2026-03-05T10:00:00Z",
      "totalAmount": 100,
      "vatIncluded": 10.71,
      "netAmount": 89.29,
      "status": "COMPLETED",
      ...
    }
  ]
}
```

---

## Notification Types

| Type | Trigger | Recipient | Redirect |
|------|---------|-----------|----------|
| `out_of_stock` | Product quantity = 0 | Owner + Staff | /inventory |
| `low_stock` | Product quantity ≤ minStock | Owner | /inventory |
| `stock_request_sent` | Staff creates stock request | Owner | /stock-requests |
| `stock_request_approved` | Owner approves request | Staff | /stock-requests |
| `stock_request_rejected` | Owner rejects request | Staff | /stock-requests |
| `item_expiration` | Product expires ≤ 7 days | Owner + Staff | /inventory |
| `inventory_adjustment_request` | Staff creates adjustment | Owner | /inventory-adjustments |
| `expense_submitted` | Staff submits expense | Owner | /expenses |
| `expense_reviewed` | Owner reviews expense | Staff | /expenses |
| `expense_approved` | Owner approves expense | Staff | /expenses |

---

## Database Schema Updates

### STAFF_BillingTransaction
```javascript
{
  patientId: String,
  patientName: String,        // NEW - Required
  vatIncluded: Number,        // NEW - Reverse calculated VAT
  netAmount: Number,          // NEW - Price without VAT
  editedPatientId: String,    // NEW - For void modal
  editedPatientName: String,  // NEW - For void modal
  editedItems: Array,         // NEW - For void modal
  voidNotes: String,          // NEW - For void modal
  ...
}
```

### STAFF_Expense (NEW)
```javascript
{
  title: String,
  category: "Meals" | "Supplies" | "Transportation" | "Others",
  amount: Number,
  description: String,
  date: Date,
  staffId: ObjectId,
  staffName: String,
  receiptImage: String,
  status: "Pending" | "Reviewed" | "Approved",
  reviewedBy: ObjectId,
  reviewedAt: Date
}
```

### STAFF_StockRequest (NEW)
```javascript
{
  requestId: String,
  staffId: ObjectId,
  staffName: String,
  items: [{
    productId: ObjectId,
    productName: String,
    currentStock: Number,
    requestedQuantity: Number,
    status: "Pending" | "Approved" | "Rejected",
    approvedQuantity: Number,
    expirationDate: Date,
    batchNumber: String
  }],
  status: "Pending" | "Partially Approved" | "Approved" | "Rejected",
  reviewedBy: ObjectId,
  reviewedAt: Date,
  notes: String
}
```

### STAFF_QuantityAdjustment (NEW)
```javascript
{
  productId: ObjectId,
  productName: String,
  systemQuantity: Number,
  actualQuantity: Number,
  difference: Number,
  reason: String,
  staffId: ObjectId,
  staffName: String,
  status: "Pending" | "Approved" | "Rejected",
  reviewedBy: ObjectId,
  reviewedAt: Date,
  rejectionReason: String
}
```

### Notification (NEW)
```javascript
{
  userId: ObjectId,           // null for broadcast
  role: "staff" | "owner",
  message: String,
  type: String,               // See notification types above
  redirectUrl: String,
  isRead: Boolean,
  relatedId: ObjectId,
  createdAt: Date
}
```

---

## Breaking Changes

### ⚠️ Billing Calculation Changes
- **Before**: `Total = Subtotal - Discount + VAT`
- **After**: `Total = Subtotal - Discount` (VAT already included)
- **Impact**: Frontend must update to show `vatIncluded` and `netAmount` instead of adding VAT

### ⚠️ Required Fields
- `patientName` is now required when creating billing transactions
- If not provided, system auto-generates a name

---

## Migration Notes

### Existing Billing Transactions
- Old transactions without `patientName` will need migration script
- Suggest setting `patientName = "Legacy Patient"` for old records

### Expiration Monitoring
- Run expiration notification check daily (cron job recommended)
- Import and call `checkExpirationNotifications()` and `checkStockNotifications()`

---

## Frontend Updates Required

### 1. Billing Interface
- Add patient name input field
- Update VAT display to show:
  - Total Due: ₱100
  - VAT Included: ₱10.71
  - Net Price: ₱89.29
- Update void modal to include edit fields

### 2. Expenses Module
- Create staff expense submission form
- Create owner expense monitoring dashboard
- Add filters: date range, staff name, category

### 3. Stock Request
- Create multi-item selection interface
- Show low stock items automatically
- Owner approval interface with expiration date input

### 4. Inventory Adjustments
- Staff form: product, actual quantity, reason
- Owner review interface: approve/reject

### 5. Expiration Warnings
- Add filter buttons: "Out of Stock", "Expiring 1 Week", "Expiring 1 Month"
- Show colored indicators on inventory cards
- 🔴 Red dot: Expires ≤ 7 days
- 🟠 Orange dot: Expires ≤ 30 days

### 6. Notification System
- Add notification bell icon with badge
- Dropdown notification list
- Click notification → mark as read + redirect
- Show unread count

---

## Testing Checklist

- [ ] VAT calculation shows correct breakdown
- [ ] Patient name auto-generates if not provided
- [ ] Expense creation and approval flow works
- [ ] Multi-item stock request submission works
- [ ] Stock request approval updates inventory
- [ ] Quantity adjustment updates inventory
- [ ] Expiration filters show correct items
- [ ] Notifications are created for all triggers
- [ ] Notification click redirects correctly
- [ ] Void modal saves edited data
- [ ] Billing history shows patient name
