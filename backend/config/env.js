import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load backend/.env first so startup does not depend on process cwd.
const backendEnvPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: backendEnvPath });

// Also allow values from current working directory to supplement local overrides.
dotenv.config();

const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const isTest = NODE_ENV === "test";
const isProduction = NODE_ENV === "production";
const isLocal = NODE_ENV === "development" || NODE_ENV === "local";
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const requiredEnv = ["IBMS_DB_URI", "JWT_SECRET"];
if (!isTest) {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const CORS_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && CORS_ORIGINS.length === 0) {
  throw new Error("CORS_ORIGINS is required in production and must contain at least one origin");
}

// Default behavior:
// - localhost/dev: cron enabled
// - serverless/prod: cron disabled unless explicitly enabled
const ENABLE_CRON = normalizeBoolean(
  process.env.ENABLE_CRON,
  isLocal && !isServerless
);

const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT || 3000),
  IBMS_DB_URI: process.env.IBMS_DB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  IBMS_INTEGRATION_TOKEN: String(process.env.IBMS_INTEGRATION_TOKEN || "").trim(),
  PARMS_STRICT_PATIENT_LOOKUP: normalizeBoolean(process.env.PARMS_STRICT_PATIENT_LOOKUP, false),
  PARMS_API_BASE_URL: String(process.env.PARMS_API_BASE_URL || "").trim(),
  PARMS_API_TOKEN: String(process.env.PARMS_API_TOKEN || "").trim(),
  PARMS_PATIENT_SEARCH_PATH: String(process.env.PARMS_PATIENT_SEARCH_PATH || "/api/v1/integrations/ibms/patients/search").trim(),
  PARMS_PATIENT_DETAILS_PATH: String(process.env.PARMS_PATIENT_DETAILS_PATH || "/api/v1/integrations/ibms/patients/{patientId}").trim(),
  PARMS_PATIENT_BALANCES_PATH: String(process.env.PARMS_PATIENT_BALANCES_PATH || "/api/v1/integrations/ibms/patients/{patientId}/pending-balances").trim(),
  PARMS_TRANSACTION_SYNC_PATH: String(process.env.PARMS_TRANSACTION_SYNC_PATH || "/api/v1/billing/ibms/sync").trim(),
  PARMS_SYNC_CURRENCY: String(process.env.PARMS_SYNC_CURRENCY || "PHP").trim().toUpperCase(),
  PARMS_IBMS_TOKEN: String(process.env.PARMS_IBMS_TOKEN || "").trim(),
  PARMS_SYNC_SIGNING_SECRET: String(process.env.PARMS_SYNC_SIGNING_SECRET || "").trim(),
  PARMS_SYNC_RETRY_404: normalizeBoolean(process.env.PARMS_SYNC_RETRY_404, false),
  PARMS_SYNC_WORKER_ENABLED: normalizeBoolean(process.env.PARMS_SYNC_WORKER_ENABLED, true),
  PARMS_SYNC_WORKER_INTERVAL_MS: Number(process.env.PARMS_SYNC_WORKER_INTERVAL_MS || 15000),
  ALLOW_VERCEL_PREVIEW_ORIGINS: normalizeBoolean(process.env.ALLOW_VERCEL_PREVIEW_ORIGINS, true),
  VERCEL_ORIGIN_SUFFIX: String(process.env.VERCEL_ORIGIN_SUFFIX || ".vercel.app").trim().toLowerCase(),
  CORS_ORIGINS,
  ENABLE_CRON,
  isTest,
  isProduction,
  isLocal,
  isServerless,
};

export default env;