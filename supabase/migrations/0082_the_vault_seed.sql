-- 0082 — THE VAULT: taxonomy, destinations and copy.
--
-- Everything here is `on conflict do nothing`, so re-running the migration can
-- never overwrite an edit made in the admin console. §19 is explicit that none
-- of this may be hard-coded in the website — the rows are the source of truth
-- and the console owns them from the moment they exist.
--
-- ⚠️ `image_url` is deliberately left NULL on every row. The website falls back
-- to a generated placeholder derived from the family or destination slug, so a
-- category without art is a designed plate rather than a broken image. Setting
-- a URL here would mean the placeholder never gets replaced by real photography
-- without a migration; leaving it null means uploading art in the console is
-- the whole job.

begin;

-- ------------------------------------------------------------ families -----
-- §2, in the brief's own order. `family` holds the DISPLAY label; the website
-- slugifies it for the placeholder path rather than keeping a second list.

insert into vault_categories (family, slug, label, note, sort) values
  ('Coastal & Waterfront','private-beach-houses','Private beach houses','Direct sand, held privately.',11),
  ('Coastal & Waterfront','beachfront-villas','Beachfront villas','Built and finished, on the shoreline.',12),
  ('Coastal & Waterfront','ocean-view-estates','Ocean-view estates','Elevated ground with an open horizon.',13),
  ('Coastal & Waterfront','riverfront-estates','Riverfront estates','River frontage with usable land behind it.',14),
  ('Coastal & Waterfront','lake-houses','Lake houses','Quiet water, and the house that watches it.',15),
  ('Coastal & Waterfront','backwater-properties','Backwater properties','Kerala''s waterways, and what sits along them.',16),
  ('Coastal & Waterfront','private-waterfront-retreats','Private waterfront retreats','Water access that belongs to one household.',17),
  ('Coastal & Waterfront','island-properties','Island properties','Where legally available, and only there.',18),

  ('Mountains & Nature','mountain-cabins','Mountain cabins','Small, high, and built for weather.',21),
  ('Mountains & Nature','hill-estates','Hill estates','Land on a slope, with a house that earns the view.',22),
  ('Mountains & Nature','tea-estates','Tea estates','Working gardens, with or without the bungalow.',23),
  ('Mountains & Nature','coffee-estates','Coffee estates','Shade-grown acreage, usually with a residence.',24),
  ('Mountains & Nature','plantation-homes','Plantation homes','The house at the centre of a working estate.',25),
  ('Mountains & Nature','forest-edge-retreats','Forest-edge retreats','Where cultivation stops and the canopy starts.',26),
  ('Mountains & Nature','wilderness-lodges','Wilderness lodges','Built to be lived in a long way from anything.',27),
  ('Mountains & Nature','valley-estates','Valley estates','Sheltered ground, water, and a long outlook.',28),
  ('Mountains & Nature','eco-retreats','Eco-retreats','Low-impact building on land kept as it was.',29),

  ('Land & Agricultural Estates','orchards','Orchards','Planted, bearing, and already earning.',31),
  ('Land & Agricultural Estates','mango-farms','Mango farms','Mature groves with an established yield.',32),
  ('Land & Agricultural Estates','coconut-plantations','Coconut plantations','Long-cycle planting on settled land.',33),
  ('Land & Agricultural Estates','vineyards','Vineyards','Trellised acreage, and the shed that serves it.',34),
  ('Land & Agricultural Estates','coffee-plantations','Coffee plantations','Held as an agricultural asset rather than a home.',35),
  ('Land & Agricultural Estates','tea-plantations','Tea plantations','Estate-scale, with labour and infrastructure in place.',36),
  ('Land & Agricultural Estates','agricultural-estates','Agricultural estates','Farmland at a size that needs managing.',37),
  ('Land & Agricultural Estates','farmhouses','Farmhouses','A house on land that is genuinely farmed.',38),
  ('Land & Agricultural Estates','horse-farms','Horse farms','Stabling, paddock and pasture already built.',39),
  ('Land & Agricultural Estates','large-private-landholdings','Large private landholdings','Whole parcels, sold entire.',40),
  ('Land & Agricultural Estates','managed-farmland','Managed farmland','Owned by you, run by somebody else.',41),
  ('Land & Agricultural Estates','estate-development-opportunities','Estate development opportunities','Land bought for what it could become.',42),

  ('Exceptional Residences','luxury-villas','Luxury villas','Finished, furnished where asked, ready to occupy.',51),
  ('Exceptional Residences','mansions','Mansions','Scale that is the point rather than a by-product.',52),
  ('Exceptional Residences','penthouses','Penthouses','The top of a building, taken whole.',53),
  ('Exceptional Residences','sky-villas','Sky villas','A house''s footprint, several hundred feet up.',54),
  ('Exceptional Residences','private-compounds','Private compounds','More than one building behind one wall.',55),
  ('Exceptional Residences','gated-estates','Gated estates','Privacy managed at the entrance, not the door.',56),
  ('Exceptional Residences','golf-course-residences','Golf-course residences','Fairway frontage and the access that comes with it.',57),
  ('Exceptional Residences','marina-residences','Marina residences','A berth and a home, held together.',58),
  ('Exceptional Residences','architectural-homes','Architectural homes','Designed by someone whose name is on it.',59),
  ('Exceptional Residences','designer-residences','Designer residences','Interiors commissioned rather than fitted.',60),

  ('Heritage India','heritage-homes','Heritage homes','Old houses that were never allowed to fall.',61),
  ('Heritage India','havelis','Havelis','Courtyard mansions of the north and west.',62),
  ('Heritage India','colonial-bungalows','Colonial bungalows','Deep verandahs, high ceilings, mature grounds.',63),
  ('Heritage India','chettinad-mansions','Chettinad mansions','Burma teak, Athangudi tile, and enormous rooms.',64),
  ('Heritage India','plantation-bungalows','Plantation bungalows','The planter''s house, still on its estate.',65),
  ('Heritage India','historic-estates','Historic estates','Land and buildings with a documented past.',66),
  ('Heritage India','palace-style-residences','Palace-style residences','Built for ceremony, held privately since.',67),
  ('Heritage India','restored-ancestral-homes','Restored ancestral homes','Brought back rather than rebuilt.',68),
  ('Heritage India','traditional-courtyard-homes','Traditional courtyard homes','Nalukettu, rajbari, wada — the plan India kept.',69),
  ('Heritage India','culturally-significant-properties','Rare culturally significant properties','Rare enough that the sale is a private matter.',70),

  ('Hospitality & Investment Assets','boutique-hotels','Boutique hotels','Small keys, strong identity, running books.',81),
  ('Hospitality & Investment Assets','resorts','Resorts','Land, keys and facilities as one asset.',82),
  ('Hospitality & Investment Assets','wellness-retreats','Wellness retreats','Built around a programme, not just a view.',83),
  ('Hospitality & Investment Assets','luxury-homestays','Luxury homestays','A private house that already takes guests.',84),
  ('Hospitality & Investment Assets','private-clubs','Private clubs','Membership, premises and licence together.',85),
  ('Hospitality & Investment Assets','wedding-destinations','Wedding destinations','Grounds, keys and kitchens at event scale.',86),
  ('Hospitality & Investment Assets','glamping-estates','Glamping estates','Light structures on land that stays land.',87),
  ('Hospitality & Investment Assets','eco-resorts','Eco-resorts','Hospitality with the site left largely intact.',88),
  ('Hospitality & Investment Assets','serviced-residence-portfolios','Serviced residence portfolios','Several units, one operating agreement.',89),
  ('Hospitality & Investment Assets','hospitality-development-land','Hospitality development land','Zoned and sited for keys that do not exist yet.',90),

  ('Rare Commercial Assets','landmark-commercial-buildings','Landmark commercial buildings','Named buildings, sold quietly.',91),
  ('Rare Commercial Assets','premium-office-floors','Premium office floors','Whole floors in addresses that are hard to enter.',92),
  ('Rare Commercial Assets','trophy-retail-assets','Trophy retail assets','Frontage that cannot be replicated.',93),
  ('Rare Commercial Assets','private-warehouses','Private warehouses','Clear span, height and a road that takes trucks.',94),
  ('Rare Commercial Assets','industrial-estates','Industrial estates','Power, effluent and approvals already in place.',95),
  ('Rare Commercial Assets','income-generating-properties','Income-generating properties','Bought for the tenant as much as the building.',96),
  ('Rare Commercial Assets','institutional-grade-real-estate','Institutional-grade real estate','Sized and papered for a fund to underwrite.',97)
on conflict (slug) do nothing;

-- -------------------------------------------------------- destinations -----
-- §17. A register of where The Vault works, not a claim of inventory in each.

insert into vault_destinations (slug, name, tagline, region, sort) values
  ('goa','Goa','Coastal homes & private retreats','West coast',10),
  ('nilgiris','Nilgiris','Mountain estates & heritage homes','Tamil Nadu',20),
  ('coorg','Coorg','Coffee estates & plantation living','Karnataka',30),
  ('kerala','Kerala','Waterfront homes & tropical estates','Kerala',40),
  ('rajasthan','Rajasthan','Heritage residences & historic estates','North-west',50),
  ('alibaug','Alibaug','Private coastal residences','Maharashtra',60),
  ('lonavala','Lonavala','Weekend estates','Maharashtra',70),
  ('bengaluru','Bengaluru','Premium residences & surrounding estates','Karnataka',80),
  ('chennai-ecr','Chennai & ECR','Beachfront and coastal residences','Tamil Nadu',90),
  ('puducherry','Puducherry','Heritage and coastal homes','Tamil Nadu',100),
  ('himachal-pradesh','Himachal Pradesh','Mountain homes and retreats','Himalaya',110),
  ('uttarakhand','Uttarakhand','Himalayan estates and cabins','Himalaya',120)
on conflict (slug) do nothing;

-- ------------------------------------------------------------- copy --------
-- §19 — the hero, the standing lines and the legal notices, all editable in the
-- console. The website treats every one of these as optional and ships a
-- fallback, so deleting a row degrades the page rather than breaking it.

insert into vault_settings (key, value, is_public) values
  ('hero', jsonb_build_object(
     'eyebrow', 'Jamin Bazaar',
     'title',   'The Vault',
     'lead',    'Exceptional properties. Private opportunities. Personally handled.',
     'note',    'Private real estate and exceptional assets for a select clientele.'
   ), true),

  -- §14 — discretion stated quietly. ⚠️ The brief bans "only for billionaires",
  -- "VIP luxury", "ultimate luxury lifestyle" and anything in that register.
  -- These lines are the whole permitted vocabulary; add to them in that voice.
  ('promise', jsonb_build_array(
     'Private enquiries. Personal attention.',
     'Some properties are never publicly listed.',
     'For requirements beyond the ordinary.',
     'Exceptional property deserves a quieter conversation.',
     'Private opportunities, personally handled.'
   ), true),

  ('faq', jsonb_build_array(
     jsonb_build_object(
       'q','Do I have to browse listings?',
       'a','No. The Vault works the other way round. Tell us what you are looking for — location, landscape, acreage, budget, intended use — and a representative takes it from there. Most of what we handle is not published anywhere.'),
     jsonb_build_object(
       'q','Will my enquiry be public?',
       'a','No. Requirements sent to The Vault are never displayed, never listed and never shared with other clients. They are read by the Vault desk and nobody else.'),
     jsonb_build_object(
       'q','I own a property but do not want it advertised.',
       'a','Mark it off-market when you offer it. An off-market property never appears in the public Vault; it is held privately and matched by hand against qualified requirements.'),
     jsonb_build_object(
       'q','Is a property in The Vault legally verified?',
       'a','Only where we say so, and only for the checks we have actually completed. A property that an owner has documented is not the same as a property Jamin has reviewed, and the two are never presented as if they were.'),
     jsonb_build_object(
       'q','Can you help with agricultural land, heritage or coastal property?',
       'a','Yes, and those are exactly the categories where eligibility matters most. Ownership, land-use, development and transaction rules vary by state, by buyer status and by how the property is classified. We will tell you what applies before you commit to anything.')
   ), true),

  ('legal', jsonb_build_object(
     'intro',      'Property information in The Vault is provided by owners and is presented for discussion, not as a representation of fact.',
     'restricted', 'Agricultural land, heritage property, coastal land, forest-adjacent land and certain other categories carry restrictions on who may buy, what may be built and how a transaction may be structured. These vary by state, by the buyer''s status and by the classification of the property itself. Eligibility is confirmed before a transaction, never assumed.',
     'verification','Jamin Bazaar does not describe an asset as legally verified because an owner uploaded documents. Where a property is marked Vault Verified, that refers only to the checks Jamin has completed and named.',
     'privacy',    'Enquiries, requirements, owner submissions and uploaded documents are held privately for the purpose of handling your request. They are not published, not listed and not sold.'
   ), true)
on conflict (key) do nothing;

commit;
