export const STEP = 1 / 120;
export const COLORS = ["#ff719b", "#ffbd72", "#dce96c", "#82e8a9", "#6bd9ed", "#a69aff", "#dc91e6", "#e4ebf5"];
export const COLOR_NAMES = ["桃", "橙", "黄", "緑", "水色", "紫", "藤", "白"];
export const PRESETS = ["soup", "cells", "chase", "symbiosis", "nebula"];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const wrap = (value, size) => value - Math.floor(value / size) * size;
export const nearest = (distance, size) => distance - Math.round(distance / size) * size;
export function randomForSeed(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let n = Math.imul(state ^ state >>> 15, 1 | state); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export function rulesFor(preset, species, random) {
  const rules = new Float32Array(species * species);
  for (let a = 0; a < species; a++) for (let b = 0; b < species; b++) {
    let value;
    if (preset === "cells") value = a === b ? .72 : -.32 - random() * .25;
    else if (preset === "chase") value = a === b ? .2 : b === (a + 1) % species ? .92 : a === (b + 1) % species ? -.85 : -.08;
    else if (preset === "symbiosis") value = a === b ? .32 : Math.floor(a / 2) === Math.floor(b / 2) ? .85 : -.3;
    else if (preset === "nebula") value = a === b ? .68 : .12 + random() * .33;
    else value = a === b ? .35 + random() * .45 : random() * 1.9 - .95;
    rules[a * species + b] = value;
  }
  return rules;
}
// The short-range core always repels; the species matrix controls the outer shell.
export function interaction(distance, attraction) {
  const core = .28;
  if (distance < core) return distance / core - 1;
  if (distance >= 1) return 0;
  return attraction * (1 - Math.abs(2 * distance - 1 - core) / (1 - core));
}
export class ParticleWorld {
  constructor({ count = 2000, species = 6, seed = 1, preset = "soup", width = 1.8 } = {}) {
    this.width = clamp(width, .35, 4); this.radius = .115; this.friction = .18; this.strength = 20;
    this.clock = 0; this.time = 0; this.generation = 1; this.auto = true; this.nextMutation = 30;
    this.reset({ count, species, seed, preset });
  }
  reset({ count = this.count, species = this.species, seed = this.seed, preset = this.preset } = {}) {
    this.count = clamp(Math.round(count), 200, 4000); this.species = clamp(Math.round(species), 2, 8);
    this.seed = seed >>> 0; this.preset = PRESETS.includes(preset) ? preset : "soup";
    this.random = randomForSeed(this.seed); this.rules = rulesFor(this.preset, this.species, this.random);
    this.x = new Float32Array(this.count); this.y = new Float32Array(this.count); this.vx = new Float32Array(this.count); this.vy = new Float32Array(this.count); this.kind = new Uint8Array(this.count);
    this.fx = new Float32Array(this.count); this.fy = new Float32Array(this.count); this.links = new Int32Array(this.count);
    this.time = 0; this.clock = 0; this.generation = 1; this.nextMutation = 30;
    this.scatter(); this.buildGrid();
  }
  scatter() {
    for (let i = 0; i < this.count; i++) { this.x[i] = this.random() * this.width; this.y[i] = this.random(); this.vx[i] = (this.random() - .5) * .04; this.vy[i] = (this.random() - .5) * .04; this.kind[i] = i % this.species; }
  }
  populate(count) {
    const previous = this.count, next = clamp(Math.round(count), 200, 4000);
    for (const key of ["x", "y", "vx", "vy", "kind"]) { const old = this[key]; this[key] = key === "kind" ? new Uint8Array(next) : new Float32Array(next); this[key].set(old.subarray(0, Math.min(next, previous))); }
    this.count = next; this.fx = new Float32Array(next); this.fy = new Float32Array(next); this.links = new Int32Array(next);
    for (let i = previous; i < next; i++) { this.x[i] = this.random() * this.width; this.y[i] = this.random(); this.kind[i] = i % this.species; }
  }
  resize(width) {
    const next = clamp(width, .35, 4), ratio = next / this.width;
    for (let i = 0; i < this.count; i++) { this.x[i] *= ratio; this.vx[i] *= ratio; }
    this.width = next; this.buildGrid();
  }
  buildGrid() {
    this.columns = Math.max(1, Math.floor(this.width / this.radius)); this.rows = Math.max(1, Math.floor(1 / this.radius));
    this.heads = new Int32Array(this.columns * this.rows);
  }
  configure({ radius, friction, auto } = {}) {
    if (Number.isFinite(radius)) { this.radius = clamp(radius, .05, .22); this.buildGrid(); }
    if (Number.isFinite(friction)) this.friction = clamp(friction, .06, .45);
    if (typeof auto === "boolean") { this.auto = auto; this.nextMutation = this.clock + 30; }
  }
  edit(row, column, value) {
    if (Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < this.species && column >= 0 && column < this.species && Number.isFinite(value)) this.rules[row * this.species + column] = clamp(value, -1, 1);
  }
  mutate() {
    for (let i = 0; i < this.rules.length; i++) if (this.random() < .42) this.rules[i] = clamp(this.rules[i] + (this.random() - .5) * .95, -1, 1);
    this.generation++; this.nextMutation = this.clock + 30;
  }
  observe(seconds) {
    this.clock += Math.max(0, Math.min(seconds, .25));
    if (this.auto && this.clock >= this.nextMutation) { this.mutate(); return true; }
    return false;
  }
  computeForces(pointer, bruteForce = false) {
    const { count, width, radius, columns, rows, heads, links, x, y, kind, rules, species } = this;
    const radiusSquared = radius * radius;
    this.fx.fill(0); this.fy.fill(0); heads.fill(-1);
    for (let i = 0; i < count; i++) { const cell = Math.min(rows - 1, Math.floor(y[i] * rows)) * columns + Math.min(columns - 1, Math.floor(x[i] / width * columns)); links[i] = heads[cell]; heads[cell] = i; }
    const halfWidth = width / 2, gain = radius * this.strength;
    const addPair = (i, j) => {
      if (j <= i) return;
      let dx = x[j] - x[i]; if (dx > halfWidth) dx -= width; else if (dx < -halfWidth) dx += width;
      if (dx > radius || dx < -radius) return;
      let dy = y[j] - y[i]; if (dy > .5) dy--; else if (dy < -.5) dy++;
      const squared = dx * dx + dy * dy;
      if (squared < 1e-12 || squared >= radiusSquared) return;
      const distance = Math.sqrt(squared), r = distance / radius, scale = gain / distance;
      let a, b;
      if (r < .28) a = b = r / .28 - 1;
      else { const envelope = 1 - Math.abs(2 * r - 1.28) / .72; a = rules[kind[i] * species + kind[j]] * envelope; b = rules[kind[j] * species + kind[i]] * envelope; }
      const gx = dx * scale, gy = dy * scale;
      this.fx[i] += gx * a; this.fy[i] += gy * a; this.fx[j] -= gx * b; this.fy[j] -= gy * b;
    };
    for (let i = 0; i < count; i++) {
      if (bruteForce) { for (let j = i + 1; j < count; j++) addPair(i, j); }
      else {
        const cx = Math.min(columns - 1, Math.floor(x[i] / width * columns)), cy = Math.min(rows - 1, Math.floor(y[i] * rows));
        // Small grids visit each bucket once, even across a wrapped boundary.
        for (let oy = 0; oy < Math.min(3, rows); oy++) {
          const gy = rows < 3 ? oy : (cy + oy - 1 + rows) % rows;
          for (let ox = 0; ox < Math.min(3, columns); ox++) {
            const gx = columns < 3 ? ox : (cx + ox - 1 + columns) % columns;
            for (let j = heads[gy * columns + gx]; j !== -1; j = links[j]) addPair(i, j);
          }
        }
      }
    }
    if (pointer?.active) for (let i = 0; i < count; i++) {
      const dx = nearest(pointer.x - x[i], width), dy = nearest(pointer.y - y[i], 1), distance = Math.hypot(dx, dy);
      if (distance > .001 && distance < .24) {
        const strength = (1 - distance / .24) * 12 / distance;
        if (pointer.mode === "swirl") { this.fx[i] -= dy * strength; this.fy[i] += dx * strength; }
        else { const sign = pointer.mode === "repel" ? -1 : 1; this.fx[i] += dx * strength * sign; this.fy[i] += dy * strength * sign; }
      }
    }
  }

  step(dt = STEP, pointer = null) {
    this.computeForces(pointer);
    const damping = Math.exp(-dt / this.friction);
    for (let i = 0; i < this.count; i++) {
      let vx = this.vx[i] * damping + this.fx[i] * dt, vy = this.vy[i] * damping + this.fy[i] * dt;
      const squared = vx * vx + vy * vy, limit = .85;
      if (squared > limit * limit) { const scale = limit / Math.sqrt(squared); vx *= scale; vy *= scale; }
      this.vx[i] = vx; this.vy[i] = vy; this.x[i] = wrap(this.x[i] + vx * dt, this.width); this.y[i] = wrap(this.y[i] + vy * dt, 1);
    }
    this.time += dt;
  }
  snapshot(buffer) {
    const output = buffer?.byteLength === this.count * 12 ? new Float32Array(buffer) : new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) { output[i * 3] = this.x[i] / this.width; output[i * 3 + 1] = this.y[i]; output[i * 3 + 2] = this.kind[i]; }
    return output;
  }
}
