import test from "node:test";
import assert from "node:assert/strict";
import { ParticleWorld, interaction, nearest, wrap, randomForSeed, rulesFor } from "../assets/js/particle-life-model.mjs";

test("close particles repel for every rule, while outer attraction follows the matrix", () => {
  for (const rule of [-1, -.5, 0, .5, 1]) assert.ok(interaction(.1, rule) < 0);
  assert.ok(interaction(.64, 1) > 0); assert.ok(interaction(.64, -1) < 0);
  assert.equal(interaction(1, 1), 0); assert.equal(interaction(2, 1), 0);
  assert.ok(Math.abs(interaction(.28, .8)) < 1e-10);
});
test("the grid produces the same forces as all-pairs evaluation, including wrapped narrow worlds", () => {
  for (const width of [.35, .65, 1, 1.9, 3]) for (const radius of [.05, .115, .22]) {
    const world = new ParticleWorld({ count: 240, width, seed: 389 }); world.configure({ radius });
    world.x[0] = .001; world.x[1] = width - .001; world.y[0] = .002; world.y[1] = .998;
    world.computeForces(null); const ax = [...world.fx], ay = [...world.fy]; world.computeForces(null, true);
    for (let i = 0; i < world.count; i++) { assert.ok(Math.abs(ax[i] - world.fx[i]) < .0002, `x ${width}/${radius}/${i}`); assert.ok(Math.abs(ay[i] - world.fy[i]) < .0002, `y ${width}/${radius}/${i}`); }
  }
});
test("the same seed, rules and inputs generate the same world", () => {
  const a = new ParticleWorld({ count: 220, seed: 981 }), b = new ParticleWorld({ count: 220, seed: 981 });
  for (let i = 0; i < 150; i++) { a.step(); b.step(); }
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.deepEqual(a.rules, b.rules);
  assert.notDeepEqual(a.snapshot(), new ParticleWorld({ count: 220, seed: 982 }).snapshot());
});
test("nonreciprocal attraction can make a pair pursue in the same direction", () => {
  const world = new ParticleWorld({ count: 200, species: 2 }); world.count = 2;
  world.x[0] = .4; world.x[1] = .47; world.y[0] = world.y[1] = .5;
  world.kind[0] = 0; world.kind[1] = 1; world.edit(0, 1, 1); world.edit(1, 0, -1); world.computeForces();
  assert.ok(world.fx[0] > 0); assert.ok(world.fx[1] > 0);
});
test("drag tools attract, repel and swirl particles in the intended directions", () => {
  const world = new ParticleWorld({ count: 200 }); world.count = 1; world.x[0] = .4; world.y[0] = .5;
  world.computeForces({ active: true, x: .5, y: .5, mode: "attract" }); assert.ok(world.fx[0] > 0);
  world.computeForces({ active: true, x: .5, y: .5, mode: "repel" }); assert.ok(world.fx[0] < 0);
  world.computeForces({ active: true, x: .5, y: .5, mode: "swirl" }); assert.equal(world.fx[0], 0); assert.ok(world.fy[0] > 0);
});
test("mutation changes the rules without relocating particles, and stays within the force range", () => {
  const world = new ParticleWorld({ seed: 48, count: 200 }); const positions = world.snapshot(), rules = [...world.rules];
  world.mutate(); assert.deepEqual(world.snapshot(), positions); assert.notDeepEqual([...world.rules], rules); assert.equal(world.generation, 2);
  for (let i = 0; i < 100; i++) world.mutate(); assert.ok([...world.rules].every(value => value >= -1 && value <= 1));
});
test("automatic mutations use active observation time and can be disabled", () => {
  const world = new ParticleWorld({ count: 200 }); for (let i = 0; i < 119; i++) world.observe(.25);
  assert.equal(world.generation, 1); assert.equal(world.observe(.25), true); assert.equal(world.generation, 2);
  world.configure({ auto: false }); for (let i = 0; i < 200; i++) world.observe(.25); assert.equal(world.generation, 2);
  world.configure({ auto: true }); for (let i = 0; i < 119; i++) world.observe(.25); assert.equal(world.generation, 2); world.observe(.25); assert.equal(world.generation, 3);
});
test("changing the particle count preserves custom rules and existing particles", () => {
  const world = new ParticleWorld({ count: 200 }); world.edit(0, 1, -.85); const x = world.x[0], y = world.y[0];
  world.populate(500); assert.equal(world.count, 500); assert.equal(world.x[0], x); assert.equal(world.y[0], y); assert.ok(Math.abs(world.rules[1] + .85) < 1e-6);
  world.step(); assert.equal(world.snapshot().length, 1500); world.populate(200); assert.equal(world.snapshot().length, 600);
});
test("resizing preserves relative positions instead of losing particles off screen", () => {
  const world = new ParticleWorld({ count: 200, width: 2 }); const before = world.snapshot(); world.resize(.75); const after = world.snapshot();
  for (let i = 0; i < before.length; i++) assert.ok(Math.abs(before[i] - after[i]) < 1e-6);
});
test("coincident particles and long runs remain finite and inside the toroidal world", () => {
  const world = new ParticleWorld({ count: 230, width: .8 }); world.x[0] = world.x[1]; world.y[0] = world.y[1];
  for (let i = 0; i < 500; i++) world.step();
  for (let i = 0; i < world.count; i++) { assert.ok(Number.isFinite(world.x[i]) && Number.isFinite(world.vx[i])); assert.ok(world.x[i] >= 0 && world.x[i] <= world.width); assert.ok(world.y[i] >= 0 && world.y[i] <= 1); }
  assert.equal(wrap(-.1, 1), .9); assert.ok(Math.abs(nearest(.98, 1) + .02) < 1e-8);
});
test("snapshots reuse transferred buffers without exposing mutable simulation arrays", () => {
  const world = new ParticleWorld({ count: 200 }), buffer = new ArrayBuffer(2400), snapshot = world.snapshot(buffer);
  assert.equal(snapshot.buffer, buffer); snapshot[0] = 999; assert.notEqual(world.x[0], 999);
});
test("presets express distinct cellular, pursuit and symbiosis rules", () => {
  const random = randomForSeed(1), cells = rulesFor("cells", 6, random), chase = rulesFor("chase", 6, random), pair = rulesFor("symbiosis", 6, random);
  assert.ok(cells[0] > 0 && cells[1] < 0); assert.ok(chase[1] > 0 && chase[6] < 0); assert.ok(pair[1] > 0 && pair[2] < 0);
});
