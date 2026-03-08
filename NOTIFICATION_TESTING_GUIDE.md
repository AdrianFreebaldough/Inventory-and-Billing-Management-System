# Quick Testing Guide - Notification Routing Fix

## Pre-Testing Setup

### 1. Start Backend Server
```bash
cd backend
node server.js
```
Expected output:
```
✅ Connected to MongoDB successfully
Backend server running on port 3000
```

### 2. Start Frontend (Live Server)
- Open `frontend/HTML/loginPage/loginPage.html` with Live Server
- Default URL: `http://127.0.0.1:5500/frontend/HTML/loginPage/loginPage.html`

## Test Scenarios

### Test 1: Staff Low Stock Notification

**Setup:**
1. Login as **Staff** user
2. Backend should have created low stock notifications

**Steps:**
1. Look at notification bell icon (should show red badge with count)
2. Click notification bell
3. Find a notification with message like "Product X is low in stock"
4. Click the notification

**Expected Result:**
- ✅ Notification dropdown closes
- ✅ Staff Inventory page loads
- ✅ No "Cannot GET /inventory" error
- ✅ Notification badge count decreases

**Troubleshooting:**
- If nothing happens: Check browser console for errors
- If wrong page loads: Verify `window.loadInventory` exists in console

---

### Test 2: Owner Stock Request Notification

**Setup:**
1. Have staff create a stock request
2. Login as **Owner** user

**Steps:**
1. Click notification bell
2. Find notification: "New stock request from [Staff Name]"
3. Click the notification

**Expected Result:**
- ✅ Inventory page loads
- ✅ Stock Requests tab shows in inventory module
- ✅ No "Cannot GET /stock-requests" error

---

### Test 3: Staff Expense Approval Notification

**Setup:**
1. Have owner approve a staff expense
2. Login as **Staff** user

**Steps:**
1. Click notification bell
2. Find notification: "Your expense has been approved"
3. Click the notification

**Expected Result:**
- ✅ Staff Expenses page loads in iframe
- ✅ No "Cannot GET /expenses" error
- ✅ Approved expense visible in list

---

### Test 4: Notification Badge Updates

**Steps:**
1. Login to dashboard (staff or owner)
2. Note unread notification count
3. Click ANY notification
4. Observe badge

**Expected Result:**
- ✅ Badge count decreases by 1
- ✅ Clicked notification no longer has blue highlight
- ✅ No duplicate notifications after refresh

---

## Console Testing Commands

Open browser console (F12) on dashboard page:

### Check if navigation functions exist
```javascript
// Staff Dashboard
console.log(typeof window.loadInventory);        // Should be "function"
console.log(typeof window.loadRequestStock);     // Should be "function"
console.log(typeof window.loadExpenses);         // Should be "function"
console.log(typeof window.loadActivityLog);      // Should be "function"

// Owner Dashboard
console.log(typeof window.loadInventory);        // Should be "function"
console.log(typeof window.loadExpenses);         // Should be "function"
console.log(typeof window.loadReports);          // Should be "function"
console.log(typeof window.loadUserManagement);   // Should be "function"
```

### Check user role detection
```javascript
// Check notification widget exists
console.log(window.notificationWidget);

// Check user role
console.log(localStorage.getItem('userRole'));

// Manually test navigation
window.loadInventory();  // Should load inventory page
```

### Test notification API directly
```javascript
// Get token
const token = localStorage.getItem('token');

// Fetch notifications
fetch('http://localhost:3000/api/notifications', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log('Notifications:', data);
  console.log('Sample redirectUrl:', data.data[0]?.redirectUrl);
});
```

Expected redirectUrl values: `inventory`, `expenses`, `stock-requests` (NO leading slash!)

---

## Verification Checklist

### Backend Verification
- [ ] Server running on port 3000
- [ ] MongoDB connected
- [ ] No errors in server console
- [ ] `/api/notifications` route responds

### Frontend Verification (Staff)
- [ ] Login successful
- [ ] Notification bell shows on dashboard
- [ ] Clicking bell opens dropdown
- [ ] Notifications display correctly
- [ ] Click inventory notification → loads inventory page
- [ ] Click expense notification → loads expenses page
- [ ] Click stock request notification → loads stock request page
- [ ] No console errors

### Frontend Verification (Owner)
- [ ] Login successful
- [ ] Notification bell shows on dashboard
- [ ] Clicking bell opens dropdown
- [ ] Notifications display correctly
- [ ] Click inventory notification → loads inventory page
- [ ] Click expense notification → loads expenses page
- [ ] Click stock request notification → loads inventory page
- [ ] No console errors

### Error Checks
- [ ] No "Cannot GET /inventory" errors
- [ ] No "Cannot GET /expenses" errors
- [ ] No "Cannot GET /stock-requests" errors
- [ ] No "window.loadInventory is not a function" errors
- [ ] No CORS errors
- [ ] No 404 errors for HTML files

---

## Common Test Failures & Solutions

### Failure: Notification bell doesn't appear
**Cause:** Notification widget not initialized  
**Check:** Console should show `window.notificationWidget` object  
**Solution:** Verify dashboard JS loaded completely

### Failure: Clicking notification does nothing
**Cause:** Navigation functions not exposed  
**Check:** `typeof window.loadInventory` should be "function"  
**Solution:** Hard refresh (Ctrl+Shift+R) to reload dashboard JS

### Failure: Wrong page loads  
**Cause:** Role detection failing  
**Check:** `localStorage.getItem('userRole')`  
**Solution:** Ensure role is saved during login

### Failure: "Cannot GET /inventory" error
**Cause:** Old notification with `/inventory` path  
**Check:** Inspect notification's redirectUrl in API response  
**Solution:** Backend needs to create new notifications (old ones have wrong paths)

### Failure: 401 Unauthorized on notifications API
**Cause:** Token missing or expired  
**Check:** `localStorage.getItem('token')`  
**Solution:** Re-login to get fresh token

---

## Mock Notification Creation (for Testing)

Use MongoDB Compass or mongosh to create test notifications:

### Low Stock Notification (Staff)
```javascript
db.notifications.insertOne({
  userId: ObjectId("YOUR_STAFF_ID"),
  role: "staff",
  message: "Medicine X is low in stock (5 remaining)",
  type: "low_stock",
  redirectUrl: "inventory",
  relatedId: ObjectId("PRODUCT_ID"),
  isRead: false,
  createdAt: new Date()
})
```

### Expense Submitted Notification (Owner)
```javascript
db.notifications.insertOne({
  userId: ObjectId("YOUR_OWNER_ID"),
  role: "owner",
  message: "New expense submitted by John Doe - Office Supplies",
  type: "expense_submitted",
  redirectUrl: "expenses",
  relatedId: ObjectId("EXPENSE_ID"),
  isRead: false,
  createdAt: new Date()
})
```

### Stock Request Approved (Staff)
```javascript
db.notifications.insertOne({
  userId: ObjectId("YOUR_STAFF_ID"),
  role: "staff",
  message: "Your stock request REQ-20260307-1234 has been approved",
  type: "stock_request_approved",
  redirectUrl: "stock-requests",
  relatedId: ObjectId("REQUEST_ID"),
  isRead: false,
  createdAt: new Date()
})
```

**Key:** Notice `redirectUrl` has NO leading slash!

---

## Success Criteria

All tests pass when:
1. ✅ All notifications redirect correctly
2. ✅ No "Cannot GET" errors appear
3. ✅ Notification badge updates properly
4. ✅ Both staff and owner dashboards work
5. ✅ Console shows no errors
6. ✅ Navigation is smooth and immediate

If all criteria met: **Notification routing is working correctly! 🎉**
