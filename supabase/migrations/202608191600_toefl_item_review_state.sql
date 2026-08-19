-- B단계: TOEFL 문항에 "검수 상태"를 도입한다.
--
-- 지금까지는 관리 화면에서 저장하면 곧바로 학생에게 노출됐다(is_active 기본 true).
-- 그래서 AI가 만든 초안은 브라우저 메모리에만 있다가 저장 안 하면 사라졌고,
-- "검수 대기 큐"(docs/toefl-admin.html VIEW 3)를 세션 너머로 유지할 방법이 없었다.
-- 이 마이그레이션이 초안을 DB에 남겨두되 학생에게는 안 보이게 만든다.
--
-- 검수 원칙(CLAUDE.md): AI 생성물은 관리자가 저장 버튼을 눌러야만 학생에게 노출되고,
-- 그 판정은 화면이 아니라 DB가 한다. 여기서는 toefl_item_public 뷰가 그 방어선이다.
--
-- 되돌리는 법:
--   drop view toefl_item_public cascade;  -- 아래 원래 정의로 다시 만든다(verified 조건 없이)
--   alter table toefl_item drop column verified, drop column source,
--     drop column reviewed_by, drop column reviewed_at, drop column batch_id;
--   drop table if exists toefl_generation_batch cascade;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- ═══════════ 1) 문항 검수 상태 컬럼 ═══════════

-- verified: 관리자가 검수를 마쳤는가. false면 학생 쪽 뷰에서 걸러진다.
alter table toefl_item add column if not exists verified boolean not null default false;

-- source: 초안이 어디서 왔는가. 검수 큐에서 "AI 생성 / 직접 등록" 배지로 쓴다.
alter table toefl_item add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'toefl_item_source_check') then
    alter table toefl_item add constraint toefl_item_source_check check (source in ('ai', 'manual', 'seed'));
  end if;
end $$;

alter table toefl_item add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table toefl_item add column if not exists reviewed_at timestamptz;

-- 어느 생성 배치에서 나왔는가(직접 등록·시드는 null). 배치 테이블을 만든 뒤 FK를 건다.
alter table toefl_item add column if not exists batch_id uuid;

-- ═══════════ 2) 기존 문항 보정 ═══════════
-- 지금 DB에 있는 문항은 전부 관리자가 등록 화면에서 직접 저장했거나 시드로 넣은 것이라
-- 이미 사람 손을 거쳤다. 검수 완료로 표시하지 않으면 이 마이그레이션 직후 학생 화면에서
-- 문항이 통째로 사라진다 — 반드시 함께 실행되어야 하는 부분이다.
update toefl_item
   set verified = true,
       reviewed_at = coalesce(reviewed_at, created_at)
 where verified = false;

-- 검수 큐 조회(미검수 최신순)를 위한 인덱스.
create index if not exists toefl_item_review_queue_idx
  on toefl_item (verified, created_at desc)
  where verified = false;

-- ═══════════ 3) 생성 배치 ═══════════
-- 한 번의 "N문항 생성 요청"이 한 행. 검수 큐에서 "AI 생성 · B-024" 로 묶어 보여주고,
-- 생성 이력 화면(docs/toefl-admin.html VIEW 2)의 표가 이 테이블을 읽는다.
create table if not exists toefl_generation_batch (
  id              uuid primary key default gen_random_uuid(),
  -- 사람이 부르는 번호(#B-024). 문자열 조합 대신 시퀀스로 두어 중복이 없게 한다.
  seq             bigint generated always as identity,
  module_id       uuid references toefl_module(id) on delete set null,
  task_type       toefl_task_type not null,
  requested_count int not null check (requested_count between 1 and 50),
  difficulty      smallint check (difficulty between 1 and 5),
  topic           text,
  model           text not null,
  -- draft: 생성만 됨 / reviewing: 일부 검수됨 / done: 전부 처리됨 / discarded: 폐기
  status          text not null default 'draft' check (status in ('draft', 'reviewing', 'done', 'discarded')),
  -- 독립 재검증 결과 요약. 예: {"match": 4, "mismatch": 1}. 재검증을 안 돌렸으면 null.
  recheck_summary jsonb,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists toefl_generation_batch_recent_idx on toefl_generation_batch (created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'toefl_item_batch_fk') then
    alter table toefl_item
      add constraint toefl_item_batch_fk
      foreign key (batch_id) references toefl_generation_batch(id) on delete set null;
  end if;
end $$;

create index if not exists toefl_item_batch_idx on toefl_item (batch_id);

-- ═══════════ 4) 보안 정책 ═══════════
-- 배치는 순수 관리 데이터라 학생이 볼 이유가 없다. 직원만 전체 권한.
alter table toefl_generation_batch enable row level security;

drop policy if exists "staff manage generation batches" on toefl_generation_batch;
create policy "staff manage generation batches" on toefl_generation_batch
  for all to authenticated using (is_staff()) with check (is_staff());

grant select, insert, update, delete on toefl_generation_batch to authenticated;

-- ═══════════ 5) 학생 노출 차단 (진짜 방어선) ═══════════
-- 학생은 toefl_item 테이블에 직접 접근하지 못하고 이 뷰로만 읽는다(마이그레이션 202608151201).
-- 뷰에 verified 조건을 넣어야 검수 전 문항이 어떤 경로로도 새지 않는다.
-- 컬럼 목록은 그대로라 create or replace 로 교체 가능하고, 기존 GRANT도 유지된다.
--
-- is_active 는 일부러 넣지 않았다: 응시 중인 학생의 문항 선택 결과
-- (toefl_attempt_item_selection)는 시험 시작 시점에 확정되는데, 도중에 관리자가 문항을
-- 비활성화하면 진행 중인 시험이 깨진다. 비활성 필터는 지금처럼 "문항을 뽑는 시점"
-- (src/lib/toefl/server/modules.ts resolveModuleItemIds)에서만 건다.
create or replace view toefl_item_public as
  select ti.id, ti.module_id, ti.stimulus_id, ti.task_type, ti.position, ti.difficulty,
         ti.points, ti.scoring_mode, ti.prompt, ti.payload, ti.created_at
  from toefl_item ti
  join toefl_module tm on tm.id = ti.module_id
  join toefl_form tf on tf.id = tm.form_id
  where tf.is_published = true
    and ti.verified = true;
