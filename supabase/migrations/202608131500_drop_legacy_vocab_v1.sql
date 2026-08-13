-- Stage 1: 어제 만든 Leitner 방식 단어 기능(v1)을 제거한다.
-- 완전학습 설계([B]~[F])로 교체하기 위한 선행 작업. 실제 학생 학습 데이터가
-- 쌓이기 전 단계라 마이그레이션이 아니라 교체(재작성)로 진행한다.
--
-- 되돌리는 법: supabase/vocab.sql + supabase/vocab-modes.sql 을 다시 실행하면
-- v1 스키마가 복구된다(단, 그 사이 저장된 데이터는 복구되지 않는다).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

drop table if exists word_progress cascade;
drop table if exists word_decks cascade;
drop table if exists word_assignments cascade;
drop table if exists words cascade;
