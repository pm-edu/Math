-- 강좌 관리 준비: 루피 가격 칸 + 관리자 쓰기 권한
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 영어 화면용 루피 가격. 비워두면 영어 화면에서도 원화로 표시된다.
alter table courses add column if not exists price_inr integer;

-- 강좌 등록·수정·삭제는 관리자만
drop policy if exists "admins can insert courses" on courses;
create policy "admins can insert courses" on courses
  for insert with check (is_admin());

drop policy if exists "admins can update courses" on courses;
create policy "admins can update courses" on courses
  for update using (is_admin()) with check (is_admin());

drop policy if exists "admins can delete courses" on courses;
create policy "admins can delete courses" on courses
  for delete using (is_admin());

grant insert, update, delete on courses to authenticated;
