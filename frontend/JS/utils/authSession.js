(function initIBMSAuthSession(global) {
  const LOGIN_PAGE_PATH = "../../HTML/loginPage/loginPage.html";
  const TOKEN_KEYS = ["token", "authToken", "jwtToken", "ibmsToken"];
  const ROLE_KEYS = ["role", "userRole"];
  const USER_KEYS = ["userEmail", "userName", "isAuthenticated", "authFlag"];
  const SESSION_KEYS = [
    "staffDashboardCurrentRoute",
    "billingModeReturnRoute",
    "currentRoute",
    "returnRoute",
  ];

  function getStorageCandidates() {
    const stores = [];
    try {
      stores.push(global.localStorage);
    } catch {
      /* noop */
    }

    try {
      stores.push(global.sessionStorage);
    } catch {
      /* noop */
    }

    return stores.filter(Boolean);
  }

  function getStoredValue(keys) {
    const stores = getStorageCandidates();
    for (const store of stores) {
      for (const key of keys) {
        const value = store.getItem(key);
        if (value && value.trim()) {
          return value.trim();
        }
      }
    }

    return "";
  }

  function decodeJwtPayload(token) {
    if (!token || typeof token !== "string") {
      return null;
    }

    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    try {
      const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(global.atob(padded));
    } catch {
      return null;
    }
  }

  function isTokenExpired(payload) {
    if (!payload || typeof payload.exp !== "number") {
      return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSeconds;
  }

  function getTokenPayload() {
    const token = getStoredValue(TOKEN_KEYS);
    if (!token) {
      return null;
    }

    return decodeJwtPayload(token);
  }

  function getCurrentRole() {
    const storedRole = getStoredValue(ROLE_KEYS);
    if (storedRole) {
      return storedRole.toLowerCase();
    }

    const payload = getTokenPayload();
    return String(payload?.role || "").toLowerCase();
  }

  function getValidToken() {
    const token = getStoredValue(TOKEN_KEYS);
    if (!token) {
      return "";
    }

    const payload = decodeJwtPayload(token);
    if (payload && isTokenExpired(payload)) {
      clearAuthData();
      return "";
    }

    return token;
  }

  function clearAuthCookies() {
    try {
      const cookieNames = document.cookie
        .split(";")
        .map((entry) => entry.split("=")[0]?.trim())
        .filter(Boolean);

      const authCookieNames = new Set([
        ...cookieNames,
        ...TOKEN_KEYS,
        ...ROLE_KEYS,
        ...USER_KEYS,
        "jwt",
        "session",
      ]);

      authCookieNames.forEach((name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      });
    } catch {
      /* noop */
    }
  }

  function clearAuthData() {
    const keysToRemove = [...TOKEN_KEYS, ...ROLE_KEYS, ...USER_KEYS];
    const stores = getStorageCandidates();

    stores.forEach((store) => {
      keysToRemove.forEach((key) => store.removeItem(key));
      SESSION_KEYS.forEach((key) => store.removeItem(key));
    });

    try {
      global.sessionStorage.clear();
    } catch {
      /* noop */
    }

    clearAuthCookies();
  }

  function buildLoginUrl() {
    return new URL(LOGIN_PAGE_PATH, global.location.href).toString();
  }

  function redirectToLogin(useReplace) {
    const loginUrl = buildLoginUrl();

    let targetWindow = global;
    try {
      if (global.top && global.top.location && global.top.location.origin === global.location.origin) {
        targetWindow = global.top;
      }
    } catch {
      targetWindow = global;
    }

    if (useReplace) {
      targetWindow.location.replace(loginUrl);
      return;
    }

    targetWindow.location.href = loginUrl;
  }

  function enforceNoCacheMeta() {
    const head = document.head;
    if (!head) {
      return;
    }

    const defs = [
      { attr: "http-equiv", key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
      { attr: "http-equiv", key: "Pragma", value: "no-cache" },
      { attr: "http-equiv", key: "Expires", value: "0" },
    ];

    defs.forEach(({ attr, key, value }) => {
      let meta = head.querySelector(`meta[${attr}='${key}']`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute(attr, key);
        head.appendChild(meta);
      }
      meta.setAttribute("content", value);
    });
  }

  function isSessionValid(requiredRole) {
    const token = getValidToken();
    if (!token) {
      return false;
    }

    const payload = decodeJwtPayload(token);
    if (!payload) {
      return false;
    }

    if (isTokenExpired(payload)) {
      return false;
    }

    if (requiredRole) {
      const normalizedRequired = String(requiredRole).toLowerCase();
      const currentRole = getCurrentRole();
      if (currentRole !== normalizedRequired) {
        return false;
      }
    }

    return true;
  }

  function protectPage(options) {
    const requiredRole = options?.requiredRole ? String(options.requiredRole).toLowerCase() : "";
    enforceNoCacheMeta();

    const verifyAndRedirect = () => {
      if (!isSessionValid(requiredRole)) {
        clearAuthData();
        redirectToLogin(true);
      }
    };

    verifyAndRedirect();
    global.addEventListener("pageshow", verifyAndRedirect);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        verifyAndRedirect();
      }
    });
  }

  function showConfirmationModal(options = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById("ibmsAuthConfirmOverlay");
      if (existing) {
        existing.remove();
      }

      const overlay = document.createElement("div");
      overlay.id = "ibmsAuthConfirmOverlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(15, 23, 42, 0.45)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "10050";
      overlay.style.padding = "16px";

      const dialog = document.createElement("div");
      dialog.style.width = "100%";
      dialog.style.maxWidth = "420px";
      dialog.style.background = "#ffffff";
      dialog.style.borderRadius = "12px";
      dialog.style.boxShadow = "0 20px 40px rgba(15, 23, 42, 0.25)";
      dialog.style.border = "1px solid #e2e8f0";
      dialog.style.padding = "20px";

      const title = document.createElement("h3");
      title.textContent = options.title || "Confirm Logout";
      title.style.margin = "0 0 10px 0";
      title.style.fontSize = "18px";
      title.style.fontWeight = "600";
      title.style.color = "#0f172a";

      const message = document.createElement("p");
      message.textContent = options.message || "Are you sure you want to log out?";
      message.style.margin = "0 0 18px 0";
      message.style.fontSize = "14px";
      message.style.color = "#475569";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "10px";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = options.cancelText || "Cancel";
      cancelBtn.style.padding = "8px 14px";
      cancelBtn.style.borderRadius = "8px";
      cancelBtn.style.border = "1px solid #cbd5e1";
      cancelBtn.style.background = "#ffffff";
      cancelBtn.style.color = "#334155";
      cancelBtn.style.cursor = "pointer";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.textContent = options.confirmText || "Logout";
      confirmBtn.style.padding = "8px 14px";
      confirmBtn.style.borderRadius = "8px";
      confirmBtn.style.border = "1px solid #dc2626";
      confirmBtn.style.background = "#dc2626";
      confirmBtn.style.color = "#ffffff";
      confirmBtn.style.cursor = "pointer";

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      cancelBtn.addEventListener("click", () => cleanup(false));
      confirmBtn.addEventListener("click", () => cleanup(true));

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          cleanup(false);
        }
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            cleanup(false);
          }
        },
        { once: true }
      );

      actions.append(cancelBtn, confirmBtn);
      dialog.append(title, message, actions);
      overlay.append(dialog);
      document.body.append(overlay);
    });
  }

  function bindLogoutButton(buttonOrSelector, options) {
    let button = buttonOrSelector;
    if (typeof buttonOrSelector === "string") {
      button = document.querySelector(buttonOrSelector);
    }

    if (!button) {
      return;
    }

    const redirectTo = options?.redirectTo || LOGIN_PAGE_PATH;
    const useReplace = options?.replace !== false;
    const needsConfirm = options?.confirmBeforeLogout === true;

    const onLogout = async (event) => {
      if (event) {
        event.preventDefault();
      }

      if (needsConfirm) {
        const shouldProceed = await showConfirmationModal({
          title: options?.confirmTitle,
          message: options?.confirmMessage,
          confirmText: options?.confirmButtonText,
          cancelText: options?.cancelButtonText,
        });

        if (!shouldProceed) {
          return;
        }
      }

      clearAuthData();
      const url = new URL(redirectTo, global.location.href).toString();
      if (useReplace) {
        global.location.replace(url);
      } else {
        global.location.href = url;
      }
    };

    button.addEventListener("click", onLogout);
  }

  function logoutAndRedirect(redirectTo) {
    clearAuthData();
    const url = new URL(redirectTo || LOGIN_PAGE_PATH, global.location.href).toString();
    global.location.replace(url);
  }

  global.IBMSAuth = {
    TOKEN_KEYS,
    clearAuthData,
    getValidToken,
    getTokenPayload,
    getCurrentRole,
    isSessionValid,
    protectPage,
    showConfirmationModal,
    bindLogoutButton,
    logoutAndRedirect,
    redirectToLogin,
  };
})(window);
