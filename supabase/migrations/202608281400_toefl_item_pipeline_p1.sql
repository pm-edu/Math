-- TOEFL 문항 생성·저장·자동조립 파이프라인 Phase 1(스키마). 지시서 원안(사용자 제공,
-- 2026-08-28) 그대로가 아니라 Phase 0 조사 결과 + 사용자 결정에 맞춰 조정했다
-- (자세한 근거는 [[toefl-item-pipeline-project]] 메모리 참고):
--
--   1) 지시서의 `CREATE TABLE toefl_generation_batch`는 그대로 실행하면 에러난다 —
--      이미 존재하는 테이블이다(202608191600, module_id+task_type 단건 요청 1행 단위).
--      그 테이블은 안 건드리고, 지시서가 원하는 "대량 생성 런" 개념은 별도
--      `toefl_generation_run` 테이블로 새로 만든 뒤 기존 테이블에 run_id만 이어붙였다.
--   2) 지시서의 `ADD COLUMN is_active DEFAULT false`는 안 넣는다 — `toefl_item.is_active`는
--      이미 있고(기본 true) 의미도 다르다("검수 통과"가 아니라 "응시 중 선택 후보로 쓸지"
--      운영 스위치). 검수 게이트 역할은 계속 기존 `verified` 컬럼이 한다.
--   3) 지시서의 조립 선택 SQL이 `toefl_item.section`이 있다고 가정하는데 실제로는
--      module_id → toefl_module.section으로만 알 수 있다 — 조립 쿼리를 단순하게 유지하려고
--      section을 toefl_item에 비정규화해서 추가하고, 트리거로 항상 module과 동기화한다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create extension if not exists vector;

-- ═══════════ 1) 대량 생성 "런" 추적 (신규 테이블) ═══════════
-- 기존 toefl_generation_batch(단건 요청 1행)와는 층위가 다르다 — 이건 "한 번에 N세트분을
-- 돌린 작업 전체"를 추적한다. run 하나 안에서 여러 개의 기존 toefl_generation_batch
-- 행이 생긴다(모듈×유형 조합마다 하나씩, 기존 방식 그대로 재사용).
create table if not exists toefl_generation_run (
  id                uuid primary key default gen_random_uuid(),
  run_number        int generated always as identity,  -- 사람이 부르기 쉬운 순번(#1, #2...)
  label             text,                                -- 예: "2026-08 1차 대량생성"
  target_sets       int,                                 -- 이 런이 몇 세트분을 목표로 했는지
  requested_count   int,
  generated_count   int not null default 0,
  approved_count    int not null default 0,
  duplicate_count   int not null default 0,
  model_used        text,                                -- 'claude-sonnet-5'
  prompt_version    text,                                -- 프롬프트 개선 이력 추적
  status            text not null default 'pending'
                      check (status in ('pending','generating','reviewing','approved','rejected')),
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  reviewed_at        timestamptz,
  notes             text
);

alter table toefl_generation_run enable row level security;
drop policy if exists "staff manage generation runs" on toefl_generation_run;
create policy "staff manage generation runs" on toefl_generation_run
  for all to authenticated using (is_staff()) with check (is_staff());

-- 기존 단건 요청 테이블을 런에 이어붙일 수 있게(선택적 — 단건 생성 화면은 계속 null로 씀).
alter table toefl_generation_batch
  add column if not exists run_id uuid references toefl_generation_run(id) on delete set null;
create index if not exists toefl_generation_batch_run_idx on toefl_generation_batch (run_id);

-- ═══════════ 2) toefl_item 확장 ═══════════
alter table toefl_item
  add column if not exists section       toefl_section,
  add column if not exists embedding     vector(1024),  -- Phase 3에서 임베딩 모델 확정 후 차원수 재확인
  add column if not exists dedup_status  text not null default 'unique'
                              check (dedup_status in ('unique','near_duplicate','duplicate')),
  add column if not exists duplicate_of  uuid references toefl_item(id) on delete set null,
  add column if not exists usage_count   int not null default 0,
  add column if not exists last_used_at  timestamptz,
  -- 지금은 안 쓴다 — 나중에 LLM 품질 심사 단계(부록 A)를 붙일 때를 위해 미리 만들어 둔다.
  add column if not exists ai_review_status text check (ai_review_status in ('pass','flag','fail')),
  add column if not exists ai_review_note   text,
  add column if not exists ai_reviewed_at   timestamptz;

-- section 백필(기존 96행) + 앞으로도 module_id가 정해지면 자동으로 맞춰지도록 트리거.
update toefl_item ti set section = tm.section
  from toefl_module tm where tm.id = ti.module_id and ti.section is distinct from tm.section;

create or replace function toefl_item_sync_section() returns trigger as $$
begin
  select section into new.section from toefl_module where id = new.module_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists toefl_item_sync_section_trg on toefl_item;
create trigger toefl_item_sync_section_trg
  before insert or update of module_id on toefl_item
  for each row execute function toefl_item_sync_section();

alter table toefl_item alter column section set not null;

-- ═══════════ 3) 인덱스 ═══════════
-- 조립(Phase 5) 선택 쿼리가 이 조합으로 필터링한다.
create index if not exists toefl_item_selection_idx
  on toefl_item (section, task_type, difficulty, is_active, usage_count);

-- 자체 중복검사(Phase 3)가 "같은 section+task_type 안에서만" 비교하므로 이 인덱스로 좁혀진다.
create index if not exists toefl_item_dedup_idx
  on toefl_item (section, task_type, dedup_status);

-- ═══════════ 확인 ═══════════
select extname from pg_extension where extname = 'vector';
select count(*) as total, count(*) filter (where section is not null) as section_filled from toefl_item;
