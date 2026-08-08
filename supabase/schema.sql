-- 수학클래스 홈페이지 초기 데이터베이스 스키마
-- Supabase 대시보드 > SQL Editor 에서 실행하세요

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text not null, -- '초등' | '중등' | '고등' | 'IB'
  price integer not null,
  description text,
  lessons integer not null default 0,
  includes text[] not null default '{}',
  created_at timestamptz default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  course_id uuid references courses(id) not null,
  status text default 'pending', -- 'pending' | 'paid' | 'refunded'
  purchased_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  course_id uuid references courses(id) not null,
  content text not null,
  rating integer check (rating between 1 and 5),
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text,
  email text not null,
  message text not null,
  created_at timestamptz default now()
);

-- Row Level Security 활성화 (기본 보안)
alter table courses enable row level security;
alter table purchases enable row level security;
alter table reviews enable row level security;
alter table contacts enable row level security;

-- courses는 누구나 읽기 가능
create policy "courses are viewable by everyone" on courses
  for select using (true);

-- purchases, reviews는 본인 데이터만 조회 가능
create policy "users can view own purchases" on purchases
  for select using (auth.uid() = user_id);

create policy "reviews are viewable by everyone" on reviews
  for select using (true);

create policy "users can insert own reviews" on reviews
  for insert with check (auth.uid() = user_id);

-- contacts는 문의 폼에서 누구나 등록 가능, 조회는 본인 것만
-- (정책이 없으면 RLS가 모든 접근을 차단해 문의 저장이 실패함)
create policy "anyone can submit a contact" on contacts
  for insert with check (true);

create policy "users can view own contacts" on contacts
  for select using (auth.uid() = user_id);

-- Data API 권한 부여
-- 프로젝트 생성 시 "Automatically expose new tables"를 끈 경우
-- RLS 정책만으로는 접근이 안 되므로 명시적으로 grant 해야 함
grant usage on schema public to anon, authenticated;
grant select on courses to anon, authenticated;
grant select on reviews to anon, authenticated;
grant insert on reviews to authenticated;
grant select on purchases to authenticated;
grant insert on contacts to anon, authenticated;
grant select on contacts to authenticated;
