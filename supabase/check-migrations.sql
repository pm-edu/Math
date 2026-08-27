-- 마이그레이션 적용 여부 점검표
--
-- 이 프로젝트는 supabase/migrations/*.sql 을 사람이 직접 SQL Editor에서 실행한다
-- (supabase/migrations/README.md). 그래서 "코드는 배포됐는데 SQL은 안 돌린" 상태가
-- 생길 수 있고, 그게 조용히 지나간다 — 화면이 에러를 내지 않고 그냥 값이 0으로 보인다.
--
-- 실제로 그런 일이 있었다(2026-08-19): 202608191500 이 미실행이라 toefl_item.is_active 가
-- 없었고, 그 컬럼으로 거르는 조회가 전부 실패해 관리 화면의 슬롯이 전부 0/N 으로 보였다.
--
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run.
--         "적용됨" 열이 전부 true 여야 정상. false 인 줄의 마이그레이션 파일을 실행하면 된다.
--         읽기만 하므로 몇 번 실행해도 안전하다.

select '202608131501 단어 v2 스키마' as 마이그레이션,
       to_regclass('public.word_sets') is not null as 적용됨
union all select '202608131503 단어 사다리 컬럼',
       exists (select 1 from information_schema.columns
                where table_name = 'user_word_states' and column_name = 'last_session_id')
union all select '202608151200 TOEFL 스키마',
       to_regclass('public.toefl_item') is not null
union all select '202608151201 TOEFL 공개뷰',
       to_regclass('public.toefl_item_public') is not null
union all select '202608151202 점수 환산표(시드)',
       case when to_regclass('public.toefl_scale_conversion') is null then false
            else (select count(*) > 0 from toefl_scale_conversion) end
union all select '202608151203 블루프린트·데모폼(시드)',
       case when to_regclass('public.toefl_form_blueprint') is null then false
            else (select count(*) > 0 from toefl_form_blueprint) end
union all select '202608181300 섹션 노트',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_section_attempt' and column_name = 'notes')
union all select '202608181400 총점·밴드',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_attempt' and column_name = 'overall_band')
union all select '202608191500 문항풀 is_active',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_item' and column_name = 'is_active')
union all select '202608191500 문항선택 저장',
       to_regclass('public.toefl_attempt_item_selection') is not null
union all select '202608191600 검수상태 verified',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_item' and column_name = 'verified')
union all select '202608191600 생성배치',
       to_regclass('public.toefl_generation_batch') is not null
union all select '202608191600 공개뷰가 verified를 거르는가',
       exists (select 1 from pg_views
                where viewname = 'toefl_item_public' and definition like '%verified%')
union all select '202608271200 점수변환표 cefr 컬럼',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_scale_conversion' and column_name = 'cefr')
union all select '202608271200 밴드6.0 최상단 scaled=30 보정',
       not exists (select 1 from toefl_scale_conversion where scaled = 29)
union all select '202608271300 AI채점 status 컬럼',
       exists (select 1 from information_schema.columns
                where table_name = 'toefl_ai_score' and column_name = 'status')
union all select '202608272000 문항 반려 사유 로그',
       to_regclass('public.toefl_item_rejection') is not null;
