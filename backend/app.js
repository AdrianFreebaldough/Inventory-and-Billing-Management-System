import express from "express";
import cors from "cors";

import authRoutes from "./routes/authroutesUsers.js";
import OWNER_inventoryRoutes from "./routes/OWNER_inventoryRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

const app = express(); // ✅ CREATE APP FIRST

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.send("Backend API running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/inventory", OWNER_inventoryRoutes);
app.use("/api/dashboard", dashboardRoutes);

export default app;