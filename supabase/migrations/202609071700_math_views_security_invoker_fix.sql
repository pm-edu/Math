-- 수학 학습 진행 구조 PG1 긴급 수정: 뷰 6종에 security_invoker 누락 — RLS 우회 데이터 유출
--
-- 발견 경위(2026-09-07, PG2 착수 직전 자체 점검): 이 프로젝트의 기존 통계 뷰
-- (supabase/student-stats-views.sql, supabase/enrollment.sql)는 전부
-- `with (security_invoker = true)`로 만들어서 "보는 사람의 RLS를 그대로 따르게" 하는데,
-- 202609071600_math_progression_views.sql에서 새로 만든 6개 뷰는 이 옵션을 빠뜨렸다.
-- Postgres 뷰는 기본적으로 뷰를 만든 사람(이 경우 사실상 관리자 권한)의 권한으로 실행되므로,
-- 학생 계정으로 v_math_next_action을 조회하면 RLS가 전혀 걸리지 않고 **전체 학생의 행이
-- 다 보였다**(실제 확인함 — test-new 계정으로 10명 전원의 진행 상태가 노출됨).
--
-- CREATE OR REPLACE VIEW로 옵션만 다시 지정하면 되고, 쿼리 본문은 바꾸지 않는다.

alter view v_math_weakness set (security_invoker = true);
alter view v_math_unit_progress set (security_invoker = true);
alter view v_math_review_queue set (security_invoker = true);
alter view v_math_streak set (security_invoker = true);
alter view v_math_stuck_students set (security_invoker = true);
alter view v_math_next_action set (security_invoker = true);
