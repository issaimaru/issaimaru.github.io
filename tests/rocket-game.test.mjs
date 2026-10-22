import test from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, FIXED_STEP, LANDING_LIMITS, ROCKET_RADIUS, createFlight, stepFlight, judgeLanding, windAt, brakingAltitude, clamp } from "../assets/js/rocket-model.mjs";

function simulate(mission, pilot, initial = createFlight(mission), dt = FIXED_STEP) {
  let flight = initial;
  for (let i = 0; i < Math.ceil(105 / dt) && !flight.contact; i++) flight = stepFlight(flight, pilot(flight), mission, dt);
  return flight;
}
const softLandingPilot = flight => ({
  x: clamp(-flight.x * .035 - flight.vx * .28, -1, 1),
  z: clamp(-flight.z * .035 - flight.vz * .28, -1, 1),
  thrust: flight.vy < -Math.min(10, Math.max(1.2, Math.sqrt(Math.max(0, flight.y)) * 1.1)),
});

test("each mission is reachable with fuel remaining under the same feedback pilot", () => {
  for (const mission of MISSIONS) {
    const flight = simulate(mission, softLandingPilot);
    assert.equal(flight.contact?.success, true, mission.name);
    assert.ok(flight.fuel > 20 && flight.fuel < mission.fuel);
    assert.ok(flight.contact.vertical <= LANDING_LIMITS.vertical);
    assert.ok(flight.contact.distance < mission.radius - ROCKET_RADIUS);
    assert.ok(flight.contact.score > 500 && flight.contact.score <= 1000);
  }
});
test("coasting crashes, while sustained thrust reverses a descent and consumes fuel", () => {
  const mission = MISSIONS[0];
  const crash = simulate(mission, () => ({}), { ...createFlight(mission), x: 0, z: 0 });
  assert.equal(crash.contact.success, false);
  assert.match(crash.contact.reason, /降下が速すぎた/);
  let burn = createFlight(mission);
  for (let i = 0; i < 240; i++) burn = stepFlight(burn, { thrust: true }, mission);
  assert.ok(burn.vy > 0); assert.ok(burn.fuel < mission.fuel); assert.ok(burn.y > 50);
});
test("empty tanks stop both main thrust and manoeuvring jets; fuel cannot go negative", () => {
  const mission = MISSIONS[0];
  const empty = { ...createFlight(mission), fuel: .001, throttle: 1 };
  const exhausted = stepFlight(empty, { thrust: true, x: 1 }, mission);
  assert.equal(exhausted.fuel, 0); assert.equal(exhausted.throttle, 0);
  const coast = stepFlight(exhausted, {}, mission), attemptedBurn = stepFlight(exhausted, { thrust: true, x: 1 }, mission);
  assert.equal(attemptedBurn.fuel, 0); assert.equal(attemptedBurn.vx, coast.vx);
  assert.equal(attemptedBurn.vy, coast.vy); assert.ok(attemptedBurn.vy < exhausted.vy);
});
test("position, vertical speed, horizontal speed and attitude independently determine a safe landing", () => {
  const mission = MISSIONS[0], safe = { ...createFlight(mission), x: 0, y: 0, z: 0, vy: -1 };
  assert.equal(judgeLanding(safe, mission).success, true);
  assert.match(judgeLanding({ ...safe, x: mission.radius - ROCKET_RADIUS + .1 }, mission).reason, /着陸場の外/);
  assert.match(judgeLanding({ ...safe, vy: -4.81 }, mission).reason, /降下が速すぎた/);
  assert.match(judgeLanding({ ...safe, vx: 3.01 }, mission).reason, /横流れ/);
  assert.match(judgeLanding({ ...safe, leanX: .31 }, mission).reason, /傾きすぎた/);
  assert.equal(judgeLanding({ ...safe, vy: -4.8, vx: 3, leanX: .3 }, mission).success, true);
});
test("landing score rewards accuracy, low impact speed, remaining fuel and upright attitude", () => {
  const mission = MISSIONS[0], perfect = { ...createFlight(mission), x: 0, z: 0, y: 0, vy: 0 };
  assert.equal(judgeLanding(perfect, mission).score, 1000);
  for (const penalty of [{ x: 4 }, { vy: -4 }, { fuel: 30 }, { leanX: .2 }]) assert.ok(judgeLanding({ ...perfect, ...penalty }, mission).score < 1000);
  assert.equal(judgeLanding({ ...perfect, vy: -10 }, mission).score, 0);
});
test("autostabilisation removes tilt, but inertia requires braking", () => {
  const mission = MISSIONS[0]; let flight = createFlight(mission);
  for (let i = 0; i < 90; i++) flight = stepFlight(flight, { x: 1, thrust: true }, mission);
  assert.ok(flight.leanX > .3 && flight.vx > 1);
  const drifting = flight.vx;
  for (let i = 0; i < 120; i++) flight = stepFlight(flight, {}, mission);
  assert.ok(flight.leanX < .002); assert.ok(flight.vx > drifting * .5);
});
test("touchdown resolves at the surface and freezes the impact result", () => {
  const mission = MISSIONS[0];
  const flight = stepFlight({ ...createFlight(mission), x: 0, z: 0, y: .005, vy: -1 }, {}, mission);
  assert.equal(flight.y, 0); assert.equal(flight.contact.success, true);
  assert.equal(stepFlight(flight, { thrust: true, x: 1 }, mission), flight);
});
test("the landing remains consistent at 60 and 120 physics steps per second", () => {
  for (const mission of MISSIONS) {
    const a = simulate(mission, softLandingPilot), b = simulate(mission, softLandingPilot, createFlight(mission), 1 / 60);
    assert.equal(a.contact.success, b.contact.success);
    assert.ok(Math.abs(a.contact.distance - b.contact.distance) < .1);
    assert.ok(Math.abs(a.contact.score - b.contact.score) < 15);
  }
});
test("mission winds are bounded and emergency braking cues increase with falling speed", () => {
  for (const mission of MISSIONS) for (let time = 0; time < 100; time += .25) {
    const wind = windAt(mission, time); assert.ok(Math.abs(wind.x) <= mission.wind); assert.ok(Math.abs(wind.z) <= mission.wind);
  }
  assert.ok(brakingAltitude({ vy: -20 }) > brakingAltitude({ vy: -5 }));
  assert.equal(brakingAltitude({ vy: 10 }), brakingAltitude({ vy: 0 }));
});
test("escaping the flight area ends the attempt instead of running indefinitely", () => {
  const mission = MISSIONS[0];
  const escaped = stepFlight({ ...createFlight(mission), x: 111 }, {}, mission);
  assert.equal(escaped.contact.success, false); assert.equal(escaped.contact.grade, "OUT OF RANGE");
});
