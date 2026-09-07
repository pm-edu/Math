-- 수학 학습 진행 구조 PG1: 숫자 난이도 컬럼 추가 (RUN_MATH_PROGRESSION.md PG1 1-2/1-1 보조)
--
-- 발견한 불일치(2026-09-07, 사용자 확인): 지시서는 세션 난이도 분포([1,1,2,2,3,3,4,?])와
-- 숙달 조건("난이도 3 이상 정답 3개")에서 1~4 숫자 4단계를 가정하지만, 실제 problems.difficulty는
-- PG-A 생성 파이프라인부터 지금까지 전부 '하'/'중'/'상' 3단계 text다(전체 380건 확인, 다른 값 없음).
-- 사용자가 "DB에 숫자 난이도 컬럼을 새로 추가해서 4단계로 전환"을 선택 — 기존 difficulty text
-- 컬럼은 다른 화면(워크시트 등)에서 계속 쓰이므로 그대로 두고, numeric_difficulty를 나란히 둔다.
--
-- 매핑: 하=1, 중=2, 상=4 (3은 비워둠). '중'을 2·3으로 임의로 쪼갤 근거가 없어서, 하=쉬움/중=중간/
-- 상=어려움이라는 원래 의미를 그대로 보존하는 쪽을 택했다 — "난이도 3 이상"이 곧 "상 난이도"가
-- 되어 의미가 자연스럽다. 4단계를 촘촘히 쓰려면(레벨 3 채우기) 이후 생성 파이프라인에서
-- numeric_difficulty를 직접 지정하면 된다(scripts/math/generate.ts도 이번에 같이 고침).

alter table problems
  add column if not exists numeric_difficulty smallint check (numeric_difficulty between 1 and 4);

update problems
set numeric_difficulty = case difficulty
  when '하' then 1
  when '중' then 2
  when '상' then 4
  else null
end
where subject = 'math' and numeric_difficulty is null;

create index if not exists problems_unit_numeric_difficulty_idx
  on problems (unit_id, numeric_difficulty)
  where verified = true and is_auto_gradable = true;
