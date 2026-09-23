-- 2026-09-23: 학생이 배정 전에도(또는 아직 도달 안 한 문제지도) 제목만은 볼 수 있게.
-- 기존 "students view open track worksheets" 정책은 math_track_progress에 그 학생의
-- status<>'locked' 행이 있어야만 select를 허용해서, "신청은 했지만 아직 배정 안 됨"
-- 상태에서는 전체 과정 리스트(문제지 제목)조차 못 보여줬다(과정 개요→문제지 리스트 화면
-- 신설을 위해 필요). 문항 내용(problems/answer_spec)은 그대로 잠겨있다 — 이건 worksheets
-- 테이블(제목·난이도)만 대상.
create policy "students view own curriculum track worksheets" on worksheets
  for select using (
    exists (
      select 1
      from math_track_worksheets mtw
      join math_tracks mt on mt.id = mtw.track_id
      join profiles p on p.id = auth.uid()
      where mtw.worksheet_id = worksheets.id
        and mt.curriculum_group = p.curriculum_group
        and mt.is_active
    )
  );
