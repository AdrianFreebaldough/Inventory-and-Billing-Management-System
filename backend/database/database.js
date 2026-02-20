import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectIBMS = async () => {
  try {
    const uri = process.env.IBMS_DB_URI;

    if (!uri) {
      throw new Error("IBMS_DB_URI is undefined. Check your .env file.");
    }

    await mongoose.connect(uri);
    console.log("✅ MongoDB (IBMS) connected");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectIBMS;