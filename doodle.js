/* ==============================================================
   DOODLE CORNER — INTERACTIVE DRAWING & COMMUNITY GALLERY ENGINE
   ============================================================== */

(() => {
    // -------------------------------------------------------------
    // 1. DOM Elements
    // -------------------------------------------------------------
    const canvas = document.getElementById("doodleCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Tool controls
    const toolBrush = document.getElementById("toolBrush");
    const toolEraser = document.getElementById("toolEraser");
    const colorSwatches = document.querySelectorAll(".color-swatch");
    const sizeButtons = document.querySelectorAll(".size-btn");
    const btnUndo = document.getElementById("btnUndo");
    const btnRedo = document.getElementById("btnRedo");
    const btnClear = document.getElementById("btnClear");

    // Clear Modal
    const clearModal = document.getElementById("clearConfirmModal");
    const cancelClearBtn = document.getElementById("cancelClearBtn");
    const confirmClearBtn = document.getElementById("confirmClearBtn");
    const clearModalBackdrop = document.getElementById("clearModalBackdrop");

    // Form inputs & Save
    const metaForm = document.getElementById("doodleMetaForm");
    const titleInput = document.getElementById("doodleTitle");
    const nicknameInput = document.getElementById("doodleNickname");
    const btnSaveDoodle = document.getElementById("btnSaveDoodle");
    const feedbackEl = document.getElementById("doodleFeedback");

    // Gallery & Lightbox
    const doodleGrid = document.getElementById("doodleGrid");
    const galleryCountBadge = document.getElementById("galleryCountBadge");
    const galleryEmpty = document.getElementById("galleryEmpty");
    const btnScrollToTop = document.getElementById("btnScrollToTop");

    const lightboxModal = document.getElementById("doodleLightbox");
    const lightboxImg = document.getElementById("lightboxImg");
    const lightboxTitle = document.getElementById("lightboxTitle");
    const lightboxAuthor = document.getElementById("lightboxAuthor");
    const lightboxDate = document.getElementById("lightboxDate");
    const lightboxCloseBtn = document.getElementById("lightboxCloseBtn");
    const lightboxBackdrop = document.getElementById("lightboxBackdrop");

    // -------------------------------------------------------------
    // 2. Canvas Resolution & High-DPI Setup
    // -------------------------------------------------------------
    const VIRTUAL_WIDTH = 1400;
    const VIRTUAL_HEIGHT = 1000;
    const CANVAS_BG = "#FFFFFF";

    canvas.width = VIRTUAL_WIDTH;
    canvas.height = VIRTUAL_HEIGHT;

    // Fill initial canvas with clean white background
    function fillBackground() {
        ctx.fillStyle = CANVAS_BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    fillBackground();

    // -------------------------------------------------------------
    // 3. Drawing State & History (Undo/Redo)
    // -------------------------------------------------------------
    let isDrawing = false;
    let currentMode = "brush"; // "brush" or "eraser"
    let currentColor = "#2B2926";
    let currentSize = 16; // internal coordinate brush radius (corresponds to ~8px display)
    let points = [];

    // History stack (ImageData)
    const MAX_HISTORY = 30;
    let undoStack = [];
    let redoStack = [];

    function saveState() {
        if (undoStack.length >= MAX_HISTORY) {
            undoStack.shift();
        }
        undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        redoStack = []; // clear redo on new stroke
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (btnUndo) btnUndo.disabled = undoStack.length <= 1;
        if (btnRedo) btnRedo.disabled = redoStack.length === 0;
    }

    function undo() {
        if (undoStack.length <= 1) return;
        const current = undoStack.pop();
        redoStack.push(current);
        const previous = undoStack[undoStack.length - 1];
        ctx.putImageData(previous, 0, 0);
        updateHistoryButtons();
    }

    function redo() {
        if (redoStack.length === 0) return;
        const next = redoStack.pop();
        undoStack.push(next);
        ctx.putImageData(next, 0, 0);
        updateHistoryButtons();
    }

    // Push initial blank state
    saveState();

    // -------------------------------------------------------------
    // 4. Coordinate Transformation
    // -------------------------------------------------------------
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    // -------------------------------------------------------------
    // 5. Drawing Engine (Smooth Midpoint Splines)
    // -------------------------------------------------------------
    function startStroke(coords) {
        isDrawing = true;
        points = [coords];

        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = currentSize;

        if (currentMode === "eraser") {
            ctx.strokeStyle = CANVAS_BG;
            ctx.fillStyle = CANVAS_BG;
        } else {
            ctx.strokeStyle = currentColor;
            ctx.fillStyle = currentColor;
        }

        // Draw an initial point for simple clicks/taps
        ctx.arc(coords.x, coords.y, currentSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    }

    function continueStroke(coords) {
        if (!isDrawing) return;
        points.push(coords);

        if (points.length < 3) {
            const b = points[0];
            ctx.beginPath();
            ctx.arc(b.x, b.y, currentSize / 2, 0, Math.PI * 2);
            ctx.fill();
            return;
        }

        // Quadratic curve interpolation
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        // Curve through the last two points
        const last = points.length - 2;
        ctx.quadraticCurveTo(
            points[last].x,
            points[last].y,
            points[last + 1].x,
            points[last + 1].y
        );

        ctx.stroke();
    }

    function endStroke() {
        if (!isDrawing) return;
        isDrawing = false;
        points = [];
        saveState();
    }

    // Pointer Event Listeners
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        e.preventDefault();
        if (canvas.setPointerCapture) {
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }
        startStroke(getCanvasCoords(e));
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        continueStroke(getCanvasCoords(e));
    });

    canvas.addEventListener("pointerup", (e) => {
        e.preventDefault();
        endStroke();
    });

    canvas.addEventListener("pointercancel", (e) => {
        e.preventDefault();
        endStroke();
    });

    // -------------------------------------------------------------
    // 6. Toolbar & Control Wiring
    // -------------------------------------------------------------
    // Mode Switching
    if (toolBrush) {
        toolBrush.addEventListener("click", () => {
            currentMode = "brush";
            toolBrush.classList.add("active");
            toolBrush.setAttribute("aria-pressed", "true");
            if (toolEraser) {
                toolEraser.classList.remove("active");
                toolEraser.setAttribute("aria-pressed", "false");
            }
        });
    }

    if (toolEraser) {
        toolEraser.addEventListener("click", () => {
            currentMode = "eraser";
            toolEraser.classList.add("active");
            toolEraser.setAttribute("aria-pressed", "true");
            if (toolBrush) {
                toolBrush.classList.remove("active");
                toolBrush.setAttribute("aria-pressed", "false");
            }
        });
    }

    // Color Swatches
    colorSwatches.forEach(swatch => {
        swatch.addEventListener("click", () => {
            colorSwatches.forEach(s => {
                s.classList.remove("active");
                s.setAttribute("aria-checked", "false");
            });
            swatch.classList.add("active");
            swatch.setAttribute("aria-checked", "true");
            currentColor = swatch.dataset.color || "#2B2926";

            // If in eraser mode, switch back to brush
            if (currentMode === "eraser") {
                currentMode = "brush";
                if (toolBrush) {
                    toolBrush.classList.add("active");
                    toolBrush.setAttribute("aria-pressed", "true");
                }
                if (toolEraser) {
                    toolEraser.classList.remove("active");
                    toolEraser.setAttribute("aria-pressed", "false");
                }
            }
        });
    });

    // Brush Sizes
    const sizeMap = { 3: 6, 8: 16, 16: 32, 28: 56 }; // Scaled for HiDPI 1400x1000
    sizeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            sizeButtons.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-checked", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-checked", "true");
            const rawSize = Number(btn.dataset.size) || 8;
            currentSize = sizeMap[rawSize] || (rawSize * 2);
        });
    });

    // History Buttons
    if (btnUndo) btnUndo.addEventListener("click", undo);
    if (btnRedo) btnRedo.addEventListener("click", redo);

    // Keyboard Shortcuts (Ctrl+Z / Ctrl+Y)
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
            e.preventDefault();
            redo();
        }
    });

    // Clear Canvas Modal Dialog
    const openClearModal = () => {
        if (!clearModal) return;
        clearModal.classList.add("active");
        clearModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    };

    const closeClearModal = () => {
        if (!clearModal) return;
        clearModal.classList.remove("active");
        clearModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    };

    if (btnClear) btnClear.addEventListener("click", openClearModal);
    if (cancelClearBtn) cancelClearBtn.addEventListener("click", closeClearModal);
    if (clearModalBackdrop) clearModalBackdrop.addEventListener("click", closeClearModal);

    if (confirmClearBtn) {
        confirmClearBtn.addEventListener("click", () => {
            fillBackground();
            undoStack = [];
            redoStack = [];
            saveState();
            closeClearModal();
            showFeedback("Canvas cleared. Start fresh!", "success");
        });
    }

    // -------------------------------------------------------------
    // 7. Save Drawing Submission
    // -------------------------------------------------------------
    function showFeedback(text, type = "success") {
        if (!feedbackEl) return;
        feedbackEl.textContent = text;
        feedbackEl.className = `doodle-feedback has-${type}`;
        if (type === "success") {
            setTimeout(() => {
                if (feedbackEl.textContent === text) {
                    feedbackEl.textContent = "";
                    feedbackEl.className = "doodle-feedback";
                }
            }, 6000);
        }
    }

    let isSubmitting = false;

    if (metaForm) {
        metaForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (isSubmitting) return;

            // Check if canvas is completely empty (only initial blank state)
            if (undoStack.length <= 1) {
                showFeedback("Draw something on the canvas before saving!", "error");
                return;
            }

            const title = titleInput ? titleInput.value.trim() : "";
            const nickname = nicknameInput ? nicknameInput.value.trim() : "";

            // Export canvas as optimized WebP or PNG data URL
            let dataUrl;
            try {
                dataUrl = canvas.toDataURL("image/webp", 0.88);
                if (!dataUrl.startsWith("data:image/webp")) {
                    dataUrl = canvas.toDataURL("image/png");
                }
            } catch (_) {
                dataUrl = canvas.toDataURL("image/png");
            }

            if (!dataUrl || dataUrl.length < 100) {
                showFeedback("Could not generate image from canvas.", "error");
                return;
            }

            isSubmitting = true;
            if (btnSaveDoodle) {
                btnSaveDoodle.disabled = true;
                btnSaveDoodle.querySelector(".save-text").textContent = "Saving artwork...";
            }

            try {
                if (window.cfClient && typeof window.cfClient.saveDoodle === "function") {
                    const res = await window.cfClient.saveDoodle({
                        title: title || "Untitled Doodle",
                        nickname: nickname || "Anonymous",
                        image: dataUrl
                    });

                    showFeedback("✨ Doodle saved successfully! It is now shared in the gallery below.", "success");

                    // Reset form inputs (preserve drawing on canvas so artist can continue if they want)
                    if (titleInput) titleInput.value = "";
                    if (nicknameInput) nicknameInput.value = "";

                    // Refresh public gallery
                    await loadCommunityGallery();
                } else {
                    showFeedback("Cloudflare client not initialized.", "error");
                }
            } catch (err) {
                console.error("Save doodle error:", err);
                showFeedback(err.message || "Failed to save doodle. Please try again.", "error");
            } finally {
                isSubmitting = false;
                if (btnSaveDoodle) {
                    btnSaveDoodle.disabled = false;
                    btnSaveDoodle.querySelector(".save-text").textContent = "Save Drawing";
                }
            }
        });
    }

    // -------------------------------------------------------------
    // 8. Public Community Gallery & Lightbox
    // -------------------------------------------------------------
    const escapeHtml = (str = "") => {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    };

    function formatDate(isoStr) {
        if (!isoStr) return "";
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        } catch (_) {
            return isoStr;
        }
    }

    async function loadCommunityGallery() {
        if (!doodleGrid) return;

        let doodles = [];
        try {
            if (window.cfClient && typeof window.cfClient.getDoodles === "function") {
                doodles = await window.cfClient.getDoodles(60, 0);
            }
        } catch (err) {
            console.warn("Could not load gallery doodles:", err);
        }

        if (galleryCountBadge) {
            galleryCountBadge.textContent = `${doodles.length} doodle${doodles.length === 1 ? "" : "s"}`;
        }

        if (doodles.length === 0) {
            doodleGrid.innerHTML = "";
            if (galleryEmpty) galleryEmpty.style.display = "block";
            return;
        }

        if (galleryEmpty) galleryEmpty.style.display = "none";

        doodleGrid.innerHTML = doodles.map(doodle => {
            const safeTitle = escapeHtml(doodle.title || "Untitled Doodle");
            const safeAuthor = escapeHtml(doodle.nickname || "Anonymous");
            const safeDate = formatDate(doodle.created_at);
            const imgSrc = doodle.image_data || "";

            return `
                <article class="doodle-card" data-id="${escapeHtml(doodle.id)}" data-title="${safeTitle}" data-author="${safeAuthor}" data-date="${safeDate}" data-img="${escapeHtml(imgSrc)}" tabindex="0" role="button" aria-label="View doodle ${safeTitle} by ${safeAuthor}">
                    <div class="doodle-card-img-wrap">
                        <img src="${imgSrc}" alt="${safeTitle} by ${safeAuthor}" loading="lazy">
                    </div>
                    <div class="doodle-card-body">
                        <h3 class="doodle-card-title">${safeTitle}</h3>
                        <div class="doodle-card-meta">
                            <span class="author-name">by ${safeAuthor}</span>
                            <span class="post-date">${safeDate}</span>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        // Wire click & enter to open Lightbox
        doodleGrid.querySelectorAll(".doodle-card").forEach(card => {
            const openCard = () => {
                const title = card.dataset.title;
                const author = card.dataset.author;
                const date = card.dataset.date;
                const src = card.dataset.img;

                if (lightboxImg) lightboxImg.src = src;
                if (lightboxTitle) lightboxTitle.textContent = title;
                if (lightboxAuthor) lightboxAuthor.textContent = `by ${author}`;
                if (lightboxDate) lightboxDate.textContent = date;

                if (lightboxModal) {
                    lightboxModal.classList.add("active");
                    lightboxModal.setAttribute("aria-hidden", "false");
                    document.body.style.overflow = "hidden";
                }
            };

            card.addEventListener("click", openCard);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCard();
                }
            });
        });
    }

    // Close Lightbox
    const closeLightbox = () => {
        if (!lightboxModal) return;
        lightboxModal.classList.remove("active");
        lightboxModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    };

    if (lightboxCloseBtn) lightboxCloseBtn.addEventListener("click", closeLightbox);
    if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeLightbox();
            closeClearModal();
        }
    });

    // Scroll to Top / Draw Button
    if (btnScrollToTop) {
        btnScrollToTop.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            if (canvas) canvas.focus();
        });
    }

    // Initial load
    loadCommunityGallery();
})();
