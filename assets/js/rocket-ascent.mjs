import { GRAVITY, ENGINE, clamp } from "./rocket-model.mjs";

export const GATE_SPACING = 70;
export const FUEL_BONUS = 24;
const noise = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function fuelGate(index) {
  const spread = Math.min(27, 10 + index * 1.1);
  return { index, x: index === 0 ? 3 : Math.sin(index * .55) * spread, y: 55 + index * GATE_SPACING, z: index === 0 ? -3 : -Math.cos(index * .55) * spread, radius: Math.max(4, 6.5 - index * .08) };
}
export function asteroidField(altitude, time) {
  const sector = Math.max(0, Math.floor((altitude - 55) / GATE_SPACING));
  const rocks = [];
  for (let i = Math.max(1, sector - 1); i <= sector + 2; i++) {
    const gate = fuelGate(i);
    for (let j = 0; j < 3; j++) {
      const seed = i * 13 + j * 7;
      rocks.push({ id: seed, x: gate.x * .5 + (noise(seed) - .5) * 48 + Math.sin(time * .35 + seed) * 3, y: gate.y + 20 + j * 14, z: gate.z * .5 + (noise(seed + 3) - .5) * 48, radius: 2.3 + noise(seed + 5) * 2.4 });
    }
  }
  return rocks;
}
export function createAscent() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, leanX: 0, leanZ: 0, throttle: 0, fuel: 100, heat: 0, cooldown: 0, hull: 3, invincible: 0, maxAltitude: 0, pickups: 0, nextGate: 0, event: "", time: 0, contact: null };
}
export function stepAscent(flight, input, dt = 1 / 120) {
  if (flight.contact) return flight;
  const next = { ...flight, time: flight.time + dt, event: "", cooldown: Math.max(0, flight.cooldown - dt), invincible: Math.max(0, flight.invincible - dt) };
  const ix = clamp(input.x || 0, -1, 1), iz = clamp(input.z || 0, -1, 1), magnitude = Math.max(1, Math.hypot(ix, iz));
  const response = 1 - Math.exp(-7 * dt);
  next.leanX += (ix / magnitude * .42 - next.leanX) * response;
  next.leanZ += (iz / magnitude * .42 - next.leanZ) * response;
  const firing = input.thrust && flight.fuel > 0 && next.cooldown <= 0;
  next.throttle += ((firing ? 1 : 0) - next.throttle) * (1 - Math.exp(-14 * dt));
  const burn = Math.min(flight.fuel, next.throttle * 8.5 * dt), power = burn / (8.5 * dt);
  next.fuel = Math.max(0, flight.fuel - burn);
  next.heat = clamp(flight.heat + (firing ? power * 25 : -42) * dt, 0, 100);
  if (next.heat >= 100) { next.cooldown = 1.8; next.event = "overheat"; }
  if (next.fuel <= 0) next.throttle = 0;
  next.vx += (Math.sin(next.leanX) * ENGINE * power + ix / magnitude * 2.5 - flight.vx * .35) * dt;
  next.vz += (Math.sin(next.leanZ) * ENGINE * power + iz / magnitude * 2.5 - flight.vz * .35) * dt;
  next.vy += (Math.cos(next.leanX) * Math.cos(next.leanZ) * ENGINE * power - GRAVITY - Math.sign(flight.vy) * flight.vy ** 2 * .0025) * dt;
  next.x += next.vx * dt; next.y += next.vy * dt; next.z += next.vz * dt;
  if (next.y < 0) { next.y = 0; next.vy = 0; }
  next.maxAltitude = Math.max(flight.maxAltitude, next.y);
  const gate = fuelGate(next.nextGate);
  if (Math.abs(next.y + 3 - gate.y) <= 6 && Math.hypot(next.x - gate.x, next.z - gate.z) <= gate.radius) {
    next.fuel = Math.min(100, next.fuel + FUEL_BONUS); next.heat = Math.max(0, next.heat - 28);
    next.nextGate++; next.pickups++; next.event = "pickup";
  } else if (next.y > gate.y + 8) { next.nextGate++; next.event = "missed"; }
  if (next.invincible <= 0) {
    const hit = asteroidField(next.y, next.time).find(rock => Math.hypot(next.x - rock.x, next.y + 4 - rock.y, next.z - rock.z) < rock.radius + 1.2);
    if (hit) {
      next.hull--; next.fuel = Math.max(0, next.fuel - 14); next.invincible = 1.8; next.vy *= .65;
      next.vx += (next.x >= hit.x ? 1 : -1) * 6; next.vz += (next.z >= hit.z ? 1 : -1) * 6; next.event = "hit";
    }
  }
  let reason = "";
  if (next.hull <= 0) reason = "隕石帯で機体が限界に。次は、ひとつ先の進路を読もう。";
  else if (Math.hypot(next.x, next.z) > 85) reason = "航路から離れすぎた。燃料の光を目印に飛ぼう。";
  else if (next.fuel <= 0 && next.vy <= 0) reason = "燃料を使い切り、最高到達点へ。次は、もうひとつ先の燃料を。";
  else if (next.y === 0 && next.time > 3 && next.maxAltitude > 5) reason = "月面に帰還。短く噴射を休みながら、熱を逃がそう。";
  if (reason) { next.contact = { success: false, grade: "FLIGHT COMPLETE", reason, score: Math.floor(next.maxAltitude) }; next.throttle = 0; }
  return next;
}
