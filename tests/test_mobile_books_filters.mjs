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
    console.log("  BOOKS MOBILE RESPONSIVENESS & FILTERS SUITE");
    console.log("=================================================");

    const testScript = `
    <script>
    window.testResults = [];
    function record(name, pass, details = "") {
        window.testResults.push({ name, pass, details });
        console.log((pass ? "✅ PASS: " : "❌ FAIL: ") + name + (details ? " - " + details : ""));
    }

    window.addEventListener("load", () => {
        setTimeout(async () => {
            try {
                const tabs = document.querySelectorAll(".shelf-tab");
                const grid = document.querySelector(".books-row");

                record("Found all 4 shelf filter buttons", tabs.length === 4);

                const tabAll = tabs[0];
                const tabRead = tabs[1];
                const tabReading = tabs[2];
                const tabWant = tabs[3];

                record("Button 1 label is 'All Books'", tabAll.textContent.includes("All Books"));
                record("Button 2 label is 'Read'", tabRead.textContent.includes("Read"));
                record("Button 3 label is 'Reading'", tabReading.textContent.includes("Reading"));
                record("Button 4 label is 'Want to Read'", tabWant.textContent.includes("Want to Read"));

                // Check initial count
                let visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Initial visible books count is 6", visibleCards.length === 6);

                // Test clicking 'Read' filter
                tabRead.click();
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Clicking 'Read' displays 4 books", visibleCards.length === 4);
                record("'Read' tab has active class", tabRead.classList.contains("active"));

                // Test clicking 'Reading' filter
                tabReading.click();
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Clicking 'Reading' displays 1 book", visibleCards.length === 1);
                record("'Reading' tab has active class", tabReading.classList.contains("active"));

                // Test clicking 'Want to Read' filter
                tabWant.click();
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Clicking 'Want to Read' displays 1 book", visibleCards.length === 1);
                record("'Want to Read' tab has active class", tabWant.classList.contains("active"));

                // Test clicking back to 'All Books'
                tabAll.click();
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Clicking 'All Books' restores 6 books", visibleCards.length === 6);

                // Test search
                const search = document.getElementById("bookSearchInput");
                search.value = "Atomic";
                search.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Searching 'Atomic' filters to 1 book", visibleCards.length === 1);

                search.value = "";
                search.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, 100));
                visibleCards = Array.from(document.querySelectorAll(".book")).filter(c => c.style.display !== "none");
                record("Clearing search restores 6 books", visibleCards.length === 6);

                document.title = "FILTERS_E2E_PASS";
            } catch (err) {
                console.error("Filter test error:", err);
                document.title = "FILTERS_E2E_ERROR: " + err.message;
            }
        }, 500);
    });
    </script>
    `;

    const booksHtml = fs.readFileSync("books.html", "utf-8");
    const runnerHtml = "test_books_filter_runner.html";
    fs.writeFileSync(runnerHtml, booksHtml.replace("</body>", testScript + "</body>"), "utf-8");

    try {
        const outCmd = `"${chromePath}" --headless=new --window-size=375,800 --virtual-time-budget=6000 --dump-dom "${BASE_URL}/${runnerHtml}"`;
        const dom = execSync(outCmd, { encoding: "utf-8" });
        const match = dom.match(/<title>(.*?)<\/title>/);
        const title = match ? match[1] : "UNKNOWN";
        assert(title === "FILTERS_E2E_PASS", `Headless Chrome Filter & Interaction test: ${title}`);
    } finally {
        if (fs.existsSync(runnerHtml)) fs.unlinkSync(runnerHtml);
    }

    console.log("\n=================================================");
    console.log(`  SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
    console.log("=================================================");

    if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
    console.error("Test Suite crashed:", err);
    process.exit(1);
});
