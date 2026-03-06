// Database Migration Script for IBMS System Revision
// Run this script to update existing data to new schema

import mongoose from "mongoose";
import STAFF_BillingTransaction from "./backend/models/STAFF_billingTransaction.js";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/ibms";

async function migrateDatabase() {
  try {
    console.log("🔌 Connecting to database...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to database\n");

    // Migration 1: Add patientName to existing billing transactions
    console.log("📋 Migration 1: Adding patientName to billing transactions...");
    
    const billingUpdateResult = await STAFF_BillingTransaction.updateMany(
      { 
        $or: [
          { patientName: { $exists: false } },
          { patientName: null },
          { patientName: "" }
        ]
      },
      { 
        $set: { 
          patientName: "Legacy Patient",
          vatIncluded: 0,
          netAmount: 0
        } 
      }
    );

    console.log(`   ✅ Updated ${billingUpdateResult.modifiedCount} billing transactions`);

    // Migration 2: Recalculate VAT for recent transactions
    console.log("\n📋 Migration 2: Recalculating VAT for recent transactions...");
    
    // Get transactions from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = await STAFF_BillingTransaction.find({
      createdAt: { $gte: thirtyDaysAgo },
      totalAmount: { $gt: 0 }
    });

    let recalculatedCount = 0;

    for (const transaction of recentTransactions) {
      // Reverse VAT calculation
      const netAmount = Number((transaction.totalAmount / 1.12).toFixed(2));
      const vatIncluded = Number((transaction.totalAmount - netAmount).toFixed(2));

      transaction.netAmount = netAmount;
      transaction.vatIncluded = vatIncluded;
      
      await transaction.save();
      recalculatedCount++;
    }

    console.log(`   ✅ Recalculated VAT for ${recalculatedCount} transactions`);

    console.log("\n✅ Migration completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Billing transactions updated: ${billingUpdateResult.modifiedCount}`);
    console.log(`   - VAT recalculations: ${recalculatedCount}`);

  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from database");
  }
}

// Run migration
migrateDatabase();
