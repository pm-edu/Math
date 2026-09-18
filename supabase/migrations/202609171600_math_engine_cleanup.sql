-- RUN_MATH_SITE.md 6단계 A(4) — 옛 설계(math-progression 진단·세션 엔진) 완전 삭제.
-- v_math_parent_progress로 학부모 리포트를 이미 교체했고(202609171500), 이 테이블·뷰·함수를
-- 쓰던 코드는 전부 삭제됨(옛 라우트 src/app/study/track·[unitId]·path·review·onboarding,
-- src/app/admin/math-progression·curriculum-interest, src/lib/math/{session,fsrs,diagnostic,
-- progression}.ts, api/math/{sessions,diagnostic}/*, api/study/curriculum-interest, cron 2개).
-- 실제 학습 데이터 없음(row 수 10~50 수준, 사용자 확인됨) — Supabase 대시보드 > SQL Editor에서
-- 실행하세요. 되돌릴 수 없습니다.

-- 1) 이 테이블들에 의존하는 뷰 먼저 삭제.
drop view if exists v_math_weakness;
drop view if exists v_math_unit_progress;
drop view if exists v_math_review_queue;
drop view if exists v_math_streak;
drop view if exists v_math_stuck_students;
drop view if exists v_math_unit_status;

-- 2) question_attempts.session_id가 math_sessions를 참조하는 FK라(2BP01) 먼저 끊는다.
-- 컬럼째로 지우려 했으나 5단계 통계 뷰(v_math_student_overview/v_math_worksheet_overview)가
-- question_attempts에 select *를 쓰고 있어서 컬럼까지 지우면 그 뷰들이 깨진다(발견) — 그래서
-- 제약만 끊고 컬럼은 남긴다(더는 안 쓰는 컬럼이지만 nullable이라 있어도 무해함).
alter table question_attempts drop constraint if exists question_attempts_session_id_fkey;

-- 3) 테이블 삭제 — math_check_unit_prereq_cycle() 함수를 math_unit_prereqs의 트리거가
-- 물고 있어서(2BP01), 함수보다 테이블을 먼저 지워야 트리거가 같이 없어진다.
drop table if exists math_session_items;
drop table if exists math_sessions;
drop table if exists math_unit_states;
drop table if exists math_placements;
drop table if exists math_daily_activity;
drop table if exists math_unit_prereqs;
drop table if exists student_curriculum_interest;

-- 4) 이 테이블들에만 쓰던 함수 삭제(이제 트리거 없이 남은 함수 본체만 지우면 된다).
drop function if exists math_apply_session_completion(bigint, uuid, uuid, text, numeric, numeric, int, int, date, int);
drop function if exists math_apply_review_completion(bigint, uuid, uuid, text, real, real, int, int, timestamptz, date, int);
drop function if exists math_check_unit_prereq_cycle();
