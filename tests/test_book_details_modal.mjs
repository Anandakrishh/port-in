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
    console.log("  BOOK DETAILS MODAL - REFINEMENT & SECURITY TEST");
    console.log("=================================================");

    // -----------------------------------------------------------------
    // TEST 1: Server-side authorization check on book status modification
    // -----------------------------------------------------------------
    console.log("\n[Test 1] Verifying Server-Side Authorization for Book Updates");
    const unauthPut = await fetch(`${BASE_URL}/api/books/book-atomic-habits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "want-to-read" })
    });
    assert(unauthPut.status === 401, "Anonymous PUT /api/books/:id rejected with 401 Unauthorized");

    const forgedPut = await fetch(`${BASE_URL}/api/books/book-atomic-habits`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid_forged_token"
        },
        body: JSON.stringify({ status: "want-to-read" })
    });
    assert(forgedPut.status === 401, "Forged token PUT /api/books/:id rejected with 401 Unauthorized");

    // -----------------------------------------------------------------
    // TEST 2: Admin Login & Book Status Management Verification
    // -----------------------------------------------------------------
    console.log("\n[Test 2] Verifying Admin Book Management Access");
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hello.anandha@gmail.com", password: "anand2026" })
    });
    assert(loginRes.status === 200, "Admin login succeeds with 200 OK");
    const loginData = await loginRes.json();
    const token = loginData.token;
    assert(Boolean(token), "Received valid session token for admin");

    // -----------------------------------------------------------------
    // TEST 3: Headless Chrome Verification of Public Book Detail Modal
    // -----------------------------------------------------------------
    console.log("\n[Test 3] Headless Chrome Audit of Public Book Details Modal");

    const port = 9340;
    const userDataDir = path.join(artifactDir, "scratch", "chrome_prof_book_modal_" + Date.now());
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

        async function createSession(width, height, mobile = false) {
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
                mobile
            });

            return { pageWs, sendPage };
        }

        // --- Desktop Test ---
        const desktop = await createSession(1200, 900, false);
        await desktop.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1200));

        // Click first book card (Atomic Habits)
        await desktop.sendPage("Runtime.evaluate", {
            expression: `
                const card = document.querySelector(".book[data-record-id='book-atomic-habits']") || document.querySelector(".book");
                if (card) card.click();
            `
        });
        await new Promise(r => setTimeout(r, 600));

        // Evaluate modal contents
        const evalRes = await desktop.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                modalActive: document.getElementById("bookDetailModal")?.classList.contains("active"),
                hasStatusDropdown: !!document.getElementById("modalBookStatusSelect"),
                hasUpdateStatusBtn: !!document.getElementById("modalUpdateStatusBtn"),
                hasStatusRow: !!document.querySelector(".book-detail-status-row"),
                hasReadingLogsTimeline: !!document.getElementById("modalBookTimeline"),
                hasTimelineSection: !!document.querySelector(".book-detail-timeline-section"),
                title: document.getElementById("modalBookTitle")?.textContent.trim(),
                author: document.getElementById("modalBookAuthor")?.textContent.trim(),
                authorVisible: document.getElementById("modalBookAuthor")?.style.display !== "none",
                ratingText: document.getElementById("modalBookRating")?.textContent.trim(),
                ratingVisible: document.getElementById("modalBookRating")?.style.display !== "none",
                datesText: document.getElementById("modalBookDates")?.textContent.trim(),
                datesVisible: document.getElementById("modalBookDates")?.style.display !== "none",
                coverSrc: document.getElementById("modalBookCover")?.src,
                notesSectionVisible: document.getElementById("modalBookNotesSection")?.style.display !== "none",
                notesText: document.getElementById("modalBookNotes")?.textContent.trim(),
                closeBtnExists: !!document.getElementById("bookModalClose")
            })`
        });
        const dData = JSON.parse(evalRes.result.result.value);

        assert(dData.modalActive === true, "Modal opens on book card click");
        assert(dData.hasStatusDropdown === false, "Reading Status dropdown is removed from public modal");
        assert(dData.hasUpdateStatusBtn === false, "Update Status button is removed from public modal");
        assert(dData.hasStatusRow === false, "Status row container is removed from public modal");
        assert(dData.hasReadingLogsTimeline === false, "Reading logs timeline list is removed from public modal");
        assert(dData.hasTimelineSection === false, "Reading logs section container is removed from public modal");
        assert(dData.title.length > 0, `Book title is displayed: "${dData.title}"`);
        assert(dData.authorVisible && dData.author.includes("James Clear"), `Author is displayed: "${dData.author}"`);
        assert(dData.ratingVisible && dData.ratingText.includes("5/5"), `Rating is displayed: "${dData.ratingText}"`);
        assert(dData.closeBtnExists === true, "Close button exists in dialog");

        // Capture Desktop Screenshot
        const dShot = await desktop.sendPage("Page.captureScreenshot", { format: "png" });
        const dImg = Buffer.from(dShot.result.data, "base64");
        fs.writeFileSync(path.join(artifactDir, "screenshot_book_modal_desktop.png"), dImg);
        console.log(`  📸 Saved screenshot_book_modal_desktop.png (${dImg.length} bytes)`);

        // Test closing via Close button
        await desktop.sendPage("Runtime.evaluate", {
            expression: `document.getElementById("bookModalClose")?.click();`
        });
        await new Promise(r => setTimeout(r, 400));

        const closedCheck = await desktop.sendPage("Runtime.evaluate", {
            expression: `!document.getElementById("bookDetailModal")?.classList.contains("active")`
        });
        assert(closedCheck.result.result.value === true, "Modal closes when close button is clicked");
        desktop.pageWs.close();

        // --- Mobile Test (375px) ---
        console.log("\n[Test 4] Mobile Viewport Audit (375px)");
        const mobile = await createSession(375, 812, true);
        await mobile.sendPage("Page.navigate", { url: `${BASE_URL}/books.html` });
        await new Promise(r => setTimeout(r, 1200));

        // Click Atomic Habits
        await mobile.sendPage("Runtime.evaluate", {
            expression: `
                const card = document.querySelector(".book[data-record-id='book-atomic-habits']") || document.querySelector(".book");
                if (card) card.click();
            `
        });
        await new Promise(r => setTimeout(r, 600));

        const mCheck = await mobile.sendPage("Runtime.evaluate", {
            expression: `JSON.stringify({
                modalActive: document.getElementById("bookDetailModal")?.classList.contains("active"),
                dialogWidth: document.querySelector(".book-detail-dialog")?.getBoundingClientRect().width,
                windowWidth: window.innerWidth,
                hasOverflow: document.querySelector(".book-detail-dialog")?.scrollWidth > window.innerWidth
            })`
        });
        const mData = JSON.parse(mCheck.result.result.value);

        assert(mData.modalActive === true, "Modal opens in mobile viewport");
        assert(mData.dialogWidth <= 375, `Dialog fits within mobile viewport (width: ${mData.dialogWidth.toFixed(1)}px <= 375px)`);
        assert(mData.hasOverflow === false, "No horizontal overflow on mobile modal");

        // Capture Mobile Screenshot
        const mShot = await mobile.sendPage("Page.captureScreenshot", { format: "png" });
        const mImg = Buffer.from(mShot.result.data, "base64");
        fs.writeFileSync(path.join(artifactDir, "screenshot_book_modal_mobile.png"), mImg);
        console.log(`  📸 Saved screenshot_book_modal_mobile.png (${mImg.length} bytes)`);

        // Test ESC key closing
        await mobile.sendPage("Runtime.evaluate", {
            expression: `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`
        });
        await new Promise(r => setTimeout(r, 400));

        const escCheck = await mobile.sendPage("Runtime.evaluate", {
            expression: `!document.getElementById("bookDetailModal")?.classList.contains("active")`
        });
        assert(escCheck.result.result.value === true, "Modal closes on Escape key press");
        mobile.pageWs.close();

        ws.close();
    } finally {
        chromeProc.kill();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    }

    console.log("\n=================================================");
    console.log(`  SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("=================================================");

    if (failCount > 0) process.exit(1);
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
