import test from "node:test";
import assert from "node:assert/strict";
import { createAscent, stepAscent, fuelGate, asteroidField, FUEL_BONUS, GATE_SPACING } from "../assets/js/rocket-ascent.mjs";
import { clamp } from "../assets/js/rocket-model.mjs";

function fly(pilot, initial = createAscent(), dt = 1 / 120, limit = 180) {
  let flight = initial;
  for (let i = 0; i < limit / dt && !flight.contact; i++) flight = stepAscent(flight, pilot(flight), dt);
  return flight;
}
test("the rocket waits on the pad, and thrust launches it", () => {
  const parked = fly(() => ({}), createAscent(), 1 / 120, 2);
  assert.equal(parked.y, 0); assert.equal(parked.fuel, 100); assert.equal(parked.contact, null);
  const launched = fly(() => ({ thrust: true }), createAscent(), 1 / 120, 2);
  assert.ok(launched.y > 10); assert.ok(launched.vy > 8); assert.ok(launched.fuel < 90);
});
test("continuous thrust eventually overheats; releasing cools the engine", () => {
  let flight = { ...createAscent(), x: 35, z: 35 }, overheated = false;
  for (let i = 0; i < 120 * 8; i++) { flight = stepAscent(flight, { thrust: true }); if (flight.event === "overheat") { overheated = true; break; } }
  assert.equal(overheated, true); assert.ok(flight.cooldown > 1);
  const hot = flight.heat;
  for (let i = 0; i < 120; i++) flight = stepAscent(flight, {});
  assert.ok(flight.heat < hot - 30); assert.ok(flight.throttle < .01);
});
test("a fuel ring restores fuel and cooling once, and an off-centre pass misses it", () => {
  const gate = fuelGate(0), aligned = { ...createAscent(), x: gate.x, y: gate.y - 3, z: gate.z, fuel: 40, heat: 60 };
  const collected = stepAscent(aligned, {});
  assert.equal(collected.pickups, 1); assert.equal(collected.nextGate, 1); assert.equal(collected.fuel, 40 + FUEL_BONUS); assert.ok(collected.heat < 35);
  assert.equal(stepAscent(collected, {}).pickups, 1);
  const miss = stepAscent({ ...aligned, x: gate.x + 20, y: gate.y + 9 }, {});
  assert.equal(miss.pickups, 0); assert.equal(miss.nextGate, 1); assert.equal(miss.event, "missed");
});
test("collisions damage the hull and fuel, with a grace period between hits", () => {
  const rock = asteroidField(141, 0)[0];
  const near = { ...createAscent(), x: rock.x, y: rock.y - 4, z: rock.z, maxAltitude: rock.y - 4 };
  const hit = stepAscent(near, {});
  assert.equal(hit.hull, 2); assert.equal(hit.event, "hit"); assert.ok(hit.fuel <= 86); assert.ok(hit.invincible > 1);
  assert.equal(stepAscent(hit, {}).hull, 2);
  const last = stepAscent({ ...near, hull: 1 }, {});
  assert.equal(last.hull, 0); assert.ok(last.contact); assert.match(last.contact.reason, /隕石/);
});
test("running out of fuel ends at the highest point and preserves the distance record", () => {
  const flight = fly(() => ({ thrust: true }));
  assert.ok(flight.contact); assert.equal(flight.fuel, 0); assert.ok(flight.vy <= 0);
  assert.ok(flight.maxAltitude > 300); assert.equal(flight.contact.score, Math.floor(flight.maxAltitude));
  assert.equal(stepAscent(flight, { thrust: true }), flight);
});
test("fuel collection and heat management let an active pilot outperform a straight launch", () => {
  const straight = fly(() => ({ thrust: true })); let firing = true;
  const pilot = fly(flight => {
    const gate = fuelGate(flight.nextGate);
    if (flight.heat > 80) firing = false; if (flight.heat < 35) firing = true;
    return { x: clamp((gate.x - flight.x) * .1 - flight.vx * .4, -1, 1), z: clamp((gate.z - flight.z) * .1 - flight.vz * .4, -1, 1), thrust: firing };
  });
  assert.ok(pilot.pickups > straight.pickups); assert.ok(pilot.maxAltitude > straight.maxAltitude * 1.15);
});
test("the course is deterministic, stays within the flight area, and grows harder", () => {
  for (let index = 0; index < 100; index++) {
    const gate = fuelGate(index); assert.deepEqual(gate, fuelGate(index)); assert.ok(Math.hypot(gate.x, gate.z) < 40);
    assert.equal(fuelGate(index + 1).y - gate.y, GATE_SPACING); assert.ok(gate.radius >= 4);
  }
  assert.ok(fuelGate(50).radius < fuelGate(0).radius);
  assert.deepEqual(asteroidField(700, 15), asteroidField(700, 15)); assert.ok(asteroidField(700, 15).length <= 12);
});
test("peak height is stable at different physics rates", () => {
  const a = fly(() => ({ thrust: true })), b = fly(() => ({ thrust: true }), createAscent(), 1 / 60);
  assert.equal(a.pickups, b.pickups); assert.ok(Math.abs(a.maxAltitude - b.maxAltitude) < 4);
});
