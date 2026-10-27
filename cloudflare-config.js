/* =============================================
   Cloudflare Configuration
   5 GB Free D1 Database & Media Storage
============================================= */

const isLocalhost = typeof window !== "undefined" && 
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "");

window.CLOUDFLARE_CONFIG = {
    apiUrl: isLocalhost 
        ? `${window.location.protocol}//${window.location.host}` 
        : "https://anand-site-api.hello-anandha.workers.dev"
};
