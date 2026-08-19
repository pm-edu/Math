-- TOEFL P6 후속: 관리자가 문항을 계속 등록하면 모듈 안 문항 수가 블루프린트 목표치보다
-- 많아질 수 있다. 이제 학생이 시험을 시작할 때마다 "모듈에 있는 문항 전부"가 아니라
-- task_mix가 정한 유형별 개수만큼 무작위로 뽑아 구성한다(같은 attempt 안에서는 항상
-- 같은 조합이 나오도록 그 결과를 저장해두고 재사용 — src/lib/toefl/server/modules.ts
-- resolveModuleItemIds 참고).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table toefl_item add column if not exists is_active boolean not null default true;

-- 무작위 추출 시 module_id+task_type+is_active로 좁혀서 조회하므로(전체 스캔 아님) 문항이
-- 아무리 쌓여도 이 조회는 가볍게 유지된다.
create index if not exists toefl_item_module_type_active_idx on toefl_item (module_id, task_type, is_active);

create table if not exists toefl_attempt_item_selection (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references toefl_attempt(id) on delete cascade,
  module_id   uuid not null references toefl_module(id) on delete cascade,
  item_ids    uuid[] not null,
  created_at  timestamptz not null default now(),
  unique (attempt_id, module_id)
);

alter table toefl_attempt_item_selection enable row level security;

-- 본인 것만 조회(리뷰 화면에서 필요), 직원은 전체 조회(검수용). insert/update 정책은 없음
-- (기본 차단) — 뽑기·저장은 항상 service role(서버, resolveModuleItemIds)로만 한다
-- (toefl_ai_score와 같은 패턴: "채점 파이프라인만 기록, 학생 insert/update 없음").
create policy "own or staff item selection" on toefl_attempt_item_selection
  for select to authenticated using (
    is_staff() or exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  );
