-- 0063 — Smart Buyer Discovery Questionnaire + AI learning (owner spec 29-07).
--
-- Design notes:
--  • Questions are DATA, not code: the app and the web console both render
--    whatever `questionnaire_questions` holds, so an admin edit is live on
--    every surface instantly — no app release needed.
--  • Answers live in `questionnaire_answers` (raw, per question key) AND are
--    synced into the EXISTING `buyer_preferences` columns via `maps_to`, so
--    every current consumer (lib/suggestions, Jamindar memory, onboarding
--    prefill) keeps working exactly as before. Nothing existing is replaced.
--  • `my_property_matches` ranks live inventory against those preferences and
--    explains WHY each property is recommended.

-- ── question catalogue (admin-managed) ───────────────────────────────────
create table if not exists public.questionnaire_questions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  question    text not null,
  help        text,
  answer_type text not null default 'single_select'
              check (answer_type in ('single_select','multi_select','dropdown','text','textarea',
                                     'number','date','slider','checkbox','radio','file')),
  options     jsonb not null default '[]'::jsonb,   -- [{"value":"...","label":"..."}]
  maps_to     text,                                  -- buyer_preferences column to sync
  required    boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  audience    text not null default 'buyer',         -- buyer | promoter | all
  region      text,                                  -- optional state/city targeting
  show_if     jsonb,                                 -- {"key":"purpose","any":["investment"]}
  min_value   numeric, max_value numeric, step_value numeric, unit text,
  translations jsonb not null default '{}'::jsonb,   -- {"ta":{"question":"…","options":{"value":"label"}}}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_qq_active on public.questionnaire_questions(active, sort_order);

-- ── answers (one row per user per question) ──────────────────────────────
create table if not exists public.questionnaire_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  question_key text not null,
  value        jsonb,
  updated_at   timestamptz not null default now(),
  unique (user_id, question_key)
);
create index if not exists idx_qa_user on public.questionnaire_answers(user_id);

alter table public.questionnaire_questions enable row level security;
alter table public.questionnaire_answers  enable row level security;

drop policy if exists qq_read on public.questionnaire_questions;
create policy qq_read on public.questionnaire_questions for select using (true);
drop policy if exists qq_admin on public.questionnaire_questions;
create policy qq_admin on public.questionnaire_questions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

drop policy if exists qa_own on public.questionnaire_answers;
create policy qa_own on public.questionnaire_answers for all
  using (user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (user_id = auth.uid());

grant select on public.questionnaire_questions to authenticated, anon;
grant select, insert, update, delete on public.questionnaire_answers to authenticated;

-- ── seed: the owner's suggested question set (idempotent) ────────────────
insert into public.questionnaire_questions
  (key, question, help, answer_type, options, maps_to, required, sort_order, unit, min_value, max_value, step_value)
values
 ('property_types','What type of property are you looking for?','Select all that apply.','multi_select',
  '[{"value":"residential_plot","label":"Residential Plot"},{"value":"commercial_land","label":"Commercial Plot"},
    {"value":"villa_plot","label":"Villa Plot"},{"value":"farm_land","label":"Farm Land"},
    {"value":"agricultural_land","label":"Agricultural Land"},{"value":"industrial_land","label":"Industrial Land"},
    {"value":"apartment","label":"Apartment"},{"value":"villa","label":"Villa"},{"value":"house","label":"House"},
    {"value":"investment_property","label":"Investment Property"},{"value":"other","label":"Other"}]'::jsonb,
  'property_types', true, 10, null, null, null, null),

 ('purpose','What is the purpose of this purchase?','This helps us recommend the right projects.','multi_select',
  '[{"value":"Self use","label":"Self-use"},{"value":"Investment","label":"Investment"},{"value":"Business","label":"Business"},
    {"value":"Future construction","label":"Future Construction"},{"value":"Rental income","label":"Rental Income"},
    {"value":"Retirement","label":"Retirement"},{"value":"Other","label":"Other"}]'::jsonb,
  'purpose', false, 20, null, null, null, null),

 ('budget_min','What is your minimum budget?','Approximate is fine.','number', '[]'::jsonb, 'budget_min', false, 30, '₹', 0, null, null),
 ('budget_max','What is your maximum budget?','We will rank projects that fit comfortably.','number', '[]'::jsonb, 'budget_max', true, 40, '₹', 0, null, null),
 ('financing','How do you plan to fund the purchase?', null, 'single_select',
  '[{"value":"Self-funded","label":"Self-funded"},{"value":"Bank Loan","label":"Bank Loan"},{"value":"Undecided","label":"Undecided"}]'::jsonb,
  'financing', false, 50, null, null, null, null),

 ('state','Which state are you looking in?', null, 'text', '[]'::jsonb, 'state', false, 60, null, null, null, null),
 ('district','Preferred district', null, 'text', '[]'::jsonb, 'district', false, 70, null, null, null, null),
 ('city','Preferred city or town', null, 'text', '[]'::jsonb, 'city', false, 80, null, null, null, null),
 ('locality','Preferred locality (optional)', null, 'text', '[]'::jsonb, 'locality', false, 90, null, null, null, null),
 ('nearby_ok','Would you consider nearby locations?','We often have better value just outside the main town.','single_select',
  '[{"value":"yes","label":"Yes, show me nearby options"},{"value":"no","label":"No, only my chosen area"}]'::jsonb,
  null, false, 100, null, null, null, null),

 ('area_unit','Which unit do you prefer for plot size?', null, 'single_select',
  '[{"value":"sqft","label":"Sq.ft"},{"value":"cents","label":"Cents"},{"value":"acres","label":"Acres"},{"value":"grounds","label":"Grounds"}]'::jsonb,
  'area_unit', false, 110, null, null, null, null),
 ('area_min','Minimum plot size', null, 'number', '[]'::jsonb, 'area_min', false, 120, null, 0, null, null),
 ('area_max','Maximum plot size', null, 'number', '[]'::jsonb, 'area_max', false, 130, null, 0, null, null),

 ('amenities','Which amenities matter to you?','Select all that apply.','multi_select',
  '[{"value":"Gated Community","label":"Gated Community"},{"value":"DTCP Approved","label":"DTCP Approved"},
    {"value":"CMDA Approved","label":"CMDA Approved"},{"value":"RERA Registered","label":"RERA Registered"},
    {"value":"Corner Plot","label":"Corner Plot"},{"value":"Park Facing","label":"Park Facing"},
    {"value":"Near Highway","label":"Near Highway"},{"value":"Near School","label":"Near School"},
    {"value":"Near Hospital","label":"Near Hospital"},{"value":"Near Metro","label":"Near Metro"},
    {"value":"Near Airport","label":"Near Airport"},{"value":"Water Connection","label":"Water Connection"},
    {"value":"Electricity","label":"Electricity"},{"value":"Clubhouse","label":"Clubhouse"},
    {"value":"Children''s Park","label":"Children''s Park"},{"value":"Security","label":"Security"},
    {"value":"Other","label":"Other"}]'::jsonb,
  'amenities', false, 140, null, null, null, null),

 ('timeframe','When are you planning to buy?', null, 'single_select',
  '[{"value":"Immediately","label":"Immediate Purchase"},{"value":"Within 3 months","label":"Within 3 Months"},
    {"value":"Within 6 months","label":"Within 6 Months"},{"value":"Within 1 year","label":"Within 1 Year"},
    {"value":"Just exploring","label":"Just Exploring"}]'::jsonb,
  'timeframe', false, 150, null, null, null, null),

 ('contact_pref','How would you like us to contact you?', null, 'single_select',
  '[{"value":"Phone Call","label":"Phone Call"},{"value":"WhatsApp","label":"WhatsApp"},
    {"value":"Email","label":"Email"},{"value":"In-App Chat","label":"In-App Chat"}]'::jsonb,
  null, false, 160, null, null, null, null),

 ('visit_pref','When do site visits suit you best?','Select all that apply.','multi_select',
  '[{"value":"Weekdays","label":"Weekdays"},{"value":"Weekends","label":"Weekends"},
    {"value":"Morning","label":"Morning"},{"value":"Afternoon","label":"Afternoon"},{"value":"Evening","label":"Evening"}]'::jsonb,
  null, false, 170, null, null, null, null),

 ('notes','Anything specific you are looking for?','Tell us in your own words — Jamindar will remember.','textarea',
  '[]'::jsonb, null, false, 180, null, null, null, null)
on conflict (key) do nothing;

-- ── form fetch (localized, personalized) ─────────────────────────────────
create or replace function public.questionnaire_form(p_lang text default 'en')
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
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
             'show_if', show_if
           ) as q, sort_order as q_sort
    from questionnaire_questions
    where active
      and (audience = 'all' or audience = coalesce(v_role, 'buyer'))
  ) s;

  select coalesce(jsonb_object_agg(question_key, value), '{}'::jsonb) into v_answers
  from questionnaire_answers where user_id = me;

  return jsonb_build_object('ok', true, 'questions', v_questions, 'answers', coalesce(v_answers, '{}'::jsonb));
end $$;

-- ── save answers (+ sync into buyer_preferences) ─────────────────────────
create or replace function public.questionnaire_save(p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  k text; v jsonb;
  v_pref jsonb := '{}'::jsonb;
  v_col text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Nothing to save.');
  end if;

  for k, v in select * from jsonb_each(p_answers) loop
    insert into questionnaire_answers (user_id, question_key, value, updated_at)
    values (me, k, v, now())
    on conflict (user_id, question_key) do update set value = excluded.value, updated_at = now();

    select maps_to into v_col from questionnaire_questions where key = k;
    if v_col is not null then v_pref := v_pref || jsonb_build_object(v_col, v); end if;
  end loop;

  -- keep the existing structured preferences in sync (no consumer changes)
  insert into buyer_preferences (buyer_id) values (me)
  on conflict (buyer_id) do nothing;

  update buyer_preferences set
    property_types = case when v_pref ? 'property_types' then coalesce(v_pref->'property_types','[]'::jsonb) else property_types end,
    purpose        = case when v_pref ? 'purpose'        then coalesce(v_pref->'purpose','[]'::jsonb)        else purpose end,
    amenities      = case when v_pref ? 'amenities'      then coalesce(v_pref->'amenities','[]'::jsonb)      else amenities end,
    budget_min     = case when v_pref ? 'budget_min'     then nullif(v_pref->>'budget_min','')::numeric      else budget_min end,
    budget_max     = case when v_pref ? 'budget_max'     then nullif(v_pref->>'budget_max','')::numeric      else budget_max end,
    area_min       = case when v_pref ? 'area_min'       then nullif(v_pref->>'area_min','')::numeric        else area_min end,
    area_max       = case when v_pref ? 'area_max'       then nullif(v_pref->>'area_max','')::numeric        else area_max end,
    area_unit      = case when v_pref ? 'area_unit'      then coalesce(nullif(v_pref->>'area_unit',''),area_unit) else area_unit end,
    city           = case when v_pref ? 'city'           then nullif(v_pref->>'city','')                     else city end,
    district       = case when v_pref ? 'district'       then nullif(v_pref->>'district','')                 else district end,
    state          = case when v_pref ? 'state'          then nullif(v_pref->>'state','')                    else state end,
    locality       = case when v_pref ? 'locality'       then nullif(v_pref->>'locality','')                 else locality end,
    timeframe      = case when v_pref ? 'timeframe'      then nullif(v_pref->>'timeframe','')                else timeframe end,
    financing      = case when v_pref ? 'financing'      then nullif(v_pref->>'financing','')                else financing end,
    updated_at     = now()
  where buyer_id = me;

  return jsonb_build_object('ok', true, 'saved', (select count(*) from jsonb_each(p_answers)));
end $$;

-- ── smart matches: rank live inventory + explain why ─────────────────────
create or replace function public.my_property_matches(p_limit integer default 12)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  pr buyer_preferences;
  v jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into pr from buyer_preferences where buyer_id = me;

  select coalesce(jsonb_agg(x order by x_score desc, x_created desc), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
             'id', p.id, 'title', p.title, 'city', p.city, 'district', p.district, 'state', p.state,
             'locality', p.locality, 'price', p.price, 'property_type', p.property_type,
             'project_phase', p.project_phase, 'image', p.images->0,
             'plots_available', p.plots_available,
             'score', s.score, 'reasons', s.reasons
           ) as x, s.score as x_score, p.created_at as x_created
    from properties p
    cross join lateral (
      select
        (case when pr.property_types is not null and jsonb_array_length(pr.property_types) > 0
                   and pr.property_types ? p.property_type::text then 30 else 0 end)
      + (case when pr.budget_max is not null and p.price is not null and p.price <= pr.budget_max then 25
              when p.price is null then 8 else 0 end)
      + (case when pr.budget_min is not null and p.price is not null and p.price >= pr.budget_min then 5 else 0 end)
      + (case when pr.city is not null and lower(coalesce(p.city,'')) = lower(pr.city) then 25
              when pr.district is not null and lower(coalesce(p.district,'')) = lower(pr.district) then 15
              when pr.state is not null and lower(coalesce(p.state,'')) = lower(pr.state) then 8 else 0 end)
      + (case when pr.area_max is not null and p.area_value is not null and p.area_value <= pr.area_max then 5 else 0 end)
      + (case when pr.area_min is not null and p.area_value is not null and p.area_value >= pr.area_min then 5 else 0 end)
      + (select least(10, count(*) * 3) from jsonb_array_elements_text(coalesce(pr.amenities,'[]'::jsonb)) a
          where exists (select 1 from jsonb_array_elements_text(coalesce(p.amenities,'[]'::jsonb)) pa
                        where lower(pa) like '%' || lower(a) || '%'))
      + (select least(8, count(*) * 4) from jsonb_array_elements_text(coalesce(pr.amenities,'[]'::jsonb)) a
          where exists (select 1 from jsonb_each(coalesce(p.approvals,'{}'::jsonb)) ap
                        where (ap.value)::text = 'true' and lower(a) like '%' || lower(ap.key) || '%'))
      + (case when p.is_featured then 3 else 0 end) as score,
        (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
           select 'Matches your preferred property type' as r
             where pr.property_types is not null and pr.property_types ? p.property_type::text
           union all
           select 'Fits comfortably within your budget'
             where pr.budget_max is not null and p.price is not null and p.price <= pr.budget_max
           union all
           select 'In your preferred city'
             where pr.city is not null and lower(coalesce(p.city,'')) = lower(pr.city)
           union all
           select 'In your preferred district'
             where pr.city is null and pr.district is not null and lower(coalesce(p.district,'')) = lower(pr.district)
           union all
           select 'Plot size is in your range'
             where pr.area_max is not null and p.area_value is not null and p.area_value <= pr.area_max
           union all
           select 'Has the approvals you asked for'
             where exists (select 1 from jsonb_array_elements_text(coalesce(pr.amenities,'[]'::jsonb)) a
                           join lateral jsonb_each(coalesce(p.approvals,'{}'::jsonb)) ap on true
                           where (ap.value)::text = 'true' and lower(a) like '%' || lower(ap.key) || '%')
         ) rr) as reasons
    ) s
    where p.status in ('available','reserved')
    order by s.score desc, p.created_at desc
    limit greatest(1, least(coalesce(p_limit, 12), 50))
  ) t;

  return jsonb_build_object('ok', true, 'has_prefs', pr.buyer_id is not null, 'matches', v);
end $$;

revoke execute on function public.questionnaire_form(text) from anon;
revoke execute on function public.questionnaire_save(jsonb) from anon;
revoke execute on function public.my_property_matches(integer) from anon;
grant execute on function public.questionnaire_form(text) to authenticated;
grant execute on function public.questionnaire_save(jsonb) to authenticated;
grant execute on function public.my_property_matches(integer) to authenticated;
