/* ==========================================
   DYNAMIC CONTENT LOADER (Cloudflare D1 Backend)
   Loads content added from the private admin page.
   Existing hard-coded content stays untouched.
========================================== */

(function () {
    const cfClient = window.cfClient;
    if (!cfClient) {
        console.warn("Cloudflare client not loaded.");
        return;
    }

    const escapeHtml = (value = "") => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const safeUrl = (value = "") => {
        try {
            const url = new URL(value, window.location.href);
            if (["http:", "https:"].includes(url.protocol)) return url.href;
        } catch (_) {}
        return "#";
    };

    async function loadBooks() {
        const target = document.querySelector("#dynamic-books");
        if (!target) return;

        try {
            const data = await cfClient.getRecords("books");
            if (!Array.isArray(data) || data.length === 0) return;

            target.innerHTML = data.map(book => `
                <div class="book dynamic-book" id="${escapeHtml(book.id)}" data-record-id="${escapeHtml(book.id)}">
                    <img src="${safeUrl(book.image_url)}" alt="${escapeHtml(book.title)}">
                    <div class="book-title-row">
                        <h3>${escapeHtml(book.title)}</h3>
                    </div>
                </div>
            `).join("");
        } catch (err) {
            console.warn("Books could not be loaded:", err);
        }
    }

    async function loadMovies() {
        const reviewsContainer = document.querySelector(".reviews");
        if (!reviewsContainer) return;

        try {
            const data = await cfClient.getRecords("movies");
            if (!Array.isArray(data)) return;

            // Remove any previously rendered dynamic movie cards to prevent duplicates
            reviewsContainer.querySelectorAll(".dynamic-movie").forEach(el => el.remove());

            // Also clean up any old #dynamic-movies placeholder element so it doesn't break grid layout
            const placeholder = document.getElementById("dynamic-movies");
            if (placeholder) placeholder.remove();

            const slugify = (t = "") => String(t)
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

            const moviesHtml = data.map(movie => {
                const rating = Math.max(0, Math.min(5, Number(movie.rating || 0)));
                const full = Math.floor(rating);
                const stars = "★".repeat(full) + "☆".repeat(5 - full);
                const slug = slugify(movie.title || `movie-${movie.id}`);
                const genres = (movie.genre || "").split(",").map(g => g.trim()).filter(Boolean);
                const genresHtml = genres.length > 0
                    ? `<div class="movie-genres">${genres.map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("")}</div>`
                    : "";

                return `
                    <article class="movie-card dynamic-movie" id="movie-${slug}" data-id="${slug}" data-record-id="${escapeHtml(movie.id)}" data-title="${escapeHtml(movie.title)}" data-year="${escapeHtml(movie.year || "")}" data-rating="${rating}" data-genre="${escapeHtml(movie.genre || "")}">
                        <div class="movie-poster-wrap">
                            <img src="${safeUrl(movie.image_url)}" alt="${escapeHtml(movie.title)}">
                            <div class="grid-card-overlay">
                                <span class="overlay-rating">${stars} ${rating}/5</span>
                                ${movie.year ? `<span class="overlay-year">${escapeHtml(movie.year)}</span>` : ""}
                            </div>
                        </div>
                        <div class="movie-info">
                            <div class="movie-header-row">
                                <h2>${escapeHtml(movie.title)} <span class="year">(${escapeHtml(movie.year || "")})</span></h2>
                                <button type="button" class="movie-share-btn" aria-label="Share ${escapeHtml(movie.title)}">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="18" cy="5" r="3"></circle>
                                        <circle cx="6" cy="12" r="3"></circle>
                                        <circle cx="18" cy="19" r="3"></circle>
                                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                    </svg>
                                    <span>Share</span>
                                </button>
                            </div>
                            <div class="movie-meta-row">
                                <div class="stars">${stars} <span>${rating}/5</span></div>
                                ${genresHtml}
                            </div>
                            <p>${escapeHtml(movie.review || "")}</p>
                        </div>
                    </article>
                `;
            }).join("");

            reviewsContainer.insertAdjacentHTML("beforeend", moviesHtml);

            if (window.refreshLetterboxdMovies) {
                window.refreshLetterboxdMovies();
            }
        } catch (err) {
            console.warn("Movies could not be loaded:", err);
        }
    }

    async function loadSongs() {
        const target = document.querySelector("#dynamic-songs");
        if (!target) return;

        try {
            const data = await cfClient.getRecords("songs");
            if (!Array.isArray(data) || data.length === 0) return;

            target.innerHTML = data.map(song => `
                <a href="${safeUrl(song.link)}" target="_blank" rel="noopener noreferrer" class="song-item dynamic-song" id="${escapeHtml(song.id)}" data-record-id="${escapeHtml(song.id)}">
                    🎵 ${escapeHtml(song.title)}
                </a>
            `).join("");
        } catch (err) {
            console.warn("Songs could not be loaded:", err);
        }
    }

    async function loadPinboard() {
        const target = document.querySelector("#dynamic-pinboard");
        if (!target) return;

        try {
            const data = await cfClient.getRecords("pinboard");
            if (!Array.isArray(data) || data.length === 0) return;

            target.innerHTML = data.map(item => {
                const caption = item.caption ? `<p class="dynamic-pin-caption">${escapeHtml(item.caption)}</p>` : "";
                if (item.media_type === "video") {
                    return `<div class="gallery-item video dynamic-pin" id="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}"><video controls preload="metadata" playsinline><source src="${safeUrl(item.media_url)}" type="video/mp4"></video>${caption}</div>`;
                }
                return `<div class="gallery-item dynamic-pin" id="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.media_url)}" alt="${escapeHtml(item.caption || "Pinboard item")}">${caption}</div>`;
            }).join("");
        } catch (err) {
            console.warn("Pinboard could not be loaded:", err);
        }
    }

    async function loadHobbies() {
        const stack = document.querySelector(".hobby-stack");
        if (!stack) return;

        try {
            const items = await cfClient.getRecords("hobbies");
            if (!Array.isArray(items) || items.length === 0) return;

            stack.querySelectorAll(".dynamic-hobby").forEach(el => el.remove());
            const rotationClasses = ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"];

            items.forEach((hobby, idx) => {
                if (!hobby || !hobby.id) return;
                const cardClass = rotationClasses[idx % rotationClasses.length];
                const card = document.createElement("div");
                card.className = `hobby-card dynamic-hobby ${cardClass}`;
                card.id = hobby.id;
                card.dataset.recordId = hobby.id;
                card.innerHTML = `
                    <img src="${safeUrl(hobby.image_url)}" alt="${escapeHtml(hobby.title)}">
                    <h2>${escapeHtml(hobby.title)}</h2>
                `;
                stack.insertBefore(card, stack.firstElementChild);
            });

            if (typeof window.updateStack === "function") {
                window.updateStack();
            }
        } catch (err) {
            console.warn("Hobbies could not be loaded:", err);
        }
    }

    /* ==========================================
       OLD / STATIC RECORDS OVERRIDES & DELETIONS
    ========================================== */

    const OLD_RECORDS_KEY = "anand_old_records_state";

    function applyStateToDOM(state) {
        if (!state) return;
        const deletedIds = Array.isArray(state.deletedIds) ? state.deletedIds : [];
        const overrides = (state.overrides && typeof state.overrides === "object") ? state.overrides : {};

        // Remove deleted items
        deletedIds.forEach(id => {
            if (!id) return;
            const el = document.getElementById(id) || document.querySelector(`[data-record-id="${id}"]`);
            if (el) {
                el.remove();
            }
        });

        // Apply edits / overrides
        Object.entries(overrides).forEach(([id, item]) => {
            if (!id || !item) return;
            const el = document.getElementById(id) || document.querySelector(`[data-record-id="${id}"]`);
            if (!el) return;

            // Title
            if (item.title) {
                const h = el.querySelector("h2, h3, h4");
                if (h) {
                    const yearSpan = h.querySelector(".year");
                    if (yearSpan) {
                        h.childNodes[0].nodeValue = item.title + " ";
                    } else {
                        h.textContent = item.title;
                    }
                }
                if (el.classList.contains("song-item")) {
                    el.innerHTML = `🎵 ${escapeHtml(item.title)}`;
                }
            }

            // Image
            if (item.image_url) {
                const img = el.querySelector("img");
                if (img) img.src = safeUrl(item.image_url);
            }

            // Media URL (Pinboard)
            if (item.media_url) {
                const videoSource = el.querySelector("video source");
                const video = el.querySelector("video");
                if (videoSource && video) {
                    videoSource.src = safeUrl(item.media_url);
                    video.load();
                } else {
                    const img = el.querySelector("img");
                    if (img) img.src = safeUrl(item.media_url);
                }
            }

            // Caption (Pinboard)
            if (item.caption !== undefined) {
                let p = el.querySelector(".dynamic-pin-caption, p");
                if (p) {
                    p.textContent = item.caption;
                } else if (item.caption) {
                    p = document.createElement("p");
                    p.className = "dynamic-pin-caption";
                    p.textContent = item.caption;
                    el.appendChild(p);
                }
            }

            // Link (Song, Album, Artist)
            if (item.link) {
                const a = el.tagName === "A" ? el : el.querySelector("a");
                if (a) a.href = safeUrl(item.link);
            }

            // Movie-specific properties
            if (item.year !== undefined && item.year !== null) {
                el.dataset.year = item.year;
                const yearSpan = el.querySelector(".year");
                if (yearSpan) yearSpan.textContent = `(${item.year})`;
                const overlayYear = el.querySelector(".overlay-year");
                if (overlayYear) overlayYear.textContent = item.year;
            }

            if (item.rating !== undefined && item.rating !== null) {
                const rating = Math.max(0, Math.min(5, Number(item.rating || 0)));
                const full = Math.floor(rating);
                const stars = "★".repeat(full) + "☆".repeat(5 - full);
                el.dataset.rating = rating;
                const starsEl = el.querySelector(".stars");
                if (starsEl) starsEl.innerHTML = `${stars} <span>${rating}/5</span>`;
                const overlayRating = el.querySelector(".overlay-rating");
                if (overlayRating) overlayRating.textContent = `${stars} ${rating}/5`;
            }

            if (item.genre) {
                el.dataset.genre = item.genre;
                const genresWrap = el.querySelector(".movie-genres");
                if (genresWrap) {
                    const genres = item.genre.split(",").map(g => g.trim()).filter(Boolean);
                    genresWrap.innerHTML = genres.map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("");
                }
            }

            if (item.review !== undefined && item.review !== null) {
                const p = el.querySelector(".movie-info > p");
                if (p) p.textContent = item.review;
            }
        });

        // Trigger updates for stack and movies if present
        if (typeof window.updateStack === "function") {
            window.updateStack();
        }
        if (typeof window.refreshLetterboxdMovies === "function") {
            window.refreshLetterboxdMovies();
        }
    }

    async function applyOldRecordsOverrides(syncRemote = true) {
        // 1. Instant local read from localStorage
        try {
            const raw = localStorage.getItem(OLD_RECORDS_KEY);
            if (raw) {
                applyStateToDOM(JSON.parse(raw));
            }
        } catch (e) {
            console.warn("Could not load local old records state:", e);
        }

        if (!syncRemote) return;

        // 2. Remote sync from Cloudflare D1 Backend
        try {
            const remoteState = await cfClient.getState();
            if (remoteState && typeof remoteState === "object") {
                applyStateToDOM(remoteState);
            }
        } catch (e) {
            // Offline or state not set yet
        }
    }

    async function loadAll() {
        // Fast synchronous check
        applyOldRecordsOverrides(false);

        await Promise.allSettled([
            loadBooks(),
            loadMovies(),
            loadSongs(),
            loadPinboard(),
            loadHobbies()
        ]);

        // Remote sync after dynamic content is in place
        await applyOldRecordsOverrides(true);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", loadAll);
    } else {
        loadAll();
    }
})();
