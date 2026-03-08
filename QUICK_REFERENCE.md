# Quick Reference Guide - IBMS System Revision

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install node-cron  # For notification scheduling (if not already installed)
```

### 2. Run Migration (One-time)
```bash
cd backend
node migrationScript.js
```

### 3. Update server.js
Add notification cron service:

```javascript
import NotificationCronService from './notificationCronService.js';

// After database connection
const cronService = new NotificationCronService();
cronService.start();

// Optional: Run checks immediately on startup for testing
// await cronService.runNow();
```

### 4. Test the API
```bash
# Start server
npm start

# Test endpoints
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/notifications
```

---

## 🔑 Key API Endpoints

### Expenses
```bash
# Staff: Submit expense
POST /api/staff/expenses
{
  "title": "Office Supplies",
  "category": "Supplies",
  "amount": 500,
  "date": "2026-03-05",
  "description": "Pens and paper"
}

# Owner: Get summary
GET /api/owner/expenses/summary

# Owner: Approve expense
PATCH /api/owner/expenses/:id/status
{ "status": "Approved" }
```

### Stock Requests
```bash
# Staff: Get low stock items
GET /api/staff/stock-requests/low-stock-items

# Staff: Create multi-item request
POST /api/staff/stock-requests
{
  "items": [
    { "productId": "...", "requestedQuantity": 10 },
    { "productId": "...", "requestedQuantity": 20 }
  ],
  "notes": "Weekly restock"
}

# Owner: Approve request
PATCH /api/owner/stock-requests/:id/approve
{
  "approvals": [
    {
      "productId": "...",
      "status": "Approved",
      "approvedQuantity": 10,
      "expirationDate": "2027-03-05",
      "batchNumber": "BATCH-001"
    }
  ]
}
```

### Quantity Adjustments
```bash
# Staff: Submit adjustment
POST /api/staff/quantity-adjustments
{
  "productId": "...",
  "actualQuantity": 15,
  "reason": "Physical count shows 15, system shows 20"
}

# Owner: Review adjustment
PATCH /api/owner/quantity-adjustments/:id/review
{
  "status": "Approved"
}
```

### Notifications
```bash
# Get notifications
GET /api/notifications

# Get unread count
GET /api/notifications/unread-count

# Mark as read
PATCH /api/notifications/:id/read

# Mark all as read
PATCH /api/notifications/mark-all-read
```

### Inventory (with expiration filters)
```bash
# Get items expiring this week
GET /api/staff/inventory?expirationFilter=expiring_week

# Get items expiring this month
GET /api/staff/inventory?expirationFilter=expiring_month

# Get out of stock items
GET /api/staff/inventory?expirationFilter=out_of_stock
```

### Billing (updated)
```bash
# Create transaction with patient name
POST /api/staff/billing/create
{
  "patientId": "PT-20260305-1234",
  "patientName": "Juan Dela Cruz",  # Optional
  "items": [
    { "productId": "...", "quantity": 2 }
  ],
  "discountRate": 0
}

# Void with edits
PATCH /api/staff/billing/:id/void
{
  "reason": "Incorrect quantity",
  "editedData": {
    "patientId": "PT-NEW-ID",
    "patientName": "Updated Name",
    "items": [...],
    "notes": "Corrected before void"
  }
}
```

---

## 💡 Common Tasks

### Add Notification Widget to Dashboard

1. Add container in HTML:
```html
<div id="notificationWidget"></div>
```

2. Include script:
```html
<script src="../../JS/components/notificationWidget.js"></script>
```

3. Initialize:
```javascript
const notificationWidget = new NotificationWidget(API_BASE, token);
notificationWidget.init();
```

### Display VAT Breakdown

```javascript
// After getting transaction data
const totalDue = transaction.totalAmount;
const vatIncluded = transaction.vatIncluded;
const netPrice = transaction.netAmount;

// Display
document.getElementById('totalDue').textContent = `₱${totalDue.toFixed(2)}`;
document.getElementById('vatIncluded').textContent = `₱${vatIncluded.toFixed(2)}`;
document.getElementById('netPrice').textContent = `₱${netPrice.toFixed(2)}`;
```

### Show Expiration Indicators

```javascript
function getExpirationIndicator(item) {
  if (!item.expirationStatus) return '';
  
  const indicators = {
    'expiring_week': '🔴',
    'expiring_month': '🟠',
    'good': '🟢'
  };
  
  return indicators[item.expirationStatus] || '';
}
```

### Manually Trigger Notification Checks

```javascript
// In server code
import { checkExpirationNotifications, checkStockNotifications } from './services/expirationService.js';

// Run checks
await checkExpirationNotifications();
await checkStockNotifications();
```

---

## 🐛 Troubleshooting

### Problem: Notifications not appearing
- Check if `NotificationCronService` is started in server.js
- Verify notification endpoints are accessible
- Check browser console for errors in notificationWidget.js

### Problem: VAT calculation incorrect
- Verify product prices in database are VAT-inclusive
- Check if migration script was run
- Test with known values: ₱100 → Net: ₱89.29, VAT: ₱10.71

### Problem: Stock request not updating inventory
- Check if items were approved (status: "Approved")
- Verify product IDs are correct
- Check stock log entries for confirmation

### Problem: Expiration filters not working
- Ensure `expiryDate` field exists on products
- Check date format in database (should be Date object)
- Verify filter parameter matches: expiring_week, expiring_month, or out_of_stock

---

## 📋 Testing Checklist

```bash
# 1. Test expenses
✓ Staff can submit expense
✓ Owner sees expense in list
✓ Owner can approve expense
✓ Both receive notifications

# 2. Test stock requests
✓ Staff sees low stock items
✓ Staff can request multiple items
✓ Owner can approve individually
✓ Inventory updates on approval
✓ Expiration date saved

# 3. Test quantity adjustments
✓ Staff submits adjustment request
✓ Owner approves adjustment
✓ Inventory quantity updates
✓ Stock log created

# 4. Test notifications
✓ Notifications appear in widget
✓ Badge shows correct count
✓ Click marks as read
✓ Redirects to correct page

# 5. Test billing VAT
✓ VAT is NOT added on top
✓ Breakdown shows correctly
✓ Patient name saves/generates
✓ Void modal accepts edits

# 6. Test expiration filters
✓ Expiring week filter works
✓ Expiring month filter works
✓ Out of stock filter works
✓ Visual indicators display
```

---

## 🎯 Integration Priority

**Day 1**: Core functionality
1. Run migration script
2. Test billing VAT fix
3. Integrate notification widget
4. Test basic notifications

**Day 2**: New modules
1. Deploy expenses module
2. Test expense workflow
3. Deploy stock request system
4. Test multi-item requests

**Day 3**: Advanced features
1. Deploy quantity adjustments
2. Add expiration filters to UI
3. Setup cron service
4. Full system testing

---

## 📞 Need Help?

1. Check [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for detailed info
2. Review [API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md) for endpoints
3. Look at demo HTML files in `frontend/HTML/STAFF_*/` for examples
4. Check browser console for frontend errors
5. Check server logs for backend errors

---

## ✅ Final Validation

Before deploying to production:

- [ ] Migration script executed successfully
- [ ] All new endpoints tested with Postman/curl
- [ ] Notification widget displays correctly
- [ ] VAT calculation verified with multiple test cases
- [ ] Stock request flow tested end-to-end
- [ ] Expiration notifications generating
- [ ] Role-based access control verified
- [ ] Frontend demos reviewed and adapted
- [ ] Environment variables configured
- [ ] Database indexes created (automatic via models)

**Status**: Ready for integration and testing
