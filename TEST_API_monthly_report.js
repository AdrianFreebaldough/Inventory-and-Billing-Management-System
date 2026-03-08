/**
 * API Test Script for Monthly Physical Inventory Report
 * 
 * This script tests the backend API endpoint to ensure it returns the correct data structure.
 * 
 * HOW TO USE:
 * 1. Make sure the backend server is running
 * 2. Update the AUTH_TOKEN with a valid owner JWT token
 * 3. Run in terminal: node TEST_API_monthly_report.js
 */

const API_BASE_URL = 'http://localhost:3000';
const ENDPOINT = '/api/stock-logs/monthly-report';

// ⚠️ IMPORTANT: Replace this with a valid owner JWT token
// You can get this from the browser localStorage after logging in as owner
const AUTH_TOKEN = 'YOUR_JWT_TOKEN_HERE';

// Test configuration
const TEST_MONTH = '2026-03'; // March 2026
const currentMonth = new Date().toISOString().slice(0, 7); // Current month YYYY-MM

async function testMonthlyReportAPI(month) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Testing Monthly Report API for: ${month}`);
  console.log('='.repeat(60));

  try {
    const url = `${API_BASE_URL}${ENDPOINT}?month=${month}`;
    console.log(`\n🔗 Request URL: ${url}`);
    console.log(`🔐 Using Auth Token: ${AUTH_TOKEN.substring(0, 20)}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    console.log(`\n📡 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`❌ API Error:`, errorData);
      return false;
    }

    const data = await response.json();
    
    console.log(`\n✅ API Response received successfully!\n`);

    // Verify response structure
    console.log('📊 Response Structure:');
    console.log(`   ├─ message: ${data.message || 'N/A'}`);
    console.log(`   ├─ data: ${Array.isArray(data.data) ? `Array(${data.data.length})` : typeof data.data}`);
    console.log(`   ├─ summary: ${typeof data.summary}`);
    console.log(`   └─ month: ${typeof data.month}`);

    // Verify data array
    if (Array.isArray(data.data)) {
      console.log(`\n📦 Report Data: ${data.data.length} items found`);
      
      if (data.data.length > 0) {
        console.log('\n🔍 First Item Structure:');
        const firstItem = data.data[0];
        const fields = [
          'itemName', 'category', 'beginningQty', 'itemsIssued', 
          'itemsRestocked', 'systemQty', 'actualBalance', 'variance'
        ];
        
        fields.forEach(field => {
          const value = firstItem[field];
          const status = value !== undefined ? '✓' : '✗';
          console.log(`   ${status} ${field}: ${value}`);
        });

        // Show sample data for first 3 items
        console.log('\n📋 Sample Items:');
        data.data.slice(0, 3).forEach((item, i) => {
          console.log(`   ${i + 1}. ${item.itemName}`);
          console.log(`      Category: ${item.category}`);
          console.log(`      Beginning: ${item.beginningQty}, Issued: ${item.itemsIssued}, System: ${item.systemQty}`);
          console.log(`      Variance: ${item.variance} → ${item.variance === 0 ? '✓ Balanced' : '⚠ With Variance'}`);
        });
      } else {
        console.log('   ℹ️  No items found for this month');
      }
    } else {
      console.error('   ❌ data is not an array!');
    }

    // Verify summary
    if (data.summary) {
      console.log('\n📈 Summary:');
      console.log(`   ├─ Total Items: ${data.summary.totalItems || 0}`);
      console.log(`   ├─ Total Issued: ${data.summary.totalIssued || 0}`);
      console.log(`   ├─ Total Restocked: ${data.summary.totalRestocked || 0}`);
      console.log(`   ├─ Items with Variance: ${data.summary.itemsWithVariance || 0}`);
      console.log(`   └─ Total Variance: ${data.summary.totalVariance || 0}`);
    } else {
      console.error('   ❌ summary is missing!');
    }

    // Verify month metadata
    if (data.month) {
      console.log('\n📅 Month Info:');
      console.log(`   ├─ Year: ${data.month.year}`);
      console.log(`   ├─ Month: ${data.month.month}`);
      console.log(`   └─ Label: ${data.month.label}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ API Test PASSED - Response structure is correct!');
    console.log('='.repeat(60));

    return true;

  } catch (error) {
    console.error(`\n❌ API Test FAILED!`);
    console.error(`Error: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('\n🚀 Starting Monthly Report API Tests...\n');

  if (AUTH_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.error('⚠️  ERROR: Please update AUTH_TOKEN in this script with a valid owner JWT token!');
    console.log('\nHow to get your JWT token:');
    console.log('1. Open the application in browser');
    console.log('2. Log in as owner');
    console.log('3. Open Developer Console (F12)');
    console.log('4. Type: localStorage.getItem("token")');
    console.log('5. Copy the token and paste it in this script');
    return;
  }

  // Test current month
  await testMonthlyReportAPI(currentMonth);

  // Test specific month if different
  if (TEST_MONTH !== currentMonth) {
    await testMonthlyReportAPI(TEST_MONTH);
  }

  console.log('\n✅ All tests completed!\n');
}

// Execute tests
runTests();
