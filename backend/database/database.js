import mongoose from "mongoose";
import env from "../config/env.js";
import logger from "../utils/logger.js";

let connectionPromise = null;

const connectIBMS = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  try {
    const uri = env.IBMS_DB_URI;

    if (!uri) {
      throw new Error("IBMS_DB_URI is undefined. Check your .env file.");
    }

    connectionPromise = mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await connectionPromise;
    logger.info("MongoDB connected", { dbName: mongoose.connection.name });
    return mongoose.connection;
  } catch (error) {
    logger.error("MongoDB connection failed", {
      errorMessage: error.message,
    });
    connectionPromise = null;
    if (env.isServerless) {
      throw error;
    }
    process.exit(1);
  }
};

export default connectIBMS;