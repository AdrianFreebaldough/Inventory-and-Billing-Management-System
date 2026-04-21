import { apiFetch } from "../utils/apiClient.js";

const CONFIG = {
  notificationDuration: 3000,
};

const getElements = () => ({
  avatar: document.getElementById("profile-avatar"),
  displayName: document.getElementById("profile-fullname"),
  displayRole: document.getElementById("profile-role"),
  fullName: document.getElementById("full-name"),
  employeeId: document.getElementById("employee-id"),
  role: document.getElementById("role"),
  contactNumber: document.getElementById("contact-number"),
  email: document.getElementById("email"),
  saveBtn: document.getElementById("saveProfileBtn"),
});

const decodeTokenPayload = () => {
  const tokenKeys = ["token", "authToken", "jwtToken", "ibmsToken"];
  for (const key of tokenKeys) {
    const token = localStorage.getItem(key);
    if (!token || !token.trim()) continue;

    const parts = token.split(".");
    if (parts.length < 2) continue;

    try {
      return JSON.parse(atob(parts[1]));
    } catch {
      // ignore malformed token payload
    }
  }

  return null;
};

const toTitleCase = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

const getInitials = (name) => {
  const normalized = String(name || "").trim();
  if (!normalized) return "U";

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);
};

const fallbackProfile = (userType = "staff") => {
  const payload = decodeTokenPayload();
  const accountId = String(
    localStorage.getItem("userAccountId") ||
      localStorage.getItem("userEmail") ||
      payload?.accountId ||
      payload?.email ||
      ""
  )
    .trim()
    .toUpperCase();

  const roleKey = String(payload?.role || localStorage.getItem("role") || userType || "staff").trim().toLowerCase();
  const roleLabel = toTitleCase(roleKey || "staff");

  const fullName = String(localStorage.getItem("userName") || "").trim() || accountId || "User";

  return {
    fullName,
    employeeId: accountId || "N/A",
    role: roleLabel,
    contactNumber: "",
    email: String(payload?.email || "").trim(),
    authSource: String(payload?.authSource || "IBMS").toUpperCase(),
  };
};

const normalizeProfileResponse = (payload = {}, userType = "staff") => {
  const data = payload?.data || {};
  const fallback = fallbackProfile(userType);

  const fullName = String(data?.fullName || "").trim() || fallback.fullName;
  const employeeId = String(data?.employeeId || data?.accountId || "").trim().toUpperCase() || fallback.employeeId;
  const role = String(data?.role || "").trim() || fallback.role;
  const contactNumber = String(data?.contactNumber || "").trim() || "";
  const email = String(data?.email || "").trim() || "";
  const authSource = String(data?.authSource || fallback.authSource || "IBMS").toUpperCase();

  return {
    fullName,
    employeeId,
    role,
    contactNumber,
    email,
    authSource,
  };
};

const showNotification = (message, type = "info") => {
  document.querySelectorAll(".profile-notification").forEach((el) => el.remove());

  const palette = {
    info: "bg-blue-600",
    success: "bg-green-600",
    error: "bg-red-600",
  };

  const notification = document.createElement("div");
  notification.className = `profile-notification fixed bottom-16 right-14 px-4 py-3 rounded-lg text-white font-medium z-50 shadow-lg ${palette[type] || palette.info}`;
  notification.textContent = message;

  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), CONFIG.notificationDuration);
};

const renderProfile = (elements, profile) => {
  if (!elements || !profile) return;

  if (elements.avatar) {
    elements.avatar.textContent = getInitials(profile.fullName || profile.employeeId);
  }

  if (elements.displayName) {
    elements.displayName.textContent = profile.fullName || profile.employeeId || "User";
  }

  if (elements.displayRole) {
    const suffix = profile.authSource === "HRMS" ? " (HRMS)" : "";
    elements.displayRole.textContent = `${profile.role || "Staff"}${suffix}`;
  }

  if (elements.fullName) {
    elements.fullName.value = profile.fullName || "";
  }

  if (elements.employeeId) {
    elements.employeeId.value = profile.employeeId || "";
  }

  if (elements.role) {
    elements.role.value = profile.role || "";
  }

  if (elements.contactNumber) {
    elements.contactNumber.value = profile.contactNumber || "";
  }

  if (elements.email) {
    elements.email.value = profile.email || "";
  }
};

const setReadonlyFields = (elements) => {
  [elements.fullName, elements.employeeId, elements.role, elements.contactNumber, elements.email].forEach((field) => {
    if (!field) return;
    field.setAttribute("readonly", "readonly");
  });
};

const loadProfile = async ({ elements, userType }) => {
  try {
    const payload = await apiFetch("/api/auth/profile/me", { method: "GET" });
    const profile = normalizeProfileResponse(payload, userType);
    renderProfile(elements, profile);
  } catch (error) {
    const fallback = fallbackProfile(userType);
    renderProfile(elements, fallback);
    showNotification(error?.message || "Unable to load profile from server", "error");
  }
};

export const initProfile = (userType = "staff") => {
  const run = async () => {
    const elements = getElements();
    const missing = Object.entries(elements)
      .filter(([, el]) => !el)
      .map(([key]) => key);

    if (missing.length > 0) {
      return;
    }

    setReadonlyFields(elements);

    if (elements.saveBtn) {
      elements.saveBtn.textContent = "Refresh Profile";
      elements.saveBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        await loadProfile({ elements, userType });
        showNotification("Profile refreshed", "success");
      });
    }

    await loadProfile({ elements, userType });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
};

if (typeof window !== "undefined" && document.querySelector("#contentArea")) {
  initProfile();
}
