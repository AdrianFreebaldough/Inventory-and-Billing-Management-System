const mongoose = require("mongoose");
const fs = require("fs");
require("dotenv").config({ path: "./backend/.env" }); // Assuming env is in backend or root

async function run() {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/IBMS";
    await mongoose.connect(uri);
    
    // Check IBMS DB
    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email: /hayn4q@gmail\.com/i });
    
    // Check HRMS DB
    let hrmsUser = null;
    if (process.env.HRMS_MONGODB_URI) {
      const hrmsConnection = await mongoose.createConnection(process.env.HRMS_MONGODB_URI).asPromise();
      const hrmsDb = hrmsConnection.db;
      const hrmsCollection = hrmsDb.collection(process.env.HRMS_USER_COLLECTION || "users");
      hrmsUser = await hrmsCollection.findOne({ [process.env.HRMS_EMAIL_FIELD || "email"]: /hayn4q@gmail\.com/i });
      await hrmsConnection.close();
    }

    const output = {
      ibmsUser: user,
      hrmsUser: hrmsUser
    };
    
    fs.writeFileSync("debug_users.json", JSON.stringify(output, null, 2));
    console.log("Done. Wrote to debug_users.json");
  } catch (err) {
    console.error(err);
    fs.writeFileSync("debug_users.json", JSON.stringify({ error: err.message }));
  } finally {
    await mongoose.disconnect();
  }
}

run();
