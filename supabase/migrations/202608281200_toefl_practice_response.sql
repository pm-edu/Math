-- TOEFL 유형별 연습(practice) 기록. toefl-subsystem-plan 메모 2026-08-28 참고 —
-- "12 문항유형" 랜딩 카드에서 유형 하나만 골라 반복 연습하는 기능. 사용자 결정: (1) 연습 기록을
-- DB에 남긴다, (2) 비로그인(게스트) 사용자도 오디오/녹음 유형 포함 12유형 전부 접근 가능.
--
-- toefl_attempt/toefl_response(정식 응시)와 완전히 별개 테이블이다 — 연습은 타이머·적응형 라우팅·
-- 영역점수·리포트 파이프라인에 전혀 영향을 주지 않는다(순수 기록/피드백용).
-- 게스트는 인증 신원이 없어 auth.uid()를 못 쓴다 — 클라이언트가 만든 guest_id(로컬 저장 UUID)로만
-- 구분한다. 게스트 쓰기/읽기는 전부 서버(service role, /api/toefl/practice/score)를 통해서만 하고
-- RLS 정책은 안 연다(브라우저가 이 테이블을 직접 select/insert하는 경로 자체가 없음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create table toefl_practice_response (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_id uuid,
  item_id uuid not null references toefl_item(id) on delete cascade,
  task_type toefl_task_type not null,
  answer jsonb,
  transcript text,
  is_correct boolean,
  points_earned numeric,
  max_points numeric not null,
  ai_feedback_ko text,
  ai_rubric jsonb,
  created_at timestamptz not null default now(),
  constraint toefl_practice_response_owner_check check (user_id is not null or guest_id is not null)
);

create index toefl_practice_response_user_idx on toefl_practice_response(user_id) where user_id is not null;
create index toefl_practice_response_guest_idx on toefl_practice_response(guest_id) where guest_id is not null;
create index toefl_practice_response_item_idx on toefl_practice_response(item_id);

alter table toefl_practice_response enable row level security;

-- 본인 연습 기록 열람(나중에 "내 연습 이력" 화면에 쓸 수 있게 미리 열어둠) + 직원 전체 조회.
create policy "own practice responses" on toefl_practice_response
  for select to authenticated using (user_id = auth.uid() or is_staff());

-- insert/update는 /api/toefl/practice/score(service role)만 한다 — 정책 없음(기본 차단),
-- 학생/게스트가 직접 결과를 써넣을 수 없다.
