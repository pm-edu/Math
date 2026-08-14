-- 대량 문제 규칙 기반 출제(STAGE 4): 조건(규칙)을 정의하면 시스템이 조건에 맞는
-- 문제를 자동으로 뽑아주는 기능의 데이터 구조. 선별 로직 자체는 STAGE 5에서 붙는다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다(additive).

-- 1) 규칙(템플릿): "중2 2학기 중간고사 세트" 같은 조건 묶음.
create table if not exists assembly_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default 'math', -- 'math' | 'english' — 과목마다 단원 체계가 달라 규칙도 과목별
  -- criteria 구조 예시(자유 JSON, 앱에서 해석):
  -- {
  --   "category": ["중등"],              학교급 다중선택, null/빈배열=무관
  --   "course_level": ["중2 2학기"],      과정 다중선택, null=무관
  --   "unit": ["이차방정식", "함수"],     단원 다중선택, null=무관
  --   "difficulty_distribution": {"하":20,"중":60,"상":20}  또는 null=무관(비율 안 따짐)
  --   "problem_format_distribution": {"객관식":70,"서술형":30} 또는 null=무관
  --   "count": 20,                       총 문항 수
  --   "exclude_recent_days": 90          최근 N일 내 출제된 문제 제외(선택, null=제외 안 함)
  -- }
  criteria jsonb not null default '{}'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  last_used_at timestamptz
);
create index if not exists assembly_rules_subject_idx on assembly_rules (subject);

-- 2) 결과(한 번의 자동 출제 시도): 어떤 규칙으로 어떤 문제들이 뽑혔는지.
-- rule_id가 나중에 지워지거나 바뀌어도 이 결과가 "그때 어떤 조건으로 뽑혔는지" 알 수 있도록
-- criteria를 스냅샷으로 같이 저장한다(rule_snapshot).
create table if not exists assembly_results (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references assembly_rules(id) on delete set null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  problem_ids uuid[] not null default '{}', -- 뽑힌 문제, 배포 순서 그대로
  worksheet_id uuid references worksheets(id) on delete set null, -- "이 세트로 확정" 시 연결됨(STAGE 5)
  generated_by uuid references profiles(id) on delete set null,
  generated_at timestamptz default now()
);
create index if not exists assembly_results_rule_idx on assembly_results (rule_id);
create index if not exists assembly_results_worksheet_idx on assembly_results (worksheet_id);

-- 3) 부분 교체 이력: 결과 미리보기에서 "다시 뽑기"로 개별 문제를 바꾼 기록.
create table if not exists assembly_result_swaps (
  id uuid primary key default gen_random_uuid(),
  result_id uuid references assembly_results(id) on delete cascade not null,
  old_problem_id uuid references problems(id) on delete set null,
  new_problem_id uuid references problems(id) on delete set null,
  swapped_by uuid references profiles(id) on delete set null,
  swapped_at timestamptz default now()
);
create index if not exists assembly_result_swaps_result_idx on assembly_result_swaps (result_id);

-- ===== 보안 정책: 자료 관리 = 직원 전원(문제은행과 동일 원칙) =====
alter table assembly_rules enable row level security;
alter table assembly_results enable row level security;
alter table assembly_result_swaps enable row level security;

drop policy if exists "staff manage assembly_rules" on assembly_rules;
create policy "staff manage assembly_rules" on assembly_rules for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage assembly_results" on assembly_results;
create policy "staff manage assembly_results" on assembly_results for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage assembly_result_swaps" on assembly_result_swaps;
create policy "staff manage assembly_result_swaps" on assembly_result_swaps for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on assembly_rules to authenticated;
grant select, insert, update, delete on assembly_results to authenticated;
grant select, insert, update, delete on assembly_result_swaps to authenticated;

-- 4) 규칙 기반 후보 조회 성능: 지금 있는 인덱스(category, course_level, unit, difficulty)엔
--    subject·problem_format이 빠져 있다. STAGE 5가 "과목+학교급+과정+단원+난이도+유형"을
--    조합해 후보를 훑을 것이므로 여기에 맞춰 확장한다.
drop index if exists problems_filter_idx;
create index if not exists problems_filter_idx
  on problems (subject, category, course_level, unit, difficulty, problem_format);

-- 자동 출제는 검수된(verified=true) 문제만 후보로 써야 안전하다 — 이 조건이 항상 붙으므로
-- 부분 인덱스로 별도로 얹어 스캔 범위를 좁힌다.
create index if not exists problems_verified_partial_idx
  on problems (subject, category, difficulty)
  where verified = true;
