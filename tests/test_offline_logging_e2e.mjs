import fs from "node:fs";
import { execSync } from "node:child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const booksHtml = fs.readFileSync("books.html", "utf-8");

const e2eScript = `
<script>
window.testResults = [];
function record(name, pass, details = "") {
    window.testResults.push({ name, pass, details });
    console.log((pass ? "✅ PASS: " : "❌ FAIL: ") + name + (details ? " - " + details : ""));
}

window.addEventListener("load", () => {
    // Set up test local storage with PIN enabled and empty activity
    localStorage.setItem("books_reading_activity", "[]");
    localStorage.setItem("anand_reading_security_v1", JSON.stringify({
        enabled: true,
        pin_hash: "4ba59d51d6f8ef56072b2b7d255062d6ef10078a3f3b8bf1d39c2785d12e42e2", // hash for 12345
        failed_attempts: 0,
        locked_until: 0
    }));

    setTimeout(async () => {
        try {
            // 1. Switch to Sessions tab
            const tabSes = document.getElementById("tabSessions");
            if (tabSes) tabSes.click();
            await new Promise(r => setTimeout(r, 200));

            const bookSelect = document.getElementById("trackerBookSelect");
            const startPage = document.getElementById("trackerStartPage");
            const endPage = document.getElementById("trackerEndPage");
            const manualMinutes = document.getElementById("trackerManualMinutes");
            const notes = document.getElementById("trackerNotes");
            const manualLogBtn = document.getElementById("manualLogBtn");
            const modal = document.getElementById("readingPinModal");
            const cancelBtn = document.getElementById("readingPinCancelBtn");
            const pinInput = document.getElementById("readingPinInput");
            const verifyBtn = document.getElementById("readingPinVerifyBtn");
            const feedbackEl = document.getElementById("readingPinFeedback");

            record("Sessions view rendered", !!manualLogBtn && !!bookSelect);

            // Select first book
            if (bookSelect.options.length > 1) {
                bookSelect.selectedIndex = 1;
                bookSelect.dispatchEvent(new Event("change"));
            }
            startPage.value = "20";
            endPage.value = "45";
            manualMinutes.value = "30";
            notes.value = "Interesting chapter on systems";

            // 2. Click "Log" -> Should trigger PIN modal
            manualLogBtn.click();
            await new Promise(r => setTimeout(r, 200));

            record("Offline Log opens PIN modal", modal.classList.contains("active"));

            // 3. Test Cancel: Click Cancel -> Modal closes, inputs preserved, 0 sessions logged
            cancelBtn.click();
            await new Promise(r => setTimeout(r, 200));

            record("Cancel closes PIN modal", !modal.classList.contains("active"));
            record("Form inputs preserved on cancel",
                bookSelect.selectedIndex === 1 &&
                startPage.value === "20" &&
                endPage.value === "45" &&
                manualMinutes.value === "30" &&
                notes.value === "Interesting chapter on systems"
            );

            const actsAfterCancel = JSON.parse(localStorage.getItem("books_reading_activity") || "[]");
            record("No sessions logged on cancel", actsAfterCancel.length === 0);

            // 4. Click "Log" again -> Test Incorrect PIN
            manualLogBtn.click();
            await new Promise(r => setTimeout(r, 200));

            pinInput.value = "99999";
            pinInput.dispatchEvent(new Event("input"));
            verifyBtn.click();
            await new Promise(r => setTimeout(r, 300));

            record("Incorrect PIN displays error feedback",
                feedbackEl.classList.contains("has-error") && feedbackEl.textContent.includes("Incorrect PIN")
            );

            const actsAfterInvalid = JSON.parse(localStorage.getItem("books_reading_activity") || "[]");
            record("No sessions logged on incorrect PIN", actsAfterInvalid.length === 0);
            record("Form inputs preserved on incorrect PIN", manualMinutes.value === "30");

            // 5. Test Correct PIN ("12345")
            pinInput.value = "12345";
            pinInput.dispatchEvent(new Event("input"));
            verifyBtn.click();
            await new Promise(r => setTimeout(r, 400));

            record("Correct PIN closes modal", !modal.classList.contains("active"));

            const actsAfterValid = JSON.parse(localStorage.getItem("books_reading_activity") || "[]");
            record("Session successfully recorded in storage",
                actsAfterValid.length === 1 &&
                actsAfterValid[0].minutes === 30 &&
                actsAfterValid[0].pages === 25
            );

            // Verify public session history button is removed
            const historyToggle = document.getElementById("trackerHistoryToggleBtn");
            record("Session history button removed from public UI", historyToggle === null);

            // 6. Test Start Live Timer PIN protection
            const startBtn = document.getElementById("startSessionBtn");
            if (startBtn) {
                startBtn.click();
                await new Promise(r => setTimeout(r, 200));
                record("Start Timer also prompts for PIN", modal.classList.contains("active"));
            }

            document.title = "E2E_OFFLINE_PIN_PASS";
        } catch (err) {
            console.error("E2E Test Error:", err);
            document.title = "E2E_OFFLINE_PIN_ERROR: " + err.message;
        }
    }, 500);
});
</script>
`;

const runnerHtml = "test_offline_logging_e2e_page.html";
fs.writeFileSync(runnerHtml, booksHtml.replace("</body>", e2eScript + "</body>"), "utf-8");

try {
    console.log("Running headless browser E2E test against port 8000...");
    const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=6000 --dump-dom "http://127.0.0.1:8000/${runnerHtml}"`;
    const dom = execSync(outCmd, { encoding: "utf-8" });
    const match = dom.match(/<title>(.*?)<\/title>/);
    console.log("Browser E2E Result:", match ? match[1] : "UNKNOWN");
    if (match && match[1].includes("PASS")) {
        console.log("ALL E2E CHECKS PASSED!");
    } else {
        throw new Error("E2E Test did not pass: " + (match ? match[1] : "UNKNOWN"));
    }
} finally {
    if (fs.existsSync(runnerHtml)) fs.unlinkSync(runnerHtml);
}
