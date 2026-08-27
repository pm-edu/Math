-- TOEFL 채점 교차검증(2026-08-27) A5 반영.
--
-- spec §12 "모든 AI 호출은 재시도 2회 + 실패 시 status='pending_manual'로 남기고 관리자 큐에
-- 노출"이 실제로는 구현이 안 돼 있었다 — toefl_ai_score에 status 컬럼 자체가 없어서, AI 채점이
-- 재시도까지 다 실패하면 그냥 조용히 0점으로 남고 아무 기록도 안 남았다(2026-08-19 P4 세션에서
-- 이미 알려진 스키마 갭으로 남겨뒀던 부분). 지금 코드(ai-grading.ts/audio-grading.ts/
-- grade-response.ts)가 이 컬럼을 쓰도록 같이 바뀐다.
--
-- 되돌리는 법:
--   alter table toefl_ai_score drop column status;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table toefl_ai_score
  add column if not exists status text not null default 'graded'
    check (status in ('graded', 'pending_manual'));

-- 기존에 이미 저장된 채점 결과는 전부 성공한 것들이라 'graded' 기본값 그대로 둔다(별도 update 불필요).

create index if not exists toefl_ai_score_pending_manual_idx
  on toefl_ai_score (created_at desc)
  where status = 'pending_manual';

-- ───────── 확인 ─────────
select status, count(*) from toefl_ai_score group by status;
