-- 헤더 [수학|영어] 탭 2단계: 문제지에도 과목 구분을 둔다.
-- (문제(problems)엔 sat.sql 에서 이미 subject 를 추가함)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table worksheets add column if not exists subject text not null default 'math';
