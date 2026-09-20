/* =============================================
   CLOUDFLARE CLIENT
   Client library for Anand's portfolio website.
   Connects to Cloudflare D1 Database & Media Storage
   Base URL configured in cloudflare-config.js
============================================= */

(function () {
    const config = window.CLOUDFLARE_CONFIG || {};
    const baseUrl = (config.apiUrl || "https://anand-site-api.hello-anandha.workers.dev").replace(/\/+$/, "");

    const AUTH_USER_KEY = "anand_cf_user";
    const AUTH_TOKEN_KEY = "anand_cf_token";
    const OLD_RECORDS_KEY = "anand_old_records_state";

    const authListeners = new Set();

    function getToken() {
        try {
            return localStorage.getItem(AUTH_TOKEN_KEY) || "";
        } catch (_) {
            return "";
        }
    }

    function getUser() {
        try {
            const raw = localStorage.getItem(AUTH_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function notifyAuthListeners() {
        const user = getUser();
        authListeners.forEach(cb => {
            try { cb(user); } catch (e) { console.error("Auth listener error:", e); }
        });
    }

    async function apiRequest(path, options = {}) {
        const url = `${baseUrl}${path}`;
        const headers = {
            ...(options.headers || {})
        };

        const token = getToken();
        if (token && !headers["Authorization"]) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(url, {
            ...options,
            headers
        });

        if (!res.ok) {
            let errorMsg = `API Error ${res.status}`;
            try {
                const errData = await res.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (_) {}
            throw new Error(errorMsg);
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return await res.json();
        }
        return await res.text();
    }

    const cfClient = {
        baseUrl,

        /* ---------------------------------------------
           AUTH METHODS
        --------------------------------------------- */
        async login(email, password) {
            const res = await apiRequest("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            if (res && res.success) {
                if (res.user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
                if (res.token) localStorage.setItem(AUTH_TOKEN_KEY, res.token);
                notifyAuthListeners();
                return res.user;
            }
            throw new Error(res.error || "Login failed");
        },

        logout() {
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
            notifyAuthListeners();
        },

        getUser() {
            return getUser();
        },

        isLoggedIn() {
            return Boolean(getUser());
        },

        onAuthStateChange(cb) {
            if (typeof cb === "function") {
                authListeners.add(cb);
                // Call immediately with current state
                cb(getUser());
            }
            return () => authListeners.delete(cb);
        },

        /* ---------------------------------------------
           CRUD FOR TABLES: books, movies, songs, pinboard, hobbies
        --------------------------------------------- */
        async getRecords(table) {
            try {
                const records = await apiRequest(`/api/${table}`, { method: "GET" });
                return Array.isArray(records) ? records : [];
            } catch (err) {
                console.warn(`Could not load records for ${table}:`, err);
                return [];
            }
        },

        async getRecord(table, id) {
            return await apiRequest(`/api/${table}/${id}`, { method: "GET" });
        },

        async addRecord(table, data) {
            return await apiRequest(`/api/${table}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
        },

        async updateRecord(table, id, data) {
            return await apiRequest(`/api/${table}/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
        },

        async deleteRecord(table, id) {
            return await apiRequest(`/api/${table}/${id}`, {
                method: "DELETE"
            });
        },

        /* ---------------------------------------------
           MEDIA UPLOAD (Images & Videos up to 5 GB)
        --------------------------------------------- */
        async uploadMedia(file) {
            if (!file) throw new Error("No file provided");

            const formData = new FormData();
            formData.append("file", file);

            const res = await apiRequest("/api/upload", {
                method: "POST",
                body: formData
            });

            const publicUrl = res.publicUrl || res.url;
            return {
                id: res.id,
                publicUrl,
                url: publicUrl
            };
        },

        /* ---------------------------------------------
           SITE STATE (Static item edits & deletions)
        --------------------------------------------- */
        async getState() {
            let local = { deletedIds: [], overrides: {} };
            try {
                const raw = localStorage.getItem(OLD_RECORDS_KEY);
                if (raw) local = JSON.parse(raw);
            } catch (_) {}

            try {
                const remote = await apiRequest("/api/state", { method: "GET" });
                if (remote && typeof remote === "object") {
                    localStorage.setItem(OLD_RECORDS_KEY, JSON.stringify(remote));
                    return remote;
                }
            } catch (e) {
                // Fallback to local state if offline
            }
            return local;
        },

        async saveState(state) {
            if (!state) return;
            localStorage.setItem(OLD_RECORDS_KEY, JSON.stringify(state));
            try {
                await apiRequest("/api/state", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(state)
                });
            } catch (err) {
                console.warn("Could not sync state to Cloudflare:", err);
            }
        }
    };

    window.cfClient = cfClient;
})();
