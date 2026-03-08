import dotenv from "dotenv";

dotenv.config();
import app from "./app.js";
import connectIBMS from "./database/database.js";
import NotificationCronService from "./services/notificationCronService.js";

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectIBMS();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Start notification cron service
  const cronService = new NotificationCronService();
  cronService.start();
};

startServer();