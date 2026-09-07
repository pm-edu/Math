-- 수학 학습 진행 구조 PG-A: 문항 채점 가능화 준비 (RUN_MATH_PROGRESSION.md A-2)
--
-- 지시서 원문 SQL은 unit_id/problem_id를 bigint로 가정했지만, 이 프로젝트의 problems.id /
-- curriculum_units.id는 실제로 uuid다(0단계 탐색에서 직접 확인, profiles.id와 같은 방식).
-- 그래서 FK 타입을 uuid로 정정했다 — 이 파일 말고는 지시서 스펙을 그대로 따른다.
--
-- 되돌리려면: alter table problems drop column unit_id, drop column answer_format,
--   drop column answer_spec, drop column is_auto_gradable; (인덱스는 컬럼과 함께 자동 삭제)
-- RLS: 기존 problems 정책을 그대로 상속한다(컬럼 추가는 RLS에 영향 없음) — 새 정책 안 만듦.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table problems
  add column if not exists unit_id uuid references curriculum_units(id),
  add column if not exists answer_format text
    check (answer_format in ('mcq', 'numeric', 'expression', 'free')),
  add column if not exists answer_spec jsonb,
  add column if not exists is_auto_gradable boolean not null default false;

create index if not exists problems_unit_id_verified_idx
  on problems (unit_id) where verified = true;

create index if not exists problems_unit_id_difficulty_gradable_idx
  on problems (unit_id, difficulty) where verified = true and is_auto_gradable = true;
