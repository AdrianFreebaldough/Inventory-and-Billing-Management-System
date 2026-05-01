import mongoose from "mongoose";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import Service from "../models/Service.js";

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

    // Seed baseline services if empty
    const baselineServices = [
      { name: "Basic Cardiovascular Package", price: 3320, category: "Health Packages", status: "active" },
      { name: "Executive Check-up Package", price: 3890, category: "Health Packages", status: "active" },
      { name: "Pre-Employment Package (Basic)", price: 2140, category: "Health Packages", status: "active" },
      { name: "Routine Prenatal Package", price: 2760, category: "Health Packages", status: "active" },
      { name: "School / University Medical Package", price: 1980, category: "Health Packages", status: "active" },
      { name: "Blood Urea Nitrogen (BUN)", price: 350, category: "Blood Test", status: "active" },
      { name: "CBC Blood Test", price: 350, category: "Blood Test", status: "active" },
      { name: "Complete Blood Count (CBC)", price: 350, category: "Blood Test", status: "active" },
      { name: "Fasting Blood Sugar", price: 350, category: "Blood Test", status: "active" },
      { name: "Follow-up", price: 500, category: "Follow-up", status: "active" },
      { name: "Other", price: 400, category: "Follow-up", status: "active" },
      { name: "Consultation", price: 800, category: "General Consultation", status: "active" },
      { name: "General Consultation", price: 500, category: "General Consultation", status: "active" },
      { name: "12-Lead ECG", price: 350, category: "Laboratory", status: "active" },
      { name: "Chest X-ray", price: 350, category: "Laboratory", status: "active" },
      { name: "COVID-19 Antigen", price: 350, category: "Laboratory", status: "active" },
      { name: "Dengue NS1 Antigen", price: 350, category: "Laboratory", status: "active" },
      { name: "Erythrocyte Sedimentation Rate (ESR)", price: 350, category: "Laboratory", status: "active" },
      { name: "Routine Checkup", price: 1000, category: "Routine Checkup", status: "active" },
      { name: "Urinalysis", price: 350, category: "Urine Test", status: "active" },
      { name: "Urinalysis Procedure", price: 200, category: "Urine Test", status: "active" },
      { name: "Vaccination", price: 1200, category: "Vaccination", status: "active" }
    ];

    for (const s of baselineServices) {
      await Service.findOneAndUpdate({ name: s.name }, s, { upsert: true });
    }
    logger.info("Centralized clinic services updated successfully");

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