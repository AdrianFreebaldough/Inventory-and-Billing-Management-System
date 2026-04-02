import app from "./app.js";
import env from "./config/env.js";
import connectIBMS from "./database/database.js";
import NotificationCronService from "./services/notificationCronService.js";
import { repairAllInventoryBatchIntegrity } from "./services/inventoryIntegrityService.js";
import logger from "./utils/logger.js";

const PORT = env.PORT;

const startServer = async () => {
  await connectIBMS();

  const integritySummary = await repairAllInventoryBatchIntegrity({
    createDefaultBatchIfMissing: true,
    warningContext: "startup-batch-repair",
  });
  logger.info("Inventory integrity repair complete", {
    scanned: integritySummary.scannedProducts,
    corrected: integritySummary.correctedProducts,
    defaultBatches: integritySummary.createdDefaultBatches,
    normalizedBatches: integritySummary.normalizedBatches,
  });

  app.listen(PORT, () => {
    logger.info("Server started", { port: PORT, env: env.NODE_ENV });
  });

  // Cron fallback policy:
  // - enabled by default on localhost/dev
  // - disabled on serverless/prod unless ENABLE_CRON=true
  if (env.ENABLE_CRON) {
    const cronService = new NotificationCronService();
    cronService.start();
    logger.info("Cron service started", { enableCron: env.ENABLE_CRON });
  } else {
    logger.info("Cron service skipped", {
      enableCron: env.ENABLE_CRON,
      isServerless: env.isServerless,
    });
  }
};

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    errorMessage: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

startServer().catch((error) => {
  logger.error("Startup failed", {
    errorMessage: error.message,
    stack: error.stack,
  });
  process.exit(1);
});