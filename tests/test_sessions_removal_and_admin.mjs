import { execSync } from "node:child_process";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://127.0.0.1:8000";

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
    if (condition) {
        passCount++;
        console.log(`  ✅ PASS: ${message}`);
    } else {
        failCount++;
        console.error(`  ❌ FAIL: ${message}`);
    }
}

async function runTests() {
    console.log("=================================================");
    console.log("  REMOVAL OF PUBLIC SESSIONS & ADMIN VERIFICATION");
    console.log("=================================================");

    // -------------------------------------------------------------
    // Test 1: Verify Public Books Page Has NO Recorded Sessions UI
    // -------------------------------------------------------------
    console.log("\n[Test 1] Public Books Page UI Audit in Headless Chrome");
    const booksHtml = fs.readFileSync("books.html", "utf-8");
    const publicAuditScript = `
    <script>
    window.addEventListener("load", () => {
        setTimeout(async () => {
            try {
                // Switch to Sessions tab
                if (window.switchBooksView) {
                    window.switchBooksView("sessions");
                    await new Promise(r => setTimeout(r, 200));
                }

                // 1. Check toggle button does NOT exist
                const toggleBtn = document.getElementById("trackerHistoryToggleBtn");
                if (toggleBtn) throw new Error("trackerHistoryToggleBtn still exists in DOM");

                // 2. Check history section does NOT exist
                const historySec = document.querySelector(".tracker-history-section");
                if (historySec) throw new Error(".tracker-history-section still exists in DOM");

                // 3. Check drawer does NOT exist
                const drawer = document.getElementById("trackerHistoryDrawer");
                if (drawer) throw new Error("#trackerHistoryDrawer still exists in DOM");

                // 4. Check no delete buttons in public page
                const delBtns = document.querySelectorAll(".session-delete-btn");
                if (delBtns.length > 0) throw new Error(".session-delete-btn still exists in DOM");

                // 5. Check timer and offline logger STILL EXIST
                const startBtn = document.getElementById("startSessionBtn");
                const manualLogBtn = document.getElementById("manualLogBtn");
                const bookSelect = document.getElementById("trackerBookSelect");
                const manualMinutes = document.getElementById("trackerManualMinutes");

                if (!startBtn) throw new Error("startSessionBtn missing");
                if (!manualLogBtn) throw new Error("manualLogBtn missing");
                if (!bookSelect) throw new Error("trackerBookSelect missing");
                if (!manualMinutes) throw new Error("trackerManualMinutes missing");

                document.title = "PUBLIC_AUDIT_PASS";
            } catch (err) {
                console.error("Public audit error:", err);
                document.title = "PUBLIC_AUDIT_ERROR: " + err.message;
            }
        }, 500);
    });
    </script>
    `;

    const runnerHtml = "test_public_sessions_audit_runner.html";
    fs.writeFileSync(runnerHtml, booksHtml.replace("</body>", publicAuditScript + "</body>"), "utf-8");

    try {
        const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=6000 --dump-dom "${BASE_URL}/${runnerHtml}"`;
        const dom = execSync(outCmd, { encoding: "utf-8" });
        const match = dom.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1] : "UNKNOWN";
        assert(title === "PUBLIC_AUDIT_PASS", `Public UI audit: ${title}`);
    } finally {
        if (fs.existsSync(runnerHtml)) fs.unlinkSync(runnerHtml);
    }

    // -------------------------------------------------------------
    // Test 2: Verify Admin Page STILL Has Session Management
    // -------------------------------------------------------------
    console.log("\n[Test 2] Admin Page Sessions Management in Headless Chrome");

    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hello.anandha@gmail.com", password: "anand2026" })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    assert(loginRes.status === 200 && Boolean(token), "Admin login successful");

    // Ensure there is at least one session in the database
    await fetch(`${BASE_URL}/api/reading-sessions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
            book_id: "book-atomic-habits",
            book_title: "Atomic Habits",
            date: "2026-10-29",
            minutes: 45,
            pages: 30,
            start_page: 1,
            end_page: 30,
            notes: "Great habit loop chapter"
        })
    });

    const adminHtml = fs.readFileSync("admin.html", "utf-8");
    const adminAuditScript = `
    <script>
    window.addEventListener("load", () => {
        localStorage.setItem("anand_cf_token", "${token}");
        localStorage.setItem("anand_cf_user", JSON.stringify({ email: "hello.anandha@gmail.com" }));

        setTimeout(async () => {
            try {
                // Click Reading Log tab
                const tabBtn = document.querySelector('button[data-type="reading_log"]');
                if (!tabBtn) throw new Error("Reading log tab button missing");
                tabBtn.click();
                await new Promise(r => setTimeout(r, 400));

                const sessionsList = document.getElementById("readingSessionsList");
                if (!sessionsList) throw new Error("#readingSessionsList missing in Admin");

                const sessionItems = sessionsList.querySelectorAll(".del-session-btn");
                if (sessionItems.length === 0) {
                    throw new Error("No session items rendered in Admin sessions list");
                }

                // Verify session details exist
                if (!sessionsList.textContent.includes("Atomic Habits")) {
                    throw new Error("Session title missing in Admin list: " + sessionsList.textContent);
                }

                document.title = "ADMIN_SESSIONS_PASS";
            } catch (err) {
                console.error("Admin sessions audit error:", err);
                document.title = "ADMIN_SESSIONS_ERROR: " + err.message;
            }
        }, 500);
    });
    </script>
    `;

    const adminRunnerHtml = "test_admin_sessions_audit_runner.html";
    fs.writeFileSync(adminRunnerHtml, adminHtml.replace("</body>", adminAuditScript + "</body>"), "utf-8");

    try {
        const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=6000 --dump-dom "${BASE_URL}/${adminRunnerHtml}"`;
        const dom = execSync(outCmd, { encoding: "utf-8" });
        const match = dom.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1] : "UNKNOWN";
        assert(title === "ADMIN_SESSIONS_PASS", `Admin sessions audit: ${title}`);
    } finally {
        if (fs.existsSync(adminRunnerHtml)) fs.unlinkSync(adminRunnerHtml);
    }

    // -------------------------------------------------------------
    // Test 3: Verify Statistics & Data Unaffected
    // -------------------------------------------------------------
    console.log("\n[Test 3] Reading Statistics and Data Persistence Verification");
    const sessionsRes = await fetch(`${BASE_URL}/api/reading-sessions`, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    assert(sessionsRes.status === 200, "GET /api/reading-sessions returns 200");
    const sessionsData = await sessionsRes.json();
    assert(Array.isArray(sessionsData) && sessionsData.length >= 1, `Recorded sessions preserved in database (${sessionsData.length} records)`);

    console.log("\n=================================================");
    console.log(`  SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("=================================================");

    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Test Suite crashed:", err);
    process.exit(1);
});
