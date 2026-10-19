export const MAX_HOLD_MS = 2400;
export const TRACK_DISTANCE = 160;
export const ROUND_COUNT = 3;
export const MAX_SCORE = 3300;

export function distanceForHold(milliseconds, course = { surface: 1 }, wind = 0) {
  const duration = Number.isFinite(milliseconds) ? Math.min(MAX_HOLD_MS, Math.max(0, milliseconds)) : 0;
  const breeze = Number.isFinite(wind) ? Math.min(.15, Math.max(-.15, wind)) : 0;
  return Math.min(TRACK_DISTANCE, TRACK_DISTANCE * (duration / MAX_HOLD_MS) ** 2 * course.surface * (1 + breeze));
}

export function dayInTokyo(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function seedForDay(day) {
  let hash = 0;
  for (const letter of day) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return hash;
}

export function coursesForDay(day) {
  const seed = seedForDay(day);
  const middle = seed % 2 ? { name: "砂利道", surface: .84, note: "抵抗が大きい。少し長めに。", terrain: "gravel" } : { name: "雨上がり", surface: 1.12, note: "滑りやすい。少し控えめに。", terrain: "wet" };
  return [
    { name: "舗装路", surface: 1, note: "まずは感覚をつかもう。", terrain: "asphalt" },
    middle,
    { name: "凍結路", surface: 1.24, note: "よく滑る路面。風の変化も大きい。", terrain: "ice" }
  ].map((course, index) => ({
    ...course,
    target: 58 + ((seed + index * 137 + (seed >>> (index + 2))) % 51),
    precision: [.8, .55, .35][index],
    windStrength: [.04, .075, .11][index],
    windPeriod: [4600, 3900, 3200][index],
    windPhase: ((seed >>> (index * 3)) % 628) / 100
  }));
}

export function windForCourse(course, milliseconds) {
  return Math.sin(milliseconds / course.windPeriod * Math.PI * 2 + course.windPhase) * course.windStrength;
}

export function judgeStop(distance, target, precision = .8) {
  const error = distance - target;
  const difference = Math.abs(error);
  const score = Math.max(0, Math.round(1000 - Math.max(0, difference - precision) * 110));
  const grade = difference <= precision ? "PERFECT" : difference <= precision + 1 ? "GREAT" : difference <= precision + 4 ? "CLOSE" : "MISS";
  return { error, difference, score, grade };
}

export function summarizeRun(results) {
  let streak = 0;
  let bonus = 0;
  for (const result of results) {
    streak = result.grade === "PERFECT" || result.grade === "GREAT" ? streak + 1 : 0;
    bonus += Math.max(0, streak - 1) * 100;
  }
  return { score: results.reduce((sum, result) => sum + result.score, 0) + bonus, bonus, streak };
}

export function coastProgress(progress) {
  const bounded = Math.min(1, Math.max(0, progress));
  return 1 - (1 - bounded) ** 3;
}
