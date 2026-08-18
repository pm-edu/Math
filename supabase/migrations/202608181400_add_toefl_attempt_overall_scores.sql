-- TOEFL 종합 리포트: 종합 밴드/총점을 서버에서 1회 계산해 저장 (2026-08-18)
-- 목적: 지금까지 report/page.tsx가 4개 영역의 band/scaled_score를 매번 클라이언트에서
--       평균·합산해 "종합 밴드"를 다시 계산하고 있었다 — 요청("리포트 데이터를 클라이언트에서
--       재계산하지 말 것")에 어긋나는 실제 사례. submit 라우트가 이미 같은 공식으로 이 값을
--       계산해서 응답으로만 돌려주고 어디에도 저장을 안 하던 게 원인이라, 이제 저장까지 한다.
-- 되돌리는 법: alter table toefl_attempt drop column if exists overall_band, drop column if exists total_scaled;
-- Supabase SQL Editor에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table toefl_attempt
  add column if not exists overall_band numeric,
  add column if not exists total_scaled numeric;

-- 이미 제출된 기존 응시 기록은 이 컬럼이 비어있으니, submit 라우트와 같은 공식(scaled_score 합,
-- band 평균을 0.5 단위 반올림)으로 한 번 채워둔다 — 안 그러면 이 배포 이전 응시자는 리포트에서
-- 종합 밴드가 영원히 "—"로 보인다. 재실행해도 안전(이미 채워진 행은 WHERE절이 걸러줌).
with agg as (
  select attempt_id,
         sum(scaled_score) as total_scaled,
         round(avg(band) * 2) / 2 as overall_band
  from toefl_section_attempt
  where finished_at is not null
  group by attempt_id
)
update toefl_attempt a
set overall_band = agg.overall_band,
    total_scaled = agg.total_scaled
from agg
where a.id = agg.attempt_id
  and a.status in ('submitted', 'scored')
  and a.overall_band is null;
