-- Stage 3: 사다리(mastery-level.ts) 상태를 실제로 저장하기 위한 작은 보강.
-- Stage 2에서 순수함수로 설계할 때 배열(consecutiveCorrectSessionIds)로 상태를
-- 표현했으나, DB에 저장하기엔 정수 컬럼이 더 적합해 개수+마지막세션ID 방식으로
-- 바꿨다(동작은 완전히 동일 — engine/mastery-level.ts 주석 참고).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table user_word_states add column if not exists last_session_id text;
alter table user_word_states add column if not exists consecutive_wrong integer not null default 0;

-- 학생이 자기 오답으로 생긴 혼동쌍의 count를 올릴 수 있어야 하는데(confusion-pairs.ts
-- 연동), Stage 1 정책엔 select/insert만 있고 update가 빠져 있었다. 추가한다.
drop policy if exists "students update own confusions" on confusions;
create policy "students update own confusions" on confusions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
