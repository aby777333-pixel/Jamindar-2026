-- 0071 — group the buyer questionnaire into steps, and split it across the journey.
--
-- 18 questions were asked one per screen before a buyer could reach the app.
-- That reads as an interrogation and people abandon it (owner report, with
-- screenshots showing "3/18", "4/18", "6/18", "7/18" — four separate screens
-- for min budget, max budget, state and district).
--
-- Two changes, both DATA rather than code, so the admin console stays the
-- source of truth and this can be retuned without an app release:
--
--   group_key/group_title/group_help — questions sharing a group_key are asked
--   together on ONE screen. 18 screens become 6.
--
--   phase — 1 is asked before the app opens, 2 is asked later once the buyer
--   is already inside. Only the three phase-1 groups now stand between a new
--   buyer and the home screen.
--
-- Backward compatible on purpose: a question with a NULL group_key still gets
-- a screen of its own, so anything the admin adds later behaves exactly as it
-- does today until it is given a group.

alter table public.questionnaire_questions
  add column if not exists group_key   text,
  add column if not exists group_title text,
  add column if not exists group_help  text,
  add column if not exists phase       smallint not null default 1;

comment on column public.questionnaire_questions.group_key is
  'Questions sharing this value are asked together on one screen. NULL = its own screen.';
comment on column public.questionnaire_questions.phase is
  '1 = asked during onboarding, before the home screen. 2 = asked later, inside the app.';

-- ── phase 1: the three steps that stand between a buyer and the app ────────
update public.questionnaire_questions set
  group_key = 'basics', phase = 1,
  group_title = 'What are you looking for?',
  group_help  = 'Two quick answers so we can shortlist the right projects.'
where key in ('property_types', 'purpose');

update public.questionnaire_questions set
  group_key = 'budget', phase = 1,
  group_title = 'Your budget',
  group_help  = 'Approximate is fine — you can change this any time.'
where key in ('budget_min', 'budget_max', 'financing');

update public.questionnaire_questions set
  group_key = 'location', phase = 1,
  group_title = 'Where are you looking?',
  group_help  = 'Tell us as much or as little as you like.'
where key in ('state', 'district', 'city', 'locality', 'nearby_ok');

-- ── phase 2: asked later, once they are already using the app ─────────────
update public.questionnaire_questions set
  group_key = 'size', phase = 2,
  group_title = 'Plot size',
  group_help  = 'Helps us filter out plots that are the wrong size for you.'
where key in ('area_unit', 'area_min', 'area_max');

update public.questionnaire_questions set
  group_key = 'priorities', phase = 2,
  group_title = 'What matters most?',
  group_help  = 'We use this to rank what you see first.'
where key in ('amenities', 'timeframe');

update public.questionnaire_questions set
  group_key = 'contact', phase = 2,
  group_title = 'Staying in touch',
  group_help  = 'So the team reaches you the way you actually prefer.'
where key in ('contact_pref', 'visit_pref', 'notes');

-- ── the form RPC now carries the grouping ─────────────────────────────────
-- Reproduced verbatim from the live definition with four fields added to the
-- per-question object. Nothing else changed.
create or replace function public.questionnaire_form(p_lang text default 'en'::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v_role text;
  v_questions jsonb;
  v_answers jsonb;
begin
  select role::text into v_role from profiles where id = me;
  select coalesce(jsonb_agg(q order by q_sort), '[]'::jsonb) into v_questions
  from (
    select jsonb_build_object(
             'key', key,
             'question', coalesce(nullif(translations #>> array[p_lang,'question'], ''), question),
             'help', coalesce(nullif(translations #>> array[p_lang,'help'], ''), help),
             'answer_type', answer_type,
             'options', (
               select coalesce(jsonb_agg(jsonb_build_object(
                 'value', o->>'value',
                 'label', coalesce(nullif(translations #>> array[p_lang,'options', o->>'value'], ''), o->>'label')
               ) order by ord), '[]'::jsonb)
               from jsonb_array_elements(options) with ordinality t(o, ord)
             ),
             'required', required, 'unit', unit,
             'min', min_value, 'max', max_value, 'step', step_value,
             'show_if', show_if,
             'group_key', group_key,
             'group_title', group_title,
             'group_help', group_help,
             'phase', phase
           ) as q, sort_order as q_sort
    from questionnaire_questions
    where active
      and (audience = 'all' or audience = coalesce(v_role, 'buyer'))
  ) s;

  select coalesce(jsonb_object_agg(question_key, value), '{}'::jsonb) into v_answers
  from questionnaire_answers where user_id = me;

  return jsonb_build_object('ok', true, 'questions', v_questions, 'answers', coalesce(v_answers, '{}'::jsonb));
end $function$;
