-- 학생관리 P0(2단계): 출결 · 커리큘럼 단원 · 문항 풀이이력 · 정식시험 · 일별 통계 스냅샷.
-- docs/student-management.md 지시서 기반, 이 프로젝트 실제 구조에 맞춰 조정함(문서 하단 "실제 코드베이스 반영 조정" 참고).
-- 이번 파일은 스키마 + RLS만. 화면 연동은 다음 단계에서.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다(additive).

create extension if not exists "pgcrypto";

do $$ begin
  create type attendance_status as enum ('present', 'late', 'early_leave', 'absent_excused', 'absent_unexcused', 'makeup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type error_category as enum ('concept', 'calculation', 'interpretation', 'time');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assessment_kind as enum ('internal_test', 'school_exam', 'mock_exam', 'official_exam');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 수업 회차 (기존 lessons=강좌 동영상 강의와 이름 충돌 방지 위해 class_sessions로 명명)
-- ---------------------------------------------------------------------
create table if not exists class_sessions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid references classes(id) on delete set null,
  session_date date not null,
  start_at    timestamptz,
  minutes     smallint,
  topic       text,
  teacher_id  uuid references profiles(id) on delete set null,
  is_canceled boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists class_sessions_date_idx on class_sessions (session_date);

-- 회차별 참석 대상 학생 (반 소속과 별개로 보강 등 유연하게 배정 가능)
create table if not exists class_session_students (
  class_session_id uuid not null references class_sessions(id) on delete cascade,
  student_id        uuid not null references profiles(id) on delete cascade,
  primary key (class_session_id, student_id)
);

-- ---------------------------------------------------------------------
-- 출결
-- ---------------------------------------------------------------------
create table if not exists attendance (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references profiles(id) on delete cascade,
  class_session_id  uuid not null references class_sessions(id) on delete cascade,
  status            attendance_status not null,
  late_minutes      smallint not null default 0,
  reason            text,
  makeup_session_id uuid references class_sessions(id) on delete set null,
  makeup_done       boolean not null default false,
  recorded_by       uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (student_id, class_session_id)
);
create index if not exists attendance_student_idx on attendance (student_id, created_at desc);

-- ---------------------------------------------------------------------
-- 커리큘럼 단원 (수학 전용 — src/lib/curriculum-topics.ts 정적 데이터를 그대로 이관)
-- ---------------------------------------------------------------------
create table if not exists curriculum_units (
  id                uuid primary key default gen_random_uuid(),
  curriculum_group  text not null,
  curriculum_detail text not null,
  unit_name         text not null,
  sort_order        integer not null default 0,
  unique (curriculum_group, curriculum_detail, unit_name)
);
create index if not exists curriculum_units_lookup_idx on curriculum_units (curriculum_group, curriculum_detail, sort_order);

-- ---------------------------------------------------------------------
-- 문항 풀이 이력 (★ 이번 모듈의 핵심 — 지금은 스키마만, 실제 기록 연동은 다음 단계)
-- problem_submissions(문제당 1행, 재제출시 덮어씀)를 대체하지 않고 병행한다.
-- ---------------------------------------------------------------------
create table if not exists question_attempts (
  id              bigserial primary key,
  student_id      uuid not null references profiles(id) on delete cascade,
  problem_id      uuid not null references problems(id) on delete cascade,
  unit_id         uuid references curriculum_units(id) on delete set null,
  difficulty      text,                          -- problems.difficulty와 동일 체계('하'/'중'/'상')
  attempt_no      smallint not null default 1,
  is_correct      boolean not null,
  elapsed_seconds integer,
  error_category  error_category,                -- 지금은 항상 null(안 매김) — 나중에 교사 태깅 화면에서 채움
  source          text,                          -- 'worksheet' | 'self_study' 등
  source_id       uuid,
  created_at      timestamptz not null default now()
);
create index if not exists question_attempts_student_idx on question_attempts (student_id, created_at desc);
create index if not exists question_attempts_student_unit_idx on question_attempts (student_id, unit_id);

-- ---------------------------------------------------------------------
-- 정식 시험 (내신/모의고사 등 — worksheets 온라인 풀이와 별개)
-- ---------------------------------------------------------------------
create table if not exists assessments (
  id               uuid primary key default gen_random_uuid(),
  kind             assessment_kind not null,
  title            text not null,
  curriculum_group text,
  class_id         uuid references classes(id) on delete set null,
  exam_date        date not null,
  max_score        numeric(6,2) not null default 100,
  created_at       timestamptz not null default now()
);

create table if not exists assessment_results (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  student_id     uuid not null references profiles(id) on delete cascade,
  raw_score      numeric(6,2),
  grade_label    text,
  unit_breakdown jsonb,
  comment        text,
  unique (assessment_id, student_id)
);

-- ---------------------------------------------------------------------
-- 일별 통계 스냅샷 (월별 추이용 — cron 연결은 다음 단계에서 별도 확인 후)
-- ---------------------------------------------------------------------
create table if not exists daily_stats (
  stat_date      date primary key,
  students_active integer not null default 0,
  attempts       integer not null default 0,
  correct        integer not null default 0,
  attended       integer not null default 0,
  planned        integer not null default 0,
  submitted      integer not null default 0,
  due            integer not null default 0
);

-- ---------------------------------------------------------------------
-- 기존 worksheets에 과제 마감일 · 단원 연결 컬럼 추가 (별도 assignments 테이블 대신 재사용)
-- ---------------------------------------------------------------------
alter table worksheets add column if not exists due_at timestamptz;
alter table worksheets add column if not exists unit_id uuid references curriculum_units(id) on delete set null;

-- ---------------------------------------------------------------------
-- profiles.unpaid (수납 모듈 대신 미납 플래그 하나) — class_id/grade_level과 같은 이유로 RPC로만 변경
-- ---------------------------------------------------------------------
alter table profiles add column if not exists unpaid boolean not null default false;

create or replace function set_student_unpaid(target_id uuid, new_value boolean)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  my_role text;
begin
  select role into my_role from profiles where id = auth.uid();
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception '미납 상태를 바꿀 권한이 없습니다.';
  end if;
  update profiles set unpaid = new_value where id = target_id;
end;
$fn$;

grant execute on function set_student_unpaid(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- RLS — 이 프로젝트에 교사를 자기 반으로 좁히는 정책이 원래 없어서(classes.sql도 화면단 필터링),
-- 새 테이블들도 동일하게 "직원 전원 is_staff()" 로 통일한다.
-- ---------------------------------------------------------------------
alter table class_sessions          enable row level security;
alter table class_session_students  enable row level security;
alter table attendance              enable row level security;
alter table curriculum_units        enable row level security;
alter table question_attempts       enable row level security;
alter table assessments             enable row level security;
alter table assessment_results      enable row level security;
alter table daily_stats             enable row level security;

drop policy if exists "staff manage class_sessions" on class_sessions;
create policy "staff manage class_sessions" on class_sessions
  for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage class_session_students" on class_session_students;
create policy "staff manage class_session_students" on class_session_students
  for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage attendance" on attendance;
create policy "staff manage attendance" on attendance
  for all using (is_staff()) with check (is_staff());

drop policy if exists "student view own attendance" on attendance;
create policy "student view own attendance" on attendance
  for select using (student_id = auth.uid());

drop policy if exists "staff manage curriculum_units" on curriculum_units;
create policy "staff manage curriculum_units" on curriculum_units
  for all using (is_staff()) with check (is_staff());

-- 문항 풀이 시 학생 클라이언트가 단원을 조회해 question_attempts.unit_id 를 채워야 해서 열람은 로그인 전원 허용.
-- 민감정보 아님(단원명뿐, 정답/해설 없음).
drop policy if exists "authenticated view curriculum_units" on curriculum_units;
create policy "authenticated view curriculum_units" on curriculum_units
  for select using (auth.role() = 'authenticated');

drop policy if exists "staff manage question_attempts" on question_attempts;
create policy "staff manage question_attempts" on question_attempts
  for all using (is_staff()) with check (is_staff());

drop policy if exists "student manage own question_attempts" on question_attempts;
create policy "student manage own question_attempts" on question_attempts
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "staff manage assessments" on assessments;
create policy "staff manage assessments" on assessments
  for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage assessment_results" on assessment_results;
create policy "staff manage assessment_results" on assessment_results
  for all using (is_staff()) with check (is_staff());

drop policy if exists "student view own assessment_results" on assessment_results;
create policy "student view own assessment_results" on assessment_results
  for select using (student_id = auth.uid());

drop policy if exists "staff view daily_stats" on daily_stats;
create policy "staff view daily_stats" on daily_stats
  for select using (is_staff());

grant select, insert, update, delete on
  class_sessions, class_session_students, attendance, curriculum_units,
  question_attempts, assessments, assessment_results, daily_stats
  to authenticated;

-- ---------------------------------------------------------------------
-- curriculum_units 시드 — src/lib/curriculum-topics.ts 데이터를 그대로 옮김(434행). 상수가 바뀌면 재실행.
-- ---------------------------------------------------------------------
insert into curriculum_units (curriculum_group, curriculum_detail, unit_name, sort_order) values
  ('KR', '초1', '9까지의 수', 1),
  ('KR', '초1', '여러 가지 모양', 2),
  ('KR', '초1', '덧셈과 뺄셈', 3),
  ('KR', '초1', '비교하기', 4),
  ('KR', '초1', '50까지의 수', 5),
  ('KR', '초1', '100까지의 수', 6),
  ('KR', '초1', '덧셈과 뺄셈(1)', 7),
  ('KR', '초1', '덧셈과 뺄셈(2)', 8),
  ('KR', '초1', '시계 보기와 규칙 찾기', 9),
  ('KR', '초1', '덧셈과 뺄셈(3)', 10),
  ('KR', '초2', '세 자리 수', 1),
  ('KR', '초2', '여러 가지 도형', 2),
  ('KR', '초2', '덧셈과 뺄셈', 3),
  ('KR', '초2', '길이 재기', 4),
  ('KR', '초2', '분류하기', 5),
  ('KR', '초2', '곱셈', 6),
  ('KR', '초2', '네 자리 수', 7),
  ('KR', '초2', '곱셈구구', 8),
  ('KR', '초2', '길이 재기와 시각과 시간', 9),
  ('KR', '초2', '표와 그래프', 10),
  ('KR', '초2', '규칙 찾기', 11),
  ('KR', '초3', '덧셈과 뺄셈', 1),
  ('KR', '초3', '평면도형', 2),
  ('KR', '초3', '나눗셈', 3),
  ('KR', '초3', '곱셈', 4),
  ('KR', '초3', '길이와 시간', 5),
  ('KR', '초3', '분수와 소수', 6),
  ('KR', '초3', '원', 7),
  ('KR', '초3', '분수', 8),
  ('KR', '초3', '들이와 무게', 9),
  ('KR', '초3', '자료의 정리', 10),
  ('KR', '초4', '큰 수', 1),
  ('KR', '초4', '각도', 2),
  ('KR', '초4', '곱셈과 나눗셈', 3),
  ('KR', '초4', '평면도형의 이동', 4),
  ('KR', '초4', '막대그래프와 꺾은선그래프', 5),
  ('KR', '초4', '규칙 찾기', 6),
  ('KR', '초4', '분수의 덧셈과 뺄셈', 7),
  ('KR', '초4', '삼각형', 8),
  ('KR', '초4', '소수의 덧셈과 뺄셈', 9),
  ('KR', '초4', '사각형', 10),
  ('KR', '초4', '꺾은선그래프', 11),
  ('KR', '초4', '다각형', 12),
  ('KR', '초5', '자연수의 혼합 계산', 1),
  ('KR', '초5', '약수와 배수', 2),
  ('KR', '초5', '규칙과 대응', 3),
  ('KR', '초5', '약분과 통분', 4),
  ('KR', '초5', '분수의 덧셈과 뺄셈', 5),
  ('KR', '초5', '다각형의 둘레와 넓이', 6),
  ('KR', '초5', '수의 범위와 어림하기', 7),
  ('KR', '초5', '분수의 곱셈', 8),
  ('KR', '초5', '합동과 대칭', 9),
  ('KR', '초5', '소수의 곱셈', 10),
  ('KR', '초5', '직육면체', 11),
  ('KR', '초5', '평균과 가능성', 12),
  ('KR', '초6', '분수의 나눗셈', 1),
  ('KR', '초6', '각기둥과 각뿔', 2),
  ('KR', '초6', '소수의 나눗셈', 3),
  ('KR', '초6', '비와 비율', 4),
  ('KR', '초6', '여러 가지 그래프', 5),
  ('KR', '초6', '직육면체의 부피와 겉넓이', 6),
  ('KR', '초6', '공간과 입체', 7),
  ('KR', '초6', '비례식과 비례배분', 8),
  ('KR', '초6', '원의 넓이', 9),
  ('KR', '초6', '원기둥', 10),
  ('KR', '초6', '원뿔', 11),
  ('KR', '초6', '구', 12),
  ('KR', '중1', '소인수분해', 1),
  ('KR', '중1', '정수와 유리수', 2),
  ('KR', '중1', '문자의 사용과 식의 계산', 3),
  ('KR', '중1', '일차방정식', 4),
  ('KR', '중1', '좌표평면과 그래프', 5),
  ('KR', '중1', '기본 도형', 6),
  ('KR', '중1', '작도와 합동', 7),
  ('KR', '중1', '다각형', 8),
  ('KR', '중1', '원과 부채꼴', 9),
  ('KR', '중1', '다면체와 회전체', 10),
  ('KR', '중1', '입체도형의 부피와 겉넓이', 11),
  ('KR', '중1', '자료의 정리와 해석(줄기와 잎, 도수분포표, 상대도수)', 12),
  ('KR', '중2', '유리수와 순환소수', 1),
  ('KR', '중2', '단항식과 다항식의 계산', 2),
  ('KR', '중2', '일차부등식', 3),
  ('KR', '중2', '연립일차방정식', 4),
  ('KR', '중2', '일차함수와 그래프', 5),
  ('KR', '중2', '일차함수와 일차방정식의 관계', 6),
  ('KR', '중2', '삼각형과 사각형의 성질', 7),
  ('KR', '중2', '도형의 닮음', 8),
  ('KR', '중2', '피타고라스 정리', 9),
  ('KR', '중2', '경우의 수와 확률', 10),
  ('KR', '중3', '제곱근과 실수', 1),
  ('KR', '중3', '근호를 포함한 식의 계산', 2),
  ('KR', '중3', '다항식의 곱셈', 3),
  ('KR', '중3', '다항식의 인수분해', 4),
  ('KR', '중3', '이차방정식', 5),
  ('KR', '중3', '이차함수와 그래프', 6),
  ('KR', '중3', '삼각비와 활용', 7),
  ('KR', '중3', '원과 직선', 8),
  ('KR', '중3', '원주각', 9),
  ('KR', '중3', '대푯값과 산포도', 10),
  ('KR', '중3', '상관관계', 11),
  ('KR', '공통수학1', '다항식', 1),
  ('KR', '공통수학1', '방정식과 부등식', 2),
  ('KR', '공통수학1', '경우의 수', 3),
  ('KR', '공통수학1', '행렬', 4),
  ('KR', '공통수학2', '도형의 방정식', 1),
  ('KR', '공통수학2', '집합과 명제', 2),
  ('KR', '공통수학2', '함수와 그래프', 3),
  ('KR', '대수', '지수함수와 로그함수', 1),
  ('KR', '대수', '삼각함수', 2),
  ('KR', '대수', '수열', 3),
  ('KR', '미적분Ⅰ', '함수의 극한과 연속', 1),
  ('KR', '미적분Ⅰ', '다항함수의 미분법', 2),
  ('KR', '미적분Ⅰ', '다항함수의 적분법', 3),
  ('KR', '확률과 통계', '경우의 수(순열과 조합)', 1),
  ('KR', '확률과 통계', '확률', 2),
  ('KR', '확률과 통계', '통계(확률분포, 통계적 추정)', 3),
  ('KR', '기하', '이차곡선', 1),
  ('KR', '기하', '평면벡터', 2),
  ('KR', '기하', '공간도형과 공간좌표', 3),
  ('KR', '미적분Ⅱ', '지수함수·로그함수·삼각함수의 미분과 적분', 1),
  ('KR', '미적분Ⅱ', '여러 가지 미분법', 2),
  ('KR', '미적분Ⅱ', '여러 가지 적분법', 3),
  ('KR', '경제 수학', '수와 생활 경제', 1),
  ('KR', '경제 수학', '수열과 금융', 2),
  ('KR', '경제 수학', '함수와 그래프의 경제 활용', 3),
  ('KR', '경제 수학', '미분과 경제', 4),
  ('KR', '인공지능 수학', '인공지능과 수학', 1),
  ('KR', '인공지능 수학', '자료의 표현', 2),
  ('KR', '인공지능 수학', '분류와 예측', 3),
  ('KR', '인공지능 수학', '최적화', 4),
  ('KR', '실용 통계', '통계와 통계적 문제해결', 1),
  ('KR', '실용 통계', '자료의 수집과 정리', 2),
  ('KR', '실용 통계', '자료의 분석', 3),
  ('KR', '수학과제 탐구', '과제 설정', 1),
  ('KR', '수학과제 탐구', '탐구 수행', 2),
  ('KR', '수학과제 탐구', '결과 발표', 3),
  ('IB', 'IB_AA_SL', '수열과 급수', 1),
  ('IB', 'IB_AA_SL', '지수와 로그', 2),
  ('IB', 'IB_AA_SL', '이항정리', 3),
  ('IB', 'IB_AA_SL', '함수의 개념과 그래프', 4),
  ('IB', 'IB_AA_SL', '합성함수와 역함수', 5),
  ('IB', 'IB_AA_SL', '다항함수', 6),
  ('IB', 'IB_AA_SL', '삼각비와 삼각함수', 7),
  ('IB', 'IB_AA_SL', '사인법칙·코사인법칙', 8),
  ('IB', 'IB_AA_SL', '자료의 표현', 9),
  ('IB', 'IB_AA_SL', '상관관계와 회귀', 10),
  ('IB', 'IB_AA_SL', '확률', 11),
  ('IB', 'IB_AA_SL', '이산확률분포', 12),
  ('IB', 'IB_AA_SL', '극한과 미분', 13),
  ('IB', 'IB_AA_SL', '미분법의 응용', 14),
  ('IB', 'IB_AA_SL', '적분법', 15),
  ('IB', 'IB_AA_HL', '수열과 급수', 1),
  ('IB', 'IB_AA_HL', '지수와 로그', 2),
  ('IB', 'IB_AA_HL', '이항정리', 3),
  ('IB', 'IB_AA_HL', '복소수', 4),
  ('IB', 'IB_AA_HL', '행렬', 5),
  ('IB', 'IB_AA_HL', '수학적 귀납법', 6),
  ('IB', 'IB_AA_HL', '함수의 개념과 그래프', 7),
  ('IB', 'IB_AA_HL', '합성함수와 역함수', 8),
  ('IB', 'IB_AA_HL', '다항함수', 9),
  ('IB', 'IB_AA_HL', '함수의 변환 심화', 10),
  ('IB', 'IB_AA_HL', '삼각비와 삼각함수', 11),
  ('IB', 'IB_AA_HL', '사인법칙·코사인법칙', 12),
  ('IB', 'IB_AA_HL', '벡터', 13),
  ('IB', 'IB_AA_HL', '3차원 벡터의 응용', 14),
  ('IB', 'IB_AA_HL', '자료의 표현', 15),
  ('IB', 'IB_AA_HL', '상관관계와 회귀', 16),
  ('IB', 'IB_AA_HL', '확률', 17),
  ('IB', 'IB_AA_HL', '이산확률분포', 18),
  ('IB', 'IB_AA_HL', '정규분포 심화', 19),
  ('IB', 'IB_AA_HL', '베이즈 정리', 20),
  ('IB', 'IB_AA_HL', '극한과 미분', 21),
  ('IB', 'IB_AA_HL', '미분법의 응용', 22),
  ('IB', 'IB_AA_HL', '적분법', 23),
  ('IB', 'IB_AA_HL', '미분방정식', 24),
  ('IB', 'IB_AA_HL', '매클로린 급수', 25),
  ('IB', 'IB_AI_SL', '수와 표기', 1),
  ('IB', 'IB_AI_SL', '수열과 급수(금융 응용 포함)', 2),
  ('IB', 'IB_AI_SL', '이항정리', 3),
  ('IB', 'IB_AI_SL', '함수의 모델링(선형·이차·지수·로그·삼각함수 모델)', 4),
  ('IB', 'IB_AI_SL', '부피와 표면적', 5),
  ('IB', 'IB_AI_SL', '삼각비', 6),
  ('IB', 'IB_AI_SL', '벡터 응용', 7),
  ('IB', 'IB_AI_SL', '자료 수집과 표현', 8),
  ('IB', 'IB_AI_SL', '상관관계', 9),
  ('IB', 'IB_AI_SL', '확률분포(이항·정규)', 10),
  ('IB', 'IB_AI_SL', '가설검정', 11),
  ('IB', 'IB_AI_SL', '미분의 개념과 응용(최적화)', 12),
  ('IB', 'IB_AI_SL', '적분(넓이 계산)', 13),
  ('IB', 'IB_AI_HL', '수와 표기', 1),
  ('IB', 'IB_AI_HL', '수열과 급수(금융 응용 포함)', 2),
  ('IB', 'IB_AI_HL', '이항정리', 3),
  ('IB', 'IB_AI_HL', '복소수 기초', 4),
  ('IB', 'IB_AI_HL', '함수의 모델링(선형·이차·지수·로그·삼각함수 모델)', 5),
  ('IB', 'IB_AI_HL', '함수 모델링 심화', 6),
  ('IB', 'IB_AI_HL', '부피와 표면적', 7),
  ('IB', 'IB_AI_HL', '삼각비', 8),
  ('IB', 'IB_AI_HL', '벡터 응용', 9),
  ('IB', 'IB_AI_HL', '벡터의 외적', 10),
  ('IB', 'IB_AI_HL', '평면과 직선의 방정식', 11),
  ('IB', 'IB_AI_HL', '자료 수집과 표현', 12),
  ('IB', 'IB_AI_HL', '상관관계', 13),
  ('IB', 'IB_AI_HL', '확률분포(이항·정규)', 14),
  ('IB', 'IB_AI_HL', '가설검정', 15),
  ('IB', 'IB_AI_HL', '카이제곱 검정', 16),
  ('IB', 'IB_AI_HL', '스피어만 상관계수', 17),
  ('IB', 'IB_AI_HL', '미분의 개념과 응용(최적화)', 18),
  ('IB', 'IB_AI_HL', '적분(넓이 계산)', 19),
  ('IB', 'IB_AI_HL', '미분방정식의 모델링', 20),
  ('IB', 'IB_AI_HL', '수치해석적 근사', 21),
  ('IGCSE', 'IGCSE_0580', '자연수/정수/유리수/무리수', 1),
  ('IGCSE', 'IGCSE_0580', '비와 비율', 2),
  ('IGCSE', 'IGCSE_0580', '백분율', 3),
  ('IGCSE', 'IGCSE_0580', '표준형(지수 표기)', 4),
  ('IGCSE', 'IGCSE_0580', '극한과 근사', 5),
  ('IGCSE', 'IGCSE_0580', '식의 전개와 인수분해', 6),
  ('IGCSE', 'IGCSE_0580', '방정식(일차·이차·연립)', 7),
  ('IGCSE', 'IGCSE_0580', '부등식', 8),
  ('IGCSE', 'IGCSE_0580', '함수와 그래프', 9),
  ('IGCSE', 'IGCSE_0580', '수열', 10),
  ('IGCSE', 'IGCSE_0580', '각과 다각형의 성질', 11),
  ('IGCSE', 'IGCSE_0580', '합동과 닮음', 12),
  ('IGCSE', 'IGCSE_0580', '원의 성질', 13),
  ('IGCSE', 'IGCSE_0580', '작도', 14),
  ('IGCSE', 'IGCSE_0580', '둘레·넓이·부피', 15),
  ('IGCSE', 'IGCSE_0580', '호의 길이와 부채꼴의 넓이', 16),
  ('IGCSE', 'IGCSE_0580', '입체도형의 겉넓이와 부피', 17),
  ('IGCSE', 'IGCSE_0580', '직선의 방정식', 18),
  ('IGCSE', 'IGCSE_0580', '기울기와 절편', 19),
  ('IGCSE', 'IGCSE_0580', '두 점 사이의 거리', 20),
  ('IGCSE', 'IGCSE_0580', '삼각비', 21),
  ('IGCSE', 'IGCSE_0580', '사인법칙·코사인법칙', 22),
  ('IGCSE', 'IGCSE_0580', '입체도형에서의 삼각비 활용', 23),
  ('IGCSE', 'IGCSE_0580', '벡터의 표현과 연산', 24),
  ('IGCSE', 'IGCSE_0580', '평행이동·회전·확대·반사', 25),
  ('IGCSE', 'IGCSE_0580', '단순확률', 26),
  ('IGCSE', 'IGCSE_0580', '조건부확률', 27),
  ('IGCSE', 'IGCSE_0580', '트리 다이어그램', 28),
  ('IGCSE', 'IGCSE_0580', '대푯값(평균·중앙값·최빈값)', 29),
  ('IGCSE', 'IGCSE_0580', '산포도', 30),
  ('IGCSE', 'IGCSE_0580', '도수분포표와 히스토그램', 31),
  ('IGCSE', 'IGCSE_0580', '누적도수그래프', 32),
  ('IGCSE', 'IGCSE_0607', '자연수/정수/유리수/무리수', 1),
  ('IGCSE', 'IGCSE_0607', '비와 비율', 2),
  ('IGCSE', 'IGCSE_0607', '백분율', 3),
  ('IGCSE', 'IGCSE_0607', '표준형(지수 표기)', 4),
  ('IGCSE', 'IGCSE_0607', '극한과 근사', 5),
  ('IGCSE', 'IGCSE_0607', '식의 전개와 인수분해', 6),
  ('IGCSE', 'IGCSE_0607', '방정식(일차·이차·연립)', 7),
  ('IGCSE', 'IGCSE_0607', '부등식', 8),
  ('IGCSE', 'IGCSE_0607', '함수와 그래프', 9),
  ('IGCSE', 'IGCSE_0607', '수열', 10),
  ('IGCSE', 'IGCSE_0607', '각과 다각형의 성질', 11),
  ('IGCSE', 'IGCSE_0607', '합동과 닮음', 12),
  ('IGCSE', 'IGCSE_0607', '원의 성질', 13),
  ('IGCSE', 'IGCSE_0607', '작도', 14),
  ('IGCSE', 'IGCSE_0607', '둘레·넓이·부피', 15),
  ('IGCSE', 'IGCSE_0607', '호의 길이와 부채꼴의 넓이', 16),
  ('IGCSE', 'IGCSE_0607', '입체도형의 겉넓이와 부피', 17),
  ('IGCSE', 'IGCSE_0607', '직선의 방정식', 18),
  ('IGCSE', 'IGCSE_0607', '기울기와 절편', 19),
  ('IGCSE', 'IGCSE_0607', '두 점 사이의 거리', 20),
  ('IGCSE', 'IGCSE_0607', '삼각비', 21),
  ('IGCSE', 'IGCSE_0607', '사인법칙·코사인법칙', 22),
  ('IGCSE', 'IGCSE_0607', '입체도형에서의 삼각비 활용', 23),
  ('IGCSE', 'IGCSE_0607', '벡터의 표현과 연산', 24),
  ('IGCSE', 'IGCSE_0607', '평행이동·회전·확대·반사', 25),
  ('IGCSE', 'IGCSE_0607', '단순확률', 26),
  ('IGCSE', 'IGCSE_0607', '조건부확률', 27),
  ('IGCSE', 'IGCSE_0607', '트리 다이어그램', 28),
  ('IGCSE', 'IGCSE_0607', '대푯값(평균·중앙값·최빈값)', 29),
  ('IGCSE', 'IGCSE_0607', '산포도', 30),
  ('IGCSE', 'IGCSE_0607', '도수분포표와 히스토그램', 31),
  ('IGCSE', 'IGCSE_0607', '누적도수그래프', 32),
  ('IGCSE', 'IGCSE_0607', '탐구 과제(코스워크)', 33),
  ('CBSE', 'CBSE_Class1', '수 개념', 1),
  ('CBSE', 'CBSE_Class1', '사칙연산 기초', 2),
  ('CBSE', 'CBSE_Class1', '도형 인식', 3),
  ('CBSE', 'CBSE_Class1', '측정(길이·무게·시간)', 4),
  ('CBSE', 'CBSE_Class1', '자료 다루기 기초', 5),
  ('CBSE', 'CBSE_Class2', '수 개념', 1),
  ('CBSE', 'CBSE_Class2', '사칙연산 기초', 2),
  ('CBSE', 'CBSE_Class2', '도형 인식', 3),
  ('CBSE', 'CBSE_Class2', '측정(길이·무게·시간)', 4),
  ('CBSE', 'CBSE_Class2', '자료 다루기 기초', 5),
  ('CBSE', 'CBSE_Class3', '수 개념', 1),
  ('CBSE', 'CBSE_Class3', '사칙연산 기초', 2),
  ('CBSE', 'CBSE_Class3', '도형 인식', 3),
  ('CBSE', 'CBSE_Class3', '측정(길이·무게·시간)', 4),
  ('CBSE', 'CBSE_Class3', '자료 다루기 기초', 5),
  ('CBSE', 'CBSE_Class4', '수 개념', 1),
  ('CBSE', 'CBSE_Class4', '사칙연산 기초', 2),
  ('CBSE', 'CBSE_Class4', '도형 인식', 3),
  ('CBSE', 'CBSE_Class4', '측정(길이·무게·시간)', 4),
  ('CBSE', 'CBSE_Class4', '자료 다루기 기초', 5),
  ('CBSE', 'CBSE_Class5', '수 개념', 1),
  ('CBSE', 'CBSE_Class5', '사칙연산 기초', 2),
  ('CBSE', 'CBSE_Class5', '도형 인식', 3),
  ('CBSE', 'CBSE_Class5', '측정(길이·무게·시간)', 4),
  ('CBSE', 'CBSE_Class5', '자료 다루기 기초', 5),
  ('CBSE', 'CBSE_Class6', '정수', 1),
  ('CBSE', 'CBSE_Class6', '분수와 소수', 2),
  ('CBSE', 'CBSE_Class6', '대수 기초(문자식)', 3),
  ('CBSE', 'CBSE_Class6', '비와 비율', 4),
  ('CBSE', 'CBSE_Class6', '기본 도형과 각', 5),
  ('CBSE', 'CBSE_Class6', '넓이·부피', 6),
  ('CBSE', 'CBSE_Class6', '자료의 표현(그래프)', 7),
  ('CBSE', 'CBSE_Class6', '백분율', 8),
  ('CBSE', 'CBSE_Class7', '정수', 1),
  ('CBSE', 'CBSE_Class7', '분수와 소수', 2),
  ('CBSE', 'CBSE_Class7', '대수 기초(문자식)', 3),
  ('CBSE', 'CBSE_Class7', '비와 비율', 4),
  ('CBSE', 'CBSE_Class7', '기본 도형과 각', 5),
  ('CBSE', 'CBSE_Class7', '넓이·부피', 6),
  ('CBSE', 'CBSE_Class7', '자료의 표현(그래프)', 7),
  ('CBSE', 'CBSE_Class7', '백분율', 8),
  ('CBSE', 'CBSE_Class8', '정수', 1),
  ('CBSE', 'CBSE_Class8', '분수와 소수', 2),
  ('CBSE', 'CBSE_Class8', '대수 기초(문자식)', 3),
  ('CBSE', 'CBSE_Class8', '비와 비율', 4),
  ('CBSE', 'CBSE_Class8', '기본 도형과 각', 5),
  ('CBSE', 'CBSE_Class8', '넓이·부피', 6),
  ('CBSE', 'CBSE_Class8', '자료의 표현(그래프)', 7),
  ('CBSE', 'CBSE_Class8', '백분율', 8),
  ('CBSE', 'CBSE_Class9', 'Number Systems', 1),
  ('CBSE', 'CBSE_Class9', 'Polynomials', 2),
  ('CBSE', 'CBSE_Class9', 'Coordinate Geometry', 3),
  ('CBSE', 'CBSE_Class9', 'Linear Equations in Two Variables', 4),
  ('CBSE', 'CBSE_Class9', 'Introduction to Euclid''s Geometry', 5),
  ('CBSE', 'CBSE_Class9', 'Lines and Angles', 6),
  ('CBSE', 'CBSE_Class9', 'Triangles', 7),
  ('CBSE', 'CBSE_Class9', 'Quadrilaterals', 8),
  ('CBSE', 'CBSE_Class9', 'Areas of Parallelograms and Triangles', 9),
  ('CBSE', 'CBSE_Class9', 'Circles', 10),
  ('CBSE', 'CBSE_Class9', 'Constructions', 11),
  ('CBSE', 'CBSE_Class9', 'Heron''s Formula', 12),
  ('CBSE', 'CBSE_Class9', 'Surface Areas and Volumes', 13),
  ('CBSE', 'CBSE_Class9', 'Statistics', 14),
  ('CBSE', 'CBSE_Class9', 'Probability', 15),
  ('CBSE', 'CBSE_Class10', 'Real Numbers', 1),
  ('CBSE', 'CBSE_Class10', 'Polynomials', 2),
  ('CBSE', 'CBSE_Class10', 'Pair of Linear Equations in Two Variables', 3),
  ('CBSE', 'CBSE_Class10', 'Quadratic Equations', 4),
  ('CBSE', 'CBSE_Class10', 'Arithmetic Progressions', 5),
  ('CBSE', 'CBSE_Class10', 'Triangles', 6),
  ('CBSE', 'CBSE_Class10', 'Coordinate Geometry', 7),
  ('CBSE', 'CBSE_Class10', 'Introduction to Trigonometry', 8),
  ('CBSE', 'CBSE_Class10', 'Applications of Trigonometry', 9),
  ('CBSE', 'CBSE_Class10', 'Circles', 10),
  ('CBSE', 'CBSE_Class10', 'Areas Related to Circles', 11),
  ('CBSE', 'CBSE_Class10', 'Surface Areas and Volumes', 12),
  ('CBSE', 'CBSE_Class10', 'Statistics', 13),
  ('CBSE', 'CBSE_Class10', 'Probability', 14),
  ('CBSE', 'CBSE_Class11_Maths', 'Sets', 1),
  ('CBSE', 'CBSE_Class11_Maths', 'Relations and Functions', 2),
  ('CBSE', 'CBSE_Class11_Maths', 'Trigonometric Functions', 3),
  ('CBSE', 'CBSE_Class11_Maths', 'Principle of Mathematical Induction', 4),
  ('CBSE', 'CBSE_Class11_Maths', 'Complex Numbers and Quadratic Equations', 5),
  ('CBSE', 'CBSE_Class11_Maths', 'Linear Inequalities', 6),
  ('CBSE', 'CBSE_Class11_Maths', 'Permutations and Combinations', 7),
  ('CBSE', 'CBSE_Class11_Maths', 'Binomial Theorem', 8),
  ('CBSE', 'CBSE_Class11_Maths', 'Sequences and Series', 9),
  ('CBSE', 'CBSE_Class11_Maths', 'Straight Lines', 10),
  ('CBSE', 'CBSE_Class11_Maths', 'Conic Sections', 11),
  ('CBSE', 'CBSE_Class11_Maths', 'Introduction to Three Dimensional Geometry', 12),
  ('CBSE', 'CBSE_Class11_Maths', 'Limits and Derivatives', 13),
  ('CBSE', 'CBSE_Class11_Maths', 'Statistics', 14),
  ('CBSE', 'CBSE_Class11_Maths', 'Probability', 15),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Numbers Quantification and Numerical Applications', 1),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Algebra', 2),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Coordinate Geometry', 3),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Mathematical Reasoning', 4),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Calculus (기초 미분)', 5),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Probability Distributions', 6),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Descriptive Statistics', 7),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Basics of Financial Mathematics', 8),
  ('CBSE', 'CBSE_Class11_AppliedMaths', 'Basics of Computer and Logical Reasoning', 9),
  ('CBSE', 'CBSE_Class12_Maths', 'Relations and Functions', 1),
  ('CBSE', 'CBSE_Class12_Maths', 'Inverse Trigonometric Functions', 2),
  ('CBSE', 'CBSE_Class12_Maths', 'Matrices', 3),
  ('CBSE', 'CBSE_Class12_Maths', 'Determinants', 4),
  ('CBSE', 'CBSE_Class12_Maths', 'Continuity and Differentiability', 5),
  ('CBSE', 'CBSE_Class12_Maths', 'Applications of Derivatives', 6),
  ('CBSE', 'CBSE_Class12_Maths', 'Integrals', 7),
  ('CBSE', 'CBSE_Class12_Maths', 'Applications of Integrals', 8),
  ('CBSE', 'CBSE_Class12_Maths', 'Differential Equations', 9),
  ('CBSE', 'CBSE_Class12_Maths', 'Vector Algebra', 10),
  ('CBSE', 'CBSE_Class12_Maths', 'Three Dimensional Geometry', 11),
  ('CBSE', 'CBSE_Class12_Maths', 'Linear Programming', 12),
  ('CBSE', 'CBSE_Class12_Maths', 'Probability', 13),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Numbers Quantification and Numerical Applications', 1),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Algebra', 2),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Calculus', 3),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Probability Distributions', 4),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Inferential Statistics', 5),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Index Numbers and Time-Based Data', 6),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Financial Mathematics', 7),
  ('CBSE', 'CBSE_Class12_AppliedMaths', 'Linear Programming', 8),
  ('AS_A_Level', 'AS_A_Level_P1', 'Quadratics', 1),
  ('AS_A_Level', 'AS_A_Level_P1', 'Functions', 2),
  ('AS_A_Level', 'AS_A_Level_P1', 'Coordinate Geometry', 3),
  ('AS_A_Level', 'AS_A_Level_P1', 'Circular Measure', 4),
  ('AS_A_Level', 'AS_A_Level_P1', 'Trigonometry', 5),
  ('AS_A_Level', 'AS_A_Level_P1', 'Series (이항정리·등차등비수열)', 6),
  ('AS_A_Level', 'AS_A_Level_P1', 'Differentiation', 7),
  ('AS_A_Level', 'AS_A_Level_P1', 'Integration', 8),
  ('AS_A_Level', 'AS_A_Level_P2', 'Algebra(대수 심화: 나머지정리·인수정리)', 1),
  ('AS_A_Level', 'AS_A_Level_P2', 'Logarithmic and Exponential Functions', 2),
  ('AS_A_Level', 'AS_A_Level_P2', 'Trigonometry 심화', 3),
  ('AS_A_Level', 'AS_A_Level_P2', 'Differentiation 심화', 4),
  ('AS_A_Level', 'AS_A_Level_P2', 'Integration 심화(수치적분 포함)', 5),
  ('AS_A_Level', 'AS_A_Level_P3', 'Algebra 심화', 1),
  ('AS_A_Level', 'AS_A_Level_P3', 'Logarithmic and Exponential Functions 심화', 2),
  ('AS_A_Level', 'AS_A_Level_P3', 'Trigonometry 심화', 3),
  ('AS_A_Level', 'AS_A_Level_P3', 'Differentiation 심화(음함수·매개변수 미분)', 4),
  ('AS_A_Level', 'AS_A_Level_P3', 'Integration 심화', 5),
  ('AS_A_Level', 'AS_A_Level_P3', 'Numerical Solution of Equations', 6),
  ('AS_A_Level', 'AS_A_Level_P3', 'Vectors', 7),
  ('AS_A_Level', 'AS_A_Level_P3', 'Differential Equations', 8),
  ('AS_A_Level', 'AS_A_Level_M1', 'Forces and Equilibrium', 1),
  ('AS_A_Level', 'AS_A_Level_M1', 'Kinematics of Motion in a Straight Line', 2),
  ('AS_A_Level', 'AS_A_Level_M1', 'Momentum', 3),
  ('AS_A_Level', 'AS_A_Level_M1', 'Newton''s Laws of Motion', 4),
  ('AS_A_Level', 'AS_A_Level_M1', 'Energy, Work and Power', 5),
  ('AS_A_Level', 'AS_A_Level_S1', 'Representation of Data', 1),
  ('AS_A_Level', 'AS_A_Level_S1', 'Permutations and Combinations', 2),
  ('AS_A_Level', 'AS_A_Level_S1', 'Probability', 3),
  ('AS_A_Level', 'AS_A_Level_S1', 'Discrete Random Variables', 4),
  ('AS_A_Level', 'AS_A_Level_S1', 'The Normal Distribution', 5),
  ('AS_A_Level', 'AS_A_Level_S2', 'The Poisson Distribution', 1),
  ('AS_A_Level', 'AS_A_Level_S2', 'Linear Combinations of Random Variables', 2),
  ('AS_A_Level', 'AS_A_Level_S2', 'Continuous Random Variables', 3),
  ('AS_A_Level', 'AS_A_Level_S2', 'Sampling and Estimation', 4),
  ('AS_A_Level', 'AS_A_Level_S2', 'Hypothesis Tests', 5)
on conflict (curriculum_group, curriculum_detail, unit_name) do nothing;

-- 실행 후 확인용
select 'class_sessions' as table_name, count(*) from class_sessions
union all select 'attendance', count(*) from attendance
union all select 'curriculum_units', count(*) from curriculum_units
union all select 'question_attempts', count(*) from question_attempts
union all select 'assessments', count(*) from assessments
union all select 'assessment_results', count(*) from assessment_results
union all select 'daily_stats', count(*) from daily_stats;
