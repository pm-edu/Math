-- 영어 단어 완전학습: 단어 풀 + 단어장 배정 + 학생별 SRS 진도
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- (권한 함수 is_staff() 는 roles-tier.sql 에서 이미 만들어져 있어야 합니다)

-- 1) 단어 풀
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  deck text not null default '기본',         -- 단어장 이름 (예: 'SAT 기본 300')
  tag text not null default 'general',       -- general | SAT | TOEFL | IELTS (시험 종류 확장용)
  word text not null,
  meaning text not null,                     -- 뜻 (한국어)
  part_of_speech text,                       -- 품사 (n., v., adj. ...)
  example text,                              -- 예문 (영어)
  example_ko text,                           -- 예문 뜻
  level int not null default 2,              -- 1(쉬움) ~ 3(어려움)
  source text not null default 'ai',         -- ai | manual
  verified boolean not null default false,   -- 검수 전엔 학생에게 노출 안 함
  created_at timestamptz default now()
);
create index if not exists words_deck_idx on words (deck, verified);

-- 2) 단어장 배정 (어떤 단어장을 누구에게)
create table if not exists word_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  deck text not null,
  assigned_at timestamptz default now(),
  unique (user_id, deck)
);

-- 3) 학생별 단어 진도 (SRS: Leitner 상자 1~5)
create table if not exists word_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  word_id uuid references words(id) on delete cascade not null,
  box int not null default 1,                -- 높을수록 잘 아는 단어
  correct_streak int not null default 0,
  wrong_count int not null default 0,
  next_review_at timestamptz default now(),
  last_reviewed_at timestamptz,
  unique (user_id, word_id)
);
create index if not exists word_progress_due_idx on word_progress (user_id, next_review_at);

-- ===== 보안 정책 =====
alter table words enable row level security;
alter table word_assignments enable row level security;
alter table word_progress enable row level security;

-- 단어: 직원은 전부 관리. 학생은 "배정된 단어장의 검수된 단어"만 조회.
drop policy if exists "staff manage words" on words;
create policy "staff manage words" on words for all using (is_staff()) with check (is_staff());

drop policy if exists "students view assigned words" on words;
create policy "students view assigned words" on words for select using (
  verified = true and exists (
    select 1 from word_assignments wa where wa.user_id = auth.uid() and wa.deck = words.deck
  )
);

-- 배정: 직원 관리, 학생은 자기 것 조회
drop policy if exists "staff manage word_assignments" on word_assignments;
create policy "staff manage word_assignments" on word_assignments for all using (is_staff()) with check (is_staff());
drop policy if exists "students view own word_assignments" on word_assignments;
create policy "students view own word_assignments" on word_assignments for select using (user_id = auth.uid());

-- 진도: 학생 본인 관리, 직원 조회
drop policy if exists "students manage own word_progress" on word_progress;
create policy "students manage own word_progress" on word_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff view word_progress" on word_progress;
create policy "staff view word_progress" on word_progress for select using (is_staff());

grant select, insert, update, delete on words to authenticated;
grant select, insert, update, delete on word_assignments to authenticated;
grant select, insert, update, delete on word_progress to authenticated;
