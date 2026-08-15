-- TOEFL P0: 밴드 변환표 시드 (docs/toefl-spec.md §7)
-- 주의(반드시 읽을 것): ETS 공식 Blueprint의 실제 원점수 만점이 없어서, raw_min/raw_max를
-- "그 모듈 만점 대비 백분율(0~100)"로 둔 임시값이다. 채점 엔진(rawToScaled)은 실제 획득 점수를
-- 만점으로 나눠 백분율로 바꾼 뒤 이 표에서 조회해야 한다. ETS 공식 수치가 확정되면 이 표만
-- 새 마이그레이션으로 교체할 것(§0 사용법 그대로 — 코드는 안 바뀜).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

insert into toefl_scale_conversion (version, section, route, raw_min, raw_max, scaled, band)
select 'ETS-2026-04', sr.section, sr.route, curve.raw_min, curve.raw_max, curve.scaled, curve.band
from (
  values
    (0::numeric,   8::numeric,  0::smallint, 1.0::numeric),
    (8,   17,  3, 1.5),
    (17,  25,  6, 2.0),
    (25,  33,  9, 2.5),
    (33,  42, 12, 3.0),
    (42,  50, 14, 3.5),
    (50,  58, 17, 4.0),
    (58,  67, 20, 4.5),
    (67,  77, 23, 5.0),
    (77,  90, 26, 5.5),
    (90, 100, 29, 6.0)
) as curve(raw_min, raw_max, scaled, band)
cross join (
  values
    ('reading'::toefl_section,   'easy'::toefl_route),
    ('reading',   'hard'),
    ('listening', 'easy'),
    ('listening', 'hard'),
    ('speaking',  'base'),
    ('writing',   'base')
) as sr(section, route)
on conflict (version, section, route, raw_min) do nothing;

-- 어휘 완전학습 숙련도(Lv0~5) ↔ TOEFL 밴드 매핑 (spec §13, L1≈밴드2, L5≈밴드5.5 기준 — 조정 가능)
insert into toefl_vocab_level_map (vocab_level, min_band) values
  (0, 1.0),
  (1, 2.0),
  (2, 2.5),
  (3, 3.5),
  (4, 4.5),
  (5, 5.5)
on conflict (vocab_level) do nothing;
