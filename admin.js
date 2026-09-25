/* ==========================================
   PRIVATE ADMIN DASHBOARD (Cloudflare D1 & Media Storage)
========================================== */

(() => {
    const cfClient = window.cfClient;

    const loginView = document.getElementById("loginView");
    const dashboardView = document.getElementById("dashboardView");
    const loginForm = document.getElementById("loginForm");
    const loginMessage = document.getElementById("loginMessage");

    const creationPanel = document.getElementById("creationPanel");
    const recentSection = document.getElementById("recentSection");
    const form = document.getElementById("contentForm");
    const formMessage = document.getElementById("formMessage");
    const adminList = document.getElementById("adminList");

    const mediaFile = document.getElementById("mediaFile");
    const mediaLabel = document.getElementById("mediaLabel");
    const title = document.getElementById("title");
    const titleLabel = document.getElementById("titleLabel");
    const bookFields = document.getElementById("bookFields");
    const movieFields = document.getElementById("movieFields");
    const songFields = document.getElementById("songFields");
    const pinFields = document.getElementById("pinFields");
    const commonTitleField = document.getElementById("commonTitleField");

    // Old Records Tab Elements
    const oldRecordsView = document.getElementById("oldRecordsView");
    const oldRecordsCount = document.getElementById("oldRecordsCount");
    const oldRecordsSearch = document.getElementById("oldRecordsSearch");
    const oldRecordsFilterPills = document.getElementById("oldRecordsFilterPills");
    const oldRecordsLoading = document.getElementById("oldRecordsLoading");
    const oldRecordsList = document.getElementById("oldRecordsList");

    // Edit Modal Elements
    const editRecordModal = document.getElementById("editRecordModal");
    const editModalBackdrop = document.getElementById("editModalBackdrop");
    const editModalClose = document.getElementById("editModalClose");
    const editModalTitle = document.getElementById("editModalTitle");
    const editModalBadge = document.getElementById("editModalBadge");
    const editRecordForm = document.getElementById("editRecordForm");
    const editRecordId = document.getElementById("editRecordId");
    const editRecordCategory = document.getElementById("editRecordCategory");
    const editRecordSource = document.getElementById("editRecordSource");
    const editRecordTable = document.getElementById("editRecordTable");
    const editTitle = document.getElementById("editTitle");
    const editBookFields = document.getElementById("editBookFields");
    const editBookStatus = document.getElementById("editBookStatus");
    const editMovieFields = document.getElementById("editMovieFields");
    const editMovieYear = document.getElementById("editMovieYear");
    const editMovieGenre = document.getElementById("editMovieGenre");
    const editMovieRating = document.getElementById("editMovieRating");
    const editMovieReview = document.getElementById("editMovieReview");
    const editMusicFields = document.getElementById("editMusicFields");
    const editMusicLink = document.getElementById("editMusicLink");
    const editPinFields = document.getElementById("editPinFields");
    const editPinCaption = document.getElementById("editPinCaption");
    const editMediaField = document.getElementById("editMediaField");
    const editMediaLabel = document.getElementById("editMediaLabel");
    const editMediaPreviewImg = document.getElementById("editMediaPreviewImg");
    const editMediaPreviewVideo = document.getElementById("editMediaPreviewVideo");
    const editMediaFileInput = document.getElementById("editMediaFileInput");
    const editMediaUrlInput = document.getElementById("editMediaUrlInput");
    const editCancelBtn = document.getElementById("editCancelBtn");
    const editFormMessage = document.getElementById("editFormMessage");

    if (!cfClient) {
        if (loginMessage) loginMessage.textContent = "Cloudflare client library not loaded.";
        return;
    }

    let currentType = "book";
    let selectedOldRecordCategory = "all";
    let allRecordsCache = [];

    /* ==========================================
       STATIC RECORDS CATALOG (MIGRATED TO D1)
    ========================================== */
    const STATIC_RECORDS = [];

    /* ==========================================
       ESCAPE HTML & SAFE URL
    ========================================== */
    const escapeHtml = (value = "") => {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    };

    /* ==========================================
       MESSAGE
    ========================================== */
    function setMessage(element, text, good = false) {
        if (!element) return;
        element.textContent = text;
        element.style.color = good ? "#47734D" : "#8A2E2E";
    }

    /* ==========================================
       SHOW LOGIN / DASHBOARD
    ========================================== */
    function showState() {
        if (cfClient.isLoggedIn()) {
            loginView.classList.add("admin-hidden");
            dashboardView.classList.remove("admin-hidden");
            loadAdminList();
            if (currentType === "old_records") {
                loadOldRecords();
            }
        } else {
            loginView.classList.remove("admin-hidden");
            dashboardView.classList.add("admin-hidden");
        }
    }

    /* ==========================================
       LOGIN
    ========================================== */
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(loginMessage, "Logging in...", true);

        try {
            const email = document.getElementById("loginEmail").value.trim();
            const password = document.getElementById("loginPassword").value;
            await cfClient.login(email, password);
            loginForm.reset();
            showState();
        } catch (error) {
            setMessage(loginMessage, error.message || "Invalid email or password");
        }
    });

    /* ==========================================
       LOGOUT
    ========================================== */
    document.getElementById("logoutBtn").addEventListener("click", () => {
        cfClient.logout();
        showState();
    });

    /* ==========================================
       TAB SWITCHING
    ========================================== */
    document.querySelectorAll(".admin-tabs button[data-type]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".admin-tabs button[data-type]").forEach(b => b.classList.remove("active"));
            button.classList.add("active");
            currentType = button.dataset.type;

            if (currentType === "old_records") {
                creationPanel.classList.add("admin-hidden");
                recentSection.classList.add("admin-hidden");
                oldRecordsView.classList.remove("admin-hidden");
                loadOldRecords();
            } else {
                creationPanel.classList.remove("admin-hidden");
                recentSection.classList.remove("admin-hidden");
                oldRecordsView.classList.add("admin-hidden");
                updateForm();
            }
        });
    });

    /* ==========================================
       UPDATE CREATION FORM
    ========================================== */
    function updateForm() {
        bookFields.classList.toggle("admin-hidden", currentType !== "book");
        movieFields.classList.toggle("admin-hidden", currentType !== "movie");
        songFields.classList.toggle("admin-hidden", currentType !== "song");
        pinFields.classList.toggle("admin-hidden", currentType !== "pinboard");
        commonTitleField.classList.toggle("admin-hidden", currentType === "pinboard");

        if (currentType === "hobby") {
            titleLabel.textContent = "Hobby name";
            title.placeholder = "e.g. Photography, Gym, Cooking, Football...";
            mediaLabel.textContent = "Photo / Image";
            mediaFile.required = true;
            mediaFile.accept = "image/*";
        } else if (currentType === "movie") {
            titleLabel.textContent = "Title";
            title.placeholder = "";
            mediaLabel.textContent = "Poster";
            mediaFile.required = true;
            mediaFile.accept = "image/*";
        } else if (currentType === "song") {
            titleLabel.textContent = "Title";
            title.placeholder = "";
            mediaLabel.textContent = "Artwork (optional)";
            mediaFile.required = false;
            mediaFile.accept = "image/*";
        } else if (currentType === "pinboard") {
            title.placeholder = "";
            mediaLabel.textContent = "Media";
            mediaFile.required = true;
            mediaFile.accept = document.getElementById("pinType").value === "video" ? "video/*" : "image/*";
        } else {
            // Book
            titleLabel.textContent = "Title";
            title.placeholder = "";
            mediaLabel.textContent = "Cover image";
            mediaFile.required = true;
            mediaFile.accept = "image/*";
        }

        title.required = currentType !== "pinboard";
        const songLink = document.getElementById("songLink");
        songLink.required = currentType === "song";
    }

    document.getElementById("pinType").addEventListener("change", updateForm);

    /* ==========================================
       UPLOAD IMAGE / VIDEO (Up to 5 GB via Cloudflare API)
    ========================================== */
    async function uploadMedia(file) {
        const res = await cfClient.uploadMedia(file);
        return res.publicUrl || res.url;
    }

    /* ==========================================
       ADD CONTENT (NEW RECORD)
    ========================================== */
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(formMessage, "Saving...", true);

        try {
            let imageUrl = "";
            if (mediaFile.files[0]) {
                imageUrl = await uploadMedia(mediaFile.files[0]);
            }

            if (currentType === "hobby") {
                await cfClient.addRecord("hobbies", {
                    title: title.value.trim(),
                    image_url: imageUrl
                });
                form.reset();
                updateForm();
                setMessage(formMessage, "Hobby added successfully! 🎮✨", true);
                loadAdminList();
                return;
            }

            let table;
            let row;

            if (currentType === "book") {
                table = "books";
                row = {
                    title: title.value.trim(),
                    status: document.getElementById("bookStatus").value,
                    image_url: imageUrl
                };
            } else if (currentType === "movie") {
                table = "movies";
                row = {
                    title: title.value.trim(),
                    year: Number(document.getElementById("movieYear").value) || null,
                    genre: document.getElementById("movieGenre") ? document.getElementById("movieGenre").value.trim() : "",
                    rating: Number(document.getElementById("movieRating").value) || 0,
                    review: document.getElementById("movieReview").value.trim(),
                    image_url: imageUrl
                };
            } else if (currentType === "song") {
                table = "songs";
                row = {
                    title: title.value.trim(),
                    link: document.getElementById("songLink").value.trim(),
                    image_url: imageUrl || null
                };
            } else {
                table = "pinboard";
                row = {
                    media_type: document.getElementById("pinType").value,
                    media_url: imageUrl,
                    caption: document.getElementById("pinCaption").value.trim()
                };
            }

            const added = await cfClient.addRecord(table, row);

            const watchedInput = document.getElementById("movieWatchedDate");
            if (currentType === "movie" && watchedInput && watchedInput.value && added && added.id) {
                try {
                    const state = await cfClient.getState();
                    if (!state.overrides) state.overrides = {};
                    state.overrides[added.id] = { ...(state.overrides[added.id] || {}), watched_date: watchedInput.value };
                    await cfClient.saveState(state);
                } catch (_) {}
            }

            form.reset();
            updateForm();
            setMessage(formMessage, "Added successfully! ✨", true);
            loadAdminList();
        } catch (error) {
            console.error(error);
            setMessage(formMessage, error.message || "Something went wrong.");
        }
    });

    /* ==========================================
       LOAD RECENT ITEMS (BOTTOM OF DASHBOARD)
    ========================================== */
    async function loadAdminList() {
        const [books, movies, songs, pinboard, hobbies] = await Promise.all([
            cfClient.getRecords("books"),
            cfClient.getRecords("movies"),
            cfClient.getRecords("songs"),
            cfClient.getRecords("pinboard"),
            cfClient.getRecords("hobbies")
        ]);

        const groups = [
            ["books", "📚", books.slice(0, 6)],
            ["movies", "🎬", movies.slice(0, 6)],
            ["songs", "🎵", songs.slice(0, 6)],
            ["pinboard", "📌", pinboard.slice(0, 6)],
            ["hobbies", "🎮", hobbies.slice(0, 6)]
        ];

        adminList.innerHTML =
            groups
                .flatMap(([table, icon, items]) =>
                    items.map(item => `
                        <div class="admin-item">
                            <strong>
                                ${icon}
                                ${escapeHtml(item.title || item.caption || "Item")}
                            </strong>
                            <button data-delete-table="${table}" data-delete-id="${item.id}">
                                Delete
                            </button>
                        </div>
                    `)
                )
                .join("") ||
            `<p class="small-note">Nothing added yet.</p>`;

        adminList.querySelectorAll("button[data-delete-id]").forEach(button => {
            button.addEventListener("click", async () => {
                if (!confirm("Delete this item?")) return;

                try {
                    await cfClient.deleteRecord(button.dataset.deleteTable, button.dataset.deleteId);
                    loadAdminList();
                    if (currentType === "old_records") loadOldRecords();
                } catch (err) {
                    alert(err.message || "Failed to delete item.");
                }
            });
        });
    }

    /* ==========================================
       LOAD ALL RECORDS (100% DYNAMIC FROM D1)
    ========================================== */
    async function loadOldRecords() {
        oldRecordsLoading.style.display = "block";
        oldRecordsList.innerHTML = "";

        try {
            const [books, movies, songs, pinboard, hobbies, state] = await Promise.all([
                cfClient.getRecords("books"),
                cfClient.getRecords("movies"),
                cfClient.getRecords("songs"),
                cfClient.getRecords("pinboard"),
                cfClient.getRecords("hobbies"),
                cfClient.getState().catch(() => ({ overrides: {} }))
            ]);

            const overrides = (state && state.overrides) || {};
            const dynamicRecords = [];

            hobbies.forEach(h => {
                dynamicRecords.push({
                    id: h.id,
                    category: "hobby",
                    source: "dynamic",
                    table: "hobbies",
                    title: h.title || "Untitled Hobby",
                    image_url: h.image_url || "",
                    created_at: h.created_at
                });
            });

            books.forEach(row => {
                dynamicRecords.push({
                    id: row.id,
                    category: "book",
                    source: "dynamic",
                    table: "books",
                    title: row.title || "Untitled Book",
                    image_url: row.image_url || "",
                    status: row.status || "finished",
                    created_at: row.created_at
                });
            });

            movies.forEach(row => {
                const ov = overrides[row.id] || {};
                dynamicRecords.push({
                    id: row.id,
                    category: "movie",
                    source: "dynamic",
                    table: "movies",
                    title: ov.title || row.title || "Untitled Movie",
                    year: ov.year !== undefined ? ov.year : row.year,
                    genre: ov.genre !== undefined ? ov.genre : (row.genre || ""),
                    rating: ov.rating !== undefined ? ov.rating : row.rating,
                    review: ov.review !== undefined ? ov.review : (row.review || ""),
                    image_url: ov.image_url || row.image_url || "",
                    watched_date: ov.watched_date || row.watched_date || row.created_at || "",
                    created_at: row.created_at
                });
            });

            songs.forEach(row => {
                let subType = "song";
                if (row.id.startsWith("album-") || (row.title && row.title.includes("(Album)"))) {
                    subType = "album";
                } else if (row.id.startsWith("artist-") || (row.title && row.title.includes("(Artist)"))) {
                    subType = "artist";
                }

                dynamicRecords.push({
                    id: row.id,
                    category: "music",
                    source: "dynamic",
                    subType: subType,
                    table: "songs",
                    title: row.title || "Untitled Music Item",
                    link: row.link || "",
                    image_url: row.image_url || "",
                    created_at: row.created_at
                });
            });

            pinboard.forEach(row => {
                const isVideo = row.media_type === "video" || (row.media_url && row.media_url.endsWith(".mp4"));
                let pinTitle = row.caption ? `Pin: ${row.caption.slice(0, 24)}...` : `Pinboard ${isVideo ? "Video" : "Image"}`;
                if (row.id.startsWith("pin-")) {
                    const num = row.id.replace("pin-", "");
                    pinTitle = `Pin ${num}${isVideo ? " (Video)" : ""}${row.caption ? ` - ${row.caption.slice(0, 20)}` : ""}`;
                }

                dynamicRecords.push({
                    id: row.id,
                    category: "pinboard",
                    source: "dynamic",
                    table: "pinboard",
                    title: pinTitle,
                    caption: row.caption || "",
                    media_type: isVideo ? "video" : (row.media_type || "image"),
                    media_url: row.media_url || "",
                    image_url: !isVideo ? (row.media_url || "") : "",
                    created_at: row.created_at
                });
            });

            // Sort newest additions to the top
            dynamicRecords.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            // Deduplicate records by category and normalized title / ID
            const seenRecords = new Set();
            const uniqueRecords = [];
            for (const r of dynamicRecords) {
                const key = `${r.category}:${(r.title || r.caption || r.id).trim().toLowerCase()}`;
                if (!seenRecords.has(key) && !seenRecords.has(r.id)) {
                    seenRecords.add(key);
                    seenRecords.add(r.id);
                    uniqueRecords.push(r);
                }
            }

            allRecordsCache = uniqueRecords;
        } catch (err) {
            console.error("Failed to load records from D1:", err);
            oldRecordsList.innerHTML = `<p class="admin-message" style="text-align:center;">Failed to load records from database: ${escapeHtml(err.message || err)}</p>`;
        } finally {
            oldRecordsLoading.style.display = "none";
        }

        renderFilteredOldRecords();
    }

    /* ==========================================
       RENDER FILTERED OLD RECORDS
    ========================================== */
    function renderFilteredOldRecords() {
        const query = (oldRecordsSearch.value || "").trim().toLowerCase();

        const filtered = allRecordsCache.filter(item => {
            if (selectedOldRecordCategory !== "all" && item.category !== selectedOldRecordCategory) {
                return false;
            }

            if (query) {
                const t = (item.title || "").toLowerCase();
                const g = (item.genre || "").toLowerCase();
                const y = String(item.year || "");
                const c = (item.caption || "").toLowerCase();
                const r = (item.review || "").toLowerCase();
                const s = (item.status || "").toLowerCase();
                const st = (item.subType || "").toLowerCase();
                const combined = `${t} ${g} ${y} ${c} ${r} ${s} ${st}`;
                if (!combined.includes(query)) return false;
            }
            return true;
        });

        oldRecordsCount.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;

        if (filtered.length === 0) {
            oldRecordsList.innerHTML = `<p class="small-note" style="grid-column: 1/-1; text-align: center; padding: 25px;">No records match your criteria.</p>`;
            return;
        }

        const categoryIcons = {
            book: "📚",
            movie: "🎬",
            music: "🎵",
            pinboard: "📌",
            hobby: "🎮"
        };

        oldRecordsList.innerHTML = filtered.map(item => {
            const icon = categoryIcons[item.category] || "📄";
            const isVideo = item.media_type === "video" || (item.media_url && item.media_url.endsWith(".mp4"));
            const mediaSrc = item.image_url || item.media_url || "";

            let thumbHtml = "";
            if (isVideo) {
                thumbHtml = `<video class="old-record-thumbnail video-thumb" src="${escapeHtml(mediaSrc)}" muted playsinline></video>`;
            } else if (mediaSrc) {
                const isRound = item.subType === "artist";
                thumbHtml = `<img class="old-record-thumbnail ${isRound ? "square" : ""}" src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(item.title)}">`;
            } else {
                thumbHtml = `<div class="old-record-thumbnail" style="display:flex;align-items:center;justify-content:center;font-size:24px;">${icon}</div>`;
            }

            let metaHtml = "";
            if (item.category === "movie") {
                const stars = item.rating ? "★".repeat(Math.floor(item.rating)) : "";
                metaHtml = `
                    <span>${item.year ? `(${item.year})` : ""}</span>
                    ${item.rating ? `<span class="stars">${stars} ${item.rating}/5</span>` : ""}
                    ${item.genre ? `<div style="font-size: 10px; color: #555;">${escapeHtml(item.genre)}</div>` : ""}
                `;
            } else if (item.category === "book") {
                metaHtml = `<span style="text-transform: capitalize;">Status: ${escapeHtml(item.status || "Finished")}</span>`;
            } else if (item.category === "music") {
                metaHtml = `<span>${escapeHtml(item.subType ? item.subType.toUpperCase() : "SONG")}</span>`;
                if (item.link) {
                    metaHtml += ` · <a href="${escapeHtml(item.link)}" target="_blank" style="color: #2B2926; text-decoration: underline;">Link ↗</a>`;
                }
            } else if (item.category === "pinboard") {
                metaHtml = `<span>${escapeHtml(item.media_type || "image")}</span>`;
                if (item.caption) {
                    metaHtml += `<div style="font-size: 10px; font-style: italic; color: #555;">"${escapeHtml(item.caption.slice(0, 36))}..."</div>`;
                }
            } else if (item.category === "hobby") {
                metaHtml = `<span>Scrapbook Card</span>`;
            }

            return `
                <div class="old-record-card" data-record-id="${escapeHtml(item.id)}" data-record-category="${escapeHtml(item.category)}">
                    <div class="old-record-media-row">
                        ${thumbHtml}
                        <div class="old-record-info">
                            <div class="old-record-badges">
                                <span class="cat-tag">${icon} ${escapeHtml(item.category.toUpperCase())}</span>
                                <span class="src-tag ${item.source === "dynamic" ? "dynamic" : ""}">${item.source === "dynamic" ? "Dynamic" : "Original"}</span>
                            </div>
                            <h3 class="old-record-title">${escapeHtml(item.title)}</h3>
                            <div class="old-record-meta">${metaHtml}</div>
                        </div>
                    </div>
                    <div class="old-record-actions">
                        <button type="button" class="record-edit-btn" data-edit-id="${escapeHtml(item.id)}">✏️ Edit</button>
                        <button type="button" class="record-delete-btn" data-delete-id="${escapeHtml(item.id)}">🗑️ Delete</button>
                    </div>
                </div>
            `;
        }).join("");

        oldRecordsList.querySelectorAll(".record-edit-btn").forEach(btn => {
            btn.addEventListener("click", () => openEditModal(btn.dataset.editId));
        });

        oldRecordsList.querySelectorAll(".record-delete-btn").forEach(btn => {
            btn.addEventListener("click", () => deleteRecord(btn.dataset.deleteId));
        });
    }

    oldRecordsFilterPills.querySelectorAll(".filter-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            oldRecordsFilterPills.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            selectedOldRecordCategory = pill.dataset.category;
            renderFilteredOldRecords();
        });
    });

    oldRecordsSearch.addEventListener("input", renderFilteredOldRecords);

    /* ==========================================
       EDIT MODAL LOGIC
    ========================================== */
    function openEditModal(recordId) {
        const record = allRecordsCache.find(r => r.id === recordId);
        if (!record) return;

        setMessage(editFormMessage, "");
        editRecordId.value = record.id;
        editRecordCategory.value = record.category;
        editRecordSource.value = record.source;
        editRecordTable.value = record.table || "";

        const typeLabel = record.subType ? record.subType.toUpperCase() : record.category.toUpperCase();
        editModalBadge.textContent = typeLabel;
        editModalTitle.textContent = `Edit: ${record.title}`;

        editTitle.value = record.title || record.caption || "";

        editBookFields.classList.toggle("admin-hidden", record.category !== "book");
        editMovieFields.classList.toggle("admin-hidden", record.category !== "movie");
        editMusicFields.classList.toggle("admin-hidden", record.category !== "music");
        editPinFields.classList.toggle("admin-hidden", record.category !== "pinboard");

        if (record.category === "book") {
            editBookStatus.value = record.status || "finished";
        } else if (record.category === "movie") {
            editMovieYear.value = record.year || "";
            editMovieGenre.value = record.genre || "";
            editMovieRating.value = record.rating !== undefined ? record.rating : 5;
            editMovieReview.value = record.review || "";
            const editMovieWatchedDate = document.getElementById("editMovieWatchedDate");
            if (editMovieWatchedDate) {
                const rawDate = record.watched_date || record.created_at || "";
                editMovieWatchedDate.value = rawDate ? rawDate.slice(0, 10) : "";
            }
        } else if (record.category === "music") {
            editMusicLink.value = record.link || "";
        } else if (record.category === "pinboard") {
            editPinCaption.value = record.caption || "";
        }

        const isVideo = record.media_type === "video" || (record.media_url && record.media_url.endsWith(".mp4"));
        const mediaSrc = record.image_url || record.media_url || "";

        if (isVideo) {
            editMediaPreviewVideo.src = mediaSrc;
            editMediaPreviewVideo.style.display = "block";
            editMediaPreviewImg.style.display = "none";
        } else if (mediaSrc) {
            editMediaPreviewImg.src = mediaSrc;
            editMediaPreviewImg.style.display = "block";
            editMediaPreviewVideo.style.display = "none";
        } else {
            editMediaPreviewImg.style.display = "none";
            editMediaPreviewVideo.style.display = "none";
        }

        editMediaFileInput.value = "";
        editMediaUrlInput.value = mediaSrc || "";

        editRecordModal.classList.remove("admin-hidden");
    }

    function closeEditModal() {
        editRecordModal.classList.add("admin-hidden");
        editMediaPreviewVideo.pause();
    }

    editModalClose.addEventListener("click", closeEditModal);
    editModalBackdrop.addEventListener("click", closeEditModal);
    editCancelBtn.addEventListener("click", closeEditModal);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !editRecordModal.classList.contains("admin-hidden")) {
            closeEditModal();
        }
    });

    /* ==========================================
       SAVE EDITED RECORD
    ========================================== */
    editRecordForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        setMessage(editFormMessage, "Saving changes...", true);

        const id = editRecordId.value;
        const category = editRecordCategory.value;
        const source = editRecordSource.value;
        const table = editRecordTable.value;

        try {
            let newMediaUrl = "";
            if (editMediaFileInput.files[0]) {
                newMediaUrl = await uploadMedia(editMediaFileInput.files[0]);
            } else if (editMediaUrlInput.value.trim()) {
                newMediaUrl = editMediaUrlInput.value.trim();
            }

            const finalTitle = editTitle.value.trim();

            if (source === "static") {
                const state = await cfClient.getState();
                if (!state.overrides) state.overrides = {};

                const itemOverride = state.overrides[id] || {};
                itemOverride.title = finalTitle;

                if (newMediaUrl) {
                    if (category === "pinboard") {
                        itemOverride.media_url = newMediaUrl;
                    } else {
                        itemOverride.image_url = newMediaUrl;
                    }
                }

                if (category === "book") {
                    itemOverride.status = editBookStatus.value;
                } else if (category === "movie") {
                    itemOverride.year = Number(editMovieYear.value) || null;
                    itemOverride.genre = editMovieGenre.value.trim();
                    itemOverride.rating = Number(editMovieRating.value) || 0;
                    itemOverride.review = editMovieReview.value.trim();
                    const wDate = document.getElementById("editMovieWatchedDate")?.value;
                    if (wDate) itemOverride.watched_date = wDate;
                } else if (category === "music") {
                    itemOverride.link = editMusicLink.value.trim();
                } else if (category === "pinboard") {
                    itemOverride.caption = editPinCaption.value.trim();
                }

                state.overrides[id] = itemOverride;
                if (Array.isArray(state.deletedIds)) {
                    state.deletedIds = state.deletedIds.filter(dId => dId !== id);
                }
                await cfClient.saveState(state);
            } else {
                // Dynamic Record in D1 table
                const updateData = {};
                if (table === "books") {
                    updateData.title = finalTitle;
                    updateData.status = editBookStatus.value;
                    if (newMediaUrl) updateData.image_url = newMediaUrl;
                } else if (table === "movies") {
                    updateData.title = finalTitle;
                    updateData.year = Number(editMovieYear.value) || null;
                    updateData.genre = editMovieGenre.value.trim();
                    updateData.rating = Number(editMovieRating.value) || 0;
                    updateData.review = editMovieReview.value.trim();
                    if (newMediaUrl) updateData.image_url = newMediaUrl;

                    const wDate = document.getElementById("editMovieWatchedDate")?.value;
                    if (wDate) {
                        try {
                            const state = await cfClient.getState();
                            if (!state.overrides) state.overrides = {};
                            state.overrides[id] = { ...(state.overrides[id] || {}), watched_date: wDate };
                            await cfClient.saveState(state);
                        } catch (_) {}
                    }
                } else if (table === "songs") {
                    updateData.title = finalTitle;
                    updateData.link = editMusicLink.value.trim();
                    if (newMediaUrl) updateData.image_url = newMediaUrl;
                } else if (table === "pinboard") {
                    updateData.caption = editPinCaption.value.trim();
                    if (newMediaUrl) updateData.media_url = newMediaUrl;
                } else if (table === "hobbies") {
                    updateData.title = finalTitle;
                    if (newMediaUrl) updateData.image_url = newMediaUrl;
                }

                await cfClient.updateRecord(table, id, updateData);
            }

            setMessage(editFormMessage, "Changes saved successfully! ✨", true);
            setTimeout(() => {
                closeEditModal();
                loadOldRecords();
            }, 700);
        } catch (err) {
            console.error("Save error:", err);
            setMessage(editFormMessage, err.message || "Failed to save changes.");
        }
    });

    /* ==========================================
       DELETE RECORD
    ========================================== */
    async function deleteRecord(recordId) {
        const record = allRecordsCache.find(r => r.id === recordId);
        if (!record) return;

        const displayName = record.title || record.caption || "this item";
        if (!confirm(`Are you sure you want to delete "${displayName}"?\n\nThis will remove it from your website.`)) {
            return;
        }

        try {
            if (record.source === "static") {
                const state = await cfClient.getState();
                if (!state.deletedIds.includes(record.id)) {
                    state.deletedIds.push(record.id);
                }
                await cfClient.saveState(state);
            } else {
                await cfClient.deleteRecord(record.table, record.id);
            }

            loadOldRecords();
            loadAdminList();
        } catch (err) {
            console.error("Delete error:", err);
            alert("Error deleting record: " + (err.message || err));
        }
    }

    /* ==========================================
       INITIALIZE
    ========================================== */
    cfClient.onAuthStateChange(() => showState());
    updateForm();
    showState();
})();