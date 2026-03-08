import express from "express";
import cors from "cors";

import authRoutes from "./routes/authroutesUsers.js";
import OWNER_inventoryRoutes from "./routes/OWNER_inventoryRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import STAFF_dashboardRoutes from "./routes/STAFF_dashboardRoutes.js";
import STAFF_inventoryRoutes from "./routes/STAFF_inventoryRoutes.js";
import STAFF_activityLogRoutes from "./routes/STAFF_activityLogRoutes.js";
import STAFF_billingRoutes from "./routes/STAFF_billingRoutes.js";
import Owner_stockLogRoutes from "./routes/Owner_StockLog.routes.js";
import Owner_UserManagementRoutes from "./routes/Owner_UserManagement.routes.js";
import STAFF_expenseRoutes from "./routes/STAFF_expenseRoutes.js";
import OWNER_expenseRoutes from "./routes/OWNER_expenseRoutes.js";
import STAFF_stockRequestRoutes from "./routes/STAFF_stockRequestRoutes.js";
import OWNER_stockRequestRoutes from "./routes/OWNER_stockRequestRoutes.js";
import STAFF_quantityAdjustmentRoutes from "./routes/STAFF_quantityAdjustmentRoutes.js";
import OWNER_quantityAdjustmentRoutes from "./routes/OWNER_quantityAdjustmentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";

const app = express(); // ✅ CREATE APP FIRST

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.send("Backend API running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/owner/inventory", OWNER_inventoryRoutes);
app.use("/api/owner/dashboard", dashboardRoutes);
app.use("/api/staff/dashboard", STAFF_dashboardRoutes);
app.use("/api/staff/inventory", STAFF_inventoryRoutes);
app.use("/api/staff/activity-logs", STAFF_activityLogRoutes);
app.use("/api/staff/billing", STAFF_billingRoutes);
app.use("/api/owner/stock-logs", Owner_stockLogRoutes);
app.use("/api/stock-logs", Owner_stockLogRoutes);
app.use("/api/owner", Owner_UserManagementRoutes);
app.use("/api/staff/expenses", STAFF_expenseRoutes);
app.use("/api/owner/expenses", OWNER_expenseRoutes);
app.use("/api/staff/stock-requests", STAFF_stockRequestRoutes);
app.use("/api/owner/stock-requests", OWNER_stockRequestRoutes);
app.use("/api/staff/quantity-adjustments", STAFF_quantityAdjustmentRoutes);
app.use("/api/owner/quantity-adjustments", OWNER_quantityAdjustmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/patients", patientRoutes);

export default app;