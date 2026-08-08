-- 강좌 기본 데이터
-- schema.sql 실행 후 Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- 여러 번 실행해도 안전합니다 (slug 기준으로 갱신).

insert into courses (slug, category, title, description, price, lessons, includes) values
  ('elementary-basic', '초등', '초등 수학 개념완성 (연산의 기초)', '초등 전학년 대상, 연산 개념을 쉽게 잡아주는 기초 패키지', 49000, 20, array['동영상 20강','요약노트 PDF','연습문제집']),
  ('middle-functions', '중등', '중등 수학 내신 대비 (함수와 방정식)', '중학 2~3학년 내신 시험 대비 핵심 개념 및 기출유형', 69000, 24, array['동영상 24강','요약노트 PDF','기출문제 PDF']),
  ('ib-aa-ai', 'IB', 'IB Math AA/AI 대비 종합반', 'IB Diploma Math 과정(AA/AI) 핵심 유닛 정리 및 IA(내부평가) 가이드 포함', 129000, 30, array['동영상 30강','IB 스타일 문제집 PDF','IA 작성 가이드'])
on conflict (slug) do update set
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  lessons = excluded.lessons,
  includes = excluded.includes;
