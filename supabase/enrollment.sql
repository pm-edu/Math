-- 수강신청 흐름: 학생 신청 + 관리자 승인 + 사이트 설정(계좌번호 등)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 중복 신청 방지: 한 사람이 같은 강좌를 두 번 신청하지 못하게 한다.
create unique index if not exists purchases_user_course_idx
  on purchases (user_id, course_id);

-- 학생은 자기 이름으로만 신청할 수 있고, 상태는 항상 'pending'으로 시작한다.
drop policy if exists "users can request enrollment" on purchases;
create policy "users can request enrollment" on purchases
  for insert with check (auth.uid() = user_id and status = 'pending');

-- 관리자는 모든 신청을 승인/변경할 수 있다.
drop policy if exists "admins can update purchases" on purchases;
create policy "admins can update purchases" on purchases
  for update using (is_admin()) with check (is_admin());

grant insert on purchases to authenticated;
grant update on purchases to authenticated;

-- 사이트 설정: 계좌번호처럼 관리자가 화면에서 바꾸는 값을 담는다.
create table if not exists site_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table site_settings enable row level security;

-- 계좌 안내는 신청한 학생이 봐야 하므로 누구나 읽을 수 있다.
drop policy if exists "settings are viewable by everyone" on site_settings;
create policy "settings are viewable by everyone" on site_settings
  for select using (true);

drop policy if exists "admins can change settings" on site_settings;
create policy "admins can change settings" on site_settings
  for all using (is_admin()) with check (is_admin());

grant select on site_settings to anon, authenticated;
grant insert, update, delete on site_settings to authenticated;

-- 입금 안내 문구 자리를 미리 만들어 둔다 (내용은 나중에 화면에서 채움).
insert into site_settings (key, value) values ('bank_info', '')
on conflict (key) do nothing;

-- 관리자가 신청 목록에서 학생 이름/이메일과 강좌명을 함께 보기 위한 뷰.
-- (purchases 는 user_id 만 있어서 조인이 필요하다)
create or replace view enrollment_requests
with (security_invoker = true) as
select
  p.id,
  p.status,
  p.purchased_at,
  p.user_id,
  p.course_id,
  pr.name  as student_name,
  pr.email as student_email,
  c.title  as course_title,
  c.price  as course_price
from purchases p
left join profiles pr on pr.id = p.user_id
left join courses c on c.id = p.course_id;

grant select on enrollment_requests to authenticated;
