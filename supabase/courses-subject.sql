-- 강좌(courses)에도 과목 구분을 둔다. 기존 강좌는 전부 수학 사이트(pmedu4u.com) 소속이므로 기본값 'math'.
-- 이제 각 사이트(pmedu4u.com=수학, english.pmedu4u.com=영어)는 자기 과목 강좌만 보여준다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table courses add column if not exists subject text not null default 'math';
create index if not exists courses_subject_idx on courses (subject);
