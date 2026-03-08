/**
 * BROWSER CONSOLE TEST SCRIPT
 * Monthly Physical Inventory Report - Quick Test
 * 
 * HOW TO USE:
 * 1. Open the application in browser and log in as owner
 * 2. Navigate to: Admin Dashboard → Stock Logs → Logs Report tab
 * 3. Open Developer Console (F12)
 * 4. Copy and paste this entire script into the console
 * 5. Press Enter to run
 * 
 * This will test the report generation and display diagnostic information
 */

(async function testMonthlyReport() {
  console.clear();
  console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #3b82f6; font-weight: bold;');
  console.log('%c║   Monthly Physical Inventory Report - Diagnostic Test    ║', 'color: #3b82f6; font-weight: bold;');
  console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #3b82f6; font-weight: bold;');
  console.log('');

  // Test 1: Check if required DOM elements exist
  console.log('%c📋 Test 1: DOM Elements Check', 'color: #0ea5e9; font-weight: bold;');
  console.log('─'.repeat(60));

  const elements = {
    reportMonthFilter: document.getElementById('reportMonthFilter'),
    generateReport: document.getElementById('generateReport'),
    reportTableSection: document.getElementById('reportTableSection'),
    reportTableBody: document.getElementById('reportTableBody'),
    chartTitle: document.getElementById('chartTitle'),
    chartSubtitle: document.getElementById('chartSubtitle')
  };

  let allElementsFound = true;
  for (const [name, element] of Object.entries(elements)) {
    const status = element ? '✅' : '❌';
    console.log(`${status} ${name}: ${element ? 'Found' : 'NOT FOUND'}`);
    if (!element) allElementsFound = false;
  }

  if (!allElementsFound) {
    console.error('%c❌ CRITICAL: Some required DOM elements are missing!', 'color: #ef4444; font-weight: bold;');
    console.log('Make sure you are on the Logs Report tab.');
    return;
  }

  console.log('%c✅ All DOM elements found!', 'color: #10b981;');
  console.log('');

  // Test 2: Check if month is selected
  console.log('%c📅 Test 2: Month Selection', 'color: #0ea5e9; font-weight: bold;');
  console.log('─'.repeat(60));

  const selectedMonth = elements.reportMonthFilter.value;
  const selectedMonthText = elements.reportMonthFilter.options[elements.reportMonthFilter.selectedIndex]?.text;

  if (!selectedMonth) {
    console.warn('⚠️  No month selected - selecting current month automatically');
    elements.reportMonthFilter.selectedIndex = 0;
  }

  console.log(`✅ Selected Month: ${selectedMonthText} (${selectedMonth})`);
  console.log('');

  // Test 3: Test API endpoint
  console.log('%c🌐 Test 3: API Endpoint Test', 'color: #0ea5e9; font-weight: bold;');
  console.log('─'.repeat(60));

  const apiUrl = `/api/stock-logs/monthly-report?month=${selectedMonth}`;
  console.log(`📡 Testing: ${apiUrl}`);

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ No authentication token found! Please log in.');
      return;
    }

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ API Response received successfully!');
    console.log('');

    // Test 4: Verify response structure
    console.log('%c📦 Test 4: Response Structure', 'color: #0ea5e9; font-weight: bold;');
    console.log('─'.repeat(60));

    console.log('Response keys:', Object.keys(data));
    console.log('');

    console.table({
      'Has message': Boolean(data.message),
      'Has data array': Array.isArray(data.data),
      'Data length': data.data?.length || 0,
      'Has summary': Boolean(data.summary),
      'Has month': Boolean(data.month)
    });

    if (data.data && data.data.length > 0) {
      console.log('');
      console.log('%c📋 Sample Item (first in array):', 'color: #8b5cf6;');
      console.log(data.data[0]);

      console.log('');
      console.log('%c📊 Summary:', 'color: #8b5cf6;');
      console.log(data.summary);
    } else {
      console.warn('⚠️  No items found in the response for this month');
    }

    // Test 5: Check if table rendering works
    console.log('');
    console.log('%c🎨 Test 5: Table Rendering', 'color: #0ea5e9; font-weight: bold;');
    console.log('─'.repeat(60));

    const tableSection = document.getElementById('reportTableSection');
    const tableBody = document.getElementById('reportTableBody');

    console.log('Before rendering:');
    console.log(`├─ Table section hidden: ${tableSection?.classList.contains('hidden')}`);
    console.log(`└─ Table rows: ${tableBody?.children.length || 0}`);

    // Trigger the generate report button
    console.log('');
    console.log('⏳ Triggering report generation...');
    elements.generateReport.click();

    // Wait a bit for the async operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('After rendering:');
    console.log(`├─ Table section hidden: ${tableSection?.classList.contains('hidden')}`);
    console.log(`├─ Table rows: ${tableBody?.children.length || 0}`);
    console.log(`└─ Table innerHTML length: ${tableBody?.innerHTML.length || 0} characters`);

    if (tableBody?.children.length > 0) {
      console.log('%c✅ SUCCESS: Table rendered with data!', 'color: #10b981; font-weight: bold;');
      console.log('');
      console.log('Sample row HTML (first row):');
      console.log(tableBody.children[0]?.outerHTML);
    } else if (data.data && data.data.length > 0) {
      console.error('%c❌ ISSUE: API returned data but table is empty!', 'color: #ef4444; font-weight: bold;');
      console.log('');
      console.log('Debugging info:');
      console.log('• Check console for [LogsReport] error messages');
      console.log('• Verify renderReportTable function is being called');
      console.log('• Check if there are any JavaScript errors');
    } else {
      console.warn('%c⚠️  No data to display (API returned empty array)', 'color: #f59e0b;');
    }

    // Test 6: Check generatedReport global variable
    console.log('');
    console.log('%c💾 Test 6: Generated Report Storage', 'color: #0ea5e9; font-weight: bold;');
    console.log('─'.repeat(60));

    // Wait a bit more to ensure generatedReport is set
    await new Promise(resolve => setTimeout(resolve, 500));

    if (typeof generatedReport !== 'undefined' && generatedReport) {
      console.log('✅ generatedReport exists in global scope');
      console.table({
        'Month': generatedReport.month,
        'Month Label': generatedReport.monthLabel,
        'Data items': generatedReport.data?.length || 0,
        'Generated at': new Date(generatedReport.generatedAt).toLocaleString()
      });

      console.log('');
      console.log('generatedReport.data sample (first 3 items):');
      console.table(generatedReport.data?.slice(0, 3));
    } else {
      console.error('❌ generatedReport is not set or not accessible');
    }

    // Final summary
    console.log('');
    console.log('%c═════════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold;');
    console.log('%c                    TEST SUMMARY                          ', 'color: #3b82f6; font-weight: bold;');
    console.log('%c═════════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold;');
    console.log('');

    const tableHasRows = tableBody?.children.length > 0;
    const apiHasData = data.data?.length > 0;

    if (tableHasRows && apiHasData) {
      console.log('%c✅ ALL TESTS PASSED!', 'color: #10b981; font-size: 16px; font-weight: bold;');
      console.log('The Monthly Report feature is working correctly.');
    } else if (!apiHasData) {
      console.log('%c⚠️  NO DATA FOR SELECTED MONTH', 'color: #f59e0b; font-size: 16px; font-weight: bold;');
      console.log('Try selecting a different month with inventory activity.');
    } else {
      console.log('%c❌ TABLE RENDERING ISSUE DETECTED', 'color: #ef4444; font-size: 16px; font-weight: bold;');
      console.log('API returns data, but table is not rendering.');
      console.log('Check the browser console for [LogsReport] error messages.');
    }

    console.log('');
    console.log('💡 Tip: Look for [LogsReport] prefixed messages in the console for detailed debugging info.');

  } catch (error) {
    console.error('%c❌ TEST FAILED WITH ERROR:', 'color: #ef4444; font-weight: bold;');
    console.error(error);
  }

})();

// Note: After running this script, you can also manually inspect:
// - generatedReport (should contain the report data)
// - document.getElementById('reportTableBody').innerHTML (should contain table rows)
