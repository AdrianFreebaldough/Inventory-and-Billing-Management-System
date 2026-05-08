import User from "../models/user.js";
import env from "../config/env.js";
import { fetchHRMSProfileByContext } from "./hrmsAuthService.js";
import logger from "../utils/logger.js";

/**
 * Automatically audits and synchronizes the roles of all existing IBMS accounts
 * based on their HRMS profile position.
 * This guarantees that accounts previously created or saved with an incorrect "staff" role
 * are automatically upgraded to "admin" or "owner" if their HRMS profile states so.
 */
export const runHRMSAccountSyncAudit = async () => {
  if (!env.HRMS_AUTH_ENABLED) {
    logger.info("HRMS Auth is disabled. Skipping account synchronization audit.");
    return;
  }

  try {
    logger.info("Starting HRMS Account Synchronization Audit...");
    const allUsers = await User.find({});
    
    let correctedCount = 0;

    for (const user of allUsers) {
      try {
        const hrmsProfile = await fetchHRMSProfileByContext({
          email: user.email,
          externalId: user.hrmsId,
        });

        const rawHrmsRole = String(hrmsProfile?.role || "").trim().toLowerCase();
        const validHrmsRole = ["owner", "admin", "staff"].includes(rawHrmsRole) ? rawHrmsRole : null;

        if (validHrmsRole && validHrmsRole !== user.role) {
          logger.info(`[HRMS SYNC AUDIT] Correcting IBMS role for user ${user.email} from '${user.role}' to '${validHrmsRole}'`);
          user.role = validHrmsRole;
          await user.save();
          correctedCount++;
        }
      } catch (err) {
        logger.error(`[HRMS SYNC AUDIT] Failed to audit user ${user.email}`, { error: err.message });
      }
    }

    logger.info(`HRMS Account Synchronization Audit complete. Corrected ${correctedCount} accounts.`);
  } catch (error) {
    logger.error("Failed to run HRMS Account Synchronization Audit", { error: error.message });
  }
};
