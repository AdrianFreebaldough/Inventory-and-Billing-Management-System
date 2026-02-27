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

export default app;