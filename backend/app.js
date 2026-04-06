import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import hpp from "hpp";

import env from "./config/env.js";
import logger from "./utils/logger.js";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import sanitizeRequest from "./middleware/sanitizeMiddleware.js";

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
import OWNER_disposalRoutes from "./routes/OWNER_disposalRoutes.js";
import STAFF_disposalRoutes from "./routes/STAFF_disposalRoutes.js";
import OWNER_reportRoutes from "./routes/OWNER_reportRoutes.js";
import billingIntegrationRoutes from "./routes/billing.js";

const app = express(); // ✅ CREATE APP FIRST

app.set("trust proxy", 1);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (env.isLocal && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return callback(null, true);
    }

    if (env.CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    if (!env.isProduction && env.CORS_ORIGINS.length === 0) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
};

/* ================= MIDDLEWARE ================= */
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(sanitizeRequest);
app.use(hpp());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(globalLimiter);

app.use((req, res, next) => {
  logger.info("Incoming request", {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  next();
});

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Backend API running",
    environment: env.NODE_ENV,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ibms-backend",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

app.get("/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authLimiter, authRoutes);
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
app.use("/api/owner/disposal", OWNER_disposalRoutes);
app.use("/api/staff/disposal", STAFF_disposalRoutes);
app.use("/api/owner/reports", OWNER_reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/v1/integrations/parms", billingIntegrationRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;