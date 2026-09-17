-- RUN_MATH_SITE.md 2단계 B — entitlement_grants.feature_key를 2개로 좁힌다
-- ('math.subscription' / 'math.lecture'). 기존 값(5개 세분화된 키, math-progression PG1이
-- CHECK 제약 없이 만들어둠)은 0건으로 확인 후 진행함(2026-09-17). 여러 번 실행해도 안전.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table entitlement_grants drop constraint if exists entitlement_grants_feature_key_check;
alter table entitlement_grants add constraint entitlement_grants_feature_key_check
  check (feature_key in ('math.subscription', 'math.lecture'));
