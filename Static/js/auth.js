document.addEventListener("DOMContentLoaded", () => {
    const loginForm  = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const logoutBtn  = document.getElementById("logoutBtn");
    const errorAlert   = document.getElementById("errorAlert");
    const successAlert = document.getElementById("successAlert");

    // Wire mobile logout button (after api.js loads _clearTabSession)
    const logoutBtnMobile = document.getElementById("logoutBtnMobile");
    if (logoutBtnMobile) {
        const freshBtn = logoutBtnMobile.cloneNode(true);
        logoutBtnMobile.parentNode.replaceChild(freshBtn, logoutBtnMobile);
        freshBtn.addEventListener("click", () => {
            _clearTabSession(true);
            window.location.replace("/login");
        });
    }

    function showAlert(element, message, duration = 6000) {
        if (!element) return;
        element.textContent = message;
        element.classList.remove("hidden");
        setTimeout(() => element.classList.add("hidden"), duration);
    }

    // ── Login page ───────────────────────────────────────────────────────────
    if (loginForm) {
        // Already logged in on this tab → skip login page
        if (_tabUsername() && _getToken()) {
            window.location.replace(_tabRole() === "admin" ? "/admin" : "/dashboard");
            return;
        }

        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value.trim();
            const passwordInput = document.getElementById("password").value;
            const submitBtn = loginForm.querySelector("button[type='submit']");

            if (submitBtn) submitBtn.disabled = true;

            // ── Lock check ───────────────────────────────────────────────────
            // If the browser is already locked to a different username, block
            // the login attempt before even hitting the API.
            // Same username as the lock = allowed (multi-tab same user).
            const existingLock = _getSessionLock();
            if (existingLock && existingLock !== usernameInput) {
                showAlert(errorAlert, "An account is already logged in in this browser. Please logout first before logging in with another account.");
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            try {
                const response = await apiFetch("/api/login", {
                    method: "POST",
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });
                if (response && response.access_token) {
                    _saveSession(response.access_token, response.username, response.role);
                    window.location.replace(response.role === "admin" ? "/admin" : "/dashboard");
                }
            } catch (err) {
                showAlert(errorAlert, err.message || "Login authentication failed.");
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // ── Signup page ──────────────────────────────────────────────────────────
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value.trim();
            const emailInput    = document.getElementById("email").value.trim();
            const passwordInput = document.getElementById("password").value;
            const confirmInput  = document.getElementById("confirm_password").value;
            const submitBtn = signupForm.querySelector("button[type='submit']");

            if (passwordInput !== confirmInput) {
                showAlert(errorAlert, "Passwords do not match.");
                return;
            }
            if (submitBtn) submitBtn.disabled = true;
            try {
                const response = await apiFetch("/api/signup", {
                    method: "POST",
                    body: JSON.stringify({ username: usernameInput, email: emailInput, password: passwordInput })
                });
                if (response) {
                    showAlert(successAlert,
                        "Account registered successfully! Please wait for administrative approval to unlock login access.",
                        10000);
                    signupForm.reset();
                }
            } catch (err) {
                showAlert(errorAlert, err.message || "Registration failed.");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // ── Logout (sidebar button) ──────────────────────────────────────────────
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            _clearTabSession(true);
            window.location.replace("/login");
        });
    }
});
