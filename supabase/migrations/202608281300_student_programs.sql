-- 학생별 "등록 과목"(수학/SAT/TOEFL) — 네비게이션을 접속 도메인이 아니라 학생이 실제로
-- 등록한 과목 기준으로 분리하기 위한 데이터 모델. [[toefl-subsystem-plan]] [A] 항목,
-- 2026-08-28 결정: SAT는 아직 학생용 서브시스템 자체가 없지만("/admin/sat"는 문제생성 도구뿐)
-- 나중에 TOEFL처럼, 심지어 수학과 완전 분리까지 갈 수 있다는 전제로 처음부터 정규화된 별도
-- 테이블로 만든다(사용자가 profiles.programs 배열 대신 이 안을 선택 — 결제·만료일 등 과목별
-- 상태를 나중에 붙일 걸 거의 확신).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create table student_programs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  program text not null check (program in ('math', 'sat', 'toefl')),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  enrolled_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (student_id, program)
);

create index student_programs_student_idx on student_programs(student_id);

alter table student_programs enable row level security;

create policy "own programs" on student_programs
  for select to authenticated using (student_id = auth.uid() or is_staff());

create policy "staff manage programs" on student_programs
  for all to authenticated using (is_staff()) with check (is_staff());

-- 이 테이블이 생기기 전까지는 사이트 전체가 사실상 수학 사이트였다 — 기존 학생 전원을
-- 소급으로 'math'에 등록해준다(안 채우면 도입 시점 학생들이 갑자기 "등록 과목 없음"이 됨).
-- 나중에 관리자 화면(/admin/students/[id])에서 개별적으로 뗄 수 있다.
insert into student_programs (student_id, program)
select id, 'math' from profiles where role = 'student'
on conflict (student_id, program) do nothing;
