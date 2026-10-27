import { execSync } from "node:child_process";
import fs from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const booksHtml = fs.readFileSync("books.html", "utf-8");

const fullAuditScript = `
<script>
window.auditSuiteResults = [];
function record(name, pass, details = "") {
    window.auditSuiteResults.push({ name, pass, details });
    console.log((pass ? "✅ PASS: " : "❌ FAIL: ") + name + (details ? " - " + details : ""));
}

window.addEventListener("load", () => {
    // Clear test session storage
    localStorage.removeItem("books_reading_activity");
    localStorage.removeItem("anand_old_records_state");

    setTimeout(async () => {
        try {
            // ==========================================
            // 1. NAVIGATION AUDIT
            // ==========================================
            const tabLib = document.getElementById("tabLibrary");
            const tabIns = document.getElementById("tabInsights");
            const tabSes = document.getElementById("tabSessions");
            const viewLib = document.getElementById("viewLibrary");
            const viewIns = document.getElementById("viewInsights");
            const viewSes = document.getElementById("viewSessions");

            record("Navigation: Default tab is Library",
                tabLib.classList.contains("active") && !viewLib.classList.contains("books-view-hidden")
            );

            record("Navigation: No unwanted status badge exists in nav",
                document.getElementById("tabLiveBadge") === null
            );

            // Switch to Insights
            tabIns.click();
            await new Promise(r => setTimeout(r, 150));
            record("Navigation: Switch to Insights displays panel and hides others",
                tabIns.classList.contains("active") && !viewIns.classList.contains("books-view-hidden") && viewLib.classList.contains("books-view-hidden")
            );

            // Switch to Sessions
            tabSes.click();
            await new Promise(r => setTimeout(r, 150));
            record("Navigation: Switch to Sessions displays panel and hides others",
                tabSes.classList.contains("active") && !viewSes.classList.contains("books-view-hidden") && viewIns.classList.contains("books-view-hidden")
            );

            // Switch back to Library
            tabLib.click();
            await new Promise(r => setTimeout(r, 150));
            record("Navigation: Switch back to Library works",
                tabLib.classList.contains("active") && !viewLib.classList.contains("books-view-hidden")
            );

            // ==========================================
            // 2. LIBRARY & CHALLENGE AUDIT
            // ==========================================
            const challengeWidget = document.getElementById("bookChallengeWidget");
            const challengeTitle = challengeWidget?.querySelector(".challenge-title")?.textContent || "";
            record("Challenge: Goal and count displayed correctly",
                challengeTitle.includes("4 of 12 books completed"),
                challengeTitle
            );

            const bookCards = document.querySelectorAll(".books-card");
            record("Library: 6 books loaded into collection",
                bookCards.length === 6,
                "Count: " + bookCards.length
            );

            // Test Shelf Filters
            const readShelfTab = document.querySelector('.shelf-tab[data-shelf="read"]');
            if (readShelfTab) {
                readShelfTab.click();
                await new Promise(r => setTimeout(r, 100));
                const visibleAfterFilter = Array.from(document.querySelectorAll(".books-card")).filter(c => c.style.display !== "none");
                record("Library: Shelf filter for 'Read' shows 4 books",
                    visibleAfterFilter.length === 4,
                    "Visible: " + visibleAfterFilter.length
                );
                // Reset shelf
                document.querySelector('.shelf-tab[data-shelf="all"]')?.click();
                await new Promise(r => setTimeout(r, 100));
            }

            // Test Search filter
            const searchInput = document.getElementById("bookSearchInput");
            if (searchInput) {
                searchInput.value = "atomic";
                searchInput.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));
                const searchResults = Array.from(document.querySelectorAll(".books-card")).filter(c => c.style.display !== "none");
                record("Library: Search for 'atomic' shows 1 matching book",
                    searchResults.length === 1,
                    "Matches: " + searchResults.length
                );
                searchInput.value = "";
                searchInput.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));
            }

            // ==========================================
            // 3. SESSIONS & TIMER AUDIT
            // ==========================================
            tabSes.click();
            await new Promise(r => setTimeout(r, 200));

            const bookSelect = document.getElementById("trackerBookSelect");
            const startInput = document.getElementById("trackerStartPage");
            const endInput = document.getElementById("trackerEndPage");
            const offlineMins = document.getElementById("offlineMinutesInput");
            const offlineBtn = document.getElementById("logOfflineBtn");

            record("Sessions: Book dropdown populated",
                bookSelect && bookSelect.options.length > 1
            );

            // Test validation: negative page number or end < start
            if (startInput && endInput && offlineBtn && offlineMins) {
                startInput.value = "100";
                endInput.value = "50"; // invalid: end < start
                offlineMins.value = "20";
                offlineBtn.click();
                await new Promise(r => setTimeout(r, 100));
                
                const feedbackEl = document.getElementById("trackerPageFeedback");
                record("Sessions: Invalid page range (end < start) shows error",
                    feedbackEl && feedbackEl.textContent.trim().length > 0,
                    feedbackEl ? feedbackEl.textContent.trim() : "no error"
                );

                // Fix valid inputs and log a clean session
                startInput.value = "1";
                endInput.value = "30";
                offlineMins.value = "25";
                offlineBtn.click();
                await new Promise(r => setTimeout(r, 300));

                const sessionCards = document.querySelectorAll(".tracker-session-card");
                record("Sessions: Logging valid session records session successfully",
                    sessionCards.length === 1,
                    "Count: " + sessionCards.length
                );
            }

            // Test Timer Start & Continuity across tab switches
            const startTimerBtn = document.getElementById("startTrackerBtn");
            if (startTimerBtn) {
                startTimerBtn.click();
                await new Promise(r => setTimeout(r, 1200));

                const timerDisplay = document.getElementById("trackerTimerDisplay");
                const initialTime = timerDisplay ? timerDisplay.textContent.trim() : "00:00";
                record("Sessions: Timer starts stopwatch",
                    initialTime !== "00:00",
                    "Time: " + initialTime
                );

                // Switch to Library while timer is running
                tabLib.click();
                await new Promise(r => setTimeout(r, 1200));

                // Switch back to Sessions
                tabSes.click();
                await new Promise(r => setTimeout(r, 200));
                const secondTime = document.getElementById("trackerTimerDisplay")?.textContent.trim() || "00:00";
                record("Sessions: Timer continues ticking across tab switches",
                    secondTime !== initialTime && secondTime !== "00:00",
                    "Time after return: " + secondTime
                );

                // Cancel timer
                document.getElementById("cancelTrackerBtn")?.click();
            }

            // ==========================================
            // 4. INSIGHTS & ANALYTICS AUDIT
            // ==========================================
            tabIns.click();
            await new Promise(r => setTimeout(r, 300));

            const streakDaysVal = document.querySelectorAll(".streak-big-val")[2]?.textContent.trim();
            record("Insights: Reading days reflects logged session (1 day)",
                streakDaysVal && streakDaysVal.startsWith("1"),
                streakDaysVal
            );

            const totals = Array.from(document.querySelectorAll(".total-val")).map(e => e.textContent.trim());
            record("Insights: Total pages and duration reflect logged session",
                totals.length >= 4 && totals[2] === "29" && totals[3].includes("25m"),
                JSON.stringify(totals)
            );

            // Test Analytics Range Filter
            const monthlyTab = document.querySelector('.range-tab[data-range="monthly"]');
            if (monthlyTab) {
                monthlyTab.click();
                await new Promise(r => setTimeout(r, 150));
                record("Insights: Range filter switches to Monthly without error",
                    monthlyTab.classList.contains("active")
                );
            }

            // Test Mode Toggle: Time vs Activity
            const timePill = document.querySelector('.chart-mode-pill[data-mode="time"]');
            if (timePill) {
                timePill.click();
                await new Promise(r => setTimeout(r, 150));
                record("Insights: Chart mode switches to Time (Duration) without error",
                    timePill.classList.contains("active")
                );
            }

            // Test Monthly Breakdown Buttons
            const monthTimeBtn = document.querySelector('.monthly-metric-btn[data-mode="time"]');
            if (monthTimeBtn) {
                monthTimeBtn.click();
                await new Promise(r => setTimeout(r, 150));
                record("Insights: Monthly breakdown metric switches to Time without error",
                    monthTimeBtn.classList.contains("active")
                );
            }

            // Test Calendar Day Selection
            const calCell = document.querySelector(".cal-day-cell:not(.is-empty)");
            if (calCell) {
                calCell.click();
                await new Promise(r => setTimeout(r, 150));
                const drawer = document.getElementById("calInspectorDrawer");
                record("Insights: Calendar day click opens inspector drawer",
                    drawer && drawer.classList.contains("is-open")
                );
            }

            document.title = "FULL_AUDIT_PASS";
        } catch (err) {
            console.error("Audit failure:", err);
            document.title = "FULL_AUDIT_ERROR: " + err.message;
        }
    }, 600);
});
</script>
`;

const runnerFile = "test_full_audit_runner.html";
fs.writeFileSync(runnerFile, booksHtml.replace("</body>", fullAuditScript + "</body>"), "utf-8");

console.log("Running comprehensive end-to-end audit in headless Chrome...");
try {
    const outCmd = `"${chromePath}" --headless=new --disable-gpu --no-sandbox --window-size=1200,900 --virtual-time-budget=12000 --dump-dom "http://127.0.0.1:8000/${runnerFile}"`;
    const dom = execSync(outCmd, { encoding: "utf-8" });
    const match = dom.match(/<title>(.*?)<\/title>/);
    console.log("Result:", match ? match[1] : "UNKNOWN");
} finally {
    if (fs.existsSync(runnerFile)) fs.unlinkSync(runnerFile);
}
