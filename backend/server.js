import dotenv from "dotenv";
import app from "./app.js";
import connectIBMS from "./database/database.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectIBMS();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();