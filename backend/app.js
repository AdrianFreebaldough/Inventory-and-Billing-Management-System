const express = require("express");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.development.local" });

const app = express();
app.use(express.json());

// routes
app.use("/api/auth", require("./routes/auth.routes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
