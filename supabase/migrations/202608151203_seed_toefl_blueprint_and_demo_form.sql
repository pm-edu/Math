-- TOEFL P0: 블루프린트 시드 + 12개 task_type 각 최소 1문항 데모 폼 (docs/toefl-spec.md §2, §6, §16 P0)
-- 주의: 시간·문항수는 ETS 공식 Blueprint 확인 전까지 쓰는 임시값이다(스펙 §2 요구사항 그대로 —
-- 코드에 하드코딩하지 않고 이 표에서만 읽게 하기 위한 자리表). ETS 수치가 확정되면 이 블록만
-- 새 마이그레이션으로 교체할 것.
-- 지문·문항은 전부 자체 창작(ETS 실제 문항 아님, spec §1 저작권 요구사항 준수).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

insert into toefl_form_blueprint (version, section, stage, route, time_limit_sec, item_count, task_mix) values
  ('ETS-2026-04', 'reading',   'stage1', 'base', 1080, 9,
   '{"complete_the_words":3,"daily_life":3,"academic_passage":3,"routing_threshold":6}'::jsonb),
  ('ETS-2026-04', 'reading',   'stage2', 'easy',  900, 8,
   '{"complete_the_words":2,"daily_life":3,"academic_passage":3}'::jsonb),
  ('ETS-2026-04', 'reading',   'stage2', 'hard',  900, 8,
   '{"complete_the_words":2,"daily_life":3,"academic_passage":3}'::jsonb),
  ('ETS-2026-04', 'listening', 'stage1', 'base', 1200, 10,
   '{"choose_a_response":3,"conversation":2,"announcement":2,"academic_talk":3,"routing_threshold":7}'::jsonb),
  ('ETS-2026-04', 'listening', 'stage2', 'easy',  900, 8,
   '{"choose_a_response":2,"conversation":2,"announcement":2,"academic_talk":2}'::jsonb),
  ('ETS-2026-04', 'listening', 'stage2', 'hard',  900, 8,
   '{"choose_a_response":2,"conversation":2,"announcement":2,"academic_talk":2}'::jsonb),
  ('ETS-2026-04', 'speaking',  'stage1', 'base',  600, 4,
   '{"listen_and_repeat":1,"take_an_interview":3}'::jsonb),
  ('ETS-2026-04', 'writing',   'stage1', 'base', 1500, 3,
   '{"build_a_sentence":1,"write_an_email":1,"academic_discussion":1}'::jsonb)
on conflict (version, section, stage, route) do nothing;

do $$
declare
  v_form_id uuid;
  v_reading_s1 uuid;
  v_reading_s2e uuid;
  v_reading_s2h uuid;
  v_listening_s1 uuid;
  v_listening_s2e uuid;
  v_listening_s2h uuid;
  v_speaking_s1 uuid;
  v_writing_s1 uuid;
  v_stim_daily uuid;
  v_stim_academic uuid;
  v_stim_academic2 uuid;
  v_stim_conv uuid;
  v_stim_announce uuid;
  v_stim_talk uuid;
begin
  -- 이미 시드했으면 다시 만들지 않는다(여러 번 실행해도 안전하게).
  select id into v_form_id from toefl_form where code = 'TOEFL_DEMO_001';
  if v_form_id is not null then
    raise notice 'TOEFL_DEMO_001 already exists, skipping seed.';
    return;
  end if;

  insert into toefl_form (code, title, blueprint_version, is_published)
  values ('TOEFL_DEMO_001', 'TOEFL 데모 세트 1 (2026 포맷)', 'ETS-2026-04', true)
  returning id into v_form_id;

  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'reading', 'stage1', 'base', 1) returning id into v_reading_s1;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'reading', 'stage2', 'easy', 2) returning id into v_reading_s2e;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'reading', 'stage2', 'hard', 2) returning id into v_reading_s2h;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'listening', 'stage1', 'base', 3) returning id into v_listening_s1;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'listening', 'stage2', 'easy', 4) returning id into v_listening_s2e;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'listening', 'stage2', 'hard', 4) returning id into v_listening_s2h;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'speaking', 'stage1', 'base', 5) returning id into v_speaking_s1;
  insert into toefl_module (form_id, section, stage, route, position) values (v_form_id, 'writing', 'stage1', 'base', 6) returning id into v_writing_s1;

  insert into toefl_stimulus (module_id, task_type, title, body, position) values
    (v_reading_s1, 'daily_life', 'Library Notice',
     'Notice: Due to high demand, "Introduction to Marine Biology" is currently checked out by other patrons. Please place a hold to be notified when a copy becomes available. Estimated wait time: 5 days.',
     1)
  returning id into v_stim_daily;

  insert into toefl_stimulus (module_id, task_type, title, body, position) values
    (v_reading_s1, 'academic_passage', 'Coral Reefs and Bleaching',
     'Coral reefs, often called the rainforests of the sea, support an extraordinary diversity of marine life despite covering less than one percent of the ocean floor. Reef-building corals rely on a symbiotic relationship with microscopic algae called zooxanthellae, which live within the coral''s tissues and provide it with energy through photosynthesis. When ocean temperatures rise even slightly above normal, corals become stressed and expel these algae, a process known as coral bleaching. Without their algal partners, bleached corals lose their primary food source and, if conditions do not improve quickly, may eventually die.',
     2)
  returning id into v_stim_academic;

  insert into toefl_stimulus (module_id, task_type, title, body, position) values
    (v_reading_s2e, 'academic_passage', 'Migration Patterns (Practice)',
     'Every autumn, millions of monarch butterflies travel from the northern United States and Canada to overwintering sites in central Mexico, a journey of up to three thousand miles. Remarkably, no single butterfly completes the entire round trip; the migration spans several generations, with each generation traveling a portion of the route before laying eggs and dying.',
     1)
  returning id into v_stim_academic2;

  insert into toefl_stimulus (module_id, task_type, title, transcript, position) values
    (v_listening_s1, 'conversation', 'Course Registration',
     'Student: Hi, I''m trying to register for Introduction to Psychology, but the system says the class is full. Advisor: Let me check... yes, it looks like the lecture section is full, but there''s still room in the section that meets on Friday mornings. Student: Oh, I have a work shift every Friday morning, so that won''t work for me. Advisor: In that case, I''d recommend joining the waitlist for the section you wanted -- spots often open up in the first week.',
     1)
  returning id into v_stim_conv;

  insert into toefl_stimulus (module_id, task_type, title, transcript, position) values
    (v_listening_s1, 'announcement', 'Library Hours Change',
     'Attention students: starting next Monday, the main library will extend its weekday hours, staying open until midnight instead of the usual 10 PM closing time. This change will remain in effect through the end of final exams. Weekend hours are unchanged.',
     2)
  returning id into v_stim_announce;

  insert into toefl_stimulus (module_id, task_type, title, transcript, position) values
    (v_listening_s1, 'academic_talk', 'Intro to Urban Heat Islands',
     'Today we''re going to talk about the urban heat island effect. In short, cities tend to be significantly warmer than the rural areas that surround them. This happens mainly because materials like asphalt and concrete absorb and retain heat much more effectively than natural surfaces like grass or soil. Tall buildings can also trap warm air at street level and block cooling breezes. Some cities have started planting more trees and using lighter-colored building materials to help reflect sunlight and reduce this effect.',
     3)
  returning id into v_stim_talk;

  -- reading items
  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_reading_s1, null, 'complete_the_words', 1, 2, 'auto_key',
   'Fill in the missing letters to complete each word.',
   '{"paragraph":"The eco_omy grew rapidly after the new policy was int_oduced.","blanks":[{"id":"b1","masked":"eco_omy","length":7},{"id":"b2","masked":"int_oduced","length":10}]}'::jsonb,
   '{"b1":"economy","b2":"introduced"}'::jsonb,
   '문맥상 economy(경제)와 introduced(도입되다)가 들어가야 자연스럽습니다.'),
  (v_reading_s1, v_stim_daily, 'daily_life', 2, 1, 'auto_key',
   'Read the notice. Why is the book currently unavailable?',
   '{"format":"mcq","options":[{"id":"A","text":"The library closes early on weekends."},{"id":"B","text":"The writer forgot their library card."},{"id":"C","text":"All copies are currently checked out."},{"id":"D","text":"The library is under renovation."}],"select_count":1}'::jsonb,
   '{"correct":["C"]}'::jsonb,
   '공지문에 다른 이용자들이 대출 중이라고 나와 있으므로 정답은 C입니다.'),
  (v_reading_s1, v_stim_academic, 'academic_passage', 3, 3, 'auto_key',
   'According to the passage, what happens when corals expel their zooxanthellae?',
   '{"format":"mcq","options":[{"id":"A","text":"They begin to grow more rapidly."},{"id":"B","text":"They lose their main source of energy."},{"id":"C","text":"They become more resistant to temperature change."},{"id":"D","text":"They attract new species of fish."}],"select_count":1}'::jsonb,
   '{"correct":["B"]}'::jsonb,
   '지문에서 zooxanthellae가 광합성으로 에너지를 제공한다고 했으므로, 이를 배출하면 주 에너지원을 잃게 됩니다.');

  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_reading_s2e, v_stim_academic2, 'academic_passage', 1, 1, 'auto_key',
   'How does the monarch butterfly migration differ from typical animal migrations?',
   '{"format":"mcq","options":[{"id":"A","text":"It takes place only in spring."},{"id":"B","text":"No single butterfly completes the full journey."},{"id":"C","text":"It covers a much shorter distance."},{"id":"D","text":"It occurs entirely within Mexico."}],"select_count":1}'::jsonb,
   '{"correct":["B"]}'::jsonb,
   '지문에서 한 세대가 전체 여정을 다 가지 않고 여러 세대에 걸쳐 이동한다고 했습니다.');

  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_reading_s2h, v_stim_academic2, 'academic_passage', 1, 4, 'auto_key',
   'Why does the passage emphasize that no single butterfly completes the entire round trip?',
   '{"format":"mcq","options":[{"id":"A","text":"To show that the migration is faster than expected."},{"id":"B","text":"To highlight a unique feature of this migration compared to others."},{"id":"C","text":"To argue that monarch butterflies are endangered."},{"id":"D","text":"To explain why the butterflies fly at night."}],"select_count":1}'::jsonb,
   '{"correct":["B"]}'::jsonb,
   '이 문장은 나비 이동의 독특한 특징(여러 세대에 걸친 이동)을 강조하기 위해 쓰였습니다.');

  -- listening items
  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_listening_s1, null, 'choose_a_response', 1, 2, 'auto_key',
   'Choose the best response to what you hear.',
   '{"clip_path":null,"options":[{"id":"A","text":"Yes, it runs every twenty minutes until 9 PM."},{"id":"B","text":"No, I have not read that book yet."},{"id":"C","text":"The library opens at nine tomorrow."},{"id":"D","text":"I usually walk instead of driving."}]}'::jsonb,
   '{"correct":["A"]}'::jsonb,
   '셔틀 운행 여부를 물었으므로, 운행 정보로 답하는 A가 자연스러운 응답입니다.'),
  (v_listening_s1, v_stim_conv, 'conversation', 2, 2, 'auto_key',
   'What is the student main problem?',
   '{"format":"mcq","options":[{"id":"A","text":"The class the student wants is full."},{"id":"B","text":"The student missed the registration deadline."},{"id":"C","text":"The student cannot afford the course."},{"id":"D","text":"The advisor is unavailable to help."}],"select_count":1}'::jsonb,
   '{"correct":["A"]}'::jsonb,
   '학생이 원하는 강의 섹션이 마감되었다는 것이 대화의 핵심입니다.'),
  (v_listening_s1, v_stim_announce, 'announcement', 3, 1, 'auto_key',
   'What is changing about the library starting next Monday?',
   '{"format":"mcq","options":[{"id":"A","text":"It will open later on weekdays."},{"id":"B","text":"It will stay open later on weekdays."},{"id":"C","text":"It will be closed on weekends."},{"id":"D","text":"It will move to a new building."}],"select_count":1}'::jsonb,
   '{"correct":["B"]}'::jsonb,
   '평일 마감 시간이 밤 10시에서 자정으로 늘어난다고 했습니다.'),
  (v_listening_s1, v_stim_talk, 'academic_talk', 4, 3, 'auto_key',
   'According to the lecture, why are cities warmer than surrounding rural areas?',
   '{"format":"mcq","options":[{"id":"A","text":"Cities have more rainfall."},{"id":"B","text":"Building materials absorb and retain more heat."},{"id":"C","text":"Rural areas have more concrete surfaces."},{"id":"D","text":"Cities are located at higher altitudes."}],"select_count":1}'::jsonb,
   '{"correct":["B"]}'::jsonb,
   '아스팔트·콘크리트 같은 재질이 열을 더 잘 흡수·보존한다고 설명했습니다.');

  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_listening_s2e, null, 'choose_a_response', 1, 1, 'auto_key',
   'Choose the best response to what you hear.',
   '{"clip_path":null,"options":[{"id":"A","text":"Sure, I will meet you there at noon."},{"id":"B","text":"The weather was nice yesterday."},{"id":"C","text":"I already finished my homework."},{"id":"D","text":"That book is on the top shelf."}]}'::jsonb,
   '{"correct":["A"]}'::jsonb,
   '약속 장소·시간을 제안하는 말에는 수락하는 응답이 자연스럽습니다(연습용 문항).');

  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_listening_s2h, null, 'choose_a_response', 1, 4, 'auto_key',
   'Choose the best response to what you hear.',
   '{"clip_path":null,"options":[{"id":"A","text":"I would rather revise the introduction first."},{"id":"B","text":"The library closes at midnight now."},{"id":"C","text":"Yes, the bus was late again."},{"id":"D","text":"No, I have never been to that museum."}]}'::jsonb,
   '{"correct":["A"]}'::jsonb,
   '작업 우선순위를 묻는 말에는 어떤 부분을 먼저 하겠다는 응답이 자연스럽습니다(연습용 문항).');

  -- speaking items
  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_speaking_s1, null, 'listen_and_repeat', 1, 2, 'auto_transcript',
   'Listen to the sentence and repeat it exactly as you heard it.',
   '{"clip_path":null,"target_sentence":"The museum will be closed for renovations next month.","response_window_sec":8}'::jsonb,
   '{"target_sentence":"The museum will be closed for renovations next month."}'::jsonb,
   'STT로 전사한 결과와 원문 문장을 단어 단위로 비교해 정확도를 계산합니다.'),
  (v_speaking_s1, null, 'take_an_interview', 2, 3, 'ai_rubric',
   'Do you think university students should be required to complete an internship before graduating? Explain your opinion.',
   '{"video_path":null,"question_audio_path":null,"prep_sec":15,"response_sec":45,"turn_type":"opinion"}'::jsonb,
   null,
   'AI 루브릭(Delivery/Language Use/Topic Development)으로 채점하며, 정해진 정답은 없습니다.');

  -- writing items
  insert into toefl_item (module_id, stimulus_id, task_type, position, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko) values
  (v_writing_s1, null, 'build_a_sentence', 1, 2, 'auto_sequence',
   'Arrange the chunks into a grammatically correct sentence.',
   '{"chunks":[{"id":"c1","text":"the committee"},{"id":"c2","text":"has"},{"id":"c3","text":"approved"},{"id":"c4","text":"the new budget proposal"}]}'::jsonb,
   '{"order":["c1","c2","c3","c4"],"accepted_alternatives":[]}'::jsonb,
   '주어(the committee)+조동사(has)+본동사(approved)+목적어 순서가 올바른 어순입니다.'),
  (v_writing_s1, null, 'write_an_email', 2, 3, 'ai_rubric',
   'Write an email based on the scenario below.',
   '{"scenario":"You need to reschedule a meeting with your academic advisor because of a scheduling conflict.","required_points":["회의 일정 변경 요청","변경 사유 설명","대안 일정 제안"],"word_min":100,"word_max":130}'::jsonb,
   null,
   'AI 루브릭(Task Achievement/Coherence/Lexical Resource/Grammar)으로 채점합니다.'),
  (v_writing_s1, null, 'academic_discussion', 3, 3, 'ai_rubric',
   'Read the professor question and the other student posts below, then write your own response.',
   '{"professor_post":"In your view, should social media platforms be held legally responsible for misinformation shared by their users?","student_posts":[{"name":"Jordan","text":"I think platforms should be responsible because they profit from engagement, even when that engagement comes from false information."}],"word_min":100,"word_max":150}'::jsonb,
   null,
   'AI 루브릭 + 새로운 관점 제시 여부 가점 규칙으로 채점합니다.');

end $$;
