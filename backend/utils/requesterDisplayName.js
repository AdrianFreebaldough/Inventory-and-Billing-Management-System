import mongoose from "mongoose";
import User from "../models/user.js";
import { fetchHRMSProfileByContext } from "../services/hrmsAuthService.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_NAME_VALUES = new Set(["staff", "owner", "admin", "user", "unknown", "n/a"]);

const toTrimmed = (value) => String(value || "").trim();

const normalizeRoleKey = (value) => {
  const normalized = toTrimmed(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === "administrator") return "owner";
  if (normalized === "employee") return "staff";
  return normalized;
};

const roleFallbackName = (role) => {
  return normalizeRoleKey(role) === "owner" ? "Admin" : "Staff";
};

const isLikelyIdentifier = (value) => {
  const normalized = toTrimmed(value);
  if (!normalized) return false;

  if (/^[a-f0-9]{24}$/i.test(normalized)) {
    return true;
  }

  if (/^[A-Z]{2,}-\d+/i.test(normalized)) {
    return true;
  }

  return !normalized.includes(" ") && /\d{3,}/.test(normalized);
};

const isMeaningfulPersonName = (value) => {
  const normalized = toTrimmed(value);
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (GENERIC_NAME_VALUES.has(lower)) return false;
  if (EMAIL_REGEX.test(normalized)) return false;
  if (isLikelyIdentifier(normalized)) return false;

  return /[a-z]/i.test(normalized);
};

const firstValidEmail = (...candidates) => {
  for (const candidate of candidates) {
    const normalized = toTrimmed(candidate).toLowerCase();
    if (EMAIL_REGEX.test(normalized)) {
      return normalized;
    }
  }

  return null;
};

const pickPreferredName = (candidates = [], role = null) => {
  for (const candidate of candidates) {
    const normalized = toTrimmed(candidate);
    if (isMeaningfulPersonName(normalized)) {
      return normalized;
    }
  }

  return roleFallbackName(role);
};

const resolveHrmsIdentity = async ({ externalId, email, role, name }) => {
  let profile = await fetchHRMSProfileByContext({
    externalId: toTrimmed(externalId) || null,
    email: toTrimmed(email).toLowerCase() || null,
    role: normalizeRoleKey(role),
    name: toTrimmed(name) || null,
  });

  const profileEmail = firstValidEmail(email, profile?.email);
  if ((!profile || !isMeaningfulPersonName(profile.fullName)) && profileEmail) {
    const byEmail = await fetchHRMSProfileByContext({
      externalId: toTrimmed(externalId) || null,
      email: profileEmail,
      role: normalizeRoleKey(role) || normalizeRoleKey(profile?.roleKey),
      name: toTrimmed(name) || toTrimmed(profile?.fullName) || null,
    });

    if (byEmail) {
      profile = byEmail;
    }
  }

  return profile;
};

export const resolveActorDisplayIdentity = async ({
  userId = null,
  name = null,
  email = null,
  role = null,
} = {}) => {
  const normalizedId = toTrimmed(userId) || null;
  const normalizedRole = normalizeRoleKey(role);
  const hintedName = toTrimmed(name) || null;
  const hintedEmail = firstValidEmail(email);

  if (isMeaningfulPersonName(hintedName)) {
    return {
      id: normalizedId,
      name: hintedName,
      email: hintedEmail,
      role: normalizedRole,
    };
  }

  let ibmsUser = null;
  if (normalizedId && mongoose.Types.ObjectId.isValid(normalizedId)) {
    ibmsUser = await User.findById(normalizedId).select("_id name email role").lean();
  }

  const hrmsProfile = await resolveHrmsIdentity({
    externalId: normalizedId,
    email: hintedEmail || ibmsUser?.email || null,
    role: normalizedRole || ibmsUser?.role || null,
    name: hintedName || ibmsUser?.name || null,
  });

  const resolvedRole = normalizeRoleKey(normalizedRole || ibmsUser?.role || hrmsProfile?.roleKey);
  const resolvedName = pickPreferredName(
    [hintedName, ibmsUser?.name, hrmsProfile?.fullName],
    resolvedRole
  );
  const resolvedEmail = firstValidEmail(hintedEmail, ibmsUser?.email, hrmsProfile?.email);

  return {
    id: normalizedId || (ibmsUser?._id ? String(ibmsUser._id) : null),
    name: resolvedName,
    email: resolvedEmail,
    role: resolvedRole,
  };
};

export const createCachedActorDisplayResolver = () => {
  const cache = new Map();

  return async (payload = {}) => {
    const cacheKey = JSON.stringify({
      userId: toTrimmed(payload?.userId || "") || null,
      name: toTrimmed(payload?.name || "") || null,
      email: toTrimmed(payload?.email || "") || null,
      role: normalizeRoleKey(payload?.role),
    });

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const resolved = await resolveActorDisplayIdentity(payload);
    cache.set(cacheKey, resolved);
    return resolved;
  };
};
