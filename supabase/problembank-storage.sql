-- 문제 이미지 저장소(버킷) + 접근 권한
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 'problems' 버킷 생성 (공개 읽기). 이미 있으면 건너뛴다.
insert into storage.buckets (id, name, public)
values ('problems', 'problems', true)
on conflict (id) do nothing;

-- 업로드·수정·삭제는 관리자만. (읽기는 public 버킷이라 누구나 가능)
drop policy if exists "admins upload problem images" on storage.objects;
create policy "admins upload problem images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'problems' and is_admin());

drop policy if exists "admins update problem images" on storage.objects;
create policy "admins update problem images" on storage.objects
  for update to authenticated
  using (bucket_id = 'problems' and is_admin());

drop policy if exists "admins delete problem images" on storage.objects;
create policy "admins delete problem images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'problems' and is_admin());
