# Stock Logs - Quick Test Checklist

## ✅ Pre-Test Setup
- [ ] Backend server is running (`cd backend && node server.js`)
- [ ] Database has some stock movement data
- [ ] Logged in as Owner role
- [ ] Browser console is open (F12) for debugging

## ✅ Test 1: Basic Chart Rendering
**Steps:**
1. Navigate to Dashboard → Stock Logs
2. Click "Logs Report" tab
3. Select current month from dropdown
4. Click "Generate Report" button

**Expected:**
- [ ] Loading spinner appears briefly
- [ ] Two charts render successfully:
  - [ ] Inventory Overview (grouped bar chart)
  - [ ] Variance Analysis (horizontal bar chart)
- [ ] Chart title shows: "Inventory Overview — [Month Year]"
- [ ] Chart subtitle shows stats (X items tracked • Y total issued • Z with variance)
- [ ] Console shows logs:
  ```
  [LogsReport] Starting chart render with X items
  [LogsReport] Chart.js version: 4.x.x
  [LogsReport] Overview chart created successfully
  [LogsReport] Variance chart created successfully
  [LogsReport] Charts resized after delay
  ```

## ✅ Test 2: Print Functionality
**Steps:**
1. After generating a report (Test 1)
2. Click "Print Report" button (gray button with printer icon)

**Expected:**
- [ ] New window opens with print preview
- [ ] Print dialog appears automatically
- [ ] Print preview shows:
  - [ ] Report title and month
  - [ ] Summary statistics
  - [ ] Inventory Overview chart as image
  - [ ] Variance Analysis chart as image
  - [ ] Footer with timestamp
  - [ ] Clean layout (no sidebar/navigation)

## ✅ Test 3: Error Handling
**Steps:**
1. Try clicking "Print Report" BEFORE generating a report

**Expected:**
- [ ] Alert shows: "Please generate a report first before printing."
- [ ] No print window opens

## ✅ Test 4: Multiple Months
**Steps:**
1. Generate report for Month A
2. Change month to Month B
3. Click "Generate Report" again

**Expected:**
- [ ] Old charts disappear
- [ ] New charts render with Month B data
- [ ] Title updates to Month B
- [ ] No duplicate/overlapping charts

## ✅ Test 5: Empty Month
**Steps:**
1. Select a future month (no data expected)
2. Click "Generate Report"

**Expected:**
- [ ] Empty state displays
- [ ] Shows icon and message: "No inventory data found"
- [ ] No charts render

## 🐛 If Something Doesn't Work

### Charts not rendering?
1. Check browser console for errors
2. Verify Chart.js loaded: Type `window.Chart` in console - should show function
3. Check Network tab - verify `/api/stock-logs/monthly-report` returns data
4. Hard refresh page (Ctrl+Shift+R)

### Print not working?
1. Check if pop-ups are blocked (allow for this site)
2. Ensure report was generated first
3. Check console for errors

### Need help?
- Open browser DevTools (F12)
- Go to Console tab
- Look for red errors or [LogsReport] logs
- Share console output for debugging

## 📝 Notes
- First time might take slightly longer as Chart.js loads
- Charts with 50+ items may take 1-2 seconds to render
- Print uses high-quality images (may take a moment to load)

---
**Files Modified:**
- `frontend/JS/Admin_Activitylogs/OwnerActivitylogs.js` - Chart rendering + print function
- `frontend/HTML/Admin_Activitylogs/OwnerActivitylogs.html` - Added Print button

**Zero backend changes needed** - API endpoint already working correctly!
