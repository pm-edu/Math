-- 강좌의 영어 제목·소개·구성 칸 추가
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

alter table courses add column if not exists title_en text;
alter table courses add column if not exists description_en text;
alter table courses add column if not exists includes_en text[];

-- 기존 강좌의 영어 표기 예시입니다. 문구는 원하는 대로 고쳐서 실행하세요.
update courses set
  title_en = 'Elementary Math Foundations (Arithmetic Basics)',
  description_en = 'A beginner-friendly package that builds solid arithmetic concepts for all elementary grades',
  includes_en = array['20 video lessons', 'Summary notes (PDF)', 'Practice workbook']
where slug = 'elementary-basic';

update courses set
  title_en = 'Middle School Math: Functions & Equations',
  description_en = 'Core concepts and exam-style problems for grade 8-9 school exams',
  includes_en = array['24 video lessons', 'Summary notes (PDF)', 'Past exam questions (PDF)']
where slug = 'middle-functions';

update courses set
  title_en = 'IB Math AA/AI Complete Prep',
  description_en = 'Key units of IB Diploma Math (AA/AI) with an IA writing guide included',
  includes_en = array['30 video lessons', 'IB-style problem sets (PDF)', 'IA writing guide']
where slug = 'ib-aa-ai';

update courses set
  title_en = 'Calculus 1',
  description_en = 'High school calculus fundamentals'
where slug = 'high-lkoxo4';

-- 확인용
select slug, title, title_en from courses order by created_at;
