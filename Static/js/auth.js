const API_BASE = "";

// ── One-time cleanup of legacy flat keys from older code versions ─────────────
// Wipe token/username/role if they were saved as plain keys (old format).
// This ensures stale sessions from previous code versions never auto-restore.
localStorage.removeItem("token");
localStorage.removeItem("username");
localStorage.removeItem("role");

// ── Session helpers ───────────────────────────────────────────────────────────
// localStorage  → "bloom_token_<username>"  persists across refreshes
// sessionStorage → "tab_username" + "tab_role"  scoped to this tab only
//
// New tab = empty sessionStorage = login page shown once.
// Refresh = sessionStorage intact = no re-login needed.
// Two tabs = separate sessionStorage = no cross-tab interference.

function _tabUsername() { return sessionStorage.getItem("tab_username"); }
function _tabRole()     { return sessionStorage.getItem("tab_role"); }

function _getToken() {
    const user = _tabUsername();
    if (!user) return null;
    return localStorage.getItem("bloom_token_" + user) || null;
}

function _saveSession(token, username, role) {
    localStorage.setItem("bloom_token_" + username, token);
    sessionStorage.setItem("tab_username", username);
    sessionStorage.setItem("tab_role", role);
}

function _clearTabSession() {
    const user = _tabUsername();
    if (user) localStorage.removeItem("bloom_token_" + user);
    sessionStorage.removeItem("tab_username");
    sessionStorage.removeItem("tab_role");
}

// ── Route guards ──────────────────────────────────────────────────────────────
// Return false (and redirect) when session is missing.
// CALLERS MUST CHECK: if (!requireSession()) return;

function requireSession() {
    if (!_tabUsername() || !_getToken()) {
        window.location.replace("/login");
        return false;
    }
    return true;
}

function requireAdminSession() {
    if (!_tabUsername() || !_getToken() || _tabRole() !== "admin") {
        window.location.replace("/dashboard");
        return false;
    }
    return true;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = _getToken();
    const headers = { ...options.headers };

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

        if (response.status === 401 &&
            !endpoint.includes("/api/login") &&
            !endpoint.includes("/api/signup")) {
            console.warn("Session expired. Redirecting to login...");
            _clearTabSession();
            window.location.replace("/login");
            return;
        }

        if (!response.ok) {
            let detail = "System communication anomaly occurred.";
            try {
                const errJson = await response.json();
                detail = errJson.detail || errJson.error || detail;
            } catch (_) {}
            throw new Error(detail);
        }

        return await response.json();
    } catch (e) {
        console.error(`API Fetch Failure on ${endpoint}:`, e);
        throw e;
    }
}

async function checkAuthSession() {
    if (!_getToken()) return null;
    try {
        return await apiFetch("/api/me");
    } catch (e) {
        _clearTabSession();
        return null;
    }
}

// ── Guard against stale Back/Forward cache pages ─────────────────────────────
// After Sign Out, the browser may hold a bfcache snapshot of protected pages.
// Pressing Back can restore that snapshot WITHOUT re-running DOMContentLoaded,
// so the old page would show even though the session has been cleared.
//
// Two complementary guards:
//   1. "pageshow" — fires on every page display, including bfcache restores.
//      We no longer gate on event.persisted so it runs on normal loads too,
//      which catches browsers that don't reliably set persisted = true.
//   2. "visibilitychange" — catches tab-switch-back scenarios where the page
//      was already in the bfcache before pageshow fires.

function _enforceSessionGuard() {
    const protectedPaths = ["/dashboard", "/tasks", "/admin", "/admin/"];
    const path = window.location.pathname;

    if (protectedPaths.includes(path)) {
        if (!_tabUsername() || !_getToken()) {
            window.location.replace("/login");
        }
    } else if (path === "/login" || path === "/signup") {
        // If a session now exists (e.g. user logged in, then hit Back),
        // don't show the stale auth form — send them to the dashboard.
        if (_tabUsername() && _getToken()) {
            window.location.replace("/dashboard");
        }
    }
}

window.addEventListener("pageshow", _enforceSessionGuard);

window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        _enforceSessionGuard();
    }
});
