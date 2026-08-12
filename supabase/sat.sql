-- 과목(subject) 구분 추가: 수학/영어 문제를 한 문제은행에서 구분한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 기존 문제는 전부 수학이므로 기본값 'math'. 영어/SAT 문제는 코드에서 'english' 로 저장.
alter table problems add column if not exists subject text not null default 'math';

-- 과목 + 분류로 빠르게 거르기 위한 인덱스
create index if not exists problems_subject_idx on problems (subject, category);
