document.addEventListener("DOMContentLoaded", () => {
    const loginForm  = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const logoutBtn  = document.getElementById("logoutBtn");
    const errorAlert   = document.getElementById("errorAlert");
    const successAlert = document.getElementById("successAlert");

    // Wire mobile logout button here (after api.js is loaded and _clearTabSession exists)
    const logoutBtnMobile = document.getElementById("logoutBtnMobile");
    if (logoutBtnMobile) {
        // Remove any existing listener set by the inline script in HTML
        const freshBtn = logoutBtnMobile.cloneNode(true);
        logoutBtnMobile.parentNode.replaceChild(freshBtn, logoutBtnMobile);
        freshBtn.addEventListener("click", () => {
            _clearTabSession();
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
        // Already logged in this tab → skip login page
        if (_tabUsername() && _getToken()) {
            window.location.replace("/dashboard");
            return;
        }

        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value.trim();
            const passwordInput = document.getElementById("password").value;
            const submitBtn = loginForm.querySelector("button[type='submit']");

            if (submitBtn) submitBtn.disabled = true;
            try {
                const response = await apiFetch("/api/login", {
                    method: "POST",
                    body: JSON.stringify({ username: usernameInput, password: passwordInput })
                });
                if (response && response.access_token) {
                    _saveSession(response.access_token, response.username, response.role);
                    window.location.replace("/dashboard");
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
            _clearTabSession();
            window.location.replace("/login");
        });
    }
});
