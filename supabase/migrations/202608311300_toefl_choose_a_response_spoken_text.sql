-- choose_a_response(듣기, 발화 듣고 응답 고르기) 오디오 유실 버그 수정.
-- [[toefl-item-pipeline-project]] 참고 — 대량생성 파이프라인(generation-shortfall.ts)이
-- "실제로 들려줄 문장"(spoken_text)을 저장 시점에 아예 버려서, 데모 원본 3개를 뺀 나머지
-- (2026-08-31 실측 69개, 그중 39개는 이미 verified=true로 노출 중)는 오디오를 영원히 만들
-- 수 없는 상태였다.
--
-- payload에는 못 넣는다(듣기 전에 대본을 읽어버리는 셈 — §5 보안 요구사항). toefl_item_public
-- 뷰(마이그레이션 202608191600)는 컬럼을 명시적으로 나열해서 만들기 때문에, 여기서 컬럼을
-- 추가해도 그 뷰가 select *가 아닌 한 자동으로는 안 새어나간다 — 그래도 확인을 위해 뷰를
-- 재확인하는 select를 마지막에 둔다.
--
-- 되돌리는 법: alter table toefl_item drop column spoken_text_private;
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table toefl_item
  add column if not exists spoken_text_private text;

-- ═══════════ 확인 — toefl_item_public이 여전히 이 컬럼을 안 내보내는지 ═══════════
select column_name from information_schema.columns
  where table_name = 'toefl_item_public' and column_name = 'spoken_text_private';
-- 위 결과가 0행이어야 정상(뷰가 이 컬럼을 노출하지 않음).
