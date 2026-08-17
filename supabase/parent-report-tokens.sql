-- 학생관리 P6: 학부모 토큰 리포트. 학부모 계정을 따로 안 만들고, 서명 없는 랜덤 토큰 링크로
-- 읽기 전용 리포트만 공개한다(30일 만료). 리스크 점수·타 학생 비교는 절대 포함하지 않는다(앱 코드에서 필터).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

create table if not exists parent_report_tokens (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists parent_report_tokens_student_idx on parent_report_tokens (student_id);

alter table parent_report_tokens enable row level security;

-- 직원만 생성/조회(관리자 화면에서 링크를 만들 때 씀).
-- 공개 리포트 페이지(/report/[token])는 서버가 service role로 토큰을 직접 검증해서 조회하므로
-- anon/authenticated에게 이 테이블 자체를 열어줄 필요가 없다(토큰 목록이 새어나가면 안 되니 오히려 막아야 함).
drop policy if exists "staff manage parent_report_tokens" on parent_report_tokens;
create policy "staff manage parent_report_tokens" on parent_report_tokens
  for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on parent_report_tokens to authenticated;

-- 실행 후 확인용
select count(*) from parent_report_tokens;
