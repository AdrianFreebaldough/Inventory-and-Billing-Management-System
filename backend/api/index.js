import app from "../app.js";
import connectIBMS from "../database/database.js";
import logger from "../utils/logger.js";

export default async function handler(req, res) {
  try {
    await connectIBMS();
    return app(req, res);
  } catch (error) {
    logger.error("Serverless request failed", {
      errorMessage: error.message,
    });
    return res.status(500).json({ message: "Service unavailable" });
  }
}
