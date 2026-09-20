# Anand's Personal Portfolio & Side-B Multipage Site

A warm, neo-brutalist personal website featuring multimedia showcases, an interactive Letterboxd-style film log, books shelf, music discoveries, scrapbooked hobbies, and a private admin dashboard powered by Cloudflare D1.

---

## 🌟 Features

- **Side-B Portfolio & Thoughts**: Modern neo-brutalist aesthetic with cream backgrounds, retro typography, and playful cards.
- **Letterboxd-Style Movies Experience**:
  - Grid and detailed review views.
  - Multi-attribute filtering (Year, Genre, Rating) and sorting (Highest rated, Newest, Title).
  - One-click share buttons formatted for Instagram Stories with direct deep-linking.
- **Hobbies Scrapbook**: Rotated, stackable polaroid-style cards.
- **Books & Music**: Dynamic bookshelf tracking and Spotify/Apple Music integration.
- **Private Admin Dashboard (`admin.html`)**:
  - Secure authentication.
  - Add, edit, or delete items across all categories.
  - Media upload for photos and videos.
  - "Old Records" management for both original catalog items and newly created dynamic items.
- **Cloudflare D1 & Media Backend**:
  - 5 GB free serverless SQL database and chunked binary media storage.
  - HTTP Range streaming for video seeking.
  - 1-year CDN caching headers.

---

## 📁 Repository Structure

```
├── side-b-multipage/             # Frontend website files
│   ├── index.html                # Main homepage
│   ├── books.html                # Bookshelf
│   ├── movies.html               # Letterboxd-style movies & reviews
│   ├── music.html                # Songs, albums & artists
│   ├── thoughts.html             # Media pinboard (photos & videos)
│   ├── hobbies.html              # Hobbies scrapbook
│   ├── admin.html                # Private admin panel
│   ├── movies.js                 # Letterboxd grid, filters & share modal
│   ├── content-loader.js         # Dynamic content renderer
│   ├── cloudflare-config.js      # Cloudflare API endpoint configuration
│   ├── cloudflare-client.js      # Cloudflare D1 & Media client library
│   ├── admin.js                  # Admin authentication & CRUD logic
│   ├── assets/                   # Site media & styling assets
│   └── backup-supabase/          # Backup of historical Supabase records
│
├── cloudflare-backend/           # Cloudflare Worker & D1 Database
│   ├── src/index.js              # Serverless API Worker
│   ├── schema.sql                # D1 database schema
│   ├── wrangler.jsonc            # Wrangler worker configuration
│   └── migrate-supabase-to-cloudflare.js # Migration script
│
└── README.md
```

---

## 🚀 Running Locally

1. Open a terminal in `side-b-multipage`:
   ```bash
   python -m http.server 8000
   ```
2. Open your browser and navigate to:
   - **Website**: `http://localhost:8000/`
   - **Movies**: `http://localhost:8000/movies.html`
   - **Admin Panel**: `http://localhost:8000/admin.html`
