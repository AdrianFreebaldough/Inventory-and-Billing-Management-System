const API_BASE_URL = window.IBMS_API_BASE_URL || "http://localhost:3000";

const TOKEN_STORAGE_KEYS = ["token", "authToken", "jwtToken", "ibmsToken"];

const getStoredToken = () => {
  for (const key of TOKEN_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

const toQueryString = (query = {}) => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const asString = String(value).trim();
    if (!asString) {
      return;
    }

    params.set(key, asString);
  });

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
};

export const apiFetch = async (path, options = {}) => {
  const auth = window.IBMSAuth;
  const token = auth?.getValidToken ? auth.getValidToken() : getStoredToken();

  if (!token) {
    if (auth) {
      auth.clearAuthData();
      auth.redirectToLogin(true);
    }
    throw new Error("Authentication required. Please log in again.");
  }

  const headers = {
    ...(options.headers || {}),
  };

  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (response.status === 401 || response.status === 403) {
    if (auth) {
      auth.clearAuthData();
      auth.redirectToLogin(true);
    }
  }

  if (!response.ok) {
    const message = payload?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
};

export const buildQueryString = toQueryString;
