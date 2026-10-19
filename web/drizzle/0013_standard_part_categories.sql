-- Standard part categories for a new workshop (only when there are none yet).
INSERT INTO "part_categories" ("name", "markup_pct")
SELECT v.name, v.markup FROM (VALUES
  ('Filters (oil, fuel, air, hydraulic)', 40),
  ('Oils, grease & lubricants', 35),
  ('Coolant & fluids', 35),
  ('Hydraulic seals & seal kits', 40),
  ('Hydraulic hoses & fittings', 50),
  ('Hydraulic pumps, motors & valves', 30),
  ('Hydraulic cylinders & parts', 35),
  ('Engine parts', 35),
  ('Transmission & drivetrain', 35),
  ('Differential & axle parts', 35),
  ('Brake parts', 40),
  ('Electrical, sensors & switches', 45),
  ('Batteries', 30),
  ('Lights & lamps', 45),
  ('Crane parts (wire rope, hook, sheaves, limit switches)', 35),
  ('Undercarriage & tracks', 30),
  ('Ground engaging tools (teeth, cutting edges)', 40),
  ('Tyres & wheels', 25),
  ('Bearings & bushes', 40),
  ('Bolts, nuts & fasteners', 60),
  ('Air-con parts', 40),
  ('Cabin & body parts', 35),
  ('Welding & fabrication materials', 35),
  ('Paint', 35),
  ('Workshop consumables', 40)
) AS v(name, markup)
WHERE NOT EXISTS (SELECT 1 FROM "part_categories");
