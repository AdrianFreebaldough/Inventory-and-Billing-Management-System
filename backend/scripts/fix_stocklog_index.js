import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not found in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    const collection = mongoose.connection.collection("owner_stocklogs");
    
    console.log("Checking indexes on owner_stocklogs...");
    const indexes = await collection.indexes();
    console.log("Current indexes:", JSON.stringify(indexes, null, 2));

    const refIndex = indexes.find(idx => idx.name === "referenceId_1");
    if (refIndex && refIndex.unique) {
      console.log("Found unique index on referenceId. Dropping it...");
      await collection.dropIndex("referenceId_1");
      console.log("Index dropped successfully.");
      
      console.log("Creating non-unique index on referenceId...");
      await collection.createIndex({ referenceId: 1 }, { unique: false });
      console.log("Non-unique index created.");
    } else {
      console.log("No unique index found on referenceId_1.");
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected");
  }
}

run();
