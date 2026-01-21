# Supabase Setup

## Env
Create a `.env` (or `.env.local`) file:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Tables (SQL)
Run the following in the Supabase SQL editor:

```
create table if not exists users (
  id text primary key,
  name text not null,
  first_name text,
  last_name text,
  dob text,
  phone text,
  email text not null,
  role text not null,
  employee_id text not null,
  password text,
  salary numeric,
  basic_salary numeric,
  allowances numeric,
  salary_hidden boolean,
  pin_code text,
  profile_image text,
  work_mode text,
  grade text,
  team_lead text,
  position text
);

create table if not exists attendance_records (
  id text primary key,
  user_id text not null,
  user_name text not null,
  date text not null,
  check_in text not null,
  check_out text,
  total_hours numeric,
  status text,
  overtime_hours numeric
);

create table if not exists leave_requests (
  id text primary key,
  user_id text not null,
  user_name text not null,
  start_date text not null,
  end_date text not null,
  reason text not null,
  status text not null,
  submitted_at text not null,
  is_paid boolean
);

create table if not exists wfh_requests (
  id text primary key,
  user_id text not null,
  user_name text not null,
  reason text not null,
  status text not null,
  submitted_at text not null
);

create table if not exists ess_profiles (
  user_id text primary key,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  emergency_contact_relation text not null
);

create table if not exists checklists (
  user_id text primary key,
  type text not null,
  items jsonb not null
);
```

## Realtime
Enable realtime on these tables:
- `users`
- `attendance_records`
- `leave_requests`
- `wfh_requests`
- `ess_profiles`
- `checklists`

## RLS
For quick testing, you can disable RLS or add policies that allow read/write for anon. Lock this down before production.

## Storage (Profile Images)
Create a public bucket named `avatars` (or match `APP_CONFIG.PROFILE_IMAGE_BUCKET`).
For quick testing with anon access, allow public read and insert/update on `storage.objects` for that bucket.
