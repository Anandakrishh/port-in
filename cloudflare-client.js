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
    const READING_SECURITY_KEY = "anand_reading_security_state";

    const authListeners = new Set();

    async function hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode("anand_reading_pin_salt_v1_" + pin);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

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
            credentials: "include",
            ...options,
            headers
        });

        if (!res.ok) {
            let errorMsg = `API Error ${res.status}`;
            try {
                const errData = await res.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (_) {}
            const err = new Error(errorMsg);
            err.status = res.status;
            throw err;
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
            const cleanEmail = (email || "").trim();
            const cleanPassword = password || "";
            if (!cleanEmail || !cleanPassword) {
                throw new Error("Email and password required");
            }

            const res = await apiRequest("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
            });

            if (res && res.success) {
                if (res.user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
                if (res.token) localStorage.setItem(AUTH_TOKEN_KEY, res.token);
                notifyAuthListeners();
                return res.user;
            }
            throw new Error((res && res.error) || "Invalid email or password");
        },

        async logout() {
            try {
                await apiRequest("/api/logout", { method: "POST" });
            } catch (_) {}
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
            notifyAuthListeners();
        },

        async verifySession() {
            const token = getToken();
            if (!token && !getUser()) {
                return null;
            }
            try {
                const res = await apiRequest("/api/auth/session", { method: "GET" });
                if (res && res.authenticated && res.user) {
                    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
                    return res.user;
                }
            } catch (err) {
                console.warn("Session verification rejected:", err);
            }
            await this.logout();
            return null;
        },

        getUser() {
            return getUser();
        },

        isLoggedIn() {
            return Boolean(getUser() && getToken());
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
        },

        /* ---------------------------------------------
           READING SESSION SECURITY (PIN Protection)
        --------------------------------------------- */
        async getReadingSecurityStatus() {
            try {
                const res = await apiRequest("/api/reading-security", { method: "GET" });
                if (res && typeof res.enabled === "boolean") {
                    let local = {};
                    try {
                        const raw = localStorage.getItem(READING_SECURITY_KEY);
                        if (raw) local = JSON.parse(raw);
                    } catch (_) {}
                    local.enabled = res.enabled;
                    localStorage.setItem(READING_SECURITY_KEY, JSON.stringify(local));
                    return { enabled: res.enabled };
                }
            } catch (err) {
                // Fallback to local cache if offline
            }

            try {
                const raw = localStorage.getItem(READING_SECURITY_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    return { enabled: Boolean(parsed.enabled) };
                }
            } catch (_) {}

            return { enabled: false };
        },

        async verifyReadingPin(pin) {
            const cleanPin = String(pin || "").trim();
            if (!/^\d{5}$/.test(cleanPin)) {
                throw new Error("PIN must contain exactly 5 numeric digits.");
            }

            try {
                const res = await apiRequest("/api/reading-security/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pin: cleanPin })
                });
                return res;
            } catch (err) {
                const msg = err.message || "";
                if (msg.includes("PIN") || msg.includes("attempt") || msg.includes("cooldown") || msg.includes("locked")) {
                    throw err;
                }
            }

            // Offline local verification fallback
            try {
                const raw = localStorage.getItem(READING_SECURITY_KEY);
                let local = { enabled: false, pin_hash: "", failed_attempts: 0, locked_until: 0 };
                if (raw) {
                    local = { ...local, ...JSON.parse(raw) };
                }

                if (!local.enabled) {
                    return { success: true, verified: true, protection: "disabled" };
                }

                const now = Date.now();
                if (local.locked_until && local.locked_until > now) {
                    const remainingSeconds = Math.ceil((local.locked_until - now) / 1000);
                    throw new Error(`Too many failed attempts. Please wait ${remainingSeconds}s before trying again.`);
                }

                const hashedAttempt = await hashPin(cleanPin);
                if (local.pin_hash && local.pin_hash === hashedAttempt) {
                    local.failed_attempts = 0;
                    local.locked_until = 0;
                    localStorage.setItem(READING_SECURITY_KEY, JSON.stringify(local));
                    return { success: true, verified: true };
                }

                const attempts = (local.failed_attempts || 0) + 1;
                local.failed_attempts = attempts;
                let errorMsg = "Incorrect PIN. Please try again.";

                if (attempts >= 5) {
                    local.locked_until = now + (60 * 1000);
                    local.failed_attempts = 0;
                    errorMsg = "Too many failed attempts. Reading tracker locked for 60 seconds.";
                } else {
                    const remaining = 5 - attempts;
                    errorMsg = `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before temporary cooldown.`;
                }
                localStorage.setItem(READING_SECURITY_KEY, JSON.stringify(local));
                throw new Error(errorMsg);
            } catch (localErr) {
                throw localErr;
            }
        },

        async setReadingSecurityConfig({ enabled, pin }) {
            const isEnabled = Boolean(enabled);
            const cleanPin = pin !== undefined && pin !== null && String(pin).trim() !== "" ? String(pin).trim() : null;

            if (cleanPin !== null && !/^\d{5}$/.test(cleanPin)) {
                throw new Error("PIN must contain exactly 5 numeric digits (0-9).");
            }

            let local = { enabled: false, pin_hash: "" };
            try {
                const raw = localStorage.getItem(READING_SECURITY_KEY);
                if (raw) local = { ...local, ...JSON.parse(raw) };
            } catch (_) {}

            let newHash = local.pin_hash;
            if (cleanPin !== null) {
                newHash = await hashPin(cleanPin);
            }

            if (isEnabled && !newHash) {
                throw new Error("A 5-digit PIN must be configured before enabling protection.");
            }

            local.enabled = isEnabled;
            local.pin_hash = newHash;
            local.failed_attempts = 0;
            local.locked_until = 0;
            local.updated_at = new Date().toISOString();

            localStorage.setItem(READING_SECURITY_KEY, JSON.stringify(local));

            try {
                const res = await apiRequest("/api/reading-security/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        enabled: isEnabled,
                        pin: cleanPin || undefined
                    })
                });
                return res;
            } catch (err) {
                console.warn("Could not sync reading security to remote worker:", err);
                return { success: true, enabled: isEnabled, offline: true };
            }
        }
    };

    window.cfClient = cfClient;
})();
