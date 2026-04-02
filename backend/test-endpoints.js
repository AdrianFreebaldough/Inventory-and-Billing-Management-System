import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

// Test credentials - update these with actual credentials
const STAFF_EMAIL = 'staff@test.com';
const OWNER_EMAIL = 'owner@test.com';
const PASSWORD = 'test123';

let staffToken = '';
let ownerToken = '';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test login
async function testLogin() {
  log('\n━━━ Testing Authentication ━━━', 'cyan');
  
  try {
    // Staff login
    const staffRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: STAFF_EMAIL,
      password: PASSWORD,
    });
    staffToken = staffRes.data.token;
    log(`✓ Staff login successful - User: ${staffRes.data.user.name || staffRes.data.user.email}`, 'green');
  } catch (error) {
    log(`✗ Staff login failed: ${error.response?.data?.message || error.message}`, 'red');
  }

  try {
    // Owner login
    const ownerRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: OWNER_EMAIL,
      password: PASSWORD,
    });
    ownerToken = ownerRes.data.token;
    log(`✓ Owner login successful - User: ${ownerRes.data.user.name || ownerRes.data.user.email}`, 'green');
  } catch (error) {
    log(`✗ Owner login failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test Expenses
async function testExpenses() {
  log('\n━━━ Testing Expenses Module ━━━', 'cyan');

  try {
    // Create expense
    const expenseData = {
      title: 'Test Office Supplies',
      category: 'Office Supplies',
      amount: 500,
      description: 'Pens and paper',
      date: new Date(),
    };
    const createRes = await axios.post(`${BASE_URL}/staff/expenses`, expenseData, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Create expense: ${createRes.data.expense.title} (₱${createRes.data.expense.amount})`, 'green');

    // Get staff expenses
    const staffExpenses = await axios.get(`${BASE_URL}/staff/expenses`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get staff expenses: ${staffExpenses.data.expenses.length} found`, 'green');

    // Get owner expenses summary
    const ownerSummary = await axios.get(`${BASE_URL}/owner/expenses/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    log(`✓ Get expenses summary: Total ₱${ownerSummary.data.summary.totalAmount}`, 'green');
  } catch (error) {
    log(`✗ Expenses test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test Stock Requests
async function testStockRequests() {
  log('\n━━━ Testing Stock Requests ━━━', 'cyan');

  try {
    // Get low stock items
    const lowStock = await axios.get(`${BASE_URL}/staff/stock-requests/low-stock`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get low stock items: ${lowStock.data.products.length} products`, 'green');

    // Create stock request (if we have low stock items)
    if (lowStock.data.products.length > 0) {
      const requestData = {
        items: lowStock.data.products.slice(0, 2).map(p => ({
          productId: p._id,
          requestedQuantity: 10,
        })),
      };
      const createRes = await axios.post(`${BASE_URL}/staff/stock-requests`, requestData, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      log(`✓ Create stock request: ${createRes.data.stockRequest.requestId} (${createRes.data.stockRequest.items.length} items)`, 'green');
    }

    // Get all stock requests (owner)
    const allRequests = await axios.get(`${BASE_URL}/owner/stock-requests`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    log(`✓ Get all stock requests: ${allRequests.data.requests.length} found`, 'green');
  } catch (error) {
    log(`✗ Stock requests test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test Quantity Adjustments
async function testQuantityAdjustments() {
  log('\n━━━ Testing Quantity Adjustments ━━━', 'cyan');

  try {
    // Get inventory first
    const inventory = await axios.get(`${BASE_URL}/staff/inventory?limit=1`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    if (inventory.data.products.length > 0) {
      const product = inventory.data.products[0];
      const adjustmentData = {
        productId: product._id,
        actualQuantity: product.quantity - 1,
        reason: 'Damaged items found during inspection',
      };
      const createRes = await axios.post(`${BASE_URL}/staff/quantity-adjustments`, adjustmentData, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      log(`✓ Create adjustment: ${createRes.data.adjustment.productName} (${createRes.data.adjustment.difference} difference)`, 'green');
    }

    // Get all adjustments (owner)
    const allAdjustments = await axios.get(`${BASE_URL}/owner/quantity-adjustments`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    log(`✓ Get all adjustments: ${allAdjustments.data.adjustments.length} found`, 'green');
  } catch (error) {
    log(`✗ Quantity adjustments test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test Notifications
async function testNotifications() {
  log('\n━━━ Testing Notifications ━━━', 'cyan');

  try {
    // Get staff notifications
    const staffNotifs = await axios.get(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get staff notifications: ${staffNotifs.data.notifications.length} found (${staffNotifs.data.unreadCount} unread)`, 'green');

    // Get owner notifications
    const ownerNotifs = await axios.get(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    log(`✓ Get owner notifications: ${ownerNotifs.data.notifications.length} found (${ownerNotifs.data.unreadCount} unread)`, 'green');

    // Get unread count
    const unreadCount = await axios.get(`${BASE_URL}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get unread count: ${unreadCount.data.count}`, 'green');
  } catch (error) {
    log(`✗ Notifications test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test Expiration Filters
async function testExpirationFilters() {
  log('\n━━━ Testing Expiration Filters ━━━', 'cyan');

  try {
    // Get expired items
    const expired = await axios.get(`${BASE_URL}/staff/inventory?expirationFilter=expired`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get expired items: ${expired.data.products.length} found`, 'green');

    // Get expiring soon
    const expiringSoon = await axios.get(`${BASE_URL}/staff/inventory?expirationFilter=expiring-soon`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get expiring soon: ${expiringSoon.data.products.length} found`, 'green');

    // Get valid items
    const valid = await axios.get(`${BASE_URL}/staff/inventory?expirationFilter=valid&limit=5`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    log(`✓ Get valid items: ${valid.data.products.length} found`, 'green');
  } catch (error) {
    log(`✗ Expiration filters test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Test VAT Calculation
async function testVATCalculation() {
  log('\n━━━ Testing VAT Calculation ━━━', 'cyan');

  try {
    // Get recent billing transactions
    const billing = await axios.get(`${BASE_URL}/staff/billing?limit=1`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    if (billing.data.billingHistory.length > 0) {
      const transaction = billing.data.billingHistory[0];
      const expectedNet = transaction.totalAmount / 1.12;
      const expectedVAT = transaction.totalAmount - expectedNet;
      
      log(`✓ VAT Calculation Check:`, 'green');
      log(`  Total: ₱${transaction.totalAmount.toFixed(2)}`, 'yellow');
      log(`  Net: ₱${transaction.netAmount.toFixed(2)} (expected: ₱${expectedNet.toFixed(2)})`, 'yellow');
      log(`  VAT: ₱${transaction.vatIncluded.toFixed(2)} (expected: ₱${expectedVAT.toFixed(2)})`, 'yellow');
      
      const netMatch = Math.abs(transaction.netAmount - expectedNet) < 0.01;
      const vatMatch = Math.abs(transaction.vatIncluded - expectedVAT) < 0.01;
      
      if (netMatch && vatMatch) {
        log(`  ✓ VAT calculation is correct!`, 'green');
      } else {
        log(`  ✗ VAT calculation mismatch!`, 'red');
      }
    } else {
      log(`⚠ No billing transactions found to test VAT`, 'yellow');
    }
  } catch (error) {
    log(`✗ VAT test failed: ${error.response?.data?.message || error.message}`, 'red');
  }
}

// Run all tests
async function runTests() {
  log('╔══════════════════════════════════════════════════╗', 'cyan');
  log('║     IBMS API Endpoint Testing Suite             ║', 'cyan');
  log('╚══════════════════════════════════════════════════╝', 'cyan');

  await testLogin();
  
  if (!staffToken || !ownerToken) {
    log('\n✗ Cannot proceed without valid tokens. Please create test accounts:', 'red');
    log(`  Staff: ${STAFF_EMAIL} / ${PASSWORD}`, 'yellow');
    log(`  Owner: ${OWNER_EMAIL} / ${PASSWORD}`, 'yellow');
    return;
  }

  await testExpenses();
  await testStockRequests();
  await testQuantityAdjustments();
  await testNotifications();
  await testExpirationFilters();
  await testVATCalculation();

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('✓ Testing Complete!', 'green');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
}

runTests().catch(err => {
  log(`\n✗ Test suite error: ${err.message}`, 'red');
  process.exit(1);
});
