/**
 * ==============================================================
 * Books Section Architecture & Reading Experience Engine
 * - Reading Stats & Interactive SVG Graph (Activity & Time Modes)
 * - Time Range Filters: Weekly, Monthly, Yearly, All Time
 * - Deep Reading Analytics: Pace, Speed, Best Day, Longest/Shortest
 * - Live Reading Session Stopwatch & Tracker
 * - Reading Streak Dashboard (Current, Best, Total Days, Books Read)
 * - Interactive Reading Calendar (7-column grid, active cells, inspector)
 * - Monthly Activity Visualization (Jan - Dec horizontal progress tracks)
 * - Shelves & Reading Status Filter (All, Read, Reading, Want to Read)
 * - Reading Goals & Challenge Tracker (Progress, remaining days/books)
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
        analyticsRange: "yearly", // 'weekly' | 'monthly' | 'yearly' | 'all'
        analyticsMode: "activity", // 'activity' | 'time'
        books: [],
        activities: [],
        goals: {},
        overrides: {},
        liveSession: {
            active: false,
            paused: false,
            startTime: null,
            elapsedSeconds: 0,
            intervalId: null,
            bookId: ""
        }
    };

    // Month & Day constants
    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // Default book metadata enhancements
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

    // Helper: Format Duration (minutes to "Xh Ym" or "Xm")
    function formatDuration(totalMins = 0) {
        const mins = Math.max(0, Math.round(totalMins));
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    // Helper: Normalize reading status
    function normalizeStatus(status = "") {
        const s = String(status).trim().toLowerCase();
        if (s === "finished" || s === "read" || s === "completed") return "read";
        if (s === "currently-reading" || s === "reading" || s === "in-progress" || s === "bought") return "currently-reading";
        if (s === "want-to-read" || s === "to-read" || s === "need-to-buy") return "want-to-read";
        return "read";
    }

    // Helper: Status badge
    function getStatusBadge(status) {
        const norm = normalizeStatus(status);
        if (norm === "read") return `<span class="book-shelf-tag tag-read">✓ Read</span>`;
        if (norm === "currently-reading") return `<span class="book-shelf-tag tag-reading">📖 Reading</span>`;
        return `<span class="book-shelf-tag tag-want">🔖 Want to Read</span>`;
    }

    /* ==============================================================
       CORE ACTIVITY MAP & STREAK CALCULATIONS
       ============================================================== */

    function getVerifiedReadingDays(year = null) {
        const dateMap = new Map();

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

        // 2. From verified book dates
        state.books.forEach(b => {
            const finishedDate = toDateString(b.date_finished);
            if (finishedDate && (!year || finishedDate.startsWith(`${year}-`))) {
                if (!dateMap.has(finishedDate)) dateMap.set(finishedDate, []);
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

    function computeStreakStats() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const todayStr = toDateString(now);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = toDateString(yesterday);

        const allDates = getVerifiedReadingDays();
        const yearDates = getVerifiedReadingDays(currentYear);

        let currentStreak = 0;
        let checkDate = null;

        if (allDates.has(todayStr)) {
            checkDate = new Date(now);
        } else if (allDates.has(yesterdayStr)) {
            checkDate = new Date(yesterday);
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

        const totalDaysRead = yearDates.size;
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
       ADVANCED READING ANALYTICS & GRAPH ENGINE
       ============================================================== */

    function computeAnalytics(range = "yearly", mode = "activity") {
        const now = new Date();
        const todayStr = toDateString(now);

        // Define start/end dates for current and prior comparison period
        let startDate = null;
        let endDate = todayStr;
        let priorStartDate = null;
        let priorEndDate = null;

        if (range === "weekly") {
            const start = new Date(now);
            start.setDate(start.getDate() - 6);
            startDate = toDateString(start);

            const pEnd = new Date(start);
            pEnd.setDate(pEnd.getDate() - 1);
            priorEndDate = toDateString(pEnd);

            const pStart = new Date(pEnd);
            pStart.setDate(pStart.getDate() - 6);
            priorStartDate = toDateString(pStart);
        } else if (range === "monthly") {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = toDateString(start);

            const pEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            priorEndDate = toDateString(pEnd);
            const pStart = new Date(pEnd.getFullYear(), pEnd.getMonth(), 1);
            priorStartDate = toDateString(pStart);
        } else if (range === "yearly") {
            const y = now.getFullYear();
            startDate = `${y}-01-01`;
            endDate = `${y}-12-31`;

            priorStartDate = `${y - 1}-01-01`;
            priorEndDate = `${y - 1}-12-31`;
        } else {
            // All Time
            startDate = "2020-01-01";
            endDate = "2099-12-31";
        }

        // Filter sessions within range
        const isInRange = (d, s, e) => (!s || d >= s) && (!e || d <= e);

        const currentSessions = state.activities.filter(a => a && a.date && isInRange(toDateString(a.date), startDate, endDate));
        const priorSessions = state.activities.filter(a => a && a.date && isInRange(toDateString(a.date), priorStartDate, priorEndDate));

        // Filter completed books within range
        const currentCompletedBooks = state.books.filter(b => {
            if (normalizeStatus(b.status) !== "read") return false;
            const d = toDateString(b.date_finished || b.created_at);
            return isInRange(d, startDate, endDate);
        });

        const priorCompletedBooks = state.books.filter(b => {
            if (normalizeStatus(b.status) !== "read") return false;
            const d = toDateString(b.date_finished || b.created_at);
            return isInRange(d, priorStartDate, priorEndDate);
        });

        // 1. Total Pages
        let totalPages = currentSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
        // Include page counts from completed books if no overlapping session pages
        currentCompletedBooks.forEach(b => {
            const bookHasSessions = currentSessions.some(s => s.book_id === b.id && (s.pages || 0) > 0);
            if (!bookHasSessions && b.pages) {
                totalPages += Number(b.pages) || 0;
            }
        });

        let priorPages = priorSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
        priorCompletedBooks.forEach(b => {
            const hasSess = priorSessions.some(s => s.book_id === b.id && (s.pages || 0) > 0);
            if (!hasSess && b.pages) priorPages += Number(b.pages) || 0;
        });

        // 2. Total Reading Duration
        const totalMinutes = currentSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
        const priorMinutes = priorSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

        // 3. Unique Reading Days
        const readingDaySet = new Set();
        currentSessions.forEach(s => s.date && readingDaySet.add(toDateString(s.date)));
        currentCompletedBooks.forEach(b => {
            const d = toDateString(b.date_finished);
            if (d) readingDaySet.add(d);
        });
        const readingDays = readingDaySet.size;

        // 4. Books Finished
        const booksFinished = currentCompletedBooks.length;
        const priorBooksFinished = priorCompletedBooks.length;

        // 5. Total Sessions
        const totalSessions = currentSessions.length;

        // 6. Longest Read & Shortest Read
        let longestReadBook = null;
        let shortestReadBook = null;

        const candidateBooks = currentCompletedBooks.length > 0
            ? currentCompletedBooks
            : state.books.filter(b => normalizeStatus(b.status) === "read");

        candidateBooks.forEach(b => {
            const p = Number(b.pages) || 0;
            if (p > 0) {
                if (!longestReadBook || p > (longestReadBook.pages || 0)) longestReadBook = b;
                if (!shortestReadBook || p < (shortestReadBook.pages || Infinity)) shortestReadBook = b;
            }
        });

        // 7. Pace & Speed Calculations
        const avgPagesPerDay = readingDays > 0 ? Math.round(totalPages / readingDays) : 0;
        const avgPagesPerSession = totalSessions > 0 ? Math.round(totalPages / totalSessions) : 0;
        const avgSessionDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

        // Speed in pages per hour
        let validSpeedMinutes = 0;
        let validSpeedPages = 0;
        currentSessions.forEach(s => {
            if ((s.minutes || 0) > 0 && (s.pages || 0) > 0) {
                validSpeedMinutes += s.minutes;
                validSpeedPages += s.pages;
            }
        });
        const readingSpeed = validSpeedMinutes >= 10 ? Math.round((validSpeedPages / validSpeedMinutes) * 60) : null;

        // 8. Best Reading Day (date with maximum pages)
        const dayPageMap = {};
        currentSessions.forEach(s => {
            const d = toDateString(s.date);
            dayPageMap[d] = (dayPageMap[d] || 0) + (Number(s.pages) || 0);
        });
        let bestDay = null;
        let bestDayPages = 0;
        Object.keys(dayPageMap).forEach(d => {
            if (dayPageMap[d] > bestDayPages) {
                bestDayPages = dayPageMap[d];
                bestDay = d;
            }
        });

        // 9. Longest & Shortest Session
        let longestSession = null;
        let shortestSession = null;
        currentSessions.forEach(s => {
            const m = Number(s.minutes) || 0;
            if (m > 0) {
                if (!longestSession || m > longestSession.minutes) longestSession = s;
                if (!shortestSession || m < shortestSession.minutes) shortestSession = s;
            }
        });

        // 10. Percentage Comparisons with prior period
        function computePctChange(cur, pri) {
            if (pri <= 0) return null;
            return Math.round(((cur - pri) / pri) * 100);
        }
        const pagesChangePct = computePctChange(totalPages, priorPages);
        const timeChangePct = computePctChange(totalMinutes, priorMinutes);
        const booksChangePct = computePctChange(booksFinished, priorBooksFinished);

        // 11. Interactive Chart Data Generator
        const chartPoints = [];

        if (range === "weekly") {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(d.getDate() - i);
                const dateStr = toDateString(d);
                const dayName = DAY_NAMES[(d.getDay() + 6) % 7];

                const daySessions = currentSessions.filter(s => toDateString(s.date) === dateStr);
                const dayPages = daySessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
                const dayMins = daySessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

                const val = mode === "time" ? dayMins : dayPages;
                const formatted = mode === "time" ? formatDuration(dayMins) : `${dayPages}p`;

                chartPoints.push({
                    label: dayName,
                    subLabel: d.getDate(),
                    date: dateStr,
                    value: val,
                    formattedVal: formatted,
                    count: daySessions.length
                });
            }
        } else if (range === "monthly") {
            const y = now.getFullYear();
            const m = now.getMonth();
            const daysInMonth = new Date(y, m + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySessions = currentSessions.filter(s => toDateString(s.date) === dateStr);
                const dayPages = daySessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
                const dayMins = daySessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

                const val = mode === "time" ? dayMins : dayPages;
                const formatted = mode === "time" ? formatDuration(dayMins) : `${dayPages}p`;

                chartPoints.push({
                    label: String(day),
                    subLabel: MONTH_SHORT[m],
                    date: dateStr,
                    value: val,
                    formattedVal: formatted,
                    count: daySessions.length
                });
            }
        } else {
            // Yearly (12 Months)
            const y = now.getFullYear();
            for (let i = 0; i < 12; i++) {
                const prefix = `${y}-${String(i + 1).padStart(2, "0")}`;
                const monthSessions = currentSessions.filter(s => toDateString(s.date).startsWith(prefix));
                const monthBooks = currentCompletedBooks.filter(b => toDateString(b.date_finished || b.created_at).startsWith(prefix));

                let monthPages = monthSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
                monthBooks.forEach(b => {
                    const hasSess = monthSessions.some(s => s.book_id === b.id && (s.pages || 0) > 0);
                    if (!hasSess && b.pages) monthPages += Number(b.pages) || 0;
                });

                const monthMins = monthSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
                const val = mode === "time" ? monthMins : monthPages;
                const formatted = mode === "time" ? formatDuration(monthMins) : `${monthPages}p`;

                chartPoints.push({
                    label: MONTH_SHORT[i],
                    subLabel: String(y),
                    date: `${MONTH_NAMES[i]} ${y}`,
                    value: val,
                    formattedVal: formatted,
                    count: monthSessions.length + monthBooks.length
                });
            }
        }

        return {
            range,
            mode,
            totalPages,
            totalMinutes,
            readingDays,
            booksFinished,
            totalSessions,
            longestReadBook,
            shortestReadBook,
            avgPagesPerDay,
            avgPagesPerSession,
            avgSessionDuration,
            readingSpeed,
            bestDay,
            bestDayPages,
            longestSession,
            shortestSession,
            pagesChangePct,
            timeChangePct,
            booksChangePct,
            chartPoints
        };
    }

    /* ==============================================================
       INTERACTIVE VECTOR SVG CHART GENERATOR
       ============================================================== */

    function generateSvgChart(chartPoints = [], mode = "activity") {
        if (!chartPoints || chartPoints.length === 0) {
            return `<div class="chart-empty-state">No activity recorded for this period.</div>`;
        }

        const width = 640;
        const height = 220;
        const padLeft = 45;
        const padRight = 25;
        const padTop = 25;
        const padBottom = 35;

        const plotWidth = width - padLeft - padRight;
        const plotHeight = height - padTop - padBottom;

        const maxVal = Math.max(10, ...chartPoints.map(p => p.value));
        const yMax = Math.ceil(maxVal * 1.15);

        // Compute (x, y) coordinates
        const n = chartPoints.length;
        const coords = chartPoints.map((pt, i) => {
            const x = padLeft + (n > 1 ? (i / (n - 1)) * plotWidth : plotWidth / 2);
            const y = padTop + plotHeight - (pt.value / yMax) * plotHeight;
            return { x, y, pt };
        });

        // Build SVG smooth path
        let pathD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
        for (let i = 0; i < coords.length - 1; i++) {
            const p0 = i > 0 ? coords[i - 1] : coords[i];
            const p1 = coords[i];
            const p2 = coords[i + 1];
            const p3 = i != coords.length - 2 ? coords[i + 2] : p2;

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }

        // Area path for gradient fill
        const firstX = coords[0].x.toFixed(1);
        const lastX = coords[coords.length - 1].x.toFixed(1);
        const bottomY = (padTop + plotHeight).toFixed(1);
        const areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

        // Horizontal Gridlines & Y-Axis Labels (4 ticks)
        let gridLinesHtml = "";
        const yTicks = [0, 0.33, 0.66, 1];
        yTicks.forEach(pct => {
            const val = Math.round(yMax * pct);
            const yPos = (padTop + plotHeight - pct * plotHeight).toFixed(1);
            const label = mode === "time" ? (val >= 60 ? `${Math.round(val / 60)}h` : `${val}m`) : `${val}p`;

            gridLinesHtml += `
                <line x1="${padLeft}" y1="${yPos}" x2="${width - padRight}" y2="${yPos}" stroke="#E6E0D4" stroke-dasharray="3,3" stroke-width="1.2" />
                <text x="${padLeft - 8}" y="${Number(yPos) + 3}" fill="#888" font-size="10" font-family="'IBM Plex Mono', monospace" text-anchor="end">${label}</text>
            `;
        });

        // X-Axis Labels (sample every 1, 2, or 5 depending on count)
        let xLabelsHtml = "";
        const step = n > 20 ? 5 : (n > 10 ? 2 : 1);
        coords.forEach((c, idx) => {
            if (idx % step === 0 || idx === n - 1) {
                xLabelsHtml += `
                    <text x="${c.x.toFixed(1)}" y="${height - 12}" fill="#666" font-size="10.5" font-weight="600" font-family="'Space Grotesk', sans-serif" text-anchor="middle">${escapeHtml(c.pt.label)}</text>
                `;
            }
        });

        // Interactive Data Circles
        let circlesHtml = "";
        coords.forEach((c, idx) => {
            circlesHtml += `
                <g class="chart-point-group" data-idx="${idx}" data-val="${c.pt.formattedVal}" data-date="${escapeHtml(c.pt.date)}">
                    <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.5" class="chart-node" />
                    <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="14" class="chart-hit-target" />
                </g>
            `;
        });

        return `
            <div class="reading-svg-chart-wrap">
                <svg viewBox="0 0 ${width} ${height}" class="reading-svg-chart" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#A8C9A1" stop-opacity="0.38" />
                            <stop offset="100%" stop-color="#A8C9A1" stop-opacity="0.0" />
                        </linearGradient>
                    </defs>
                    ${gridLinesHtml}
                    <path d="${areaD}" fill="url(#chartAreaGrad)" />
                    <path d="${pathD}" fill="none" stroke="#2B2926" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                    ${xLabelsHtml}
                    ${circlesHtml}
                </svg>
                <div id="chartTooltip" class="chart-tooltip"></div>
            </div>
        `;
    }

    /* ==============================================================
       FEATURE: READING ANALYTICS COMPONENT
       ============================================================== */

    function renderReadingAnalytics() {
        const container = document.getElementById("bookAnalyticsSection");
        if (!container) return;

        const data = computeAnalytics(state.analyticsRange, state.analyticsMode);

        // Format Longest & Shortest read cards
        let longestCard = `
            <div class="stat-book-card">
                <div class="stat-book-info">
                    <span class="stat-book-tag">LONGEST READ</span>
                    <div class="stat-book-pages">${data.longestReadBook?.pages ? `${data.longestReadBook.pages.toLocaleString()}` : "—"} <span class="stat-book-unit">pages</span></div>
                    <div class="stat-book-title">${escapeHtml(data.longestReadBook?.title || "No completed books")}</div>
                </div>
                ${data.longestReadBook?.image_url ? `<img src="${escapeHtml(data.longestReadBook.image_url)}" class="stat-book-thumb" alt="Cover">` : ""}
            </div>
        `;

        let shortestCard = `
            <div class="stat-book-card">
                <div class="stat-book-info">
                    <span class="stat-book-tag">SHORTEST READ</span>
                    <div class="stat-book-pages">${data.shortestReadBook?.pages ? `${data.shortestReadBook.pages.toLocaleString()}` : "—"} <span class="stat-book-unit">pages</span></div>
                    <div class="stat-book-title">${escapeHtml(data.shortestReadBook?.title || "No completed books")}</div>
                </div>
                ${data.shortestReadBook?.image_url ? `<img src="${escapeHtml(data.shortestReadBook.image_url)}" class="stat-book-thumb" alt="Cover">` : ""}
            </div>
        `;

        // Period Comparison Badge
        let compBadge = "";
        if (data.pagesChangePct !== null) {
            const isPos = data.pagesChangePct >= 0;
            compBadge = `<span class="period-comp-badge ${isPos ? "positive" : "negative"}">${isPos ? "▲" : "▼"} ${Math.abs(data.pagesChangePct)}% vs prior</span>`;
        }

        const formattedTime = formatDuration(data.totalMinutes);

        container.innerHTML = `
            <div class="analytics-card">
                <!-- Header with Title & Range Tabs -->
                <div class="analytics-top-bar">
                    <div class="analytics-title-group">
                        <h2 class="analytics-main-title">✨ Reading Stats ✨</h2>
                        <span class="analytics-sub">Personal analytics and progress breakdown</span>
                    </div>

                    <div class="analytics-range-tabs">
                        <button type="button" class="range-tab ${state.analyticsRange === "weekly" ? "active" : ""}" data-range="weekly">Weekly</button>
                        <span class="range-dot">•</span>
                        <button type="button" class="range-tab ${state.analyticsRange === "monthly" ? "active" : ""}" data-range="monthly">Monthly</button>
                        <span class="range-dot">•</span>
                        <button type="button" class="range-tab ${state.analyticsRange === "yearly" ? "active" : ""}" data-range="yearly">Yearly</button>
                        <span class="range-dot">•</span>
                        <button type="button" class="range-tab ${state.analyticsRange === "all" ? "active" : ""}" data-range="all">All time</button>
                    </div>
                </div>

                <!-- Hero Highlights Row: Longest Read, Shortest Read -->
                <div class="analytics-hero-row">
                    ${longestCard}
                    ${shortestCard}
                </div>

                <!-- Key Totals Strip -->
                <div class="analytics-totals-strip">
                    <div class="total-item">
                        <div class="total-val">${data.booksFinished}</div>
                        <div class="total-lbl">Books finished</div>
                    </div>
                    <div class="total-divider"></div>
                    <div class="total-item">
                        <div class="total-val">${data.readingDays}</div>
                        <div class="total-lbl">Days reading</div>
                    </div>
                    <div class="total-divider"></div>
                    <div class="total-item">
                        <div class="total-val">${data.totalPages.toLocaleString()} ${compBadge}</div>
                        <div class="total-lbl">Total pages</div>
                    </div>
                    <div class="total-divider"></div>
                    <div class="total-item">
                        <div class="total-val">${formattedTime}</div>
                        <div class="total-lbl">Total time</div>
                    </div>
                </div>

                <!-- Mode Toggles: Activity vs Time -->
                <div class="analytics-chart-controls">
                    <div class="chart-mode-pill-group">
                        <button type="button" class="chart-mode-pill ${state.analyticsMode === "activity" ? "active" : ""}" data-mode="activity">
                            📖 Activity (${state.analyticsMode === "activity" ? "Pages" : "Pages"})
                        </button>
                        <button type="button" class="chart-mode-pill ${state.analyticsMode === "time" ? "active" : ""}" data-mode="time">
                            ⏱️ Time (Duration)
                        </button>
                    </div>
                    <span class="chart-legend-hint">Hover points for detailed session breakdown</span>
                </div>

                <!-- Interactive SVG Graph -->
                <div id="readingGraphContainer" class="chart-outer-container">
                    ${generateSvgChart(data.chartPoints, state.analyticsMode)}
                </div>

                <!-- Pace & Session Statistics Grid -->
                <div class="analytics-pace-grid">
                    <div class="pace-tile">
                        <div class="pace-icon-wrap">📅</div>
                        <div class="pace-info">
                            <div class="pace-val">~${data.avgPagesPerDay}p</div>
                            <div class="pace-lbl">Avg. per day</div>
                        </div>
                    </div>

                    <div class="pace-tile">
                        <div class="pace-icon-wrap">⏱️</div>
                        <div class="pace-info">
                            <div class="pace-val">${data.totalSessions}</div>
                            <div class="pace-lbl">Total sessions</div>
                        </div>
                    </div>

                    <div class="pace-tile">
                        <div class="pace-icon-wrap">🏆</div>
                        <div class="pace-info">
                            <div class="pace-val">${data.bestDayPages > 0 ? `${data.bestDayPages}p` : "—"}</div>
                            <div class="pace-lbl">Best day ${data.bestDay ? `(${data.bestDay.slice(5)})` : ""}</div>
                        </div>
                    </div>

                    <div class="pace-tile">
                        <div class="pace-icon-wrap">⚡</div>
                        <div class="pace-info">
                            <div class="pace-val">${data.readingSpeed ? `~${data.readingSpeed}p` : "—"}</div>
                            <div class="pace-lbl">Pages / hour</div>
                        </div>
                    </div>

                    <div class="pace-tile">
                        <div class="pace-icon-wrap">📖</div>
                        <div class="pace-info">
                            <div class="pace-val">~${data.avgPagesPerSession}p</div>
                            <div class="pace-lbl">Avg. per session</div>
                        </div>
                    </div>

                    <div class="pace-tile">
                        <div class="pace-icon-wrap">⏳</div>
                        <div class="pace-info">
                            <div class="pace-val">${data.avgSessionDuration > 0 ? `${data.avgSessionDuration}m` : "—"}</div>
                            <div class="pace-lbl">Avg. duration</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wire range tabs
        container.querySelectorAll(".range-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                state.analyticsRange = tab.dataset.range;
                renderReadingAnalytics();
            });
        });

        // Wire mode buttons
        container.querySelectorAll(".chart-mode-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                state.analyticsMode = pill.dataset.mode;
                renderReadingAnalytics();
            });
        });

        // Wire SVG Tooltip hover
        setupChartTooltips(container, data.chartPoints);
    }

    function setupChartTooltips(container, chartPoints) {
        const tooltip = container.querySelector("#chartTooltip");
        const nodeGroups = container.querySelectorAll(".chart-point-group");
        if (!tooltip || !nodeGroups) return;

        nodeGroups.forEach(group => {
            group.addEventListener("mouseenter", (e) => {
                const idx = parseInt(group.dataset.idx, 10);
                const pt = chartPoints[idx];
                if (!pt) return;

                const dateText = pt.date || pt.label;
                const sessionsText = pt.count > 0 ? `(${pt.count} activity logged)` : "(no activity logged)";

                tooltip.innerHTML = `
                    <div class="tooltip-date">${escapeHtml(dateText)}</div>
                    <div class="tooltip-val">${pt.formattedVal}</div>
                    <div class="tooltip-sub">${sessionsText}</div>
                `;

                tooltip.style.display = "block";
                const rect = group.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                const left = rect.left - containerRect.left + (rect.width / 2);
                const top = rect.top - containerRect.top - 55;

                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
                tooltip.style.transform = "translateX(-50%)";
            });

            group.addEventListener("mouseleave", () => {
                tooltip.style.display = "none";
            });
        });
    }

    /* ==============================================================
       FEATURE: LIVE READING SESSION TRACKER & TIMER
       ============================================================== */

    function renderLiveSessionTracker() {
        const container = document.getElementById("bookLiveTrackerWidget");
        if (!container) return;

        const live = state.liveSession;
        const mins = Math.floor(live.elapsedSeconds / 60);
        const secs = live.elapsedSeconds % 60;
        const timeDisplay = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

        // Populate book options (currently reading first, then all)
        const readingBooks = state.books.filter(b => normalizeStatus(b.status) === "currently-reading");
        const otherBooks = state.books.filter(b => normalizeStatus(b.status) !== "currently-reading");
        const allSorted = [...readingBooks, ...otherBooks];

        const optionsHtml = allSorted.map(b => {
            const isSel = b.id === live.bookId ? "selected" : "";
            const isCur = normalizeStatus(b.status) === "currently-reading" ? " (Currently Reading)" : "";
            return `<option value="${escapeHtml(b.id)}" ${isSel}>${escapeHtml(b.title)}${isCur}</option>`;
        }).join("");

        container.innerHTML = `
            <div class="live-tracker-card ${live.active ? "is-running" : ""}">
                <div class="tracker-header">
                    <div class="tracker-title-group">
                        <span class="tracker-badge">⏱️ LIVE SESSION TRACKER</span>
                        <h3 class="tracker-heading">Track Your Reading Session</h3>
                    </div>
                    <div class="tracker-timer-display" id="trackerTimerDisplay">${timeDisplay}</div>
                </div>

                <div class="tracker-controls-row">
                    <div class="tracker-field">
                        <label for="trackerBookSelect">Reading Book:</label>
                        <select id="trackerBookSelect" class="tracker-select" ${live.active ? "disabled" : ""}>
                            <option value="">-- Choose book to read --</option>
                            ${optionsHtml}
                        </select>
                    </div>

                    <div class="tracker-page-inputs">
                        <div class="page-input-wrap">
                            <label for="trackerStartPage">Start Page:</label>
                            <input type="number" id="trackerStartPage" placeholder="e.g. 45" min="1" class="tracker-num-input">
                        </div>
                        <div class="page-input-wrap">
                            <label for="trackerEndPage">End Page:</label>
                            <input type="number" id="trackerEndPage" placeholder="e.g. 75" min="1" class="tracker-num-input">
                        </div>
                    </div>
                </div>

                <div class="tracker-notes-row">
                    <input type="text" id="trackerNotes" placeholder="Optional session notes, chapter thoughts..." class="tracker-notes-input">
                </div>

                <div class="tracker-actions-bar">
                    ${!live.active ? `
                        <button type="button" id="startSessionBtn" class="tracker-btn btn-start">▶ Start Reading Timer</button>
                    ` : `
                        <button type="button" id="pauseSessionBtn" class="tracker-btn btn-pause">${live.paused ? "▶ Resume" : "⏸ Pause"}</button>
                        <button type="button" id="stopSessionBtn" class="tracker-btn btn-stop">⏹ Finish & Log Session</button>
                        <button type="button" id="cancelSessionBtn" class="tracker-btn btn-cancel">✕ Cancel</button>
                    `}
                    <div id="trackerFeedback" class="tracker-feedback"></div>
                </div>
            </div>
        `;

        // Wire event listeners
        const startBtn = document.getElementById("startSessionBtn");
        const pauseBtn = document.getElementById("pauseSessionBtn");
        const stopBtn = document.getElementById("stopSessionBtn");
        const cancelBtn = document.getElementById("cancelSessionBtn");
        const bookSelect = document.getElementById("trackerBookSelect");
        const startPageInput = document.getElementById("trackerStartPage");
        const endPageInput = document.getElementById("trackerEndPage");
        const notesInput = document.getElementById("trackerNotes");
        const feedback = document.getElementById("trackerFeedback");

        if (startBtn) {
            startBtn.addEventListener("click", () => {
                const bookId = bookSelect.value;
                if (!bookId) {
                    if (feedback) feedback.textContent = "Please pick a book first!";
                    return;
                }
                live.active = true;
                live.paused = false;
                live.bookId = bookId;
                live.startTime = new Date();
                live.elapsedSeconds = 0;

                live.intervalId = setInterval(() => {
                    if (!live.paused) {
                        live.elapsedSeconds++;
                        const dEl = document.getElementById("trackerTimerDisplay");
                        if (dEl) {
                            const m = Math.floor(live.elapsedSeconds / 60);
                            const s = live.elapsedSeconds % 60;
                            dEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
                        }
                    }
                }, 1000);

                renderLiveSessionTracker();
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener("click", () => {
                live.paused = !live.paused;
                renderLiveSessionTracker();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                clearInterval(live.intervalId);
                live.active = false;
                live.paused = false;
                live.elapsedSeconds = 0;
                renderLiveSessionTracker();
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener("click", async () => {
                clearInterval(live.intervalId);
                const book = state.books.find(b => b.id === live.bookId);
                const bookTitle = book ? book.title : "Book";

                const startP = Number(startPageInput.value) || 0;
                const endP = Number(endPageInput.value) || 0;
                let pagesRead = 0;
                if (endP > startP) pagesRead = endP - startP;
                else if (endP > 0) pagesRead = endP;

                const durationMins = Math.max(1, Math.round(live.elapsedSeconds / 60));
                const notes = notesInput.value.trim();

                const newSession = {
                    id: "act-" + Date.now(),
                    date: toDateString(new Date()),
                    book_id: live.bookId,
                    book_title: bookTitle,
                    minutes: durationMins,
                    start_page: startP || undefined,
                    end_page: endP || undefined,
                    pages: pagesRead,
                    notes: notes
                };

                state.activities.push(newSession);

                // Save to local storage & Cloudflare
                try {
                    localStorage.setItem("books_reading_activity", JSON.stringify(state.activities));
                    if (window.cfClient) {
                        const cloudState = await window.cfClient.getState().catch(() => ({}));
                        cloudState.reading_activity = state.activities;
                        await window.cfClient.saveState(cloudState).catch(() => {});
                    }
                } catch (_) {}

                // Reset timer
                live.active = false;
                live.paused = false;
                live.elapsedSeconds = 0;

                // Refresh all visualizations immediately
                renderAll();
            });
        }
    }

    /* ==============================================================
       EXISTING FEATURES PRESERVED & ENHANCED
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

    function renderCalendar() {
        const container = document.getElementById("bookCalendarWidget");
        if (!container) return;

        const y = state.calendarYear;
        const m = state.calendarMonth;
        const monthName = MONTH_NAMES[m];

        const firstDay = new Date(y, m, 1);
        const lastDay = new Date(y, m + 1, 0);
        const totalDays = lastDay.getDate();

        let startDay = firstDay.getDay() - 1;
        if (startDay === -1) startDay = 6;

        const activeDaysMap = getVerifiedReadingDays(y);
        const todayStr = toDateString(new Date());

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

        for (let i = 0; i < startDay; i++) {
            html += `<div class="cal-day-cell is-empty"></div>`;
        }

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

    function renderMonthlyActivity() {
        const container = document.getElementById("bookMonthlyWidget");
        if (!container) return;

        const y = state.calendarYear;
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

    function renderShelves() {
        const tabsContainer = document.getElementById("bookShelfTabs");
        const booksGrid = document.querySelector(".books-row");
        if (!tabsContainer || !booksGrid) return;

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

    function renderReadingGoal() {
        const container = document.getElementById("bookChallengeWidget");
        if (!container) return;

        const now = new Date();
        const year = now.getFullYear();
        const targetGoal = (state.goals && state.goals[year]) ? Number(state.goals[year].target) : 12;

        const completed = state.books.filter(b => {
            const norm = normalizeStatus(b.status);
            if (norm !== "read") return false;
            const fin = toDateString(b.date_finished || b.created_at);
            return fin && fin.startsWith(String(year));
        }).length;

        const pct = targetGoal > 0 ? Math.min(100, Math.round((completed / targetGoal) * 100)) : 0;
        const remaining = Math.max(0, targetGoal - completed);

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

        const ratingWrap = document.getElementById("modalBookRating");
        if (ratingWrap) {
            const r = book.rating || 0;
            const full = Math.floor(r);
            ratingWrap.textContent = r > 0 ? "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full)) + ` (${r}/5)` : "Unrated";
        }

        const datesWrap = document.getElementById("modalBookDates");
        if (datesWrap) {
            let dateText = [];
            if (book.date_started) dateText.push(`Started: ${book.date_started}`);
            if (book.date_finished) dateText.push(`Finished: ${book.date_finished}`);
            datesWrap.textContent = dateText.length > 0 ? dateText.join(" • ") : "No dates recorded";
        }

        const reviewEl = document.getElementById("modalBookNotes");
        if (reviewEl) {
            reviewEl.textContent = book.review || book.notes || "No notes logged for this book.";
        }

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

        const updateStatusBtn = document.getElementById("modalUpdateStatusBtn");
        if (updateStatusBtn) {
            updateStatusBtn.onclick = async () => {
                const newStatus = statusSelect.value;
                book.status = newStatus;

                if (newStatus === "read" && !book.date_finished) {
                    book.date_finished = toDateString(new Date());
                }

                saveBookOverride(book.id, {
                    status: newStatus,
                    date_finished: book.date_finished
                });

                renderAll();
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
       INITIALIZATION & RENDERING
       ============================================================== */

    function populateStateFromData(cloudBooks = [], cloudState = {}) {
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

        const booksMap = new Map();

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
    }

    let searchInitialized = false;

    function renderAll() {
        renderReadingGoal();
        renderStreakDashboard();
        renderLiveSessionTracker();
        renderReadingAnalytics();
        renderCalendar();
        renderMonthlyActivity();
        renderShelves();
        setupBookDetailModal();

        if (!searchInitialized) {
            searchInitialized = true;
            const searchInput = document.getElementById("bookSearchInput");
            if (searchInput) {
                searchInput.addEventListener("input", (e) => {
                    state.searchQuery = e.target.value.trim();
                    renderShelves();
                });
            }
        }
    }

    async function initBooks() {
        // 1. Instant local render (0ms delay)
        populateStateFromData([], {});
        renderAll();

        // 2. Asynchronous remote sync
        try {
            if (window.cfClient) {
                const [booksRes, stateRes] = await Promise.all([
                    window.cfClient.getRecords("books").catch(() => []),
                    window.cfClient.getState().catch(() => ({}))
                ]);
                const cloudBooks = Array.isArray(booksRes) ? booksRes : [];
                const cloudState = stateRes || {};
                populateStateFromData(cloudBooks, cloudState);
                renderAll();
            }
        } catch (e) {
            console.warn("Could not sync remote books:", e);
        }
    }

    window.refreshBooksExperience = initBooks;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initBooks);
    } else {
        initBooks();
    }
})();
