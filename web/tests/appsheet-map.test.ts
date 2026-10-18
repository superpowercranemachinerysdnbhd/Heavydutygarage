import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMachineType, looksLikePlate, partCategory, teamRole, woCategory, woPriority, woStatus } from "../src/lib/appsheet-map";

test("machine types from make and model", () => {
  assert.equal(guessMachineType("KATO", "KR25H-V6", "BPN 8918"), "rough_terrain_crane");
  assert.equal(guessMachineType("TADANO", "GR600-N1", "JYR 2138"), "rough_terrain_crane");
  assert.equal(guessMachineType("KATO", "KA1300SL", "VAV 5711"), "all_terrain_crane");
  assert.equal(guessMachineType("TADANO", "TL500M3", "VHX 8292"), "truck_crane");
  assert.equal(guessMachineType("KATO", "NK250-2", "BMV 8865"), "truck_crane");
  assert.equal(guessMachineType("Hino", "Aichi Sk27a", "MED 2138"), "skylift");
  assert.equal(guessMachineType("Palfinger", "PK62002", "JWW 3688"), "lorry_crane");
  assert.equal(guessMachineType("TOYOTA", "HILUX 2.8", "PATRIOT 2638"), "car");
  assert.equal(guessMachineType("", "", "Toyota Forklift 3T (3)"), "forklift");
  assert.equal(guessMachineType("KATO", "", "JVY 2138"), "truck_crane");
  assert.equal(guessMachineType("IVECO", "", "BQB 9319"), "lorry");
  assert.equal(guessMachineType("", "", "NDH 3921"), "other");
});

test("plates", () => {
  for (const p of ["VHX 8292", "SK 9920F", "WD302F", "PATRIOT 2638"]) assert.ok(looksLikePlate(p), p);
  assert.ok(!looksLikePlate("Toyota Forklift 3T (3)"));
  assert.ok(!looksLikePlate("Customer"));
});

test("work order values", () => {
  assert.equal(woCategory("MT-CORRECTIVE (EMERGENCY) , MT-MINOR REPAIR"), "EMG");
  assert.equal(woCategory("MT-STATUTORY"), "STATUTORY");
  assert.equal(woCategory(""), "MINOR");
  assert.equal(woPriority("MEDIUM"), "normal");
  assert.deepEqual(woStatus("Cancelled", false), { status: "closed", cancelled: true });
  assert.equal(woStatus("On-Hold (Pending Parts)", false).status, "awaiting_parts");
  assert.equal(woStatus("Pending Inspection", false).status, "in_progress");
  assert.equal(woStatus("", true).status, "closed");
});

test("part categories and roles", () => {
  assert.equal(partCategory("Engine: Filter"), "Filters (oil, fuel, air, hydraulic)");
  assert.equal(partCategory("Hydraulic: Seal Kits"), "Hydraulic seals & seal kits");
  assert.equal(partCategory("Fluids: Gear & Coolant"), "Coolant & fluids");
  assert.equal(partCategory("Chasis: Tires & Rims & Tubes"), "Tyres & wheels");
  assert.equal(teamRole("Mechanic Assistance"), "assistant");
  assert.equal(teamRole("Welder & Fabrication"), "fabricator");
  assert.equal(teamRole("Tayar & Spray Painter"), "painter");
});
