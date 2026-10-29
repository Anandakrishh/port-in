import { execSync } from "node:child_process";
import fs from "node:fs";

const BASE_URL = "http://127.0.0.1:8000";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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
    console.log("  READING GOAL AUTHENTICATION & SECURITY SUITE");
    console.log("=================================================");

    // -----------------------------------------------------------------------
    // TEST 1: Public Read Access
    // -----------------------------------------------------------------------
    console.log("\n[Test 1] Public Access to GET /api/reading-goals");
    const getRes = await fetch(`${BASE_URL}/api/reading-goals`);
    assert(getRes.status === 200, "HTTP 200 OK for public GET /api/reading-goals");
    const getData = await getRes.json();
    assert(getData && typeof getData.goals === "object", "Returns goals object");
    assert(Boolean(getData.goals["2026"] || getData.goals[2026]), "Contains goal for 2026");

    // -----------------------------------------------------------------------
    // TEST 2: Reject Unauthorized Updates (Security Core Requirement)
    // -----------------------------------------------------------------------
    console.log("\n[Test 2] Direct Unauthorized Modification Rejected");
    const anonRes = await fetch(`${BASE_URL}/api/reading-goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: 2026, target: 50 })
    });
    assert(anonRes.status === 401, "Anonymous PUT /api/reading-goals rejected with 401");

    const forgedRes = await fetch(`${BASE_URL}/api/reading-goals`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer forged_session_token_12345"
        },
        body: JSON.stringify({ year: 2026, target: 50 })
    });
    assert(forgedRes.status === 401, "Forged token rejected with 401");

    const anonStateRes = await fetch(`${BASE_URL}/api/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading_goals: { 2026: { target: 99 } } })
    });
    assert(anonStateRes.status === 401, "Anonymous POST /api/state rejected with 401");

    // -----------------------------------------------------------------------
    // TEST 3: Admin Authentication & Input Validation
    // -----------------------------------------------------------------------
    console.log("\n[Test 3] Admin Login and Input Validation");
    const loginRes = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "hello.anandha@gmail.com", password: "anand2026" })
    });
    assert(loginRes.status === 200, "Admin login succeeds with 200");
    const loginData = await loginRes.json();
    const token = loginData.token;
    assert(Boolean(token), "Received valid session token");

    // Bad inputs: 0, negative, non-integer, out of range
    const badTargets = [0, -4, 1.5, "not_a_number", 5000];
    for (const bad of badTargets) {
        const res = await fetch(`${BASE_URL}/api/reading-goals`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ year: 2026, target: bad })
        });
        assert(res.status === 400, `Rejects invalid target "${bad}" with 400 Bad Request`);
    }

    const badYears = [1890, 2150, "abc"];
    for (const badYr of badYears) {
        const res = await fetch(`${BASE_URL}/api/reading-goals`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ year: badYr, target: 15 })
        });
        assert(res.status === 400, `Rejects invalid year "${badYr}" with 400 Bad Request`);
    }

    // -----------------------------------------------------------------------
    // TEST 4: Authorized Goal Update & Multi-Year Persistence
    // -----------------------------------------------------------------------
    console.log("\n[Test 4] Authenticated Goal Update and Persistence");
    const validUpdateRes = await fetch(`${BASE_URL}/api/reading-goals`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ year: 2026, target: 14 })
    });
    assert(validUpdateRes.status === 200, "Updating 2026 goal to 14 returns 200 OK");

    // Also set year 2027 goal
    const update2027Res = await fetch(`${BASE_URL}/api/reading-goals`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ year: 2027, target: 20 })
    });
    assert(update2027Res.status === 200, "Updating 2027 goal to 20 returns 200 OK");

    // Verify GET /api/reading-goals returns both
    const checkRes = await fetch(`${BASE_URL}/api/reading-goals`);
    const checkData = await checkRes.json();
    assert(checkData.goals["2026"]?.target === 14, "2026 goal persisted as 14 books");
    assert(checkData.goals["2027"]?.target === 20, "2027 goal persisted as 20 books");

    // Verify /api/state also has updated reading_goals
    const stateRes = await fetch(`${BASE_URL}/api/state`);
    const stateData = await stateRes.json();
    assert(stateData.reading_goals?.["2026"]?.target === 14, "/api/state synchronized with 2026 goal");

    // -----------------------------------------------------------------------
    // TEST 5: Browser Verification on books.html
    // -----------------------------------------------------------------------
    console.log("\n[Test 5] Headless Chrome Verification on books.html");
    const booksHtml = fs.readFileSync("books.html", "utf-8");
    const e2eScript = `
    <script>
    window.testResults = [];
    function record(name, pass, details = "") {
        window.testResults.push({ name, pass, details });
        console.log((pass ? "✅ PASS: " : "❌ FAIL: ") + name + (details ? " - " + details : ""));
    }

    window.addEventListener("load", () => {
        setTimeout(async () => {
            try {
                // 1. Verify edit button is GONE
                const editBtn = document.getElementById("editGoalBtn");
                record("Edit goal button does NOT exist in DOM", editBtn === null);

                // 2. Verify non-interactive badge is present
                const badge = document.getElementById("challengeGoalBadge");
                record("Challenge goal badge exists", !!badge);
                record("Badge text shows 'Annual Goal: 14 books'", badge && badge.textContent.includes("Annual Goal: 14 books"));

                // 3. Verify heading shows correct target
                const heading = document.querySelector(".challenge-heading");
                record("Challenge heading shows 'of 14 books completed'", heading && heading.textContent.includes("14 books completed"));

                // 4. Verify progress calculations
                const pct = document.querySelector(".challenge-pct");
                const rem = document.querySelector(".challenge-rem");
                record("Percentage element is rendered", !!pct);
                record("Remaining books element is rendered", !!rem);

                // 5. Test clicking badge does NOT open any prompt or error
                let promptCalled = false;
                window.prompt = () => { promptCalled = true; return "99"; };
                if (badge) badge.click();
                await new Promise(r => setTimeout(r, 100));
                record("Clicking badge does NOT trigger window.prompt", !promptCalled);

                document.title = "BOOKS_GOAL_PASS";
            } catch (err) {
                console.error("Books goal audit error:", err);
                document.title = "BOOKS_GOAL_ERROR: " + err.message;
            }
        }, 600);
    });
    </script>
    `;

    const runnerHtml = "test_books_goal_runner.html";
    fs.writeFileSync(runnerHtml, booksHtml.replace("</body>", e2eScript + "</body>"), "utf-8");

    try {
        const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=6000 --dump-dom "${BASE_URL}/${runnerHtml}"`;
        const dom = execSync(outCmd, { encoding: "utf-8" });
        const match = dom.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1] : "UNKNOWN";
        assert(title === "BOOKS_GOAL_PASS", `Headless Chrome books.html audit: ${title}`);
    } finally {
        if (fs.existsSync(runnerHtml)) fs.unlinkSync(runnerHtml);
    }

    // -----------------------------------------------------------------------
    // TEST 6: Headless Chrome Verification on admin.html
    // -----------------------------------------------------------------------
    console.log("\n[Test 6] Headless Chrome Verification on admin.html");
    const adminHtml = fs.readFileSync("admin.html", "utf-8");
    const adminE2eScript = `
    <script>
    window.addEventListener("load", () => {
        // Pre-authenticate the session for the test
        localStorage.setItem("anand_cf_token", "${token}");
        localStorage.setItem("anand_cf_user", JSON.stringify({ email: "hello.anandha@gmail.com" }));

        setTimeout(async () => {
            try {
                // Switch to Reading Log tab
                const readingLogBtn = document.querySelector('button[data-type="reading_log"]');
                if (readingLogBtn) readingLogBtn.click();
                await new Promise(r => setTimeout(r, 300));

                const goalYear = document.getElementById("readingGoalYear");
                const goalTarget = document.getElementById("readingGoalTarget");
                const currentGoalDisplay = document.getElementById("currentGoalDisplay");
                const saveGoalBtn = document.getElementById("saveReadingGoalBtn");
                const goalMessage = document.getElementById("goalMessage");

                if (!goalYear || !goalTarget || !currentGoalDisplay || !saveGoalBtn) {
                    throw new Error("Missing reading goal admin UI elements");
                }

                // Verify 2026 goal shows 14
                if (!currentGoalDisplay.textContent.includes("14 books") || goalTarget.value !== "14") {
                    throw new Error("Initial 2026 goal mismatch: display=" + currentGoalDisplay.textContent + " input=" + goalTarget.value);
                }

                // Switch year to 2027 and check dynamic display update
                goalYear.value = "2027";
                goalYear.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));

                if (!currentGoalDisplay.textContent.includes("20 books") || goalTarget.value !== "20") {
                    throw new Error("2027 goal mismatch: display=" + currentGoalDisplay.textContent + " input=" + goalTarget.value);
                }

                // Switch back to 2026 and save new goal: 12
                goalYear.value = "2026";
                goalYear.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));

                goalTarget.value = "12";
                saveGoalBtn.click();
                await new Promise(r => setTimeout(r, 400));

                if (!goalMessage.textContent.includes("Goal for 2026 saved: 12 books!")) {
                    throw new Error("Save message mismatch: " + goalMessage.textContent);
                }
                if (!currentGoalDisplay.textContent.includes("12 books")) {
                    throw new Error("Display after save mismatch: " + currentGoalDisplay.textContent);
                }

                document.title = "ADMIN_GOAL_PASS";
            } catch (err) {
                console.error("Admin goal audit error:", err);
                document.title = "ADMIN_GOAL_ERROR: " + err.message;
            }
        }, 500);
    });
    </script>
    `;

    const adminRunnerHtml = "test_admin_goal_runner.html";
    fs.writeFileSync(adminRunnerHtml, adminHtml.replace("</body>", adminE2eScript + "</body>"), "utf-8");

    try {
        const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=6000 --dump-dom "${BASE_URL}/${adminRunnerHtml}"`;
        const dom = execSync(outCmd, { encoding: "utf-8" });
        const match = dom.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1] : "UNKNOWN";
        assert(title === "ADMIN_GOAL_PASS", `Headless Chrome admin.html audit: ${title}`);
    } finally {
        if (fs.existsSync(adminRunnerHtml)) fs.unlinkSync(adminRunnerHtml);
    }

    // Verify reset to 12 persisted
    const finalCheck = await fetch(`${BASE_URL}/api/reading-goals`);
    const finalData = await finalCheck.json();
    assert(finalData.goals["2026"]?.target === 12, "Final 2026 goal successfully updated to 12 in database");

    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Test Suite crashed:", err);
    process.exit(1);
});
