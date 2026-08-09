-- 강의(레슨) 구조와 열람 권한
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade not null,
  title text not null,
  description text,
  position integer not null default 0,
  -- 영상 주소. YouTube 일부공개, Vimeo 등 어떤 것이든 넣을 수 있다.
  video_url text,
  -- 학습자료 주소 (PDF 등). 나중에 Supabase Storage로 바꿔도 이 칸만 갈아끼우면 된다.
  material_url text,
  -- 로그인하지 않은 사람도 볼 수 있는 무료 샘플인지
  is_free boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists lessons_course_position_idx
  on lessons (course_id, position);

alter table lessons enable row level security;

-- 열람 권한: 무료 샘플이거나, 그 강좌를 결제한 사람이거나, 관리자.
-- 화면에서 막는 것이 아니라 DB가 막으므로 주소를 직접 입력해도 데이터가 나오지 않는다.
drop policy if exists "lessons are viewable by buyers and for free samples" on lessons;
create policy "lessons are viewable by buyers and for free samples" on lessons
  for select using (
    is_free
    or is_admin()
    or exists (
      select 1 from purchases p
      where p.course_id = lessons.course_id
        and p.user_id = auth.uid()
        and p.status = 'paid'
    )
  );

-- 등록·수정·삭제는 관리자만. 학생은 조회만 가능하다.
drop policy if exists "admins can insert lessons" on lessons;
create policy "admins can insert lessons" on lessons
  for insert with check (is_admin());

drop policy if exists "admins can update lessons" on lessons;
create policy "admins can update lessons" on lessons
  for update using (is_admin()) with check (is_admin());

drop policy if exists "admins can delete lessons" on lessons;
create policy "admins can delete lessons" on lessons
  for delete using (is_admin());

grant select on lessons to anon, authenticated;
grant insert, update, delete on lessons to authenticated;
