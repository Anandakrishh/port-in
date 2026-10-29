/**
 * ==============================================================
 * Books Section Architecture & Reading Experience Engine
 * - Reading Overview & Annual Reading Challenge
 * - Reading Streak Dashboard (Current, Best, Total Days, Books Read)
 * - Live Reading Session Stopwatch, Manual Logger & Review Drawer
 * - Deep Reading Analytics & Interactive Vector SVG Graph
 *   (Weekly, Monthly, Yearly, All-Time; Activity vs Time modes;
 *    Pace metrics: Speed, Avg/Session, Best Day, Longest/Shortest)
 * - Interactive Reading Calendar (7-column grid, active dates, inspector)
 * - Monthly Reading Activity Breakdown (Books / Pages / Time modes, month inspector)
 * - Shelves & Reading Status Filter (All, Read, Reading, Want to Read)
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
        selectedMonth: null, // For monthly inspector
        monthlyMode: "books", // 'books' | 'pages' | 'time'
        analyticsRange: "yearly", // 'weekly' | 'monthly' | 'yearly' | 'all'
        analyticsMode: "activity", // 'activity' | 'time'
        showRecordedSessions: false,
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

    // Reading sessions initial state: clean slate
    const DEFAULT_ACTIVITIES = [];

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

        // Derived strictly from recorded reading activity sessions
        state.activities.forEach(act => {
            if (!act || !act.date) return;
            const d = toDateString(act.date);
            if (!d) return;
            if (year && !d.startsWith(`${year}-`)) return;

            if (!dateMap.has(d)) dateMap.set(d, []);
            dateMap.get(d).push({
                type: "session",
                id: act.id,
                bookId: act.book_id,
                bookTitle: act.book_title,
                pages: act.pages || 0,
                startPage: act.start_page,
                endPage: act.end_page,
                notes: act.notes || "",
                minutes: act.minutes || 0
            });
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

        const isInRange = (d, s, e) => (!s || d >= s) && (!e || d <= e);

        const currentSessions = state.activities.filter(a => a && a.date && isInRange(toDateString(a.date), startDate, endDate));
        const priorSessions = state.activities.filter(a => a && a.date && isInRange(toDateString(a.date), priorStartDate, priorEndDate));

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

        // 1. Total Pages (strictly from tracked reading sessions)
        const totalPages = currentSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);
        const priorPages = priorSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);

        // 2. Total Reading Duration
        const totalMinutes = currentSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
        const priorMinutes = priorSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

        // 3. Unique Reading Days (strictly from tracked reading sessions)
        const readingDaySet = new Set();
        currentSessions.forEach(s => s.date && readingDaySet.add(toDateString(s.date)));
        const readingDays = readingDaySet.size;

        // 4. Books Finished
        const booksFinished = currentCompletedBooks.length;
        const priorBooksFinished = priorCompletedBooks.length;

        // 5. Total Sessions
        const totalSessions = currentSessions.length;

        // 6. Longest Read & Shortest Read (Books)
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

        let validSpeedMinutes = 0;
        let validSpeedPages = 0;
        currentSessions.forEach(s => {
            if ((s.minutes || 0) > 0 && (s.pages || 0) > 0) {
                validSpeedMinutes += s.minutes;
                validSpeedPages += s.pages;
            }
        });
        const readingSpeed = validSpeedMinutes >= 10 ? Math.round((validSpeedPages / validSpeedMinutes) * 60) : null;

        // 8. Best Reading Day (date with maximum pages read in sessions)
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
        } else if (range === "yearly") {
            const y = now.getFullYear();
            for (let i = 0; i < 12; i++) {
                const prefix = `${y}-${String(i + 1).padStart(2, "0")}`;
                const monthSessions = currentSessions.filter(s => toDateString(s.date).startsWith(prefix));
                const monthBooks = currentCompletedBooks.filter(b => toDateString(b.date_finished || b.created_at).startsWith(prefix));

                const monthPages = monthSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);

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
        } else {
            // All Time: Aggregate across recorded years
            const curY = now.getFullYear();
            const years = [curY - 2, curY - 1, curY];
            years.forEach(yr => {
                const prefix = `${yr}-`;
                const yrSessions = state.activities.filter(s => toDateString(s.date).startsWith(prefix));
                const yrBooks = state.books.filter(b => normalizeStatus(b.status) === "read" && toDateString(b.date_finished || b.created_at).startsWith(prefix));

                const yrPages = yrSessions.reduce((sum, s) => sum + (Number(s.pages) || 0), 0);

                const yrMins = yrSessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
                const val = mode === "time" ? yrMins : yrPages;
                const formatted = mode === "time" ? formatDuration(yrMins) : `${yrPages}p`;

                chartPoints.push({
                    label: String(yr),
                    subLabel: "Year",
                    date: `Year ${yr}`,
                    value: val,
                    formattedVal: formatted,
                    count: yrSessions.length + yrBooks.length
                });
            });
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

        let compBadge = "";
        if (data.pagesChangePct !== null) {
            const isPos = data.pagesChangePct >= 0;
            compBadge = `<span class="period-comp-badge ${isPos ? "positive" : "negative"}">${isPos ? "▲" : "▼"} ${Math.abs(data.pagesChangePct)}% vs prior</span>`;
        }

        const formattedTime = formatDuration(data.totalMinutes);

        // Longest & Shortest Session labels
        const longestSessionText = data.longestSession ? `${data.longestSession.minutes}m` : "—";
        const shortestSessionText = data.shortestSession ? `${data.shortestSession.minutes}m` : "—";

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
                            <div class="pace-val">${longestSessionText} / ${shortestSessionText}</div>
                            <div class="pace-lbl">Longest / Shortest</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelectorAll(".range-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                state.analyticsRange = tab.dataset.range;
                renderReadingAnalytics();
            });
        });

        container.querySelectorAll(".chart-mode-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                state.analyticsMode = pill.dataset.mode;
                renderReadingAnalytics();
            });
        });

        setupChartTooltips(container, data.chartPoints);
    }

    function setupChartTooltips(container, chartPoints) {
        const tooltip = container.querySelector("#chartTooltip");
        const nodeGroups = container.querySelectorAll(".chart-point-group");
        if (!tooltip || !nodeGroups) return;

        nodeGroups.forEach(group => {
            group.addEventListener("mouseenter", () => {
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

        // Default selected book if none set
        if (!live.bookId && readingBooks.length > 0) {
            live.bookId = readingBooks[0].id;
        }

        const optionsHtml = allSorted.map(b => {
            const isSel = b.id === live.bookId ? "selected" : "";
            const isCur = normalizeStatus(b.status) === "currently-reading" ? " (Currently Reading)" : "";
            return `<option value="${escapeHtml(b.id)}" ${isSel}>${escapeHtml(b.title)}${isCur}</option>`;
        }).join("");

        // Find last recorded end page for selected book to suggest starting page
        let suggestedStartPage = "";
        if (live.bookId) {
            const bookSessions = state.activities.filter(a => a.book_id === live.bookId);
            if (bookSessions.length > 0) {
                const lastSession = bookSessions[bookSessions.length - 1];
                if (lastSession.end_page) {
                    suggestedStartPage = Number(lastSession.end_page) + 1;
                }
            }
        }

        // Build recorded sessions history items
        const sortedActivities = [...state.activities].reverse();
        let sessionsListHtml = "";

        if (sortedActivities.length === 0) {
            sessionsListHtml = `<p class="tracker-empty-history">No sessions recorded yet. Start the timer above to log your first reading session!</p>`;
        } else {
            sessionsListHtml = sortedActivities.map(act => {
                const pageText = (act.start_page && act.end_page)
                    ? `p. ${act.start_page} – ${act.end_page} (${act.pages}p)`
                    : (act.pages ? `${act.pages} pages` : "Session");
                const notesText = act.notes ? `<span class="session-item-notes">"${escapeHtml(act.notes)}"</span>` : "";

                return `
                    <div class="tracker-session-item" data-id="${escapeHtml(act.id)}">
                        <div class="session-item-left">
                            <span class="session-item-date">${escapeHtml(act.date)}</span>
                            <span class="session-item-title">${escapeHtml(act.book_title || "Book")}</span>
                            <span class="session-item-pill">${escapeHtml(pageText)}</span>
                            <span class="session-item-pill">⏱️ ${act.minutes || 0}m</span>
                            ${notesText}
                        </div>
                        <button type="button" class="session-delete-btn" data-id="${escapeHtml(act.id)}" aria-label="Delete session">✕ Delete</button>
                    </div>
                `;
            }).join("");
        }

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
                            <input type="number" id="trackerStartPage" placeholder="e.g. 45" value="${suggestedStartPage}" min="1" class="tracker-num-input">
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

                <!-- Manual Duration logging fallback if not using live stopwatch -->
                ${!live.active ? `
                    <div class="tracker-manual-row">
                        <span class="manual-label">📖 Read offline? Log past session:</span>
                        <div class="manual-input-group">
                            <span>Minutes:</span>
                            <input type="number" id="trackerManualMinutes" placeholder="30" min="1" max="600" class="tracker-manual-input">
                            <button type="button" id="manualLogBtn" class="tracker-btn btn-start" style="padding: 6px 12px; font-size: 12px;">💾 Log</button>
                        </div>
                    </div>
                ` : ""}

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

                <!-- Recorded Sessions History Review Section -->
                <div class="tracker-history-section">
                    <button type="button" id="trackerHistoryToggleBtn" class="tracker-history-toggle">
                        📋 ${state.showRecordedSessions ? "Hide" : "View"} Recorded Sessions (${state.activities.length}) ${state.showRecordedSessions ? "▲" : "▼"}
                    </button>
                    <div id="trackerHistoryDrawer" class="tracker-history-drawer ${state.showRecordedSessions ? "is-open" : ""}">
                        <div class="tracker-sessions-list">
                            ${sessionsListHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Wire event listeners
        const startBtn = document.getElementById("startSessionBtn");
        const pauseBtn = document.getElementById("pauseSessionBtn");
        const stopBtn = document.getElementById("stopSessionBtn");
        const cancelBtn = document.getElementById("cancelSessionBtn");
        const manualLogBtn = document.getElementById("manualLogBtn");
        const bookSelect = document.getElementById("trackerBookSelect");
        const startPageInput = document.getElementById("trackerStartPage");
        const endPageInput = document.getElementById("trackerEndPage");
        const manualMinutesInput = document.getElementById("trackerManualMinutes");
        const notesInput = document.getElementById("trackerNotes");
        const feedback = document.getElementById("trackerFeedback");
        const historyToggleBtn = document.getElementById("trackerHistoryToggleBtn");

        // Toggle review sessions drawer
        if (historyToggleBtn) {
            historyToggleBtn.addEventListener("click", () => {
                state.showRecordedSessions = !state.showRecordedSessions;
                renderLiveSessionTracker();
            });
        }

        // Delete recorded session handler
        container.querySelectorAll(".session-delete-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const actId = btn.dataset.id;
                if (!window.confirm("Are you sure you want to delete this recorded reading session?")) return;

                state.activities = state.activities.filter(a => a.id !== actId);
                try {
                    localStorage.setItem("books_reading_activity", JSON.stringify(state.activities));
                    if (window.cfClient) {
                        const cloudState = await window.cfClient.getState().catch(() => ({}));
                        cloudState.reading_activity = state.activities;
                        await window.cfClient.saveState(cloudState).catch(() => {});
                    }
                } catch (_) {}

                renderAll();
            });
        });

        // Book select changes
        if (bookSelect) {
            bookSelect.addEventListener("change", () => {
                live.bookId = bookSelect.value;
                // Auto-suggest starting page
                if (live.bookId) {
                    const bookSessions = state.activities.filter(a => a.book_id === live.bookId);
                    if (bookSessions.length > 0) {
                        const last = bookSessions[bookSessions.length - 1];
                        if (last.end_page && startPageInput) {
                            startPageInput.value = Number(last.end_page) + 1;
                        }
                    }
                }
            });
        }

        // Input validation helper
        function validatePages() {
            const startP = Number(startPageInput?.value) || 0;
            const endP = Number(endPageInput?.value) || 0;

            if (startPageInput) startPageInput.classList.remove("has-error");
            if (endPageInput) endPageInput.classList.remove("has-error");

            if (startP < 0 || endP < 0) {
                if (feedback) feedback.textContent = "Page numbers cannot be negative.";
                return false;
            }

            if (startP > 0 && endP > 0 && endP < startP) {
                if (endPageInput) endPageInput.classList.add("has-error");
                if (feedback) feedback.textContent = "End page cannot be less than start page.";
                return false;
            }

            if (feedback) feedback.textContent = "";
            return true;
        }

        if (startPageInput) startPageInput.addEventListener("input", validatePages);
        if (endPageInput) endPageInput.addEventListener("input", validatePages);

        function updateTabLiveBadge() {
            // Live badge removed from navigation UI per requirements
        }

        // Helper: start timer stopwatch
        function startLiveTimer(bookId) {
            if (live.active) return;
            live.active = true;
            live.paused = false;
            live.bookId = bookId || (bookSelect ? bookSelect.value : live.bookId);
            live.startTime = new Date();
            live.elapsedSeconds = 0;

            clearInterval(live.intervalId);
            live.intervalId = setInterval(() => {
                if (!live.paused) {
                    live.elapsedSeconds++;
                    const dEl = document.getElementById("trackerTimerDisplay");
                    if (dEl) {
                        const m = Math.floor(live.elapsedSeconds / 60);
                        const s = live.elapsedSeconds % 60;
                        dEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
                    }
                    updateTabLiveBadge();
                }
            }, 1000);

            updateTabLiveBadge();
            renderLiveSessionTracker();
        }

        // Helper: prompt for 5-digit PIN (reusable for timer and offline logging)
        function promptForReadingPin(onVerified, onCancel) {
            const modal = document.getElementById("readingPinModal");
            const backdrop = document.getElementById("readingPinBackdrop");
            const closeBtn = document.getElementById("readingPinCloseBtn");
            const cancelBtn = document.getElementById("readingPinCancelBtn");
            const form = document.getElementById("readingPinForm");
            const pinInput = document.getElementById("readingPinInput");
            const verifyBtn = document.getElementById("readingPinVerifyBtn");
            const feedbackEl = document.getElementById("readingPinFeedback");

            if (!modal) {
                if (typeof onVerified === "function") onVerified();
                return;
            }

            let isOpen = true;

            const closeModal = (wasCancelled = false) => {
                if (!isOpen) return;
                isOpen = false;
                modal.classList.remove("active");
                modal.setAttribute("aria-hidden", "true");
                document.body.style.overflow = "";
                cleanup();
                if (wasCancelled && typeof onCancel === "function") {
                    onCancel();
                }
            };

            const cleanup = () => {
                if (closeBtn) closeBtn.removeEventListener("click", handleClose);
                if (cancelBtn) cancelBtn.removeEventListener("click", handleClose);
                if (backdrop) backdrop.removeEventListener("click", handleClose);
                document.removeEventListener("keydown", onKeyDown);
            };

            const handleClose = () => closeModal(true);

            const onKeyDown = (e) => {
                if (e.key === "Escape") {
                    closeModal(true);
                }
            };

            if (pinInput) {
                pinInput.value = "";
                pinInput.classList.remove("is-invalid");
            }
            if (feedbackEl) {
                feedbackEl.textContent = "";
                feedbackEl.className = "reading-pin-feedback";
            }
            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.textContent = "Verify";
            }

            modal.classList.add("active");
            modal.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";

            setTimeout(() => {
                if (pinInput) pinInput.focus();
            }, 60);

            if (closeBtn) closeBtn.addEventListener("click", handleClose);
            if (cancelBtn) cancelBtn.addEventListener("click", handleClose);
            if (backdrop) backdrop.addEventListener("click", handleClose);
            document.addEventListener("keydown", onKeyDown);

            if (pinInput && !pinInput.dataset.wired) {
                pinInput.dataset.wired = "true";
                pinInput.addEventListener("input", (e) => {
                    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 5);
                    pinInput.classList.remove("is-invalid");
                    if (feedbackEl) {
                        feedbackEl.textContent = "";
                        feedbackEl.className = "reading-pin-feedback";
                    }
                    if (verifyBtn) {
                        verifyBtn.disabled = e.target.value.length !== 5;
                    }
                });
            }

            const onSubmit = async (e) => {
                if (e) e.preventDefault();
                const pin = pinInput ? pinInput.value.trim() : "";
                if (!/^\d{5}$/.test(pin)) {
                    if (feedbackEl) {
                        feedbackEl.textContent = "Please enter a five-digit numeric PIN.";
                        feedbackEl.className = "reading-pin-feedback has-error";
                    }
                    if (pinInput) pinInput.classList.add("is-invalid");
                    return;
                }

                if (verifyBtn) {
                    verifyBtn.disabled = true;
                    verifyBtn.textContent = "Verifying...";
                }

                try {
                    if (window.cfClient && typeof window.cfClient.verifyReadingPin === "function") {
                        await window.cfClient.verifyReadingPin(pin);
                    }
                    closeModal(false);
                    if (typeof onVerified === "function") onVerified(pin);
                } catch (err) {
                    console.warn("PIN verification failed:", err);
                    if (verifyBtn) {
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = "Verify";
                    }
                    if (feedbackEl) {
                        feedbackEl.textContent = err.message || "Incorrect PIN. Please try again.";
                        feedbackEl.className = "reading-pin-feedback has-error";
                    }
                    if (pinInput) {
                        pinInput.classList.add("is-invalid");
                        pinInput.select();
                        pinInput.focus();
                    }
                }
            };

            if (form) form.onsubmit = onSubmit;
        }

        // Start timer (PIN protected)
        if (startBtn) {
            startBtn.addEventListener("click", async () => {
                if (live.active) return; // Prevent repeated clicks

                const bookId = bookSelect ? bookSelect.value : "";
                if (!bookId) {
                    if (feedback) feedback.textContent = "Please pick a book first!";
                    return;
                }
                if (!validatePages()) return;

                startBtn.disabled = true;

                let securityStatus = { enabled: false };
                try {
                    if (window.cfClient && typeof window.cfClient.getReadingSecurityStatus === "function") {
                        securityStatus = await window.cfClient.getReadingSecurityStatus();
                    }
                } catch (err) {
                    console.warn("Could not check reading security status:", err);
                } finally {
                    startBtn.disabled = false;
                }

                if (securityStatus && securityStatus.enabled) {
                    promptForReadingPin((verifiedPin) => {
                        live.verifiedPin = verifiedPin;
                        startLiveTimer(bookId);
                    }, () => {
                        if (startBtn) startBtn.disabled = false;
                    });
                } else {
                    live.verifiedPin = null;
                    startLiveTimer(bookId);
                }
            });
        }

        // Pause/Resume timer
        if (pauseBtn) {
            pauseBtn.addEventListener("click", () => {
                live.paused = !live.paused;
                updateTabLiveBadge();
                renderLiveSessionTracker();
            });
        }

        // Cancel timer
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                clearInterval(live.intervalId);
                live.active = false;
                live.paused = false;
                live.elapsedSeconds = 0;
                live.verifiedPin = null;
                updateTabLiveBadge();
                renderLiveSessionTracker();
            });
        }

        // Stop & Log session (from timer)
        if (stopBtn) {
            stopBtn.addEventListener("click", async () => {
                if (!validatePages()) return;

                stopBtn.disabled = true;
                clearInterval(live.intervalId);
                updateTabLiveBadge();

                const book = state.books.find(b => b.id === live.bookId);
                const bookTitle = book ? book.title : "Book";

                const startP = Number(startPageInput ? startPageInput.value : 0) || 0;
                const endP = Number(endPageInput ? endPageInput.value : 0) || 0;
                let pagesRead = 0;
                if (endP > startP) pagesRead = endP - startP;
                else if (endP > 0) pagesRead = endP;

                const durationMins = Math.max(1, Math.round(live.elapsedSeconds / 60));
                const notes = notesInput ? notesInput.value.trim() : "";

                const newSession = {
                    id: "act-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                    date: toDateString(new Date()),
                    book_id: live.bookId,
                    book_title: bookTitle,
                    minutes: durationMins,
                    start_page: startP || undefined,
                    end_page: endP || undefined,
                    pages: pagesRead,
                    notes: notes
                };

                if (!state.activities.some(a => a.id === newSession.id)) {
                    state.activities.push(newSession);
                }

                try {
                    localStorage.setItem("books_reading_activity", JSON.stringify(state.activities));
                    if (window.cfClient && typeof window.cfClient.logReadingSession === "function") {
                        await window.cfClient.logReadingSession(newSession, live.verifiedPin).catch(() => {});
                    } else if (window.cfClient) {
                        const cloudState = await window.cfClient.getState().catch(() => ({}));
                        cloudState.reading_activity = state.activities;
                        await window.cfClient.saveState(cloudState).catch(() => {});
                    }
                } catch (_) {}

                live.active = false;
                live.paused = false;
                live.elapsedSeconds = 0;
                live.verifiedPin = null;

                renderAll();
            });
        }

        // Manual log without timer (with identical PIN protection & duplicate submission prevention)
        let isLoggingOffline = false;

        if (manualLogBtn) {
            manualLogBtn.addEventListener("click", async () => {
                if (isLoggingOffline) return; // Prevent repeated clicks

                const bookId = bookSelect ? bookSelect.value : "";
                if (!bookId) {
                    if (feedback) feedback.textContent = "Please pick a book first!";
                    return;
                }
                if (!validatePages()) return;

                const manualMins = Number(manualMinutesInput?.value) || 0;
                if (manualMins <= 0) {
                    if (feedback) feedback.textContent = "Please enter minutes read (e.g. 30).";
                    return;
                }

                const startP = Number(startPageInput ? startPageInput.value : 0) || 0;
                const endP = Number(endPageInput ? endPageInput.value : 0) || 0;
                let pagesRead = 0;
                if (endP > startP) pagesRead = endP - startP;
                else if (endP > 0) pagesRead = endP;

                const notes = notesInput ? notesInput.value.trim() : "";
                const book = state.books.find(b => b.id === bookId);
                const bookTitle = book ? book.title : "Book";

                // Function to execute the actual saving once authorized
                const executeOfflineLog = async (verifiedPin) => {
                    isLoggingOffline = true;
                    if (manualLogBtn) {
                        manualLogBtn.disabled = true;
                        manualLogBtn.textContent = "Saving...";
                    }

                    const newSession = {
                        id: "act-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
                        date: toDateString(new Date()),
                        book_id: bookId,
                        book_title: bookTitle,
                        minutes: manualMins,
                        start_page: startP || undefined,
                        end_page: endP || undefined,
                        pages: pagesRead,
                        notes: notes
                    };

                    // Prevent duplicate entry
                    if (!state.activities.some(a => a.id === newSession.id)) {
                        state.activities.push(newSession);
                    }

                    try {
                        localStorage.setItem("books_reading_activity", JSON.stringify(state.activities));
                        if (window.cfClient && typeof window.cfClient.logReadingSession === "function") {
                            await window.cfClient.logReadingSession(newSession, verifiedPin).catch(err => {
                                console.warn("Failed syncing offline session to Cloudflare:", err);
                            });
                        } else if (window.cfClient) {
                            const cloudState = await window.cfClient.getState().catch(() => ({}));
                            cloudState.reading_activity = state.activities;
                            await window.cfClient.saveState(cloudState).catch(() => {});
                        }
                    } catch (e) {
                        console.warn("Storage sync error:", e);
                    }

                    // Reset only inputs that belong to the logged session
                    if (manualMinutesInput) manualMinutesInput.value = "";
                    if (notesInput) notesInput.value = "";
                    if (feedback) feedback.textContent = "";

                    isLoggingOffline = false;
                    renderAll();
                };

                // Check security status (reusing Admin-configured PIN)
                manualLogBtn.disabled = true;
                let securityStatus = { enabled: false };
                try {
                    if (window.cfClient && typeof window.cfClient.getReadingSecurityStatus === "function") {
                        securityStatus = await window.cfClient.getReadingSecurityStatus();
                    }
                } catch (err) {
                    console.warn("Could not check reading security status:", err);
                } finally {
                    if (!securityStatus.enabled && manualLogBtn) {
                        manualLogBtn.disabled = false;
                    }
                }

                if (securityStatus && securityStatus.enabled) {
                    promptForReadingPin(async (verifiedPin) => {
                        await executeOfflineLog(verifiedPin);
                    }, () => {
                        // User cancelled or closed the modal: keep all form inputs intact!
                        isLoggingOffline = false;
                        if (manualLogBtn) {
                            manualLogBtn.disabled = false;
                            manualLogBtn.textContent = "💾 Log";
                        }
                    });
                } else {
                    await executeOfflineLog(null);
                }
            });
        }
    }

    /* ==============================================================
       SECTION 1: READING OVERVIEW & ANNUAL CHALLENGE
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
                    <span class="challenge-goal-badge" id="challengeGoalBadge" aria-label="Annual reading goal">
                        Annual Goal: ${targetGoal} ${targetGoal === 1 ? "book" : "books"}
                    </span>
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
    }

    /* ==============================================================
       FEATURE: INTERACTIVE 7-COLUMN CALENDAR
       ============================================================== */

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
            const bookTitle = b ? `"${escapeHtml(b.title)}"` : (s.bookTitle ? `"${escapeHtml(s.bookTitle)}"` : "a book");
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
       FEATURE: MONTHLY READING ACTIVITY BREAKDOWN & INSPECTOR
       ============================================================== */

    function renderMonthlyActivity() {
        const container = document.getElementById("bookMonthlyWidget");
        if (!container) return;

        const y = state.calendarYear;
        const mode = state.monthlyMode; // 'books' | 'pages' | 'time'

        // Aggregate monthly metrics for the year
        const monthlyCompletedBooks = Array.from({ length: 12 }, () => []);
        const monthlyPages = Array(12).fill(0);
        const monthlyMinutes = Array(12).fill(0);
        const monthlyActiveDays = Array.from({ length: 12 }, () => new Set());

        // From completed books
        state.books.forEach(b => {
            const norm = normalizeStatus(b.status);
            if (norm !== "read") return;
            const fin = toDateString(b.date_finished || b.created_at);
            if (!fin || !fin.startsWith(`${y}-`)) return;

            const mIdx = parseInt(fin.split("-")[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
                monthlyCompletedBooks[mIdx].push(b);
            }
        });

        // From activity sessions
        state.activities.forEach(act => {
            if (!act || !act.date) return;
            const d = toDateString(act.date);
            if (!d || !d.startsWith(`${y}-`)) return;

            const mIdx = parseInt(d.split("-")[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
                monthlyPages[mIdx] += Number(act.pages) || 0;
                monthlyMinutes[mIdx] += Number(act.minutes) || 0;
                monthlyActiveDays[mIdx].add(d);
            }
        });

        // Determine values based on active mode
        let values = [];
        let maxVal = 1;
        let totalYearCompleted = monthlyCompletedBooks.reduce((a, b) => a + b.length, 0);
        let totalYearPages = monthlyPages.reduce((a, b) => a + b, 0);
        let totalYearMinutes = monthlyMinutes.reduce((a, b) => a + b, 0);

        if (mode === "pages") {
            values = monthlyPages;
            maxVal = Math.max(1, ...values);
        } else if (mode === "time") {
            values = monthlyMinutes;
            maxVal = Math.max(1, ...values);
        } else {
            // books
            values = monthlyCompletedBooks.map(arr => arr.length);
            maxVal = Math.max(1, ...values);
        }

        let subText = `${totalYearCompleted} books completed in ${y}`;
        if (mode === "pages") subText = `${totalYearPages.toLocaleString()} pages read in ${y}`;
        if (mode === "time") subText = `${formatDuration(totalYearMinutes)} spent reading in ${y}`;

        let html = `
            <div class="monthly-header">
                <div class="monthly-title-group">
                    <h3 class="monthly-title">Monthly Reading Activity — ${y}</h3>
                    <span class="monthly-sub">${subText}</span>
                </div>
                <div class="monthly-metric-group">
                    <button type="button" class="monthly-metric-btn ${mode === "books" ? "active" : ""}" data-mode="books">📚 Books</button>
                    <button type="button" class="monthly-metric-btn ${mode === "pages" ? "active" : ""}" data-mode="pages">📄 Pages</button>
                    <button type="button" class="monthly-metric-btn ${mode === "time" ? "active" : ""}" data-mode="time">⏱️ Time</button>
                </div>
            </div>
            <div class="monthly-bars-list">
        `;

        for (let i = 0; i < 12; i++) {
            const val = values[i];
            const books = monthlyCompletedBooks[i];
            const pct = Math.round((val / maxVal) * 100);
            const mName = MONTH_SHORT[i];
            const isSelected = state.selectedMonth === i;

            const thumbnails = books.slice(0, 4).map(b => `
                <img src="${escapeHtml(b.image_url)}" class="monthly-thumb" title="${escapeHtml(b.title)}" alt="${escapeHtml(b.title)}">
            `).join("");

            let endLabel = "—";
            if (val > 0) {
                if (mode === "pages") endLabel = `${val}p`;
                else if (mode === "time") endLabel = formatDuration(val);
                else endLabel = `${val} book${val === 1 ? "" : "s"}`;
            }

            html += `
                <div class="monthly-row ${val > 0 ? "has-books" : ""} ${isSelected ? "is-selected" : ""}" data-month="${i}" role="button" tabindex="0" aria-label="${MONTH_NAMES[i]} activity">
                    <span class="monthly-month-name">${mName}</span>
                    <div class="monthly-bar-track">
                        <div class="monthly-bar-fill" style="width: ${val > 0 ? Math.max(8, pct) : 0}%;">
                            ${val > 0 ? `<span class="monthly-bar-count">${mode === "time" ? formatDuration(val) : val}</span>` : ""}
                        </div>
                    </div>
                    <div class="monthly-covers-wrap">
                        ${thumbnails}
                        ${books.length > 4 ? `<span class="monthly-more">+${books.length - 4}</span>` : ""}
                    </div>
                    <span class="monthly-end-count">${endLabel}</span>
                </div>
            `;
        }

        html += `</div>`;

        // Monthly Inspector Drawer if a month is selected
        if (state.selectedMonth !== null) {
            const sM = state.selectedMonth;
            const selBooks = monthlyCompletedBooks[sM];
            const selPages = monthlyPages[sM];
            const selMins = monthlyMinutes[sM];
            const selDays = monthlyActiveDays[sM].size;

            let booksListHtml = "";
            if (selBooks.length > 0) {
                booksListHtml = selBooks.map(b => `
                    <div class="month-book-entry">
                        <img src="${escapeHtml(b.image_url)}" alt="${escapeHtml(b.title)}">
                        <div>
                            <strong>${escapeHtml(b.title)}</strong> by ${escapeHtml(b.author || "Unknown")}
                            ${b.pages ? ` (${b.pages}p)` : ""}
                        </div>
                    </div>
                `).join("");
            } else {
                booksListHtml = `<span style="font-size: 11.5px; color: #777; font-style: italic;">No books completed this month.</span>`;
            }

            html += `
                <div class="monthly-detail-drawer">
                    <div class="month-detail-card">
                        <div class="month-detail-header">
                            <h4 class="month-detail-title">📖 ${MONTH_NAMES[sM]} ${y} Overview</h4>
                            <button type="button" class="month-sync-cal-btn" id="monthSyncCalBtn">📅 View in Calendar</button>
                        </div>
                        <div class="month-detail-stats-row">
                            <span class="month-stat-chip">📅 ${selDays} active days</span>
                            <span class="month-stat-chip">📄 ${selPages} pages read</span>
                            <span class="month-stat-chip">⏱️ ${formatDuration(selMins)} duration</span>
                            <span class="month-stat-chip">📚 ${selBooks.length} finished</span>
                        </div>
                        <div class="month-books-list">
                            ${booksListHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Wire metric selector buttons
        container.querySelectorAll(".monthly-metric-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                state.monthlyMode = btn.dataset.mode;
                renderMonthlyActivity();
            });
        });

        // Wire month rows click to inspect
        container.querySelectorAll(".monthly-row").forEach(row => {
            row.addEventListener("click", () => {
                const mIdx = parseInt(row.dataset.month, 10);
                if (state.selectedMonth === mIdx) {
                    state.selectedMonth = null;
                } else {
                    state.selectedMonth = mIdx;
                }
                renderMonthlyActivity();
            });
        });

        // Wire "View in Calendar" button
        document.getElementById("monthSyncCalBtn")?.addEventListener("click", () => {
            if (state.selectedMonth !== null) {
                state.calendarMonth = state.selectedMonth;
                state.calendarYear = y;
                renderCalendar();
                document.getElementById("bookCalendarWidget")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
    }

    /* ==============================================================
       FEATURE: SHELVES & SEARCH BAR
       ============================================================== */

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

        const libraryCountBadge = document.getElementById("libraryCountBadge");
        if (libraryCountBadge) {
            libraryCountBadge.textContent = counts.all;
        }

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

    /* ==============================================================
       FEATURE: BOOK DETAIL & HISTORY MODAL
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
                        <span class="timeline-desc">${a.pages ? `${a.pages} pages read` : "Reading session"}${a.minutes ? ` (${a.minutes}m)` : ""}${a.notes ? ` — "${escapeHtml(a.notes)}"` : ""}</span>
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
            const rawAct = localStorage.getItem("books_reading_activity");
            if (rawAct) localActivities = JSON.parse(rawAct);
            localGoals = JSON.parse(localStorage.getItem("books_reading_goals") || "{}");
        } catch (_) {}

        state.overrides = { ...CATALOG_DEFAULTS, ...localOverrides, ...(cloudState.overrides || {}) };

        if (Array.isArray(cloudState.reading_activity)) {
            state.activities = cloudState.reading_activity;
        } else if (Array.isArray(localActivities) && localActivities.length > 0) {
            state.activities = localActivities;
        } else {
            state.activities = [];
        }

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

    /* ==============================================================
       PRIMARY BOOKS VIEW NAVIGATION (Library | Insights | Sessions)
       ============================================================== */
    let viewNavInitialized = false;

    function setupViewNavigation() {
        const tabBtns = document.querySelectorAll(".view-tab-btn");
        const panels = {
            library: document.getElementById("viewLibrary"),
            insights: document.getElementById("viewInsights"),
            sessions: document.getElementById("viewSessions")
        };

        function activateView(viewName, updateHistory = true) {
            const validViews = ["library", "insights", "sessions"];
            const targetView = validViews.includes(viewName) ? viewName : "library";
            state.activeView = targetView;

            tabBtns.forEach(btn => {
                const isTarget = btn.dataset.view === targetView;
                btn.classList.toggle("active", isTarget);
                btn.setAttribute("aria-selected", isTarget ? "true" : "false");
                btn.setAttribute("tabindex", isTarget ? "0" : "-1");
            });

            Object.entries(panels).forEach(([name, panel]) => {
                if (!panel) return;
                const isTarget = name === targetView;
                if (isTarget) {
                    panel.classList.remove("books-view-hidden");
                    panel.removeAttribute("hidden");
                } else {
                    panel.classList.add("books-view-hidden");
                    panel.setAttribute("hidden", "");
                }
            });

            try {
                sessionStorage.setItem("books_active_view", targetView);
            } catch (_) {}

            if (updateHistory) {
                try {
                    const newUrl = `${window.location.pathname}${window.location.search}#${targetView}`;
                    window.history.replaceState({ booksView: targetView }, "", newUrl);
                } catch (_) {}
            }

            // Trigger view-specific re-renders to ensure accurate responsive layout
            if (targetView === "insights") {
                renderStreakDashboard();
                renderReadingAnalytics();
                renderCalendar();
                renderMonthlyActivity();
            } else if (targetView === "sessions") {
                renderLiveSessionTracker();
            } else if (targetView === "library") {
                renderReadingGoal();
                renderShelves();
            }
        }

        if (!viewNavInitialized) {
            viewNavInitialized = true;

            tabBtns.forEach((btn, index) => {
                btn.addEventListener("click", () => {
                    activateView(btn.dataset.view);
                });

                btn.addEventListener("keydown", (e) => {
                    let targetIndex = -1;
                    if (e.key === "ArrowRight") {
                        targetIndex = (index + 1) % tabBtns.length;
                    } else if (e.key === "ArrowLeft") {
                        targetIndex = (index - 1 + tabBtns.length) % tabBtns.length;
                    } else if (e.key === "Home") {
                        targetIndex = 0;
                    } else if (e.key === "End") {
                        targetIndex = tabBtns.length - 1;
                    }

                    if (targetIndex >= 0) {
                        e.preventDefault();
                        tabBtns[targetIndex].focus();
                        activateView(tabBtns[targetIndex].dataset.view);
                    }
                });
            });

            function getInitialView() {
                const hash = window.location.hash.replace("#", "").toLowerCase();
                if (["library", "insights", "sessions"].includes(hash)) {
                    return hash;
                }
                try {
                    const stored = sessionStorage.getItem("books_active_view");
                    if (["library", "insights", "sessions"].includes(stored)) {
                        return stored;
                    }
                } catch (_) {}
                return "library";
            }

            activateView(getInitialView(), false);

            window.addEventListener("hashchange", () => {
                const hash = window.location.hash.replace("#", "").toLowerCase();
                if (["library", "insights", "sessions"].includes(hash)) {
                    activateView(hash, false);
                }
            });

            window.switchBooksView = activateView;
        }
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
        setupViewNavigation();

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
                const [booksRes, stateRes, goalsRes] = await Promise.all([
                    window.cfClient.getRecords("books").catch(() => []),
                    window.cfClient.getState().catch(() => ({})),
                    window.cfClient.getReadingGoals ? window.cfClient.getReadingGoals().catch(() => ({})) : Promise.resolve({})
                ]);
                const cloudBooks = Array.isArray(booksRes) ? booksRes : [];
                const cloudState = stateRes || {};
                if (goalsRes && typeof goalsRes === "object" && Object.keys(goalsRes).length > 0) {
                    cloudState.reading_goals = { ...(cloudState.reading_goals || {}), ...goalsRes };
                }
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
