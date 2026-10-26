/**
 * ==============================================================
 * Books Section Architecture & Reading Experience Engine
 * - Reading Streak Dashboard (Current, Best, Total Days, Books Read)
 * - Interactive Reading Calendar (Month view, active cells, date inspector)
 * - Monthly Activity Visualization (Jan - Dec horizontal progress bars)
 * - Shelves & Reading Status Filter (All, Read, Currently Reading, Want to Read)
 * - Reading Goals & Challenge Tracker (Progress, remaining days/books, editable target)
 * - Book Detail & Reading History Modal
 * ==============================================================
 */

(function () {
    "use strict";

    // Application state
    const state = {
        currentYear: new Date().getFullYear(),
        calendarYear: new Date().getFullYear(),
        calendarMonth: new Date().getMonth(), // 0-indexed
        activeShelf: "all",
        searchQuery: "",
        selectedDate: null,
        books: [],
        activities: [],
        goals: {},
        overrides: {}
    };

    // Month & Day constants
    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // Default book metadata enhancements (authors, default statuses for existing catalog)
    const CATALOG_DEFAULTS = {
        "book-atomic-habits": {
            author: "James Clear",
            status: "read",
            rating: 5,
            pages: 320,
            date_finished: "2026-08-15"
        },
        "book-alchemist": {
            author: "Paulo Coelho",
            status: "read",
            rating: 4.5,
            pages: 208,
            date_finished: "2026-09-02"
        },
        "book-48-laws": {
            author: "Robert Greene",
            status: "read",
            rating: 4.5,
            pages: 452,
            date_finished: "2026-09-20"
        },
        "book-will-you-love-me": {
            author: "Ravinder Singh",
            status: "read",
            rating: 4,
            pages: 240,
            date_finished: "2026-07-28"
        },
        "book-it-ends-with-us": {
            author: "Colleen Hoover",
            status: "currently-reading",
            rating: 4,
            pages: 384,
            date_started: "2026-10-10"
        },
        "book-strangers-again": {
            author: "Shravya Bhinder",
            status: "want-to-read",
            rating: 0,
            pages: 220
        }
    };

    // Helper: Escape HTML
    function escapeHtml(str = "") {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Helper: Format Date YYYY-MM-DD
    function toDateString(d) {
        if (!d) return "";
        const date = new Date(d);
        if (isNaN(date.getTime())) return "";
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    // Helper: Normalize reading status
    function normalizeStatus(status = "") {
        const s = String(status).trim().toLowerCase();
        if (s === "finished" || s === "read" || s === "completed") return "read";
        if (s === "currently-reading" || s === "reading" || s === "in-progress" || s === "bought") return "currently-reading";
        if (s === "want-to-read" || s === "to-read" || s === "need-to-buy") return "want-to-read";
        return "read";
    }

    // Helper: Status label & badge
    function getStatusBadge(status) {
        const norm = normalizeStatus(status);
        if (norm === "read") {
            return `<span class="book-shelf-tag tag-read">✓ Read</span>`;
        }
        if (norm === "currently-reading") {
            return `<span class="book-shelf-tag tag-reading">📖 Reading</span>`;
        }
        return `<span class="book-shelf-tag tag-want">🔖 Want to Read</span>`;
    }

    /* ==============================================================
       DATA ENGINE & STREAK CALCULATIONS
       ============================================================== */

    // Calculate all verified reading days
    function getVerifiedReadingDays(year = null) {
        const dateMap = new Map(); // "YYYY-MM-DD" => array of session objects

        // 1. From recorded activity logs
        state.activities.forEach(act => {
            if (!act || !act.date) return;
            const d = toDateString(act.date);
            if (!d) return;
            if (year && !d.startsWith(`${year}-`)) return;

            if (!dateMap.has(d)) dateMap.set(d, []);
            dateMap.get(d).push({
                type: "session",
                bookId: act.book_id,
                pages: act.pages || 0,
                notes: act.notes || "",
                minutes: act.minutes || 0
            });
        });

        // 2. From verified book dates (explicit date_started / date_finished)
        state.books.forEach(b => {
            const finishedDate = toDateString(b.date_finished);
            if (finishedDate && (!year || finishedDate.startsWith(`${year}-`))) {
                if (!dateMap.has(finishedDate)) dateMap.set(finishedDate, []);
                // Add completion entry if not already present
                const existing = dateMap.get(finishedDate);
                if (!existing.some(e => e.type === "finished" && e.bookId === b.id)) {
                    existing.push({
                        type: "finished",
                        bookId: b.id,
                        notes: `Completed "${b.title}"`
                    });
                }
            }

            const startedDate = toDateString(b.date_started);
            if (startedDate && (!year || startedDate.startsWith(`${year}-`))) {
                if (!dateMap.has(startedDate)) dateMap.set(startedDate, []);
                const existing = dateMap.get(startedDate);
                if (!existing.some(e => e.type === "started" && e.bookId === b.id)) {
                    existing.push({
                        type: "started",
                        bookId: b.id,
                        notes: `Started reading "${b.title}"`
                    });
                }
            }
        });

        return dateMap;
    }

    // Compute Streak Statistics
    function computeStreakStats() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const todayStr = toDateString(now);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = toDateString(yesterday);

        const allDates = getVerifiedReadingDays(); // Map of all dates
        const yearDates = getVerifiedReadingDays(currentYear);

        // 1. Current Streak
        let currentStreak = 0;
        let checkDate = new Date(now);

        // If today has reading, start checking from today; else if yesterday has reading, start from yesterday
        if (allDates.has(todayStr)) {
            checkDate = new Date(now);
        } else if (allDates.has(yesterdayStr)) {
            checkDate = new Date(yesterday);
        } else {
            checkDate = null;
        }

        if (checkDate) {
            while (true) {
                const checkStr = toDateString(checkDate);
                if (allDates.has(checkStr)) {
                    currentStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
        }

        // 2. Best Streak in Current Year
        const sortedYearDays = Array.from(yearDates.keys()).sort();
        let bestStreak = 0;
        let tempStreak = 0;
        let prevDate = null;

        for (const dateStr of sortedYearDays) {
            const curDate = new Date(dateStr + "T00:00:00");
            if (!prevDate) {
                tempStreak = 1;
            } else {
                const diffTime = curDate.getTime() - prevDate.getTime();
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                }
            }
            if (tempStreak > bestStreak) bestStreak = tempStreak;
            prevDate = curDate;
        }

        // 3. Total Days Read this year
        const totalDaysRead = yearDates.size;

        // 4. Total Books Completed this year
        const completedBooks = state.books.filter(b => {
            const norm = normalizeStatus(b.status);
            if (norm !== "read") return false;
            const fin = toDateString(b.date_finished || b.created_at);
            return fin && fin.startsWith(String(currentYear));
        }).length;

        return {
            currentStreak,
            bestStreak: Math.max(bestStreak, currentStreak),
            totalDaysRead,
            completedBooks,
            year: currentYear
        };
    }

    /* ==============================================================
       FEATURE 1: READING STREAK DASHBOARD
       ============================================================== */

    function renderStreakDashboard() {
        const container = document.getElementById("bookStreakDashboard");
        if (!container) return;

        const stats = computeStreakStats();

        container.innerHTML = `
            <div class="streak-card highlight-streak">
                <div class="streak-icon-pill">🔥 Current</div>
                <div class="streak-big-val">${stats.currentStreak} <span class="streak-unit">${stats.currentStreak === 1 ? "day" : "days"}</span></div>
                <div class="streak-sub-label">Current Reading Streak</div>
            </div>
            <div class="streak-card">
                <div class="streak-icon-pill">⚡ Best (${stats.year})</div>
                <div class="streak-big-val">${stats.bestStreak} <span class="streak-unit">${stats.bestStreak === 1 ? "day" : "days"}</span></div>
                <div class="streak-sub-label">Longest Streak this Year</div>
            </div>
            <div class="streak-card">
                <div class="streak-icon-pill">📅 Total Days</div>
                <div class="streak-big-val">${stats.totalDaysRead} <span class="streak-unit">days</span></div>
                <div class="streak-sub-label">Days Read in ${stats.year}</div>
            </div>
            <div class="streak-card">
                <div class="streak-icon-pill">📚 Finished</div>
                <div class="streak-big-val">${stats.completedBooks} <span class="streak-unit">${stats.completedBooks === 1 ? "book" : "books"}</span></div>
                <div class="streak-sub-label">Books Read in ${stats.year}</div>
            </div>
        `;
    }

    /* ==============================================================
       FEATURE 2: INTERACTIVE READING CALENDAR
       ============================================================== */

    function renderCalendar() {
        const container = document.getElementById("bookCalendarWidget");
        if (!container) return;

        const y = state.calendarYear;
        const m = state.calendarMonth; // 0-indexed
        const monthName = MONTH_NAMES[m];

        const firstDay = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0);
        const totalDays = lastDay.getDate();

        // Monday-based indexing: Sunday is 6, Monday is 0
        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;

        const activeDaysMap = getVerifiedReadingDays(y);
        const todayStr = toDateString(new Date());

        // Header
        let html = `
            <div class="book-calendar-header">
                <div class="cal-title-group">
                    <h3 class="cal-month-title">${monthName} ${y}</h3>
                    <span class="cal-subtitle">Daily reading activity</span>
                </div>
                <div class="cal-nav-group">
                    <button type="button" class="cal-nav-btn" id="calPrevMonth" aria-label="Previous month">‹</button>
                    <button type="button" class="cal-nav-today-btn" id="calTodayBtn">Today</button>
                    <button type="button" class="cal-nav-btn" id="calNextMonth" aria-label="Next month">›</button>
                </div>
            </div>

            <div class="book-calendar-grid">
                <div class="cal-weekdays">
                    ${DAY_NAMES.map(d => `<div class="cal-weekday">${d}</div>`).join("")}
                </div>
                <div class="cal-days">
        `;

        // Blank days prior to month start
        for (let i = 0; i < startDay; i++) {
            html += `<div class="cal-day-cell is-empty"></div>`;
        }

        // Month days
        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const hasActivity = activeDaysMap.has(dateStr);
            const isToday = dateStr === todayStr;
            const isSelected = state.selectedDate === dateStr;

            let cellClass = "cal-day-cell";
            if (isToday) cellClass += " is-today";
            if (hasActivity) cellClass += " has-activity";
            if (isSelected) cellClass += " is-selected";

            let thumbnailHtml = "";
            let dotHtml = "";

            if (hasActivity) {
                const sessions = activeDaysMap.get(dateStr) || [];
                const firstSession = sessions[0];
                const book = state.books.find(b => b.id === firstSession?.bookId);

                if (book && book.image_url) {
                    thumbnailHtml = `<img src="${escapeHtml(book.image_url)}" class="cal-day-thumb" alt="${escapeHtml(book.title)}">`;
                } else {
                    dotHtml = `<span class="cal-reading-dot" title="Reading activity"></span>`;
                }
            }

            html += `
                <div class="${cellClass}" data-date="${dateStr}" tabindex="0" role="button" aria-label="${monthName} ${day}, ${y}${hasActivity ? " - Reading logged" : ""}">
                    <span class="cal-day-num">${day}</span>
                    ${thumbnailHtml}
                    ${dotHtml}
                </div>
            `;
        }

        html += `
                </div>
            </div>

            <!-- Calendar Legend & Date Inspector -->
            <div class="cal-footer-row">
                <div class="cal-legend">
                    <span class="legend-item"><span class="legend-box has-activity"></span> Active day</span>
                    <span class="legend-item"><span class="legend-box is-today"></span> Today</span>
                    <span class="legend-item"><span class="legend-dot"></span> Logged session</span>
                </div>
                <div id="calSelectedInfo" class="cal-selected-info">
                    ${renderSelectedDateInfo()}
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Attach listeners
        document.getElementById("calPrevMonth")?.addEventListener("click", () => {
            state.calendarMonth--;
            if (state.calendarMonth < 0) {
                state.calendarMonth = 11;
                state.calendarYear--;
            }
            renderCalendar();
        });

        document.getElementById("calNextMonth")?.addEventListener("click", () => {
            state.calendarMonth++;
            if (state.calendarMonth > 11) {
                state.calendarMonth = 0;
                state.calendarYear++;
            }
            renderCalendar();
        });

        document.getElementById("calTodayBtn")?.addEventListener("click", () => {
            const now = new Date();
            state.calendarYear = now.getFullYear();
            state.calendarMonth = now.getMonth();
            state.selectedDate = toDateString(now);
            renderCalendar();
        });

        container.querySelectorAll(".cal-day-cell[data-date]").forEach(cell => {
            cell.addEventListener("click", () => {
                state.selectedDate = cell.dataset.date;
                renderCalendar();
            });
            cell.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    state.selectedDate = cell.dataset.date;
                    renderCalendar();
                }
            });
        });
    }

    // Detail text for selected calendar date
    function renderSelectedDateInfo() {
        if (!state.selectedDate) {
            return `<span class="cal-hint-text">💡 Tap any active date to view reading notes</span>`;
        }

        const dateStr = state.selectedDate;
        const allDays = getVerifiedReadingDays();
        const sessions = allDays.get(dateStr) || [];

        const d = new Date(dateStr + "T00:00:00");
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

        if (sessions.length === 0) {
            return `
                <div class="cal-detail-box">
                    <strong>${formatted}</strong>: No reading activity recorded on this day.
                </div>
            `;
        }

        const details = sessions.map(s => {
            const b = state.books.find(x => x.id === s.bookId);
            const bookTitle = b ? `"${escapeHtml(b.title)}"` : "a book";
            let action = "Read";
            if (s.type === "finished") action = "Finished";
            if (s.type === "started") action = "Started";

            let meta = [];
            if (s.pages) meta.push(`${s.pages} pages`);
            if (s.minutes) meta.push(`${s.minutes} mins`);
            const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : "";
            const noteStr = s.notes ? ` — <em>${escapeHtml(s.notes)}</em>` : "";

            return `<div>📖 ${action} <strong>${bookTitle}</strong>${metaStr}${noteStr}</div>`;
        }).join("");

        return `
            <div class="cal-detail-box is-active-log">
                <div class="cal-detail-head"><strong>${formatted}</strong> (${sessions.length} entry):</div>
                ${details}
            </div>
        `;
    }

    /* ==============================================================
       FEATURE 3: MONTHLY READING ACTIVITY
       ============================================================== */

    function renderMonthlyActivity() {
        const container = document.getElementById("bookMonthlyWidget");
        if (!container) return;

        const y = state.calendarYear;

        // Compute completed books per month
        const monthlyCounts = Array(12).fill(0);
        const monthlyBooks = Array.from({ length: 12 }, () => []);

        state.books.forEach(b => {
            const norm = normalizeStatus(b.status);
            if (norm !== "read") return;
            const fin = toDateString(b.date_finished || b.created_at);
            if (!fin || !fin.startsWith(`${y}-`)) return;

            const mIdx = parseInt(fin.split("-")[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
                monthlyCounts[mIdx]++;
                monthlyBooks[mIdx].push(b);
            }
        });

        const maxCount = Math.max(1, ...monthlyCounts);
        const totalYearCompleted = monthlyCounts.reduce((a, b) => a + b, 0);

        let html = `
            <div class="monthly-header">
                <div>
                    <h3 class="monthly-title">Monthly Reading Activity — ${y}</h3>
                    <span class="monthly-sub">${totalYearCompleted} books completed in ${y}</span>
                </div>
                <div class="monthly-year-tag">${y} Activity</div>
            </div>
            <div class="monthly-bars-list">
        `;

        for (let i = 0; i < 12; i++) {
            const count = monthlyCounts[i];
            const books = monthlyBooks[i];
            const pct = Math.round((count / maxCount) * 100);
            const mName = MONTH_SHORT[i];

            // Render miniature thumbnails
            const thumbnails = books.slice(0, 4).map(b => `
                <img src="${escapeHtml(b.image_url)}" class="monthly-thumb" title="${escapeHtml(b.title)}" alt="${escapeHtml(b.title)}">
            `).join("");

            html += `
                <div class="monthly-row ${count > 0 ? "has-books" : ""}" data-month="${i}">
                    <span class="monthly-month-name">${mName}</span>
                    <div class="monthly-bar-track">
                        <div class="monthly-bar-fill" style="width: ${count > 0 ? Math.max(8, pct) : 0}%;">
                            ${count > 0 ? `<span class="monthly-bar-count">${count}</span>` : ""}
                        </div>
                    </div>
                    <div class="monthly-covers-wrap">
                        ${thumbnails}
                        ${books.length > 4 ? `<span class="monthly-more">+${books.length - 4}</span>` : ""}
                    </div>
                    <span class="monthly-end-count">${count > 0 ? `${count} book${count === 1 ? "" : "s"}` : "—"}</span>
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    /* ==============================================================
       FEATURE 4: BOOK SHELVES & READING STATUS
       ============================================================== */

    function renderShelves() {
        const tabsContainer = document.getElementById("bookShelfTabs");
        const booksGrid = document.querySelector(".books-row");
        if (!tabsContainer || !booksGrid) return;

        // Shelf counts
        const counts = {
            all: state.books.length,
            read: 0,
            "currently-reading": 0,
            "want-to-read": 0
        };

        state.books.forEach(b => {
            const norm = normalizeStatus(b.status);
            if (counts[norm] !== undefined) counts[norm]++;
        });

        // Render shelf tabs
        tabsContainer.innerHTML = `
            <button type="button" class="shelf-tab ${state.activeShelf === "all" ? "active" : ""}" data-shelf="all">
                All Books <span class="shelf-pill">${counts.all}</span>
            </button>
            <button type="button" class="shelf-tab ${state.activeShelf === "read" ? "active" : ""}" data-shelf="read">
                ✓ Read <span class="shelf-pill">${counts.read}</span>
            </button>
            <button type="button" class="shelf-tab ${state.activeShelf === "currently-reading" ? "active" : ""}" data-shelf="currently-reading">
                📖 Reading <span class="shelf-pill">${counts["currently-reading"]}</span>
            </button>
            <button type="button" class="shelf-tab ${state.activeShelf === "want-to-read" ? "active" : ""}" data-shelf="want-to-read">
                🔖 Want to Read <span class="shelf-pill">${counts["want-to-read"]}</span>
            </button>
        `;

        tabsContainer.querySelectorAll(".shelf-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                state.activeShelf = tab.dataset.shelf;
                renderShelves();
            });
        });

        // Filter and display books
        let filtered = state.books.filter(b => {
            if (state.activeShelf !== "all") {
                const norm = normalizeStatus(b.status);
                if (norm !== state.activeShelf) return false;
            }
            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const t = (b.title || "").toLowerCase();
                const a = (b.author || "").toLowerCase();
                if (!t.includes(q) && !a.includes(q)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            booksGrid.innerHTML = `
                <div class="books-empty-state">
                    <p class="empty-icon">📚</p>
                    <p class="empty-title">No books in this shelf yet</p>
                    <p class="empty-sub">Add or mark books as "${state.activeShelf}" to see them here.</p>
                </div>
            `;
            return;
        }

        booksGrid.innerHTML = filtered.map(b => {
            const badge = getStatusBadge(b.status);
            const author = b.author ? `<div class="book-author">${escapeHtml(b.author)}</div>` : "";
            const ratingStars = b.rating ? `<div class="book-stars">★ ${b.rating}</div>` : "";

            return `
                <div class="book" id="${escapeHtml(b.id)}" data-record-id="${escapeHtml(b.id)}" tabindex="0" role="button" aria-label="Book: ${escapeHtml(b.title)}">
                    <div class="book-cover-wrap">
                        <img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.title)}">
                        <div class="book-badge-overlay">${badge}</div>
                    </div>
                    <div class="book-title-row">
                        <h3>${escapeHtml(b.title)}</h3>
                        ${author}
                        ${ratingStars}
                    </div>
                </div>
            `;
        }).join("");

        // Attach click to open detail modal
        booksGrid.querySelectorAll(".book").forEach(card => {
            card.addEventListener("click", () => openBookDetailModal(card.dataset.recordId));
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openBookDetailModal(card.dataset.recordId);
                }
            });
        });
    }

    /* ==============================================================
       FEATURE 5: READING GOALS AND CHALLENGES
       ============================================================== */

    function renderReadingGoal() {
        const container = document.getElementById("bookChallengeWidget");
        if (!container) return;

        const now = new Date();
        const year = now.getFullYear();
        const targetGoal = (state.goals && state.goals[year]) ? Number(state.goals[year].target) : 12;

        // Completed in current year
        const completed = state.books.filter(b => {
            const norm = normalizeStatus(b.status);
            if (norm !== "read") return false;
            const fin = toDateString(b.date_finished || b.created_at);
            return fin && fin.startsWith(String(year));
        }).length;

        const pct = targetGoal > 0 ? Math.min(100, Math.round((completed / targetGoal) * 100)) : 0;
        const remaining = Math.max(0, targetGoal - completed);

        // Days remaining in year
        const endOfYear = new Date(year, 11, 31);
        const daysLeft = Math.max(0, Math.ceil((endOfYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        container.innerHTML = `
            <div class="challenge-card">
                <div class="challenge-header">
                    <div class="challenge-title-group">
                        <span class="challenge-badge">🎯 ${year} Reading Challenge</span>
                        <h3 class="challenge-heading">
                            <strong>${completed}</strong> of <strong>${targetGoal}</strong> books completed
                        </h3>
                    </div>
                    <button type="button" class="challenge-edit-btn" id="editGoalBtn" aria-label="Edit reading goal">
                        ⚙️ Goal (${targetGoal})
                    </button>
                </div>

                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width: ${pct}%;"></div>
                </div>

                <div class="challenge-meta-row">
                    <span class="challenge-pct">${pct}% completed</span>
                    <span class="challenge-rem">${remaining > 0 ? `${remaining} books to go` : "🎉 Goal accomplished!"}</span>
                    <span class="challenge-days">${daysLeft} days left in ${year}</span>
                </div>
            </div>
        `;

        document.getElementById("editGoalBtn")?.addEventListener("click", promptEditGoal);
    }

    async function promptEditGoal() {
        const now = new Date();
        const year = now.getFullYear();
        const currentTarget = (state.goals && state.goals[year]) ? state.goals[year].target : 12;

        const input = window.prompt(`Set your ${year} Annual Reading Challenge Goal:`, currentTarget);
        if (input === null) return;

        const num = parseInt(input, 10);
        if (isNaN(num) || num <= 0) {
            window.alert("Please enter a valid positive number for your goal.");
            return;
        }

        if (!state.goals) state.goals = {};
        state.goals[year] = { target: num };

        // Save locally and via Cloudflare
        try {
            localStorage.setItem("books_reading_goals", JSON.stringify(state.goals));
            if (window.cfClient) {
                const cloudState = await window.cfClient.getState().catch(() => ({}));
                cloudState.reading_goals = state.goals;
                await window.cfClient.saveState(cloudState).catch(() => {});
            }
        } catch (_) {}

        renderReadingGoal();
    }

    /* ==============================================================
       BOOK DETAIL & READING HISTORY MODAL
       ============================================================== */

    function setupBookDetailModal() {
        const backdrop = document.getElementById("bookModalBackdrop");
        const closeBtn = document.getElementById("bookModalClose");

        if (backdrop) backdrop.addEventListener("click", closeBookDetailModal);
        if (closeBtn) closeBtn.addEventListener("click", closeBookDetailModal);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeBookDetailModal();
        });
    }

    function openBookDetailModal(bookId) {
        const book = state.books.find(b => b.id === bookId);
        if (!book) return;

        const modal = document.getElementById("bookDetailModal");
        if (!modal) return;

        document.getElementById("modalBookCover").src = book.image_url || "";
        document.getElementById("modalBookTitle").textContent = book.title || "Untitled Book";
        document.getElementById("modalBookAuthor").textContent = book.author ? `by ${book.author}` : "Author not specified";

        const normStatus = normalizeStatus(book.status);
        const statusSelect = document.getElementById("modalBookStatusSelect");
        if (statusSelect) statusSelect.value = normStatus;

        // Rating
        const ratingWrap = document.getElementById("modalBookRating");
        if (ratingWrap) {
            const r = book.rating || 0;
            const full = Math.floor(r);
            ratingWrap.textContent = r > 0 ? "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full)) + ` (${r}/5)` : "Unrated";
        }

        // Dates
        const datesWrap = document.getElementById("modalBookDates");
        if (datesWrap) {
            let dateText = [];
            if (book.date_started) dateText.push(`Started: ${book.date_started}`);
            if (book.date_finished) dateText.push(`Finished: ${book.date_finished}`);
            datesWrap.textContent = dateText.length > 0 ? dateText.join(" • ") : "No dates recorded";
        }

        // Review / Notes
        const reviewEl = document.getElementById("modalBookNotes");
        if (reviewEl) {
            reviewEl.textContent = book.review || book.notes || "No notes logged for this book.";
        }

        // Reading Activity Timeline for this book
        const timelineEl = document.getElementById("modalBookTimeline");
        if (timelineEl) {
            const bookActs = state.activities.filter(a => a.book_id === book.id);
            if (bookActs.length === 0) {
                timelineEl.innerHTML = `<p class="timeline-empty">No daily reading logs recorded for this title yet.</p>`;
            } else {
                timelineEl.innerHTML = bookActs.map(a => `
                    <div class="timeline-item">
                        <span class="timeline-date">${escapeHtml(a.date)}</span>
                        <span class="timeline-desc">${a.pages ? `${a.pages} pages read` : "Reading session"}${a.notes ? ` — "${escapeHtml(a.notes)}"` : ""}</span>
                    </div>
                `).join("");
            }
        }

        // Attach Quick Status Change listener
        const updateStatusBtn = document.getElementById("modalUpdateStatusBtn");
        if (updateStatusBtn) {
            updateStatusBtn.onclick = async () => {
                const newStatus = statusSelect.value;
                book.status = newStatus;

                // If moving to read and no date_finished, prompt or default to today
                if (newStatus === "read" && !book.date_finished) {
                    book.date_finished = toDateString(new Date());
                }

                // Persist status change
                saveBookOverride(book.id, {
                    status: newStatus,
                    date_finished: book.date_finished
                });

                renderShelves();
                renderStreakDashboard();
                renderMonthlyActivity();
                renderReadingGoal();
                closeBookDetailModal();
            };
        }

        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    }

    function closeBookDetailModal() {
        const modal = document.getElementById("bookDetailModal");
        if (modal) {
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "";
        }
    }

    // Save individual book overrides to D1 / LocalStorage
    async function saveBookOverride(bookId, data) {
        if (!state.overrides) state.overrides = {};
        state.overrides[bookId] = { ...(state.overrides[bookId] || {}), ...data };

        try {
            localStorage.setItem("books_overrides", JSON.stringify(state.overrides));
            if (window.cfClient) {
                const cloudState = await window.cfClient.getState().catch(() => ({}));
                if (!cloudState.overrides) cloudState.overrides = {};
                cloudState.overrides[bookId] = { ...(cloudState.overrides[bookId] || {}), ...data };
                await window.cfClient.saveState(cloudState).catch(() => {});
            }
        } catch (_) {}
    }

    /* ==============================================================
       INITIALIZATION & DATA LOADING
       ============================================================== */

    async function initBooks() {
        // 1. Load from Cloudflare API & site_state
        let cloudBooks = [];
        let cloudState = { overrides: {}, reading_activity: [], reading_goals: {} };

        try {
            if (window.cfClient) {
                const [booksRes, stateRes] = await Promise.all([
                    window.cfClient.getRecords("books").catch(() => []),
                    window.cfClient.getState().catch(() => ({}))
                ]);
                cloudBooks = Array.isArray(booksRes) ? booksRes : [];
                cloudState = stateRes || {};
            }
        } catch (e) {
            console.warn("Could not fetch remote books:", e);
        }

        // Fallback local storage
        let localOverrides = {};
        let localActivities = [];
        let localGoals = {};
        try {
            localOverrides = JSON.parse(localStorage.getItem("books_overrides") || "{}");
            localActivities = JSON.parse(localStorage.getItem("books_reading_activity") || "[]");
            localGoals = JSON.parse(localStorage.getItem("books_reading_goals") || "{}");
        } catch (_) {}

        state.overrides = { ...CATALOG_DEFAULTS, ...localOverrides, ...(cloudState.overrides || {}) };
        state.activities = (cloudState.reading_activity && cloudState.reading_activity.length > 0)
            ? cloudState.reading_activity
            : localActivities;
        state.goals = (cloudState.reading_goals && Object.keys(cloudState.reading_goals).length > 0)
            ? cloudState.reading_goals
            : localGoals;

        // Build composite book list
        const booksMap = new Map();

        // Include cloud books
        cloudBooks.forEach(b => {
            if (!b || !b.id) return;
            const ov = state.overrides[b.id] || {};
            booksMap.set(b.id, {
                id: b.id,
                title: ov.title || b.title || "Untitled Book",
                author: ov.author || b.author || "",
                status: ov.status || b.status || "read",
                image_url: ov.image_url || b.image_url || "",
                rating: ov.rating !== undefined ? ov.rating : (b.rating || 0),
                pages: ov.pages || b.pages || 0,
                date_started: ov.date_started || b.date_started || "",
                date_finished: ov.date_finished || b.date_finished || "",
                review: ov.review || b.review || "",
                created_at: b.created_at
            });
        });

        // Ensure default catalog items are included if not in cloud
        Object.keys(CATALOG_DEFAULTS).forEach(id => {
            if (!booksMap.has(id)) {
                const def = CATALOG_DEFAULTS[id];
                const ov = state.overrides[id] || {};
                let title = id.replace("book-", "").replace(/-/g, " ");
                let img = "assets/books/atomic-habits.jpg";

                if (id === "book-atomic-habits") { title = "Atomic Habits"; img = "assets/books/atomic-habits.jpg"; }
                else if (id === "book-alchemist") { title = "The Alchemist"; img = "assets/books/alchemist.jpg"; }
                else if (id === "book-48-laws") { title = "The 48 Laws of Power"; img = "assets/books/The 48 Laws of Power.jpg"; }
                else if (id === "book-will-you-love-me") { title = "Will you love me?"; img = "assets/books/1.jpg"; }
                else if (id === "book-it-ends-with-us") { title = "It Ends with us"; img = "assets/books/It Ends with Us_ A Novel.jpg"; }
                else if (id === "book-strangers-again") { title = "Can we be Strangers again?"; img = "assets/books/2.jpg"; }

                booksMap.set(id, {
                    id,
                    title: ov.title || title,
                    author: ov.author || def.author,
                    status: ov.status || def.status,
                    image_url: ov.image_url || img,
                    rating: ov.rating !== undefined ? ov.rating : def.rating,
                    pages: ov.pages || def.pages,
                    date_started: ov.date_started || def.date_started || "",
                    date_finished: ov.date_finished || def.date_finished || "",
                    review: ov.review || "",
                    created_at: "2026-09-25 14:56:50"
                });
            }
        });

        state.books = Array.from(booksMap.values());

        // Setup search bar listener
        const searchInput = document.getElementById("bookSearchInput");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                state.searchQuery = e.target.value.trim();
                renderShelves();
            });
        }

        // Render all UI components
        renderReadingGoal();
        renderStreakDashboard();
        renderCalendar();
        renderMonthlyActivity();
        renderShelves();
        setupBookDetailModal();
    }

    // Expose hook so admin or other modules can refresh
    window.refreshBooksExperience = initBooks;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBooks);
    } else {
        initBooks();
    }
})();
