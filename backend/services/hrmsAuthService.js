import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import env from "../config/env.js";
import connectHRMS from "../database/hrmsDatabase.js";
import logger from "../utils/logger.js";

const csvToNormalizedSet = (value) => {
  return new Set(
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getByPath = (source, path) => {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return undefined;

  const keys = normalizedPath.split(".").filter(Boolean);
  let cursor = source;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = cursor[key];
  }

  return cursor;
};

const toLowerCaseString = (value) => String(value ?? "").trim().toLowerCase();
const toTrimmedString = (value) => String(value ?? "").trim();

const toTitleCase = (value) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return "";

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

const toDeterministicObjectId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^[a-fA-F0-9]{24}$/.test(raw) && mongoose.Types.ObjectId.isValid(raw)) {
    return raw.toLowerCase();
  }

  return crypto
    .createHash("sha256")
    .update(`hrms:${raw}`)
    .digest("hex")
    .slice(0, 24);
};

const ACTIVE_STATUS_VALUES = csvToNormalizedSet(env.HRMS_ACTIVE_VALUES);
const OWNER_ROLE_VALUES = new Set([...csvToNormalizedSet(env.HRMS_OWNER_ROLE_VALUES), "admin", "owner", "administrator", "superadmin"]);
const STAFF_ROLE_VALUES = new Set([...csvToNormalizedSet(env.HRMS_STAFF_ROLE_VALUES), "staff", "employee", "user"]);
const FIRST_LOGIN_TRUE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "y",
  "required",
  "require",
  "pending",
  "first",
  "temporary",
  "temp",
]);
const FIRST_LOGIN_FALSE_VALUES = new Set([
  "0",
  "false",
  "no",
  "n",
  "done",
  "completed",
  "inactive",
]);
const HRMS_FIRST_LOGIN_FIELD_CANDIDATES = [
  "firstLogin",
  "isFirstLogin",
  "mustChangePassword",
  "requirePasswordChange",
  "passwordChangeRequired",
  "isTemporaryPassword",
  "temporaryPassword",
  "tempPassword",
];

const resolveHRMSRole = (rawRoles) => {
  const rolesToProcess = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
  
  let resolvedRole = null;
  for (const rawRole of rolesToProcess) {
    const normalizedRole = toLowerCaseString(rawRole);
    if (!normalizedRole) continue;

    if (OWNER_ROLE_VALUES.has(normalizedRole)) return "admin"; // Highest privilege wins immediately
    if (STAFF_ROLE_VALUES.has(normalizedRole)) resolvedRole = "staff"; // Fallback to staff if found
  }
  
  return resolvedRole;
};

const isHRMSStatusActive = (rawStatus) => {
  if (rawStatus === undefined || rawStatus === null || rawStatus === "") {
    return !env.HRMS_REQUIRE_STATUS;
  }

  if (typeof rawStatus === "boolean") {
    return rawStatus;
  }

  const normalized = toLowerCaseString(rawStatus);
  if (!normalized) {
    return !env.HRMS_REQUIRE_STATUS;
  }

  return ACTIVE_STATUS_VALUES.has(normalized);
};

const parseFirstLoginValue = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  const normalized = toLowerCaseString(value);
  if (!normalized) return null;
  if (FIRST_LOGIN_TRUE_VALUES.has(normalized)) return true;
  if (FIRST_LOGIN_FALSE_VALUES.has(normalized)) return false;

  return null;
};

const getFirstLoginCandidateFields = (preferredField = "") => {
  const normalizedPreferred = String(preferredField || "").trim();
  const merged = normalizedPreferred
    ? [normalizedPreferred, ...HRMS_FIRST_LOGIN_FIELD_CANDIDATES]
    : HRMS_FIRST_LOGIN_FIELD_CANDIDATES;

  return [...new Set(merged.map((field) => String(field || "").trim()).filter(Boolean))];
};

const resolveFirstLoginState = (record, preferredField = "") => {
  const fields = getFirstLoginCandidateFields(preferredField);
  let firstExplicitFalse = null;

  for (const field of fields) {
    const rawValue = getByPath(record, field);
    const parsedValue = parseFirstLoginValue(rawValue);

    if (parsedValue === true) {
      return {
        requiresPasswordChange: true,
        field,
      };
    }

    if (parsedValue === false && !firstExplicitFalse) {
      firstExplicitFalse = {
        requiresPasswordChange: false,
        field,
      };
    }
  }

  return firstExplicitFalse || {
    requiresPasswordChange: false,
    field: String(preferredField || "").trim() || null,
  };
};

const verifyPasswordAgainstHRMS = async (plainPassword, storedHash) => {
  const normalizedStoredHash = String(storedHash || "");
  if (!plainPassword || !normalizedStoredHash) return false;

  if (env.HRMS_PASSWORD_ALGORITHM === "plain") {
    return plainPassword === normalizedStoredHash;
  }

  if (["bcrypt", "bcryptjs"].includes(env.HRMS_PASSWORD_ALGORITHM)) {
    return bcrypt.compare(plainPassword, normalizedStoredHash);
  }

  logger.warn("Unsupported HRMS password algorithm", {
    configuredAlgorithm: env.HRMS_PASSWORD_ALGORITHM,
  });
  return false;
};

const getIdentifierFields = () => {
  const configuredFields = String(env.HRMS_IDENTIFIER_FIELDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const fields = configuredFields.length
    ? configuredFields
    : [env.HRMS_LOGIN_FIELD, env.HRMS_EMAIL_FIELD, env.HRMS_ID_FIELD].filter(Boolean);

  return [...new Set(fields.map((value) => String(value).trim()).filter(Boolean))];
};

const buildEmailQuery = (email) => {
  const field = String(env.HRMS_EMAIL_FIELD || "email").trim();

  if (!env.HRMS_LOGIN_CASE_INSENSITIVE) {
    return { [field]: email };
  }

  return {
    [field]: {
      $regex: `^${escapeRegex(email)}$`,
      $options: "i",
    },
  };
};

const buildIdentifierQuery = (identifier) => {
  const uniqueFields = getIdentifierFields();

  const clauses = uniqueFields.map((field) => {
    if (!env.HRMS_LOGIN_CASE_INSENSITIVE) {
      return { [field]: identifier };
    }

    return {
      [field]: {
        $regex: `^${escapeRegex(identifier)}$`,
        $options: "i",
      },
    };
  });

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { $or: clauses };
};

const buildProjection = () => {
  const projection = {
    _id: 1,
    [env.HRMS_ID_FIELD]: 1,
    [env.HRMS_LOGIN_FIELD]: 1,
    [env.HRMS_EMAIL_FIELD]: 1,
    [env.HRMS_NAME_FIELD]: 1,
    [env.HRMS_PASSWORD_FIELD]: 1,
    [env.HRMS_ROLE_FIELD]: 1,
    [env.HRMS_STATUS_FIELD]: 1,
    position: 1, // Fallback for many HRMS schemas
    POSITION: 1,
    Position: 1,
  };

  for (const field of HRMS_FIRST_LOGIN_FIELD_CANDIDATES) {
    projection[field] = 1;
  }

  return projection;
};

const buildContextQuery = ({ accountId, email, externalId }) => {
  const clauses = [];
  const fields = getIdentifierFields();

  const normalizedAccountId = toTrimmedString(accountId);
  if (normalizedAccountId) {
    fields.forEach((field) => {
      clauses.push({
        [field]: {
          $regex: `^${escapeRegex(normalizedAccountId)}$`,
          $options: "i",
        },
      });
    });
  }

  const normalizedEmail = toTrimmedString(email);
  if (normalizedEmail) {
    clauses.push({
      [env.HRMS_EMAIL_FIELD]: {
        $regex: `^${escapeRegex(normalizedEmail)}$`,
        $options: "i",
      },
    });
  }

  const normalizedExternalId = toTrimmedString(externalId);
  if (normalizedExternalId) {
    clauses.push({ [env.HRMS_ID_FIELD]: normalizedExternalId });

    if (/^[a-fA-F0-9]{24}$/.test(normalizedExternalId) && mongoose.Types.ObjectId.isValid(normalizedExternalId)) {
      clauses.push({ _id: new mongoose.Types.ObjectId(normalizedExternalId) });
    }
  }

  if (clauses.length === 0) {
    return null;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { $or: clauses };
};

const hashPasswordForHRMS = async (plainPassword) => {
  if (env.HRMS_PASSWORD_ALGORITHM === "plain") {
    return plainPassword;
  }

  if (["bcrypt", "bcryptjs"].includes(env.HRMS_PASSWORD_ALGORITHM)) {
    return bcrypt.hash(plainPassword, 10);
  }

  throw new Error(`Unsupported HRMS password algorithm: ${env.HRMS_PASSWORD_ALGORITHM}`);
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const asString = toTrimmedString(value);
    if (asString) return asString;
  }
  return "";
};

const resolveFullName = (source = {}) => {
  const direct = pickFirstNonEmpty(
    source?.fullName,
    source?.name,
    source?.displayName,
    source?.profile?.fullName,
    source?.personalInfo?.fullName
  );

  if (direct) return direct;

  const composed = [
    source?.firstName,
    source?.middleName,
    source?.lastName,
  ]
    .map((entry) => toTrimmedString(entry))
    .filter(Boolean)
    .join(" ");

  return composed || "";
};

const resolveContactNumber = (source = {}) => {
  return pickFirstNonEmpty(
    source?.contactNumber,
    source?.phone,
    source?.phoneNumber,
    source?.mobile,
    source?.mobileNumber,
    source?.contact?.number,
    source?.contact?.phone
  );
};

const resolvePositionLabel = (normalizedRole) => {
  if (normalizedRole === "admin") return "Admin";
  if (normalizedRole === "owner") return "Admin";
  return "Staff";
};

const buildProfileFromRecord = ({ record, fallback = {} }) => {
  const roleCandidates = [
    getByPath(record, env.HRMS_ROLE_FIELD),
    record?.position,
    record?.POSITION,
    record?.Position,
    fallback.role
  ];

  const extractAllStrings = (obj) => {
    if (!obj) return [];
    let strings = [];
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        strings.push(obj[key]);
      } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
        strings = strings.concat(extractAllStrings(obj[key]));
      }
    }
    return strings;
  };

  const allDocumentStrings = extractAllStrings(record);
  roleCandidates.push(...allDocumentStrings);

  const normalizedRole = resolveHRMSRole(roleCandidates) || String(fallback.role || "").toLowerCase() || "staff";
  const roleLabel = resolvePositionLabel(normalizedRole);

  const employeeId = pickFirstNonEmpty(
    record?.employeeId,
    record?.staffId,
    fallback.accountId
  );

  const accountId = pickFirstNonEmpty(
    record?.accountId,
    fallback.accountId
  );

  const email = pickFirstNonEmpty(
    getByPath(record, env.HRMS_EMAIL_FIELD),
    record?.email,
    fallback.email
  );

  const fullName = resolveFullName(record) || pickFirstNonEmpty(fallback.name);
  const contactNumber = resolveContactNumber(record);

  return {
    fullName: fullName || null,
    employeeId: employeeId || null,
    accountId: accountId || null,
    role: roleLabel || null,
    roleKey: normalizedRole,
    contactNumber: contactNumber || null,
    email: email || null,
    authSource: "HRMS",
    externalId: pickFirstNonEmpty(fallback.externalId, getByPath(record, env.HRMS_ID_FIELD), record?._id),
  };
};

export const authenticateAgainstHRMS = async ({ email, password }) => {
  if (!env.HRMS_AUTH_ENABLED) {
    return { authenticated: false, reason: "disabled" };
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { authenticated: false, reason: "invalid-input" };
  }

  const connection = await connectHRMS();
  if (!connection) {
    return { authenticated: false, reason: "unavailable" };
  }

  const collection = connection.collection(env.HRMS_USER_COLLECTION);

  // Removed projection to ensure we capture all custom fields from the HRMS database
  const hrmsUser = await collection.findOne(
    buildEmailQuery(normalizedEmail)
  );
  
  console.log("[DEBUG HRMS AUTH] Fetched HRMS User:", JSON.stringify(hrmsUser));

  if (!hrmsUser) {
    return { authenticated: false, reason: "not-found" };
  }

  const storedHash = getByPath(hrmsUser, env.HRMS_PASSWORD_FIELD);
  const passwordMatches = await verifyPasswordAgainstHRMS(password, storedHash);
  if (!passwordMatches) {
    return { authenticated: false, reason: "password-mismatch" };
  }

  const rawStatus = getByPath(hrmsUser, env.HRMS_STATUS_FIELD);
  if (!isHRMSStatusActive(rawStatus)) {
    return { authenticated: false, reason: "inactive" };
  }

  let hrmsProfileDoc = null;
  const configuredProfileCollection = String(env.HRMS_PROFILE_COLLECTION || "").trim();
  
  try {
    const rawBaseRole = pickFirstNonEmpty(getByPath(hrmsUser, env.HRMS_ROLE_FIELD), hrmsUser?.role, hrmsUser?.department);
    const relatedCollectionName = rawBaseRole ? `${toLowerCaseString(rawBaseRole)}s` : "";
    
    let baseCollections = [
      "accountings", "admins", "owners", "employees", "profiles", "employee_details", "user_profiles", "staff",
      "hr_employees", "personnel", "workers", "team", "members", "accounts",
      "users_details", "employee", "profile", "staff_members"
    ];

    if (relatedCollectionName && !baseCollections.includes(relatedCollectionName)) {
      baseCollections.unshift(relatedCollectionName);
    } else if (relatedCollectionName) {
      baseCollections = [relatedCollectionName, ...baseCollections.filter(c => c !== relatedCollectionName)];
    }

    let collectionsToScan = configuredProfileCollection 
      ? [configuredProfileCollection] 
      : baseCollections;

    for (const collName of collectionsToScan) {
      if (hrmsProfileDoc) break;
      if (collName === env.HRMS_USER_COLLECTION && !configuredProfileCollection) continue;

      try {
        const profileCollection = connection.collection(collName);
        const foundDoc = await profileCollection.findOne(buildEmailQuery(normalizedEmail));
        
        if (foundDoc) {
          hrmsProfileDoc = foundDoc;
          console.log(`[DEBUG HRMS AUTH] Found matching data in collection '${collName}'`);
        } else if (hrmsUser._id) {
           const foundById = await profileCollection.findOne({ 
            $or: [
              { userId: hrmsUser._id },
              { user_id: hrmsUser._id },
              { accountId: hrmsUser._id },
              { employeeId: hrmsUser._id }
            ]
          });
          if (foundById) {
            hrmsProfileDoc = foundById;
            console.log(`[DEBUG HRMS AUTH] Found matching data by ID in collection '${collName}'`);
          }
        }
      } catch (err) {
        // Ignore errors for individual collections (e.g. collection doesn't exist)
      }
    }
  } catch (err) {
    logger.error("Failed to execute HRMS collection scan", { error: err.message });
  }
  
  if (hrmsProfileDoc) {
    console.log("[DEBUG HRMS AUTH] Merged HRMS Profile Doc from secondary collections:", JSON.stringify(hrmsProfileDoc));
  }

  const mergedHrmsUser = { ...hrmsUser, ...(hrmsProfileDoc || {}) };

  const roleCandidates = [
    getByPath(mergedHrmsUser, env.HRMS_ROLE_FIELD),
    mergedHrmsUser?.position,
    mergedHrmsUser?.POSITION,
    mergedHrmsUser?.Position,
    mergedHrmsUser?.jobTitle,
    mergedHrmsUser?.designation,
    mergedHrmsUser?.title,
    mergedHrmsUser?.type,
    mergedHrmsUser?.role
  ];
  
  // Recursively scan all string values in the entire document (deep scan)
  const extractAllStrings = (obj) => {
    if (!obj) return [];
    let strings = [];
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        strings.push(obj[key]);
      } else if (Array.isArray(obj[key])) {
        for (const item of obj[key]) {
          if (typeof item === 'string') strings.push(item);
          else if (typeof item === 'object' && item !== null) strings = strings.concat(extractAllStrings(item));
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        strings = strings.concat(extractAllStrings(obj[key]));
      }
    }
    return strings;
  };

  const allDocumentStrings = extractAllStrings(mergedHrmsUser);
  roleCandidates.push(...allDocumentStrings);

  const mappedRole = resolveHRMSRole(roleCandidates);
  
  console.log("[DEBUG HRMS AUTH] Fetched HRMS User JSON:", JSON.stringify(mergedHrmsUser));
  console.log("[DEBUG HRMS AUTH] Mapped Role Result:", mappedRole);

  if (!mappedRole) {
    return { authenticated: false, reason: "role-not-mapped" };
  }

  const firstLoginState = resolveFirstLoginState(mergedHrmsUser);

  const externalIdSource = getByPath(mergedHrmsUser, env.HRMS_ID_FIELD) ?? mergedHrmsUser?._id;
  const externalId = String(externalIdSource ?? "").trim() || null;
  const tokenId = toDeterministicObjectId(externalId || normalizedEmail);

  if (!tokenId) {
    return { authenticated: false, reason: "invalid-id" };
  }

  const mappedEmail = String(
    getByPath(mergedHrmsUser, env.HRMS_EMAIL_FIELD) || getByPath(mergedHrmsUser, env.HRMS_LOGIN_FIELD) || normalizedEmail
  )
    .trim()
    .toLowerCase();

  let mappedName = String(getByPath(mergedHrmsUser, env.HRMS_NAME_FIELD) || "").trim() || null;
  let accountId = pickFirstNonEmpty(mergedHrmsUser?.accountId, mergedHrmsUser?.employeeId, mergedHrmsUser?.staffId) || null;

  if (!mappedName) {
    const enrichedProfile = await fetchHRMSProfileByContext({
      email: mappedEmail,
      externalId,
      role: mappedRole,
      name: mappedName,
    });

    if (enrichedProfile?.fullName) {
      mappedName = enrichedProfile.fullName;
    }

    if (!accountId && enrichedProfile?.accountId) {
      accountId = enrichedProfile.accountId;
    }
  }

  return {
    authenticated: true,
    requiresPasswordChange: firstLoginState.requiresPasswordChange,
    firstLoginField: firstLoginState.field,
    user: {
      id: tokenId,
      externalId,
      role: mappedRole,
      name: mappedName,
      email: mappedEmail,
      accountId,
      authSource: "HRMS",
    },
  };
};

export const updateHRMSFirstLoginPassword = async ({
  email,
  externalId,
  firstLoginField,
  newPassword,
}) => {
  if (!env.HRMS_AUTH_ENABLED) {
    return { updated: false, reason: "disabled" };
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedExternalId = String(externalId || "").trim();
  const normalizedPassword = String(newPassword || "");

  if (!normalizedPassword || (!normalizedEmail && !normalizedExternalId)) {
    return { updated: false, reason: "invalid-input" };
  }

  const connection = await connectHRMS();
  if (!connection) {
    return { updated: false, reason: "unavailable" };
  }

  const collection = connection.collection(env.HRMS_USER_COLLECTION);
  const lookupQuery = buildContextQuery({
    accountId: null,
    email: normalizedEmail,
    externalId: normalizedExternalId,
  });

  if (!lookupQuery) {
    return { updated: false, reason: "invalid-context" };
  }

  const hrmsUser = await collection.findOne(lookupQuery, {
    projection: buildProjection(),
  });

  if (!hrmsUser) {
    return { updated: false, reason: "not-found" };
  }

  const firstLoginState = resolveFirstLoginState(hrmsUser, firstLoginField);
  if (!firstLoginState.requiresPasswordChange) {
    return { updated: false, reason: "not-required" };
  }

  const hashedPassword = await hashPasswordForHRMS(normalizedPassword);

  const updates = {
    [env.HRMS_PASSWORD_FIELD]: hashedPassword,
  };

  const fieldToWrite = String(firstLoginField || firstLoginState.field || "").trim();
  if (fieldToWrite) {
    updates[fieldToWrite] = false;
  }

  const result = await collection.updateOne(
    { _id: hrmsUser._id },
    { $set: updates }
  );

  if (!result?.matchedCount) {
    return { updated: false, reason: "update-failed" };
  }

  return {
    updated: true,
    reason: "updated",
  };
};

export const fetchHRMSProfileByContext = async ({ accountId, email, externalId, role, name } = {}) => {
  if (!env.HRMS_AUTH_ENABLED) {
    return null;
  }

  const connection = await connectHRMS();
  if (!connection) {
    return null;
  }

  const contextQuery = buildContextQuery({ accountId, email, externalId });
  if (!contextQuery) {
    return null;
  }

  const projection = {
    _id: 1,
    [env.HRMS_ID_FIELD]: 1,
    [env.HRMS_LOGIN_FIELD]: 1,
    [env.HRMS_EMAIL_FIELD]: 1,
    [env.HRMS_NAME_FIELD]: 1,
    [env.HRMS_ROLE_FIELD]: 1,
    [env.HRMS_STATUS_FIELD]: 1,
    firstName: 1,
    middleName: 1,
    lastName: 1,
    fullName: 1,
    displayName: 1,
    contactNumber: 1,
    phone: 1,
    phoneNumber: 1,
    mobile: 1,
    mobileNumber: 1,
    contact: 1,
    personalInfo: 1,
    employeeId: 1,
    accountId: 1,
    staffId: 1,
    username: 1,
    role: 1,
    email: 1,
  };

  const primaryCollectionName = String(env.HRMS_USER_COLLECTION || "").trim();
  if (!primaryCollectionName) {
    return null;
  }

  const primaryCollection = connection.collection(primaryCollectionName);
  const primaryRecord = await primaryCollection.findOne(contextQuery, { projection });

  if (!primaryRecord) {
    return null;
  }

  const rawRole = pickFirstNonEmpty(getByPath(primaryRecord, env.HRMS_ROLE_FIELD), primaryRecord?.role);
  const relatedCollectionName = rawRole
    ? `${toLowerCaseString(rawRole)}s`
    : "";

  let mergedRecord = primaryRecord;

  if (
    relatedCollectionName &&
    relatedCollectionName !== primaryCollectionName &&
    /^[a-z0-9_]+$/i.test(relatedCollectionName)
  ) {
    try {
      const relatedCollection = connection.collection(relatedCollectionName);
      const relatedRecord = await relatedCollection.findOne(contextQuery, { projection });

      if (relatedRecord && typeof relatedRecord === "object") {
        mergedRecord = {
          ...relatedRecord,
          ...primaryRecord,
        };
      }
    } catch (error) {
      logger.warn("HRMS related profile collection lookup failed", {
        collection: relatedCollectionName,
        errorMessage: error.message,
      });
    }
  }

  return buildProfileFromRecord({
    record: mergedRecord,
    fallback: {
      accountId,
      email,
      externalId,
      role,
      name,
    },
  });
};