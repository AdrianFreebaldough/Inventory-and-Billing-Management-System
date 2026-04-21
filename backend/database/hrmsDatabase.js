import mongoose from "mongoose";
import env from "../config/env.js";
import logger from "../utils/logger.js";

let hrmsConnectionPromise = null;
let hrmsConnection = null;

const connectHRMS = async () => {
  if (!env.HRMS_AUTH_ENABLED) {
    return null;
  }

  if (hrmsConnection?.readyState === 1) {
    return hrmsConnection;
  }

  if (hrmsConnectionPromise) {
    return hrmsConnectionPromise;
  }

  const uri = String(env.HRMS_DB_URI || "").trim();
  if (!uri) {
    throw new Error("HRMS_DB_URI is undefined while HRMS auth is enabled.");
  }

  hrmsConnection = mongoose.createConnection(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    readPreference: "secondaryPreferred",
  });

  hrmsConnectionPromise = hrmsConnection
    .asPromise()
    .then((conn) => {
      logger.info("HRMS MongoDB connected", { dbName: conn.name });
      return conn;
    })
    .catch((error) => {
      logger.error("HRMS MongoDB connection failed", {
        errorMessage: error.message,
      });
      hrmsConnectionPromise = null;
      throw error;
    });

  return hrmsConnectionPromise;
};

export default connectHRMS;