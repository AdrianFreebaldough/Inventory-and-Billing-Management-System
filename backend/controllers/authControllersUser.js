import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import {
  authenticateAgainstHRMS,
  fetchHRMSProfileByContext,
  updateHRMSFirstLoginPassword,
} from "../services/hrmsAuthService.js";
import { escapeRegex } from "../utils/accountIdUtils.js";

const AUTH_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const AUTH_isValidEmail = (value) => AUTH_EMAIL_REGEX.test(AUTH_normalizeEmail(value));
const AUTH_FIRST_LOGIN_CHALLENGE_PURPOSE = "hrms-first-login-password-change";
const AUTH_TEMP_HRMS_PASSWORD = "__HRMS_SYNCED_ACCOUNT__";

const AUTH_isSuspendedStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "suspended";
};

const AUTH_isStrongPassword = (value) => {
  const password = String(value || "");
  return (
    password.length >= 8
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password)
  );
};

const AUTH_issueFirstLoginChallenge = (profile, firstLoginField) => {
  return jwt.sign(
    {
      purpose: AUTH_FIRST_LOGIN_CHALLENGE_PURPOSE,
      authSource: "HRMS",
      id: profile.id,
      role: profile.role,
      name: profile.name,
      email: profile.email,
      accountId: profile.accountId || profile.email,
      externalId: profile.externalId || null,
      firstLoginField: String(firstLoginField || "").trim() || null,
    },
    env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const AUTH_syncHRMSUserToIBMS = async (hrmsProfile = {}) => {
  const normalizedEmail = AUTH_normalizeEmail(hrmsProfile?.email);
  const externalId = String(hrmsProfile?.externalId || "").trim() || null;
  const normalizedRole = String(hrmsProfile?.role || "").trim().toLowerCase();
  const displayName = String(hrmsProfile?.name || "").trim() || null;

  if (!AUTH_isValidEmail(normalizedEmail)) {
    throw new Error("HRMS profile email is invalid");
  }

  if (!["owner", "staff"].includes(normalizedRole)) {
    throw new Error("HRMS profile role is invalid");
  }

  const hashedPlaceholderPassword = await bcrypt.hash(AUTH_TEMP_HRMS_PASSWORD, 10);

  let user = null;
  if (externalId) {
    user = await User.findOne({ hrmsId: externalId });
  }

  if (!user) {
    user = await User.findOne({
      email: {
        $regex: `^${escapeRegex(normalizedEmail)}$`,
        $options: "i",
      },
    });
  }

  if (!user) {
    user = await User.create({
      hrmsId: externalId,
      name: displayName,
      email: normalizedEmail,
      password: hashedPlaceholderPassword,
      role: normalizedRole,
      status: "active",
      isActive: true,
      archivedAt: null,
      archiveReason: null,
    });

    return user;
  }

  user.hrmsId = externalId || user.hrmsId || null;
  user.name = displayName || user.name || null;
  user.email = normalizedEmail;
  user.role = normalizedRole;
  if (!AUTH_isSuspendedStatus(user.status)) {
    user.status = "active";
  }
  user.isActive = true;
  user.archivedAt = null;
  user.archiveReason = null;

  // Ensure old migrated records without local password remain valid documents.
  if (!user.password) {
    user.password = hashedPlaceholderPassword;
  }

  await user.save();
  return user;
};

const AUTH_issueTokenAndRespond = ({ res, profile }) => {
  const token = jwt.sign(
    {
      id: profile.id,
      role: profile.role,
      name: profile.name,
      email: profile.email,
      accountId: profile.accountId || profile.email,
      authSource: profile.authSource || "IBMS",
      externalId: profile.externalId || null,
    },
    env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return res.status(200).json({
    token,
    user: {
      id: profile.id,
      name: profile.name || null,
      email: profile.email,
      accountId: profile.accountId || profile.email,
      role: profile.role,
      authSource: profile.authSource || "IBMS",
      externalId: profile.externalId || null,
    },
  });
};

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const email = AUTH_normalizeEmail(
      req.body?.email || req.body?.username
    );
    const password = String(req.body?.password || "");

    if (!AUTH_isValidEmail(email) || !password) {
      return res.status(400).json({ message: "valid email and password are required" });
    }

    // 1) Keep standalone IBMS accounts as primary login path.
    const user = await User.findOne({
      email: {
        $regex: `^${escapeRegex(email)}$`,
        $options: "i",
      },
    });
    if (user && !user.hrmsId) {
      if (AUTH_isSuspendedStatus(user.status)) {
        return res.status(403).json({ message: "Account suspended. Please contact administrator." });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        if (!env.HRMS_AUTH_ENABLED) {
          return res.status(401).json({ message: "Invalid credentials" });
        }
      } else {
        return AUTH_issueTokenAndRespond({
          res,
          profile: {
            id: String(user._id),
            role: user.role,
            name: user.name || null,
            email: user.email,
            accountId: user.email,
            authSource: "IBMS",
            externalId: null,
          },
        });
      }
    }

    // 2) Optional HRMS login fallback.
    if (env.HRMS_AUTH_ENABLED) {
      const existingHrmsShadow = await User.findOne({
        email: {
          $regex: `^${escapeRegex(email)}$`,
          $options: "i",
        },
      }).lean();

      if (existingHrmsShadow && AUTH_isSuspendedStatus(existingHrmsShadow.status)) {
        return res.status(403).json({ message: "Account suspended. Please contact administrator." });
      }

      const hrmsResult = await authenticateAgainstHRMS({ email, password });
      if (hrmsResult?.authenticated && hrmsResult?.user) {
        if (hrmsResult?.requiresPasswordChange) {
          const challengeToken = AUTH_issueFirstLoginChallenge(
            hrmsResult.user,
            hrmsResult?.firstLoginField
          );

          return res.status(200).json({
            requiresPasswordChange: true,
            challengeToken,
            message: "Password change is required before continuing.",
          });
        }

        const syncedUser = await AUTH_syncHRMSUserToIBMS(hrmsResult.user);

        if (AUTH_isSuspendedStatus(syncedUser.status)) {
          return res.status(403).json({ message: "Account suspended. Please contact administrator." });
        }

        return AUTH_issueTokenAndRespond({
          res,
          profile: {
            id: String(syncedUser._id),
            role: syncedUser.role,
            name: syncedUser.name || hrmsResult.user.name || null,
            email: syncedUser.email,
            accountId: syncedUser.email,
            authSource: "HRMS",
            externalId: hrmsResult.user.externalId || syncedUser.hrmsId || null,
          },
        });
      }

      logger.warn("HRMS authentication attempt failed", {
        email,
        reason: hrmsResult?.reason || "unknown",
      });
    }

    return res.status(401).json({ message: "Invalid credentials" });
  } catch (error) {
    logger.error("Login failed", { errorMessage: error.message });
    res.status(500).json({ message: "Server error during login" });
  }
};

export const completeFirstLoginPasswordChange = async (req, res) => {
  try {
    const challengeToken = String(req.body?.challengeToken || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!challengeToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "challengeToken, newPassword, and confirmPassword are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (!AUTH_isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, number, and special character",
      });
    }

    let payload;
    try {
      payload = jwt.verify(challengeToken, env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid or expired password change session" });
    }

    if (
      payload?.purpose !== AUTH_FIRST_LOGIN_CHALLENGE_PURPOSE
      || String(payload?.authSource || "").toUpperCase() !== "HRMS"
    ) {
      return res.status(401).json({ message: "Invalid password change session" });
    }

    const updateResult = await updateHRMSFirstLoginPassword({
      email: payload?.email,
      externalId: payload?.externalId,
      firstLoginField: payload?.firstLoginField,
      newPassword,
    });

    if (!updateResult?.updated) {
      if (updateResult?.reason === "not-required") {
        return res.status(409).json({ message: "Password change is no longer required for this account" });
      }

      const isTransientFailure = ["unavailable", "update-failed"].includes(updateResult?.reason);
      return res
        .status(isTransientFailure ? 503 : 400)
        .json({ message: "Unable to update password in HRMS" });
    }

    const normalizedRole = String(payload?.role || "").trim().toLowerCase();
    if (!normalizedRole || !["owner", "staff"].includes(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role in password change session" });
    }

    const tokenId = String(payload?.id || "").trim();
    const tokenEmail = AUTH_normalizeEmail(payload?.email);
    if (!tokenId || !AUTH_isValidEmail(tokenEmail)) {
      return res.status(400).json({ message: "Invalid password change session payload" });
    }

    const syncedUser = await AUTH_syncHRMSUserToIBMS({
      externalId: payload?.externalId || null,
      role: normalizedRole,
      name: String(payload?.name || "").trim() || null,
      email: tokenEmail,
    });

    if (AUTH_isSuspendedStatus(syncedUser.status)) {
      return res.status(403).json({ message: "Account suspended. Please contact administrator." });
    }

    return AUTH_issueTokenAndRespond({
      res,
      profile: {
        id: String(syncedUser._id),
        role: syncedUser.role,
        name: syncedUser.name || String(payload?.name || "").trim() || null,
        email: syncedUser.email,
        accountId: syncedUser.email,
        authSource: "HRMS",
        externalId: String(payload?.externalId || syncedUser.hrmsId || "").trim() || null,
      },
    });
  } catch (error) {
    logger.error("First login password change failed", { errorMessage: error.message });
    return res.status(500).json({ message: "Server error while changing password" });
  }
};

/* ================= CREATE USER (SAVE TO IBMS) ================= */
// Owner-only (protected by middleware)
export const createUser = async (req, res) => {
  try {
    const requestedEmail = AUTH_normalizeEmail(req.body?.email || req.body?.accountId);
    const password = String(req.body?.password || "");
    const role = req.body?.role;
    const normalizedRole = String(role || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();

    if (!requestedEmail || !password || !normalizedRole) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!AUTH_isValidEmail(requestedEmail)) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (!["owner", "staff"].includes(normalizedRole)) {
      return res.status(400).json({ message: "role must be owner or staff" });
    }

    // Prevent duplicate users
    const existingUser = await User.findOne({
      email: {
        $regex: `^${escapeRegex(requestedEmail)}$`,
        $options: "i",
      },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save to IBMS database
    const user = await User.create({
      name: name || null,
      email: requestedEmail,
      password: hashedPassword,
      role: normalizedRole,
      isActive: true,
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        accountId: user.email,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Create user failed", { errorMessage: error.message });
    res.status(500).json({ message: "Failed to create user" });
  }
};

export const getMyProfile = async (req, res) => {
  try {
    const authSource = String(req.user?.authSource || "IBMS").toUpperCase();

    if (authSource === "HRMS") {
      const hrmsProfile = await fetchHRMSProfileByContext({
        accountId: null,
        email: req.user?.email,
        externalId: req.user?.externalId,
        role: String(req.user?.role || "").toLowerCase(),
        name: req.user?.name || null,
      });

      const fallbackEmail = String(req.user?.email || "").trim().toLowerCase() || null;

      return res.status(200).json({
        data: {
          fullName: hrmsProfile?.fullName || req.user?.name || null,
          employeeId: hrmsProfile?.employeeId || null,
          accountId: hrmsProfile?.accountId || null,
          role: hrmsProfile?.role || String(req.user?.role || "Staff").toUpperCase(),
          roleKey: hrmsProfile?.roleKey || String(req.user?.role || "staff").toLowerCase(),
          contactNumber: hrmsProfile?.contactNumber || null,
          email: hrmsProfile?.email || fallbackEmail,
          authSource: "HRMS",
        },
      });
    }

    const user = await User.findById(req.user?.id)
      .select("name email role")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.status(200).json({
      data: {
        fullName: user.name || null,
        employeeId: user.email || null,
        accountId: user.email || null,
        role: String(user.role || "staff").toUpperCase(),
        roleKey: String(user.role || "staff").toLowerCase(),
        contactNumber: null,
        email: user.email || null,
        authSource: "IBMS",
      },
    });
  } catch (error) {
    logger.error("Failed to fetch profile", {
      errorMessage: error.message,
      authSource: req.user?.authSource,
    });
    return res.status(500).json({ message: "Failed to fetch profile" });
  }
};