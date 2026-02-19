// ---------- STAFF ----------
export const staffUser = {
  fullName: "Adrian Frivaldo",
  username: "FRIVS"
};

// ---------- DASHBOARD STATS ----------
export const dashboardStats = {
  revenueToday: 3250,
  transactionsToday: 18,
  itemsIssuedToday: 42,
  pendingRestock: 3
};

// ---------- TOP ITEMS ----------
export const topItemsToday = [
  {
    name: "Omeprazole 20mg",
    sold: 14,
    price: 105
  },
  {
    name: "Aspirin 100mg",
    sold: 30,
    price: 60
  },
  {
    name: "Cetirizine 10mg",
    sold: 10,
    price: 45
  }
];

// ---------- TRANSACTIONS ----------
export const recentTransactions = [
  {
    id: "TX-1001",
    patient: "Juan Dela Cruz",
    time: "10:30 AM",
    amount: 350,
    items: 3
  },
  {
    id: "TX-1002",
    patient: "Maria Santos",
    time: "11:10 AM",
    amount: 220,
    items: 2
  }
];

// ---------- INVENTORY ALERTS ----------
export const inventoryAlerts = [
  {
    name: "Paracetamol 500mg",
    status: "low",
    remaining: "15 left"
  },
  {
    name: "Amoxicillin 250mg",
    status: "out",
    remaining: "Out of stock"
  }
];
