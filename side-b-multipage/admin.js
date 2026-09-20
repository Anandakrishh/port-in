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
       STATIC RECORDS CATALOG
    ========================================== */
    const STATIC_RECORDS = [
        // --- BOOKS ---
        { id: "book-atomic-habits", category: "book", source: "static", title: "Atomic Habits", image_url: "assets/books/atomic-habits.jpg", status: "finished" },
        { id: "book-alchemist", category: "book", source: "static", title: "The Alchemist", image_url: "assets/books/alchemist.jpg", status: "finished" },
        { id: "book-48-laws", category: "book", source: "static", title: "The 48 Laws of Power", image_url: "assets/books/The 48 Laws of Power.jpg", status: "finished" },
        { id: "book-will-you-love-me", category: "book", source: "static", title: "Will you love me?", image_url: "assets/books/1.jpg", status: "finished" },
        { id: "book-it-ends-with-us", category: "book", source: "static", title: "It Ends with us", image_url: "assets/books/It Ends with Us_ A Novel.jpg", status: "finished" },
        { id: "book-strangers-again", category: "book", source: "static", title: "Can we be Strangers again?", image_url: "assets/books/2.jpg", status: "finished" },

        // --- MOVIES ---
        { id: "movie-meiyazhagan", category: "movie", source: "static", title: "Meiyazhagan", year: 2024, rating: 5, genre: "Drama, Feel-good", review: "A movie that makes you smile, reflect, and miss the people who once made life beautiful. One of those rare films that quietly touches your heart.", image_url: "assets/posters/Meiyazhagan.jpg" },
        { id: "movie-13-going-on-30", category: "movie", source: "static", title: "13 going on 30", year: 2004, rating: 4.5, genre: "Comedy, Romance, Fantasy", review: "Lighthearted on the surface, but surprisingly meaningful underneath. 13 Going on 30 is the kind of movie that never loses its charm.", image_url: "assets/posters/13 going on 30.jpg" },
        { id: "movie-27-dresses", category: "movie", source: "static", title: "27 dresses", year: 2008, rating: 4.5, genre: "Romance, Comedy", review: "Light, entertaining, and full of feel-good moments. It reminds you that the best love stories begin when you stop living for everyone else.", image_url: "assets/posters/27 dresses.jpg" },
        { id: "movie-mersal", category: "movie", source: "static", title: "Mersal", year: 2017, rating: 4.5, genre: "Action, Thriller", review: "Packed with whistle-worthy moments, gripping twists, and unforgettable screen presence.", image_url: "assets/posters/Mersal.jpg" },
        { id: "movie-shes-the-man", category: "movie", source: "static", title: "she's the man", year: 2006, rating: 4, genre: "Comedy, Romance, Sports", review: "Funny, chaotic, and surprisingly heartfelt.", image_url: "assets/posters/she's the man.jpg" },
        { id: "movie-kumbalangi-nights", category: "movie", source: "static", title: "Kumbalangi nights", year: 2019, rating: 4, genre: "Drama, Family, Comedy", review: "Every character feels real, making it an unforgettable cinematic experience. Kumbalangi Nights stays with you long after it ends.", image_url: "assets/posters/k nigths.jpg" },
        { id: "movie-home", category: "movie", source: "static", title: "Home", year: 2021, rating: 4, genre: "Drama, Family, Comedy", review: "Beautifully written, deeply relatable, and effortlessly touching. Home is the kind of film that stays in your heart long after the credits roll.", image_url: "assets/posters/home.jpg" },
        { id: "movie-premam", category: "movie", source: "static", title: "Premam", year: 2015, rating: 5, genre: "Romance, Drama, Comedy", review: "Premam only gets better with every rewatch.", image_url: "assets/posters/Premam.jpg" },

        // --- MUSIC: ALBUMS ---
        { id: "album-cinnamon-girl", category: "music", source: "static", subType: "album", title: "Cinnamon Girl (Album)", image_url: "assets/music/Cinnamon girl.jpg", link: "https://open.spotify.com/track/2mdEsXPu8ZmkHRRtAdC09e" },
        { id: "album-after-hours", category: "music", source: "static", subType: "album", title: "After Hours (Album)", image_url: "assets/music/AFTER HOURS.jpg", link: "https://open.spotify.com/track/2p8IUWQDrpjuFltbdgLOag" },
        { id: "album-lost-my-mind", category: "music", source: "static", subType: "album", title: "Lost My Mind (Album)", image_url: "assets/music/f1.jpg", link: "https://open.spotify.com/artist/3aly4xJOy3LVznzvRIvFYC" },
        { id: "album-nallaru-po", category: "music", source: "static", subType: "album", title: "Nallaru Po (Album)", image_url: "assets/music/nallaru po.jpg", link: "https://open.spotify.com/album/7uxUvkZRoulYMf0xZXQoVL" },
        { id: "album-kun-faya-kun", category: "music", source: "static", subType: "album", title: "Kun Faya Kun (Album)", image_url: "assets/music/kun faya kun.jpg", link: "https://open.spotify.com/album/3RZxrS2dDZlbsYtMRM89v8" },

        // --- MUSIC: ARTISTS ---
        { id: "artist-lana-del-rey", category: "music", source: "static", subType: "artist", title: "Lana Del Rey (Artist)", image_url: "assets/artists/lana.jpg", link: "https://open.spotify.com/artist/00FQb4jTyendYWaN8pK0wa" },
        { id: "artist-ilaiyaraaja", category: "music", source: "static", subType: "artist", title: "ILAIYARAAJA (Artist)", image_url: "assets/artists/ILAYARAAJA.jpg", link: "https://open.spotify.com/artist/3m49WVMU4zCkaVEKb8kFW7" },
        { id: "artist-anirudh", category: "music", source: "static", subType: "artist", title: "Anirudh (Artist)", image_url: "assets/artists/anirudh.jpg", link: "https://open.spotify.com/artist/4zCH9qm4R2DADamUHMCa6O" },
        { id: "artist-ar-rahman", category: "music", source: "static", subType: "artist", title: "A. R. Rahman (Artist)", image_url: "assets/artists/AR Rahman.jpg", link: "https://open.spotify.com/artist/1mYsTxnqsietFxj1OgoGbG" },
        { id: "artist-eminem", category: "music", source: "static", subType: "artist", title: "Eminem (Artist)", image_url: "assets/artists/eminen.jpg", link: "https://open.spotify.com/artist/7dGJo4pcD2V6oG8kP0tJRR" },

        // --- MUSIC: SONGS ---
        { id: "song-born-to-die", category: "music", source: "static", subType: "song", title: "Born to Die", link: "https://open.spotify.com/track/4Ouhoi2lAhrLJKFzUqEzwl" },
        { id: "song-young-and-beautiful", category: "music", source: "static", subType: "song", title: "Young and Beautiful", link: "https://open.spotify.com/track/2nMeu6UenVvwUktBCpLMK9" },
        { id: "song-brooklyn-baby", category: "music", source: "static", subType: "song", title: "Brooklyn Baby", link: "https://open.spotify.com/track/1NZs6n6hl8UuMaX0UC0YTz" },
        { id: "song-salvatore", category: "music", source: "static", subType: "song", title: "Salvatore", link: "https://open.spotify.com/track/21qg0IBZf8R12qHd9A3AA4" },
        { id: "song-aksomaniac", category: "music", source: "static", subType: "song", title: "Aksomaniac", link: "https://open.spotify.com/track/0Dt5EqEckM8jcfMYEdlx2Z" },
        { id: "song-idhu-naal", category: "music", source: "static", subType: "song", title: "Idhu Naal", link: "https://open.spotify.com/track/1wdk6oWXgTJzFiqSXO22tb" },
        { id: "song-hosanna", category: "music", source: "static", subType: "song", title: "Hosanna", link: "https://open.spotify.com/track/5NChQ2tXB9q9D8kdkLTWOL" },
        { id: "song-oru-paadhikadhavu-neeyadi", category: "music", source: "static", subType: "song", title: "Oru Paadhikadhavu Neeyadi", link: "https://open.spotify.com/track/6dcsOnOSmg2P30jyHS2TR2" },
        { id: "song-sunn-raha-hai", category: "music", source: "static", subType: "song", title: "Sunn Raha Hai", link: "https://open.spotify.com/track/5PvwPy5eRO8BPwpRzCHK3D" },
        { id: "song-manjal-veyil", category: "music", source: "static", subType: "song", title: "Manjal Veyil", link: "https://open.spotify.com/track/1HNSUQPFhmGDJyHxyIsYXG" },

        // --- HOBBIES ---
        { id: "hobby-travel", category: "hobby", source: "static", title: "Travel", image_url: "assets/hobbies/travel.jpg" },
        { id: "hobby-gym", category: "hobby", source: "static", title: "Gym", image_url: "assets/hobbies/gym.jpg" },
        { id: "hobby-coffee", category: "hobby", source: "static", title: "Coffee", image_url: "assets/hobbies/coffee.jpg" },
        { id: "hobby-walking", category: "hobby", source: "static", title: "A Walk", image_url: "assets/hobbies/walking.jpg" },
        { id: "hobby-coding", category: "hobby", source: "static", title: "Coding", image_url: "assets/hobbies/coding.jpg" },
        { id: "hobby-football", category: "hobby", source: "static", title: "Football", image_url: "assets/hobbies/football.jpg" },

        // --- PINBOARD ---
        { id: "pin-1", category: "pinboard", source: "static", title: "Pin 1 (Video)", media_url: "assets/thoughts/1v.mp4", media_type: "video" },
        { id: "pin-2", category: "pinboard", source: "static", title: "Pin 2", media_url: "assets/thoughts/2.jpeg", media_type: "image" },
        { id: "pin-3", category: "pinboard", source: "static", title: "Pin 3", media_url: "assets/thoughts/3.jpg", media_type: "image" },
        { id: "pin-4", category: "pinboard", source: "static", title: "Pin 4", media_url: "assets/thoughts/4.jpg", media_type: "image" },
        { id: "pin-5", category: "pinboard", source: "static", title: "Pin 5", media_url: "assets/thoughts/5.jpg", media_type: "image" },
        { id: "pin-6", category: "pinboard", source: "static", title: "Pin 6", media_url: "assets/thoughts/6.jpg", media_type: "image" },
        { id: "pin-7", category: "pinboard", source: "static", title: "Pin 7", media_url: "assets/thoughts/7.jpg", media_type: "image" },
        { id: "pin-8", category: "pinboard", source: "static", title: "Pin 8", media_url: "assets/thoughts/8.jpg", media_type: "image" },
        { id: "pin-9", category: "pinboard", source: "static", title: "Pin 9", media_url: "assets/thoughts/9.jpg", media_type: "image" },
        { id: "pin-10", category: "pinboard", source: "static", title: "Pin 10", media_url: "assets/thoughts/10.jpg", media_type: "image" },
        { id: "pin-11", category: "pinboard", source: "static", title: "Pin 11", media_url: "assets/thoughts/11.jpg", media_type: "image" },
        { id: "pin-12", category: "pinboard", source: "static", title: "Pin 12", media_url: "assets/thoughts/12.jpg", media_type: "image" },
        { id: "pin-13", category: "pinboard", source: "static", title: "Pin 13", media_url: "assets/thoughts/1.jpg", media_type: "image" },
        { id: "pin-14", category: "pinboard", source: "static", title: "Pin 14 (Lana)", media_url: "assets/thoughts/lana.jpg", media_type: "image" },
        { id: "pin-15", category: "pinboard", source: "static", title: "Pin 15 (Ashin)", media_url: "assets/thoughts/ashin.jpg", media_type: "image" },
        { id: "pin-16", category: "pinboard", source: "static", title: "Pin 16 (Video)", media_url: "assets/thoughts/V1.mp4", media_type: "video" },
        { id: "pin-17", category: "pinboard", source: "static", title: "Pin 17 (Sam)", media_url: "assets/thoughts/sam.jpg", media_type: "image" },
        { id: "pin-18", category: "pinboard", source: "static", title: "Pin 18", media_url: "assets/thoughts/13.jpg", media_type: "image" },
        { id: "pin-19", category: "pinboard", source: "static", title: "Pin 19", media_url: "assets/thoughts/1330.jpg", media_type: "image" },
        { id: "pin-20", category: "pinboard", source: "static", title: "Pin 20", media_url: "assets/thoughts/P1.jpg", media_type: "image" }
    ];

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
        bookFields.classList.add("admin-hidden");
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

            await cfClient.addRecord(table, row);

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
       LOAD OLD RECORDS (MERGED CATALOG + DYNAMIC)
    ========================================== */
    async function loadOldRecords() {
        oldRecordsLoading.style.display = "block";
        oldRecordsList.innerHTML = "";

        const [state, books, movies, songs, pinboard, hobbies] = await Promise.all([
            cfClient.getState(),
            cfClient.getRecords("books"),
            cfClient.getRecords("movies"),
            cfClient.getRecords("songs"),
            cfClient.getRecords("pinboard"),
            cfClient.getRecords("hobbies")
        ]);

        const deletedIds = new Set(state.deletedIds || []);
        const overrides = state.overrides || {};

        // 1. Process Static Records
        const activeStaticRecords = STATIC_RECORDS
            .filter(item => !deletedIds.has(item.id))
            .map(item => {
                const copy = { ...item };
                if (overrides[item.id]) {
                    Object.assign(copy, overrides[item.id]);
                }
                return copy;
            });

        // 2. Format Dynamic Records from Cloudflare D1
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
            dynamicRecords.push({
                id: row.id,
                category: "movie",
                source: "dynamic",
                table: "movies",
                title: row.title || "Untitled Movie",
                year: row.year,
                genre: row.genre || "",
                rating: row.rating,
                review: row.review || "",
                image_url: row.image_url || "",
                created_at: row.created_at
            });
        });

        songs.forEach(row => {
            dynamicRecords.push({
                id: row.id,
                category: "music",
                source: "dynamic",
                subType: "song",
                table: "songs",
                title: row.title || "Untitled Song",
                link: row.link || "",
                image_url: row.image_url || "",
                created_at: row.created_at
            });
        });

        pinboard.forEach(row => {
            dynamicRecords.push({
                id: row.id,
                category: "pinboard",
                source: "dynamic",
                table: "pinboard",
                title: row.caption ? `Pin: ${row.caption.slice(0, 24)}...` : `Pinboard ${row.media_type || "item"}`,
                caption: row.caption || "",
                media_type: row.media_type || "image",
                media_url: row.media_url || "",
                image_url: row.media_type === "image" ? row.media_url : "",
                created_at: row.created_at
            });
        });

        allRecordsCache = [...activeStaticRecords, ...dynamicRecords];
        oldRecordsLoading.style.display = "none";

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

        editModalBadge.textContent = `${record.source === "dynamic" ? "Dynamic" : "Original"} ${record.category.toUpperCase()}`;
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
        editMediaUrlInput.value = mediaSrc.startsWith("http") ? mediaSrc : "";

        editRecordModal.classList.remove("admin-hidden");
    }

    function closeEditModal() {
        editRecordModal.classList.add("admin-hidden");
        editMediaPreviewVideo.pause();
    }

    editModalClose.addEventListener("click", closeEditModal);
    editModalBackdrop.addEventListener("click", closeEditModal);
    editCancelBtn.addEventListener("click", closeEditModal);

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
                } else if (category === "music") {
                    itemOverride.link = editMusicLink.value.trim();
                } else if (category === "pinboard") {
                    itemOverride.caption = editPinCaption.value.trim();
                }

                state.overrides[id] = itemOverride;
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