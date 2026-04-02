import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";

const AUTH_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_normalizeEmail = (email) => String(email || "").trim().toLowerCase();

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const email = AUTH_normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    if (!AUTH_EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // 1. Find user in IBMS DB
    const user = await User.findOne({ email });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3. Generate JWT
    const token = jwt.sign(
      {
        id: user._id, // MongoDB ID
        role: user.role,
        name: user.name,
        email: user.email,
      },
      env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name || null,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Login failed", { errorMessage: error.message });
    res.status(500).json({ message: "Server error during login" });
  }
};

/* ================= CREATE USER (SAVE TO IBMS) ================= */
// Owner-only (protected by middleware)
export const createUser = async (req, res) => {
  try {
    const email = AUTH_normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const role = req.body?.role;
    const normalizedRole = String(role || "").trim().toLowerCase();

    if (!email || !password || !normalizedRole) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!AUTH_EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (!["owner", "staff"].includes(normalizedRole)) {
      return res.status(400).json({ message: "role must be owner or staff" });
    }

    // Prevent duplicate users
    const existingUser = await User.findOne({
      email,
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save to IBMS database
    const user = await User.create({
      email,
      password: hashedPassword,
      role: normalizedRole,
      isActive: true,
    });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Create user failed", { errorMessage: error.message });
    res.status(500).json({ message: "Failed to create user" });
  }
};