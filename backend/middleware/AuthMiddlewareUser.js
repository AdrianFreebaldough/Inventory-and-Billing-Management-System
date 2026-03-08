import jwt from "jsonwebtoken";
import mongoose from "mongoose";


/* ================= AUTH ================= */
export const protect = (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const candidateId = decoded?.id || decoded?._id || decoded?.userId || "";
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      return res.status(401).json({
        message: "Token payload is invalid or outdated. Please log in again.",
      });
    }

    req.user = {
      id: String(candidateId),
      role: String(decoded?.role || "").toUpperCase(),
      email: decoded?.email,
      name: decoded?.name || null,
    };

    next();
  } catch {
    return res.status(401).json({ message: "Token invalid" });
  }
};

/* ================= ROLE AUTH ================= */
export const authorizeRoles = (...allowedRoles) => {
  const normalizedAllowedRoles = allowedRoles.map((role) => String(role).toUpperCase());

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (!normalizedAllowedRoles.includes(String(req.user.role).toUpperCase())) {
      return res.status(403).json({
        message: "Forbidden: insufficient permissions",
      });
    }
    next();
  };
};

export const verifyToken = protect;
export const verifyOwner = authorizeRoles("OWNER");
export const verifyStaff = authorizeRoles("STAFF");

export default protect;