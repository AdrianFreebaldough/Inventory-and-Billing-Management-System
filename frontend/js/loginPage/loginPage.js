function resetPasswordToggles() {
  document.querySelectorAll(".eyeToggle").forEach(btn => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;

    const eyeOpen = btn.querySelector(".eyeOpen");
    const eyeClose = btn.querySelector(".eyeClose");

    input.type = "password";
    input.value = "";

    if (eyeOpen && eyeClose) {
      eyeOpen.classList.remove("hidden");
      eyeClose.classList.add("hidden");
    }
  });
}

let eyeToggleHandlerBound = false;
const FIRST_LOGIN_CHALLENGE_STORAGE_KEY = "ibmsFirstLoginChallengeToken";

function bindEyeToggleHandler() {
  if (eyeToggleHandlerBound) return;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest(".eyeToggle");
    if (!btn) return;

    const targetId = String(btn.dataset.target || "").trim();
    if (!targetId) return;

    const input = document.getElementById(targetId);
    if (!(input instanceof HTMLInputElement)) return;

    const eyeOpen = btn.querySelector(".eyeOpen");
    const eyeClose = btn.querySelector(".eyeClose");
    const isPassword = input.type === "password";

    input.type = isPassword ? "text" : "password";

    if (eyeOpen && eyeClose) {
      eyeOpen.classList.toggle("hidden", isPassword);
      eyeClose.classList.toggle("hidden", !isPassword);
    }
  });

  eyeToggleHandlerBound = true;
}

function setFirstLoginChallengeToken(value) {
  const token = String(value || "").trim();
  if (!token) return;

  try {
    sessionStorage.setItem(FIRST_LOGIN_CHALLENGE_STORAGE_KEY, token);
  } catch {
    /* noop */
  }
}

function getFirstLoginChallengeToken() {
  try {
    return String(sessionStorage.getItem(FIRST_LOGIN_CHALLENGE_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function clearFirstLoginChallengeToken() {
  try {
    sessionStorage.removeItem(FIRST_LOGIN_CHALLENGE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

function clearAuthSessionData() {
  ["token", "role", "userEmail", "userAccountId", "userName"].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function updateSessionFromAuthPayload(payload) {
  localStorage.setItem("token", payload?.token || "");
  
  // Explicitly check and store position/role
  const resolvedRole = payload?.user?.position || payload?.user?.role || "staff";
  localStorage.setItem("role", resolvedRole);
  localStorage.setItem("position", resolvedRole);
  
  localStorage.setItem("userEmail", payload?.user?.email || "");
  localStorage.setItem("userAccountId", payload?.user?.accountId || payload?.user?.email || "");
  localStorage.setItem("userName", payload?.user?.name || "");
}

function redirectToDashboardByRole(role) {
  if (role === "owner" || role === "admin") {
    window.location.href = resolveDashboardRedirect(role);
    return;
  }

  if (role === "staff") {
    window.location.href = resolveDashboardRedirect("staff");
    return;
  }

  throw new Error("Invalid role");
}

function setUpdatePasswordHeading(title) {
  const heading = document.getElementById("updatePasswordTitle");
  const subtitle = document.getElementById("updatePasswordSubtitle");
  const badge = document.getElementById("updatePasswordBadge");

  if (!heading) return;

  const normalizedTitle = String(title || "Change Password").trim() || "Change Password";
  heading.textContent = normalizedTitle;

  if (normalizedTitle === "Change Password") {
    if (subtitle) {
      subtitle.textContent = "Create a strong password to continue to your dashboard.";
    }
    if (badge) {
      badge.textContent = "First Login";
    }
    return;
  }

  if (subtitle) {
    subtitle.textContent = "Set a new password that meets all requirements.";
  }
  if (badge) {
    badge.textContent = "Account Security";
  }
}

function resetPasswordRequirementChecklist() {
  ["reqLength", "reqUppercase", "reqNumber", "reqSpecial"].forEach((id) => {
    const item = document.getElementById(id);
    if (!item) return;

    item.classList.remove("text-blue-700");
    item.classList.add("text-gray-500");

    const icon = item.querySelector(".requirementIcon");
    if (!icon) return;

    icon.innerHTML = "&#9675;";
    icon.classList.remove("bg-blue-600", "text-white", "border-blue-600");
    icon.classList.add("border-gray-300", "text-gray-500");
  });
}

function initializeLoginPage() {

  // =========================
  // Utility Shortcuts
  // =========================
  const $ = (id) => document.getElementById(id);
  const hide = (el) => el && el.classList.add("hidden");
  const show = (el) => el && el.classList.remove("hidden");
  const clear = (el) => el && (el.value = "");
  const hasValue = (el) => el && el.value.trim() !== "";

  // =========================
  // Page Buttons
  // =========================
  $("forgotPasswordBtn")?.addEventListener("click", showResetPassword);
  $("rememberPasswordBtn")?.addEventListener("click", showLoginPage);
  $("updateBackBtn")?.addEventListener("click", showLoginPage);

  // =========================
  // Eye Toggle
  // =========================
  bindEyeToggleHandler();

  // =========================
  // PIN Validation
  // =========================
  const pinInput = $("pinInput");
  const pinWarning = $("pinWarning");

  const checkPin = () => {
    if (!pinInput || !pinWarning) return;

    const v = pinInput.value;
    if (!v) return hide(pinWarning);

    if (/\D/.test(v)) {
      pinWarning.textContent = "Input should only be numbers.";
      show(pinWarning);
    } else {
      hide(pinWarning);
    }
  };

  pinInput?.addEventListener("input", checkPin);
  pinInput?.addEventListener("paste", () => setTimeout(checkPin, 0));

  // =========================
  // Real-time Warning Hiding
  // =========================
  const liveHide = (inputId, warningId) => {
    const input = $(inputId);
    const warning = $(warningId);
    input?.addEventListener("input", () => {
      if (hasValue(input)) hide(warning);
    });
  };

  liveHide("loginUsername", "loginUsernameWarning");
  liveHide("loginPassword", "loginPasswordWarning");
  liveHide("resetUsername", "resetUsernameWarning");

  const handleEnterKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      validateLogin();
    }
  };

  $("loginUsername")?.addEventListener("keydown", handleEnterKey);
  $("loginPassword")?.addEventListener("keydown", handleEnterKey);

  // =========================
  // Password Validation
  // =========================
  const newPassword = $("newPassword");
  const confirmPassword = $("confirmPassword");
  const passwordMsg = $("passwordMsg");
  const confirmMsg = $("confirmMsg");
  const updateBtn = $("updatePasswordBtn");

  const requirementRules = [
    { id: "reqLength", isMet: (pw) => pw.length >= 8 },
    { id: "reqUppercase", isMet: (pw) => /[A-Z]/.test(pw) },
    { id: "reqNumber", isMet: (pw) => /[0-9]/.test(pw) },
    { id: "reqSpecial", isMet: (pw) => /[^A-Za-z0-9]/.test(pw) },
  ];

  const setRequirementState = (requirementId, met) => {
    const requirementNode = $(requirementId);
    if (!requirementNode) return;

    requirementNode.classList.toggle("text-blue-700", met);
    requirementNode.classList.toggle("text-gray-500", !met);

    const icon = requirementNode.querySelector(".requirementIcon");
    if (!icon) return;

    icon.innerHTML = met ? "&#10003;" : "&#9675;";
    icon.classList.toggle("bg-blue-600", met);
    icon.classList.toggle("text-white", met);
    icon.classList.toggle("border-blue-600", met);
    icon.classList.toggle("border-gray-300", !met);
    icon.classList.toggle("text-gray-500", !met);
  };

  const updatePasswordRequirementChecklist = () => {
    const pw = newPassword?.value || "";
    requirementRules.forEach((rule) => {
      setRequirementState(rule.id, rule.isMet(pw));
    });

    if (passwordMsg) {
      hide(passwordMsg);
    }
  };

  const updateConfirmMessage = () => {
    if (!confirmPassword || !confirmMsg) return;

    const pw = newPassword?.value || "";
    const cpw = confirmPassword.value;

    if (!cpw) return hide(confirmMsg);

    if (pw === cpw) {
      confirmMsg.textContent = "Passwords match";
      confirmMsg.className = "text-blue-600";
    } else {
      confirmMsg.textContent = "Passwords do not match";
      confirmMsg.className = "text-red-600";
    }

    show(confirmMsg);
  };

  const updateButtonState = () => {
    if (!updateBtn) return;

    const pw = newPassword?.value || "";
    const cpw = confirmPassword?.value || "";

    const strong = pw && requirementRules.every((rule) => rule.isMet(pw));
    const match = pw && pw === cpw;

    updateBtn.disabled = !(strong && match);
    updateBtn.classList.toggle("opacity-50", updateBtn.disabled);
    updateBtn.classList.toggle("cursor-not-allowed", updateBtn.disabled);
  };

  newPassword?.addEventListener("input", () => {
    updatePasswordRequirementChecklist();
    updateConfirmMessage();
    updateButtonState();
  });

  confirmPassword?.addEventListener("input", () => {
    updateConfirmMessage();
    updateButtonState();
  });

  updatePasswordRequirementChecklist();
  updateButtonState();

  // =========================
  // Update Password Submit
  // =========================
  const updatePasswordForm = document.querySelector("#updatePasswordPage form");

  updatePasswordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const challengeToken = getFirstLoginChallengeToken();

    if (!challengeToken) {
      alert("Password changed successfully!");

      clear(newPassword);
      clear(confirmPassword);
      hide(passwordMsg);
      hide(confirmMsg);
      updateButtonState();
      resetPasswordToggles();
      showLoginPage();
      return;
    }

    const API_BASE_URL = resolveApiBaseUrl();

    if (updateBtn) {
      updateBtn.disabled = true;
      updateBtn.classList.add("opacity-50", "cursor-not-allowed");
      
      const btnText = document.getElementById("updatePasswordBtnText");
      const btnSpinner = document.getElementById("updatePasswordBtnSpinner");
      if (btnText) btnText.textContent = "Updating...";
      if (btnSpinner) btnSpinner.classList.remove("hidden");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/first-login/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          challengeToken,
          newPassword: newPassword?.value || "",
          confirmPassword: confirmPassword?.value || "",
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to update password");
      }

      if (!payload?.token || !payload?.user) {
        throw new Error("Invalid server response");
      }

      clearFirstLoginChallengeToken();
      updateSessionFromAuthPayload(payload);
      
      const position = payload?.user?.position || payload?.user?.role || "staff";
      const redirectPath = resolveDashboardRedirect(position);
      
      console.log("Authenticated Position:", position);
      console.log("Redirecting to:", redirectPath);
      
      window.location.href = redirectPath;
      return;
    } catch (error) {
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.classList.remove("opacity-50", "cursor-not-allowed");
        
        const btnText = document.getElementById("updatePasswordBtnText");
        const btnSpinner = document.getElementById("updatePasswordBtnSpinner");
        if (btnText) btnText.textContent = "Update Password";
        if (btnSpinner) btnSpinner.classList.add("hidden");
      }

      if (passwordMsg) {
        passwordMsg.textContent = String(error?.message || "Unable to update password");
        passwordMsg.className = "text-red-600";
        passwordMsg.classList.remove("hidden");
      }

      updateButtonState();
      return;
    }
  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeLoginPage, { once: true });
} else {
  initializeLoginPage();
}


// =========================
// Page Navigation Functions
// =========================
function showResetPassword() {
  const $ = (id) => document.getElementById(id);
  const hide = (el) => el && el.classList.add("hidden");
  const clear = (el) => el && (el.value = "");

  hide($("loginUsernameWarning"));
  hide($("loginPasswordWarning"));
  clear($("loginUsername"));
  clear($("loginPassword"));

  $("loginPage")?.classList.add("hidden");
  $("resetPasswordPage")?.classList.remove("hidden");
  resetPasswordToggles();
}

function showLoginPage() {
  const $ = (id) => document.getElementById(id);
  const hide = (el) => el && el.classList.add("hidden");
  const clear = (el) => el && (el.value = "");

  hide($("resetUsernameWarning"));
  hide($("pinWarning"));
  clear($("resetUsername"));
  clear($("pinInput"));

  $("resetPasswordPage")?.classList.add("hidden");
  $("updatePasswordPage")?.classList.add("hidden");
  $("loginPage")?.classList.remove("hidden");

  clear($("newPassword"));
  clear($("confirmPassword"));

  hide($("passwordMsg"));
  hide($("confirmMsg"));
  clearFirstLoginChallengeToken();
  setUpdatePasswordHeading("Reset Password");
  resetPasswordRequirementChecklist();

  const updateBtn = $("updatePasswordBtn");
  if (updateBtn) {
    updateBtn.disabled = true;
    updateBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
  resetPasswordToggles();

}

function showFirstLoginPasswordPage() {
  const $ = (id) => document.getElementById(id);
  const hide = (el) => el && el.classList.add("hidden");
  const clear = (el) => el && (el.value = "");

  hide($("loginUsernameWarning"));
  hide($("loginPasswordWarning"));
  hide($("passwordMsg"));
  hide($("confirmMsg"));

  clear($("newPassword"));
  clear($("confirmPassword"));

  $("loginPage")?.classList.add("hidden");
  $("resetPasswordPage")?.classList.add("hidden");
  $("updatePasswordPage")?.classList.remove("hidden");

  setUpdatePasswordHeading("Change Password");
  resetPasswordRequirementChecklist();

  const updateBtn = $("updatePasswordBtn");
  if (updateBtn) {
    updateBtn.disabled = true;
    updateBtn.classList.add("opacity-50", "cursor-not-allowed");
  }

  resetPasswordToggles();
}

function verifyReset() {
  const $ = (id) => document.getElementById(id);

  const usernameVal = $("resetUsername")?.value.trim() || "";
  const pinVal = $("pinInput")?.value.trim() || "";

  const usernameWarning = $("resetUsernameWarning");
  const pinWarning = $("pinWarning");

  !usernameVal ? usernameWarning?.classList.remove("hidden") : usernameWarning?.classList.add("hidden");

  if (!pinVal) {
    pinWarning.textContent = "PIN is required.";
    pinWarning?.classList.remove("hidden");
  } else if (/\D/.test(pinVal)) {
    pinWarning.textContent = "Input should only be numbers.";
    pinWarning?.classList.remove("hidden");
  } else {
    pinWarning?.classList.add("hidden");
  }

  if (usernameVal && pinVal && !/\D/.test(pinVal)) {
    $("resetPasswordPage")?.classList.add("hidden");
    $("updatePasswordPage")?.classList.remove("hidden");
    setUpdatePasswordHeading("Reset Password");
    clearFirstLoginChallengeToken();
    resetPasswordRequirementChecklist();
    $("resetUsername").value = "";
    $("pinInput").value = "";
  }
}

function resolveDashboardRedirect(role) {
  const path = window.location.pathname || "/";
  const isRootLogin = path === "/" || /\/index\.html$/i.test(path);

  if (isRootLogin) {
    return (role === "owner" || role === "admin")
      ? "/HTML/admin_dashboard/admin_dashboard.html"
      : "/HTML/staff_dashboard/staff_dashboard.html";
  }

  return (role === "owner" || role === "admin")
    ? "../admin_dashboard/admin_dashboard.html"
    : "../staff_dashboard/staff_dashboard.html";
}

function resolveApiBaseUrl() {
  const configuredBase = String(window.IBMS_API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (configuredBase) {
    return configuredBase;
  }

  const host = String(window.location.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return "";
}

let isLoginSubmitting = false;

function validateLogin() {
  if (isLoginSubmitting) return;

  const $ = (id) => document.getElementById(id);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const usernameVal = $("loginUsername")?.value.trim() || "";
  const passwordVal = $("loginPassword")?.value.trim() || "";

  const userWarn = $("loginUsernameWarning");
  const passWarn = $("loginPasswordWarning");

  !usernameVal ? userWarn?.classList.remove("hidden") : userWarn?.classList.add("hidden");
  !passwordVal ? passWarn?.classList.remove("hidden") : passWarn?.classList.add("hidden");

  if (!usernameVal || !passwordVal) {
    return;
  }

  if (!emailRegex.test(usernameVal)) {
    if (userWarn) {
      userWarn.textContent = "Please enter a valid email address.";
      userWarn.classList.remove("hidden");
    }
    return;
  }

  isLoginSubmitting = true;
  const API_BASE_URL = resolveApiBaseUrl();

  const loginBtn = $("loginBtn");
  const loginBtnText = $("loginBtnText");
  const loginBtnSpinner = $("loginBtnSpinner");

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.classList.add("opacity-50", "cursor-not-allowed");
  }
  if (loginBtnText) loginBtnText.textContent = "Logging in...";
  if (loginBtnSpinner) loginBtnSpinner.classList.remove("hidden");

  fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: usernameVal,
      password: passwordVal,
    }),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message || "Login failed");
      }

      return payload;
    })
    .then((payload) => {
      isLoginSubmitting = false;
      if (payload?.requiresPasswordChange && payload?.challengeToken) {
        clearAuthSessionData();
        setFirstLoginChallengeToken(payload.challengeToken);
        showFirstLoginPasswordPage();
        
        // Reset button state just in case
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
        if (loginBtnText) loginBtnText.textContent = "Log In";
        if (loginBtnSpinner) loginBtnSpinner.classList.add("hidden");
        return;
      }

      if (!payload?.token || !payload?.user) {
        throw new Error("Invalid server response");
      }

      clearFirstLoginChallengeToken();
      updateSessionFromAuthPayload(payload);
      
      const position = payload?.user?.position || payload?.user?.role || "staff";
      const redirectPath = resolveDashboardRedirect(position);
      
      console.log("Authenticated Position:", position);
      console.log("Redirecting to:", redirectPath);
      
      window.location.href = redirectPath;
    })
    .catch((error) => {
      isLoginSubmitting = false;
      
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
      if (loginBtnText) loginBtnText.textContent = "Log In";
      if (loginBtnSpinner) loginBtnSpinner.classList.add("hidden");

      const message = String(error.message || "Invalid email or password");

      if (userWarn) {
        userWarn.textContent = message;
        userWarn.classList.remove("hidden");
      }

      if (passWarn) {
        passWarn.textContent = " ";
        passWarn.classList.remove("hidden");
      }
    });
}
