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

    const ORIGINAL_BOOK_ORDER = [
        "book-atomic-habits",
        "book-alchemist",
        "book-48-laws",
        "book-will-you-love-me",
        "book-it-ends-with-us",
        "book-strangers-again"
    ];

    const ORIGINAL_MOVIE_ORDER = [
        "movie-meiyazhagan",
        "movie-13-going-on-30",
        "movie-27-dresses",
        "movie-mersal",
        "movie-shes-the-man",
        "movie-kumbalangi-nights",
        "movie-home",
        "movie-premam"
    ];

    function compareDefaultBooks(a, b) {
        const idA = a.id || "";
        const idB = b.id || "";
        const isOrigA = ORIGINAL_BOOK_ORDER.includes(idA);
        const isOrigB = ORIGINAL_BOOK_ORDER.includes(idB);

        // Both are newly added: sort newest first by created_at
        if (!isOrigA && !isOrigB) {
            const timeA = new Date(a.created_at || 0).getTime();
            const timeB = new Date(b.created_at || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            return (a.title || "").localeCompare(b.title || "");
        }

        // Newly added comes BEFORE original books
        if (!isOrigA && isOrigB) return -1;
        if (isOrigA && !isOrigB) return 1;

        // Both are original: keep original catalog sequence
        return ORIGINAL_BOOK_ORDER.indexOf(idA) - ORIGINAL_BOOK_ORDER.indexOf(idB);
    }

    function compareDefaultMovies(a, b) {
        const idA = a.id || a.dataset?.recordId || "";
        const idB = b.id || b.dataset?.recordId || "";
        const isOrigA = ORIGINAL_MOVIE_ORDER.includes(idA);
        const isOrigB = ORIGINAL_MOVIE_ORDER.includes(idB);

        // Both are newly added: sort newest first by created_at
        if (!isOrigA && !isOrigB) {
            const timeA = new Date(a.created_at || a.dataset?.createdAt || 0).getTime();
            const timeB = new Date(b.created_at || b.dataset?.createdAt || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            const yearA = parseInt(a.year || a.dataset?.year || 0, 10);
            const yearB = parseInt(b.year || b.dataset?.year || 0, 10);
            return yearB - yearA;
        }

        // Newly added comes BEFORE original movies
        if (!isOrigA && isOrigB) return -1;
        if (isOrigA && !isOrigB) return 1;

        // Both are original: keep original catalog sequence
        return ORIGINAL_MOVIE_ORDER.indexOf(idA) - ORIGINAL_MOVIE_ORDER.indexOf(idB);
    }

    const ORIGINAL_ALBUM_ORDER = [
        "album-cinnamon-girl",
        "album-after-hours",
        "album-lost-my-mind",
        "album-nallaru-po",
        "album-kun-faya-kun"
    ];

    const ORIGINAL_ARTIST_ORDER = [
        "artist-lana-del-rey",
        "artist-ilaiyaraaja",
        "artist-anirudh",
        "artist-ar-rahman",
        "artist-eminem"
    ];

    const ORIGINAL_SONG_ORDER = [
        "song-born-to-die",
        "song-young-and-beautiful",
        "song-brooklyn-baby",
        "song-salvatore",
        "song-aksomaniac",
        "song-idhu-naal",
        "song-hosanna",
        "song-oru-paadhikadhavu-neeyadi",
        "song-sunn-raha-hai",
        "song-manjal-veyil"
    ];

    const ORIGINAL_HOBBY_ORDER = [
        "hobby-travel",
        "hobby-gym",
        "hobby-coffee",
        "hobby-walking",
        "hobby-coding",
        "hobby-football"
    ];

    function compareDefaultMusic(orderList) {
        return function (a, b) {
            const idA = a.id || "";
            const idB = b.id || "";
            const isOrigA = orderList.includes(idA);
            const isOrigB = orderList.includes(idB);

            if (!isOrigA && !isOrigB) {
                const timeA = new Date(a.created_at || 0).getTime();
                const timeB = new Date(b.created_at || 0).getTime();
                if (timeB !== timeA) return timeB - timeA;
                return (a.title || "").localeCompare(b.title || "");
            }

            if (!isOrigA && isOrigB) return -1;
            if (isOrigA && !isOrigB) return 1;

            return orderList.indexOf(idA) - orderList.indexOf(idB);
        };
    }

    function compareDefaultPins(a, b) {
        const idA = a.id || "";
        const idB = b.id || "";
        const matchA = idA.match(/^pin-(\d+)$/);
        const matchB = idB.match(/^pin-(\d+)$/);
        const isOrigA = Boolean(matchA);
        const isOrigB = Boolean(matchB);

        // Both newly added: newest first by created_at (at top of gallery)
        if (!isOrigA && !isOrigB) {
            const timeA = new Date(a.created_at || 0).getTime();
            const timeB = new Date(b.created_at || 0).getTime();
            if (timeB !== timeA) return timeB - timeA;
            return idA.localeCompare(idB);
        }

        // Newly added comes BEFORE original pins
        if (!isOrigA && isOrigB) return -1;
        if (isOrigA && !isOrigB) return 1;

        // Both original pins: sort by number pin-1, pin-2, ... pin-20
        const numA = parseInt(matchA[1], 10);
        const numB = parseInt(matchB[1], 10);
        return numA - numB;
    }

    function compareDefaultHobbies(a, b) {
        const idA = a.id || "";
        const idB = b.id || "";
        const isOrigA = ORIGINAL_HOBBY_ORDER.includes(idA);
        const isOrigB = ORIGINAL_HOBBY_ORDER.includes(idB);

        // In the scrapbook stack, cards are stacked from first child (bottom) to last child (top).
        // Newly added hobbies are placed at the end of the stack so they are on top!
        if (!isOrigA && !isOrigB) {
            const timeA = new Date(a.created_at || 0).getTime();
            const timeB = new Date(b.created_at || 0).getTime();
            if (timeA !== timeB) return timeA - timeB;
            return (a.title || "").localeCompare(b.title || "");
        }

        if (isOrigA && !isOrigB) return -1;
        if (!isOrigA && isOrigB) return 1;

        return ORIGINAL_HOBBY_ORDER.indexOf(idA) - ORIGINAL_HOBBY_ORDER.indexOf(idB);
    }

    async function loadBooks() {
        const booksRow = document.querySelector(".books-row");
        const dynamicTarget = document.querySelector("#dynamic-books");
        const container = booksRow || dynamicTarget;
        if (!container) return;

        try {
            const data = await cfClient.getRecords("books");
            if (!Array.isArray(data) || data.length === 0) return;

            // Newly added books appear at the top!
            data.sort(compareDefaultBooks);

            // Deduplicate books by ID and normalized title
            const seenBookIds = new Set();
            const seenBookTitles = new Set();
            const uniqueBooks = [];

            for (const book of data) {
                const normTitle = (book.title || "").trim().toLowerCase();
                const id = book.id || "";
                if (id && seenBookIds.has(id)) continue;
                if (normTitle && seenBookTitles.has(normTitle)) continue;
                if (id) seenBookIds.add(id);
                if (normTitle) seenBookTitles.add(normTitle);
                uniqueBooks.push(book);
            }

            const html = uniqueBooks.map(book => `
                <div class="book dynamic-book" id="${escapeHtml(book.id)}" data-record-id="${escapeHtml(book.id)}" data-created-at="${escapeHtml(book.created_at || "")}">
                    <img src="${safeUrl(book.image_url)}" alt="${escapeHtml(book.title)}">
                    <div class="book-title-row">
                        <h3>${escapeHtml(book.title)}</h3>
                    </div>
                </div>
            `).join("");

            if (booksRow) {
                booksRow.innerHTML = html;
            } else if (dynamicTarget) {
                dynamicTarget.innerHTML = html;
            }
        } catch (err) {
            console.warn("Books could not be loaded:", err);
        }
    }

    async function loadMovies() {
        const reviewsContainer = document.querySelector(".reviews");
        if (!reviewsContainer) return;

        try {
            const [data, state] = await Promise.all([
                cfClient.getRecords("movies"),
                cfClient.getState().catch(() => ({ overrides: {} }))
            ]);
            if (!Array.isArray(data) || data.length === 0) {
                const loader = document.getElementById("moviesLoading");
                if (loader) loader.textContent = "No movies logged yet.";
                return;
            }

            const overrides = (state && state.overrides) || {};
            for (const movie of data) {
                if (movie.id && overrides[movie.id]) {
                    Object.assign(movie, overrides[movie.id]);
                }
            }

            // Newly added movies appear at the top!
            data.sort(compareDefaultMovies);

            // Deduplicate movies by ID and normalized title
            const seenIds = new Set();
            const seenTitles = new Set();
            const uniqueMovies = [];

            for (const movie of data) {
                const normTitle = (movie.title || "").trim().toLowerCase();
                const id = movie.id || "";
                if (id && seenIds.has(id)) continue;
                if (normTitle && seenTitles.has(normTitle)) continue;
                if (id) seenIds.add(id);
                if (normTitle) seenTitles.add(normTitle);
                uniqueMovies.push(movie);
            }

            const slugify = (t = "") => String(t)
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

            const moviesHtml = uniqueMovies.map(movie => {
                const rating = Math.max(0, Math.min(5, Number(movie.rating || 0)));
                const full = Math.floor(rating);
                const stars = "★".repeat(full) + "☆".repeat(5 - full);
                const slug = slugify(movie.title || `movie-${movie.id}`);
                const genres = (movie.genre || "").split(",").map(g => g.trim()).filter(Boolean);
                const genresHtml = genres.length > 0
                    ? `<div class="movie-genres">${genres.map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join("")}</div>`
                    : "";

                const rawWatchDate = movie.watched_date || movie.created_at || "";
                let watchedMonth = "";
                let watchedYear = "";
                if (rawWatchDate) {
                    let str = String(rawWatchDate).trim();
                    if (str.includes(" ") && !str.includes("T")) str = str.replace(" ", "T");
                    const d = new Date(str);
                    if (!isNaN(d.getTime())) {
                        watchedMonth = String(d.getMonth() + 1);
                        watchedYear = String(d.getFullYear());
                    }
                }

                return `
                    <article class="movie-card dynamic-movie" id="movie-${slug}" data-id="${slug}" data-record-id="${escapeHtml(movie.id)}" data-created-at="${escapeHtml(movie.created_at || "")}" data-watched-date="${escapeHtml(rawWatchDate)}" data-watched-month="${watchedMonth}" data-watched-year="${watchedYear}" data-title="${escapeHtml(movie.title)}" data-year="${escapeHtml(movie.year || "")}" data-rating="${rating}" data-genre="${escapeHtml(movie.genre || "")}">
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

            reviewsContainer.innerHTML = moviesHtml;

            // Cleanly remove loading indicator
            const loader = document.getElementById("moviesLoading");
            if (loader) {
                loader.remove();
            }

            if (window.refreshLetterboxdMovies) {
                window.refreshLetterboxdMovies();
            }
        } catch (err) {
            console.warn("Movies could not be loaded:", err);
            const loader = document.getElementById("moviesLoading");
            if (loader) {
                loader.textContent = "Could not load movies at this time.";
            }
        }
    }

    async function loadSongs() {
        try {
            const data = await cfClient.getRecords("songs");
            if (!Array.isArray(data) || data.length === 0) return;

            // 1. Favorite Albums
            const albumsContainer = document.querySelector(".poster-row");
            if (albumsContainer) {
                const albums = data.filter(item => item.id.startsWith("album-") || (item.title && item.title.includes("(Album)")));
                albums.sort(compareDefaultMusic(ORIGINAL_ALBUM_ORDER));

                const seenAlbumIds = new Set();
                const uniqueAlbums = [];
                for (const album of albums) {
                    const id = album.id || "";
                    if (id && seenAlbumIds.has(id)) continue;
                    if (id) seenAlbumIds.add(id);
                    uniqueAlbums.push(album);
                }

                if (uniqueAlbums.length > 0) {
                    albumsContainer.innerHTML = uniqueAlbums.map(album => `
                        <div class="poster dynamic-album" id="${escapeHtml(album.id)}" data-record-id="${escapeHtml(album.id)}">
                            <a href="${safeUrl(album.link)}" target="_blank" rel="noopener noreferrer">
                                <img src="${safeUrl(album.image_url)}" alt="${escapeHtml(album.title.replace(/\s*\(Album\)/i, ''))}">
                            </a>
                        </div>
                    `).join("");
                }
            }

            // 2. Favorite Artists
            const artistsContainer = document.querySelector(".artist-grid");
            if (artistsContainer) {
                const artists = data.filter(item => item.id.startsWith("artist-") || (item.title && item.title.includes("(Artist)")));
                artists.sort(compareDefaultMusic(ORIGINAL_ARTIST_ORDER));

                const seenArtistIds = new Set();
                const uniqueArtists = [];
                for (const artist of artists) {
                    const id = artist.id || "";
                    if (id && seenArtistIds.has(id)) continue;
                    if (id) seenArtistIds.add(id);
                    uniqueArtists.push(artist);
                }

                if (uniqueArtists.length > 0) {
                    artistsContainer.innerHTML = uniqueArtists.map(artist => `
                        <a href="${safeUrl(artist.link)}" target="_blank" rel="noopener noreferrer" class="artist-card dynamic-artist" id="${escapeHtml(artist.id)}" data-record-id="${escapeHtml(artist.id)}">
                            <img src="${safeUrl(artist.image_url)}" alt="${escapeHtml(artist.title.replace(/\s*\(Artist\)/i, ''))}">
                            <h3>${escapeHtml(artist.title.replace(/\s*\(Artist\)/i, ''))}</h3>
                        </a>
                    `).join("");
                }
            }

            // 3. Favorite Songs
            const songsContainer = document.querySelector(".song-list");
            if (songsContainer) {
                const songs = data.filter(item => !item.id.startsWith("album-") && !item.id.startsWith("artist-") && !(item.title && (item.title.includes("(Album)") || item.title.includes("(Artist)"))));
                songs.sort(compareDefaultMusic(ORIGINAL_SONG_ORDER));

                const seenSongIds = new Set();
                const uniqueSongs = [];
                for (const song of songs) {
                    const id = song.id || "";
                    if (id && seenSongIds.has(id)) continue;
                    if (id) seenSongIds.add(id);
                    uniqueSongs.push(song);
                }

                if (uniqueSongs.length > 0) {
                    songsContainer.innerHTML = uniqueSongs.map(song => `
                        <a href="${safeUrl(song.link)}" target="_blank" rel="noopener noreferrer" class="song-item dynamic-song" id="${escapeHtml(song.id)}" data-record-id="${escapeHtml(song.id)}">
                            🎵 ${escapeHtml(song.title.replace(/^🎵\s*/, ''))}
                        </a>
                    `).join("");
                }
            }
        } catch (err) {
            console.warn("Music could not be loaded:", err);
        }
    }

    async function loadPinboard() {
        const gallery = document.querySelector(".gallery");
        const dynamicPinboard = document.querySelector("#dynamic-pinboard");
        const container = gallery || dynamicPinboard;
        if (!container) return;

        try {
            const data = await cfClient.getRecords("pinboard");
            if (!Array.isArray(data) || data.length === 0) return;

            // Newly added pins appear at the top!
            data.sort(compareDefaultPins);

            const seenPinIds = new Set();
            const uniquePins = [];
            for (const pin of data) {
                const id = pin.id || "";
                if (id && seenPinIds.has(id)) continue;
                if (id) seenPinIds.add(id);
                uniquePins.push(pin);
            }

            const html = uniquePins.map(item => {
                const caption = item.caption ? `<p class="dynamic-pin-caption">${escapeHtml(item.caption)}</p>` : "";
                if (item.media_type === "video") {
                    return `<div class="gallery-item video dynamic-pin" id="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}"><video controls preload="metadata" playsinline><source src="${safeUrl(item.media_url)}" type="video/mp4"></video>${caption}</div>`;
                }
                return `<div class="gallery-item dynamic-pin" id="${escapeHtml(item.id)}" data-record-id="${escapeHtml(item.id)}"><img src="${safeUrl(item.media_url)}" alt="${escapeHtml(item.caption || "Pinboard item")}">${caption}</div>`;
            }).join("");

            if (gallery) {
                gallery.innerHTML = html;
            } else if (dynamicPinboard) {
                dynamicPinboard.innerHTML = html;
            }
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

            items.sort(compareDefaultHobbies);

            const seenHobbyIds = new Set();
            const uniqueHobbies = [];
            for (const hobby of items) {
                const id = hobby.id || "";
                if (id && seenHobbyIds.has(id)) continue;
                if (id) seenHobbyIds.add(id);
                uniqueHobbies.push(hobby);
            }

            stack.innerHTML = "";
            const total = uniqueHobbies.length;
            const rotationClasses = ["card-6", "card-5", "card-4", "card-3", "card-2", "card-1"];

            uniqueHobbies.forEach((hobby, idx) => {
                if (!hobby || !hobby.id) return;
                // Last item in stack is the top card and gets card-1
                const revIdx = total - 1 - idx;
                const cardClass = rotationClasses[Math.min(revIdx, rotationClasses.length - 1)] || "card-1";
                const card = document.createElement("div");
                card.className = `hobby-card dynamic-hobby ${cardClass}`;
                card.id = hobby.id;
                card.dataset.recordId = hobby.id;
                card.innerHTML = `
                    <img src="${safeUrl(hobby.image_url)}" alt="${escapeHtml(hobby.title)}">
                    <h2>${escapeHtml(hobby.title)}</h2>
                `;
                stack.appendChild(card);
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

        // Remove deleted items (safely protect items that have active overrides)
        deletedIds.forEach(id => {
            if (!id || overrides[id]) return;
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
