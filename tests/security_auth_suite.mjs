import { DatabaseSync } from "node:sqlite";
import worker from "../cloudflare-backend/src/index.js";

function setupTestEnvironment(customEnv = {}) {
    const db = new DatabaseSync(":memory:");

    // Initialize Schema
    db.exec(`
        CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT DEFAULT 'finished',
            image_url TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS movies (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            year INTEGER,
            genre TEXT,
            rating REAL DEFAULT 0,
            review TEXT,
            image_url TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS songs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            link TEXT,
            image_url TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pinboard (
            id TEXT PRIMARY KEY,
            media_type TEXT DEFAULT 'image',
            media_url TEXT NOT NULL,
            caption TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS hobbies (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            image_url TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS site_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS admin_users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS media_files (
            id TEXT PRIMARY KEY,
            filename TEXT,
            content_type TEXT,
            total_size INTEGER,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS media_chunks (
            file_id TEXT,
            chunk_index INTEGER,
            chunk_data BLOB,
            PRIMARY KEY (file_id, chunk_index)
        );
    `);

    const D1Mock = {
        prepare(sql) {
            return {
                bind(...params) {
                    return {
                        async first() {
                            const stmt = db.prepare(sql);
                            return stmt.get(...params) || null;
                        },
                        async all() {
                            const stmt = db.prepare(sql);
                            const results = stmt.all(...params);
                            return { results };
                        },
                        async run() {
                            const stmt = db.prepare(sql);
                            stmt.run(...params);
                            return { success: true };
                        }
                    };
                },
                async first() {
                    const stmt = db.prepare(sql);
                    return stmt.get() || null;
                },
                async all() {
                    const stmt = db.prepare(sql);
                    return { results: stmt.all() };
                },
                async run() {
                    const stmt = db.prepare(sql);
                    stmt.run();
                    return { success: true };
                }
            };
        }
    };

    const env = {
        DB: D1Mock,
        ADMIN_EMAIL: "hello.anandha@gmail.com",
        ADMIN_PASSWORD: "SuperSecureAdminPassword2026!",
        SESSION_SECRET: "test_secret_hmac_key_2026",
        ...customEnv
    };

    return { db, env };
}

let passed = 0;
let failed = 0;

function assert(cond, name) {
    if (cond) {
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${name}`);
        failed++;
    }
}

async function runTestSuite() {
    console.log("=================================================");
    console.log("  RUNNING ADMIN AUTHENTICATION SECURITY TEST SUITE");
    console.log("=================================================\n");

    const { env } = setupTestEnvironment();
    const AUTHORIZED_EMAIL = "hello.anandha@gmail.com";
    const AUTHORIZED_PASSWORD = "SuperSecureAdminPassword2026!";
    const WRONG_PASSWORD = "WrongPassword123!";
    const WRONG_EMAIL = "attacker@evil.com";

    // -------------------------------------------------------------
    // Criterion 1: Correct email + correct password -> login succeeds
    // -------------------------------------------------------------
    console.log("[Test 1] Correct email + correct password");
    let req1 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.1" },
        body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: AUTHORIZED_PASSWORD })
    });
    let res1 = await worker.fetch(req1, env);
    let data1 = await res1.json();
    assert(res1.status === 200, "HTTP 200 OK status");
    assert(data1.success === true, "Response has success: true");
    assert(typeof data1.token === "string" && data1.token.length > 20, "Returned valid signed session token");
    assert(data1.user.email === AUTHORIZED_EMAIL, "User object contains authorized email");
    const setCookie = res1.headers.get("Set-Cookie") || "";
    assert(setCookie.includes("admin_session=") && setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Lax"), "Sets secure HttpOnly session cookie");

    const validToken = data1.token;

    // -------------------------------------------------------------
    // Criterion 2: Correct email + incorrect password -> login fails (401)
    // -------------------------------------------------------------
    console.log("\n[Test 2] Correct email + incorrect password");
    let req2 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.2" },
        body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: WRONG_PASSWORD })
    });
    let res2 = await worker.fetch(req2, env);
    let data2 = await res2.json();
    assert(res2.status === 401, "HTTP 401 Unauthorized status");
    assert(data2.error === "Invalid email or password", "Generic error message returned");

    // -------------------------------------------------------------
    // Criterion 3: Incorrect email + correct password -> login fails (401)
    // -------------------------------------------------------------
    console.log("\n[Test 3] Incorrect email + correct password");
    let req3 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.3" },
        body: JSON.stringify({ email: WRONG_EMAIL, password: AUTHORIZED_PASSWORD })
    });
    let res3 = await worker.fetch(req3, env);
    let data3 = await res3.json();
    assert(res3.status === 401, "HTTP 401 Unauthorized status");
    assert(data3.error === "Invalid email or password", "Generic error message returned");

    // -------------------------------------------------------------
    // Criterion 4: Both incorrect -> login fails (401)
    // -------------------------------------------------------------
    console.log("\n[Test 4] Both email and password incorrect");
    let req4 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.4" },
        body: JSON.stringify({ email: WRONG_EMAIL, password: WRONG_PASSWORD })
    });
    let res4 = await worker.fetch(req4, env);
    let data4 = await res4.json();
    assert(res4.status === 401, "HTTP 401 Unauthorized status");
    assert(data4.error === "Invalid email or password", "Generic error message returned");

    // -------------------------------------------------------------
    // Criterion 5: Empty fields -> login rejected (400)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Empty fields validation");
    let req5a = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.5" },
        body: JSON.stringify({ email: "", password: "" })
    });
    let res5a = await worker.fetch(req5a, env);
    let data5a = await res5a.json();
    assert(res5a.status === 400, "HTTP 400 Bad Request on empty email & password");
    assert(data5a.error === "Email and password required", "Clear validation message");

    let req5b = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.1.1.5" },
        body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: "" })
    });
    let res5b = await worker.fetch(req5b, env);
    assert(res5b.status === 400, "HTTP 400 Bad Request on missing password");

    // -------------------------------------------------------------
    // Criterion 6: Direct access to admin session check without auth -> denied (401)
    // -------------------------------------------------------------
    console.log("\n[Test 6] Direct session verification without credentials");
    let req6 = new Request("https://site.local/api/auth/session", {
        method: "GET"
    });
    let res6 = await worker.fetch(req6, env);
    let data6 = await res6.json();
    assert(res6.status === 401, "HTTP 401 Unauthorized status");
    assert(data6.error.includes("Administrator access required"), "Proper unauthorized explanation");

    // -------------------------------------------------------------
    // Criterion 7: Direct calls to privileged Admin APIs without auth -> denied (401)
    // -------------------------------------------------------------
    console.log("\n[Test 7] Direct calls to privileged Admin APIs without auth");
    // 7a: POST /api/upload
    let res7a = await worker.fetch(new Request("https://site.local/api/upload", {
        method: "POST",
        body: "fake binary data"
    }), env);
    assert(res7a.status === 401, "POST /api/upload rejected without auth (401)");

    // 7b: POST /api/state
    let res7b = await worker.fetch(new Request("https://site.local/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: { hacked: true } })
    }), env);
    assert(res7b.status === 401, "POST /api/state rejected without auth (401)");

    // 7c: POST /api/reading-security/config
    let res7c = await worker.fetch(new Request("https://site.local/api/reading-security/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
    }), env);
    assert(res7c.status === 401, "POST /api/reading-security/config rejected without auth (401)");

    // 7d: POST /api/books
    let res7d = await worker.fetch(new Request("https://site.local/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Hacked Book" })
    }), env);
    assert(res7d.status === 401, "POST /api/books rejected without auth (401)");

    // 7e: PUT /api/books/123
    let res7e = await worker.fetch(new Request("https://site.local/api/books/123", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Modified Title" })
    }), env);
    assert(res7e.status === 401, "PUT /api/books/:id rejected without auth (401)");

    // 7f: DELETE /api/books/123
    let res7f = await worker.fetch(new Request("https://site.local/api/books/123", {
        method: "DELETE"
    }), env);
    assert(res7f.status === 401, "DELETE /api/books/:id rejected without auth (401)");

    // -------------------------------------------------------------
    // Criterion 8: Authenticated session persists & can access privileged APIs
    // -------------------------------------------------------------
    console.log("\n[Test 8] Refreshing / reusing authenticated session token & cookie");
    // With Authorization: Bearer <token>
    let req8a = new Request("https://site.local/api/auth/session", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
    });
    let res8a = await worker.fetch(req8a, env);
    let data8a = await res8a.json();
    assert(res8a.status === 200, "HTTP 200 OK with Bearer token");
    assert(data8a.authenticated === true && data8a.user.email === AUTHORIZED_EMAIL, "Session authenticated for authorized email");

    // With Cookie: admin_session=<token>
    let req8b = new Request("https://site.local/api/auth/session", {
        method: "GET",
        headers: { "Cookie": `admin_session=${validToken}` }
    });
    let res8b = await worker.fetch(req8b, env);
    let data8b = await res8b.json();
    assert(res8b.status === 200, "HTTP 200 OK with HttpOnly cookie");
    assert(data8b.authenticated === true, "Session authenticated via cookie");

    // Authenticated POST /api/books succeeds
    let req8c = new Request("https://site.local/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${validToken}` },
        body: JSON.stringify({ title: "Authorized Book", status: "finished" })
    });
    let res8c = await worker.fetch(req8c, env);
    assert(res8c.status === 201, "Privileged POST /api/books succeeds with valid session (201)");

    // -------------------------------------------------------------
    // Criterion 9: Logging out -> session is invalidated on server
    // -------------------------------------------------------------
    console.log("\n[Test 9] Logging out invalidates session token on server");
    let req9 = new Request("https://site.local/api/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${validToken}` }
    });
    let res9 = await worker.fetch(req9, env);
    let data9 = await res9.json();
    assert(res9.status === 200, "Logout request returned 200 OK");
    assert(data9.success === true, "Logout returned success: true");
    const clearCookieHeader = res9.headers.get("Set-Cookie") || "";
    assert(clearCookieHeader.includes("admin_session=") && clearCookieHeader.includes("Max-Age=0"), "Cleared session cookie with Max-Age=0");

    // Reusing the revoked token MUST fail with 401
    let req9Reuse = new Request("https://site.local/api/auth/session", {
        method: "GET",
        headers: { "Authorization": `Bearer ${validToken}` }
    });
    let res9Reuse = await worker.fetch(req9Reuse, env);
    assert(res9Reuse.status === 401, "Revoked token rejected with 401 Unauthorized");

    // -------------------------------------------------------------
    // Criterion 10: Repeated failed attempts -> rate limited (429)
    // -------------------------------------------------------------
    console.log("\n[Test 10] Repeated failed login attempts trigger 429 rate limit");
    const rateLimitIp = "9.9.9.9";
    for (let i = 1; i <= 4; i++) {
        let reqFail = new Request("https://site.local/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", "cf-connecting-ip": rateLimitIp },
            body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: "badpassword" })
        });
        let resFail = await worker.fetch(reqFail, env);
        assert(resFail.status === 401, `Attempt ${i}: Rejected with 401`);
    }

    // 5th failed attempt triggers the lockout
    let reqFail5 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": rateLimitIp },
        body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: "badpassword" })
    });
    let resFail5 = await worker.fetch(reqFail5, env);
    assert(resFail5.status === 401, "Attempt 5: Rejected and triggers cooldown");

    // Subsequent 6th attempt within cooldown window must return HTTP 429
    let reqFail6 = new Request("https://site.local/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "cf-connecting-ip": rateLimitIp },
        body: JSON.stringify({ email: AUTHORIZED_EMAIL, password: AUTHORIZED_PASSWORD })
    });
    let resFail6 = await worker.fetch(reqFail6, env);
    let dataFail6 = await resFail6.json();
    assert(resFail6.status === 429, "Attempt 6: HTTP 429 Too Many Requests");
    assert(dataFail6.error.includes("Too many failed login attempts"), "Rate limit message includes cooldown warning");

    console.log("\n=================================================");
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error("Test Suite Unhandled Exception:", err);
    process.exit(1);
});
