import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import worker from "../cloudflare-backend/src/index.js";

console.log("=================================================");
console.log("  READING PIN & OFFLINE SESSION SECURITY TEST SUITE");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ PASS: ${message}`);
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function setupTestEnvironment() {
    const db = new DatabaseSync(":memory:");

    db.exec(`
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
        SESSION_SECRET: "test_secret_key_12345"
    };

    return { db, env };
}

async function runTests() {
    const { env, db } = setupTestEnvironment();

    const TEST_PIN = "54321";
    const hashedPin = await sha256("anand_reading_pin_salt_v1_" + TEST_PIN);

    // Seed reading security with PIN enabled
    db.prepare(`
        INSERT INTO site_state (key, value) VALUES ('reading_security', ?)
    `).run(JSON.stringify({
        enabled: true,
        pin_hash: hashedPin,
        failed_attempts: 0,
        locked_until: 0
    }));

    // Seed empty site_overrides
    db.prepare(`
        INSERT INTO site_state (key, value) VALUES ('site_overrides', ?)
    `).run(JSON.stringify({
        deletedIds: [],
        overrides: {},
        reading_activity: []
    }));

    // -------------------------------------------------------------
    // Test 1: Direct API Request to /api/reading-sessions without PIN
    // -------------------------------------------------------------
    console.log("[Test 1] Direct API Request to /api/reading-sessions without Authorization");
    {
        const req = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session: {
                    book_id: "book-1",
                    book_title: "Clean Architecture",
                    minutes: 45,
                    pages: 20
                }
            })
        });
        const res = await worker.fetch(req, env);
        assert(res.status === 400 || res.status === 401, `Rejected with status ${res.status}`);
        const data = await res.json();
        assert(data.error !== undefined, "Response contains error explanation");
    }

    // -------------------------------------------------------------
    // Test 2: Direct API Request with Incorrect PIN
    // -------------------------------------------------------------
    console.log("\n[Test 2] Direct API Request with Incorrect PIN");
    {
        const req = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Reading-PIN": "99999"
            },
            body: JSON.stringify({
                session: {
                    book_id: "book-1",
                    book_title: "Clean Architecture",
                    minutes: 30
                }
            })
        });
        const res = await worker.fetch(req, env);
        assert(res.status === 401, "Rejected with HTTP 401 Unauthorized");
        const data = await res.json();
        assert(data.error.includes("Incorrect PIN"), "Error mentions incorrect PIN");
        assert(data.error.includes("attempt"), "Error shows remaining attempt count");
    }

    // -------------------------------------------------------------
    // Test 3: Repeated Invalid Attempts Trigger 429 Cooldown
    // -------------------------------------------------------------
    console.log("\n[Test 3] Rate-Limiting & Cooldown Protection (5 Failed Attempts)");
    {
        // Already did 1 failed attempt in Test 2, do 4 more
        for (let i = 2; i <= 5; i++) {
            const req = new Request("https://test.com/api/reading-security/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: "00000" })
            });
            const res = await worker.fetch(req, env);
            if (i < 5) {
                assert(res.status === 401, `Attempt ${i}: Rejected with 401`);
            } else {
                assert(res.status === 401, `Attempt 5: Triggered lockout threshold`);
            }
        }

        // 6th attempt should return 429 Too Many Requests
        const reqLocked = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: TEST_PIN, session: { minutes: 15 } })
        });
        const resLocked = await worker.fetch(reqLocked, env);
        assert(resLocked.status === 429, "Locked out: HTTP 429 Too Many Requests");
        const lockedData = await resLocked.json();
        assert(lockedData.error.includes("locked") || lockedData.error.includes("wait"), "Error includes cooldown warning");
    }

    // -------------------------------------------------------------
    // Test 4: Reset Lockout and Test Valid PIN Verification
    // -------------------------------------------------------------
    console.log("\n[Test 4] PIN Verification Flow with Correct PIN");
    {
        // Reset lockout for test progression
        db.prepare(`
            UPDATE site_state SET value = ? WHERE key = 'reading_security'
        `).run(JSON.stringify({
            enabled: true,
            pin_hash: hashedPin,
            failed_attempts: 0,
            locked_until: 0
        }));

        // Verify endpoint
        const verifyReq = new Request("https://test.com/api/reading-security/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: TEST_PIN })
        });
        const verifyRes = await worker.fetch(verifyReq, env);
        assert(verifyRes.status === 200, "Verification returns HTTP 200 OK");
        const verifyData = await verifyRes.json();
        assert(verifyData.verified === true, "Response confirms verified: true");
    }

    // -------------------------------------------------------------
    // Test 5: Log Offline Session with Valid PIN via /api/reading-sessions
    // -------------------------------------------------------------
    console.log("\n[Test 5] Logging Offline Session with Valid PIN");
    {
        const newSessionPayload = {
            id: "act-test-101",
            date: "2026-10-27",
            book_id: "book-clean-code",
            book_title: "Clean Code",
            minutes: 35,
            pages: 18,
            start_page: 100,
            end_page: 118,
            notes: "Great chapter on refactoring"
        };

        const req = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Reading-PIN": TEST_PIN
            },
            body: JSON.stringify({
                session: newSessionPayload
            })
        });

        const res = await worker.fetch(req, env);
        assert(res.status === 201, "Session logged with HTTP 201 Created");
        const data = await res.json();
        assert(data.success === true, "Response has success: true");
        assert(data.session.id === "act-test-101", "Saved session has correct ID");
        assert(data.session.minutes === 35, "Saved session has correct minutes");

        // Verify stored in database
        const row = db.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").get();
        const parsed = JSON.parse(row.value);
        assert(parsed.reading_activity.length === 1, "Database contains exactly 1 reading activity");
        assert(parsed.reading_activity[0].id === "act-test-101", "Stored record matches payload");
    }

    // -------------------------------------------------------------
    // Test 6: Duplicate Prevention on Repeated POST
    // -------------------------------------------------------------
    console.log("\n[Test 6] Duplicate Submission Prevention");
    {
        const duplicatePayload = {
            id: "act-test-101", // same ID
            date: "2026-10-27",
            book_id: "book-clean-code",
            book_title: "Clean Code",
            minutes: 35
        };

        const req = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Reading-PIN": TEST_PIN
            },
            body: JSON.stringify({ session: duplicatePayload })
        });

        const res = await worker.fetch(req, env);
        assert(res.status === 201, "Handled safely without error");

        const row = db.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").get();
        const parsed = JSON.parse(row.value);
        assert(parsed.reading_activity.length === 1, "No duplicate session created in storage");
    }

    // -------------------------------------------------------------
    // Test 7: GET /api/reading-sessions Retrieval
    // -------------------------------------------------------------
    console.log("\n[Test 7] Fetch Recorded Sessions via GET /api/reading-sessions");
    {
        const req = new Request("https://test.com/api/reading-sessions", { method: "GET" });
        const res = await worker.fetch(req, env);
        assert(res.status === 200, "HTTP 200 OK");
        const list = await res.json();
        assert(Array.isArray(list), "Returns array of sessions");
        assert(list.length === 1, "Array contains the recorded session");
        assert(list[0].id === "act-test-101", "Session details match");
    }

    // -------------------------------------------------------------
    // Test 8: Consistent Behavior When PIN Protection is Disabled
    // -------------------------------------------------------------
    console.log("\n[Test 8] Security Disabled: Both Actions Allowed Without PIN");
    {
        // Disable security
        db.prepare(`
            UPDATE site_state SET value = ? WHERE key = 'reading_security'
        `).run(JSON.stringify({
            enabled: false,
            pin_hash: hashedPin,
            failed_attempts: 0,
            locked_until: 0
        }));

        // Timer start verification
        const verifyReq = new Request("https://test.com/api/reading-security/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const verifyRes = await worker.fetch(verifyReq, env);
        assert(verifyRes.status === 200, "Timer verification passes when disabled");
        const verifyData = await verifyRes.json();
        assert(verifyData.protection === "disabled", "Response confirms protection is disabled");

        // Offline session logging without PIN
        const req = new Request("https://test.com/api/reading-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session: {
                    id: "act-test-unprotected",
                    book_id: "book-clean-code",
                    minutes: 25
                }
            })
        });
        const res = await worker.fetch(req, env);
        assert(res.status === 201, "Session logged without PIN when security is disabled");
    }

    console.log("\n=================================================");
    console.log(`  ALL BACKEND TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log("=================================================");
}

runTests().catch(err => {
    console.error("Test Suite Error:", err);
    process.exit(1);
});
