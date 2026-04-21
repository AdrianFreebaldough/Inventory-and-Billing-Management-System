import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.IBMS_DB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/IBMS";
const ref = "DSP-2026-3951";

try {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const disposal = await db.collection("disposal_logs").findOne({ referenceId: ref });
  console.log("Disposal Doc Keys:", Object.keys(disposal || {}));
  
  if (disposal) {
      console.log("Disposal Data:", JSON.stringify(disposal, null, 2));
  }

} catch (err) {
  console.error(err);
} finally {
  await mongoose.disconnect();
}
