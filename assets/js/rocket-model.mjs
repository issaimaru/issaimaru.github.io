// Distances are metres, velocities metres/second. The renderer never drives physics.
export const GRAVITY = 4.2;
export const ENGINE = 10.8;
export const FIXED_STEP = 1 / 120;
export const MAX_SCORE = 3000;
export const ROCKET_RADIUS = 2.4;
export const LANDING_LIMITS = Object.freeze({ vertical: 4.8, horizontal: 3, tilt: .3 });
export const MISSIONS = Object.freeze([
  { name: "静かの海", label: "TRANQUILITY", note: "まずは静かな月面へ。噴射を短く刻んで、ゆっくり降りよう。", x: -6, z: 4, altitude: 68, descent: -5, radius: 10, wind: 0, fuel: 100, color: 0x86e8cd },
  { name: "クレーター・リッジ", label: "CRATER RIDGE", note: "横風が吹く、小さな着陸場。早めに横流れを止めよう。", x: 14, z: -10, altitude: 85, descent: -6, radius: 8, wind: .34, fuel: 95, color: 0xf7bd79 },
  { name: "夜明けの基地", label: "LAST LIGHT", note: "最後は強い風と限られた燃料。静かなタッチダウンを。", x: -17, z: -12, altitude: 100, descent: -8, radius: 6.5, wind: .65, fuel: 88, color: 0xb8adff },
]);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function createFlight(mission = MISSIONS[0]) {
  return { x: mission.x, y: mission.altitude, z: mission.z, vx: 0, vy: mission.descent, vz: 0, leanX: 0, leanZ: 0, throttle: 0, fuel: mission.fuel, time: 0, contact: null };
}
export function windAt(mission, time) {
  return { x: mission.wind * (.65 + Math.sin(time * .7) * .35), z: mission.wind * Math.sin(time * .43 + 1) * .7 };
}
export function judgeLanding(flight, mission) {
  const distance = Math.hypot(flight.x, flight.z);
  const vertical = Math.max(0, -flight.vy);
  const horizontal = Math.hypot(flight.vx, flight.vz);
  const tilt = Math.hypot(flight.leanX, flight.leanZ);
  let reason = "";
  if (distance > mission.radius - ROCKET_RADIUS) reason = "着陸場の外に接地。レーダーの中心へ寄せよう。";
  else if (vertical > LANDING_LIMITS.vertical) reason = "降下が速すぎた。もう少し早くエンジンを噴射しよう。";
  else if (horizontal > LANDING_LIMITS.horizontal) reason = "横流れが大きすぎた。逆方向への操作で速度を落とそう。";
  else if (tilt > LANDING_LIMITS.tilt) reason = "機体が傾きすぎた。接地の直前は方向キーを離そう。";
  const success = !reason;
  const score = success ? Math.round(400 * clamp(1 - distance / mission.radius, 0, 1) + 350 * clamp(1 - vertical / 6, 0, 1) + 150 * flight.fuel / mission.fuel + 100 * clamp(1 - tilt / .5, 0, 1)) : 0;
  return { success, reason, score, distance, vertical, horizontal, tilt, grade: !success ? "LOST CONTACT" : score >= 880 ? "PERFECT LANDING" : score >= 700 ? "SMOOTH LANDING" : "TOUCHDOWN" };
}
export function stepFlight(flight, input, mission, dt = FIXED_STEP) {
  if (flight.contact) return flight;
  const next = { ...flight, time: flight.time + dt };
  const ix = clamp(input.x || 0, -1, 1), iz = clamp(input.z || 0, -1, 1);
  const magnitude = Math.max(1, Math.hypot(ix, iz));
  const response = 1 - Math.exp(-6 * dt);
  next.leanX += (ix / magnitude * .36 - next.leanX) * response;
  next.leanZ += (iz / magnitude * .36 - next.leanZ) * response;
  const throttleTarget = input.thrust && flight.fuel > 0 ? 1 : 0;
  next.throttle += (throttleTarget - next.throttle) * (1 - Math.exp(-12 * dt));
  // The last fraction of fuel can supply only the corresponding fraction of a burn.
  const burn = Math.min(flight.fuel, next.throttle * 4.1 * dt);
  const power = burn / (4.1 * dt);
  next.fuel = Math.max(0, flight.fuel - burn);
  if (next.fuel === 0) next.throttle = 0;
  const wind = windAt(mission, next.time);
  const rcs = flight.fuel > 0 ? 1.5 : 0;
  next.vx += (Math.sin(next.leanX) * ENGINE * power + ix / magnitude * rcs + wind.x - flight.vx * .19) * dt;
  next.vz += (Math.sin(next.leanZ) * ENGINE * power + iz / magnitude * rcs + wind.z - flight.vz * .19) * dt;
  next.vy += (Math.cos(next.leanX) * Math.cos(next.leanZ) * ENGINE * power - GRAVITY - flight.vy * .015) * dt;
  next.x += next.vx * dt; next.z += next.vz * dt; next.y += next.vy * dt;
  if (next.y <= 0) {
    // Interpolate the contact position so a frame boundary cannot change a pad-edge result.
    const fraction = clamp(flight.y / (flight.y - next.y), 0, 1);
    next.x = flight.x + (next.x - flight.x) * fraction;
    next.z = flight.z + (next.z - flight.z) * fraction;
    next.y = 0;
    next.contact = judgeLanding(next, mission);
    next.throttle = 0;
  } else if (next.y > 190 || Math.hypot(next.x, next.z) > 110 || next.time > 100) {
    next.contact = { success: false, score: 0, grade: "OUT OF RANGE", reason: "飛行エリアを離脱。短い噴射で、着陸場の近くを保とう。" };
    next.throttle = 0;
  }
  return next;
}
export function brakingAltitude(flight) {
  const speed = Math.max(0, -flight.vy);
  return speed * speed / (2 * (ENGINE - GRAVITY)) + speed * .3 + 3;
}
