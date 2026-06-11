document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const logoutBtn = document.getElementById("logoutBtn");
    const errorAlert = document.getElementById("errorAlert");
    const successAlert = document.getElementById("successAlert");

    function showAlert(element, message, duration = 6000) {
        if (!element) return;
        element.textContent = message;
        element.classList.remove("hidden");
        setTimeout(() => {
            element.classList.add("hidden");
        }, duration);
    }

    // Login logic
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value;
            const passwordInput = document.getElementById("password").value;
            const submitBtn = loginForm.querySelector("button[type='submit']");

            if (submitBtn) submitBtn.disabled = true;
            try {
                const response = await apiFetch("/api/login", {
                    method: "POST",
                    body: JSON.stringify({
                        username: usernameInput,
                        password: passwordInput
                    })
                });
                if (response && response.access_token) {
                    localStorage.setItem("token", response.access_token);
                    localStorage.setItem("username", response.username);
                    localStorage.setItem("role", response.role);   
                    window.location.href = "/dashboard";// Route user
                }
            } catch (err) {
                showAlert(errorAlert, err.message || "Login authentication failed.");
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Signup logic
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById("username").value;
            const emailInput = document.getElementById("email").value;
            const passwordInput = document.getElementById("password").value;
            const confirmInput = document.getElementById("confirm_password").value;
            const submitBtn = signupForm.querySelector("button[type='submit']");

            if (passwordInput !== confirmInput) {
                showAlert(errorAlert, "Passwords do not match.");
                return;
            }
            if (submitBtn) submitBtn.disabled = true;
            try {
                const response = await apiFetch("/api/signup", {
                    method: "POST",
                    body: JSON.stringify({
                        username: usernameInput,
                        email: emailInput,
                        password: passwordInput
                    })
                });
                if (response) {
                    showAlert(successAlert, "Account registered successfully! Please wait for administrative approval to unlock login access.", 10000);
                    signupForm.reset();
                }
            } catch (err) {
                showAlert(errorAlert, err.message || "Registration failed.");
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Logout trigger
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = "/";
        });
    }
});

// Guard route checks
function requireSession() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "/login";
    }
}

function requireAdminSession() {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token || role !== "admin") {
        window.location.href = "/dashboard";
    }
}
