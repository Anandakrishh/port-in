-- =========================================================
-- ANAND PERSONAL SITE - SUPABASE SETUP
-- Run this in Supabase SQL Editor.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.admin_users
        where user_id = auth.uid()
    );
$$;

grant execute on function public.is_site_admin() to anon, authenticated;

create table if not exists public.books (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    status text not null check (status in ('finished','bought','need-to-buy')),
    image_url text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.movies (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    year integer,
    genre text,
    rating numeric(2,1) default 0,
    review text,
    image_url text not null,
    created_at timestamptz not null default now()
);

-- Run this migration if your movies table already exists:
alter table public.movies add column if not exists genre text;

create table if not exists public.songs (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    link text not null,
    image_url text,
    created_at timestamptz not null default now()
);

create table if not exists public.pinboard (
    id uuid primary key default gen_random_uuid(),
    media_type text not null check (media_type in ('image','video')),
    media_url text not null,
    caption text,
    created_at timestamptz not null default now()
);

-- Public pages can read published content.
alter table public.books enable row level security;
alter table public.movies enable row level security;
alter table public.songs enable row level security;
alter table public.pinboard enable row level security;
alter table public.admin_users enable row level security;

grant select on public.books, public.movies, public.songs, public.pinboard to anon, authenticated;
grant insert, update, delete on public.books, public.movies, public.songs, public.pinboard to authenticated;
grant select on public.admin_users to authenticated;

create policy "Public can read books" on public.books
for select to anon, authenticated using (true);

create policy "Admin can manage books" on public.books
for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

create policy "Public can read movies" on public.movies
for select to anon, authenticated using (true);

create policy "Admin can manage movies" on public.movies
for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

create policy "Public can read songs" on public.songs
for select to anon, authenticated using (true);

create policy "Admin can manage songs" on public.songs
for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

create policy "Public can read pinboard" on public.pinboard
for select to anon, authenticated using (true);

create policy "Admin can manage pinboard" on public.pinboard
for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());

create policy "Admin can read own admin record" on public.admin_users
for select to authenticated using (user_id = auth.uid());

-- =========================================================
-- STORAGE
-- =========================================================

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;

create policy "Public can read site media" on storage.objects
for select to anon, authenticated
using (bucket_id = 'site-media');

create policy "Admin can upload site media" on storage.objects
for insert to authenticated
with check (bucket_id = 'site-media' and public.is_site_admin());

create policy "Admin can update site media" on storage.objects
for update to authenticated
using (bucket_id = 'site-media' and public.is_site_admin())
with check (bucket_id = 'site-media' and public.is_site_admin());

create policy "Admin can delete site media" on storage.objects
for delete to authenticated
using (bucket_id = 'site-media' and public.is_site_admin());

-- =========================================================
-- AFTER YOU CREATE YOUR ADMIN AUTH USER
-- =========================================================
-- Replace YOUR-AUTH-USER-UUID with your Auth user's UUID:
-- insert into public.admin_users (user_id)
-- values ('YOUR-AUTH-USER-UUID');
