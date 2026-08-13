-- 후기 작성 기능: 기존엔 insert 정책만 있어서 한 번 쓴 후기를 고칠 수 없었다.
-- 본인 후기 수정 허용을 추가한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

grant update on reviews to authenticated;

drop policy if exists "users can update own reviews" on reviews;
create policy "users can update own reviews" on reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
