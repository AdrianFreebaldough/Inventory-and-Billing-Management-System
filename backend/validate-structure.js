import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Check file exists
function checkFile(filePath, description) {
  const fullPath = path.join(__dirname, filePath);
  if (fs.existsSync(fullPath)) {
    log(`  ✓ ${description}`, 'green');
    return true;
  } else {
    log(`  ✗ ${description} - MISSING`, 'red');
    return false;
  }
}

// Validate file has required exports
function validateExports(filePath, requiredExports, description) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    log(`  ✗ ${description} - FILE NOT FOUND`, 'red');
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const missing = [];
  
  requiredExports.forEach(exp => {
    if (!content.includes(`export ${exp}`) && !content.includes(`export const ${exp}`) && !content.includes(`export default ${exp}`)) {
      missing.push(exp);
    }
  });

  if (missing.length === 0) {
    log(`  ✓ ${description} - All exports found`, 'green');
    return true;
  } else {
    log(`  ✗ ${description} - Missing: ${missing.join(', ')}`, 'red');
    return false;
  }
}

// Validate schema fields
function validateSchema(filePath, requiredFields, description) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    log(`  ✗ ${description} - FILE NOT FOUND`, 'red');
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const missing = [];
  
  requiredFields.forEach(field => {
    if (!content.includes(`${field}:`)) {
      missing.push(field);
    }
  });

  if (missing.length === 0) {
    log(`  ✓ ${description} - All fields found`, 'green');
    return true;
  } else {
    log(`  ✗ ${description} - Missing: ${missing.join(', ')}`, 'red');
    return false;
  }
}

// Main validation
async function runValidation() {
  log('\n╔══════════════════════════════════════════════════╗', 'cyan');
  log('║     IBMS Code Structure Validation              ║', 'cyan');
  log('╚══════════════════════════════════════════════════╝\n', 'cyan');

  let totalChecks = 0;
  let passedChecks = 0;

  // 1. Models
  log('━━━ 1. Models ━━━', 'blue');
  [
    ['models/STAFF_expense.js', 'STAFF_expense model'],
    ['models/STAFF_stockRequest.js', 'STAFF_stockRequest model'],
    ['models/STAFF_quantityAdjustment.js', 'STAFF_quantityAdjustment model'],
    ['models/Notification.js', 'Notification model'],
  ].forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });

  // 2. Controllers
  log('\n━━━ 2. Controllers ━━━', 'blue');
  const controllerChecks = [
    ['controllers/STAFF_expenseController.js', ['STAFF_createExpense', 'STAFF_getExpenses', 'OWNER_getExpenses', 'OWNER_updateExpenseStatus'], 'STAFF_expenseController (STAFF + OWNER functions)'],
    ['controllers/STAFF_stockRequestController.js', ['STAFF_createStockRequest', 'STAFF_getLowStockItems', 'OWNER_getStockRequests', 'OWNER_approveStockRequest'], 'STAFF_stockRequestController (STAFF + OWNER functions)'],
    ['controllers/STAFF_quantityAdjustmentController.js', ['STAFF_createQuantityAdjustment', 'OWNER_getQuantityAdjustments'], 'STAFF_quantityAdjustmentController (STAFF + OWNER functions)'],
    ['controllers/notificationController.js', ['getNotifications', 'markAsRead'], 'notificationController'],
  ];
  
  controllerChecks.forEach(([file, exports, desc]) => {
    totalChecks++;
    if (validateExports(file, exports, desc)) passedChecks++;
  });

  // 3. Routes
  log('\n━━━ 3. Routes ━━━', 'blue');
  [
    ['routes/STAFF_expenseRoutes.js', 'STAFF_expenseRoutes'],
    ['routes/OWNER_expenseRoutes.js', 'OWNER_expenseRoutes'],
    ['routes/STAFF_stockRequestRoutes.js', 'STAFF_stockRequestRoutes'],
    ['routes/OWNER_stockRequestRoutes.js', 'OWNER_stockRequestRoutes'],
    ['routes/STAFF_quantityAdjustmentRoutes.js', 'STAFF_quantityAdjustmentRoutes'],
    ['routes/OWNER_quantityAdjustmentRoutes.js', 'OWNER_quantityAdjustmentRoutes'],
    ['routes/notificationRoutes.js', 'notificationRoutes'],
  ].forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });

  // 4. Services
  log('\n━━━ 4. Services ━━━', 'blue');
  [
    ['services/expirationService.js', 'expirationService'],
    ['services/notificationCronService.js', 'notificationCronService'],
  ].forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });

  // 5. Critical Schema Fields
  log('\n━━━ 5. Schema Field Validation ━━━', 'blue');
  const schemaChecks = [
    ['models/STAFF_billingTransaction.js', ['patientName', 'vatIncluded', 'netAmount'], 'STAFF_billingTransaction VAT fields'],
    ['models/STAFF_expense.js', ['title', 'category', 'amount', 'status'], 'STAFF_expense fields'],
    ['models/STAFF_stockRequest.js', ['requestId', 'items', 'status'], 'STAFF_stockRequest fields'],
    ['models/Notification.js', ['userId', 'role', 'message', 'type'], 'Notification fields'],
  ];
  
  schemaChecks.forEach(([file, fields, desc]) => {
    totalChecks++;
    if (validateSchema(file, fields, desc)) passedChecks++;
  });

  // 6. Modified Files
  log('\n━━━ 6. Modified Files ━━━', 'blue');
  const modifiedChecks = [
    ['controllers/STAFF_billingController.js', 'STAFF_billingController updated'],
    ['services/STAFF_billingService.js', 'STAFF_billingService updated'],
    ['controllers/STAFF_inventoryController.js', 'STAFF_inventoryController updated'],
    ['controllers/OWNER_inventoryController.js', 'OWNER_inventoryController updated'],
    ['app.js', 'app.js route registration'],
  ];
  
  modifiedChecks.forEach(([file, desc]) => {
    totalChecks++;
    if (checkFile(file, desc)) passedChecks++;
  });

  // 7. Critical Functions
  log('\n━━━ 7. Critical Functions ━━━', 'blue');
  const functionChecks = [
    ['services/STAFF_billingService.js', ['STAFF_generatePatientName'], 'Patient name generator'],
    ['services/STAFF_billingService.js', ['netAmount'], 'VAT calculation (reverse formula)'],
    ['services/expirationService.js', ['getDaysUntilExpiry'], 'Expiration calculation'],
    ['controllers/STAFF_inventoryController.js', ['expirationFilter'], 'Expiration filter'],
  ];
  
  functionChecks.forEach(([file, keywords, desc]) => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const allFound = keywords.every(keyword => content.includes(keyword));
      totalChecks++;
      if (allFound) {
        log(`  ✓ ${desc}`, 'green');
        passedChecks++;
      } else {
        log(`  ✗ ${desc} - Keywords not found`, 'red');
      }
    } else {
      totalChecks++;
      log(`  ✗ ${desc} - File not found`, 'red');
    }
  });

  // 8. App.js Route Registration
  log('\n━━━ 8. Route Registration in app.js ━━━', 'blue');
  const appPath = path.join(__dirname, 'app.js');
  if (fs.existsSync(appPath)) {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const routes = [
      'STAFF_expenseRoutes',
      'OWNER_expenseRoutes',
      'STAFF_stockRequestRoutes',
      'OWNER_stockRequestRoutes',
      'STAFF_quantityAdjustmentRoutes',
      'OWNER_quantityAdjustmentRoutes',
      'notificationRoutes',
    ];
    
    routes.forEach(route => {
      totalChecks++;
      if (appContent.includes(route)) {
        log(`  ✓ ${route} registered`, 'green');
        passedChecks++;
      } else {
        log(`  ✗ ${route} NOT registered`, 'red');
      }
    });
  } else {
    totalChecks += 7;
    log(`  ✗ app.js not found`, 'red');
  }

  // Summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  const percentage = ((passedChecks / totalChecks) * 100).toFixed(1);
  log(`Results: ${passedChecks}/${totalChecks} checks passed (${percentage}%)`, percentage === '100.0' ? 'green' : 'yellow');
  
  if (passedChecks === totalChecks) {
    log('✓ All validation checks passed! Code structure is complete.', 'green');
  } else {
    log(`✗ ${totalChecks - passedChecks} checks failed. Please review the issues above.`, 'red');
  }
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
}

runValidation().catch(err => {
  log(`\n✗ Validation error: ${err.message}`, 'red');
  process.exit(1);
});
