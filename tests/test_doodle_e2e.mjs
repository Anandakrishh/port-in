import fs from "node:fs";
import { execSync } from "node:child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const doodleHtml = fs.readFileSync("doodle.html", "utf-8");

const e2eScript = `
<script>
window.testResults = [];
function record(name, pass, details = "") {
    window.testResults.push({ name, pass, details });
    console.log((pass ? "✅ PASS: " : "❌ FAIL: ") + name + (details ? " - " + details : ""));
}

window.addEventListener("load", () => {
    // Clear local storage cache
    localStorage.removeItem("doodles_local_cache");

    setTimeout(async () => {
        try {
            const canvas = document.getElementById("doodleCanvas");
            const toolBrush = document.getElementById("toolBrush");
            const toolEraser = document.getElementById("toolEraser");
            const btnUndo = document.getElementById("btnUndo");
            const btnRedo = document.getElementById("btnRedo");
            const btnClear = document.getElementById("btnClear");
            const clearModal = document.getElementById("clearConfirmModal");
            const cancelClearBtn = document.getElementById("cancelClearBtn");
            const confirmClearBtn = document.getElementById("confirmClearBtn");
            const titleInput = document.getElementById("doodleTitle");
            const nicknameInput = document.getElementById("doodleNickname");
            const saveBtn = document.getElementById("btnSaveDoodle");
            const feedback = document.getElementById("doodleFeedback");
            const grid = document.getElementById("doodleGrid");

            // 1. Check UI elements
            record("Canvas element exists", !!canvas);
            record("Toolbar controls exist", !!toolBrush && !!toolEraser && !!btnUndo && !!btnClear);

            // 2. Simulate Drawing Stroke
            const rect = canvas.getBoundingClientRect();
            const startX = rect.left + 50;
            const startY = rect.top + 50;
            const midX = rect.left + 120;
            const midY = rect.top + 90;
            const endX = rect.left + 200;
            const endY = rect.top + 140;

            canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: startX, clientY: startY, button: 0, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: midX, clientY: midY, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: endX, clientY: endY, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: endX, clientY: endY, bubbles: true }));
            await new Promise(r => setTimeout(r, 200));

            record("Undo button enabled after drawing", !btnUndo.disabled);

            // 3. Test Undo / Redo
            btnUndo.click();
            await new Promise(r => setTimeout(r, 100));
            record("Redo button enabled after undo", !btnRedo.disabled);

            btnRedo.click();
            await new Promise(r => setTimeout(r, 100));
            record("Redo restores stroke", !btnUndo.disabled);

            // 4. Draw a second stroke with lavender swatch
            const lavenderSwatch = document.querySelector('.color-swatch[data-color="#8B7BB5"]');
            if (lavenderSwatch) lavenderSwatch.click();

            canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: startX + 30, clientY: startY + 50, button: 0, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: endX + 30, clientY: endY + 50, bubbles: true }));
            canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: endX + 30, clientY: endY + 50, bubbles: true }));
            await new Promise(r => setTimeout(r, 200));

            // 5. Test Clear Confirmation Modal
            btnClear.click();
            await new Promise(r => setTimeout(r, 150));
            record("Clear button opens confirmation modal", clearModal.classList.contains("active"));

            // Cancel clear
            cancelClearBtn.click();
            await new Promise(r => setTimeout(r, 150));
            record("Cancel preserves drawing and closes modal", !clearModal.classList.contains("active") && !btnUndo.disabled);

            // 6. Save Drawing
            titleInput.value = "Robot in Paris";
            nicknameInput.value = "ArtistBot";
            saveBtn.click();
            await new Promise(r => setTimeout(r, 600));

            record("Save shows success feedback",
                feedback.classList.contains("has-success") && feedback.textContent.includes("saved successfully")
            );

            // 7. Community Gallery Updates
            const countBadge = document.getElementById("galleryCountBadge");
            const firstCard = grid.querySelector(".doodle-card");
            record("Gallery counter updated", countBadge && countBadge.textContent.includes("1"));
            record("Doodle card rendered in gallery",
                firstCard && firstCard.querySelector(".doodle-card-title").textContent.includes("Robot in Paris")
            );

            // 8. Test Lightbox
            firstCard.click();
            await new Promise(r => setTimeout(r, 150));
            const lightbox = document.getElementById("doodleLightbox");
            const lightboxTitle = document.getElementById("lightboxTitle");
            record("Clicking doodle card opens Lightbox",
                lightbox && lightbox.classList.contains("active") && lightboxTitle.textContent.includes("Robot in Paris")
            );

            // Close lightbox
            const lightboxClose = document.getElementById("lightboxCloseBtn");
            if (lightboxClose) lightboxClose.click();
            await new Promise(r => setTimeout(r, 150));
            record("Closing Lightbox hides modal", !lightbox.classList.contains("active"));

            document.title = "DOODLE_E2E_PASS";
        } catch (err) {
            console.error("Doodle E2E failure:", err);
            document.title = "DOODLE_E2E_ERROR: " + err.message;
        }
    }, 600);
});
</script>
`;

const runnerHtml = "test_doodle_e2e_runner.html";
fs.writeFileSync(runnerHtml, doodleHtml.replace("</body>", e2eScript + "</body>"), "utf-8");

try {
    console.log("Running Doodle Corner E2E test in headless Chrome...");
    const outCmd = `"${chromePath}" --headless=new --window-size=1200,900 --virtual-time-budget=8000 --dump-dom "http://127.0.0.1:8000/${runnerHtml}"`;
    const dom = execSync(outCmd, { encoding: "utf-8" });
    const match = dom.match(/<title>(.*?)<\/title>/);
    console.log("Result:", match ? match[1] : "UNKNOWN");
    if (match && match[1].includes("PASS")) {
        console.log("ALL DOODLE E2E TESTS PASSED!");
    } else {
        throw new Error("Doodle E2E did not pass: " + (match ? match[1] : "UNKNOWN"));
    }
} finally {
    if (fs.existsSync(runnerHtml)) fs.unlinkSync(runnerHtml);
}
