import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactDir = "C:\\Users\\imak2\\.gemini\\antigravity\\brain\\c737a6cc-13df-4eb5-8064-6cf16be2e686";
const BASE_URL = "http://127.0.0.1:8000";

let passCount = 0;
let failCount = 0;

function assert(cond, msg) {
    if (cond) {
        passCount++;
        console.log(`  ✅ PASS: ${msg}`);
    } else {
        failCount++;
        console.error(`  ❌ FAIL: ${msg}`);
    }
}

async function run() {
    console.log("=================================================");
    console.log("  DELETION SYNCHRONIZATION & SINGLE SOURCE OF TRUTH");
    console.log("=================================================");

    // -------------------------------------------------------------
    // Test 1: Verify Database & Server API state
    // -------------------------------------------------------------
    console.log("\n[Test 1] Database & Public API Verification");
    const [booksRes, stateRes] = await Promise.all([
        fetch(`${BASE_URL}/api/books`).then(r => r.json()),
        fetch(`${BASE_URL}/api/state`).then(r => r.json())
    ]);

    const has48InApi = booksRes.some(b => (b.id === "book-48-laws" || (b.title && b.title.includes("48 Laws"))));
    assert(!has48InApi, "GET /api/books excludes 'The 48 Laws of Power'");

    const is48InDeletedIds = Array.isArray(stateRes.deletedIds) && stateRes.deletedIds.includes("book-48-laws");
    assert(is48InDeletedIds, "GET /api/state includes 'book-48-laws' in deletedIds");

    const has48InOverrides = stateRes.overrides && Boolean(stateRes.overrides["book-48-laws"]);
    assert(!has48InOverrides, "GET /api/state overrides does NOT contain stale 'book-48-laws'");

    // -------------------------------------------------------------
    // Test 2: Admin Collection Verification
    // -------------------------------------------------------------
    console.log("\n[Test 2] Admin Dashboard Verification in Headless Chrome");
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hello.anandha@gmail.com", password: "anand2026" })
    });
    const { token } = await loginRes.json();
    assert(Boolean(token), "Admin login successful");

    const port = 9345;
    const userDataDir = path.join(artifactDir, "scratch", "chrome_prof_sync_" + Date.now());
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const chromeProc = spawn(chromePath, [
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "--no-first-run",
        "--no-default-browser-check"
    ]);

    try {
        let wsUrl = null;
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const res = await fetch(`http://127.0.0.1:${port}/json/version`);
                const data = await res.json();
                if (data.webSocketDebuggerUrl) {
                    wsUrl = data.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }
        if (!wsUrl) throw new Error("Could not connect to Chrome debugging port");

        const ws = new WebSocket(wsUrl);
        let msgId = 1;
        const pending = new Map();

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && pending.has(data.id)) {
                pending.get(data.id)(data);
                pending.delete(data.id);
            }
        };

        await new Promise((resolve) => ws.onopen = resolve);

        function send(method, params = {}) {
            const id = msgId++;
            return new Promise((resolve) => {
                pending.set(id, resolve);
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        async function createSession(width, height) {
            const targetRes = await send("Target.createTarget", { url: "about:blank" });
            const targetId = targetRes.result.targetId;

            const pageWsRes = await fetch(`http://127.0.0.1:${port}/json`);
            const pages = await pageWsRes.json();
            const pageInfo = pages.find(p => p.id === targetId);

            const pageWs = new WebSocket(pageInfo.webSocketDebuggerUrl);
            let pageMsgId = 1;
            const pagePending = new Map();

            pageWs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.id && pagePending.has(data.id)) {
                    pagePending.get(data.id)(data);
                    pagePending.delete(data.id);
                }
            };

            await new Promise((resolve) => pageWs.onopen = resolve);

            function sendPage(method, params = {}) {
                const id = pageMsgId++;
                return new Promise((resolve) => {
                    pagePending.set(id, resolve);
                    pageWs.send(JSON.stringify({ id, method, params }));
                });
            }

            await sendPage("Page.enable");
            await sendPage("Emulation.setDeviceMetricsOverride", {
                width,
                height,
                deviceScaleFactor: 2,
                mobile: false
            });

            return { pageWs, sendPage };
        }

        // --- Step 2a: Admin page audit ---
        const adminPage = await createSession(1280, 900);
        await adminPage.sendPage("Page.navigate", { url: `${BASE_URL}/admin.html` });
        await new Promise(r => setTimeout(r, 800));

        // Inject session
        await adminPage.sendPage("Runtime.evaluate", {
            expression: `
                localStorage.setItem("anand_cf_token", "${token}");
                localStorage.setItem("anand_cf_user", JSON.stringify({ email: "hello.anandha@gmail.com" }));
                location.reload();
            `
        });
        await new Promise(r => setTimeout(r, 1200));

        // Switch to All Records -> Books filter
        await adminPage.sendPage("Runtime.evaluate", {
            expression: `
                const nav = document.querySelector("button[data-type='old_records']") || Array.from(document.querySelectorAll("button")).find(n => n.textContent.includes("All records"));
                if (nav) nav.click();
                setTimeout(() => {
                    const pill = document.querySelector(".filter-pill[data-category='book']") || Array.from(document.querySelectorAll(".filter-pill")).find(p => p.textContent.includes("Books"));
                    if (pill) pill.click();
                }, 400);
            `
        });
        await new Promise(r => setTimeout(r, 1200));

        const adminAudit = await adminPage.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                has48InAdmin: Array.from(document.querySelectorAll(".old-record-card, .admin-item")).some(el => el.textContent.includes("48 Laws")),
                bookCardsCount: document.querySelectorAll("#oldRecordsList .old-record-card").length
            })`
        });
        const admData = JSON.parse(adminAudit.result.result.value);

        assert(admData.has48InAdmin === false, "'The 48 Laws of Power' is NOT in Admin collection");
        assert(admData.bookCardsCount === 5, `Admin displays exactly 5 active books (got: ${admData.bookCardsCount})`);

        // Capture Admin Screenshot
        const admShot = await adminPage.sendPage("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(artifactDir, "screenshot_admin_books_verified.png"), Buffer.from(admShot.result.data, "base64"));
        console.log("  📸 Saved screenshot_admin_books_verified.png");
        adminPage.pageWs.close();

        // -------------------------------------------------------------
        // Test 3: Public Books Page Comprehensive Verification
        // -------------------------------------------------------------
        console.log("\n[Test 3] Public Books Page Verification");
        const publicPage = await createSession(1280, 950);
        await publicPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        // Evaluate All Books shelf
        const pubAudit1 = await publicPage.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                titles: Array.from(document.querySelectorAll(".book h3")).map(h => h.textContent.trim()),
                has48: Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws")),
                shelfPills: Array.from(document.querySelectorAll(".shelf-tab")).map(t => t.textContent.trim().replace(/\\s+/g, " "))
            })`
        });
        const pubData1 = JSON.parse(pubAudit1.result.result.value);

        assert(!pubData1.has48, "'The 48 Laws of Power' does NOT appear in All Books");
        assert(!pubData1.titles.includes("The 48 Laws of Power"), `Rendered books do not include 48 Laws (titles: ${JSON.stringify(pubData1.titles)})`);
        assert(pubData1.titles.length === 5, `Exactly 5 books rendered on public page (got: ${pubData1.titles.length})`);

        // Check shelf filters: "Read"
        await publicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".shelf-tab[data-shelf='read']")?.click();`
        });
        await new Promise(r => setTimeout(r, 400));
        const pubRead = await publicPage.sendPage("Runtime.evaluate", {
            expression: `Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws"))`
        });
        assert(!pubRead.result.result.value, "'The 48 Laws of Power' does NOT appear in 'Read' filter");

        // Check shelf filters: "Reading"
        await publicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".shelf-tab[data-shelf='currently-reading']")?.click();`
        });
        await new Promise(r => setTimeout(r, 400));
        const pubReading = await publicPage.sendPage("Runtime.evaluate", {
            expression: `Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws"))`
        });
        assert(!pubReading.result.result.value, "'The 48 Laws of Power' does NOT appear in 'Currently Reading' filter");

        // Check shelf filters: "Want to Read"
        await publicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".shelf-tab[data-shelf='want-to-read']")?.click();`
        });
        await new Promise(r => setTimeout(r, 400));
        const pubWant = await publicPage.sendPage("Runtime.evaluate", {
            expression: `Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws"))`
        });
        assert(!pubWant.result.result.value, "'The 48 Laws of Power' does NOT appear in 'Want to Read' filter");

        // Check Search Filter: Search for "48" and "Robert Greene"
        await publicPage.sendPage("Runtime.evaluate", {
            expression: `
                document.querySelector(".shelf-tab[data-shelf='all']")?.click();
                const search = document.getElementById("bookSearchInput");
                search.value = "48 Laws";
                search.dispatchEvent(new Event("input", { bubbles: true }));
            `
        });
        await new Promise(r => setTimeout(r, 400));
        const search48 = await publicPage.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                visibleBooks: document.querySelectorAll(".book").length,
                hasEmptyState: !!document.querySelector(".books-empty-state")
            })`
        });
        const searchData = JSON.parse(search48.result.result.value);
        assert(searchData.visibleBooks === 0 && searchData.hasEmptyState, "Searching '48 Laws' returns empty state (0 books)");

        // Clear search
        await publicPage.sendPage("Runtime.evaluate", {
            expression: `
                const search = document.getElementById("bookSearchInput");
                search.value = "";
                search.dispatchEvent(new Event("input", { bubbles: true }));
            `
        });
        await new Promise(r => setTimeout(r, 400));

        // Capture Public Books Screenshot
        const pubShot = await publicPage.sendPage("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(artifactDir, "screenshot_public_books_verified.png"), Buffer.from(pubShot.result.data, "base64"));
        console.log("  📸 Saved screenshot_public_books_verified.png");

        // -------------------------------------------------------------
        // Test 4: Browser Refresh Persistence
        // -------------------------------------------------------------
        console.log("\n[Test 4] Persistence Across Page Refresh");
        await publicPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        const refreshCheck = await publicPage.sendPage("Runtime.evaluate", {
            expression: `Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws"))`
        });
        assert(!refreshCheck.result.result.value, "After page refresh, 'The 48 Laws of Power' remains completely absent");
        publicPage.pageWs.close();

        // -------------------------------------------------------------
        // Test 5: Fresh Browser Session (Clean Profile & Isolated LocalStorage)
        // -------------------------------------------------------------
        console.log("\n[Test 5] Fresh Browser Session Verification");
        const freshPage = await createSession(1280, 950);
        await freshPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        const freshCheck = await freshPage.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                has48: Array.from(document.querySelectorAll(".book")).some(b => b.textContent.includes("48 Laws")),
                count: document.querySelectorAll(".book").length
            })`
        });
        const freshData = JSON.parse(freshCheck.result.result.value);
        assert(!freshData.has48, "In fresh browser session, 'The 48 Laws of Power' does NOT appear");
        assert(freshData.count === 5, `Fresh session renders exactly 5 books (got: ${freshData.count})`);
        freshPage.pageWs.close();

        // -------------------------------------------------------------
        // Test 6: Audit Full CRUD Synchronization (Add -> Edit -> Delete)
        // -------------------------------------------------------------
        console.log("\n[Test 6] Full CRUD Synchronization Audit");

        // 1. Add a test book via Admin API
        const testBookId = "book-test-sync-" + Date.now();
        const addRes = await fetch(`${BASE_URL}/api/books`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                id: testBookId,
                title: "Test Sync Book",
                status: "want-to-read",
                image_url: "assets/books/atomic-habits.jpg"
            })
        });
        assert(addRes.status === 201, "POST /api/books creates book in database");

        // Update its state override
        const stateToUpdate = await fetch(`${BASE_URL}/api/state`).then(r => r.json());
        stateToUpdate.overrides = stateToUpdate.overrides || {};
        stateToUpdate.overrides[testBookId] = {
            author: "Test Author",
            status: "want-to-read",
            rating: 4,
            review: "Test sync review"
        };
        await fetch(`${BASE_URL}/api/state`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(stateToUpdate)
        });

        // Verify book appears on public Books page
        const testPublicPage = await createSession(1280, 950);
        await testPublicPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        const addCheck = await testPublicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".book[data-record-id='${testBookId}']") !== null`
        });
        assert(addCheck.result.result.value === true, "Newly added book appears immediately on public Books page");

        // 2. Edit the book's status to 'read'
        const editRes = await fetch(`${BASE_URL}/api/books/${testBookId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                title: "Test Sync Book Edited",
                status: "read"
            })
        });
        assert(editRes.status === 200, "PUT /api/books/:id updates book in database");

        await testPublicPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        const editCheck = await testPublicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".book[data-record-id='${testBookId}'] h3")?.textContent.includes("Edited")`
        });
        assert(editCheck.result.result.value === true, "Edited book title updates on public Books page");

        // 3. Delete the test book
        const delRes = await fetch(`${BASE_URL}/api/books/${testBookId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        assert(delRes.status === 200, "DELETE /api/books/:id deletes book from database");

        // Re-navigate to public page
        await testPublicPage.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1400));

        const delCheck = await testPublicPage.sendPage("Runtime.evaluate", {
            expression: `document.querySelector(".book[data-record-id='${testBookId}']") === null`
        });
        assert(delCheck.result.result.value === true, "Deleted book immediately disappears from public Books page and does not reappear");
        testPublicPage.pageWs.close();

        ws.close();
    } finally {
        chromeProc.kill();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    }

    console.log("\n=================================================");
    console.log(`  SYNCHRONIZATION SUITE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("=================================================");

    if (failCount > 0) process.exit(1);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
