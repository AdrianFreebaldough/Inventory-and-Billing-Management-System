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
  CORS_ORIGINS,
  ENABLE_CRON,
  isTest,
  isProduction,
  isLocal,
  isServerless,
};

export default env;