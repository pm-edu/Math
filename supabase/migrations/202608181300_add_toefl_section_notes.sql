-- TOEFL Listening 노트테이킹 패널 저장용 컬럼 추가 (2026-08-18)
-- 목적: 노트는 문항 단위가 아니라 "그 영역(section_attempt) 전체"에 걸친 메모다(실제 시험도
--       한 지문/강의를 들으며 계속 같은 메모장에 적는 방식) — 그래서 toefl_response가 아니라
--       toefl_section_attempt에 붙인다. 채점 대상이 절대 아니므로 scoring 관련 컬럼과 섞지 않음.
-- 되돌리는 법: alter table toefl_section_attempt drop column if exists notes;
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table toefl_section_attempt
  add column if not exists notes text;
