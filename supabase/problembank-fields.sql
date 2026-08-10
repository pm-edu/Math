-- 문제 분류 세분화: 과정(course_level) + 유형(problem_format) 추가
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

alter table problems add column if not exists course_level text;   -- 과정 (예: 고2 미적분, 수능특강, IB HL)
alter table problems add column if not exists problem_format text; -- 유형 (객관식 | 서술형 | 단답형)

-- 검색 인덱스를 새 계층에 맞춰 다시 만든다.
drop index if exists problems_filter_idx;
create index if not exists problems_filter_idx
  on problems (category, course_level, unit, difficulty);
