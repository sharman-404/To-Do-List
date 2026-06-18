const API_BASE = "";

// ── One-time cleanup of legacy keys from older code versions 
localStorage.removeItem("token");
localStorage.removeItem("username");
localStorage.removeItem("role");
localStorage.removeItem("bloom_interface_lock");

// ── Storage layout 
// localStorage  → "bloom_token_<username>"   token, survives refresh
//              → "bloom_session_lock"         the ONE username that owns this browser
// sessionStorage → "tab_username"            who is logged in on THIS tab
//              → "tab_role"                  their role on THIS tab
//
// Lock semantics
// ──────────────
// • Set on successful login  → lock = response.username  (from server)
// • Cleared ONLY on explicit logout — NOT on 401, NOT by tabs with no session
// • Same user can open unlimited tabs freely
// • Different user is blocked at submit time in auth.js

function _tabUsername() { return sessionStorage.getItem("tab_username"); }
function _tabRole()     { return sessionStorage.getItem("tab_role"); }

function _getToken() {
    const user = _tabUsername();
    if (!user) return null;
    return localStorage.getItem("bloom_token_" + user) || null;
}

// ── Session lock helpers 
const LOCK_KEY = "bloom_session_lock";

function _getSessionLock()          { return localStorage.getItem(LOCK_KEY) || null; }
function _setSessionLock(username)  { localStorage.setItem(LOCK_KEY, username); }
function _clearSessionLock()        { localStorage.removeItem(LOCK_KEY); }

// True if the browser is unclaimed OR already belongs to this exact username.
function _lockAllowsUser(username) {
    const lock = _getSessionLock();
    return !lock || lock === username;
}

function _saveSession(token, username, role) {
    localStorage.setItem("bloom_token_" + username, token);
    sessionStorage.setItem("tab_username", username);
    sessionStorage.setItem("tab_role", role);
    _setSessionLock(username);
}

// ── CRITICAL: only clears the lock when this tab actually owns a session ──────
// AND only when explicitly told this is a manual logout. Token expiry, 401s,
// or any other automatic redirect must NEVER release the browser-wide lock —
// only a user-initiated Logout click may do that.
function _clearTabSession(isManualLogout = false) {
    const user = _tabUsername();
    if (user) {
        localStorage.removeItem("bloom_token_" + user);
        sessionStorage.removeItem("tab_username");
        sessionStorage.removeItem("tab_role");
        if (isManualLogout) {
            _clearSessionLock();   // only release the lock on explicit logout
        }
    } else {
        // No session on this tab — just clean up sessionStorage defensively,
        // but leave the lock alone so the active session in other tabs is safe.
        sessionStorage.removeItem("tab_username");
        sessionStorage.removeItem("tab_role");
    }
}

// ── Route guards ──────────────────────────────────────────────────────────────
function requireSession() {
    if (!_tabUsername() || !_getToken()) {
        window.location.replace("/login");
        return false;
    }
    if (!_lockAllowsUser(_tabUsername())) {
        _showSessionConflict(_getSessionLock());
        return false;
    }
    return true;
}

function requireAdminSession() {
    if (!_tabUsername() || !_getToken() || _tabRole() !== "admin") {
        window.location.replace("/dashboard");
        return false;
    }
    if (!_lockAllowsUser(_tabUsername())) {
        _showSessionConflict(_getSessionLock());
        return false;
    }
    return true;
}

// ── Conflict overlay ──────────────────────────────────────────────────────────
// Only shows "Go Back" — the blocked user cannot touch the active session.
function _showSessionConflict(lockedUsername) {
    document.documentElement.style.visibility = "hidden";

    function _render() {
        document.documentElement.style.visibility = "";
        document.body.innerHTML = `
            <div style="
                min-height:100vh;display:flex;align-items:center;
                justify-content:center;background:#0f0e09;
                font-family:'Inter',sans-serif;padding:24px;
            ">
                <div style="
                    max-width:440px;width:100%;
                    background:rgba(30,27,18,0.90);
                    border:1px solid rgba(154,173,61,0.18);
                    border-radius:20px;padding:40px 36px;text-align:center;
                ">
                    <div style="
                        width:52px;height:52px;border-radius:14px;
                        background:linear-gradient(135deg,#9aad3d,#8f6530);
                        display:flex;align-items:center;justify-content:center;
                        margin:0 auto 20px;font-size:22px;
                    ">🔒</div>

                    <h2 style="
                        color:#ede8d8;font-size:18px;font-weight:700;
                        margin:0 0 10px;letter-spacing:-0.3px;
                    ">Access Restricted</h2>

                    <p style="color:#a09880;font-size:13px;line-height:1.65;margin:0 0 24px;">
                        This browser is currently in use by the account
                        <strong style="color:#9aad3d;">${lockedUsername || "another user"}</strong>.
                        A different account cannot be opened in the same browser simultaneously.
                    </p>

                    <p style="color:#6b6350;font-size:12px;margin:0 0 28px;line-height:1.6;">
                        To use a different account, open a
                        <strong style="color:#a09880;">private / incognito window</strong>
                        or a different browser entirely.
                    </p>

                    <button onclick="history.back()" style="
                        width:100%;padding:13px;
                        background:rgba(58,50,34,0.60);
                        color:#ede8d8;font-size:13px;font-weight:500;
                        border:1px solid rgba(154,173,61,0.20);
                        border-radius:12px;cursor:pointer;
                    " onmouseover="this.style.background='rgba(58,50,34,0.90)'"
                       onmouseout="this.style.background='rgba(58,50,34,0.60)'">
                        ← Go Back
                    </button>
                </div>
            </div>
        `;
    }

    if (document.body) { _render(); }
    else { document.addEventListener("DOMContentLoaded", _render); }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = _getToken();
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

        if (response.status === 401 &&
            !endpoint.includes("/api/login") &&
            !endpoint.includes("/api/signup")) {
            console.warn("Session expired. Redirecting to login...");
            _clearTabSession();   // automatic — does NOT release the browser lock
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
    try { return await apiFetch("/api/me"); }
    catch (e) { _clearTabSession(); return null; }
}

// ── Session guard (pageshow + visibilitychange) ───────────────────────────────
function _enforceSessionGuard() {
    const path        = window.location.pathname;
    const currentUser = _tabUsername();
    const lockedUser  = _getSessionLock();

    // Lock conflict — only when this tab has an identity that mismatches lock.
    // Fresh tabs (/login with no sessionStorage) are NOT blocked here;
    // they are blocked at form-submit time in auth.js once we know who is typing.
    if (lockedUser && currentUser && currentUser !== lockedUser) {
        _showSessionConflict(lockedUser);
        return;
    }

    // Auth-required pages
    if (["/dashboard", "/tasks", "/admin", "/admin/"].includes(path)) {
        if (!currentUser || !_getToken()) {
            window.location.replace("/login");
            return;
        }
    }

    // Already authenticated → skip login/signup
    if (path === "/login" || path === "/signup") {
        if (currentUser && _getToken()) {
            window.location.replace(_tabRole() === "admin" ? "/admin" : "/dashboard");
        }
    }
}

window.addEventListener("pageshow", _enforceSessionGuard);
window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") _enforceSessionGuard();
});
