-- TOEFL P0: RLS 정책 + 스토리지 버킷 (docs/toefl-spec.md §5, §11)
-- is_admin()/is_staff()는 supabase/roles-tier.sql에 이미 정의돼 있음(재사용, 새로 안 만듦).
-- 되돌리려면: 아래 정책들을 drop policy로 제거하는 새 마이그레이션을 추가할 것(이 파일은 수정하지 않음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table toefl_form_blueprint enable row level security;
alter table toefl_form enable row level security;
alter table toefl_module enable row level security;
alter table toefl_stimulus enable row level security;
alter table toefl_item enable row level security;
alter table toefl_attempt enable row level security;
alter table toefl_section_attempt enable row level security;
alter table toefl_response enable row level security;
alter table toefl_ai_score enable row level security;
alter table toefl_scale_conversion enable row level security;
alter table toefl_vocab_level_map enable row level security;

-- ============ 참조 데이터: 로그인 사용자는 읽기만, 쓰기는 직원(is_staff) ============
create policy "authenticated read blueprint" on toefl_form_blueprint for select to authenticated using (true);
create policy "staff manage blueprint" on toefl_form_blueprint for all to authenticated using (is_staff()) with check (is_staff());

create policy "authenticated read scale conversion" on toefl_scale_conversion for select to authenticated using (true);
create policy "staff manage scale conversion" on toefl_scale_conversion for all to authenticated using (is_staff()) with check (is_staff());

create policy "authenticated read vocab level map" on toefl_vocab_level_map for select to authenticated using (true);
create policy "staff manage vocab level map" on toefl_vocab_level_map for all to authenticated using (is_staff()) with check (is_staff());

-- ============ 폼: 학생은 공개된(is_published) 것만, 직원은 전부 ============
create policy "read published or staff forms" on toefl_form
  for select to authenticated using (is_published = true or is_staff());
create policy "staff manage forms" on toefl_form for all to authenticated using (is_staff()) with check (is_staff());

-- ============ 모듈/스티뮬러스/문항(정답 포함): 직원만 직접 접근. 학생은 toefl_item_public /
-- toefl_stimulus_public 뷰로만 읽는다(뷰는 정의자 권한으로 실행되어 이 RLS를 우회하고, 뷰 자체
-- WHERE절에서 공개된 폼만 걸러줌 — 마이그레이션 202608151200 참고). ============
create policy "staff manage modules" on toefl_module for all to authenticated using (is_staff()) with check (is_staff());
create policy "staff manage stimuli" on toefl_stimulus for all to authenticated using (is_staff()) with check (is_staff());
create policy "staff manage items" on toefl_item for all to authenticated using (is_staff()) with check (is_staff());

-- 뷰는 테이블이 아니라 GRANT로 접근을 연다(RLS와 별개 메커니즘).
grant select on toefl_item_public to authenticated;
grant select on toefl_stimulus_public to authenticated;

-- ============ 응시 기록: 본인 것만, 직원은 전체 조회(채점 검수용) ============
create policy "own attempts" on toefl_attempt
  for all to authenticated using (user_id = auth.uid() or is_staff()) with check (user_id = auth.uid());

create policy "own section attempts" on toefl_section_attempt
  for all to authenticated using (
    is_staff() or exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  );

create policy "own responses" on toefl_response
  for all to authenticated using (
    is_staff() or exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from toefl_attempt a where a.id = attempt_id and a.user_id = auth.uid())
  );

create policy "own ai scores" on toefl_ai_score
  for select to authenticated using (
    is_staff() or exists (
      select 1 from toefl_response r join toefl_attempt a on a.id = r.attempt_id
      where r.id = response_id and a.user_id = auth.uid()
    )
  );
-- ai_score는 채점 파이프라인(서버, service role)만 기록한다 — 학생 insert/update 없음, 정책 없음(기본 차단).

-- ============ 스토리지 버킷 ============
-- toefl-audio: TTS로 만든 지문 음성. 공개 읽기 아님(signed URL로만 접근) — 문제 유출 방지.
insert into storage.buckets (id, name, public)
values ('toefl-audio', 'toefl-audio', false)
on conflict (id) do nothing;

-- toefl-recordings: 학생 Speaking 녹음. 완전 비공개, 본인 것만.
insert into storage.buckets (id, name, public)
values ('toefl-recordings', 'toefl-recordings', false)
on conflict (id) do nothing;

drop policy if exists "staff manage toefl audio" on storage.objects;
create policy "staff manage toefl audio" on storage.objects
  for all to authenticated
  using (bucket_id = 'toefl-audio' and is_staff())
  with check (bucket_id = 'toefl-audio' and is_staff());

-- 학생이 오디오를 들으려면 서버가 signed URL을 발급해줘야 한다(spec §9 /recordings, §14 보안 요구).
-- 클라이언트가 storage.objects를 직접 select하는 경로는 열지 않는다(정책 없음 = 기본 차단).

-- 녹음 업로드: 본인 user_id를 파일 경로 첫 폴더로 강제해서 본인 폴더에만 쓸 수 있게 한다.
-- 예: toefl-recordings/{user_id}/{attempt_id}/{item_id}.webm
drop policy if exists "own recordings insert" on storage.objects;
create policy "own recordings insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'toefl-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own recordings read" on storage.objects;
create policy "own recordings read" on storage.objects
  for select to authenticated
  using (bucket_id = 'toefl-recordings' and ((storage.foldername(name))[1] = auth.uid()::text or is_staff()));
