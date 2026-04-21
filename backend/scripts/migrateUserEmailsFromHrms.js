import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.js";

dotenv.config();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalize = (value) => String(value || "").trim();
const normalizeEmail = (value) => normalize(value).toLowerCase();

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const connectIBMS = async () => {
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

const connectHRMS = async () => {
  const uri = normalize(process.env.HRMS_DB_URI);
  if (!uri) {
    throw new Error("Missing HRMS_DB_URI in environment.");
  }

  return mongoose.createConnection(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    readPreference: "secondaryPreferred",
  }).asPromise();
};

const buildPlaceholderEmail = ({ role, userId, usedEmails }) => {
  let index = 1;
  while (true) {
    const suffix = String(index).padStart(3, "0");
    const candidate = `${role}.${String(userId).slice(-6)}.${suffix}@ibms.local`.toLowerCase();
    if (!usedEmails.has(candidate)) {
      usedEmails.add(candidate);
      return candidate;
    }
    index += 1;
  }
};

const getLegacyRoleEmail = ({ role, usedEmails }) => {
  const normalizedRole = normalize(role).toLowerCase();
  if (normalizedRole === "owner" && !usedEmails.has("owner@test.com")) {
    usedEmails.add("owner@test.com");
    return "owner@test.com";
  }

  if (normalizedRole === "staff" && !usedEmails.has("staff@test.com")) {
    usedEmails.add("staff@test.com");
    return "staff@test.com";
  }

  return "";
};

const run = async () => {
  const hrmsCollectionName = normalize(process.env.HRMS_USER_COLLECTION || "users");
  const hrmsEmailField = normalize(process.env.HRMS_EMAIL_FIELD || "email");
  const hrmsLoginField = normalize(process.env.HRMS_LOGIN_FIELD || "email");

  const hrmsConnection = await connectHRMS();
  const hrmsUsersCollection = hrmsConnection.collection(hrmsCollectionName);

  const users = await User.find({ role: { $in: ["owner", "staff"] } })
    .select("_id role email")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const usedEmails = new Set(
    users
      .map((row) => normalizeEmail(row?.email))
      .filter((value) => EMAIL_REGEX.test(value))
  );

  let alreadyEmail = 0;
  let mappedFromHrms = 0;
  let generatedFallback = 0;

  const changes = [];

  for (const user of users) {
    const currentEmail = normalize(user?.email);
    const normalizedCurrent = normalizeEmail(currentEmail);

    if (EMAIL_REGEX.test(normalizedCurrent)) {
      alreadyEmail += 1;
      continue;
    }

    const legacyIdentifier = normalize(currentEmail);
    const matcher = {
      $or: [
        { [hrmsEmailField]: { $regex: `^${escapeRegex(legacyIdentifier)}$`, $options: "i" } },
        { [hrmsLoginField]: { $regex: `^${escapeRegex(legacyIdentifier)}$`, $options: "i" } },
        { accountId: { $regex: `^${escapeRegex(legacyIdentifier)}$`, $options: "i" } },
        { employeeId: { $regex: `^${escapeRegex(legacyIdentifier)}$`, $options: "i" } },
        { staffId: { $regex: `^${escapeRegex(legacyIdentifier)}$`, $options: "i" } },
      ],
    };

    const hrmsMatch = await hrmsUsersCollection.findOne(matcher, {
      projection: {
        [hrmsEmailField]: 1,
        [hrmsLoginField]: 1,
        email: 1,
        accountId: 1,
        employeeId: 1,
        staffId: 1,
      },
    });

    const candidateEmail = normalizeEmail(
      hrmsMatch?.[hrmsEmailField] || hrmsMatch?.email || hrmsMatch?.[hrmsLoginField]
    );

    let nextEmail = "";
    let source = "";

    if (EMAIL_REGEX.test(candidateEmail) && !usedEmails.has(candidateEmail)) {
      nextEmail = candidateEmail;
      usedEmails.add(nextEmail);
      source = "hrms";
      mappedFromHrms += 1;
    } else {
      const legacyRoleEmail = getLegacyRoleEmail({
        role: user.role,
        usedEmails,
      });

      if (legacyRoleEmail) {
        nextEmail = legacyRoleEmail;
        source = "legacy-fallback";
      } else {
        nextEmail = buildPlaceholderEmail({
          role: normalize(user.role) || "staff",
          userId: user._id,
          usedEmails,
        });
        source = "fallback";
      }
      generatedFallback += 1;
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { email: nextEmail } }
    );

    changes.push({
      id: String(user._id),
      role: user.role,
      from: currentEmail,
      to: nextEmail,
      source,
    });
  }

  await hrmsConnection.close();

  console.log(
    JSON.stringify(
      {
        scanned: users.length,
        alreadyEmail,
        mappedFromHrms,
        generatedFallback,
        updated: mappedFromHrms + generatedFallback,
        changes,
      },
      null,
      2
    )
  );
};

const main = async () => {
  try {
    await connectIBMS();
    await run();
    process.exit(0);
  } catch (error) {
    console.error("Failed to migrate IBMS user emails from HRMS", error?.message || error);
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
