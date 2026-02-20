import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const connectIBMS = async () => {
  try {
    const uri = process.env.IBMS_DB_URI;

    if (!uri) {
      throw new Error("IBMS_DB_URI is not defined");
    }

    const connection = await mongoose.createConnection(uri);

    console.log("✅ MongoDB (IBMS) connected");

    return connection;
  } catch (error) {
    console.error("❌ MongoDB (IBMS) connection failed:", error.message);
    process.exit(1);
  }
};