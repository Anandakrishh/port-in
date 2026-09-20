/**
 * Data Migration Script: Supabase -> Cloudflare D1
 */

const fs = require('fs');
const path = require('path');

const WORKER_URL = 'https://anand-site-api.hello-anandha.workers.dev';
const BACKUP_DIR = path.join(__dirname, '..', 'side-b-multipage', 'backup-supabase');

async function uploadFile(filePath, filename, contentType) {
    const fileBytes = fs.readFileSync(filePath);
    const formData = new FormData();
    const blob = new Blob([fileBytes], { type: contentType });
    formData.append('file', blob, filename);

    const res = await fetch(`${WORKER_URL}/api/upload`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to upload ${filename}: ${res.status} ${text}`);
    }

    const data = await res.json();
    console.log(`Uploaded ${filename} -> ${data.publicUrl}`);
    return data.publicUrl;
}

async function migrate() {
    console.log('--- Starting Migration from Supabase to Cloudflare ---');

    // 1. Upload media files
    const mediaMap = {};

    const moviePosterPath = path.join(BACKUP_DIR, '050612fc-bdb0-4bf0-ac21-189b17aaf3f8.jpg');
    if (fs.existsSync(moviePosterPath)) {
        const url = await uploadFile(moviePosterPath, '10-things-poster.jpg', 'image/jpeg');
        mediaMap['050612fc-bdb0-4bf0-ac21-189b17aaf3f8.jpg'] = url;
    }

    const pinImgPath = path.join(BACKUP_DIR, '5ad72061-6166-4af0-bdf9-5cbf8f0d44be.jpg');
    if (fs.existsSync(pinImgPath)) {
        const url = await uploadFile(pinImgPath, 'pinboard-photo.jpg', 'image/jpeg');
        mediaMap['5ad72061-6166-4af0-bdf9-5cbf8f0d44be.jpg'] = url;
    }

    const pinVideoPath = path.join(BACKUP_DIR, '5385d2ce-be32-4d02-8623-8675fe2f3eba.mp4');
    if (fs.existsSync(pinVideoPath)) {
        const url = await uploadFile(pinVideoPath, 'pinboard-video.mp4', 'video/mp4');
        mediaMap['5385d2ce-be32-4d02-8623-8675fe2f3eba.mp4'] = url;
    }

    // 2. Read database export
    const exportFile = path.join(BACKUP_DIR, 'supabase-data-export.json');
    if (fs.existsSync(exportFile)) {
        const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

        // Migrate Movies
        if (Array.isArray(data.movies)) {
            for (const movie of data.movies) {
                let imgUrl = movie.image_url;
                for (const [key, newUrl] of Object.entries(mediaMap)) {
                    if (imgUrl && imgUrl.includes(key)) imgUrl = newUrl;
                }
                const res = await fetch(`${WORKER_URL}/api/movies`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: movie.id,
                        title: movie.title,
                        year: movie.year,
                        genre: movie.genre || '',
                        rating: movie.rating || 0,
                        review: movie.review || '',
                        image_url: imgUrl
                    })
                });
                console.log(`Migrated movie: ${movie.title} -> status ${res.status}`);
            }
        }

        // Migrate Pinboard
        if (Array.isArray(data.pinboard)) {
            for (const pin of data.pinboard) {
                let mediaUrl = pin.media_url;
                for (const [key, newUrl] of Object.entries(mediaMap)) {
                    if (mediaUrl && mediaUrl.includes(key)) mediaUrl = newUrl;
                }
                const res = await fetch(`${WORKER_URL}/api/pinboard`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: pin.id,
                        media_type: pin.media_type || 'image',
                        media_url: mediaUrl,
                        caption: pin.caption || ''
                    })
                });
                console.log(`Migrated pinboard item (${pin.media_type}) -> status ${res.status}`);
            }
        }
    }

    console.log('--- Migration Completed Successfully! ---');
}

migrate().catch(console.error);
