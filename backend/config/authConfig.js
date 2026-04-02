import env from "./env.js";

const authConfig = {
  jwtSecret: env.JWT_SECRET,
};

export default authConfig;
