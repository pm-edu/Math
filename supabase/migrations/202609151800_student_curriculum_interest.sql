-- 홈페이지 과목 카드(수학 7개 트랙: 초등/중등/고등/IB/IGCSE/AS·A Level/CBSE)의 "관심 등록".
-- student_programs(과목 단위: math/sat/toefl/english)를 확장하지 않는다 — 그건 Header 메뉴
-- 노출용 굵은 단위 신호라 7개 트랙까지 욱여넣으면 의미가 깨진다(quirky-percolating-storm 계획).
-- 결제가 걸린 신청이 아니라 순수 의사표시라 status 컬럼 없이 존재 자체가 신호다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create table student_curriculum_interest (
  student_id uuid not null references auth.users(id) on delete cascade,
  track_key text not null check (track_key in ('elementary', 'middle', 'high', 'ib', 'igcse', 'aslevel', 'cbse')),
  created_at timestamptz not null default now(),
  primary key (student_id, track_key)
);

alter table student_curriculum_interest enable row level security;

-- student_programs와 동일 패턴(staff 전용 RLS) — 학생 본인 삽입은 service_role 서버 라우트로만.
create policy "own curriculum interest" on student_curriculum_interest
  for select to authenticated using (student_id = auth.uid() or is_staff());

create policy "staff manage curriculum interest" on student_curriculum_interest
  for all to authenticated using (is_staff()) with check (is_staff());
