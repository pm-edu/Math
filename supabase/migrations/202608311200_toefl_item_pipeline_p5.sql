-- TOEFL 문항 파이프라인 Phase 5(블루프린트 기반 자동조립). [[toefl-item-pipeline-project]] 참고.
--
-- 지금 응시 화면(resolveModuleItemIds, src/lib/toefl/server/modules.ts)은 "응시 시점에
-- 모듈 풀에서 무작위로 뽑는" 동적 방식이라 이미 잘 동작하고, 이 마이그레이션은 그걸 안
-- 건드린다. Phase 5는 그 위에 "관리자가 미리 고정된 세트 하나를 통째로 뽑아서 저장해두는"
-- 별도 도구를 위한 것 — Phase 1(202608281400)이 이미 만들어둔
-- toefl_item.usage_count/last_used_at(그때 주석: "조립(Phase 5) 선택 쿼리가 이 조합으로
-- 필터링한다")를 실제로 쓰는 지점이다. least-used 우선으로 뽑아서 특정 문항만 매번 반복
-- 노출되는 걸 피한다.
--
-- 되돌리는 법: drop table toefl_assembled_set_module; drop table toefl_assembled_set;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create table if not exists toefl_assembled_set (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null references toefl_form(id) on delete cascade,
  set_number      int generated always as identity,  -- 사람이 부르기 쉬운 순번(#1, #2...)
  label           text,
  strategy        text not null default 'least_used' check (strategy in ('least_used')),
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists toefl_assembled_set_module (
  set_id          uuid not null references toefl_assembled_set(id) on delete cascade,
  module_id       uuid not null references toefl_module(id) on delete cascade,
  item_ids        uuid[] not null,
  primary key (set_id, module_id)
);

alter table toefl_assembled_set enable row level security;
alter table toefl_assembled_set_module enable row level security;

drop policy if exists "staff manage assembled sets" on toefl_assembled_set;
create policy "staff manage assembled sets" on toefl_assembled_set
  for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "staff manage assembled set modules" on toefl_assembled_set_module;
create policy "staff manage assembled set modules" on toefl_assembled_set_module
  for all to authenticated using (is_staff()) with check (is_staff());

-- ═══════════ 확인 ═══════════
select table_name from information_schema.tables
  where table_name in ('toefl_assembled_set', 'toefl_assembled_set_module');
