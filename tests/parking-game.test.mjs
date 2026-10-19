import test from "node:test";
import assert from "node:assert/strict";
import { MAX_HOLD_MS, TRACK_DISTANCE, MAX_SCORE, distanceForHold, dayInTokyo, coursesForDay, windForCourse, judgeStop, summarizeRun, coastProgress } from "../assets/js/parking-model.mjs";

test("hold time determines a bounded distance and invalid times cannot move the car", () => {
  assert.equal(distanceForHold(0), 0);
  assert.equal(distanceForHold(MAX_HOLD_MS / 2), TRACK_DISTANCE / 4);
  assert.equal(distanceForHold(MAX_HOLD_MS), TRACK_DISTANCE);
  assert.equal(distanceForHold(MAX_HOLD_MS * 5), TRACK_DISTANCE);
  assert.equal(distanceForHold(-100), 0);
  assert.equal(distanceForHold(NaN), 0);
  for (let time = 100; time <= MAX_HOLD_MS; time += 100) assert.ok(distanceForHold(time) > distanceForHold(time - 100));
});
test("daily courses vary and all three goals remain reachable even against the strongest wind", () => {
  const signatures = new Set();
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
    const courses = coursesForDay(date);
    assert.deepEqual(courses, coursesForDay(date));
    assert.equal(courses.length, 3);
    signatures.add(courses.map(course => course.target).join("/"));
    for (const course of courses) {
      assert.ok(course.target >= 58 && course.target <= 108);
      assert.ok(distanceForHold(MAX_HOLD_MS, course, -course.windStrength) > course.target);
    }
    assert.ok(courses[0].precision > courses[1].precision && courses[1].precision > courses[2].precision);
    assert.ok(courses[0].windStrength < courses[2].windStrength);
  }
  assert.ok(signatures.size > 100);
});
test("surface and the wind at release affect travel, while a longer charge still moves farther", () => {
  const courses = coursesForDay("2026-10-19");
  assert.ok(distanceForHold(1500, courses[2]) > distanceForHold(1500, courses[0]));
  for (const course of courses) {
    assert.ok(distanceForHold(1500, course, .1) > distanceForHold(1500, course, -.1));
    for (let start = 0; start < course.windPeriod; start += 100) {
      let previous = 0;
      for (let hold = 20; hold <= MAX_HOLD_MS; hold += 20) {
        const distance = distanceForHold(hold, course, windForCourse(course, start + hold));
        assert.ok(distance >= previous, `non-monotonic charge: ${course.name} ${start} ${hold}`);
        previous = distance;
      }
    }
    for (let time = 0; time < 10000; time += 50) assert.ok(Math.abs(windForCourse(course, time)) <= course.windStrength);
    assert.ok(Math.abs(windForCourse(course, 0) - windForCourse(course, course.windPeriod)) < 1e-10);
  }
});
test("the daily challenge changes at midnight in Japan", () => {
  assert.equal(dayInTokyo(new Date("2026-10-19T14:59:59Z")), "2026-10-19");
  assert.equal(dayInTokyo(new Date("2026-10-19T15:00:00Z")), "2026-10-20");
});
test("scores reward precision, get harder in later rounds, and preserve short/long errors", () => {
  assert.deepEqual(judgeStop(80, 80), { error: 0, difference: 0, score: 1000, grade: "PERFECT" });
  assert.equal(judgeStop(80.5, 80, .8).grade, "PERFECT");
  assert.equal(judgeStop(80.5, 80, .35).grade, "GREAT");
  assert.ok(judgeStop(80.5, 80, .35).score < 1000);
  assert.equal(judgeStop(84, 80).grade, "CLOSE");
  assert.ok(judgeStop(70, 80).error < 0);
  assert.ok(judgeStop(90, 80).error > 0);
  assert.equal(judgeStop(0, 120).score, 0);
});
test("a run awards consecutive success bonuses and a miss breaks the streak", () => {
  const perfect = judgeStop(80, 80);
  const miss = judgeStop(0, 80);
  assert.deepEqual(summarizeRun([]), { score: 0, bonus: 0, streak: 0 });
  assert.deepEqual(summarizeRun([perfect, perfect, perfect]), { score: MAX_SCORE, bonus: 300, streak: 3 });
  assert.deepEqual(summarizeRun([perfect, miss, perfect]), { score: 2000, bonus: 0, streak: 1 });
  assert.equal(summarizeRun([perfect, perfect, miss]).bonus, 100);
  assert.equal(summarizeRun([perfect, judgeStop(81, 80)]).bonus, 100);
});
test("the car moves forward and stops exactly at its computed landing point", () => {
  assert.equal(coastProgress(0), 0);
  assert.equal(coastProgress(1), 1);
  assert.equal(coastProgress(2), 1);
  for (let p = .05; p <= 1; p += .05) assert.ok(coastProgress(p) >= coastProgress(p - .05));
  assert.ok(1 - coastProgress(.9) < coastProgress(.1));
});
