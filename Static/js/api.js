const API_BASE = "";

async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem("token");

    // Setup headers
    const headers = {
        ...options.headers
    };

    // Auto-detect if we are uploading parameters or sending standard JSON
    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    // Inject user bearer session if stored
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        // Handle token expiration or forbidden access
        if (response.status === 401 && !endpoint.includes("/api/login") && !endpoint.includes("/api/signup")) {
            console.warn("Session expired or invalid token. Redirecting to auth portal...");
            localStorage.clear();
            window.location.href = "/login";
            return;
        }

        if (!response.ok) {
            let detail = "System communication anomaly occurred.";
            try {
                const errJson = await response.json();
                detail = errJson.detail || errJson.error || detail;
            } catch (errJsonFail) {}
            throw new Error(detail);
        }
        return await response.json();
    } catch (e) {
        console.error(`API Fetch Failure on endpoint ${endpoint}:`, e);
        throw e;
    }
}

// Global user profile state checking
async function checkAuthSession() {
    const token = localStorage.getItem("token");
    if (!token) {
        return null;
    }
    try {
        const user = await apiFetch("/api/me");
        return user;
    } catch (e) {
        localStorage.clear();
        return null;
    }
}
