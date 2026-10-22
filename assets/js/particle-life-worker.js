import { ParticleWorld, STEP } from "./particle-life-model.mjs";

let world;
self.onmessage = ({ data }) => {
  try {
    let rulesChanged = false, clear = false, mutated = false;
    for (const command of data.commands || []) {
      if (command.type === "init") { world = new ParticleWorld(command.options); rulesChanged = clear = true; }
      if (!world) continue;
      if (command.type === "reset") { world.reset(command.options); rulesChanged = clear = true; }
      if (command.type === "scatter") { world.scatter(); clear = true; }
      if (command.type === "population") { world.populate(command.count); clear = true; }
      if (command.type === "mutate") { world.mutate(); rulesChanged = mutated = true; }
      if (command.type === "edit") { world.edit(command.row, command.column, command.value); rulesChanged = true; }
      if (command.type === "config") world.configure(command.options);
      if (command.type === "resize") { world.resize(command.width); clear = true; }
    }
    if (!world) return;
    const started = performance.now();
    for (let i = 0; i < Math.min(24, data.steps || 0); i++) { world.step(STEP, data.pointer); if (performance.now() - started > 20) break; }
    if (world.observe(data.seconds || 0)) { rulesChanged = mutated = true; }
    const output = world.snapshot(data.buffer);
    self.postMessage({ buffer: output.buffer, count: world.count, species: world.species, seed: world.seed, generation: world.generation, time: world.time, clock: world.clock, countdown: Math.max(0, world.nextMutation - world.clock), matrix: rulesChanged ? Array.from(world.rules) : null, clear, mutated, request: data.request }, [output.buffer]);
  } catch (error) { self.postMessage({ error: String(error?.message || error), request: data.request }); }
};
