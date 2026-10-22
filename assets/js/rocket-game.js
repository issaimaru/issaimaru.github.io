import { MISSIONS, FIXED_STEP, MAX_SCORE, LANDING_LIMITS, ROCKET_RADIUS, createFlight, stepFlight, brakingAltitude, clamp } from "./rocket-model.mjs";
import { createAscent, stepAscent, fuelGate } from "./rocket-ascent.mjs";

const root = document.querySelector("[data-rocket-game]");
if (root) {
  const find = name => root.querySelector(`[data-rocket-${name}]`);
  const viewport = find("viewport"), primary = find("start"), retry = find("retry"), pauseButton = find("pause");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const landingStorageKey = "issaimaru-soft-landing-v1", ascentStorageKey = "issaimaru-rocket-distance-v1";
  const keys = new Set(), heldCodes = new Set(), pointers = new Map();
  const buttons = [...root.querySelectorAll("[data-rocket-control]")];
  const engineBars = [...root.querySelectorAll(".rocket-engine i")];
  let mode = "ascent", missionIndex = 0, flight = createAscent(), results = [], best = 0, recordText = "", eventText = "", eventUntil = 0;
  let state = "loading", scene = null, initialization = null, inView = false, frame = 0, previous = 0, accumulator = 0, hudTime = 0, resultTimer = 0, restingTime = 0;
  let audioContext, engineGain, engineFilter, audioEnabled = false;
  function loadBest() {
    best = 0;
    try { const saved = Number(localStorage.getItem(mode === "ascent" ? ascentStorageKey : landingStorageKey)); if (Number.isInteger(saved) && saved >= 0 && saved <= (mode === "ascent" ? 1e9 : MAX_SCORE)) best = saved; } catch { /* Storage is optional. */ }
    find("best").textContent = best ? best.toLocaleString() : "—";
  }
  loadBest();

  function ensureAudio() {
    if (audioContext) { audioContext.resume().catch(() => {}); return; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioContext = new Context();
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
    const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource(); source.buffer = buffer; source.loop = true;
    engineFilter = audioContext.createBiquadFilter(); engineFilter.type = "lowpass"; engineFilter.frequency.value = 400;
    engineGain = audioContext.createGain(); engineGain.gain.value = 0;
    source.connect(engineFilter).connect(engineGain).connect(audioContext.destination); source.start();
  }
  function soundPower(power) {
    if (!audioContext) return;
    engineGain.gain.setTargetAtTime(audioEnabled ? power * .15 : 0, audioContext.currentTime, .08);
    engineFilter.frequency.setTargetAtTime(180 + power * 1000, audioContext.currentTime, .1);
  }
  function impactSound(success) {
    if (!audioEnabled || !audioContext) return;
    const now = audioContext.currentTime;
    (success ? [523.25, 659.25, 783.99] : [85, 45]).forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), at = now + index * (success ? .12 : .06);
      oscillator.type = success ? "sine" : "sawtooth"; oscillator.frequency.setValueAtTime(frequency, at);
      if (!success) oscillator.frequency.exponentialRampToValueAtTime(20, at + .45);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(success ? .1 : .15, at + .015); gain.gain.exponentialRampToValueAtTime(.001, at + .5);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + .55);
    });
  }
  function setState(next) {
    state = next; restingTime = 0; root.dataset.state = next;
    pauseButton.disabled = next !== "playing" && next !== "paused";
    pauseButton.textContent = next === "paused" ? "再開" : "一時停止";
    pauseButton.setAttribute("aria-label", next === "paused" ? "ゲームを再開" : "ゲームを一時停止");
    find("guidance").hidden = next !== "playing";
    find("flight-label").textContent = ({ loading: "INITIALIZING", ready: "FLIGHT SYSTEMS ONLINE", playing: "MANUAL FLIGHT / RCS ACTIVE", paused: "FLIGHT PAUSED", crashed: "SIGNAL LOST", landed: "LANDING CONFIRMED", complete: "ALL MISSIONS COMPLETE", error: "SYSTEM OFFLINE" })[next];
    if (next !== "playing") { clearInput(); soundPower(0); }
  }
  function clearInput() {
    keys.clear(); heldCodes.clear(); pointers.clear(); buttons.forEach(button => { button.dataset.active = "false"; });
  }
  const isPressed = name => keys.has(name) || [...pointers.values()].includes(name);
  function input() {
    let horizontal = Number(isPressed("right")) - Number(isPressed("left"));
    let vertical = Number(isPressed("down")) - Number(isPressed("up"));
    // Screen-space directions match the fixed camera azimuth.
    const rightX = .86 / Math.hypot(.72, .86), rightZ = -.72 / Math.hypot(.72, .86);
    return { x: rightX * horizontal - rightZ * vertical, z: rightZ * horizontal + rightX * vertical, thrust: isPressed("thrust") };
  }
  function updateButtons() { buttons.forEach(button => { button.dataset.active = isPressed(button.dataset.rocketControl) ? "true" : "false"; }); }
  function updateProgress() {
    root.querySelectorAll("[data-rocket-step]").forEach((step, index) => {
      step.dataset.complete = results[index]?.success ? "true" : "false";
      if (index === missionIndex) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current");
      step.setAttribute("aria-label", `${index + 1}番目のミッション${results[index]?.success ? " クリア" : ""}`);
    });
    find("score").textContent = mode === "ascent" ? Math.floor(flight.maxAltitude).toLocaleString() : results.reduce((sum, result) => sum + result.score, 0).toLocaleString();
  }
  function updateHUD() {
    find("altitude").textContent = Math.max(0, flight.y).toFixed(1);
    find("descent").textContent = mode === "ascent" ? `${flight.vy < 0 ? "↓" : ""}${Math.abs(flight.vy).toFixed(1)}` : flight.vy > 0 ? `↑${flight.vy.toFixed(1)}` : Math.abs(flight.vy).toFixed(1);
    find("fuel").textContent = Math.ceil(flight.fuel);
    find("altitude-bar").style.width = `${mode === "ascent" ? clamp(flight.y / Math.max(100, best) * 100, 0, 100) : clamp(flight.y / MISSIONS[missionIndex].altitude * 100, 0, 100)}%`;
    find("descent-bar").style.width = `${clamp(Math.abs(flight.vy) / 25 * 100, 0, 100)}%`;
    find("fuel-bar").style.width = `${flight.fuel}%`;
    find("fuel").parentElement.parentElement.dataset.danger = String(flight.fuel < 20);
    find("descent-stat").dataset.danger = String(mode === "ascent" ? flight.vy < -3 : -flight.vy > LANDING_LIMITS.vertical);
    const rightX = .86 / Math.hypot(.72, .86), rightZ = -.72 / Math.hypot(.72, .86);
    const project = (x, z) => ({ x: x * rightX + z * rightZ, y: -x * rightZ + z * rightX });
    const gate = mode === "ascent" ? fuelGate(flight.nextGate) : null;
    const offset = project(flight.x - (gate?.x || 0), flight.z - (gate?.z || 0)), velocity = project(flight.vx, flight.vz);
    const dotX = 50 + clamp(offset.x, -30, 30) * 1.35, dotY = 50 + clamp(offset.y, -30, 30) * 1.35;
    find("radar-dot").setAttribute("cx", dotX); find("radar-dot").setAttribute("cy", dotY);
    const vector = find("radar-vector"); vector.setAttribute("x1", dotX); vector.setAttribute("y1", dotY); vector.setAttribute("x2", clamp(dotX + velocity.x * 4, 5, 95)); vector.setAttribute("y2", clamp(dotY + velocity.y * 4, 5, 95));
    find("radar-pad").setAttribute("r", (gate ? gate.radius : MISSIONS[missionIndex].radius - ROCKET_RADIUS) * 1.35);
    find("offset").textContent = gate ? `次の燃料 ↑ ${Math.max(0, gate.y - flight.y).toFixed(0)} m` : `${Math.hypot(flight.x, flight.z).toFixed(1)} m / 横 ${Math.hypot(flight.vx, flight.vz).toFixed(1)}`;
    engineBars.forEach((bar, index) => { bar.dataset.on = String(index < Math.round(flight.throttle * 12) && state === "playing"); });
    find("engine-label").textContent = flight.fuel <= 0 ? "FUEL EMPTY" : state === "playing" && flight.throttle > .05 ? `${Math.round(flight.throttle * 100)}% THRUST` : "STANDBY";
    if (mode === "ascent") {
      find("heat").textContent = flight.cooldown > 0 ? "COOLING" : `${Math.round(flight.heat)}%`;
      find("heat-bar").style.width = `${flight.heat}%`; find("heat-panel").dataset.danger = String(flight.heat > 75 || flight.cooldown > 0);
      find("hull").textContent = `機体 ${"● ".repeat(flight.hull)}${"○ ".repeat(3 - flight.hull)}`;
      find("pickups").textContent = flight.pickups; updateProgress();
      if (state === "playing") {
        let text = flight.y < 8 ? "Space / 噴射ボタンで、テイクオフ！" : "燃料レーダーの白い点を、中央の円へ";
        if (flight.time < eventUntil) text = eventText;
        if (flight.fuel <= 0) text = "燃料切れ — どこまで届く？";
        else if (flight.cooldown > 0) text = "オーバーヒート！ 少し休んで再噴射";
        else if (flight.heat > 80) text = "エンジン高温 — 噴射を離して冷却";
        find("guidance-text").textContent = text; find("guidance").dataset.danger = String(flight.heat > 80 || flight.fuel <= 0);
      }
      return;
    }
    if (state === "playing") {
      const brake = flight.y < brakingAltitude(flight) + 5 && flight.vy < -4;
      const drift = Math.hypot(flight.vx, flight.vz);
      let text = "短く噴射して、降下速度を調整";
      if (flight.fuel <= 0) text = "燃料切れ — エンジン停止";
      else if (brake) text = "噴射して減速！ Space / 噴射ボタン";
      else if (flight.vy > 3) text = "上昇中 — 噴射を止めて降下しよう";
      else if (drift > 3) text = "横流れあり — 逆方向に操作してブレーキ";
      else if (Math.hypot(flight.x, flight.z) > MISSIONS[missionIndex].radius - 2) text = "レーダーの白い点を、中央の円へ";
      else if (flight.y < 14 && flight.vy >= -4.8) text = "いいペース。方向キーを離して、まっすぐ接地";
      find("guidance-text").textContent = text; find("guidance").dataset.danger = String(brake || flight.fuel <= 0);
    }
  }
  function showOverlay({ eyebrow, title, description, action, note = "", secondary = false }) {
    find("eyebrow").textContent = eyebrow; find("overlay-title").textContent = title; find("overlay-description").textContent = description;
    primary.textContent = action; primary.disabled = false; retry.hidden = !secondary; find("overlay-note").textContent = note;
    find("overlay").hidden = false;
    // Keep keyboard play in the game; pointer users can still use every control.
    if (root.contains(document.activeElement) && inView) primary.focus({ preventScroll: true });
  }
  function beginMission(index) {
    clearTimeout(resultTimer); missionIndex = index; results = results.slice(0, index);
    flight = mode === "ascent" ? createAscent() : createFlight(MISSIONS[index]); accumulator = 0; previous = 0; hudTime = 0; eventUntil = 0; recordText = ""; clearInput();
    const mission = MISSIONS[index]; scene.reset(mission, mode);
    root.style.setProperty("--rocket-accent", `#${mission.color.toString(16).padStart(6, "0")}`);
    find("mission-number").textContent = mode === "ascent" ? "∞ / FLIGHT" : `0${index + 1} / 03`; find("mission-name").textContent = mode === "ascent" ? "飛距離チャレンジ" : mission.name;
    find("overlay").hidden = true; find("result").hidden = true; find("copy").hidden = true; find("flash").style.opacity = "0";
    setState("playing"); updateProgress(); updateHUD();
    find("status").textContent = mode === "ascent" ? "飛距離チャレンジ開始。燃料の輪を拾って、最高到達高度を伸ばそう。" : `ミッション${index + 1}「${mission.name}」。${mission.note}`;
    viewport.focus({ preventScroll: true }); if (audioEnabled) ensureAudio(); loop();
  }
  function finishFlight() {
    const result = flight.contact, mission = MISSIONS[missionIndex];
    scene.impact(flight, result.success); impactSound(result.success);
    if (result.success) { results[missionIndex] = result; updateProgress(); }
    const complete = result.success && missionIndex === MISSIONS.length - 1;
    setState(result.success ? complete ? "complete" : "landed" : "crashed"); updateHUD();
    const total = results.reduce((sum, entry) => sum + entry.score, 0);
    let record = false;
    if (complete && total > best) {
      record = true; best = total; try { localStorage.setItem(landingStorageKey, String(best)); } catch { /* Play without storage. */ }
      find("best").textContent = best.toLocaleString();
    }
    find("status").textContent = result.success ? `${mission.name}に着陸。${result.grade}、${result.score}点。${complete ? `全ミッションクリア、合計${total}点。` : "次のミッションへ進めます。"}` : result.reason;
    find("flash").style.opacity = reduceMotion ? "0" : result.success ? ".08" : ".4";
    setTimeout(() => { find("flash").style.opacity = "0"; }, 120);
    resultTimer = setTimeout(() => {
      const resultBox = find("result"); resultBox.replaceChildren();
      if (result.success) {
        for (const [label, value] of [["接地速度", `${result.vertical.toFixed(1)} m/s`], ["中心から", `${result.distance.toFixed(1)} m`], [complete ? "合計スコア" : "スコア", `${complete ? total.toLocaleString() : result.score} pt`]]) {
          const column = document.createElement("div"), small = document.createElement("small"), strong = document.createElement("strong"); small.textContent = label; strong.textContent = value; column.append(small, strong); resultBox.append(column);
        }
      }
      resultBox.hidden = !result.success;
      showOverlay({ eyebrow: result.grade, title: complete ? "おかえり、パイロット。" : result.success ? "月面に、足跡を。" : "次は、きっと降りられる。", description: complete ? `${record ? "自己ベスト更新！ " : ""}3つの着陸場を制覇。\n次は、もっと静かなタッチダウンを。` : result.success ? `${mission.name}への着陸に成功。\n燃料・精度・接地速度でスコアが変わります。` : result.reason, action: complete ? "もう一度、月を目指す →" : result.success ? "次のミッションへ →" : "もう一度トライ →", secondary: result.success, note: result.success ? "噴射は短く。着陸は、やさしく。" : "R キーでも、すぐにリトライ" });
    }, reduceMotion ? 150 : 850);
  }
  function showResultColumns(columns) {
    const box = find("result"); box.replaceChildren(); box.hidden = false;
    columns.forEach(([label, value]) => { const div = document.createElement("div"), small = document.createElement("small"), strong = document.createElement("strong"); small.textContent = label; strong.textContent = value; div.append(small, strong); box.append(div); });
  }
  function finishAscent() {
    const distance = Math.floor(flight.maxAltitude), record = distance > best;
    if (record) { best = distance; try { localStorage.setItem(ascentStorageKey, String(best)); } catch { /* Optional local best. */ } find("best").textContent = best.toLocaleString(); }
    scene.impact(flight, flight.hull > 0); impactSound(record); setState("crashed"); updateHUD();
    find("flight-label").textContent = "FLIGHT COMPLETE";
    find("status").textContent = `${record ? "自己ベスト更新！ " : ""}最高到達高度 ${distance.toLocaleString()}m。${flight.contact.reason}`;
    recordText = `ROCKET CLUB 🚀 飛距離チャレンジ\n最高到達高度 ${distance.toLocaleString()} m${record ? " / 自己ベスト！" : ""}\n燃料回収 ${flight.pickups}回 / ${flight.time.toFixed(1)}秒\n${location.origin}${location.pathname}#pit-stop`;
    resultTimer = setTimeout(() => {
      showResultColumns([["最高到達高度", `${distance.toLocaleString()} m`], ["燃料回収", `${flight.pickups} 回`], ["飛行時間", `${flight.time.toFixed(1)} s`]]);
      showOverlay({ eyebrow: record ? "A NEW PERSONAL BEST." : "ONE MORE FLIGHT?", title: record ? "その先へ、届いた。" : "あと少し、遠くへ。", description: flight.contact.reason, action: "もう一度、飛ばす →", note: "記録をコピーして、友達に挑戦状を。" });
      find("copy").hidden = false; find("copy").disabled = false; find("copy").textContent = "記録をコピーして競う ↗";
    }, reduceMotion ? 150 : 700);
  }
  function selectMode(next) {
    if (!scene || state === "error") return;
    clearTimeout(resultTimer); mode = next; missionIndex = 0; results = []; recordText = ""; flight = mode === "ascent" ? createAscent() : createFlight();
    root.dataset.mode = mode; scene.reset(MISSIONS[0], mode); accumulator = 0; previous = 0; eventUntil = 0;
    root.style.setProperty("--rocket-accent", "#9cf1d8");
    root.querySelectorAll("[data-rocket-mode]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.rocketMode === mode)); });
    find("progress").hidden = mode === "ascent"; find("flight-record").hidden = mode !== "ascent"; find("heat-panel").hidden = mode !== "ascent";
    find("mission-number").textContent = mode === "ascent" ? "∞ / FLIGHT" : "01 / 03"; find("mission-name").textContent = mode === "ascent" ? "飛距離チャレンジ" : MISSIONS[0].name;
    find("altitude-label").innerHTML = mode === "ascent" ? "ALTITUDE <small>到達高度</small>" : "ALTITUDE <small>高度</small>";
    find("speed-label").innerHTML = mode === "ascent" ? "ASCENT <small>上昇速度</small>" : "DESCENT <small>降下速度</small>";
    find("radar-label").textContent = mode === "ascent" ? "FUEL RADAR" : "LANDING RADAR";
    find("score-label").textContent = mode === "ascent" ? "到達高度" : "合計"; find("score-unit").textContent = mode === "ascent" ? "m" : "/ 3,000"; find("best-unit").textContent = mode === "ascent" ? "m" : "pt";
    find("control-title").textContent = mode === "ascent" ? "飛ばせ。拾え。自己ベストの、その先へ。" : "ゆっくり、まっすぐ、真ん中へ。";
    find("thrust-help").textContent = mode === "ascent" ? "噴射で上昇" : "噴射で減速";
    find("control-help").textContent = mode === "ascent" ? "光の輪を通って燃料を回収。噴射を休むと冷却できます。隕石に3回ぶつかると終了。" : "接地は降下 4.8 m/s・横流れ 3 m/s 以下で。方向キーを離すと機体が起き上がります。";
    retry.textContent = mode === "ascent" ? "最初から飛ばす" : "このミッションをやり直す";
    find("result").hidden = true; find("copy").hidden = true; find("flash").style.opacity = "0"; loadBest(); setState("ready");
    showOverlay(mode === "ascent" ? { eyebrow: "THE SKY IS NOT THE LIMIT.", title: "燃料の先に、\nまだ見ぬ景色。", description: "光る燃料を回収して、どこまでも。\n隕石とエンジンの熱には、ご用心。", action: "飛距離チャレンジをはじめる →", note: "最高到達高度で勝負 · 自己ベストを保存" } : { eyebrow: "YOUR NEXT 60 SECONDS, ELSEWHERE.", title: "降りるだけ。\nが、むずかしい。", description: "噴射で減速。傾けて軌道修正。\n燃料が尽きる前に、光る着陸場へ。", action: "着陸をはじめる →", note: "全3ミッション · 何度でもリトライ" });
    find("status").textContent = mode === "ascent" ? "燃料の輪を拾って、最高到達高度に挑戦。記録はコピーして共有できます。" : "準備完了。Spaceで噴射、矢印キーで移動。スマホは下のボタンで操作できます。";
    updateProgress(); updateHUD(); loop();
  }
  function pause(reason = "時間は止まっています。ひと息ついたら、続きをどうぞ。") {
    if (state !== "playing") return;
    setState("paused"); find("result").hidden = true; find("copy").hidden = true;
    find("status").textContent = "フライトを一時停止しました。";
    showOverlay({ eyebrow: "TAKE YOUR TIME.", title: "フライト、一時停止。", description: reason, action: "フライトに戻る →", secondary: true, note: "P / Esc でも再開できます" });
    updateHUD();
  }
  function resume() {
    if (state !== "paused") return;
    find("overlay").hidden = true; previous = 0; accumulator = 0; setState("playing"); viewport.focus({ preventScroll: true });
    find("status").textContent = "フライトを再開しました。"; if (audioEnabled) ensureAudio(); loop();
  }
  function loop() {
    if (frame || !scene || !inView || document.hidden || state === "error") return;
    frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!scene || !inView || document.hidden) { previous = 0; return; }
    const dt = previous ? Math.min((now - previous) / 1000, .06) : 0; previous = now;
    if (state === "playing") {
      accumulator += dt; const controls = input();
      while (accumulator >= FIXED_STEP && state === "playing") {
        flight = mode === "ascent" ? stepAscent(flight, controls, FIXED_STEP) : stepFlight(flight, controls, MISSIONS[missionIndex]); accumulator -= FIXED_STEP;
        if (mode === "ascent" && flight.event) {
          eventText = ({ pickup: "FUEL +24% / エンジンも冷却！", missed: "燃料を通過。次の光を狙おう", hit: "隕石に接触！ 機体と燃料にダメージ", overheat: "オーバーヒート！ 噴射を休めよう" })[flight.event]; eventUntil = flight.time + 1.8;
          if (flight.event === "pickup" || flight.event === "hit") { scene.pulse?.(flight, flight.event); if (flight.event === "pickup") impactSound(true); }
          find("status").textContent = eventText;
        }
        if (flight.contact) mode === "ascent" ? finishAscent() : finishFlight();
      }
      soundPower(flight.throttle);
    }
    hudTime += dt; if (hudTime > .06) { updateHUD(); hudTime = 0; }
    scene.render(flight, dt, { playing: state === "playing", idle: state === "ready" });
    restingTime = state === "playing" ? 0 : restingTime + dt;
    // Pause and settled result screens do not keep the GPU running.
    if (state === "paused" || (restingTime > 3 && ["crashed", "complete", "landed"].includes(state)) || (state === "ready" && reduceMotion)) return;
    loop();
  }
  async function initialize() {
    if (scene || initialization) return initialization;
    initialization = (async () => {
      try {
        const { createScene } = await import(root.dataset.sceneSrc);
        scene = createScene(find("canvas"), { reducedMotion: reduceMotion, onContextLost: () => {
          setState("error"); clearTimeout(resultTimer); find("result").hidden = true;
          showOverlay({ eyebrow: "RENDERER PAUSED", title: "描画が中断されました。", description: "ゲームを再読み込みすると、もう一度挑戦できます。", action: "ゲームを再読み込み", note: "自己ベストは保存されています" });
          find("status").textContent = "3D描画が中断されました。再読み込みしてください。";
        } });
        selectMode(mode);
      } catch (error) {
        setState("error");
        showOverlay({ eyebrow: "3D RENDERER UNAVAILABLE", title: "3D描画を始められません。", description: "ブラウザのWebGLを有効にして、ゲームを再読み込みしてください。", action: "ゲームを再読み込み", note: "最新のChrome・Safari・Firefoxに対応" });
        find("status").textContent = "3D描画の初期化に失敗しました。WebGLが利用できるブラウザで開いてください。";
        console.error("Soft Landing initialization failed", error);
      }
    })();
    return initialization;
  }
  primary.addEventListener("click", () => {
    if (state === "error") { location.reload(); return; }
    if (state === "paused") resume();
    else if (scene) beginMission(state === "landed" ? missionIndex + 1 : state === "complete" ? 0 : missionIndex);
  });
  retry.addEventListener("click", () => { if (scene && state !== "error") beginMission(missionIndex); });
  root.querySelectorAll("[data-rocket-mode]").forEach(button => { button.addEventListener("click", () => { if (button.dataset.rocketMode !== mode) selectMode(button.dataset.rocketMode); }); });
  find("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(recordText); find("copy").textContent = "記録をコピーしました ✓"; }
    catch { find("copy").textContent = "コピーできませんでした。もう一度お試しください"; }
  });
  pauseButton.addEventListener("click", () => { if (state === "paused") resume(); else pause(); });
  find("sound").addEventListener("click", () => {
    try { ensureAudio(); if (!audioContext) throw new Error("Audio unavailable"); audioEnabled = !audioEnabled; }
    catch { find("sound").textContent = "音 非対応"; find("sound").disabled = true; return; }
    find("sound").textContent = `音 ${audioEnabled ? "ON" : "OFF"}`; find("sound").setAttribute("aria-pressed", String(audioEnabled));
    find("sound").setAttribute("aria-label", `ゲームの音を${audioEnabled ? "オフ" : "オン"}にする`); if (!audioEnabled) soundPower(0);
  });
  const fullscreenButton = find("fullscreen"), consoleElement = root.querySelector(".rocket-console");
  if (!consoleElement.requestFullscreen || !document.fullscreenEnabled) fullscreenButton.hidden = true;
  fullscreenButton.addEventListener("click", async () => {
    try { if (document.fullscreenElement === consoleElement) await document.exitFullscreen(); else await consoleElement.requestFullscreen(); }
    catch { find("status").textContent = "このブラウザでは全画面表示を利用できません。"; }
  });
  document.addEventListener("fullscreenchange", () => {
    const full = document.fullscreenElement === consoleElement; fullscreenButton.textContent = full ? "縮小 ↙" : "全画面 ↗";
    fullscreenButton.setAttribute("aria-label", full ? "全画面を終了する" : "ゲームを全画面にする"); scene?.resize();
  });
  const keyMap = { Space: "thrust", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down" };
  // Physical keys remain separate, so releasing W cannot cancel a held ArrowUp.
  function syncKeys() { keys.clear(); heldCodes.forEach(code => { if (keyMap[code]) keys.add(keyMap[code]); }); updateButtons(); }
  window.addEventListener("keydown", event => {
    if (!root.contains(document.activeElement) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if ((event.code === "KeyP" || event.code === "Escape") && (state === "playing" || state === "paused")) { event.preventDefault(); if (!event.repeat) { heldCodes.clear(); state === "paused" ? resume() : pause(); } return; }
    if (event.code === "KeyR" && scene && state !== "loading" && state !== "error") { event.preventDefault(); if (!event.repeat) { heldCodes.clear(); beginMission(missionIndex); } return; }
    if (state !== "playing" || !keyMap[event.code]) return;
    if (event.target.closest(".rocket-tools, .rocket-mode-switch")) return;
    event.preventDefault(); heldCodes.add(event.code); syncKeys();
  });
  window.addEventListener("keyup", event => { if (heldCodes.delete(event.code)) { event.preventDefault(); syncKeys(); } });
  buttons.forEach(button => {
    const control = button.dataset.rocketControl;
    button.addEventListener("pointerdown", event => {
      if (state !== "playing" || event.button !== 0) return;
      event.preventDefault(); viewport.focus({ preventScroll: true }); pointers.set(event.pointerId, control); button.setPointerCapture(event.pointerId); updateButtons();
    });
    const release = event => { if (pointers.delete(event.pointerId)) updateButtons(); };
    button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", event => event.preventDefault());
    button.addEventListener("keydown", event => {
      if (state !== "playing" || !["Enter", "Space"].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation(); pointers.set(`keyboard-${control}`, control); updateButtons();
    });
    button.addEventListener("keyup", event => { if (["Enter", "Space"].includes(event.code)) { event.preventDefault(); event.stopPropagation(); pointers.delete(`keyboard-${control}`); updateButtons(); } });
    button.addEventListener("blur", () => { pointers.delete(`keyboard-${control}`); updateButtons(); });
  });
  window.addEventListener("blur", () => { heldCodes.clear(); clearInput(); pause("画面から離れたので、一時停止しました。"); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { heldCodes.clear(); pause("画面から離れたので、一時停止しました。"); cancelAnimationFrame(frame); frame = 0; previous = 0; soundPower(0); }
    else loop();
  });
  const observer = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) { initialize(); loop(); }
    else { heldCodes.clear(); pause("ゲームが画面の外に移ったので、一時停止しました。"); cancelAnimationFrame(frame); frame = 0; previous = 0; soundPower(0); }
  }, { rootMargin: "100px 0px", threshold: 0 });
  observer.observe(viewport);
  window.addEventListener("pagehide", () => { clearInput(); heldCodes.clear(); soundPower(0); });
}
