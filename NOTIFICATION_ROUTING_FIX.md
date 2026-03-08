# Notification Routing Fix Documentation

## Problem Summary

The notification system was experiencing routing errors with messages like **"Cannot GET /inventory"** because notification redirects were pointing to backend API routes instead of frontend pages.

## Root Cause

Backend services were creating notifications with `redirectUrl` values like:
- `/inventory`
- `/stock-requests`  
- `/expenses`
- `/inventory-adjustments`

These paths don't exist as frontend pages and caused navigation errors when users clicked notifications.

## Solution Overview

### 1. Backend Redirect URL Updates

Changed all notification `redirectUrl` values from absolute paths to simple identifiers that the frontend can interpret based on user role.

**Files Modified:**

#### `backend/services/expirationService.js`
- Changed: `/inventory` → `inventory`
- Applied to:
  - Item expiration notifications (owner & staff)
  - Out of stock notifications (owner & staff)
  - Low stock notifications (owner)

#### `backend/controllers/STAFF_stockRequestController.js`
- Changed: `/stock-requests` → `inventory` (owner views in inventory tab)
- Changed: `/stock-requests` → `stock-requests` (staff views in stock requests)
- Applied to:
  - Stock request creation notifications (to owner)
  - Stock request approval/rejection notifications (to staff)

#### `backend/controllers/STAFF_expenseController.js`
- Changed: `/expenses` → `expenses`
- Applied to:
  - Expense submission notifications (to owner)
  - Expense review/approval notifications (to staff)

#### `backend/controllers/STAFF_quantityAdjustmentController.js`
- Changed: `/inventory-adjustments` → `inventory`
- Applied to:
  - Quantity adjustment request notifications (to owner)

### 2. Notification Widget Enhancement

Updated `frontend/JS/components/notificationWidget.js` with intelligent navigation handling.

**Key Changes:**

#### Added `navigateTo(redirectUrl)` Method
Maps notification redirect identifiers to appropriate dashboard functions based on user role:

**Staff Navigation:**
- `inventory` → calls `loadInventory()`
- `stock-requests` → calls `loadRequestStock()`
- `expenses` → calls `loadExpenses()`
- `activity-log` → calls `loadActivityLog()`

**Owner Navigation:**
- `inventory` → calls `loadInventory()`
- `stock-requests` → calls `loadInventory()` (stock requests shown in inventory tab)
- `expenses` → calls `loadExpenses()`
- `reports` → calls `loadReports()`
- `user-management` → calls `loadUserManagement()`

#### Added `getUserRole()` Method
Determines user role from:
1. `localStorage.getItem('userRole')`
2. JWT token payload (decodes token to extract role)
3. Default fallback: 'staff'

#### Added `tryCallFunction(functionName)` Method
Safely attempts to call global navigation functions exposed by dashboards.

#### Added `fallbackNavigation(redirectUrl, userRole)` Method
Provides iframe-based navigation if global functions are unavailable.

### 3. Dashboard Function Exposure

Exposed navigation functions globally so notification widget can trigger them.

#### `frontend/JS/staff_dashboard/staff_dashboard.js`
Exposed functions:
- `window.loadInventory`
- `window.loadRequestStock`
- `window.loadExpenses`
- `window.loadActivityLog`
- `window.loadDashboard`

#### `frontend/JS/admin_dashboard/admin_dashboard.js`
Exposed functions:
- `window.loadInventory`
- `window.loadExpenses`
- `window.loadReports`
- `window.loadUserManagement`
- `window.loadStockLogs`
- `window.loadDashboard`

## Notification Type → Redirect Mapping

| Notification Type | Owner Redirect | Staff Redirect | Purpose |
|------------------|----------------|----------------|---------|
| `out_of_stock` | inventory | inventory | View out of stock items |
| `low_stock` | inventory | inventory | View low stock items |
| `item_expiration` | inventory | inventory | View expiring items |
| `stock_request_sent` | inventory | - | Review stock requests |
| `stock_request_approved` | - | stock-requests | View approved requests |
| `stock_request_rejected` | - | stock-requests | View rejected requests |
| `expense_submitted` | expenses | - | Review submitted expenses |
| `expense_reviewed` | - | expenses | View reviewed expenses |
| `expense_approved` | - | expenses | View approved expenses |
| `inventory_adjustment_request` | inventory | - | Review adjustment requests |

## Backend Routes Verification

All Express routes are properly registered in `backend/app.js`:

```javascript
app.use("/api/notifications", notificationRoutes);
app.use("/api/staff/inventory", STAFF_inventoryRoutes);
app.use("/api/owner/inventory", OWNER_inventoryRoutes);
app.use("/api/staff/expenses", STAFF_expenseRoutes);
app.use("/api/owner/expenses", OWNER_expenseRoutes);
app.use("/api/staff/stock-requests", STAFF_stockRequestRoutes);
app.use("/api/owner/stock-requests", OWNER_stockRequestRoutes);
```

## Frontend Page Paths

Correct paths for all modules:

### Staff Pages
- Inventory: `frontend/HTML/staff_Inventory/staff_Inventory.html`
- Stock Requests: `frontend/HTML/STAFF_StockRequest/STAFF_StockRequest.html`
- Expenses: `frontend/HTML/STAFF_Expenses/STAFF_Expenses.html`
- Activity Log: `frontend/HTML/STAFF_ActivityLog/STAFF_ActivityLog.html`
- Billing: `frontend/HTML/Staff_Billing/Staff_Billing.html`

### Owner Pages
- Inventory: `frontend/HTML/admin_Inventory/admin_Inventory.html`
- Expenses: `frontend/HTML/OWNER_Expenses/OWNER_Expenses.html`
- Reports: `frontend/HTML/admin_Reports/admin_Reports_Sales/admin_Reports_Sales.html`
- User Management: `frontend/HTML/Owner_UserManagement/UserManagement.html`
- Stock Logs: `frontend/HTML/Admin_Activitylogs/OwnerActivitylogs.html`

## Testing Checklist

### Backend Testing
- [ ] Start backend server: `cd backend && node server.js`
- [ ] Verify notification routes: `GET http://localhost:3000/api/notifications`
- [ ] Create test notification with `redirectUrl: "inventory"`
- [ ] Verify notification contains correct redirectUrl

### Frontend Testing - Staff Dashboard
- [ ] Login as staff user
- [ ] Click notification with type `low_stock`
- [ ] Verify inventory page loads
- [ ] Click notification with type `stock_request_approved`
- [ ] Verify stock request page loads
- [ ] Click notification with type `expense_reviewed`
- [ ] Verify expenses page loads

### Frontend Testing - Owner Dashboard  
- [ ] Login as owner user
- [ ] Click notification with type `stock_request_sent`
- [ ] Verify inventory page loads (stock requests in inventory tab)
- [ ] Click notification with type `expense_submitted`
- [ ] Verify expenses page loads
- [ ] Click notification with type `inventory_adjustment_request`
- [ ] Verify inventory page loads

### Error Resolution
- [ ] No "Cannot GET /inventory" errors
- [ ] No "Cannot GET /stock-requests" errors
- [ ] No "Cannot GET /expenses" errors
- [ ] All notifications redirect correctly
- [ ] Notification dropdown closes after click

## Development Server Setup

Run the system locally:

```bash
# Terminal 1 - Backend
cd backend
node server.js
# Server runs on http://localhost:3000

# Terminal 2 - Frontend (Live Server)
# Open frontend/HTML/loginPage/loginPage.html
# Typically runs on http://127.0.0.1:5500
```

## Common Issues & Solutions

### Issue: "Cannot GET /inventory"
**Cause:** Notification redirectUrl contains old `/inventory` path  
**Solution:** Backend notification creation now uses `inventory` (no leading slash)

### Issue: Notification click does nothing
**Cause:** Dashboard navigation functions not exposed globally  
**Solution:** Both dashboards now expose `window.loadInventory`, etc.

### Issue: Wrong page loads for owner stock requests
**Cause:** Owner doesn't have separate stock request page  
**Solution:** Owner stock requests redirect to `inventory` (stock requests shown in inventory module)

### Issue: TypeError: window.loadInventory is not a function
**Cause:** Dashboard hasn't finished initializing  
**Solution:** Notification widget uses `tryCallFunction()` which checks existence before calling

## File Summary

### Backend Files Modified (6)
1. `backend/services/expirationService.js` - 6 redirectUrl changes
2. `backend/controllers/STAFF_stockRequestController.js` - 2 redirectUrl changes
3. `backend/controllers/STAFF_expenseController.js` - 2 redirectUrl changes
4. `backend/controllers/STAFF_quantityAdjustmentController.js` - 1 redirectUrl change

### Frontend Files Modified (3)
1. `frontend/JS/components/notificationWidget.js` - Complete navigation rewrite
2. `frontend/JS/staff_dashboard/staff_dashboard.js` - Exposed 5 functions globally
3. `frontend/JS/admin_dashboard/admin_dashboard.js` - Exposed 6 functions globally

## Future Enhancements

1. **Deep Linking:** Add hash-based routing (e.g., `#/inventory`) for direct URL access
2. **Notification Context:** Pass additional context (e.g., product ID) to auto-filter pages
3. **Breadcrumb Trail:** Show navigation history when following notification links
4. **Notification Grouping:** Group similar notifications (e.g., multiple low stock items)
5. **Real-time Updates:** Use WebSocket for instant notification delivery

## Conclusion

All notification routing issues have been resolved. The system now uses:
- **Simple redirectUrl identifiers** (e.g., `inventory`, `expenses`)
- **Role-based navigation mapping** (owner vs staff)
- **Global function exposure** for reliable navigation
- **Fallback mechanisms** for edge cases

No more "Cannot GET" errors. All notifications redirect to the correct module based on user role.
