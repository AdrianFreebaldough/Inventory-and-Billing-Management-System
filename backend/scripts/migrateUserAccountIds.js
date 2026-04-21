import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.js";
import {
  buildAccountIdForYear,
  isValidAccountId,
  normalizeAccountId,
} from "../utils/accountIdUtils.js";

dotenv.config();

const connect = async () => {
  const uri = String(process.env.IBMS_DB_URI || process.env.PARMS_DB_URI || "").trim();
  if (!uri) {
    throw new Error("Missing IBMS_DB_URI (or PARMS_DB_URI fallback) in environment.");
  }

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
};

const run = async () => {
  const year = new Date().getFullYear();
  const users = await User.find({ role: { $in: ["owner", "staff"] } })
    .select("_id role email")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const used = new Set(
    users
      .map((user) => normalizeAccountId(user?.email))
      .filter((value) => isValidAccountId(value))
  );

  let nextSequence = 1;
  const updated = [];

  const nextId = () => {
    while (true) {
      const candidate = buildAccountIdForYear({ year, sequence: nextSequence });
      nextSequence += 1;
      if (used.has(candidate)) continue;
      used.add(candidate);
      return candidate;
    }
  };

  for (const user of users) {
    const current = normalizeAccountId(user?.email);
    if (isValidAccountId(current)) {
      continue;
    }

    const accountId = nextId();
    await User.updateOne(
      { _id: user._id },
      { $set: { email: accountId } }
    );

    updated.push({
      id: String(user._id),
      role: user.role,
      from: user.email,
      to: accountId,
    });
  }

  console.log(JSON.stringify({
    scanned: users.length,
    updated: updated.length,
    changes: updated,
  }, null, 2));
};

const main = async () => {
  try {
    await connect();
    await run();
    process.exit(0);
  } catch (error) {
    console.error("Failed to migrate account IDs", error?.message || error);
    process.exit(1);
  } finally {
    try {
      await mongoose.connection.close();
    } catch {
      // ignore close errors
    }
  }
};

main();
