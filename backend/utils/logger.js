const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = String(process.env.LOG_LEVEL || "info").toLowerCase();
const activeLevel = LOG_LEVELS[configuredLevel] || LOG_LEVELS.info;

const writeLog = (level, message, meta = {}) => {
  if ((LOG_LEVELS[level] || LOG_LEVELS.info) < activeLevel) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const serialized = JSON.stringify(payload);
  if (level === "error" || level === "warn") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
};

const logger = {
  debug: (message, meta) => writeLog("debug", message, meta),
  info: (message, meta) => writeLog("info", message, meta),
  warn: (message, meta) => writeLog("warn", message, meta),
  error: (message, meta) => writeLog("error", message, meta),
};

export default logger;