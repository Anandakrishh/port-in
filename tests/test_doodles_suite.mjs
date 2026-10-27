import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import worker from "../cloudflare-backend/src/index.js";

console.log("=================================================");
console.log("  DOODLE CORNER — BACKEND & ADMIN SECURITY SUITE");
console.log("=================================================\n");

let passed = 0;
let total = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${message}`);
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
}

async function signToken(str, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(str));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
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
        CREATE TABLE IF NOT EXISTS doodles (
            id TEXT PRIMARY KEY,
            title TEXT,
            nickname TEXT DEFAULT 'Anonymous',
            image_data TEXT NOT NULL,
            status TEXT DEFAULT 'published',
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
                            return { results: stmt.all(...params) };
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

async function createAdminAuthHeader(env) {
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 3600000;
    const email = env.ADMIN_EMAIL;
    const dataStr = `${sessionId}.${expiresAt}.${email}`;
    const sig = await signToken(dataStr, env.SESSION_SECRET);
    const token = `${sessionId}.${expiresAt}.${sig}`;

    // Seed session in active_admin_sessions
    const sessions = {};
    sessions[sessionId] = { email, created_at: Date.now(), expires_at: expiresAt };
    await env.DB.prepare(
        "INSERT INTO site_state (key, value) VALUES ('active_admin_sessions', ?)"
    ).bind(JSON.stringify(sessions)).run();

    return `Bearer ${token}`;
}

async function runTests() {
    const { env, db } = setupTestEnvironment();
    const adminAuthHeader = await createAdminAuthHeader(env);

    const SAMPLE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // -------------------------------------------------------------
    // Test 1: POST /api/doodles Validation
    // -------------------------------------------------------------
    console.log("[Test 1] Public Doodle Submission Validation");
    {
        // 1a: Missing image
        const reqNoImg = new Request("https://test.com/api/doodles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "My Art", nickname: "Anand" })
        });
        const resNoImg = await worker.fetch(reqNoImg, env);
        assert(resNoImg.status === 400, "Rejects request with missing image data (400)");

        // 1b: Invalid non-data-URL image
        const reqBadImg = new Request("https://test.com/api/doodles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: "http://malicious.com/exploit.png" })
        });
        const resBadImg = await worker.fetch(reqBadImg, env);
        assert(resBadImg.status === 400, "Rejects remote URL / non-dataURL payloads (400)");

        // 1c: Payload too large (>550KB)
        const hugeString = "data:image/png;base64," + "A".repeat(600000);
        const reqHuge = new Request("https://test.com/api/doodles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: hugeString })
        });
        const resHuge = await worker.fetch(reqHuge, env);
        assert(resHuge.status === 400, "Rejects oversized payload > 500KB (400)");
    }

    // -------------------------------------------------------------
    // Test 2: Valid Public Doodle Submissions
    // -------------------------------------------------------------
    console.log("\n[Test 2] Successful Public Doodle Creation");
    let createdDoodleId = null;
    {
        const req = new Request("https://test.com/api/doodles", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "CF-Connecting-IP": "192.168.1.1"
            },
            body: JSON.stringify({
                title: "Sunny Afternoon",
                nickname: "ArtVisitor",
                image: SAMPLE_IMAGE
            })
        });
        const res = await worker.fetch(req, env);
        assert(res.status === 201, "Creates doodle with HTTP 201 Created");
        const data = await res.json();
        assert(data.success === true, "Response confirms success: true");
        assert(data.doodle.title === "Sunny Afternoon", "Title stored accurately");
        assert(data.doodle.nickname === "ArtVisitor", "Nickname stored accurately");
        assert(data.doodle.status === "published", "Default status is 'published'");
        createdDoodleId = data.doodle.id;
    }

    // -------------------------------------------------------------
    // Test 3: Public Gallery Retrieval
    // -------------------------------------------------------------
    console.log("\n[Test 3] Public Gallery Endpoint (GET /api/doodles)");
    {
        const req = new Request("https://test.com/api/doodles", { method: "GET" });
        const res = await worker.fetch(req, env);
        assert(res.status === 200, "HTTP 200 OK");
        const list = await res.json();
        assert(Array.isArray(list), "Returns array of doodles");
        assert(list.length === 1, "Contains the published doodle");
        assert(list[0].id === createdDoodleId, "Matching doodle ID");
    }

    // -------------------------------------------------------------
    // Test 4: Rate Limiting Abuse Protection
    // -------------------------------------------------------------
    console.log("\n[Test 4] Submission Rate Limiting (Anti-Spam)");
    {
        // 1 request already sent in Test 2 from 192.168.1.1. Send 7 more to hit limit of 8
        for (let i = 2; i <= 8; i++) {
            const req = new Request("https://test.com/api/doodles", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "CF-Connecting-IP": "192.168.1.1"
                },
                body: JSON.stringify({
                    title: `Spam #${i}`,
                    image: SAMPLE_IMAGE
                })
            });
            const r = await worker.fetch(req, env);
            assert(r.status === 201, `Submission #${i} succeeds`);
        }

        // 9th request must be rate limited (429)
        const reqBlocked = new Request("https://test.com/api/doodles", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "CF-Connecting-IP": "192.168.1.1"
            },
            body: JSON.stringify({ title: "Blocked", image: SAMPLE_IMAGE })
        });
        const resBlocked = await worker.fetch(reqBlocked, env);
        assert(resBlocked.status === 429, "9th request triggers HTTP 429 Rate Limit");
    }

    // -------------------------------------------------------------
    // Test 5: Admin Endpoints Protection (Unauthorized)
    // -------------------------------------------------------------
    console.log("\n[Test 5] Administrative Security: Unauthorized Calls Rejected");
    {
        const reqGet = new Request("https://test.com/api/admin/doodles", { method: "GET" });
        const resGet = await worker.fetch(reqGet, env);
        assert(resGet.status === 401, "GET /api/admin/doodles rejected without auth (401)");

        const reqPut = new Request(`https://test.com/api/admin/doodles/${createdDoodleId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "unpublished" })
        });
        const resPut = await worker.fetch(reqPut, env);
        assert(resPut.status === 401, "PUT /api/admin/doodles/:id rejected without auth (401)");

        const reqDel = new Request(`https://test.com/api/admin/doodles/${createdDoodleId}`, { method: "DELETE" });
        const resDel = await worker.fetch(reqDel, env);
        assert(resDel.status === 401, "DELETE /api/admin/doodles/:id rejected without auth (401)");
    }

    // -------------------------------------------------------------
    // Test 6: Admin Management & Moderation Flow
    // -------------------------------------------------------------
    console.log("\n[Test 6] Admin Moderation: Toggle Publish/Unpublish");
    {
        // 6a: Fetch all as Admin
        const reqAdminGet = new Request("https://test.com/api/admin/doodles", {
            headers: { "Authorization": adminAuthHeader }
        });
        const resAdminGet = await worker.fetch(reqAdminGet, env);
        assert(resAdminGet.status === 200, "Admin can retrieve all doodles (200)");
        const allDoodles = await resAdminGet.json();
        assert(allDoodles.length === 8, "Returns all 8 saved doodles");

        // 6b: Unpublish the first doodle
        const reqUnpublish = new Request(`https://test.com/api/admin/doodles/${createdDoodleId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": adminAuthHeader
            },
            body: JSON.stringify({ status: "unpublished" })
        });
        const resUnpublish = await worker.fetch(reqUnpublish, env);
        assert(resUnpublish.status === 200, "Admin unpublish returns 200 OK");
        const unpubData = await resUnpublish.json();
        assert(unpubData.doodle.status === "unpublished", "Doodle status updated to 'unpublished'");

        // 6c: Verify unpublished doodle is hidden from public gallery
        const reqPubGallery = new Request("https://test.com/api/doodles", { method: "GET" });
        const resPubGallery = await worker.fetch(reqPubGallery, env);
        const pubList = await resPubGallery.json();
        const found = pubList.some(d => d.id === createdDoodleId);
        assert(!found, "Unpublished doodle is hidden from public gallery");
    }

    // -------------------------------------------------------------
    // Test 7: Admin Single Deletion
    // -------------------------------------------------------------
    console.log("\n[Test 7] Admin Single Deletion");
    {
        const reqDel = new Request(`https://test.com/api/admin/doodles/${createdDoodleId}`, {
            method: "DELETE",
            headers: { "Authorization": adminAuthHeader }
        });
        const resDel = await worker.fetch(reqDel, env);
        assert(resDel.status === 200, "DELETE returns HTTP 200 OK");

        // Verify removed from database
        const row = db.prepare("SELECT id FROM doodles WHERE id = ?").get(createdDoodleId);
        assert(!row, "Doodle completely removed from persistent database");
    }

    // -------------------------------------------------------------
    // Test 8: Admin Bulk Clear Gallery Protection
    // -------------------------------------------------------------
    console.log("\n[Test 8] Admin Bulk Deletion Safety & Confirmation");
    {
        // 8a: Accidental bulk delete without confirmation header is blocked
        const reqAccidental = new Request("https://test.com/api/admin/doodles", {
            method: "DELETE",
            headers: { "Authorization": adminAuthHeader }
        });
        const resAccidental = await worker.fetch(reqAccidental, env);
        assert(resAccidental.status === 400, "Accidental bulk delete blocked without confirmation (400)");

        // 8b: Explicit confirmation header clears gallery
        const reqConfirmClear = new Request("https://test.com/api/admin/doodles", {
            method: "DELETE",
            headers: {
                "Authorization": adminAuthHeader,
                "X-Confirm-Clear": "CLEAR_ALL_DOODLES"
            }
        });
        const resConfirmClear = await worker.fetch(reqConfirmClear, env);
        assert(resConfirmClear.status === 200, "Confirmed bulk delete returns 200 OK");
        const clearData = await resConfirmClear.json();
        assert(clearData.cleared === true, "Response confirms cleared: true");

        // Verify table is empty
        const countRow = db.prepare("SELECT count(*) as count FROM doodles").get();
        assert(countRow.count === 0, "Gallery completely cleared (0 doodles in DB)");
    }

    console.log("\n=================================================");
    console.log(`  ALL DOODLE SUITE TESTS PASSED: ${passed}/${total}`);
    console.log("=================================================");
}

runTests().catch(err => {
    console.error("Doodle Suite Error:", err);
    process.exit(1);
});
