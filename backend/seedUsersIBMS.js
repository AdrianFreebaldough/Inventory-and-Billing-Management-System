import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "./models/user.js";

dotenv.config();

const buildUriFromParts = () => {
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS;
  const host = process.env.DB_HOST; // e.g. clustername.mongodb.net
  const name = process.env.DB_NAME || "ibms";
  if (user && pass && host) {
    return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${name}?retryWrites=true&w=majority`;
  }
  return null;
};

const run = async () => {
  let hadError = false;
  try {
    // If user set USE_LOCAL_DB=true, prefer a local MongoDB URI (no auth assumed)
    let uri = null;
    if (process.env.USE_LOCAL_DB === "true") {
      uri = process.env.LOCAL_DB_URI || `mongodb://127.0.0.1:27017/${process.env.DB_NAME || "ibms"}`;
    }

    // prefer explicit full URI env vars, then build from parts if provided
    uri = uri || process.env.IBMS_DB_URI || process.env.PARMS_DB_URI || buildUriFromParts();

    if (!uri) {
      throw new Error("No database URI specified. Set IBMS_DB_URI or DB_USER/DB_PASS/DB_HOST in your .env.");
    }

    // mask password when logging
    const safeUri = uri.replace(/:(?:[^:@\\/]+)@/, ":***@");
    console.log(`🔗 Connecting with URI: ${safeUri}`);

    console.log("🚀 Starting IBMS user seeding...");

    await mongoose.connect(uri);
    console.log("✅ Connected to database");

    await User.deleteMany();

    await User.create([
      {
        email: "owner@test.com",
        password: bcrypt.hashSync("owner123", 10),
        role: "owner",
      },
      {
        email: "staff@test.com",
        password: bcrypt.hashSync("staff123", 10),
        role: "staff",
      },
    ]);

    console.log("✅ Users seeded");
  } catch (err) {
    hadError = true;
    console.error("Seeding failed:", err.message || err);
    if (err && err.stack) console.error(err.stack);
    if (/auth/i.test(err.message || "")) {
      console.error("👉 Authentication error: check DB_USER/DB_PASS or the password inside IBMS_DB_URI in your .env file.");
      console.error("👉 If you're using MongoDB Atlas, ensure the user has access to the target database and IP access list includes your IP.");
    }
  } finally {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore disconnect errors
    }
    process.exit(hadError ? 1 : 0);
  }
};

run();