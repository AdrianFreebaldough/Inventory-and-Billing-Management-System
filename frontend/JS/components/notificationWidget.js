// Notification Widget Component
// Include this in your dashboard HTML files

class NotificationWidget {
  constructor(apiBase, token) {
    this.apiBase = apiBase;
    this.token = token;
    this.notifications = [];
    this.unreadCount = 0;
    this.isOpen = false;
  }

  // Initialize the widget
  init() {
    window.notificationWidget = this;
    this.injectHTML();
    this.loadNotifications();
    this.startPolling();
  }

  // Inject notification HTML into the page
  injectHTML() {
    const container = document.getElementById('notificationWidget');
    if (!container) {
      console.error('Notification widget container not found. Add <div id="notificationWidget"></div> to your HTML');
      return;
    }

    container.innerHTML = `
      <div class="relative z-30" style="position: relative; z-index: 30;">
        <!-- Notification Bell Button -->
        <button 
          id="notificationBell" 
          onclick="notificationWidget.toggleDropdown()"
          class="relative p-2 rounded-full hover:bg-slate-100 transition"
        >
          <svg class="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9">
            </path>
          </svg>
          <span 
            id="notificationBadge" 
            class="absolute top-0 right-0 hidden bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
          >
            0
          </span>
        </button>

        <!-- Notification Dropdown -->
        <div 
          id="notificationDropdown" 
          class="hidden absolute bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden"
          style="position: absolute; top: calc(100% + 0.5rem); right: 0; width: 20rem; max-width: min(92vw, 20rem); max-height: min(70vh, 32rem); z-index: 40;"
        >
          <div class="p-4 border-b border-slate-200 flex justify-between items-center bg-white gap-3">
            <h3 class="font-semibold text-slate-900">Notifications</h3>
            <button 
              onclick="notificationWidget.markAllAsRead()"
              class="text-xs text-blue-600 hover:underline whitespace-nowrap"
            >
              Mark all as read
            </button>
          </div>
          
          <div id="notificationList" class="divide-y divide-slate-100 overflow-y-auto overflow-x-hidden" style="max-height: min(calc(70vh - 4rem), 28rem); width: 100%;">
            <div class="p-4 text-center text-slate-500">Loading...</div>
          </div>
        </div>
      </div>
    `;
  }

  // Toggle dropdown
  toggleDropdown() {
    this.isOpen = !this.isOpen;
    const dropdown = document.getElementById('notificationDropdown');
    
    if (this.isOpen) {
      dropdown.classList.remove('hidden');
      this.loadNotifications();
    } else {
      dropdown.classList.add('hidden');
    }
  }

  // Load notifications from API
  async loadNotifications() {
    try {
      const response = await fetch(`${this.apiBase}/notifications`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      const result = await response.json();

      if (response.ok) {
        this.notifications = result.data;
        this.unreadCount = result.unreadCount;
        this.updateBadge();
        this.renderNotifications();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  // Update badge count
  updateBadge() {
    const badge = document.getElementById('notificationBadge');
    
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Render notifications
  renderNotifications() {
    const list = document.getElementById('notificationList');
    
    if (this.notifications.length === 0) {
      list.innerHTML = '<div class="p-4 text-center text-slate-500">No notifications</div>';
      return;
    }

    list.innerHTML = this.notifications.map(notif => {
      const icon = this.getNotificationIcon(notif.type);
      const bgClass = notif.isRead ? 'bg-white' : 'bg-blue-50';
      const timeAgo = this.getTimeAgo(new Date(notif.createdAt));

      return `
        <div 
          class="${bgClass} p-4 hover:bg-slate-50 cursor-pointer transition"
          onclick="notificationWidget.handleNotificationClick('${notif._id}', '${notif.redirectUrl}')"
        >
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 mt-1">
              ${icon}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-900 mb-1 break-words whitespace-normal">${notif.message}</p>
              <p class="text-xs text-slate-500">${timeAgo}</p>
            </div>
            ${!notif.isRead ? '<div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Get notification icon based on type
  getNotificationIcon(type) {
    const iconMap = {
      'out_of_stock': '🔴',
      'low_stock': '🟠',
      'stock_request_sent': '📦',
      'stock_request_approved': '✅',
      'stock_request_rejected': '❌',
      'item_expiration': '⚠️',
      'inventory_adjustment_request': '🔧',
      'expense_submitted': '💰',
      'expense_reviewed': '👁️',
      'expense_approved': '✅',
    };

    return iconMap[type] || '🔔';
  }

  // Handle notification click
  async handleNotificationClick(notificationId, redirectUrl) {
    // Mark as read
    try {
      await fetch(`${this.apiBase}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      // Update local state
      const notif = this.notifications.find(n => n._id === notificationId);
      if (notif && !notif.isRead) {
        notif.isRead = true;
        this.unreadCount--;
        this.updateBadge();
        this.renderNotifications();
      }

      // Handle navigation based on redirectUrl and user role
      if (redirectUrl) {
        this.navigateTo(redirectUrl);
      }
      
      // Close dropdown
      this.isOpen = false;
      const dropdown = document.getElementById('notificationDropdown');
      if (dropdown) dropdown.classList.add('hidden');
      
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Navigate to appropriate page based on redirectUrl and user role
  navigateTo(redirectUrl) {
    // Get user role from localStorage or token
    const userRole = this.getUserRole();
    
    // Navigation mapping for each role
    const navigationMap = {
      staff: {
        'inventory': () => this.tryCallFunction('loadInventory'),
        'stock-requests': () => this.tryCallFunction('loadRequestStock'),
        'expenses': () => this.tryCallFunction('loadExpenses'),
        'activity-log': () => this.tryCallFunction('loadActivityLog'),
      },
      owner: {
        'inventory': () => this.tryCallFunction('loadInventory'),
        'stock-requests': () => this.tryCallFunction('loadInventory'), // Owner views stock requests in inventory
        'expenses': () => this.tryCallFunction('loadExpenses'),
        'reports': () => this.tryCallFunction('loadReports'),
        'user-management': () => this.tryCallFunction('loadUserManagement'),
      }
    };

    // Try to navigate using the appropriate function
    const roleNav = navigationMap[userRole];
    if (roleNav && roleNav[redirectUrl]) {
      roleNav[redirectUrl]();
    } else {
      // Fallback: try to find the page based on common patterns
      this.fallbackNavigation(redirectUrl, userRole);
    }
  }

  // Try to call a global function if it exists
  tryCallFunction(functionName) {
    if (typeof window[functionName] === 'function') {
      window[functionName]();
      return true;
    }
    return false;
  }

  // Fallback navigation for edge cases
  fallbackNavigation(redirectUrl, userRole) {
    // Map notification paths to actual HTML pages
    const pageMap = {
      'inventory': {
        staff: '../../HTML/staff_Inventory/staff_Inventory.html',
        owner: '../../HTML/admin_Inventory/admin_Inventory.html'
      },
      'stock-requests': {
        staff: '../../HTML/STAFF_StockRequest/STAFF_StockRequest.html',
        owner: '../../HTML/admin_Inventory/admin_Inventory.html'
      },
      'expenses': {
        staff: '../../HTML/STAFF_Expenses/STAFF_Expenses.html',
        owner: '../../HTML/OWNER_Expenses/OWNER_Expenses.html'
      },
      'activity-log': {
        staff: '../../HTML/STAFF_ActivityLog/STAFF_ActivityLog.html',
        owner: '../../HTML/Admin_Activitylogs/OwnerActivitylogs.html'
      }
    };

    const page = pageMap[redirectUrl]?.[userRole];
    if (page) {
      // Check if we're in a dashboard context
      const mainContent = document.getElementById('mainContent');
      if (mainContent) {
        // Load in iframe if dashboard supports it
        mainContent.innerHTML = `<iframe src="${page}" class="h-[calc(100vh-220px)] min-h-[560px] w-full border-0"></iframe>`;
      } else {
        // Direct navigation
        window.location.href = page;
      }
    }
  }

  // Get user role from token or localStorage
  getUserRole() {
    // Try localStorage first
    const storedRole = localStorage.getItem('userRole');
    if (storedRole) return storedRole.toLowerCase();

    // Try to decode JWT token
    const tokenKeys = ['token', 'authToken', 'jwtToken', 'ibmsToken'];
    for (const key of tokenKeys) {
      const token = localStorage.getItem(key);
      if (!token) continue;
      
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.role) return payload.role.toLowerCase();
        }
      } catch (e) {
        // Continue to next token
      }
    }

    return 'staff'; // Default fallback
  }

  // Mark all as read
  async markAllAsRead() {
    try {
      await fetch(`${this.apiBase}/notifications/mark-all-read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      this.notifications.forEach(n => n.isRead = true);
      this.unreadCount = 0;
      this.updateBadge();
      this.renderNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  // Get relative time
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
      }
    }

    return 'Just now';
  }

  // Start polling for new notifications
  startPolling() {
    // Poll every 30 seconds
    setInterval(() => {
      this.loadNotifications();
    }, 30000);
  }
}

// Initialize notification widget
// Usage: Add this at the bottom of your dashboard HTML

// const API_BASE = 'http://localhost:5000/api';
// const token = localStorage.getItem('token');
// const notificationWidget = new NotificationWidget(API_BASE, token);
// notificationWidget.init();

export { NotificationWidget };
