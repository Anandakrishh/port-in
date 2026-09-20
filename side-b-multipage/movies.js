/* ==========================================
   LETTERBOXD-STYLE MOVIES CONTROLLER
   - Filters: Year, Rating, Genre, Sort
   - View Modes: Detailed List & Poster Grid
   - Stats Strip: Total films, Avg rating, Top genre
   - Instagram Story Share & Deep-Link Spotlight
========================================== */

(function () {
    // Current filter and sort state
    const state = {
        year: "all",
        rating: "all",
        genre: "all",
        sort: "default", // default, rating-desc, rating-asc, year-desc, year-asc, title-asc
        view: "list"     // list, grid
    };

    // Helper: generate URL-friendly slug
    function slugify(text) {
        return String(text || "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    // Initialize all movie functionality
    function initMovies() {
        setupMovieCards();
        populateFilterDropdowns();
        setupDropdownListeners();
        setupViewToggle();
        setupShareSystem();
        updateStats();
        applyFiltersAndSort();
        handleInboundDeepLink();
    }

    // Ensure every movie card has proper attributes, id, and share button
    function setupMovieCards() {
        const cards = document.querySelectorAll(".movie-card");
        cards.forEach(card => {
            const titleEl = card.querySelector("h2");
            const title = card.dataset.title || (titleEl ? titleEl.childNodes[0].textContent.trim() : "Movie");
            const slug = card.dataset.id || slugify(title);
            card.dataset.id = slug;
            card.dataset.title = title;
            if (!card.id) card.id = "movie-" + slug;

            // Extract or ensure rating
            if (!card.dataset.rating) {
                const ratingSpan = card.querySelector(".stars span");
                if (ratingSpan) {
                    const match = ratingSpan.textContent.match(/([0-9.]+)/);
                    if (match) card.dataset.rating = match[1];
                }
            }

            // Extract or ensure year
            if (!card.dataset.year) {
                const yearSpan = card.querySelector(".year");
                if (yearSpan) {
                    const match = yearSpan.textContent.match(/([0-9]{4})/);
                    if (match) card.dataset.year = match[1];
                }
            }

            // Ensure share button exists
            if (!card.querySelector(".movie-share-btn")) {
                const shareBtn = document.createElement("button");
                shareBtn.type = "button";
                shareBtn.className = "movie-share-btn";
                shareBtn.setAttribute("aria-label", "Share this film");
                shareBtn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span>Share</span>
                `;
                shareBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openShareModal(card);
                });

                const info = card.querySelector(".movie-info");
                if (info) {
                    info.appendChild(shareBtn);
                } else {
                    card.appendChild(shareBtn);
                }
            }
        });
    }

    // Populate dropdown items based on movies currently in DOM
    function populateFilterDropdowns() {
        const cards = Array.from(document.querySelectorAll(".movie-card"));

        // Years & Decades
        const years = new Set();
        cards.forEach(c => {
            const y = c.dataset.year;
            if (y && !isNaN(y)) years.add(parseInt(y, 10));
        });
        const sortedYears = Array.from(years).sort((a, b) => b - a);

        const yearMenu = document.getElementById("filterYearMenu");
        if (yearMenu) {
            let html = `
                <div class="lb-dropdown-item active" data-filter="year" data-value="all">All Years</div>
                <div class="lb-dropdown-divider"></div>
            `;
            // Add decades
            const decades = new Set(sortedYears.map(y => Math.floor(y / 10) * 10));
            Array.from(decades).sort((a, b) => b - a).forEach(d => {
                html += `<div class="lb-dropdown-item" data-filter="year" data-value="decade-${d}">${d}s</div>`;
            });
            html += `<div class="lb-dropdown-divider"></div>`;
            sortedYears.forEach(y => {
                html += `<div class="lb-dropdown-item" data-filter="year" data-value="${y}">${y}</div>`;
            });
            yearMenu.innerHTML = html;
        }

        // Genres
        const genres = new Set();
        cards.forEach(c => {
            const gStr = c.dataset.genre || "";
            gStr.split(",").forEach(g => {
                const trimmed = g.trim();
                if (trimmed) genres.add(trimmed);
            });
        });
        const sortedGenres = Array.from(genres).sort();

        const genreMenu = document.getElementById("filterGenreMenu");
        if (genreMenu) {
            let html = `
                <div class="lb-dropdown-item active" data-filter="genre" data-value="all">All Genres</div>
                <div class="lb-dropdown-divider"></div>
            `;
            sortedGenres.forEach(g => {
                html += `<div class="lb-dropdown-item" data-filter="genre" data-value="${g.toLowerCase()}">${g}</div>`;
            });
            genreMenu.innerHTML = html;
        }
    }

    // Setup interactive dropdown menus
    function setupDropdownListeners() {
        const triggers = document.querySelectorAll(".lb-dropdown-trigger");

        triggers.forEach(trigger => {
            trigger.addEventListener("click", (e) => {
                e.stopPropagation();
                const parent = trigger.closest(".lb-dropdown");
                const isOpen = parent.classList.contains("open");
                closeAllDropdowns();
                if (!isOpen) {
                    parent.classList.add("open");
                }
            });
        });

        // Click outside closes dropdowns
        document.addEventListener("click", () => {
            closeAllDropdowns();
        });

        // Delegate item clicks inside dropdown menus
        document.addEventListener("click", (e) => {
            const item = e.target.closest(".lb-dropdown-item");
            if (!item) return;

            const filterType = item.dataset.filter;
            const value = item.dataset.value;
            if (!filterType) return;

            state[filterType] = value;

            // Update active styling in menu
            const menu = item.closest(".lb-dropdown-menu");
            if (menu) {
                menu.querySelectorAll(".lb-dropdown-item").forEach(el => el.classList.remove("active"));
                item.classList.add("active");
            }

            // Update button label text
            const dropdown = item.closest(".lb-dropdown");
            if (dropdown) {
                const labelSpan = dropdown.querySelector(".lb-label-value");
                if (labelSpan) {
                    labelSpan.textContent = value === "all" || value === "default" ? "" : item.textContent;
                }
                dropdown.classList.toggle("is-filtered", value !== "all" && value !== "default");
            }

            closeAllDropdowns();
            applyFiltersAndSort();
            updateActiveFiltersBar();
        });

        // Reset button listener
        const resetBtn = document.getElementById("lbResetFilters");
        if (resetBtn) {
            resetBtn.addEventListener("click", resetAllFilters);
        }
    }

    function closeAllDropdowns() {
        document.querySelectorAll(".lb-dropdown.open").forEach(d => d.classList.remove("open"));
    }

    // Reset filters
    function resetAllFilters() {
        state.year = "all";
        state.rating = "all";
        state.genre = "all";
        state.sort = "default";

        // Reset UI labels and active classes
        document.querySelectorAll(".lb-dropdown").forEach(d => {
            d.classList.remove("is-filtered");
            const labelSpan = d.querySelector(".lb-label-value");
            if (labelSpan) labelSpan.textContent = "";
        });

        document.querySelectorAll(".lb-dropdown-menu").forEach(menu => {
            menu.querySelectorAll(".lb-dropdown-item").forEach(item => {
                item.classList.toggle("active", item.dataset.value === "all" || item.dataset.value === "default");
            });
        });

        applyFiltersAndSort();
        updateActiveFiltersBar();
    }

    // Apply filtering and sorting to movie cards
    function applyFiltersAndSort() {
        const cards = Array.from(document.querySelectorAll(".movie-card"));
        let visibleCount = 0;

        cards.forEach(card => {
            const year = parseInt(card.dataset.year || "0", 10);
            const rating = parseFloat(card.dataset.rating || "0");
            const genres = (card.dataset.genre || "").toLowerCase();

            // Year filter
            let yearMatch = true;
            if (state.year !== "all") {
                if (state.year.startsWith("decade-")) {
                    const decade = parseInt(state.year.replace("decade-", ""), 10);
                    yearMatch = year >= decade && year < decade + 10;
                } else {
                    yearMatch = year === parseInt(state.year, 10);
                }
            }

            // Rating filter
            let ratingMatch = true;
            if (state.rating !== "all") {
                const minRating = parseFloat(state.rating);
                ratingMatch = rating >= minRating;
            }

            // Genre filter
            let genreMatch = true;
            if (state.genre !== "all") {
                genreMatch = genres.includes(state.genre);
            }

            const isVisible = yearMatch && ratingMatch && genreMatch;
            card.classList.toggle("is-hidden", !isVisible);
            if (isVisible) {
                card.style.removeProperty("display");
                visibleCount++;
            } else {
                card.style.setProperty("display", "none", "important");
            }
        });

        // Sorting visible cards
        sortCards();

        // Update result count display
        const countEl = document.getElementById("lbResultsCount");
        if (countEl) {
            countEl.textContent = `${visibleCount} film${visibleCount === 1 ? "" : "s"}`;
        }

        // Empty state message
        let noResultsEl = document.getElementById("lbNoResults");
        if (!noResultsEl) {
            noResultsEl = document.createElement("div");
            noResultsEl = document.createElement("div");
            noResultsEl.id = "lbNoResults";
            noResultsEl.className = "lb-no-results";
            noResultsEl.innerHTML = `
                <div class="lb-empty-box">
                    <p class="lb-empty-title">No matching films found</p>
                    <p class="lb-empty-sub">Try changing or clearing your filters to see more films.</p>
                    <button type="button" class="lb-empty-btn" id="lbEmptyReset">Clear all filters</button>
                </div>
            `;
            const reviewsContainer = document.querySelector(".reviews");
            if (reviewsContainer) reviewsContainer.after(noResultsEl);
            document.getElementById("lbEmptyReset")?.addEventListener("click", resetAllFilters);
        }
        noResultsEl.style.display = visibleCount === 0 ? "block" : "none";
    }

    // Sort visible cards inside container
    function sortCards() {
        if (state.sort === "default") return;

        const container = document.querySelector(".reviews");
        if (!container) return;

        const cards = Array.from(container.querySelectorAll(".movie-card"));
        cards.sort((a, b) => {
            const ratingA = parseFloat(a.dataset.rating || "0");
            const ratingB = parseFloat(b.dataset.rating || "0");
            const yearA = parseInt(a.dataset.year || "0", 10);
            const yearB = parseInt(b.dataset.year || "0", 10);
            const titleA = (a.dataset.title || "").toLowerCase();
            const titleB = (b.dataset.title || "").toLowerCase();

            switch (state.sort) {
                case "rating-desc":
                    return ratingB - ratingA;
                case "rating-asc":
                    return ratingA - ratingB;
                case "year-desc":
                    return yearB - yearA;
                case "year-asc":
                    return yearA - yearB;
                case "title-asc":
                    return titleA.localeCompare(titleB);
                default:
                    return 0;
            }
        });

        cards.forEach(card => container.appendChild(card));
    }

    // Update active filters bar pills
    function updateActiveFiltersBar() {
        const bar = document.getElementById("lbActiveBar");
        const container = document.getElementById("lbActivePills");
        if (!bar || !container) return;

        const activeList = [];

        if (state.year !== "all") {
            const label = state.year.startsWith("decade-") ? `${state.year.replace("decade-", "")}s` : state.year;
            activeList.push({ type: "year", label: `Year: ${label}` });
        }
        if (state.rating !== "all") {
            activeList.push({ type: "rating", label: `Rating: ${state.rating}★+` });
        }
        if (state.genre !== "all") {
            const cap = state.genre.charAt(0).toUpperCase() + state.genre.slice(1);
            activeList.push({ type: "genre", label: `Genre: ${cap}` });
        }
        if (state.sort !== "default") {
            const sortLabels = {
                "rating-desc": "Highest Rated",
                "rating-asc": "Lowest Rated",
                "year-desc": "Newest",
                "year-asc": "Oldest",
                "title-asc": "Title A-Z"
            };
            activeList.push({ type: "sort", label: `Sorted: ${sortLabels[state.sort] || state.sort}` });
        }

        if (activeList.length === 0) {
            bar.style.display = "none";
            container.innerHTML = "";
            return;
        }

        bar.style.display = "flex";
        container.innerHTML = activeList.map(item => `
            <span class="lb-active-pill" data-filter="${item.type}">
                ${item.label}
                <button type="button" aria-label="Remove filter" class="lb-pill-remove">×</button>
            </span>
        `).join("");

        container.querySelectorAll(".lb-pill-remove").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const pill = btn.closest(".lb-active-pill");
                const filter = pill.dataset.filter;
                if (filter === "sort") {
                    state.sort = "default";
                } else {
                    state[filter] = "all";
                }

                // Update dropdown menu
                const dropdown = document.querySelector(`[data-dropdown="${filter}"]`);
                if (dropdown) {
                    dropdown.classList.remove("is-filtered");
                    const labelSpan = dropdown.querySelector(".lb-label-value");
                    if (labelSpan) labelSpan.textContent = "";
                    dropdown.querySelectorAll(".lb-dropdown-item").forEach(item => {
                        item.classList.toggle("active", item.dataset.value === "all" || item.dataset.value === "default");
                    });
                }

                applyFiltersAndSort();
                updateActiveFiltersBar();
            });
        });
    }

    // View toggle: List view vs Letterboxd Poster Grid view
    function setupViewToggle() {
        const toggleButtons = document.querySelectorAll(".lb-view-btn");
        const reviewsContainer = document.querySelector(".reviews");

        // Restore view preference if stored
        try {
            const savedView = localStorage.getItem("lb_preferred_view");
            if (savedView === "grid" || savedView === "list") {
                state.view = savedView;
            }
        } catch (_) {}

        // Apply initial view state to buttons and container
        toggleButtons.forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
        if (reviewsContainer) {
            reviewsContainer.classList.toggle("grid-view", state.view === "grid");
        }

        toggleButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const view = btn.dataset.view;
                if (!view || view === state.view) return;

                state.view = view;
                try { localStorage.setItem("lb_preferred_view", view); } catch (_) {}
                toggleButtons.forEach(b => b.classList.toggle("active", b.dataset.view === view));

                if (reviewsContainer) {
                    reviewsContainer.classList.toggle("grid-view", view === "grid");
                }
            });
        });
    }

    // Letterboxd Stats strip computation
    function updateStats() {
        const cards = Array.from(document.querySelectorAll(".movie-card"));
        if (cards.length === 0) return;

        let totalRating = 0;
        let ratedCount = 0;
        const genreCounts = {};

        cards.forEach(c => {
            const r = parseFloat(c.dataset.rating || "0");
            if (r > 0) {
                totalRating += r;
                ratedCount++;
            }

            const gStr = c.dataset.genre || "";
            gStr.split(",").forEach(g => {
                const trimmed = g.trim();
                if (trimmed) {
                    genreCounts[trimmed] = (genreCounts[trimmed] || 0) + 1;
                }
            });
        });

        const totalFilmsEl = document.getElementById("lbStatTotalFilms");
        if (totalFilmsEl) totalFilmsEl.textContent = cards.length;

        const avgRatingEl = document.getElementById("lbStatAvgRating");
        if (avgRatingEl && ratedCount > 0) {
            const avg = (totalRating / ratedCount).toFixed(1);
            avgRatingEl.textContent = `${avg} ★`;
        }

        const topGenreEl = document.getElementById("lbStatTopGenre");
        if (topGenreEl) {
            let topG = "Cinema";
            let maxCount = 0;
            for (const [g, count] of Object.entries(genreCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    topG = g;
                }
            }
            topGenreEl.textContent = topG;
        }
    }

    // ==========================================
    // INSTAGRAM STORY SHARE & DEEP LINK SYSTEM
    // ==========================================

    function getMovieShareUrl(movieSlug) {
        // Build a clean URL with ?movie=slug without extra debug query params
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("movie", movieSlug);
        return url.href;
    }

    function setupShareSystem() {
        const modal = document.getElementById("movieShareModal");
        const backdrop = document.getElementById("movieShareBackdrop");
        const closeBtn = document.getElementById("movieShareClose");
        const copyBtn = document.getElementById("movieShareCopyBtn");
        const nativeBtn = document.getElementById("movieShareNativeBtn");

        // Global delegate: capture click on ANY .movie-share-btn (icon, text, or button)
        document.addEventListener("click", (e) => {
            const shareBtn = e.target.closest(".movie-share-btn");
            if (!shareBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const card = shareBtn.closest(".movie-card");
            if (card) {
                openShareModal(card);
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", closeShareModal);
        }
        if (backdrop) {
            backdrop.addEventListener("click", closeShareModal);
        }

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeShareModal();
        });

        if (copyBtn) {
            copyBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const input = document.getElementById("movieShareLinkInput");
                if (input && input.value) {
                    copyToClipboard(input.value);
                }
            });
        }

        if (nativeBtn) {
            nativeBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const input = document.getElementById("movieShareLinkInput");
                const title = nativeBtn.dataset.title || "Film recommendation";
                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: title,
                            text: `Check out my review of ${title}:`,
                            url: input.value
                        });
                        showToast("Shared successfully!");
                    } catch (_) {}
                } else {
                    copyToClipboard(input.value);
                }
            });
        }
    }

    function openShareModal(card) {
        const modal = document.getElementById("movieShareModal");
        if (!modal) return;

        const title = card.dataset.title || "Film";
        const year = card.dataset.year || "";
        const rating = card.dataset.rating || "";
        const slug = card.dataset.id || slugify(title);
        const reviewText = card.querySelector(".movie-info p")?.textContent?.trim() || "";
        const imgSrc = card.querySelector("img")?.src || "";

        const shareUrl = getMovieShareUrl(slug);

        // Update modal fields
        const linkInput = document.getElementById("movieShareLinkInput");
        if (linkInput) linkInput.value = shareUrl;

        const titleEl = document.getElementById("shareModalMovieTitle");
        if (titleEl) titleEl.textContent = `${title} ${year ? `(${year})` : ""}`;

        // Update preview story card
        const cardImg = document.getElementById("storyCardImg");
        if (cardImg) cardImg.src = imgSrc;

        const cardTitle = document.getElementById("storyCardTitle");
        if (cardTitle) cardTitle.textContent = title;

        const cardYear = document.getElementById("storyCardYear");
        if (cardYear) cardYear.textContent = year ? `(${year})` : "";

        const cardStars = document.getElementById("storyCardStars");
        if (cardStars) {
            const starsText = card.querySelector(".stars")?.childNodes[0]?.textContent?.trim() || "★★★★★";
            cardStars.textContent = starsText;
        }

        const cardReview = document.getElementById("storyCardReview");
        if (cardReview) {
            cardReview.textContent = reviewText.length > 120 ? reviewText.slice(0, 117) + "..." : reviewText;
        }

        const nativeBtn = document.getElementById("movieShareNativeBtn");
        if (nativeBtn) {
            nativeBtn.dataset.title = title;
            nativeBtn.style.display = navigator.share ? "inline-flex" : "none";
        }

        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function closeShareModal() {
        const modal = document.getElementById("movieShareModal");
        if (modal) {
            modal.classList.remove("active");
            document.body.style.overflow = "";
        }
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showToast("Link copied! Paste in your Instagram Story link sticker.");
            }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand("copy");
            showToast("Link copied! Paste in your Instagram Story link sticker.");
        } catch (err) {
            showToast("Could not copy link. Please copy it manually.");
        }
        document.body.removeChild(textArea);
    }

    function showToast(message) {
        let toast = document.getElementById("movieToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "movieToast";
            toast.className = "movie-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    // Inbound deep-link handler for clicks from Instagram Stories or direct URLs
    function handleInboundDeepLink() {
        const params = new URLSearchParams(window.location.search);
        let movieTarget = params.get("movie");

        if (!movieTarget && window.location.hash) {
            const hash = window.location.hash.replace("#", "");
            movieTarget = hash.startsWith("movie-") ? hash.replace("movie-", "") : hash;
        }

        if (!movieTarget) return;

        const targetCard = document.querySelector(`.movie-card[data-id="${movieTarget}"]`) ||
                           document.getElementById(`movie-${movieTarget}`);

        if (!targetCard) return;

        // If card was hidden by filters, reset filters so visitor can see it
        if (targetCard.style.display === "none" || targetCard.classList.contains("is-hidden")) {
            resetAllFilters();
        }

        // If in grid view, switch to list view so the visitor sees the full card & review
        if (state.view === "grid") {
            const listBtn = document.querySelector('.lb-view-btn[data-view="list"]');
            if (listBtn) listBtn.click();
        }

        // Smooth scroll to the target movie
        setTimeout(() => {
            targetCard.scrollIntoView({ behavior: "smooth", block: "center" });

            // Apply spotlight pulse highlight
            targetCard.classList.remove("letterboxd-glow");
            void targetCard.offsetWidth; // trigger reflow
            targetCard.classList.add("letterboxd-glow");

            setTimeout(() => {
                targetCard.classList.remove("letterboxd-glow");
            }, 3800);
        }, 350);
    }

    // Expose hook so content-loader.js can refresh when dynamic movies load from backend
    window.refreshLetterboxdMovies = function () {
        const reviewsContainer = document.querySelector(".reviews");
        if (reviewsContainer) {
            reviewsContainer.classList.toggle("grid-view", state.view === "grid");
        }
        setupMovieCards();
        populateFilterDropdowns();
        updateStats();
        applyFiltersAndSort();
        handleInboundDeepLink();
    };

    // Auto-init on DOMContentLoaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMovies);
    } else {
        initMovies();
    }
})();
