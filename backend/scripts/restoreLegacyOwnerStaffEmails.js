import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();

const normalize = (value) => String(value || "").trim();

const connect = async () => {
  const uri = normalize(process.env.IBMS_DB_URI || process.env.PARMS_DB_URI);
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
  const summary = {
    ownerAssigned: false,
    staffAssigned: false,
    ownerTarget: "owner@test.com",
    staffTarget: "staff@test.com",
    ownerUserId: null,
    staffUserId: null,
  };

  const ownerTarget = "owner@test.com";
  const staffTarget = "staff@test.com";

  const ownerExists = await User.findOne({
    email: { $regex: `^${ownerTarget}$`, $options: "i" },
  })
    .select("_id role email")
    .lean();

  if (!ownerExists) {
    const ownerCandidate = await User.findOne({ role: "owner" })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id role email")
      .lean();

    if (ownerCandidate) {
      await User.updateOne(
        { _id: ownerCandidate._id },
        { $set: { email: ownerTarget } }
      );

      summary.ownerAssigned = true;
      summary.ownerUserId = String(ownerCandidate._id);
    }
  }

  const staffExists = await User.findOne({
    email: { $regex: `^${staffTarget}$`, $options: "i" },
  })
    .select("_id role email")
    .lean();

  if (!staffExists) {
    const staffCandidate = await User.findOne({ role: "staff" })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id role email")
      .lean();

    if (staffCandidate) {
      await User.updateOne(
        { _id: staffCandidate._id },
        { $set: { email: staffTarget } }
      );

      summary.staffAssigned = true;
      summary.staffUserId = String(staffCandidate._id);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
};

const main = async () => {
  try {
    await connect();
    await run();
    process.exit(0);
  } catch (error) {
    console.error("Failed to restore legacy owner/staff emails", error?.message || error);
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
