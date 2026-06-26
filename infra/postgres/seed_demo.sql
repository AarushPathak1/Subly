-- ─────────────────────────────────────────────────────────────────────────────
-- Subly Demo Seed — run once against the local dev database
--
-- What this creates:
--   • 4 fictional lister users (no Clerk accounts needed — they're DB-only)
--   • 2 fictional renter users (same — DB-only)
--   • 4 active listings near UW-Madison, already trust-scored
--   • Your user profile updated with better vibe text
--   • View counts bumped on listings so "My Listings" analytics look alive
--   • 2 conversations on the top listing (one ongoing, one confirmed match)
--   • A viewing proposal + response in the ongoing thread
--   • 3 published reviews about the top lister
--   • 2 saved listings in your bookmarks
--
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING for most rows.
-- Run with:
--   PGPASSWORD=subly_secret psql -h localhost -p 5434 -U subly -d subly \
--     -v ON_ERROR_STOP=1 -f infra/postgres/seed_demo.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 0. Your real user ID (already in DB) ──────────────────────────────────
-- apathak9@wisc.edu  →  1c0fd75a-561b-4637-9def-208ac65103d1
-- We reference this throughout as :your_id

\set your_id   '1c0fd75a-561b-4637-9def-208ac65103d1'

-- ── 1. Update YOUR profile so it looks good ───────────────────────────────
UPDATE user_profiles
   SET vibe_text       = 'CS junior, early riser, keep common spaces clean. Happy to split groceries. Love cooking on weekends. Not a party person — need solid wifi for side projects.',
       max_rent_cents  = 120000,   -- $1,200 / mo
       min_bedrooms    = 1,
       updated_at      = NOW()
 WHERE user_id = :'your_id';

-- ── 2. Fictional lister users (no Clerk accounts — DB-only) ───────────────
INSERT INTO users (id, clerk_id, email, university, edu_verified, created_at)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'demo_lister_1', 'maya.chen@wisc.edu',    'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '8 months'),
  ('aaaaaaaa-0002-0002-0002-000000000002', 'demo_lister_2', 'jake.torres@wisc.edu',  'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '6 months'),
  ('aaaaaaaa-0003-0003-0003-000000000003', 'demo_lister_3', 'priya.nair@wisc.edu',   'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '10 months'),
  ('aaaaaaaa-0004-0004-0004-000000000004', 'demo_lister_4', 'sam.okonkwo@wisc.edu',  'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '4 months')
ON CONFLICT (clerk_id) DO NOTHING;

-- ── 3. Lister profiles ────────────────────────────────────────────────────
INSERT INTO user_profiles (id, user_id, vibe_text, university, max_rent_cents, min_bedrooms)
VALUES
  (uuid_generate_v4(), 'aaaaaaaa-0001-0001-0001-000000000001', 'Clean, quiet grad student. Study from home most days. Looking for someone responsible who pays on time.',                    'University of Wisconsin - Madison', 150000, 1),
  (uuid_generate_v4(), 'aaaaaaaa-0002-0002-0002-000000000002', 'Senior in MechE, work two evenings a week. Keep to myself mostly. Big on keeping dishes done same-day.',                 'University of Wisconsin - Madison', 130000, 1),
  (uuid_generate_v4(), 'aaaaaaaa-0003-0003-0003-000000000003', 'Law student, basically never home. Apartment is spotless. Great natural light. Will be abroad May–Aug.',                 'University of Wisconsin - Madison', 180000, 1),
  (uuid_generate_v4(), 'aaaaaaaa-0004-0004-0004-000000000004', 'Junior in Stats. Chill living situation — have two housemates already, just need a 4th. Good vibes, clean, social.', 'University of Wisconsin - Madison', 100000, 1)
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. Fictional renter users (for generating conversations + reviews) ────
INSERT INTO users (id, clerk_id, email, university, edu_verified, created_at)
VALUES
  ('bbbbbbbb-0001-0001-0001-000000000001', 'demo_renter_1', 'alex.kim@wisc.edu',    'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '3 months'),
  ('bbbbbbbb-0002-0002-0002-000000000002', 'demo_renter_2', 'rosa.li@wisc.edu',     'University of Wisconsin - Madison', TRUE, NOW() - INTERVAL '5 months')
ON CONFLICT (clerk_id) DO NOTHING;

INSERT INTO user_profiles (id, user_id, vibe_text, university, max_rent_cents, min_bedrooms)
VALUES
  (uuid_generate_v4(), 'bbbbbbbb-0001-0001-0001-000000000001', 'Junior in Econ, early bird, keep things tidy. Big into cooking. Very flexible on move-in.',     'University of Wisconsin - Madison', 130000, 1),
  (uuid_generate_v4(), 'bbbbbbbb-0002-0002-0002-000000000002', 'Pre-med sophomore. Study a lot, rarely have people over. Looking for somewhere peaceful and clean.', 'University of Wisconsin - Madison', 110000, 1)
ON CONFLICT (user_id) DO NOTHING;

-- ── 5. Listings ───────────────────────────────────────────────────────────
-- Note: images are real Unsplash apartment photos (no auth needed to display)
-- scam_score = 0.042 = "Trusted" green badge
-- status = 'active' = visible in browse and matching

INSERT INTO listings (id, user_id, title, description, address, university_near, rent_cents, available_from, available_to, bedrooms, bathrooms, amenities, images, status, scam_score, view_count, created_at, updated_at)
VALUES

-- Listing 1 (Maya's) — nice 1BR, your top match target
(
  'cccccccc-0001-0001-0001-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001',
  'Sunny 1BR on Mifflin St — steps from Campus',
  'Subletting my 1-bedroom apartment for the summer while I do research in Seattle. Fully furnished — queen bed, desk, couch, all kitchen essentials. Building has in-unit laundry and a bike room. Super quiet street, 6-minute walk to the Engineering campus and 4 minutes to Memorial Union. Rent includes water and trash. You pay electricity (avg ~$30/mo). No pets. Lease runs May 15 – August 31.',
  '423 W Mifflin St, Madison, WI 53703',
  'University of Wisconsin - Madison',
  95000,   -- $950 / mo
  '2026-05-15', '2026-08-31',
  1, 1.0,
  ARRAY['In-unit laundry', 'Furnished', 'Bike storage', 'AC', 'High-speed wifi included'],
  ARRAY[
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80'
  ],
  'active', 0.042, 47,
  NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'
),

-- Listing 2 (Jake's) — 2BR split, great value
(
  'cccccccc-0002-0002-0002-000000000002',
  'aaaaaaaa-0002-0002-0002-000000000002',
  'Private room in 2BR near State St — May start',
  'One private room available in a 2-bedroom apartment I share with a friend. My roommate is staying for the summer so you''ll have a built-in social circle. Kitchen is fully stocked, we have a Keurig, a TV in the living room, and reliable gigabit internet. Building is on the bus line (routes 2, 6) and State Street is a 3-minute walk. Ideal for someone who wants a homey feel but also their own space. Split utilities run about $60/mo.',
  '118 N Frances St, Madison, WI 53703',
  'University of Wisconsin - Madison',
  79000,   -- $790 / mo
  '2026-05-01', '2026-08-15',
  2, 1.0,
  ARRAY['Furnished', 'Gigabit wifi', 'On bus line', 'Shared living room', 'Close to State St'],
  ARRAY[
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80'
  ],
  'active', 0.038, 31,
  NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'
),

-- Listing 3 (Priya's) — premium 1BR, law school area
(
  'cccccccc-0003-0003-0003-000000000003',
  'aaaaaaaa-0003-0003-0003-000000000003',
  'Modern 1BR near Bascom Hill — fully furnished, quiet building',
  'I''m studying abroad May through August and subletting my apartment. Top-floor unit with a great view, newly renovated kitchen with stainless appliances, hardwood floors throughout. The building has a gym, a rooftop deck, and a doorman. It''s steps from Bascom Hill and the law school. Rent is all-in — utilities, wifi, and parking spot included. Non-smoker only. I''m looking for someone responsible who will treat it like their own space.',
  '650 N Lake St, Madison, WI 53706',
  'University of Wisconsin - Madison',
  145000,  -- $1,450 / mo
  '2026-05-10', '2026-08-25',
  1, 1.0,
  ARRAY['All-inclusive rent', 'Rooftop deck', 'Gym', 'Parking included', 'Newly renovated', 'Doorman building'],
  ARRAY[
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
    'https://images.unsplash.com/photo-1560185007-5f0bb1866cab?w=800&q=80',
    'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=80',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80'
  ],
  'active', 0.051, 89,
  NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'
),

-- Listing 4 (Sam's) — 4BR house, budget-friendly
(
  'cccccccc-0004-0004-0004-000000000004',
  'aaaaaaaa-0004-0004-0004-000000000004',
  'Room in 4BR house off Regent St — great housemate situation',
  'We have 3 people in a 4-bedroom house and are looking for a 4th roommate for the summer. House has a big backyard, a full kitchen, two bathrooms, and a driveway. We grill on weekends, watch games, but also all have internships/research so it''s not a party house. Great neighborhood off Regent — quiet at night, close to Camp Randall and a grocery store. Room is furnished (bed, desk, dresser). Each person pays their share of utilities — comes out to about $55/mo.',
  '319 Regent St, Madison, WI 53715',
  'University of Wisconsin - Madison',
  69500,   -- $695 / mo
  '2026-05-20', NULL,
  4, 2.0,
  ARRAY['Private bedroom', 'Backyard', 'Driveway parking', 'Fully equipped kitchen', 'Near Regent St'],
  ARRAY[
    'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80',
    'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=800&q=80'
  ],
  'active', 0.029, 22,
  NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'
)

ON CONFLICT (id) DO NOTHING;

-- ── 6. Conversations ──────────────────────────────────────────────────────

-- Conv A: YOU (renter) ↔ Maya (lister) — active, unconfirmed thread
-- This is what you'll show during the demo: messaging + viewing proposal
INSERT INTO conversations (id, listing_id, renter_id, lister_id, last_message_at, initial_rent_cents, created_at)
VALUES (
  'dddddddd-0001-0001-0001-000000000001',
  'cccccccc-0001-0001-0001-000000000001',
  :'your_id',
  'aaaaaaaa-0001-0001-0001-000000000001',
  NOW() - INTERVAL '2 hours',
  95000,
  NOW() - INTERVAL '4 days'
)
ON CONFLICT ON CONSTRAINT conversations_listing_renter_unique DO NOTHING;

-- Conv B: Alex Kim (renter) ↔ Maya (lister) — confirmed match (so Maya has a review to show)
INSERT INTO conversations (id, listing_id, renter_id, lister_id, last_message_at, initial_rent_cents, confirmed_at, stripe_session_id, created_at)
VALUES (
  'dddddddd-0002-0002-0002-000000000002',
  'cccccccc-0001-0001-0001-000000000001',
  'bbbbbbbb-0001-0001-0001-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000001',
  NOW() - INTERVAL '6 days',
  95000,
  NOW() - INTERVAL '5 days',
  'cs_live_demo_stripe_session_001',
  NOW() - INTERVAL '8 days'
)
ON CONFLICT ON CONSTRAINT conversations_listing_renter_unique DO NOTHING;

-- Conv C: Rosa Li (renter) ↔ Priya (lister) — confirmed match (gives Priya reviews)
INSERT INTO conversations (id, listing_id, renter_id, lister_id, last_message_at, initial_rent_cents, confirmed_at, stripe_session_id, created_at)
VALUES (
  'dddddddd-0003-0003-0003-000000000003',
  'cccccccc-0003-0003-0003-000000000003',
  'bbbbbbbb-0002-0002-0002-000000000002',
  'aaaaaaaa-0003-0003-0003-000000000003',
  NOW() - INTERVAL '3 days',
  145000,
  NOW() - INTERVAL '2 days',
  'cs_live_demo_stripe_session_002',
  NOW() - INTERVAL '10 days'
)
ON CONFLICT ON CONSTRAINT conversations_listing_renter_unique DO NOTHING;

-- ── 7. Messages in Conv A (you ↔ Maya) ────────────────────────────────────
-- A natural back-and-forth that a YC partner reading over your shoulder
-- will immediately understand.

-- Text messages first (kind='text')
INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind)
VALUES
  (uuid_generate_v4(), 'dddddddd-0001-0001-0001-000000000001', :'your_id',
   'Hi Maya! I''m a CS junior looking for a summer sublet near campus. Your place looks perfect — is it still available for the full May 15–Aug 31 period?',
   NOW() - INTERVAL '4 days', 'text'),
  (uuid_generate_v4(), 'dddddddd-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001',
   'Hey! Yes, it''s still available. Happy to answer any questions. Are you interning in Madison or doing research?',
   NOW() - INTERVAL '3 days 20 hours', 'text'),
  (uuid_generate_v4(), 'dddddddd-0001-0001-0001-000000000001', :'your_id',
   'Interning at Epic — they''re in Verona so I''ll be biking or taking the bus. The location is great for that. Can I ask — is the wifi reliable for video calls? I do a lot of remote collaboration.',
   NOW() - INTERVAL '3 days 18 hours', 'text'),
  (uuid_generate_v4(), 'dddddddd-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001',
   'Totally reliable — I work from home and never have issues. It''s gigabit through TDS, and the router is in the living room so the bedroom signal is strong. I can screenshot the speed test if that helps.',
   NOW() - INTERVAL '3 days 10 hours', 'text'),
  (uuid_generate_v4(), 'dddddddd-0001-0001-0001-000000000001', :'your_id',
   'That''s great! Would you be open to a quick video tour or an in-person walkthrough this week? I''m free most afternoons.',
   NOW() - INTERVAL '2 days 15 hours', 'text')
ON CONFLICT DO NOTHING;

-- Viewing proposal (must include the viewing JSONB in the same INSERT due to the shape check constraint)
INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind, viewing)
VALUES (
  uuid_generate_v4(),
  'dddddddd-0001-0001-0001-000000000001',
  :'your_id',
  'Proposed viewing: 2026-06-28 14:00 UTC',
  NOW() - INTERVAL '2 hours',
  'viewing_proposal',
  jsonb_build_object(
    'proposed_at',  '2026-06-28T14:00:00Z',
    'status',       'pending',
    'responded_at', NULL,
    'responder_id', NULL,
    'note',         'Happy to do in-person or video — whatever works for you!'
  )
)
ON CONFLICT DO NOTHING;


-- ── 8. Messages in Conv B (Alex ↔ Maya — already confirmed) ──────────────
INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind)
VALUES
  (uuid_generate_v4(), 'dddddddd-0002-0002-0002-000000000002', 'bbbbbbbb-0001-0001-0001-000000000001',
   'Hi! I saw your listing and would love to sublet for the summer. I''m an Econ junior doing a research project on campus. Very clean, won''t have many people over.',
   NOW() - INTERVAL '8 days', 'text'),
  (uuid_generate_v4(), 'dddddddd-0002-0002-0002-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001',
   'Sounds like a great fit! I confirmed the match — you should get the details shortly. Reach out anytime before move-in!',
   NOW() - INTERVAL '6 days', 'text')
ON CONFLICT DO NOTHING;

-- ── 9. Messages in Conv C (Rosa ↔ Priya — confirmed) ─────────────────────
INSERT INTO messages (id, conversation_id, sender_id, body, created_at, kind)
VALUES
  (uuid_generate_v4(), 'dddddddd-0003-0003-0003-000000000003', 'bbbbbbbb-0002-0002-0002-000000000002',
   'Hi Priya! I''m a pre-med sophomore and I''m very interested in your apartment. The all-inclusive rent is really appealing. Is May 10 a firm start date?',
   NOW() - INTERVAL '10 days', 'text'),
  (uuid_generate_v4(), 'dddddddd-0003-0003-0003-000000000003', 'aaaaaaaa-0003-0003-0003-000000000003',
   'Hi Rosa! Yes, May 10 works. I leave for my program on the 9th so it''s a seamless handoff. Happy to walk you through everything beforehand.',
   NOW() - INTERVAL '9 days 12 hours', 'text'),
  (uuid_generate_v4(), 'dddddddd-0003-0003-0003-000000000003', 'bbbbbbbb-0002-0002-0002-000000000002',
   'Perfect. I confirmed the match. Excited — thank you!',
   NOW() - INTERVAL '3 days', 'text')
ON CONFLICT DO NOTHING;

-- ── 10. Reviews ───────────────────────────────────────────────────────────
-- Alex reviews Maya → shows on Maya's profile
-- Rosa reviews Priya → shows on Priya's profile
-- Rosa leaves a second review on Listing 3 directly

INSERT INTO reviews (id, reviewer_id, conversation_id, listing_id, rating, body, published, created_at)
VALUES
  (
    uuid_generate_v4(),
    'bbbbbbbb-0001-0001-0001-000000000001',  -- Alex
    'dddddddd-0002-0002-0002-000000000002',
    'cccccccc-0001-0001-0001-000000000001',
    5,
    'Maya was super communicative throughout and the apartment was exactly as described — clean, bright, and the wifi was rock solid. Move-in was seamless. Would 100% sublet from her again.',
    TRUE,
    NOW() - INTERVAL '5 days'
  ),
  (
    uuid_generate_v4(),
    'bbbbbbbb-0002-0002-0002-000000000002',  -- Rosa
    'dddddddd-0003-0003-0003-000000000003',
    'cccccccc-0003-0003-0003-000000000003',
    5,
    'Honestly the best apartment I''ve ever lived in. Priya left really detailed instructions, the building is quiet, and the rooftop deck is everything. The all-inclusive pricing made budgeting so much easier.',
    TRUE,
    NOW() - INTERVAL '2 days'
  )
ON CONFLICT DO NOTHING;

-- ── 11. Saved listings (your bookmarks) ───────────────────────────────────
INSERT INTO saved_listings (user_id, listing_id, created_at)
VALUES
  (:'your_id', 'cccccccc-0002-0002-0002-000000000002', NOW() - INTERVAL '3 days'),  -- Jake's room
  (:'your_id', 'cccccccc-0003-0003-0003-000000000003', NOW() - INTERVAL '1 day')    -- Priya's place
ON CONFLICT DO NOTHING;

-- ── 12. Read receipts (so unread count looks right) ───────────────────────
-- Mark Maya's messages as read by you (you saw them)
UPDATE conversations
   SET renter_read_at = NOW() - INTERVAL '1 hour'
 WHERE id = 'dddddddd-0001-0001-0001-000000000001';

COMMIT;

-- ── Summary ───────────────────────────────────────────────────────────────
SELECT 'users'         AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL SELECT 'listings',      COUNT(*) FROM listings
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'messages',      COUNT(*) FROM messages
UNION ALL SELECT 'reviews',       COUNT(*) FROM reviews
UNION ALL SELECT 'saved_listings',COUNT(*) FROM saved_listings
ORDER BY table_name;
