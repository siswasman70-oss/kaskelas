# KasKelas

Aplikasi manajemen kas kelas. Frontend: React + Vite + Tailwind.
Database: Supabase (Postgres).

## Setup

1. Jalankan `supabase/schema.sql` di SQL Editor Supabase (sudah dilakukan).
2. Deploy ke Vercel, isi environment variable:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Setiap `git push` ke branch `main` otomatis trigger deploy baru di Vercel.
