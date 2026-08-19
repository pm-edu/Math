-- ═══════════════════════════════════════════════════════════════════════
--  밀린 마이그레이션 한 번에 적용 + 점검
-- ═══════════════════════════════════════════════════════════════════════
--
-- 이 프로젝트는 supabase/migrations/*.sql 을 사람이 SQL Editor에서 직접 실행한다.
-- 코드는 푸시하면 자동 배포되므로, 둘 사이가 벌어지면 화면이 에러 없이 조용히 빈 값만
-- 보여준다(2026-08-19에 실제로 두 건이 그랬다). 이 파일은 그런 상태를 한 번에 메운다.
--
-- 담긴 것: 컬럼·테이블·정책을 "덧붙이는" 마이그레이션만. 전부 여러 번 실행해도 안전하다.
--   202608131503  단어 사다리 컬럼 (user_word_states)
--   202608181300  섹션 노트 (toefl_section_attempt.notes)
--   202608181400  총점·밴드 (toefl_attempt) + 기존 응시 기록 보정
--   202608191500  문항 풀 (toefl_item.is_active) + 문항선택 저장 테이블
--   202608191600  검수 상태 (toefl_item.verified 등) + 생성배치 + 공개뷰 차단
--
-- 담지 않은 것:
--   · 202608151200~1203 (TOEFL 스키마·시드) — 이미 적용돼 있고, create table 이라
--     재실행이 안전하지 않다. 혹시 점검표에서 false 로 나오면 그 파일을 따로 실행할 것.
--   · 202608191600 의 "기존 문항 verified=true 보정" — 이미 끝났고, 앞으로 재실행하면
--     검수 대기 중인 초안까지 승인해 버린다. 그래서 일부러 뺐다.
--
-- 사용법: 전체 복사 → Supabase SQL Editor → Run.
--         맨 아래 점검표가 함께 돌아, 결과 표의 "적용됨"이 전부 true 면 끝이다.

-- ───────── 202608131503 단어 사다리 컬럼 ─────────
alter table user_word_states add column if not exists last_session_id text;
alter table user_word_states add column if not exists consecutive_wrong integer not null default 0;

drop policy if exists "students update own confusions" on confusions;
create policy "students update own confusions" on confusions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── 202608181300 섹션 노트 ─────────
alter table toefl_section_attempt add column if not exists notes text;

-- ───────── 202608181400 총점·밴드 ─────────
alter table toefl_attempt
  add column if not exists overall_band numeric,
  add column if not exists total_scaled numeric;

-- 이미 제출된 응시 기록 보정. 값이 비어 있는 행만 건드리므로 재실행해도 안전하다.
-- (안 하면 이 배포 이전 응시자는 리포트에서 종합 밴드가 영원히 "—"로 보인다)
with agg as (
  select attempt_id,
         sum(scaled_score) as total_scaled,
         round(avg(band) * 2) / 2 as overall_band
  from toefl_section_attempt
  where finished_at is not null
  group by attempt_id
)
update toefl_attempt a
set overall_band = agg.overall_band,
    total_scaled = agg.total_scaled
from agg
where a.id = agg.attempt_id
  and a.status in ('submitted', 'scored')
  and a.overall_band is null;

-- ───────── 202608191500 문항 풀 ─────────
alter table toefl_item add column if not exists is_active boolean not null default true;

create index if not exists toefl_item_module_type_active_idx
  on toefl_item (module_id, task_type, is_active);

create table if not exists toefl_attempt_item_selection (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references toefl_attempt(id) on delete cascade,
  module_id   uuid not null references toefl_module(id) on delete cascade,
  item_ids    uuid[] not null,
  created_at  timestamptz not null default now(),
  unique (attempt_id, module_id)
);

alter table toefl_attempt_item_selection enable row level security;

drop policy if exists "own or staff item selection" on toefl_attempt_item_selection;
create policy "own or staff item selection" on toefl_attempt_item_selection
  for select to authenticated using (
    is_staff() or exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  );

-- ───────── 202608191600 검수 상태 ─────────
alter table toefl_item add column if not exists verified boolean not null default false;
alter table toefl_item add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'toefl_item_source_check') then
    alter table toefl_item add constraint toefl_item_source_check check (source in ('ai', 'manual', 'seed'));
  end if;
end $$;

alter table toefl_item add column if not exists reviewed_by uuid references profiles(id) on delete set null;
alter table toefl_item add column if not exists reviewed_at timestamptz;
alter table toefl_item add column if not exists batch_id uuid;

create index if not exists toefl_item_review_queue_idx
  on toefl_item (verified, created_at desc)
  where verified = false;

create table if not exists toefl_generation_batch (
  id              uuid primary key default gen_random_uuid(),
  seq             bigint generated always as identity,
  module_id       uuid references toefl_module(id) on delete set null,
  task_type       toefl_task_type not null,
  requested_count int not null check (requested_count between 1 and 50),
  difficulty      smallint check (difficulty between 1 and 5),
  topic           text,
  model           text not null,
  status          text not null default 'draft' check (status in ('draft', 'reviewing', 'done', 'discarded')),
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

alter table toefl_generation_batch enable row level security;

drop policy if exists "staff manage generation batches" on toefl_generation_batch;
create policy "staff manage generation batches" on toefl_generation_batch
  for all to authenticated using (is_staff()) with check (is_staff());

grant select, insert, update, delete on toefl_generation_batch to authenticated;

-- 학생용 공개 뷰가 검수 전 문항을 거르게 한다(진짜 방어선).
create or replace view toefl_item_public as
  select ti.id, ti.module_id, ti.stimulus_id, ti.task_type, ti.position, ti.difficulty,
         ti.points, ti.scoring_mode, ti.prompt, ti.payload, ti.created_at
  from toefl_item ti
  join toefl_module tm on tm.id = ti.module_id
  join toefl_form tf on tf.id = tm.form_id
  where tf.is_published = true
    and ti.verified = true;

-- ═══════════════════════════════════════════════════════════════════════
--  점검표 — "적용됨"이 전부 true 면 끝
-- ═══════════════════════════════════════════════════════════════════════
select '202608131501 단어 v2 스키마' as 마이그레이션,
       to_regclass('public.word_sets') is not null as 적용됨
union all select '202608131503 단어 사다리 컬럼',
       exists (select 1 from information_schema.columns
                where table_name = 'user_word_states' and column_name = 'last_session_id')
union all select '202608151200 TOEFL 스키마',
       to_regclass('public.toefl_item') is not null
union all select '202608151201 TOEFL 공개뷰',
       to_regclass('public.toefl_item_public') is not null
union all select '202608151202 점수 환산표(시드)',
       case when to_regclass('public.toefl_scale_conversion') is null then false
            else (select count(*) > 0 from toefl_scale_conversion) end
union all select '202608151203 블루프린트·데모폼(시드)',
       case when to_regclass('public.toefl_form_blueprint') is null then false
            else (select count(*) > 0 from toefl_form_blueprint) end
union all select '202608181300 섹션 노트',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_section_attempt' and column_name = 'notes')
union all select '202608181400 총점·밴드',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_attempt' and column_name = 'overall_band')
union all select '202608191500 문항풀 is_active',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_item' and column_name = 'is_active')
union all select '202608191500 문항선택 저장',
       to_regclass('public.toefl_attempt_item_selection') is not null
union all select '202608191600 검수상태 verified',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_item' and column_name = 'verified')
union all select '202608191600 생성배치',
       to_regclass('public.toefl_generation_batch') is not null
union all select '202608191600 공개뷰가 verified를 거르는가',
       exists (select 1 from pg_views
                where viewname = 'toefl_item_public' and definition like '%verified%');
