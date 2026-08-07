-- 0077 — the first three Jamin Journal pieces, seeded AS DRAFTS FOR REVIEW.
--
-- ⚠️ Status is deliberately `in_review`, not `published`.
--
-- §126 of the master brief is explicit: AI-generated legal information must
-- never be published automatically without validation. These are explainers
-- about patta, DTCP approval and the order in which to check a plot — useful,
-- deliberately conservative, and carrying the §135 disclaimer — but they go out
-- under Jamin Properties' own name, so a person at Jamin signs them off before
-- a reader sees them. The RLS policy in 0076 keeps them invisible to the public
-- key until someone does.
--
-- Everything factual here is either general and uncontroversial (what a
-- document is for) or read live from the property rows at render time. No fee,
-- rate, statistic or timeline is asserted, because those change and a stale
-- number in a guide is worse than no number.

do $$
declare
  v_author   uuid := (select id from public.blog_authors   where slug = 'jamin-editorial-team');
  v_legal    uuid := (select id from public.blog_categories where slug = 'legal-guides');
  v_buying   uuid := (select id from public.blog_categories where slug = 'buying-land');
  v_props    uuid[] := array(
    select id from public.properties
     where status in ('available','reserved') and project_phase = 'ongoing'
  );
  v_disclaimer text :=
    'This article is general educational information about buying land in Tamil Nadu. '
    'It is not legal, tax or financial advice. Rules, charges and procedures change, and '
    'the position for a particular plot depends on its own records. Verify the current '
    'requirements with the relevant authority, or with a qualified professional, before '
    'you commit to a purchase.';
  v_pillar uuid;
begin

-- 1 ── the pillar: the order of checks -------------------------------------
insert into public.blog_posts (
  slug, title, kind, excerpt, body, category_id, author_id, status,
  tags, seo, related_property_ids, faqs, disclaimer, is_pillar, is_featured,
  review_due_at
) values (
  'plot-buying-checklist-tamil-nadu',
  'Before you buy a plot in Tamil Nadu: the order to check things in',
  'checklist',
  'Most plot purchases go wrong in the same few places. This is the sequence we would follow ourselves — what to look at first, and what a satisfactory answer looks like.',
$md$
Buying a plot is not one decision. It is a series of small checks, and the
order matters: some of them are cheap and quick, and they can save you the cost
of the slow ones.

## Start with the layout approval, not the plot

Before looking at an individual plot, look at the layout it sits in. A
sanctioned layout has an approval number issued by a planning authority, and
that approval is what makes the plot a legally recognised plot rather than a
piece of a larger field someone has drawn lines on.

Ask for the approval number and the sanctioned plan. Then check that the plan
you are shown is the plan that was approved — the plot numbering, the road
widths and the open space should match.

## Then the title, and the chain behind it

The seller should be able to show how they came to own the land, and that chain
should be continuous. A sale deed on its own tells you about one transaction; the
earlier deeds tell you whether that transaction was the seller's to make.

## Then the revenue records

Ownership in the deed and ownership in the government's revenue record should
agree. Where they do not, ask why before you go further — the explanation is
sometimes ordinary and sometimes not.

## Then encumbrance

An encumbrance certificate lists the registered transactions against a property
for a period you specify. What you are looking for is anything you were not
told about: a mortgage, an earlier agreement, an attachment.

## Then the physical plot

Only now is it worth spending a morning on site. Walk the plot against the plan.
Check that the road in front of it is the width the plan says, that the plot's
corners are where the layout puts them, and that nothing has been built or
planted on it by someone else.

## Then the things that decide whether you enjoy owning it

- How the plot faces, and what that means for building on it
- Whether water and power reach the layout, and who maintains the roads
- What is being built around it, and what the land beside it is zoned for
- How you would actually reach it on a working morning

## What a good answer looks like

A seller who has done this properly will not be irritated by the questions. The
documents will be ready, the numbers on them will match each other, and you will
be told plainly where something is still in progress. Hesitation on a basic
document is itself an answer.
$md$,
  v_buying, v_author, 'in_review',
  array['plots','buying land','tamil nadu','checklist','due diligence'],
  jsonb_build_object(
    'title', 'Plot Buying Checklist for Tamil Nadu — What to Check, In Order',
    'description', 'A practical order of checks before buying a plot in Tamil Nadu: layout approval, title chain, revenue records, encumbrance, then the site itself.'),
  v_props,
  jsonb_build_array(
    jsonb_build_object('q', 'What should I ask for first?',
      'a', 'The layout approval number and the sanctioned plan. It is quick to ask for, and everything else is worth less if the layout itself is not approved.'),
    jsonb_build_object('q', 'Do I need a lawyer to buy a plot?',
      'a', 'You are not obliged to use one, but a title and encumbrance check by someone who does it professionally is inexpensive relative to the purchase, and it is the part of the process where a mistake is hardest to undo.')),
  v_disclaimer, true, true,
  now() + interval '6 months'
)
on conflict (slug) do nothing
returning id into v_pillar;

if v_pillar is null then
  select id into v_pillar from public.blog_posts where slug = 'plot-buying-checklist-tamil-nadu';
end if;

-- 2 ── patta ----------------------------------------------------------------
insert into public.blog_posts (
  slug, title, kind, excerpt, body, category_id, author_id, status,
  tags, seo, related_property_ids, faqs, disclaimer, pillar_id, review_due_at
) values (
  'what-is-patta',
  'What a patta is, and why buyers ask for it first',
  'explainer',
  'A patta is the revenue record that says who the government recognises as holding a piece of land. Here is what it does, what it does not do, and how it sits alongside the sale deed.',
$md$
If you have looked at land in Tamil Nadu, someone will have used the word patta
within the first ten minutes. It is worth understanding precisely, because it is
routinely described as proof of ownership, and that is not quite what it is.

## What it actually is

A patta is a revenue record. It records, for a given survey number, who the
revenue department recognises as the holder of that land. It is maintained by
the state, and it is the record used when the state needs to know whom to deal
with over a piece of land.

## What it is not

A patta is not the instrument that transfers ownership. That is the sale deed,
registered at the sub-registrar's office. Ownership passes by the registered
deed; the patta record is then brought into line with it.

This distinction is the source of most confusion. It is possible for a deed and
a patta to disagree — usually because the record has not yet been updated after
a transaction, occasionally for reasons that matter a great deal. Either way, a
mismatch is a question to ask, not a detail to skip.

## Patta and chitta

Chitta is a related revenue record dealing with the classification of the land —
broadly, how it is categorised. The two are commonly mentioned together, and in
practice both are worth seeing.

## What to look for

- That the name on the patta is the name of the person selling to you
- That the survey number matches the land you are being shown
- That the extent recorded is consistent with the plan and the deed
- That any subdivision of the original survey number is reflected

## After you buy

Once the sale is registered, the revenue record needs to be transferred into
your name. Treat this as part of the purchase rather than as paperwork to get
to later — an out-of-date record is inconvenient exactly when you need it, which
is usually when you come to sell or to build.
$md$,
  v_legal, v_author, 'in_review',
  array['patta','chitta','land records','legal','tamil nadu'],
  jsonb_build_object(
    'title', 'What Is a Patta? Land Records in Tamil Nadu, Explained',
    'description', 'A patta is a revenue record of who the state recognises as holding a piece of land — not the document that transfers ownership. What it shows, and what to check.'),
  v_props,
  jsonb_build_array(
    jsonb_build_object('q', 'Is a patta proof of ownership?',
      'a', 'It is strong supporting evidence of who the revenue department recognises, but the registered sale deed is the instrument that transfers ownership. Both should agree.'),
    jsonb_build_object('q', 'What if the patta and the sale deed do not match?',
      'a', 'Ask why before proceeding. Often the record simply has not been updated after a recent transaction. Sometimes it points at something that needs resolving first.')),
  v_disclaimer, v_pillar,
  now() + interval '6 months'
)
on conflict (slug) do nothing;

-- 3 ── DTCP -----------------------------------------------------------------
insert into public.blog_posts (
  slug, title, kind, excerpt, body, category_id, author_id, status,
  tags, seo, related_property_ids, faqs, disclaimer, pillar_id, review_due_at
) values (
  'what-is-dtcp-approval',
  'DTCP approval, in plain language',
  'explainer',
  'An approved layout is one a planning authority has sanctioned — the roads, the plot boundaries and the reserved open space are all part of that sanction. What the approval certifies, and what it does not.',
$md$
When a layout is described as DTCP approved, it means the Directorate of Town
and Country Planning has sanctioned the layout plan for that piece of land.
Within the areas covered by a metropolitan authority, the equivalent sanction
comes from that authority instead.

## What the sanction covers

An approved layout plan fixes several things at once:

- The plot boundaries and their numbering
- The width of the internal roads, which must be formed to that width
- The open space that is reserved and handed to the local body
- The area statement — how the total extent divides between plots, roads and
  open space

That is why the approval number and the sanctioned plan are worth asking for
together. The number tells you a sanction exists; the plan tells you what was
sanctioned.

## Why it matters practically

An unapproved layout can be difficult in ordinary ways long after the purchase.
Building approval, utility connections and lending all tend to assume a
recognised plot on a recognised road. A plot in an approved layout starts from
a settled position on all three.

## What it does not certify

The approval is a planning sanction. It is not a statement about title — the
plan itself usually says so in as many words. You still need to check who owns
the land and whether anything is registered against it.

## Checking it

Ask for the approval number and read it against the plan you are given. The
village, the survey numbers and the total extent should match, and the plot you
are being offered should appear on the plan with the dimensions you were quoted.

Every Jamin layout is sanctioned, and we publish the approval number and the
sanctioned plan on the project page — including the plot-by-plot dimensions and
the area statement — so you can do this check before you visit.
$md$,
  v_legal, v_author, 'in_review',
  array['dtcp','approvals','layout','legal','tamil nadu'],
  jsonb_build_object(
    'title', 'What Is DTCP Approval? Approved Layouts in Tamil Nadu, Explained',
    'description', 'DTCP approval sanctions a layout plan — plot boundaries, road widths and reserved open space. What it certifies, what it does not, and how to check it.'),
  v_props,
  jsonb_build_array(
    jsonb_build_object('q', 'Does DTCP approval mean the title is clear?',
      'a', 'No. It is a planning sanction for the layout, not a statement about ownership. Title and encumbrance are separate checks.'),
    jsonb_build_object('q', 'How do I verify an approval number?',
      'a', 'Read it against the sanctioned plan you are given — the village, survey numbers and extent should match — and confirm the current position with the issuing authority.')),
  v_disclaimer, v_pillar,
  now() + interval '6 months'
)
on conflict (slug) do nothing;

end $$;
