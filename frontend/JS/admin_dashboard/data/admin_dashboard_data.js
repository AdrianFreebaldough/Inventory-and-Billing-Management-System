// ---------- ADMIN USER ----------
export const adminUser = {
  fullName: "Admin User",
  username: "ADMIN"
};

// ---------- DASHBOARD STATS ----------
export const dashboardStats = {
  totalRevenue: 124500,
  activeStaff: 1,
  lowStockItems: 6,
  pendingRequests: 8
};

// ---------- REVENUE DATA ----------
export const revenueData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  data: [28000, 29500, 18000, 18500, 32000, 26500, 24000]
};

// ---------- PENDING REQUESTS ----------
export const pendingRequests = [
  {
    id: "REQ-001",
    item: "Ibuprofen",
    requestedBy: "Dr. Santos",
    time: "Today, 9:41 AM",
    priority: "Urgent",
    status: "pending"
  },
  {
    id: "REQ-002", 
    item: "Cotton Balls",
    requestedBy: "Nurse Reyes",
    time: "Today, 8:15 AM",
    priority: "Normal",
    status: "pending"
  },
  {
    id: "REQ-003",
    item: "Amoxicillin", 
    requestedBy: "Dr. Cruz",
    time: "Yesterday, 4:30 PM",
    priority: "Normal",
    status: "approved"
  }
];

// ---------- LOW STOCK ALERTS ----------
export const lowStockAlerts = [
  {
    name: "Ibuprofen",
    currentStock: 15,
    minStock: 100,
    status: "critical"
  },
  {
    name: "Amoxicillin",
    currentStock: 25,
    minStock: 100,
    status: "critical"
  },
  {
    name: "Cotton Balls",
    currentStock: 45,
    minStock: 100,
    status: "warning"
  }
];

// ---------- RECENT ACTIVITY ----------
export const recentActivity = [
  {
    id: 1,
    staffId: "Staff #12",
    action: "processed billing for Patient #10234",
    time: "2 minutes ago",
    type: "billing"
  },
  {
    id: 2,
    staffId: "Staff #7", 
    action: "updated inventory: Added 50x Paracetamol",
    time: "15 minutes ago",
    type: "inventory"
  },
  {
    id: 3,
    staffId: "Staff #3",
    action: "approved request #REQ-2024-089",
    time: "32 minutes ago", 
    type: "approval"
  },
  {
    id: 4,
    staffId: "Staff #12",
    action: "processed billing for Patient #10235",
    time: "1 hour ago",
    type: "billing"
  },
  {
    id: 5,
    staffId: "Staff #5",
    action: "processed billing for Patient #10236", 
    time: "2 hours ago",
    type: "billing"
  }
];