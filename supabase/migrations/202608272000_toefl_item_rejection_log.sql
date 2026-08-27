-- 문항 반려 사유 보존. 3차 화면 검토(2026-08-27) [C]-3.
--
-- /admin/toefl/review에서 "반려"는 문항(toefl_item)을 그대로 delete한다(검수 원칙상 학생에게
-- 절대 노출되면 안 되는 초안이라 남겨둘 이유가 없다) — 그런데 그러면 "왜 반려했는지"도 같이
-- 사라져서, 나중에 같은 유형을 다시 생성할 때 같은 실수를 반복하기 쉽다. 문항이 지워져도
-- 반려 사유만은 별도 로그 테이블에 남긴다(문항 자체의 FK는 두지 않는다 — 지워질 행이라
-- 참조하면 사유까지 같이 날아간다).
--
-- 되돌리는 법: drop table if exists toefl_item_rejection;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create table if not exists toefl_item_rejection (
  id              uuid primary key default gen_random_uuid(),
  module_id       uuid references toefl_module(id) on delete set null,
  task_type       toefl_task_type not null,
  -- 문항이 곧 지워지므로 무엇을 반려했는지 알아볼 수 있게 프롬프트를 그대로 복사해둔다.
  prompt_snapshot text not null,
  reason          text not null,
  rejected_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists toefl_item_rejection_recent_idx on toefl_item_rejection (created_at desc);

-- 관리 전용 데이터 — 직원만 전체 권한(생성배치 테이블과 같은 패턴).
alter table toefl_item_rejection enable row level security;

drop policy if exists "staff manage item rejections" on toefl_item_rejection;
create policy "staff manage item rejections" on toefl_item_rejection
  for all to authenticated using (is_staff()) with check (is_staff());

grant select, insert on toefl_item_rejection to authenticated;
