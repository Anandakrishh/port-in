/**
 * Side B - Unified Local Development Server
 * Serves static portfolio assets + Cloudflare D1 Backend APIs locally.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import worker from "./cloudflare-backend/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8000;
const DB_FILE = path.join(__dirname, "local_dev.db");

// ---------------------------------------------------------------------------
// 1. Initialize Local SQLite Database (Emulates Cloudflare D1)
// ---------------------------------------------------------------------------
const isNewDb = !fs.existsSync(DB_FILE);
const db = new DatabaseSync(DB_FILE);

db.exec(`
    CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'finished',
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        year INTEGER,
        genre TEXT,
        rating REAL DEFAULT 0,
        review TEXT,
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        link TEXT,
        image_url TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pinboard (
        id TEXT PRIMARY KEY,
        media_type TEXT DEFAULT 'image',
        media_url TEXT NOT NULL,
        caption TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hobbies (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        image_url TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_files (
        id TEXT PRIMARY KEY,
        filename TEXT,
        content_type TEXT,
        total_size INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_chunks (
        file_id TEXT,
        chunk_index INTEGER,
        chunk_data BLOB,
        PRIMARY KEY (file_id, chunk_index)
    );
`);

// Pre-seed initial data if brand new
if (isNewDb) {
    const cloudDataFile = path.join(__dirname, "cloudflare-backend", "cloud-data.json");
    if (fs.existsSync(cloudDataFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(cloudDataFile, "utf-8"));
            if (Array.isArray(data.movies)) {
                const stmt = db.prepare("INSERT OR IGNORE INTO movies (id, title, year, genre, rating, review, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                for (const m of data.movies) {
                    stmt.run(m.id, m.title, m.year, m.genre, m.rating, m.review, m.image_url, m.created_at);
                }
            }
            if (Array.isArray(data.pinboard)) {
                const stmt = db.prepare("INSERT OR IGNORE INTO pinboard (id, media_type, media_url, caption, created_at) VALUES (?, ?, ?, ?, ?)");
                for (const p of data.pinboard) {
                    stmt.run(p.id, p.media_type, p.media_url, p.caption, p.created_at);
                }
            }
        } catch (e) {
            console.warn("Could not seed initial data:", e.message);
        }
    }
}

// ---------------------------------------------------------------------------
// 2. D1 Driver Mock Wrapper
// ---------------------------------------------------------------------------
const D1Mock = {
    prepare(sql) {
        return {
            bind(...params) {
                return {
                    async first() {
                        const stmt = db.prepare(sql);
                        return stmt.get(...params) || null;
                    },
                    async all() {
                        const stmt = db.prepare(sql);
                        const results = stmt.all(...params);
                        return { results };
                    },
                    async run() {
                        const stmt = db.prepare(sql);
                        stmt.run(...params);
                        return { success: true };
                    }
                };
            },
            async first() {
                const stmt = db.prepare(sql);
                return stmt.get() || null;
            },
            async all() {
                const stmt = db.prepare(sql);
                return { results: stmt.all() };
            },
            async run() {
                const stmt = db.prepare(sql);
                stmt.run();
                return { success: true };
            }
        };
    }
};

const defaultPassword = process.env.ADMIN_PASSWORD || "anand2026";
const env = {
    DB: D1Mock,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "hello.anandha@gmail.com",
    ADMIN_PASSWORD: defaultPassword,
    SESSION_SECRET: process.env.SESSION_SECRET || "local_dev_secret_hmac_2026_x8"
};

// ---------------------------------------------------------------------------
// 3. MIME Types dictionary
// ---------------------------------------------------------------------------
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf"
};

// ---------------------------------------------------------------------------
// 4. HTTP Server Handler
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${PORT}`;
    const fullUrl = `http://${host}${req.url}`;
    const parsedUrl = new URL(fullUrl);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // ---------------------------------------------------------
    // A. Handle API and Media Requests through Worker Backend
    // ---------------------------------------------------------
    if (pathname.startsWith("/api/") || pathname.startsWith("/media/")) {
        try {
            // Read incoming request body buffer
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const bodyBuffer = Buffer.concat(chunks);

            // Construct standard web Request
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
                if (v !== undefined) {
                    if (Array.isArray(v)) {
                        for (const item of v) headers.append(k, item);
                    } else {
                        headers.set(k, v);
                    }
                }
            }

            const init = {
                method: req.method,
                headers
            };
            if (req.method !== "GET" && req.method !== "HEAD" && bodyBuffer.length > 0) {
                init.body = bodyBuffer;
                init.duplex = "half";
            }

            const webReq = new Request(fullUrl, init);
            const workerRes = await worker.fetch(webReq, env);

            // Forward response status & headers
            res.statusCode = workerRes.status;
            for (const [k, v] of workerRes.headers.entries()) {
                res.setHeader(k, v);
            }

            const resArrayBuf = await workerRes.arrayBuffer();
            res.end(Buffer.from(resArrayBuf));
            return;
        } catch (err) {
            console.error("Local Worker Error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err.message || "Internal server error" }));
            return;
        }
    }

    // ---------------------------------------------------------
    // B. Handle Static Files
    // ---------------------------------------------------------
    if (pathname === "/") pathname = "/index.html";

    // Clean URLs support: if requesting /books, check if books.html exists
    let filePath = path.join(__dirname, pathname);
    if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
        filePath = filePath + ".html";
    }

    // Security: avoid directory traversal
    const rel = path.relative(__dirname, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel) && !filePath.startsWith(__dirname)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
    }

    // Check directory or file
    try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, "index.html");
            if (!fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end("Not Found");
                return;
            }
        }
    } catch (_) {
        res.statusCode = 404;
        res.end("Not Found");
        return;
    }

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);

    // Support simple range requests for media files
    const stat = fs.statSync(filePath);
    const range = req.headers.range;

    if (range && (ext === ".mp4" || ext === ".webm")) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", chunksize);
        fileStream.pipe(res);
    } else {
        res.setHeader("Content-Length", stat.size);
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    }
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n=================================================`);
    console.log(`🚀 LOCAL DEV SERVER RUNNING`);
    console.log(`=================================================`);
    console.log(`  🌐 Website URL:    http://localhost:${PORT}/`);
    console.log(`  📖 Books Page:     http://localhost:${PORT}/books.html`);
    console.log(`  🔐 Admin Page:     http://localhost:${PORT}/admin.html`);
    console.log(`-------------------------------------------------`);
    console.log(`  👤 Admin Email:    ${env.ADMIN_EMAIL}`);
    console.log(`  🔑 Admin Password: ${env.ADMIN_PASSWORD}`);
    console.log(`  💾 Local DB:       ${DB_FILE}`);
    console.log(`=================================================\n`);
});
