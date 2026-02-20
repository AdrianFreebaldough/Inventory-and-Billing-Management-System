import express from "express";
import cors from "cors";

import authRoutes from "./routes/authroutesUsers.js";
import inventoryRoutes from "./routes/inventory.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend API running 🚀");
});

app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);

export default app;