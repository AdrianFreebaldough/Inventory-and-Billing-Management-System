import {
  adminUser,
  dashboardStats,
  pendingRequests,
  lowStockAlerts,
  recentActivity,
  revenueData
} from "./data/admin_dashboard_data.js";

document.addEventListener("DOMContentLoaded", () => {

  /* ================= ELEMENTS ================= */
  const mainContent   = document.getElementById("mainContent");
  const navDashboard  = document.getElementById("navDashboard");
  const navInventory  = document.getElementById("navInventory");
  const navUserManagement = document.getElementById("navUserManagement");
  const navReports = document.getElementById("navReports");
  const navStockLogs = document.getElementById("navStockLogs");

  const staffNameEl     = document.getElementById("staffName");
  const staffUsernameEl = document.getElementById("staffUsername");
  const staffAvatarEl   = document.getElementById("staffAvatar");
  const profileBtn      = document.getElementById("profileBtn");

  /* ================= ADMIN INFO ================= */
  if (adminUser) {
    staffNameEl.textContent = adminUser.fullName;
    staffUsernameEl.textContent = adminUser.username;
    staffAvatarEl.textContent = adminUser.fullName.charAt(0).toUpperCase();
  }

  /* ================= NAV ACTIVE ================= */
  function setActive(activeEl) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.remove("bg-blue-600", "text-white");
      link.classList.add("text-gray-700");
    });

    activeEl.classList.add("bg-blue-600", "text-white");
    activeEl.classList.remove("text-gray-700");
  }

  /* ================= DASHBOARD ================= */
  function loadDashboard() {
    setActive(navDashboard);
    renderDashboardContent();
  }

  /* ================= RENDER DASHBOARD CONTENT ================= */
  function renderDashboardContent() {
    mainContent.innerHTML = `
      <div class="p-8 max-w-7xl mx-auto animate-fade-in">
        
        <!-- Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          ${renderMetricsCards()}
        </div>

        <!-- Revenue Overview Chart -->
        ${renderRevenueChart()}

        <!-- Two Column Layout -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          ${renderPendingRequests()}
          ${renderLowStockAlerts()}
        </div>

        <!-- Recent Activity -->
        ${renderRecentActivity()}
      </div>
    `;
    
    // Initialize chart after DOM is updated
    initializeRevenueChart();
    animateProgressBars();
  }

  /* ================= RENDER METRICS CARDS ================= */
  function renderMetricsCards() {
    return `
      <!-- Total Revenue -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.1s">
        <div class="text-slate-500 text-sm font-medium mb-1">Total Revenue</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">₱${dashboardStats.totalRevenue.toLocaleString()}</div>
        <div class="flex items-center text-emerald-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          +12.5% from last week
        </div>
      </div>

      <!-- Active Staff -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.2s">
        <div class="text-slate-500 text-sm font-medium mb-1">Active Staff</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${dashboardStats.activeStaff}</div>
        <div class="flex items-center text-slate-400 text-sm">
          <span class="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></span>
          Currently on duty
        </div>
      </div>

      <!-- Low Stock Items -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.3s">
        <div class="text-slate-500 text-sm font-medium mb-1">Low Stock Items</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${dashboardStats.lowStockItems}</div>
        <div class="flex items-center text-rose-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          Requires attention
        </div>
      </div>

      <!-- Pending Requests -->
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover-lift animate-slide-up" style="animation-delay: 0.4s">
        <div class="text-slate-500 text-sm font-medium mb-1">Pending Requests</div>
        <div class="text-3xl font-bold text-slate-900 mb-2">${dashboardStats.pendingRequests}</div>
        <div class="flex items-center text-amber-500 text-sm font-medium">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Awaiting approval
        </div>
      </div>
    `;
  }

  /* ================= RENDER REVENUE CHART ================= */
  function renderRevenueChart() {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8 animate-slide-up" style="animation-delay: 0.5s">
        <div class="flex justify-between items-center mb-6">
          <div>
            <h3 class="text-lg font-semibold text-slate-900">Revenue Overview</h3>
            <p class="text-sm text-slate-500">Last week performance</p>
          </div>
          <div class="flex items-center space-x-2 text-sm">
            <span class="text-slate-500">Last Week</span>
            <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>
        <div class="relative h-64 w-full">
          <canvas id="revenueChart"></canvas>
        </div>
      </div>
    `;
  }

  /* ================= RENDER PENDING REQUESTS ================= */
  function renderPendingRequests() {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.6s">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-semibold text-slate-900">Pending Inventory Requests</h3>
          <span class="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
        </div>
        
        <div class="space-y-4">
          ${pendingRequests.map(request => renderRequestItem(request)).join('')}
        </div>

        <button class="w-full mt-4 text-sm text-emerald-600 font-medium hover:text-emerald-700 transition-colors flex items-center justify-center space-x-1 group">
          <span>View All Requests</span>
          <svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>
    `;
  }

  /* ================= RENDER REQUEST ITEM ================= */
  function renderRequestItem(request) {
    const priorityColors = {
      urgent: { bg: 'bg-rose-50', text: 'text-rose-500', svg: 'text-rose-600' },
      normal: { bg: 'bg-amber-50', text: 'text-amber-500', svg: 'text-blue-600' },
      approved: { bg: 'bg-emerald-50', text: 'text-emerald-500', svg: 'text-purple-600' }
    };
    
    const colors = priorityColors[request.priority] || priorityColors.normal;
    const iconColors = ['bg-emerald-100', 'bg-blue-100', 'bg-purple-100'];
    const iconColor = iconColors[pendingRequests.indexOf(request) % 3];

    return `
      <div class="flex items-start space-x-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer group">
        <div class="w-10 h-10 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
          <svg class="w-5 h-5 ${colors.svg}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start">
            <h4 class="text-sm font-semibold text-slate-900">${request.item}</h4>
            <span class="text-xs ${colors.text} font-medium ${colors.bg} px-2 py-1 rounded-full">${request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">Requested by: ${request.requestedBy}</p>
          <p class="text-xs text-slate-400 mt-1">${request.time}</p>
        </div>
      </div>
    `;
  }

  /* ================= RENDER LOW STOCK ALERTS ================= */
  function renderLowStockAlerts() {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.7s">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-semibold text-slate-900">Low Stock Alerts</h3>
          <span class="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
        </div>

        <div class="space-y-6">
          ${lowStockAlerts.map(alert => renderStockAlert(alert)).join('')}
        </div>

        <button class="w-full mt-6 text-sm text-emerald-600 font-medium hover:text-emerald-700 transition-colors flex items-center justify-center space-x-1 group">
          <span>View Inventory</span>
          <svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>
    `;
  }

  /* ================= RENDER STOCK ALERT ================= */
  function renderStockAlert(alert) {
    const statusColors = {
      critical: { bg: 'bg-rose-500', text: 'text-rose-500' },
      warning: { bg: 'bg-amber-500', text: 'text-amber-500' }
    };
    
    const colors = statusColors[alert.status] || statusColors.warning;
    const percentage = Math.round((alert.currentStock / alert.minStock) * 100);

    return `
      <div>
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm font-medium text-slate-900">${alert.name}</span>
          <span class="text-xs font-semibold ${colors.text}">${alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
          <div class="${colors.bg} h-2.5 rounded-full progress-bar" style="width: ${percentage}%"></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500">
          <span>${alert.currentStock} units left</span>
          <span>Min: ${alert.minStock}</span>
        </div>
      </div>
    `;
  }

  /* ================= RENDER RECENT ACTIVITY ================= */
  function renderRecentActivity() {
    return `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-slide-up" style="animation-delay: 0.8s">
        <h3 class="text-lg font-semibold text-slate-900 mb-6 flex items-center">
          <svg class="w-5 h-5 mr-2 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Recent Activity
        </h3>
        
        <div class="space-y-4">
          ${recentActivity.map(activity => renderActivityItem(activity)).join('')}
        </div>

        <button class="w-full mt-6 text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors flex items-center justify-center space-x-1">
          <span>View All Activity</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      </div>
    `;
  }

  /* ================= RENDER ACTIVITY ITEM ================= */
  function renderActivityItem(activity) {
    const activityColors = {
      billing: { border: 'border-emerald-400', dot: 'bg-emerald-400' },
      inventory: { border: 'border-blue-400', dot: 'bg-blue-400' },
      approval: { border: 'border-purple-400', dot: 'bg-purple-400' },
      default: { border: 'border-amber-400', dot: 'bg-amber-400' }
    };
    
    const colors = activityColors[activity.type] || activityColors.default;

    return `
      <div class="flex items-center space-x-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border-l-4 ${colors.border}">
        <div class="w-2 h-2 ${colors.dot} rounded-full"></div>
        <div class="flex-1">
          <p class="text-sm text-slate-700"><span class="font-semibold text-slate-900">${activity.staffId}</span> ${activity.action}</p>
          <p class="text-xs text-slate-400 mt-1">${activity.time}</p>
        </div>
      </div>
    `;
  }

  /* ================= INITIALIZE REVENUE CHART ================= */
  function initializeRevenueChart() {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded, skipping chart initialization');
      return;
    }

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: revenueData.labels,
        datasets: [{
          label: 'Revenue',
          data: revenueData.data,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1e293b',
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return '₱' + context.parsed.y.toLocaleString();
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 35000,
            ticks: {
              callback: function(value) {
                return value / 1000 + 'k';
              },
              color: '#94a3b8',
              font: {
                size: 11
              }
            },
            grid: {
              color: '#f1f5f9',
              drawBorder: false
            }
          },
          x: {
            ticks: {
              color: '#94a3b8',
              font: {
                size: 11
              }
            },
            grid: {
              display: false
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }

  /* ================= ANIMATE PROGRESS BARS ================= */
  function animateProgressBars() {
    const progressBars = document.querySelectorAll('.progress-bar');
    progressBars.forEach(bar => {
      const width = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = width;
      }, 500);
    });
  }

  /* ================= INVENTORY ================= */
  async function loadInventory() {
    setActive(navInventory);

    try {
      // ✅ correct relative path from staff_dashboard.js
      const res = await fetch("../../HTML/admin_Inventory/admin_Inventory.html");
      if (!res.ok) throw new Error("Inventory HTML not found");

      mainContent.innerHTML = await res.text();

      // wait briefly for DOM injection to settle
      await new Promise(r => setTimeout(r, 150));

      // ✅ correct module path
      console.log("Importing admin_inventory module...");
      const module = await import("../admin_inventory/admin_inventory.js");

      if (typeof module.initInventory !== "function") {
        throw new Error("initInventory() missing");
      }

      module.initInventory();
      console.log("admin_inventory.initInventory() called");

    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Inventory module: ${error.message}
        </div>
      `;
    }
  }

  /* ================= USER MANAGEMENT ================= */
  async function loadUserManagement() {
    setActive(navUserManagement);

    try {
      const res = await fetch("../../HTML/Owner_UserManagement/UserManagement.html");
      if (!res.ok) throw new Error("UserManagement HTML not found");

      mainContent.innerHTML = await res.text();

      // wait briefly for DOM injection to settle
      await new Promise(r => setTimeout(r, 150));

      console.log("Importing owner_usermanagement module...");
      const module = await import("../Owner_Usermanagement/UserManagement.js");

      if (typeof module.initUserManagement !== "function") {
        throw new Error("initUserManagement() missing");
      }

      module.initUserManagement();
      console.log("admin_userManagement.initUserManagement() called");

    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load UserManagement module: ${error.message}
        </div>
      `;
    }
  }

/* ================= REPORTS ================= */
  async function loadReports() {
    setActive(navReports);

    try {
      // ✅ correct relative path from staff_dashboard.js
      const res = await fetch("../../HTML/admin_Reports/admin_Reports_Sales/admin_Reports_Sales.html");
      if (!res.ok) throw new Error("Reports HTML not found");

      mainContent.innerHTML = await res.text();

      // wait briefly for DOM injection to settle
      await new Promise(r => setTimeout(r, 150));

      // ✅ correct module path
      console.log("Importing admin_Reports_Sales module...");
      const module = await import("../admin_Reports/admin_Reports_Sales/admin_Reports_Sales.js");

      if (typeof module.initReports !== "function") {
        throw new Error("initReports() missing");
      }

      module.initReports();
      console.log("admin_Reports_Sales.initReports() called");

    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Reports module: ${error.message}
        </div>
      `;
    }
  }

  /* ================= USER PROFILE ================= */
  async function loadUserProfile() {
    try {
      console.log(' Loading User Profile...');
      
      // Show loading state
      mainContent.innerHTML = `
        <div class="flex items-center justify-center p-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span class="ml-2 text-gray-600">Loading Profile...</span>
        </div>
      `;
      
      // Load User Profile HTML
      const res = await fetch('../../HTML/user_Profile/user_Profile.html');
      if (!res.ok) throw new Error("User Profile HTML not found");

      mainContent.innerHTML = await res.text();
      console.log(' User Profile HTML loaded');

      // Reduce wait time
      await new Promise(r => setTimeout(r, 50));

      // Load User Profile JavaScript module
      console.log(' Importing User Profile module...');
      const module = await import('../../js/user_Profile/user_Profile.js');

      if (typeof module.initProfile !== "function") {
        throw new Error("initProfile() missing from user profile module");
      }

      module.initProfile('admin');
      console.log(' User Profile initialized');

    } catch (error) {
      console.error(' Error loading User Profile:', error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load User Profile: ${error.message}
        </div>
      `;
    }
  }

  /* ================= STOCK LOGS ================= */
  async function loadStockLogs() {
    setActive(navStockLogs);

    try {
      const res = await fetch("../../HTML/Admin_Activitylogs/OwnerActivitylogs.html");
      if (!res.ok) throw new Error("Stock Logs HTML not found");

      mainContent.innerHTML = await res.text();

      await new Promise(r => setTimeout(r, 150));

      const module = await import("../Admin_Activitylogs/OwnerActivitylogs.js");

      if (typeof module.initOwnerActivitylogs !== "function") {
        throw new Error("initOwnerActivitylogs() missing");
      }

      module.initOwnerActivitylogs();
      console.log("OwnerActivitylogs.initOwnerActivitylogs() called");
    } catch (error) {
      console.error(error);
      mainContent.innerHTML = `
        <div class="text-red-500 p-4 font-medium">
          Failed to load Stock Logs module: ${error.message}
        </div>
      `;
    }
  }

/* ================= EVENTS ================= */
  navDashboard.addEventListener("click", e => {
    e.preventDefault();
    loadDashboard();
  });

  navInventory.addEventListener("click", e => {
    e.preventDefault();
    loadInventory();
      // TODO: Load inventory content
  });

  navUserManagement.addEventListener("click", e => {
    e.preventDefault();
    loadUserManagement();
        // TODO: Load user management content
  });

  navReports.addEventListener("click", e => {
    e.preventDefault();
    loadReports();
        // TODO: Load user management content
  });

  profileBtn.addEventListener("click", e => {
    e.preventDefault();
    loadUserProfile();
  });

  navStockLogs.addEventListener("click", e => {
    e.preventDefault();
    loadStockLogs();
  });

  /* ================= DEFAULT ================= */
  loadDashboard();
  })
