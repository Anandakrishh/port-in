/**
 * Cloudflare Worker Backend for Anand's Website
 * Provides 5 GB Free Serverless Database (D1) and Media Storage
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const origin = url.origin;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, Range",
            "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges"
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const json = (data, status = 200) => {
            return new Response(JSON.stringify(data), {
                status,
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders
                }
            });
        };

        const error = (msg, status = 400) => json({ error: msg }, status);

        // Helper: SHA-256 hash
        async function sha256(str) {
            const buf = new TextEncoder().encode(str);
            const digest = await crypto.subtle.digest("SHA-256", buf);
            return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
        }

        try {
            // -------------------------------------------------------------
            // 1. Health check
            // -------------------------------------------------------------
            if (path === "/api/health" || path === "/") {
                return json({ status: "ok", message: "Cloudflare D1 Backend running smoothly", timestamp: new Date().toISOString() });
            }

            // -------------------------------------------------------------
            // 2. Auth: Login & Admin Check
            // -------------------------------------------------------------
            if (path === "/api/login" && request.method === "POST") {
                const body = await request.json();
                const email = (body.email || "").trim().toLowerCase();
                const password = body.password || "";

                if (!email || !password) return error("Email and password required");

                // Check admin_users table
                let user = await env.DB.prepare("SELECT * FROM admin_users WHERE lower(email) = ?").bind(email).first();

                // If user doesn't exist yet, auto-provision admin account with this password
                if (!user) {
                    const hash = await sha256(password);
                    const id = crypto.randomUUID();
                    await env.DB.prepare("INSERT INTO admin_users (id, email, password_hash) VALUES (?, ?, ?)")
                        .bind(id, email, hash).run();
                    user = { id, email, password_hash: hash };
                }

                const hash = await sha256(password);
                if (user.password_hash !== hash) {
                    return error("Invalid email or password", 401);
                }

                // Generate a session token
                const token = crypto.randomUUID();
                return json({ success: true, token, user: { id: user.id, email: user.email } });
            }

            // -------------------------------------------------------------
            // 3. Media Serving: GET / HEAD /media/:id
            // -------------------------------------------------------------
            if (path.startsWith("/media/") && (request.method === "GET" || request.method === "HEAD")) {
                const fileId = path.replace("/media/", "").split("/")[0].split("?")[0];
                const meta = await env.DB.prepare("SELECT * FROM media_files WHERE id = ?").bind(fileId).first();
                if (!meta) {
                    return new Response("Media not found", { status: 404, headers: corsHeaders });
                }

                const contentType = meta.content_type || "application/octet-stream";
                const totalBytes = meta.total_size || 0;

                if (request.method === "HEAD") {
                    return new Response(null, {
                        status: 200,
                        headers: {
                            "Content-Type": contentType,
                            "Content-Length": String(totalBytes),
                            "Accept-Ranges": "bytes",
                            "Cache-Control": "public, max-age=31536000, immutable",
                            ...corsHeaders
                        }
                    });
                }

                const chunksRes = await env.DB.prepare(
                    "SELECT chunk_data FROM media_chunks WHERE file_id = ? ORDER BY chunk_index ASC"
                ).bind(fileId).all();

                if (!chunksRes.results || chunksRes.results.length === 0) {
                    return new Response("Media data missing", { status: 404, headers: corsHeaders });
                }

                // Combine chunks into single ArrayBuffer
                let bytesCount = 0;
                const chunkArrays = chunksRes.results.map(r => {
                    const arr = new Uint8Array(r.chunk_data);
                    bytesCount += arr.length;
                    return arr;
                });

                const combined = new Uint8Array(bytesCount);
                let offset = 0;
                for (const arr of chunkArrays) {
                    combined.set(arr, offset);
                    offset += arr.length;
                }

                // Handle HTTP Range Requests for video seeking
                const range = request.headers.get("Range");
                if (range && range.startsWith("bytes=")) {
                    const parts = range.replace("bytes=", "").split("-");
                    const start = parseInt(parts[0], 10) || 0;
                    const end = parts[1] ? parseInt(parts[1], 10) : totalBytes - 1;
                    const chunksize = (end - start) + 1;
                    const sub = combined.subarray(start, end + 1);

                    return new Response(sub, {
                        status: 206,
                        headers: {
                            "Content-Range": `bytes ${start}-${end}/${totalBytes}`,
                            "Accept-Ranges": "bytes",
                            "Content-Length": String(chunksize),
                            "Content-Type": contentType,
                            "Cache-Control": "public, max-age=31536000, immutable",
                            ...corsHeaders
                        }
                    });
                }

                return new Response(combined, {
                    status: 200,
                    headers: {
                        "Content-Type": contentType,
                        "Content-Length": String(totalBytes),
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=31536000, immutable",
                        ...corsHeaders
                    }
                });
            }

            // -------------------------------------------------------------
            // 4. Media Upload: POST /api/upload
            // -------------------------------------------------------------
            if (path === "/api/upload" && request.method === "POST") {
                const contentTypeHeader = request.headers.get("Content-Type") || "";
                let filename = "media.bin";
                let contentType = "application/octet-stream";
                let fileBuffer;

                if (contentTypeHeader.includes("multipart/form-data")) {
                    const formData = await request.formData();
                    const file = formData.get("file");
                    if (!file) return error("No file provided in form-data");
                    filename = file.name || "media.bin";
                    contentType = file.type || "application/octet-stream";
                    fileBuffer = await file.arrayBuffer();
                } else {
                    filename = request.headers.get("x-filename") || "media.bin";
                    contentType = request.headers.get("x-content-type") || contentTypeHeader || "application/octet-stream";
                    fileBuffer = await request.arrayBuffer();
                }

                const fileBytes = new Uint8Array(fileBuffer);
                const fileId = crypto.randomUUID();
                const chunkSize = 480 * 1024; // 480 KB chunk size (well within D1 limits)
                const totalChunks = Math.ceil(fileBytes.length / chunkSize);

                // Insert metadata
                await env.DB.prepare(
                    "INSERT INTO media_files (id, filename, content_type, total_size) VALUES (?, ?, ?, ?)"
                ).bind(fileId, filename, contentType, fileBytes.length).run();

                // Insert chunks
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * chunkSize;
                    const end = Math.min(fileBytes.length, start + chunkSize);
                    const chunk = fileBytes.slice(start, end);
                    await env.DB.prepare(
                        "INSERT INTO media_chunks (file_id, chunk_index, chunk_data) VALUES (?, ?, ?)"
                    ).bind(fileId, i, chunk).run();
                }

                const publicUrl = `${origin}/media/${fileId}`;
                return json({ success: true, id: fileId, publicUrl, url: publicUrl });
            }

            // -------------------------------------------------------------
            // 5. Site State (Static overrides & deleted IDs): /api/state
            // -------------------------------------------------------------
            if (path === "/api/state") {
                if (request.method === "GET") {
                    const row = await env.DB.prepare("SELECT value FROM site_state WHERE key = 'site_overrides'").first();
                    let state = { deletedIds: [], overrides: {} };
                    if (row && row.value) {
                        try { state = JSON.parse(row.value); } catch (_) {}
                    }
                    return json(state);
                }

                if (request.method === "POST" || request.method === "PUT") {
                    const body = await request.json();
                    const val = JSON.stringify(body);
                    await env.DB.prepare(
                        "INSERT INTO site_state (key, value, updated_at) VALUES ('site_overrides', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
                    ).bind(val).run();
                    return json({ success: true });
                }
            }

            // -------------------------------------------------------------
            // 6. Generic Table CRUD: /api/:table
            // -------------------------------------------------------------
            const allowedTables = ["books", "movies", "songs", "pinboard", "hobbies"];
            const segments = path.replace("/api/", "").split("/");
            const table = segments[0];
            const id = segments[1];

            if (allowedTables.includes(table)) {
                // GET ALL
                if (request.method === "GET" && !id) {
                    const res = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();
                    return json(res.results || []);
                }

                // GET SINGLE
                if (request.method === "GET" && id) {
                    const res = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
                    if (!res) return error("Not found", 404);
                    return json(res);
                }

                // INSERT
                if (request.method === "POST") {
                    const data = await request.json();
                    const recordId = data.id || crypto.randomUUID();

                    if (table === "books") {
                        await env.DB.prepare(
                            "INSERT INTO books (id, title, status, image_url) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.status || "finished", data.image_url || "").run();
                    } else if (table === "movies") {
                        await env.DB.prepare(
                            "INSERT INTO movies (id, title, year, genre, rating, review, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.year || null, data.genre || "", data.rating || 0, data.review || "", data.image_url || "").run();
                    } else if (table === "songs") {
                        await env.DB.prepare(
                            "INSERT INTO songs (id, title, link, image_url) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.title, data.link || "", data.image_url || "").run();
                    } else if (table === "pinboard") {
                        await env.DB.prepare(
                            "INSERT INTO pinboard (id, media_type, media_url, caption) VALUES (?, ?, ?, ?)"
                        ).bind(recordId, data.media_type || "image", data.media_url || "", data.caption || "").run();
                    } else if (table === "hobbies") {
                        await env.DB.prepare(
                            "INSERT INTO hobbies (id, title, image_url) VALUES (?, ?, ?)"
                        ).bind(recordId, data.title, data.image_url || "").run();
                    }

                    const inserted = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(recordId).first();
                    return json(inserted, 201);
                }

                // UPDATE
                if (request.method === "PUT" && id) {
                    const data = await request.json();

                    if (table === "books") {
                        await env.DB.prepare(
                            "UPDATE books SET title = COALESCE(?, title), status = COALESCE(?, status), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.status, data.image_url, id).run();
                    } else if (table === "movies") {
                        await env.DB.prepare(
                            "UPDATE movies SET title = COALESCE(?, title), year = COALESCE(?, year), genre = COALESCE(?, genre), rating = COALESCE(?, rating), review = COALESCE(?, review), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.year, data.genre, data.rating, data.review, data.image_url, id).run();
                    } else if (table === "songs") {
                        await env.DB.prepare(
                            "UPDATE songs SET title = COALESCE(?, title), link = COALESCE(?, link), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.link, data.image_url, id).run();
                    } else if (table === "pinboard") {
                        await env.DB.prepare(
                            "UPDATE pinboard SET caption = COALESCE(?, caption), media_type = COALESCE(?, media_type), media_url = COALESCE(?, media_url) WHERE id = ?"
                        ).bind(data.caption, data.media_type, data.media_url, id).run();
                    } else if (table === "hobbies") {
                        await env.DB.prepare(
                            "UPDATE hobbies SET title = COALESCE(?, title), image_url = COALESCE(?, image_url) WHERE id = ?"
                        ).bind(data.title, data.image_url, id).run();
                    }

                    const updated = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
                    return json(updated);
                }

                // DELETE
                if (request.method === "DELETE" && id) {
                    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
                    return json({ success: true, id });
                }
            }

            return error("Endpoint not found", 404);
        } catch (err) {
            console.error("Worker Error:", err);
            return error(err.message || "Internal server error", 500);
        }
    }
};
