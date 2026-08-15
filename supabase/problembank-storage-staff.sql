-- 문제 이미지 스토리지 업로드 권한을 관리자(owner/admin)에서 직원 전체(is_staff)로 넓힌다.
-- problems 테이블 자체는 이미 is_staff() 기준인데(roles-tier.sql), 이미지 업로드만 is_admin()으로
-- 좁게 남아있어서 교사(teacher)·조교(assistant) 계정으로는 그림(그래프 등) 생성이 403으로 실패했음.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

drop policy if exists "admins upload problem images" on storage.objects;
create policy "staff upload problem images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'problems' and is_staff());

drop policy if exists "admins update problem images" on storage.objects;
create policy "staff update problem images" on storage.objects
  for update to authenticated
  using (bucket_id = 'problems' and is_staff());

drop policy if exists "admins delete problem images" on storage.objects;
create policy "staff delete problem images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'problems' and is_staff());
