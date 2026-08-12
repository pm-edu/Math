-- 단어 테스트 옵션: 영어 정의(영영) 추가 + 단어장별 설정(객관식/주관식, 뜻 표시 방식)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- 영영 뜻(영어 정의) 칸 추가
alter table words add column if not exists definition_en text;

-- 단어장별 설정: 테스트 유형과 뜻 표시 방식
create table if not exists word_decks (
  deck text primary key,
  tag text not null default 'general',
  test_mode text not null default 'mcq',  -- mcq(객관식) | typing(주관식) | both(섞어서)
  def_mode text not null default 'ko',    -- ko(영한) | en(영영) | both(둘 다)
  created_at timestamptz default now()
);

alter table word_decks enable row level security;

-- 직원은 관리, 로그인한 사용자는 설정을 읽을 수 있다(학습 화면에서 필요).
drop policy if exists "staff manage word_decks" on word_decks;
create policy "staff manage word_decks" on word_decks
  for all using (is_staff()) with check (is_staff());

drop policy if exists "authenticated read word_decks" on word_decks;
create policy "authenticated read word_decks" on word_decks
  for select using (auth.uid() is not null);

grant select, insert, update, delete on word_decks to authenticated;
