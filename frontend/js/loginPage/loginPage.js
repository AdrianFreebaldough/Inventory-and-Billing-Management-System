document.addEventListener("DOMContentLoaded", () => {

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
document.querySelectorAll(".eyeToggle").forEach(btn => {
  btn.addEventListener("click", function () {
    const input = document.getElementById(this.dataset.target);
    if (!input) return;

    const eyeOpen = this.querySelector(".eyeOpen");
    const eyeClose = this.querySelector(".eyeClose");

    const isPassword = input.type === "password";

    // Toggle input visibility
    input.type = isPassword ? "text" : "password";

    // Toggle icons properly
    eyeOpen.classList.toggle("hidden", isPassword);
    eyeClose.classList.toggle("hidden", !isPassword);
  });
});

function resetPasswordToggles() {
  document.querySelectorAll(".eyeToggle").forEach(btn => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;

    const eyeOpen = btn.querySelector(".eyeOpen");
    const eyeClose = btn.querySelector(".eyeClose");

    // Reset input type
    input.type = "password";

    // Optional: clear value (if you want it cleared)
    input.value = "";

    // Reset icons
    if (eyeOpen && eyeClose) {
      eyeOpen.classList.remove("hidden");
      eyeClose.classList.add("hidden");
    }
  });
}


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

  // =========================
  // Password Validation
  // =========================
  const newPassword = $("newPassword");
  const confirmPassword = $("confirmPassword");
  const passwordMsg = $("passwordMsg");
  const confirmMsg = $("confirmMsg");
  const updateBtn = $("updatePasswordBtn");

  const getMissing = (pw) => {
    const missing = [];
    if (pw.length < 8) missing.push("length");
    if (!/[A-Z]/.test(pw)) missing.push("uppercase");
    if (!/[0-9]/.test(pw)) missing.push("number");
    if (!/[^A-Za-z0-9]/.test(pw)) missing.push("special");
    return missing;
  };

  const updatePasswordMessage = () => {
    if (!newPassword || !passwordMsg) return;

    const pw = newPassword.value;
    if (!pw) return hide(passwordMsg);

    if (pw.length < 8) {
      passwordMsg.textContent = "Password is too short";
      passwordMsg.className = "text-red-600";
      show(passwordMsg);
      return;
    }

    const missing = getMissing(pw);
    if (missing.length) {
      passwordMsg.textContent =
        "Password must contain at least one uppercase letter, number, and special character.";
      passwordMsg.className = "text-red-600";
    } else {
      passwordMsg.textContent = "Password is strong";
      passwordMsg.className = "text-green-600";
    }

    show(passwordMsg);
  };

  const updateConfirmMessage = () => {
    if (!confirmPassword || !confirmMsg) return;

    const pw = newPassword?.value || "";
    const cpw = confirmPassword.value;

    if (!cpw) return hide(confirmMsg);

    if (pw === cpw) {
      confirmMsg.textContent = "Passwords match";
      confirmMsg.className = "text-green-600";
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

    const strong = getMissing(pw).length === 0 && pw;
    const match = pw && pw === cpw;

    updateBtn.disabled = !(strong && match);
    updateBtn.classList.toggle("opacity-50", updateBtn.disabled);
    updateBtn.classList.toggle("cursor-not-allowed", updateBtn.disabled);
  };

  newPassword?.addEventListener("input", () => {
    updatePasswordMessage();
    updateConfirmMessage();
    updateButtonState();
  });

  confirmPassword?.addEventListener("input", () => {
    updateConfirmMessage();
    updateButtonState();
  });

  // =========================
  // Update Password Submit
  // =========================
  const updatePasswordForm = document.querySelector("#updatePasswordPage form");

  updatePasswordForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Password changed successfully!");

    clear(newPassword);
    clear(confirmPassword);
    hide(passwordMsg);
    hide(confirmMsg);
    updateButtonState();
    resetPasswordToggles();
    showLoginPage();
  });

});


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
    $("resetUsername").value = "";
    $("pinInput").value = "";
  }
}

function validateLogin() {
  const $ = (id) => document.getElementById(id);

  const usernameVal = $("loginUsername")?.value.trim() || "";
  const passwordVal = $("loginPassword")?.value.trim() || "";

  const userWarn = $("loginUsernameWarning");
  const passWarn = $("loginPasswordWarning");

  !usernameVal ? userWarn?.classList.remove("hidden") : userWarn?.classList.add("hidden");
  !passwordVal ? passWarn?.classList.remove("hidden") : passWarn?.classList.add("hidden");

  if (!usernameVal || !passwordVal) {
    return;
  }

  const API_BASE_URL = window.IBMS_API_BASE_URL || "http://localhost:3000";

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
      localStorage.setItem("token", payload.token);
      localStorage.setItem("role", payload?.user?.role || "");

      const role = payload?.user?.role;

      if (role === "owner") {
        window.location.href = "../admin_dashboard/admin_dashboard.html";
        return;
      }

      if (role === "staff") {
        window.location.href = "../staff_dashboard/staff_dashboard.html";
        return;
      }

      throw new Error("Invalid role");
    })
    .catch((error) => {
      const message = String(error.message || "Invalid username or password");

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
