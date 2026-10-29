/**
 * Cloudflare Worker Backend for Anand's Website
 * Provides 5 GB Free Serverless Database (D1) and Media Storage
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const origin = url.origin;

        // CORS headers
        const reqOrigin = request.headers.get("Origin") || "*";
        const corsHeaders = {
            "Access-Control-Allow-Origin": reqOrigin,
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Range",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Set-Cookie"
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const json = (data, status = 200, extraHeaders = {}) => {
            return new Response(JSON.stringify(data), {
                status,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders,
                    ...extraHeaders
                }
            });
        };

        const error = (msg, status = 400, extraHeaders = {}) => json({ error: msg }, status, extraHeaders);

        // Helper: SHA-256 hash
        async function sha256(str) {
            const buf = new TextEncoder().encode(str);
            const digest = await crypto.subtle.digest("SHA-256", buf);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        // Constant-time string comparison against timing attacks
        function timingSafeEqual(a, b) {
            if (typeof a !== "string" || typeof b !== "string") return false;
            if (a.length !== b.length) return false;
            let result = 0;
            for (let i = 0; i < a.length; i++) {
                result |= a.charCodeAt(i) ^ b.charCodeAt(i);
            }
            return result === 0;
        }

        // Salted SHA-256 for admin password
        const PASSWORD_SALT = "anand_admin_v1_salt_secure_";
        async function hashPasswordWithSalt(pwd) {
            return await sha256(PASSWORD_SALT + pwd);
        }

        // HMAC-SHA256 Token Signing
        async function signToken(dataStr, secret) {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey(
                "raw",
                enc.encode(secret),
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"]
            );
            const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dataStr));
            return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        async function verifyTokenSignature(dataStr, signature, secret) {
            const expected = await signToken(dataStr, secret);
            return timingSafeEqual(expected, signature);
        }

        function extractSessionToken(request) {
            const authHeader = request.headers.get("Authorization") || "";
            if (authHeader.startsWith("Bearer ")) {
                return authHeader.substring(7).trim();
            }
            const cookieHeader = request.headers.get("Cookie") || "";
            const cookies = cookieHeader.split(";").map(c => c.trim());
            for (const c of cookies) {
                if (c.startsWith("admin_session=")) {
                    return decodeURIComponent(c.substring("admin_session=".length));
                }
            }
            return null;
        }

        async function getActiveSessions(env) {
            const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'active_admin_sessions'").first();
            let sessions = {};
            if (row && row.value) {
                try { sessions = JSON.parse(row.value); } catch (_) {}
            }
            return sessions;
        }

        async function saveActiveSessions(sessions, env) {
            await env.DB.prepare(
                "INSERT INTO site_state (key, value, updated_at) VALUES ('active_admin_sessions', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
            ).bind(JSON.stringify(sessions)).run();
        }

        async function createSession(email, env) {
            const sessionId = crypto.randomUUID();
            const now = Date.now();
            const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days
            const secret = env.SESSION_SECRET || "anand_admin_session_secret_2026_k9x2";
            const dataStr = `${sessionId}.${expiresAt}.${email}`;
            const signature = await signToken(dataStr, secret);
            const token = `${sessionId}.${expiresAt}.${signature}`;

            const sessions = await getActiveSessions(env);
            for (const id in sessions) {
                if (sessions[id].expires_at && sessions[id].expires_at < now) {
                    delete sessions[id];
                }
            }
            sessions[sessionId] = { email, created_at: now, expires_at: expiresAt };
            await saveActiveSessions(sessions, env);

            return { token, sessionId, expiresAt };
        }

        async function verifyAdminSession(request, env) {
            const token = extractSessionToken(request);
            if (!token) return { ok: false, error: "Unauthorized: Administrator access required" };

            const parts = token.split(".");
            if (parts.length !== 3) return { ok: false, error: "Unauthorized: Invalid session token" };

            const [sessionId, expStr, sig] = parts;
            const expiresAt = Number(expStr);
            if (!expiresAt || Date.now() > expiresAt) {
                return { ok: false, error: "Unauthorized: Session expired" };
            }

            const secret = env.SESSION_SECRET || "anand_admin_session_secret_2026_k9x2";
            const authorizedEmail = (env.ADMIN_EMAIL || "hello.anandha@gmail.com").trim().toLowerCase();
            const dataStr = `${sessionId}.${expStr}.${authorizedEmail}`;

            const isValidSig = await verifyTokenSignature(dataStr, sig, secret);
            if (!isValidSig) return { ok: false, error: "Unauthorized: Invalid session signature" };

            const sessions = await getActiveSessions(env);
            if (!sessions[sessionId]) {
                return { ok: false, error: "Unauthorized: Session invalidated or logged out" };
            }

            return { ok: true, email: authorizedEmail, sessionId, token };
        }

        async function revokeSession(token, env) {
            if (!token) return;
            const parts = token.split(".");
            const sessionId = parts[0];
            const sessions = await getActiveSessions(env);
            if (sessions[sessionId]) {
                delete sessions[sessionId];
                await saveActiveSessions(sessions, env);
            }
        }

        async function checkLoginRateLimit(env, clientIp) {
            const now = Date.now();
            const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'admin_login_rate_limit'").first();
            let rateMap = {};
            if (row && row.value) {
                try { rateMap = JSON.parse(row.value); } catch (_) {}
            }
            const record = rateMap[clientIp] || { attempts: 0, locked_until: 0 };
            if (record.locked_until && record.locked_until > now) {
                const waitSeconds = Math.ceil((record.locked_until - now) / 1000);
                return { allowed: false, waitSeconds };
            }
            return { allowed: true, record, rateMap };
        }

        async function recordFailedLogin(env, clientIp) {
            const now = Date.now();
            const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'admin_login_rate_limit'").first();
            let rateMap = {};
            if (row && row.value) {
                try { rateMap = JSON.parse(row.value); } catch (_) {}
            }
            const record = rateMap[clientIp] || { attempts: 0, locked_until: 0 };
            const attempts = (record.attempts || 0) + 1;
            record.attempts = attempts;
            if (attempts >= 5) {
                record.locked_until = now + (60 * 1000); // 60s cooldown
                record.attempts = 0;
            }
            rateMap[clientIp] = record;
            await env.DB.prepare(
                "INSERT INTO site_state (key, value, updated_at) VALUES ('admin_login_rate_limit', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
            ).bind(JSON.stringify(rateMap)).run();
        }

        async function resetLoginRateLimit(env, clientIp) {
            const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'admin_login_rate_limit'").first();
            let rateMap = {};
            if (row && row.value) {
                try { rateMap = JSON.parse(row.value); } catch (_) {}
            }
            if (rateMap[clientIp]) {
                delete rateMap[clientIp];
                await env.DB.prepare(
                    "INSERT INTO site_state (key, value, updated_at) VALUES ('admin_login_rate_limit', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                ).bind(JSON.stringify(rateMap)).run();
            }
        }

        try {
            // -------------------------------------------------------------
            // 1. Health check
            // -------------------------------------------------------------
            if (path === "/api/health" || path === "/") {
                return json({ status: "ok", message: "Cloudflare D1 Backend running smoothly", timestamp: new Date().toISOString() });
            }

            // -------------------------------------------------------------
            // 2. Auth: Login, Logout, Session Check
            // -------------------------------------------------------------
            if (path === "/api/login" && request.method === "POST") {
                const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "global";

                // 1. Rate limiting
                const rateCheck = await checkLoginRateLimit(env, clientIp);
                if (!rateCheck.allowed) {
                    return error(`Too many failed login attempts. Please wait ${rateCheck.waitSeconds}s before trying again.`, 429);
                }

                const body = await request.json().catch(() => ({}));
                const email = (body.email || "").trim().toLowerCase();
                const password = body.password || "";

                if (!email || !password) {
                    return error("Email and password required", 400);
                }

                const authorizedEmail = (env.ADMIN_EMAIL || "hello.anandha@gmail.com").trim().toLowerCase();

                // 2. Strict Identity Check: ONLY hello.anandha@gmail.com is permitted
                if (email !== authorizedEmail) {
                    await recordFailedLogin(env, clientIp);
                    return error("Invalid email or password", 401);
                }

                // 3. Password Verification
                let passwordValid = false;

                if (env.ADMIN_PASSWORD) {
                    passwordValid = timingSafeEqual(password, env.ADMIN_PASSWORD);
                    if (passwordValid) {
                        const currentHash = await hashPasswordWithSalt(password);
                        await env.DB.prepare(
                            "INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash"
                        ).bind("admin_primary", authorizedEmail, currentHash).run();
                        // Purge any unauthorized accounts
                        await env.DB.prepare("DELETE FROM admin_users WHERE lower(email) != ?").bind(authorizedEmail).run();
                    }
                } else if (env.ADMIN_PASSWORD_HASH) {
                    const hashedAttempt = await hashPasswordWithSalt(password);
                    passwordValid = timingSafeEqual(hashedAttempt, env.ADMIN_PASSWORD_HASH);
                } else {
                    let user = await env.DB.prepare("SELECT * FROM admin_users WHERE lower(email) = ?").bind(authorizedEmail).first();

                    if (!user) {
                        // Initial bootstrap for authorized administrator ONLY
                        const hash = await hashPasswordWithSalt(password);
                        await env.DB.prepare("INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)")
                            .bind("admin_primary", authorizedEmail, hash).run();
                        passwordValid = true;
                        // Purge any unauthorized users that may have been created earlier
                        await env.DB.prepare("DELETE FROM admin_users WHERE lower(email) != ?").bind(authorizedEmail).run();
                    } else {
                        const saltedHash = await hashPasswordWithSalt(password);
                        const legacyHash = await sha256(password);
                        if (timingSafeEqual(user.password_hash, saltedHash)) {
                            passwordValid = true;
                        } else if (timingSafeEqual(user.password_hash, legacyHash)) {
                            passwordValid = true;
                            await env.DB.prepare("UPDATE admin_users SET password_hash = ? WHERE lower(email) = ?")
                                .bind(saltedHash, authorizedEmail).run();
                        }
                    }
                }

                if (!passwordValid) {
                    await recordFailedLogin(env, clientIp);
                    return error("Invalid email or password", 401);
                }

                // 4. Successful login: reset rate limit & issue authenticated session
                await resetLoginRateLimit(env, clientIp);
                const session = await createSession(authorizedEmail, env);

                const cookieHeader = `admin_session=${encodeURIComponent(session.token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
                return new Response(JSON.stringify({
                    success: true,
                    token: session.token,
                    user: { email: authorizedEmail }
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Set-Cookie": cookieHeader,
                        ...corsHeaders
                    }
                });
            }

            if (path === "/api/logout" && request.method === "POST") {
                const token = extractSessionToken(request);
                if (token) {
                    await revokeSession(token, env);
                }
                const clearCookie = "admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
                return new Response(JSON.stringify({ success: true, message: "Logged out" }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Set-Cookie": clearCookie,
                        ...corsHeaders
                    }
                });
            }

            if (path === "/api/auth/session" && request.method === "GET") {
                const auth = await verifyAdminSession(request, env);
                if (!auth.ok) {
                    return error(auth.error, 401);
                }
                return json({ authenticated: true, user: { email: auth.email } });
            }

            // -------------------------------------------------------------
            // 3. Media Serving: GET / HEAD /media/:id
            // -------------------------------------------------------------
            if (path.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
                const fileId = path.replace("/media/", "").split("/")[0].split("?")[0];
                const meta = await env.DB.prepare("SELECT * FROM media_files WHERE id = ?").bind(fileId).first();
                if (!meta) {
                    return new Response("Media not found", { status: 404, headers: corsHeaders });
                }

                const contentType = meta.content_type || "application/octet-stream";
                const totalBytes = meta.total_size || 0;

                if (request.method === "HEAD") {
                    return new Response(null, {
                        status: 200,
                        headers: {
                            "Content-Type": contentType,
                            "Content-Length": String(totalBytes),
                            "Accept-Ranges": "bytes",
                            "Cache-Control": "public, max-age=31536000, immutable",
                            ...corsHeaders
                        }
                    });
                }

                const chunksRes = await env.DB.prepare(
                    "SELECT chunk_data FROM media_chunks WHERE file_id = ? ORDER BY chunk_index ASC"
                ).bind(fileId).all();

                if (!chunksRes.results || chunksRes.results.length === 0) {
                    return new Response("Media data missing", { status: 404, headers: corsHeaders });
                }

                // Combine chunks into single ArrayBuffer
                let bytesCount = 0;
                const chunkArrays = chunksRes.results.map(r => {
                    const arr = new Uint8Array(r.chunk_data);
                    bytesCount += arr.length;
                    return arr;
                });

                const combined = new Uint8Array(bytesCount);
                let offset = 0;
                for (const arr of chunkArrays) {
                    combined.set(arr, offset);
                    offset += arr.length;
                }

                // Handle HTTP Range Requests for video seeking
                const range = request.headers.get("Range");
                if (range && range.startsWith("bytes=")) {
                    const parts = range.replace("bytes=", "").split("-");
                    const start = parseInt(parts[0], 10) || 0;
                    const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;
                    const chunksize = (end - start) + 1;
                    const sub = combined.subarray(start, end + 1);

                    return new Response(sub, {
                        status: 206,
                        headers: {
                            "Content-Range": `bytes ${start}-${end}/${totalBytes}`,
                            "Accept-Ranges": "bytes",
                            "Content-Length": String(chunksize),
                            "Content-Type": contentType,
                            "Cache-Control": "public, max-age=31536000, immutable",
                            ...corsHeaders
                        }
                    });
                }

                return new Response(combined, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        "Content-Length": String(totalBytes),
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=31536000, immutable",
                        ...corsHeaders
                    }
                });
            }

            // -------------------------------------------------------------
            // 4. Media Upload: POST /api/upload
            // -------------------------------------------------------------
            if (path === "/api/upload" && request.method === "POST") {
                const auth = await verifyAdminSession(request, env);
                if (!auth.ok) return error(auth.error, 401);

                const contentTypeHeader = request.headers.get("Content-Type") || "";
                let filename = "media.bin";
                let contentType = "application/octet-stream";
                let fileBuffer;

                if (contentTypeHeader.includes("multipart/form-data")) {
                    const formData = await request.formData();
                    const file = formData.get("file");
                    if (!file) return error("No file provided in form-data");
                    filename = file.name || "media.bin";
                    contentType = file.type || "application/octet-stream";
                    fileBuffer = await file.arrayBuffer();
                } else {
                    filename = request.headers.get("x-filename") || "media.bin";
                    contentType = request.headers.get("x-content-type") || contentTypeHeader || "application/octet-stream";
                    fileBuffer = await request.arrayBuffer();
                }

                const fileBytes = new Uint8Array(fileBuffer);
                const fileId = crypto.randomUUID();
                const chunkSize = 480 * 1024; // 480 KB chunk size (well within D1 limits)
                const totalChunks = Math.ceil(fileBytes.length / chunkSize);

                // Insert metadata
                await env.DB.prepare(
                    "INSERT INTO media_files (id, filename, content_type, total_size) VALUES (?, ?, ?, ?)"
                ).bind(fileId, filename, contentType, fileBytes.length).run();

                // Insert chunks
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(fileBytes.length, start + chunkSize);
                    const chunk = fileBytes.slice(start, end);
                    await env.DB.prepare(
                        "INSERT INTO media_chunks (file_id, chunk_index, chunk_data) VALUES (?, ?, ?)"
                    ).bind(fileId, i, chunk).run();
                }

                const publicUrl = `${origin}/media/${fileId}`;
                return json({ success: true, id: fileId, publicUrl, url: publicUrl });
            }

            // -------------------------------------------------------------
            // 5. Site State (Static overrides & deleted IDs): /api/state
            // -------------------------------------------------------------
            if (path === "/api/state") {
                if (request.method === "GET") {
                    const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                    let state = { deletedIds: [], overrides: {} };
                    if (row && row.value) {
                        try { state = JSON.parse(row.value); } catch (_) {}
                    }
                    // Merge persistent reading_goals if not in site_overrides
                    if (!state.reading_goals || Object.keys(state.reading_goals).length === 0) {
                        const goalRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_goals'").first();
                        if (goalRow && goalRow.value) {
                            try { state.reading_goals = JSON.parse(goalRow.value); } catch (_) {}
                        }
                    }
                    return json(state);
                }

                if (request.method === "POST" || request.method === "PUT") {
                    const auth = await verifyAdminSession(request, env);
                    if (!auth.ok) return error(auth.error, 401);

                    const body = await request.json();
                    const val = JSON.stringify(body);
                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES ('site_overrides', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(val).run();

                    // Synchronize reading_goals table row if provided in state
                    if (body && body.reading_goals && typeof body.reading_goals === "object") {
                        await env.DB.prepare(
                            "INSERT INTO site_state (key, value, updated_at) VALUES ('reading_goals', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                        ).bind(JSON.stringify(body.reading_goals)).run();
                    }

                    return json({ success: true });
                }
            }

            // -------------------------------------------------------------
            // 5c. Annual Reading Goals (Public Read, Admin Write): /api/reading-goals
            // -------------------------------------------------------------
            if (path === "/api/reading-goals") {
                if (request.method === "GET") {
                    let goals = {};
                    const goalRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_goals'").first();
                    if (goalRow && goalRow.value) {
                        try { goals = JSON.parse(goalRow.value); } catch (_) {}
                    }
                    if (!goals || Object.keys(goals).length === 0) {
                        const overrideRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                        if (overrideRow && overrideRow.value) {
                            try {
                                const parsed = JSON.parse(overrideRow.value);
                                if (parsed && parsed.reading_goals) goals = parsed.reading_goals;
                            } catch (_) {}
                        }
                    }
                    const currentYear = new Date().getFullYear();
                    if (!goals || typeof goals !== "object" || Object.keys(goals).length === 0) {
                        goals = { [currentYear]: { target: 12 } };
                    }
                    return json({ goals });
                }

                if (request.method === "POST" || request.method === "PUT") {
                    const auth = await verifyAdminSession(request, env);
                    if (!auth.ok) return error(auth.error || "Unauthorized", 401);

                    const body = await request.json().catch(() => ({}));
                    const year = parseInt(body.year, 10);
                    const target = Number(body.target);

                    if (isNaN(year) || year < 2000 || year > 2100) {
                        return error("Invalid year. Must be between 2000 and 2100.", 400);
                    }
                    if (isNaN(target) || target <= 0 || !Number.isInteger(target) || target > 1000) {
                        return error("Invalid reading goal. Must be a positive integer between 1 and 1000.", 400);
                    }

                    // 1. Fetch current goals
                    let goals = {};
                    const goalRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_goals'").first();
                    if (goalRow && goalRow.value) {
                        try { goals = JSON.parse(goalRow.value); } catch (_) {}
                    }
                    if (!goals || typeof goals !== "object") goals = {};

                    // 2. Update target for the specified year
                    goals[year] = { target };

                    // 3. Persist in site_state under 'reading_goals'
                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES ('reading_goals', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(JSON.stringify(goals)).run();

                    // 4. Also keep site_overrides in sync so existing consumers get it
                    const overrideRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                    let siteOverrides = { deletedIds: [], overrides: {}, reading_activity: [] };
                    if (overrideRow && overrideRow.value) {
                        try { siteOverrides = JSON.parse(overrideRow.value); } catch (_) {}
                    }
                    siteOverrides.reading_goals = goals;
                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES ('site_overrides', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(JSON.stringify(siteOverrides)).run();

                    return json({ success: true, goals, updated: { year, target } });
                }

                return error("Method not allowed", 405);
            }

            // -------------------------------------------------------------
            // 5b. Reading Security Settings & PIN Verification: /api/reading-security
            // -------------------------------------------------------------
            async function verifyReadingSecurityPIN(pin, env) {
                const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_security'").first();
                let secData = { enabled: false, pin_hash: "", failed_attempts: 0, locked_until: 0 };
                if (row && row.value) {
                    try {
                        secData = { ...secData, ...JSON.parse(row.value) };
                    } catch (_) {}
                }

                // If security is disabled, verification automatically passes
                if (!secData.enabled) {
                    return { ok: true, protection: "disabled" };
                }

                // Check rate limiting / lockout
                const now = Date.now();
                if (secData.locked_until && secData.locked_until > now) {
                    const remainingSeconds = Math.ceil((secData.locked_until - now) / 1000);
                    return { ok: false, status: 429, error: `Too many failed attempts. Reading tracker locked for ${remainingSeconds}s.` };
                }

                const cleanPin = String(pin || "").trim();
                if (!/^\d{5}$/.test(cleanPin)) {
                    return { ok: false, status: 400, error: "PIN must contain exactly 5 numeric digits." };
                }

                const hashedAttempt = await sha256("anand_reading_pin_salt_v1_" + cleanPin);
                if (secData.pin_hash && secData.pin_hash === hashedAttempt) {
                    // Reset failed attempts upon successful verification
                    if (secData.failed_attempts > 0 || secData.locked_until > 0) {
                        secData.failed_attempts = 0;
                        secData.locked_until = 0;
                        await env.DB.prepare(
                            "INSERT INTO site_state (key, value, updated_at) VALUES ('reading_security', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                        ).bind(JSON.stringify(secData)).run();
                    }
                    return { ok: true, protection: "enabled" };
                }

                // Failed attempt
                const attempts = (secData.failed_attempts || 0) + 1;
                secData.failed_attempts = attempts;
                let errorMsg = "Incorrect PIN. Please try again.";

                if (attempts >= 5) {
                    secData.locked_until = now + (60 * 1000); // 60s cooldown
                    secData.failed_attempts = 0; // reset for after cooldown
                    errorMsg = "Too many failed attempts. Reading tracker locked for 60 seconds.";
                } else {
                    const remaining = 5 - attempts;
                    errorMsg = `Incorrect PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before temporary cooldown.`;
                }

                await env.DB.prepare(
                    "INSERT INTO site_state (key, value, updated_at) VALUES ('reading_security', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                ).bind(JSON.stringify(secData)).run();

                return { ok: false, status: 401, error: errorMsg };
            }

            if (path === "/api/reading-security" && request.method === "GET") {
                const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_security'").first();
                let enabled = false;
                if (row && row.value) {
                    try {
                        const parsed = JSON.parse(row.value);
                        enabled = Boolean(parsed.enabled);
                    } catch (_) {}
                }
                return json({ enabled });
            }

            if (path === "/api/reading-security/verify" && request.method === "POST") {
                const body = await request.json().catch(() => ({}));
                const pin = String(body.pin || "").trim();
                const check = await verifyReadingSecurityPIN(pin, env);
                if (!check.ok) {
                    return error(check.error, check.status || 401);
                }
                return json({ success: true, verified: true, protection: check.protection });
            }

            // -------------------------------------------------------------
            // 5c. Reading Sessions & Activity Logging: /api/reading-sessions
            // -------------------------------------------------------------
            if (path === "/api/reading-sessions") {
                if (request.method === "GET") {
                    const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                    let readingActivity = [];
                    if (row && row.value) {
                        try {
                            const parsed = JSON.parse(row.value);
                            if (Array.isArray(parsed.reading_activity)) {
                                readingActivity = parsed.reading_activity;
                            }
                        } catch (_) {}
                    }
                    return json(readingActivity);
                }

                if (request.method === "POST") {
                    // Check authentication: Admin session OR Reading Security PIN
                    const auth = await verifyAdminSession(request, env);
                    let authorized = auth.ok;

                    const body = await request.json().catch(() => ({}));
                    const pin = request.headers.get("X-Reading-PIN") || body.pin || "";

                    if (!authorized) {
                        const pinCheck = await verifyReadingSecurityPIN(pin, env);
                        if (!pinCheck.ok) {
                            return error(pinCheck.error, pinCheck.status || 401);
                        }
                    }

                    // Validate session payload
                    const session = body.session || body;
                    if (!session || typeof session !== "object") {
                        return error("Invalid reading session payload.", 400);
                    }

                    const minutes = Number(session.minutes);
                    if (!Number.isFinite(minutes) || minutes <= 0) {
                        return error("Valid duration in minutes is required.", 400);
                    }

                    const newSession = {
                        id: session.id || ("act-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
                        date: session.date || new Date().toISOString().split("T")[0],
                        book_id: session.book_id || "",
                        book_title: session.book_title || "Book",
                        minutes: Math.round(minutes),
                        pages: Number(session.pages) || 0,
                        start_page: session.start_page !== undefined ? Number(session.start_page) : undefined,
                        end_page: session.end_page !== undefined ? Number(session.end_page) : undefined,
                        notes: String(session.notes || "").trim()
                    };

                    // Persist session into site_overrides in site_state
                    const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                    let siteData = { deletedIds: [], overrides: {}, reading_activity: [] };
                    if (row && row.value) {
                        try {
                            siteData = { ...siteData, ...JSON.parse(row.value) };
                        } catch (_) {}
                    }
                    if (!Array.isArray(siteData.reading_activity)) {
                        siteData.reading_activity = [];
                    }

                    // Prevent duplicate if session already exists
                    const exists = siteData.reading_activity.some(a => a.id === newSession.id);
                    if (!exists) {
                        siteData.reading_activity.push(newSession);
                    }

                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES ('site_overrides', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(JSON.stringify(siteData)).run();

                    return json({ success: true, session: newSession }, 201);
                }
            }

            if (path === "/api/reading-security/config" && (request.method === "POST" || request.method === "PUT")) {
                const auth = await verifyAdminSession(request, env);
                if (!auth.ok) {
                    return error(auth.error || "Unauthorized admin access required", 401);
                }

                const body = await request.json().catch(() => ({}));
                const enabled = Boolean(body.enabled);
                const pin = body.pin !== undefined && body.pin !== null && String(body.pin).trim() !== "" ? String(body.pin).trim() : null;

                const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'reading_security'").first();
                let current = { enabled: false, pin_hash: "" };
                if (row && row.value) {
                    try {
                        current = { ...current, ...JSON.parse(row.value) };
                    } catch (_) {}
                }

                let newHash = current.pin_hash;
                if (pin !== null) {
                    if (!/^\d{5}$/.test(pin)) {
                        return error("PIN must contain exactly 5 digits (0-9).", 400);
                    }
                    newHash = await sha256("anand_reading_pin_salt_v1_" + pin);
                }

                if (enabled && !newHash) {
                    return error("You must set a 5-digit PIN to enable security protection.", 400);
                }

                const updatedData = {
                    enabled,
                    pin_hash: newHash,
                    failed_attempts: 0,
                    locked_until: 0,
                    updated_at: new Date().toISOString()
                };

                await env.DB.prepare(
                    "INSERT INTO site_state (key, value, updated_at) VALUES ('reading_security', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                ).bind(JSON.stringify(updatedData)).run();

                return json({ success: true, enabled });
            }

            // -------------------------------------------------------------
            // 5d. Doodles & Public Drawing Gallery: /api/doodles & /api/admin/doodles
            // -------------------------------------------------------------
            async function ensureDoodlesTable() {
                try {
                    await env.DB.prepare(`
                        CREATE TABLE IF NOT EXISTS doodles (
                            id TEXT PRIMARY KEY,
                            title TEXT,
                            nickname TEXT DEFAULT 'Anonymous',
                            image_data TEXT NOT NULL,
                            status TEXT DEFAULT 'published',
                            created_at TEXT DEFAULT (datetime('now'))
                        )
                    `).run();
                } catch (_) {}
            }

            // Public Doodles
            if (path === "/api/doodles") {
                await ensureDoodlesTable();

                if (request.method === "GET") {
                    const url = new URL(request.url);
                    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 60, 1), 100);
                    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

                    const res = await env.DB.prepare(
                        "SELECT id, title, nickname, image_data, status, created_at FROM doodles WHERE status = 'published' ORDER BY created_at DESC LIMIT ? OFFSET ?"
                    ).bind(limit, offset).all();

                    return json(res.results || []);
                }

                if (request.method === "POST") {
                    // Rate limiting check
                    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "guest";
                    const rateKey = `doodle_rate_${clientIp.slice(0, 45)}`;
                    const now = Date.now();

                    const rateRow = await env.DB.prepare("SELECT value FROM site_state WHERE key = ?").bind(rateKey).first();
                    let rateData = { timestamps: [] };
                    if (rateRow && rateRow.value) {
                        try { rateData = JSON.parse(rateRow.value); } catch (_) {}
                    }
                    rateData.timestamps = (rateData.timestamps || []).filter(t => (now - t) < 10 * 60 * 1000);

                    if (rateData.timestamps.length >= 8) {
                        return error("Too many drawing submissions. Please wait a few minutes before submitting another doodle.", 429);
                    }

                    const body = await request.json().catch(() => ({}));
                    const imageData = String(body.image || body.image_data || "").trim();

                    if (!imageData || !imageData.startsWith("data:image/")) {
                        return error("A valid drawing image (data URL) is required.", 400);
                    }

                    if (imageData.length > 550000) {
                        return error("Drawing payload exceeds maximum allowed size (500KB).", 400);
                    }

                    const title = String(body.title || "").trim().slice(0, 60);
                    const nickname = String(body.nickname || "").trim().slice(0, 40) || "Anonymous";
                    const doodleId = `doodle-${now}-${crypto.randomUUID().slice(0, 8)}`;

                    await env.DB.prepare(
                        "INSERT INTO doodles (id, title, nickname, image_data, status, created_at) VALUES (?, ?, ?, ?, 'published', datetime('now'))"
                    ).bind(doodleId, title, nickname, imageData).run();

                    // Update rate limit
                    rateData.timestamps.push(now);
                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(rateKey, JSON.stringify(rateData)).run();

                    return json({
                        success: true,
                        doodle: {
                            id: doodleId,
                            title,
                            nickname,
                            image_data: imageData,
                            status: "published",
                            created_at: new Date().toISOString()
                        }
                    }, 201);
                }
            }

            // Admin Doodles Management: /api/admin/doodles
            if (path.startsWith("/api/admin/doodles")) {
                const auth = await verifyAdminSession(request, env);
                if (!auth.ok) return error(auth.error || "Unauthorized admin access required", 401);

                await ensureDoodlesTable();
                const doodleId = path.replace("/api/admin/doodles", "").replace(/^\//, "").split("/")[0].split("?")[0];

                // GET all doodles
                if (request.method === "GET") {
                    const res = await env.DB.prepare(
                        "SELECT id, title, nickname, image_data, status, created_at FROM doodles ORDER BY created_at DESC"
                    ).all();
                    return json(res.results || []);
                }

                // PUT update single doodle status / metadata
                if (request.method === "PUT" && doodleId) {
                    const body = await request.json().catch(() => ({}));
                    const newStatus = body.status === "unpublished" ? "unpublished" : (body.status === "published" ? "published" : null);
                    const newTitle = body.title !== undefined ? String(body.title).trim().slice(0, 60) : null;
                    const newNick = body.nickname !== undefined ? String(body.nickname).trim().slice(0, 40) : null;

                    await env.DB.prepare(
                        "UPDATE doodles SET status = COALESCE(?, status), title = COALESCE(?, title), nickname = COALESCE(?, nickname) WHERE id = ?"
                    ).bind(newStatus, newTitle, newNick, doodleId).run();

                    const updated = await env.DB.prepare("SELECT id, title, nickname, image_data, status, created_at FROM doodles WHERE id = ?").bind(doodleId).first();
                    if (!updated) return error("Doodle not found", 404);
                    return json({ success: true, doodle: updated });
                }

                // DELETE single doodle
                if (request.method === "DELETE" && doodleId) {
                    await env.DB.prepare("DELETE FROM doodles WHERE id = ?").bind(doodleId).run();
                    return json({ success: true, id: doodleId });
                }

                // DELETE all doodles (bulk clear gallery)
                if (request.method === "DELETE" && !doodleId) {
                    const confirmHeader = request.headers.get("X-Confirm-Clear") || "";
                    const body = await request.json().catch(() => ({}));
                    const confirmBody = body.confirm || "";

                    if (confirmHeader !== "CLEAR_ALL_DOODLES" && confirmBody !== "CLEAR_ALL_DOODLES") {
                        return error("Explicit confirmation required to clear all doodles. Send header 'X-Confirm-Clear: CLEAR_ALL_DOODLES'.", 400);
                    }

                    await env.DB.prepare("DELETE FROM doodles").run();
                    return json({ success: true, cleared: true, message: "All doodles cleared successfully." });
                }
            }

            // -------------------------------------------------------------
            // 6. Generic Table CRUD: /api/:table
            // -------------------------------------------------------------
            const allowedTables = ["books", "movies", "songs", "pinboard", "hobbies"];
            const segments = path.replace("/api/", "").split("/");
            const table = segments[0];
            const id = segments[1];

            if (allowedTables.includes(table)) {
                // Mutating operations require admin session verification
                if (["POST", "PUT", "DELETE"].includes(request.method)) {
                    const auth = await verifyAdminSession(request, env);
                    if (!auth.ok) return error(auth.error, 401);
                }

                // GET ALL
                if (request.method === "GET" && !id) {
                    const res = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
                    return json(res.results || []);
                }

                // GET SINGLE
                if (request.method === "GET" && id) {
                    const res = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
                    if (!res) return error("Not found", 404);
                    return json(res);
                }

                // INSERT
                if (request.method === "POST") {
                    const data = await request.json();
                    const recordId = data.id || crypto.randomUUID();

                    if (table === "books") {
                        await env.DB.prepare(
                            "INSERT INTO books (id, title, status, image_url) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.status || "finished", data.image_url || "").run();
                    } else if (table === "movies") {
                        await env.DB.prepare(
                            "INSERT INTO movies (id, title, year, genre, rating, review, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.year || null, data.genre || "", data.rating || 0, data.review || "", data.image_url || "").run();
                    } else if (table === "songs") {
                        await env.DB.prepare(
                            "INSERT INTO songs (id, title, link, image_url) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.link || "", data.image_url || "").run();
                    } else if (table === "pinboard") {
                        await env.DB.prepare(
                            "INSERT INTO pinboard (id, media_type, media_url, caption) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.media_type || "image", data.media_url || "", data.caption || "").run();
                    } else if (table === "hobbies") {
                        await env.DB.prepare(
                            "INSERT INTO hobbies (id, title, image_url) VALUES (?, ?, ?)"
                        ).bind(recordId, data.title, data.image_url || "").run();
                    }

                    const inserted = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(recordId).first();
                    return json(inserted, 201);
                }

                // UPDATE
                if (request.method === "PUT" && id) {
                    const data = await request.json();

                    if (table === "books") {
                        await env.DB.prepare(
                            "UPDATE books SET title = COALESCE(?, title), status = COALESCE(?, status), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.status, data.image_url, id).run();
                    } else if (table === "movies") {
                        await env.DB.prepare(
                            "UPDATE movies SET title = COALESCE(?, title), year = COALESCE(?, year), genre = COALESCE(?, genre), rating = COALESCE(?, rating), review = COALESCE(?, review), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.year, data.genre, data.rating, data.review, data.image_url, id).run();
                    } else if (table === "songs") {
                        await env.DB.prepare(
                            "UPDATE songs SET title = COALESCE(?, title), link = COALESCE(?, link), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.link, data.image_url, id).run();
                    } else if (table === "pinboard") {
                        await env.DB.prepare(
                            "UPDATE pinboard SET caption = COALESCE(?, caption), media_type = COALESCE(?, media_type), media_url = COALESCE(?, media_url) WHERE id = ?"
                        ).bind(data.caption, data.media_type, data.media_url, id).run();
                    } else if (table === "hobbies") {
                        await env.DB.prepare(
                            "UPDATE hobbies SET title = COALESCE(?, title), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.image_url, id).run();
                    }

                    const updated = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
                    return json(updated);
                }

                // DELETE
                if (request.method === "DELETE" && id) {
                    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                    return json({ success: true, id });
                }
            }

            return error("Endpoint not found", 404);
        } catch (err) {
            console.error("Worker Error:", err);
            return error(err.message || "Internal server error", 500);
        }
    }
};
