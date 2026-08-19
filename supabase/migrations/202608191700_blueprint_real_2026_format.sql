-- 블루프린트를 2026년 1월 21일 개정 실제 형식에 맞춘다.
--
-- 지금까지 쓰던 ETS-2026-04 는 개발용 데모 수치였다(총 42문항 · 103분). 실제 형식과
-- 방향이 반대였다 — 실제는 "문항 많고 모듈당 시간 짧은" 구성인데, 데모는 "문항 적고
-- 시간 긴" 구성이었다.
--
-- 근거 자료(사용자 제공, 2026 개정 iBT):
--   Reading   35~48문항 / 18~27분    Listening 35~45문항 / 18~27분
--   Writing   12문항 / 23분          Speaking  11문항 / 8분
--   "안내 시간을 제외하고 약 2시간"
--
-- 자료의 영역별 시간을 그대로 더하면 67~85분이라 "약 2시간"과 안 맞는다. 시간은
-- "모듈(스테이지) 하나당", 문항 수는 "영역 총합"으로 읽으면 둘 다 맞아떨어진다:
--   Reading 22분×2모듈 + Listening 22분×2모듈 + Speaking 8분 + Writing 23분 = 119분
--   Reading 40 + Listening 40 + Speaking 11 + Writing 12 = 103문항 (93~116 범위 안)
-- 이 해석으로 값을 정했다.
--
-- 유형별 분배는 ETS가 공개하지 않아 추정이다. 나중에 실제 응시 경험으로 조정할 수 있게
-- 새 version 으로 넣고 기존 것은 비활성화만 한다(지난 응시 기록의 근거를 지우지 않는다).
--
-- 되돌리는 법:
--   update toefl_form_blueprint set is_active = (version = 'ETS-2026-04');
--   update toefl_form set blueprint_version = 'ETS-2026-04' where blueprint_version = 'ETS-2026-01';
--
-- Supabase SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- ───────── 1) 새 블루프린트 ─────────
-- routing_threshold 는 문항 수가 아니라 "Stage 2에서 상급 모듈로 갈 기준 점수"다.
-- 기존 비율(9문항 중 6점 ≈ 67%)을 유지해 20문항 기준 13점으로 잡았다.
insert into toefl_form_blueprint (version, section, stage, route, time_limit_sec, item_count, task_mix) values
  ('ETS-2026-01', 'reading',   'stage1', 'base', 1320, 20,
   '{"complete_the_words":8,"daily_life":6,"academic_passage":6,"routing_threshold":13}'::jsonb),
  ('ETS-2026-01', 'reading',   'stage2', 'easy', 1320, 20,
   '{"complete_the_words":8,"daily_life":6,"academic_passage":6}'::jsonb),
  ('ETS-2026-01', 'reading',   'stage2', 'hard', 1320, 20,
   '{"complete_the_words":8,"daily_life":6,"academic_passage":6}'::jsonb),

  ('ETS-2026-01', 'listening', 'stage1', 'base', 1320, 20,
   '{"choose_a_response":8,"conversation":4,"announcement":4,"academic_talk":4,"routing_threshold":13}'::jsonb),
  ('ETS-2026-01', 'listening', 'stage2', 'easy', 1320, 20,
   '{"choose_a_response":8,"conversation":4,"announcement":4,"academic_talk":4}'::jsonb),
  ('ETS-2026-01', 'listening', 'stage2', 'hard', 1320, 20,
   '{"choose_a_response":8,"conversation":4,"announcement":4,"academic_talk":4}'::jsonb),

  -- Speaking·Writing 은 적응형이 아니라 단일 스테이지다(실제 시험도 그렇다).
  ('ETS-2026-01', 'speaking',  'stage1', 'base',  480, 11,
   '{"listen_and_repeat":8,"take_an_interview":3}'::jsonb),
  ('ETS-2026-01', 'writing',   'stage1', 'base', 1380, 12,
   '{"build_a_sentence":8,"write_an_email":2,"academic_discussion":2}'::jsonb)
on conflict (version, section, stage, route) do update
  set time_limit_sec = excluded.time_limit_sec,
      item_count     = excluded.item_count,
      task_mix       = excluded.task_mix,
      is_active      = true;

-- ───────── 2) 이전 데모 블루프린트는 비활성화 ─────────
-- 삭제하지 않는다 — 이 값으로 치른 지난 응시 기록의 시간·문항 수 근거가 사라지면
-- 나중에 "왜 이 시험은 9문항이었나"를 설명할 수 없다.
update toefl_form_blueprint set is_active = false where version = 'ETS-2026-04';

-- ───────── 3) 기존 폼을 새 블루프린트로 ─────────
-- (section, stage, route) 조합이 같아서 toefl_module 은 그대로 쓸 수 있다.
update toefl_form set blueprint_version = 'ETS-2026-01' where blueprint_version = 'ETS-2026-04';

-- ───────── 확인 ─────────
select section, stage, route, item_count as 문항수,
       time_limit_sec / 60 as 분, task_mix
from toefl_form_blueprint
where version = 'ETS-2026-01' and is_active
order by
  case section when 'reading' then 1 when 'listening' then 2 when 'speaking' then 3 else 4 end,
  stage, route;
