import { COLORS, COLOR_NAMES, STEP } from "./particle-life-model.mjs";
import { createParticleRenderer } from "./particle-life-renderer.js";
import { setupParticleSharing } from "./particle-life-sharing.js";

const root = document.querySelector("[data-particle-life]");
if (root) {
  const find = name => root.querySelector(`[data-pl-${name}]`);
  const canvas = find("canvas"), stage = find("stage"), panel = find("panel");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = find("count"), species = find("species"), preset = find("preset"), speed = find("speed"), radius = find("radius"), pauseButton = find("pause"), ruleRange = find("rule-value");
  let worker, renderer, started = false, inView = false, paused = reducedMotion, busy = false, request = 0, frame = 0, recycle = null;
  let commands = [], lastSent = 0, accumulator = 0, matrix = [], matrixSpecies = 0, selected = 0, worldWidth = 1.8, seed = 1;
  let fpsSince = performance.now(), fpsFrames = 0, lastHUD = 0, lastSnapshot;
  let pointer = { active: false, x: 0, y: 0, mode: "attract" }, activePointer = null, pointerTool = "attract";
  let recording = false, pausedBeforeRecording = false;
  count.value = matchMedia("(max-width: 560px)").matches ? "1000" : "2000";
  find("trails").checked = !reducedMotion;
  const newSeed = () => { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0]; };
  const active = () => started && !paused && (inView || recording) && !document.hidden && root.dataset.state !== "error";
  const status = text => { find("status").textContent = text; };
  function updateState() {
    root.dataset.paused = String(paused || (!inView && !recording) || document.hidden);
    if (started && root.dataset.state !== "error") root.dataset.state = paused ? "paused" : "running";
    pauseButton.textContent = paused ? "▶ 再生" : "Ⅱ 一時停止";
    pauseButton.setAttribute("aria-label", paused ? "粒子のシミュレーションを再生" : "粒子のシミュレーションを一時停止");
    pauseButton.setAttribute("aria-pressed", String(paused));
    find("scene-help").textContent = paused ? "一時停止中。再生ボタンで動き出します。" : "ドラッグして、この世界に触れてみよう。";
  }
  function schedule() { if (!frame && started && (commands.length || active())) frame = requestAnimationFrame(tick); }
  function queue(command) {
    // Slider/resize changes need only the most recent value while the worker is busy.
    if (command.type === "config") { const previous = commands.find(old => old.type === "config"); if (previous) command.options = { ...previous.options, ...command.options }; commands = commands.filter(old => old.type !== "config"); }
    if (command.type === "resize") commands = commands.filter(old => old.type !== "resize");
    if (command.type === "edit") commands = commands.filter(old => old.type !== "edit" || old.row !== command.row || old.column !== command.column);
    commands.push(command); schedule();
  }
  function tick(now) {
    frame = 0;
    if (!busy && (commands.length || active())) {
      const seconds = active() && lastSent ? Math.min(.09, (now - lastSent) / 1000) : 0; lastSent = active() ? now : 0;
      accumulator += seconds * Number(speed.value);
      const steps = active() ? Math.min(20, Math.floor(accumulator / STEP)) : 0;
      accumulator = Math.min(.12, Math.max(0, accumulator - steps * STEP));
      const message = { commands, steps, seconds, pointer, request: ++request, buffer: recycle };
      commands = []; busy = true;
      const transfer = recycle ? [recycle] : []; recycle = null; worker.postMessage(message, transfer);
    }
    schedule();
  }
  function fail(error) {
    root.dataset.state = "error"; worker?.terminate(); started = false; busy = false; cancelAnimationFrame(frame); frame = 0;
    find("loading").hidden = false; find("loading-message").textContent = "シミュレーションを開始できませんでした。再読み込みしてお試しください。";
    find("retry").hidden = false; find("controls").disabled = true; pauseButton.disabled = true;
    status("シミュレーションを開始できませんでした。ページを再読み込みしてください。"); console.error("Particle Life:", error);
  }
  function selectCell(index, moveFocus = false) {
    selected = Math.max(0, Math.min(matrix.length - 1, index));
    find("matrix").querySelectorAll("button").forEach((button, i) => { button.dataset.selected = String(i === selected); button.tabIndex = i === selected ? 0 : -1; if (moveFocus && i === selected) button.focus(); });
    const row = Math.floor(selected / matrixSpecies), column = selected % matrixSpecies;
    find("rule-label").textContent = `${COLOR_NAMES[row]} → ${COLOR_NAMES[column]}`;
    const value = matrix[selected] || 0;
    if (document.activeElement !== ruleRange) ruleRange.value = value.toFixed(2);
    find("rule-output").textContent = `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    ruleRange.setAttribute("aria-label", `${COLOR_NAMES[row]}色の粒子が${COLOR_NAMES[column]}色から受ける引力`);
  }
  function renderMatrix(values, size) {
    const table = find("matrix"); matrix = values;
    if (size !== matrixSpecies) {
      matrixSpecies = size; selected = 0; table.replaceChildren();
      const head = document.createElement("thead"), row = document.createElement("tr"), corner = document.createElement("th"); corner.textContent = "↓→"; corner.setAttribute("aria-label", "行の色が列の色から受ける力"); row.append(corner);
      const colorHeader = (kind, scope) => { const th = document.createElement("th"), dot = document.createElement("i"); th.scope = scope; th.setAttribute("aria-label", COLOR_NAMES[kind]); dot.style.setProperty("--pl-color", COLORS[kind]); th.append(dot); return th; };
      for (let column = 0; column < size; column++) row.append(colorHeader(column, "col")); head.append(row); table.append(head);
      const body = document.createElement("tbody");
      for (let a = 0; a < size; a++) {
        const tr = document.createElement("tr"); tr.append(colorHeader(a, "row"));
        for (let b = 0; b < size; b++) { const td = document.createElement("td"), button = document.createElement("button"); button.type = "button"; button.addEventListener("click", () => selectCell(a * size + b)); td.append(button); tr.append(td); }
        body.append(tr);
      }
      table.append(body);
      find("palette").replaceChildren(...COLORS.slice(0, size).map((color, i) => { const dot = document.createElement("i"); dot.style.setProperty("--pl-color", color); dot.title = `${COLOR_NAMES[i]}色`; return dot; }));
    }
    table.querySelectorAll("button").forEach((button, index) => {
      const value = values[index]; button.textContent = `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
      button.style.backgroundColor = value >= 0 ? `rgba(108,206,178,${.06 + value * .3})` : `rgba(226,113,149,${.06 - value * .3})`;
      button.style.color = value >= 0 ? "#c3ebe0" : "#f1c5d4";
      button.setAttribute("aria-label", `${COLOR_NAMES[Math.floor(index / size)]}から${COLOR_NAMES[index % size]}への${value >= 0 ? "引力" : "反発"} ${value.toFixed(2)}`);
    });
    selectCell(selected);
  }
  function receive({ data }) {
    busy = false;
    if (data.error) { fail(data.error); return; }
    recycle = data.buffer; lastSnapshot = data;
    const positions = new Float32Array(data.buffer);
    if (data.clear) renderer.clear();
    if ((inView || recording) && !document.hidden) renderer.draw(positions, find("trails").checked && !paused);
    if (data.matrix) renderMatrix(data.matrix, data.species);
    find("world-id").textContent = data.seed.toString(16).padStart(8, "0").slice(0, 6).toUpperCase(); find("generation").textContent = `GEN ${String(data.generation).padStart(2, "0")}`;
    if (find("controls").disabled) { find("controls").disabled = false; pauseButton.disabled = false; find("fullscreen").disabled = false; find("loading").hidden = true; status(reducedMotion ? "準備完了。再生ボタンで観察を始められます。" : "小さな世界が動き始めました。ドラッグで粒子に触れられます。"); }
    if (data.mutated) status(`第${data.generation}世代へ突然変異。引力と反発のルールが変わりました。`);
    const now = performance.now(); fpsFrames++;
    if (now - lastHUD > 200 || paused || data.clear || data.matrix) {
      lastHUD = now; find("population").textContent = data.count.toLocaleString();
      find("countdown").textContent = find("auto").checked ? `次の変異 ${Math.ceil(data.countdown)}s` : "自動変異 OFF";
      if (now - fpsSince > 700) { find("fps").textContent = paused ? "PAUSED" : `${Math.round(fpsFrames * 1000 / (now - fpsSince))} FPS`; fpsFrames = 0; fpsSince = now; }
    }
    schedule();
  }
  function resize() {
    if (!renderer) return;
    const rect = stage.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
    worldWidth = Math.max(.35, Math.min(4, rect.width / rect.height)); renderer.resize(rect.width, rect.height); queue({ type: "resize", width: worldWidth });
  }
  function initialize() {
    if (started || root.dataset.state === "error") return;
    try {
      renderer = createParticleRenderer(canvas); worker = new Worker(root.dataset.workerSrc); worker.onmessage = receive; worker.onerror = event => fail(event.message);
      started = true; seed = newSeed(); commands.push({ type: "init", options: { count: Number(count.value), species: Number(species.value), seed, preset: preset.value, width: worldWidth } });
      commands.push({ type: "config", options: { auto: find("auto").checked } });
      new ResizeObserver(resize).observe(stage); resize(); updateState(); schedule();
    } catch (error) { fail(error); }
  }
  function setPaused(value) {
    paused = value; lastSent = 0; accumulator = 0; fpsSince = performance.now(); fpsFrames = 0; find("fps").textContent = paused ? "PAUSED" : "— FPS"; updateState();
    status(paused ? "観察を一時停止しました。ルールは停止中でも編集できます。" : "観察を再開しました。"); schedule();
  }
  function reset(presetName = preset.value) {
    seed = newSeed(); renderer.clear(); queue({ type: "reset", options: { seed, count: Number(count.value), species: Number(species.value), preset: presetName } });
    status("新しい世界をつくりました。色ごとの引力・反発から形が生まれます。");
  }
  pauseButton.addEventListener("click", () => setPaused(!paused));
  find("new").addEventListener("click", () => reset());
  find("mutate").addEventListener("click", () => queue({ type: "mutate" }));
  find("scatter").addEventListener("click", () => { queue({ type: "scatter" }); status("粒子の配置をかき混ぜました。ルールはそのままです。"); });
  preset.addEventListener("change", () => reset());
  count.addEventListener("change", () => queue({ type: "population", count: Number(count.value) }));
  species.addEventListener("change", () => reset());
  speed.addEventListener("input", () => { find("speed-output").textContent = `${Number(speed.value).toFixed(2).replace(/0$/, "")}×`; });
  radius.addEventListener("input", () => { find("radius-output").textContent = `${radius.value}%`; queue({ type: "config", options: { radius: Number(radius.value) / 100 } }); });
  find("auto").addEventListener("change", () => queue({ type: "config", options: { auto: find("auto").checked } }));
  find("trails").addEventListener("change", () => { renderer?.clear(); queue({ type: "resize", width: worldWidth }); });
  ruleRange.addEventListener("input", () => {
    matrix[selected] = Number(ruleRange.value); renderMatrix(matrix, matrixSpecies);
    queue({ type: "edit", row: Math.floor(selected / matrixSpecies), column: selected % matrixSpecies, value: Number(ruleRange.value) });
  });
  find("matrix").addEventListener("keydown", event => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -matrixSpecies, ArrowDown: matrixSpecies }[event.key];
    if (delta !== undefined) { event.preventDefault(); selectCell(selected + delta, true); }
  });
  root.querySelectorAll("[data-pl-tool]").forEach(button => button.addEventListener("click", () => { pointerTool = button.dataset.plTool; root.querySelectorAll("[data-pl-tool]").forEach(item => item.setAttribute("aria-pressed", String(item === button))); }));
  function clearPointer() { pointer.active = false; activePointer = null; find("cursor").hidden = true; }
  function movePointer(event) {
    const rect = canvas.getBoundingClientRect(), px = Math.max(0, Math.min(rect.width, event.clientX - rect.left)), py = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    pointer.x = px / rect.width * worldWidth; pointer.y = py / rect.height;
    const cursor = find("cursor"); cursor.style.left = `${px}px`; cursor.style.top = `${py}px`; cursor.dataset.mode = pointer.mode;
  }
  canvas.addEventListener("pointerdown", event => {
    if (!started || activePointer !== null || ![0, 2].includes(event.button)) return;
    event.preventDefault(); stage.focus({ preventScroll: true }); activePointer = event.pointerId; pointer.active = true; pointer.mode = event.button === 2 ? "repel" : pointerTool;
    movePointer(event); find("cursor").hidden = false; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => { if (event.pointerId === activePointer) movePointer(event); });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, clearPointer);
  canvas.addEventListener("contextmenu", event => event.preventDefault()); window.addEventListener("blur", clearPointer);
  stage.addEventListener("keydown", event => {
    if (!started || event.repeat) return;
    if (event.code === "Space") { event.preventDefault(); setPaused(!paused); }
    if (event.code === "KeyM") { event.preventDefault(); queue({ type: "mutate" }); }
    if (event.code === "KeyR") { event.preventDefault(); queue({ type: "scatter" }); }
  });
  if (!panel.requestFullscreen || !document.fullscreenEnabled) find("fullscreen").hidden = true;
  find("fullscreen").addEventListener("click", async () => {
    try { if (document.fullscreenElement === panel) await document.exitFullscreen(); else await panel.requestFullscreen(); }
    catch { status("このブラウザでは全画面表示を利用できません。"); }
  });
  document.addEventListener("fullscreenchange", () => { const full = document.fullscreenElement === panel; find("fullscreen").textContent = full ? "縮小 ↙" : "全画面 ↗"; resize(); });
  canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); fail("WebGL context lost"); });
  find("retry").addEventListener("click", () => location.reload());
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting; lastSent = 0; accumulator = 0; clearPointer();
    if (inView) { initialize(); if (lastSnapshot && recycle?.byteLength) renderer.draw(new Float32Array(recycle), false); schedule(); }
    else if (!recording) { cancelAnimationFrame(frame); frame = 0; }
    updateState();
  }, { rootMargin: "100px 0px" }).observe(stage);
  document.addEventListener("visibilitychange", () => { lastSent = 0; clearPointer(); if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); updateState(); });
  window.addEventListener("pagehide", () => { cancelAnimationFrame(frame); frame = 0; clearPointer(); });
  setupParticleSharing({ root, canvas,
    onRecordingChange(value) {
      recording = value;
      if (value) { pausedBeforeRecording = paused; setPaused(false); }
      else { if (pausedBeforeRecording) setPaused(true); updateState(); }
      schedule();
    },
    getWorldID: () => find("world-id").textContent,
    getCaption: () => `小さなルールから生まれた、わたしのParticle Life。\n${preset.selectedOptions[0].textContent} / ${Number(count.value).toLocaleString()}粒子\n#ParticleLife\n${location.origin}${location.pathname}#particle-life`,
  });
  updateState();
}
