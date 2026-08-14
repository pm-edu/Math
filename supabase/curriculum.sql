-- 수학 커리큘럼 카테고리 개편: curriculum_group(1차) + curriculum_detail(2차)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 기존 category/course_level 컬럼은 그대로 둔다(영어 SAT 등은 계속 이 두 컬럼을 씀).
-- 수학(subject='math')은 앞으로 아래 두 컬럼만 채운다.
alter table problems add column if not exists curriculum_group text; -- KR / IB / IGCSE / CBSE / AS_A_Level
alter table problems add column if not exists curriculum_detail text; -- 그룹별 세부과정 (예: 중2, IB_AA_HL, IGCSE_0607 ...)

-- category는 원래 not null이었는데, 수학은 앞으로 category 대신 curriculum_group/detail만 채우므로
-- 수학 신규 문제는 category가 비어도 되게 제약을 푼다(영어는 계속 category를 채워서 씀, 영향 없음).
alter table problems alter column category drop not null;

-- 기존 수학 문제(중등·2학년 태그)를 새 체계로 자동 매핑
update problems
set curriculum_group = 'KR', curriculum_detail = '중2'
where subject = 'math' and category = '중등' and course_level = '2학년' and curriculum_group is null;

create index if not exists problems_curriculum_idx on problems (subject, curriculum_group, curriculum_detail);
