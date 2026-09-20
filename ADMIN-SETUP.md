# Private Admin Setup

Your website now has a private admin dashboard for adding Books, Movies, Songs and Pinboard images/videos without editing HTML every time.

## 1. Create a Supabase project

Create a project in Supabase.

## 2. Run the database setup

Open Supabase Dashboard → SQL Editor.

Paste the complete contents of `supabase-schema.sql` and run it.

## 3. Create your private login

In Supabase Dashboard → Authentication → Users, create your own email/password user.

Copy that user's UUID.

Then run:

```sql
insert into public.admin_users (user_id)
values ('YOUR-AUTH-USER-UUID');
```

Only users in `admin_users` can use the admin operations.

## 4. Add your project keys

Open `supabase-config.js` and replace:

```js
url: "YOUR_SUPABASE_PROJECT_URL",
publishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
```

Use the project's URL and publishable/publishable (formerly anon) key. Do NOT use a secret/service_role key in the website.

## 5. Use the admin page

Open:

`admin.html`

There is deliberately no public Admin button on the homepage. The page is protected by Supabase authentication and an `admin_users` database check.

## 6. Add content

You can add:

- Books: cover, title, status
- Movies: poster, title, year, rating, review
- Songs: title, Spotify/YouTube/etc. link, optional artwork
- Pinboard: image or MP4 video, optional caption

The public pages automatically load items added through the dashboard.

## Important security note

Never put a Supabase secret/service_role key in browser JavaScript. This project uses the public/publishable key in the browser and protects write operations with Auth + Row Level Security.
