-- Demo data for testing. Safe to run once on a fresh database.
-- Venue coordinates are a placeholder in Lower Parel, Mumbai: change them
-- to the real bar's location (Google Maps, right-click, copy coordinates).

insert into public.themes (id, name, bg_type, bg_value, primary_color, secondary_color, text_color, surface_color, sponsor_name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Floodlight', 'gradient',
   'radial-gradient(circle at 50% -10%, #1F5257 0%, #0C2427 45%, #071517 100%)', '#FFB020', '#7FE0C8', '#F3F1E8', '#123236', null),
  ('00000000-0000-0000-0000-0000000000a2', 'Sponsor Red', 'gradient',
   'linear-gradient(160deg, #7F1D1D 0%, #111111 70%)', '#EF4444', '#FDE68A', '#FFFFFF', '#1F1414', 'Demo Sponsor');

insert into public.venues (id, name, slug, address, city, location, geofence_radius_m, default_theme_id)
values ('00000000-0000-0000-0000-0000000000b1', 'The Demo Dugout', 'demo-dugout',
        'Lower Parel', 'Mumbai',
        extensions.st_setsrid(extensions.st_makepoint(72.8258, 18.9937), 4326)::extensions.geography,
        150, '00000000-0000-0000-0000-0000000000a1');

insert into public.matches (id, title, sport, starts_at, status, theme_id)
values ('00000000-0000-0000-0000-0000000000c1', 'MI vs CSK', 'cricket', now(), 'live',
        '00000000-0000-0000-0000-0000000000a1');

insert into public.coupon_buckets (id, brand_name, title, description, terms, is_alcohol, min_age, code_mode, total_quantity)
values
  ('00000000-0000-0000-0000-0000000000d1', 'The Demo Dugout', '20% off your food bill',
   'Show this code to your server.', 'Valid tonight only. One per table.', false, 21, 'unique', 50),
  ('00000000-0000-0000-0000-0000000000d2', 'Demo Brand', 'Flat ₹200 off your first order',
   'Opens the brand website.', 'New users only.', false, 21, 'static', null),
  ('00000000-0000-0000-0000-0000000000d3', 'The Demo Dugout', 'Free pint of beer',
   'Show this code at the bar.', 'ID may be checked.', true, 21, 'unique', 20);

insert into public.coupon_bucket_secrets (bucket_id, affiliate_url, static_code)
values
  ('00000000-0000-0000-0000-0000000000d1', null, null),
  ('00000000-0000-0000-0000-0000000000d2', 'https://example.com/?ref=matchday', 'MATCHDAY200'),
  ('00000000-0000-0000-0000-0000000000d3', null, null);

insert into public.questions (match_id, prompt, options, points, coupon_bucket_id, answer_window_s)
values
  ('00000000-0000-0000-0000-0000000000c1', 'Will the next over go for 10+ runs?', '{Yes,No}', 10,
   '00000000-0000-0000-0000-0000000000d1', 30),
  ('00000000-0000-0000-0000-0000000000c1', 'How will the next wicket fall?', '{Caught,Bowled,LBW,Run out,Other}', 25,
   '00000000-0000-0000-0000-0000000000d2', 45);

insert into public.banners (title, subtitle, sort_order)
values ('Happy hour till 9 PM', '2 for 1 on mocktails at the bar', 1);
