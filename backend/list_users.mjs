import "dotenv/config";
import mongoose from "mongoose";

const uri = process.env.IBMS_DB_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/IBMS";

try {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const users = await db.collection("users").find({}).toArray();
  console.log("Users in DB:", users.length);
  users.forEach(u => {
      console.log(`ID: ${u._id} (${typeof u._id}), Email: ${u.email}, Role: ${u.role}`);
  });

} catch (err) {
  console.error(err);
} finally {
  await mongoose.disconnect();
}
