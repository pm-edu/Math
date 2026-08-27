-- TOEFL 채점 교차검증(2026-08-27) 지적사항 A2·B1 반영.
--
-- A2) 밴드 6.0 최상단 행이 scaled=29였다(90~100% 원점수 → 29점). 영역점수는 0~30인데 만점을
--     받아도 30이 아니라 29가 나오는 건 상한 자체가 틀린 것이다 — 30으로 고친다.
-- B1) scale.ts의 SCALED_TO_BAND/BAND_TO_CEFR 하드코딩 배열을 걷어내고 이 테이블에서 직접
--     조회하도록 바꿨다(테이블 주석이 원래 "점수 변환표 — 하드코딩 금지"였는데 코드가 같은
--     데이터를 따로 하드코딩해 둔 상태였다). CEFR 등급을 조회하려면 컬럼이 필요해서 추가한다.
--
-- 되돌리는 법:
--   update toefl_scale_conversion set scaled = 29 where version='ETS-2026-04' and scaled = 30;
--   alter table toefl_scale_conversion drop column cefr;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- ───────── A2: 최상단 scaled 29 → 30 ─────────
update toefl_scale_conversion
   set scaled = 30
 where scaled = 29;

-- ───────── B1: cefr 컬럼 추가 + 시드 ─────────
alter table toefl_scale_conversion add column if not exists cefr text;

update toefl_scale_conversion
   set cefr = case
     when band >= 6.0 then 'C2'
     when band >= 5.0 then 'C1'
     when band >= 4.0 then 'B2'
     when band >= 3.0 then 'B1'
     when band >= 2.0 then 'A2'
     else 'A1'
   end
 where cefr is null;

alter table toefl_scale_conversion alter column cefr set not null;

-- ───────── 확인 ─────────
select section, route, scaled, band, cefr
from toefl_scale_conversion
where version = 'ETS-2026-04' and scaled >= 26
order by section, route, scaled;
