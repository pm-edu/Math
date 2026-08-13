-- Stage 1: 영어 단어 완전학습 v2 시드 데이터.
-- 단어장 1개(CEFR A2~B1) · 유닛 3개(기초 / 혼동어휘 / 형태소) · 단어 30개 ·
-- 뜻·예문·연어 일부·형태소 그래프(spect, un-)·시드 혼동쌍 5쌍을 넣어
-- 스키마·RLS·관계형 구조 전체를 검증할 수 있는 최소 표본이다.
--
-- 참고: 전체 300단어 규모는 손으로 채우면 품질이 떨어지므로, AI 생성 파이프라인이
-- 붙는 단계(Stage 6/8, 교사 단어장 빌더)에서 검수 후 채우는 것을 권장한다.
-- 이 파일은 "이미 시드했으면 건너뛴다" 방식이라 여러 번 실행해도 안전하다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

do $$
declare
  v_set_id uuid;
  v_unit1_id uuid;
  v_unit2_id uuid;
  v_unit3_id uuid;
begin
  select id into v_set_id from word_sets where title_ko = '완전학습 시범 세트 (CEFR A2~B1)';
  if v_set_id is not null then
    raise notice '이미 시드되어 있어 건너뜁니다.';
    return;
  end if;

  insert into word_sets (title_ko, title_en, curriculum, level, is_published)
  values ('완전학습 시범 세트 (CEFR A2~B1)', 'Mastery Learning Pilot Set (CEFR A2-B1)', 'general', 'A2~B1', true)
  returning id into v_set_id;

  insert into units (set_id, position, title) values (v_set_id, 1, '일상 생활 기초') returning id into v_unit1_id;
  insert into units (set_id, position, title) values (v_set_id, 2, '학업·의견 표현 (혼동 어휘)') returning id into v_unit2_id;
  insert into units (set_id, position, title) values (v_set_id, 3, '형태소로 배우기 (spect / un-)') returning id into v_unit3_id;

  -- 30개 단어 (lemma는 unique라 재실행 시 중복 방지)
  insert into words (lemma, pos, cefr, source, is_reviewed) values
    ('arrive', 'v.', 'A2', 'seed', true),
    ('borrow', 'v.', 'A2', 'seed', true),
    ('complain', 'v.', 'A2', 'seed', true),
    ('decide', 'v.', 'A2', 'seed', true),
    ('deny', 'v.', 'A2', 'seed', true),
    ('exist', 'v.', 'A2', 'seed', true),
    ('guess', 'v.', 'A2', 'seed', true),
    ('hire', 'v.', 'A2', 'seed', true),
    ('imagine', 'v.', 'A2', 'seed', true),
    ('judge', 'v.', 'A2', 'seed', true),
    ('accept', 'v.', 'B1', 'seed', true),
    ('except', 'prep.', 'B1', 'seed', true),
    ('affect', 'v.', 'B1', 'seed', true),
    ('effect', 'n.', 'B1', 'seed', true),
    ('adapt', 'v.', 'B1', 'seed', true),
    ('adopt', 'v.', 'B1', 'seed', true),
    ('complement', 'v./n.', 'B1', 'seed', true),
    ('compliment', 'n./v.', 'B1', 'seed', true),
    ('historic', 'adj.', 'B1', 'seed', true),
    ('historical', 'adj.', 'B1', 'seed', true),
    ('inspect', 'v.', 'B1', 'seed', true),
    ('prospect', 'n.', 'B1', 'seed', true),
    ('spectator', 'n.', 'B1', 'seed', true),
    ('respect', 'n./v.', 'B1', 'seed', true),
    ('unhappy', 'adj.', 'A2', 'seed', true),
    ('unable', 'adj.', 'A2', 'seed', true),
    ('unfair', 'adj.', 'A2', 'seed', true),
    ('unlock', 'v.', 'A2', 'seed', true),
    ('unusual', 'adj.', 'B1', 'seed', true),
    ('unknown', 'adj.', 'A2', 'seed', true)
  on conflict (lemma) do nothing;

  -- 뜻(word_senses)
  insert into word_senses (word_id, meaning_ko, meaning_en, is_reviewed)
  select w.id, x.meaning_ko, x.meaning_en, true
  from (values
    ('arrive', '도착하다', 'to reach a place, especially at the end of a journey'),
    ('borrow', '빌리다', 'to take and use something that belongs to someone else, intending to return it'),
    ('complain', '불평하다', 'to say that you are unhappy or not satisfied with something'),
    ('decide', '결정하다', 'to choose something after thinking about the possibilities'),
    ('deny', '부인하다', 'to say that something is not true'),
    ('exist', '존재하다', 'to be real or to be present in a place'),
    ('guess', '추측하다', 'to give an answer without being sure it is correct'),
    ('hire', '고용하다', 'to employ someone, or to pay to use something for a short time'),
    ('imagine', '상상하다', 'to form a picture or idea in your mind'),
    ('judge', '판단하다', 'to form an opinion about someone or something after careful thought'),
    ('accept', '받아들이다', 'to agree to take something that is offered'),
    ('except', '~을 제외하고', 'not including someone or something'),
    ('affect', '영향을 미치다', 'to influence or cause a change in someone or something'),
    ('effect', '영향, 결과', 'a change that results from an action'),
    ('adapt', '적응하다', 'to change your behavior or ideas to fit a new situation'),
    ('adopt', '채택하다, 입양하다', 'to choose to use a method, or to legally take a child as your own'),
    ('complement', '보완하다, 보완물', 'something that completes or improves another thing'),
    ('compliment', '칭찬', 'a polite expression of praise'),
    ('historic', '역사적으로 중요한', 'famous or important in history'),
    ('historical', '역사와 관련된', 'relating to history in general, not necessarily famous'),
    ('inspect', '점검하다', 'to look at something closely in order to check it'),
    ('prospect', '전망, 가능성', 'the possibility that something will happen in the future'),
    ('spectator', '관중', 'a person who watches an event, especially a sports game'),
    ('respect', '존경(하다)', 'admiration for someone, or to treat someone or something well'),
    ('unhappy', '불행한', 'not happy or satisfied'),
    ('unable', '~할 수 없는', 'not able to do something'),
    ('unfair', '불공평한', 'not fair or reasonable'),
    ('unlock', '잠금을 풀다', 'to open something that is locked'),
    ('unusual', '특이한', 'not common, ordinary, or expected'),
    ('unknown', '알려지지 않은', 'not known, identified, or familiar')
  ) as x(lemma, meaning_ko, meaning_en)
  join words w on w.lemma = x.lemma;

  -- 예문
  insert into examples (word_id, text_en, text_ko, source, is_reviewed)
  select w.id, x.text_en, x.text_ko, 'seed', true
  from (values
    ('arrive', 'We arrived at the airport two hours early.', '우리는 공항에 두 시간 일찍 도착했다.'),
    ('borrow', 'Can I borrow your pen for a second?', '펜 좀 잠깐 빌려도 될까요?'),
    ('complain', 'She complained about the noise from the street.', '그녀는 거리의 소음에 대해 불평했다.'),
    ('decide', 'We decided to leave early to avoid traffic.', '우리는 교통체증을 피하려고 일찍 떠나기로 결정했다.'),
    ('deny', 'He denied breaking the window.', '그는 창문을 깬 것을 부인했다.'),
    ('exist', 'Many rare species exist only in this forest.', '많은 희귀종이 오직 이 숲에만 존재한다.'),
    ('guess', 'Can you guess how old I am?', '내 나이가 몇 살인지 맞혀볼래?'),
    ('hire', 'The company hired three new engineers.', '그 회사는 새 엔지니어 세 명을 고용했다.'),
    ('imagine', 'Imagine living on a spaceship for a year.', '우주선에서 일 년 동안 사는 것을 상상해보라.'),
    ('judge', 'Don''t judge a book by its cover.', '겉모습만 보고 판단하지 마라.'),
    ('accept', 'She accepted the job offer.', '그녀는 그 일자리 제안을 받아들였다.'),
    ('except', 'Everyone came except John.', '존을 제외하고 모두 왔다.'),
    ('affect', 'The weather can affect your mood.', '날씨는 기분에 영향을 미칠 수 있다.'),
    ('effect', 'The medicine had no effect on the pain.', '그 약은 통증에 아무 효과가 없었다.'),
    ('adapt', 'Animals adapt to their environment over time.', '동물은 시간이 지나며 환경에 적응한다.'),
    ('adopt', 'The school adopted a new grading policy.', '그 학교는 새로운 채점 방침을 채택했다.'),
    ('complement', 'The wine complements the meal perfectly.', '그 와인은 식사와 완벽하게 어울린다.'),
    ('compliment', 'She gave me a nice compliment on my presentation.', '그녀는 내 발표에 대해 좋은 칭찬을 해주었다.'),
    ('historic', 'They visited a historic battlefield.', '그들은 역사적으로 중요한 전쟁터를 방문했다.'),
    ('historical', 'This is a historical novel set in the 1800s.', '이것은 1800년대를 배경으로 한 역사 소설이다.'),
    ('inspect', 'The officer inspected the car before approving it.', '그 담당관은 승인 전에 차를 점검했다.'),
    ('prospect', 'The job offers good career prospects.', '그 일자리는 좋은 진로 전망을 제공한다.'),
    ('spectator', 'Thousands of spectators watched the final match.', '수천 명의 관중이 결승전을 지켜보았다.'),
    ('respect', 'Students should respect their teachers.', '학생들은 선생님을 존경해야 한다.'),
    ('unhappy', 'He looked unhappy about the result.', '그는 결과에 대해 불행해 보였다.'),
    ('unable', 'She was unable to attend the meeting.', '그녀는 회의에 참석할 수 없었다.'),
    ('unfair', 'It''s unfair to blame him for the mistake.', '그 실수를 그의 탓으로 돌리는 것은 불공평하다.'),
    ('unlock', 'He unlocked the door with his key.', '그는 열쇠로 문의 잠금을 풀었다.'),
    ('unusual', 'It''s unusual for her to be late.', '그녀가 늦는 것은 흔치 않은 일이다.'),
    ('unknown', 'The cause of the fire remains unknown.', '화재의 원인은 여전히 알려지지 않았다.')
  ) as x(lemma, text_en, text_ko)
  join words w on w.lemma = x.lemma;

  -- 유닛 배정(순서 포함)
  insert into unit_words (unit_id, word_id, position)
  select v_unit1_id, w.id, x.position
  from (values ('arrive',1),('borrow',2),('complain',3),('decide',4),('deny',5),
               ('exist',6),('guess',7),('hire',8),('imagine',9),('judge',10)) as x(lemma, position)
  join words w on w.lemma = x.lemma;

  insert into unit_words (unit_id, word_id, position)
  select v_unit2_id, w.id, x.position
  from (values ('accept',1),('except',2),('affect',3),('effect',4),('adapt',5),
               ('adopt',6),('complement',7),('compliment',8),('historic',9),('historical',10)) as x(lemma, position)
  join words w on w.lemma = x.lemma;

  insert into unit_words (unit_id, word_id, position)
  select v_unit3_id, w.id, x.position
  from (values ('inspect',1),('prospect',2),('spectator',3),('respect',4),('unhappy',5),
               ('unable',6),('unfair',7),('unlock',8),('unusual',9),('unknown',10)) as x(lemma, position)
  join words w on w.lemma = x.lemma;

  -- 연어(연습용 소수만)
  insert into collocations (word_id, pattern)
  select w.id, x.pattern
  from (values
    ('accept', 'accept an offer'),
    ('effect', 'have an effect on'),
    ('complain', 'complain about'),
    ('respect', 'show respect for'),
    ('decide', 'decide to do something')
  ) as x(lemma, pattern)
  join words w on w.lemma = x.lemma;

  -- 어원 지식 그래프: root "spect"(보다), prefix "un-"(부정)
  insert into morphemes (type, form, meaning_ko, meaning_en, origin) values
    ('root', 'spect', '보다', 'to look, to watch', 'Latin'),
    ('prefix', 'un-', '~아닌, 반대', 'not, opposite of', 'Old English');

  insert into word_morphemes (word_id, morpheme_id)
  select w.id, m.id
  from (values
    ('inspect','spect'), ('prospect','spect'), ('spectator','spect'), ('respect','spect'),
    ('unhappy','un-'), ('unable','un-'), ('unfair','un-'), ('unlock','un-'), ('unusual','un-'), ('unknown','un-')
  ) as x(lemma, form)
  join words w on w.lemma = x.lemma
  join morphemes m on m.form = x.form;

  -- 콜드스타트용 시드 혼동쌍(user_id null = 전체 학생 공통, 데이터 쌓이면 개인화 혼동쌍이 우선)
  insert into confusions (user_id, word_id, confused_with_word_id, count)
  select null, w1.id, w2.id, 1
  from (values
    ('accept','except'),
    ('affect','effect'),
    ('adapt','adopt'),
    ('complement','compliment'),
    ('historic','historical')
  ) as x(lemma1, lemma2)
  join words w1 on w1.lemma = x.lemma1
  join words w2 on w2.lemma = x.lemma2;

  raise notice '시드 완료: 단어장 1개, 유닛 3개, 단어 30개.';
end $$;
