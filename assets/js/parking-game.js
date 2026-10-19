import { MAX_HOLD_MS, TRACK_DISTANCE, ROUND_COUNT, MAX_SCORE, distanceForHold, dayInTokyo, coursesForDay, windForCourse, judgeStop, summarizeRun, coastProgress } from "./parking-model.mjs";

const game = document.querySelector("[data-parking-game]");
if (game) {
  const find = name => game.querySelector(`[data-game-${name}]`);
  const button = find("hold");
  const resetButton = find("reset");
  const scene = find("scene");
  const car = find("car");
  const targetMarker = find("target");
  const message = find("status");
  const storageKey = "issaimaru-pitstop-v2";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let day, courses, best;
  let round = 0;
  let results = [];
  let state = "ready";
  let frame = 0;
  let windFrame = 0;
  let started = 0;
  let roundStarted = 0;
  let currentDistance = 0;
  let sceneWidth = scene.clientWidth;
  let activePointer = null;
  let activeKey = null;
  let inView = false;
  let restoreFocus = false;
  let recordText = "";

  function loadDay() {
    day = dayInTokyo();
    courses = coursesForDay(day);
    best = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.day === day && Number.isInteger(saved.score) && saved.score >= 0 && saved.score <= MAX_SCORE && Number.isFinite(saved.difference) && saved.difference >= 0) best = saved;
    } catch { /* Play also works when browser storage is unavailable. */ }
    find("best").textContent = best ? best.score.toLocaleString() : "—";
    find("day").textContent = day.slice(5).replace("-", ".");
    find("day").dateTime = day;
    find("day").title = `${day} / 日本時間の日替わりコース`;
  }
  function setState(next) { state = next; game.dataset.state = next; }
  function coordinate(distance) { return 40 + (Math.max(80, sceneWidth) - 80) * distance / TRACK_DISTANCE; }
  function positionCar(distance) {
    currentDistance = distance;
    car.style.left = `${coordinate(distance)}px`;
    find("distance").textContent = distance.toFixed(1);
  }
  function resizeScene() {
    sceneWidth = scene.clientWidth;
    positionCar(currentDistance);
    targetMarker.style.left = `${coordinate(courses[round].target)}px`;
    scene.querySelectorAll("[data-distance]").forEach(tick => { tick.style.left = `${coordinate(Number(tick.dataset.distance))}px`; });
  }
  function releaseCapture() {
    const pointer = activePointer;
    activePointer = null;
    activeKey = null;
    if (pointer !== null && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  }
  function renderWind(now) {
    const wind = windForCourse(courses[round], now - roundStarted);
    find("wind").textContent = Math.abs(wind) < .005 ? "ほぼ無風" : `${wind > 0 ? "追い風 →" : "← 向かい風"} ${Math.abs(wind * 100).toFixed(0)}%`;
    find("wind-readable").textContent = find("wind").textContent;
    find("wind-needle").style.left = `${50 + wind / .15 * 50}%`;
    return wind;
  }
  function animateWind() {
    cancelAnimationFrame(windFrame);
    let lastRender = 0;
    function tick(now) {
      if (document.hidden || !inView || (state !== "ready" && state !== "charging")) return;
      if (now - lastRender > 80) { renderWind(now); lastRender = now; }
      windFrame = requestAnimationFrame(tick);
    }
    if (inView && !document.hidden) windFrame = requestAnimationFrame(tick);
  }
  function renderProgress() {
    game.querySelectorAll("[data-game-round-step]").forEach((step, index) => {
      const result = results[index];
      step.dataset.complete = result ? "true" : "false";
      if (index === round) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
      step.querySelector("b").textContent = result ? result.score : `0${index + 1}`;
      step.setAttribute("aria-label", result ? `${index + 1}走目 ${result.score}点 ${result.grade}` : `${index + 1}走目`);
    });
    find("score").textContent = results.length ? summarizeRun(results).score.toLocaleString() : "0";
  }
  function prepareRound(index) {
    cancelAnimationFrame(frame);
    releaseCapture();
    round = index;
    roundStarted = performance.now();
    const course = courses[round];
    setState("ready");
    delete game.dataset.grade;
    game.dataset.terrain = course.terrain;
    game.style.setProperty("--charge", "0%");
    find("time").textContent = "0.00";
    find("course").textContent = `ROUND ${round + 1} / ${ROUND_COUNT} · ${course.name}`;
    find("surface").textContent = `飛距離 ×${course.surface.toFixed(2)}`;
    find("precision").textContent = `PERFECT ±${course.precision}m`;
    find("goal").textContent = course.target;
    find("target-label").textContent = `${course.target}m`;
    positionCar(0);
    button.disabled = false;
    resetButton.disabled = round === 0;
    find("button-label").textContent = "押してためる → 離して走る";
    message.textContent = `${course.name}、目標${course.target}m。${course.note}風の向きと強さを見て離そう。`;
    renderProgress();
    resizeScene();
    renderWind(performance.now());
    animateWind();
  }
  function resetRun() {
    loadDay();
    results = [];
    recordText = "";
    find("summary").hidden = true;
    find("copy").textContent = "結果をコピー";
    find("copy").disabled = false;
    prepareRound(0);
  }
  function cancelCharge() {
    if (state !== "charging") return;
    cancelAnimationFrame(frame);
    releaseCapture();
    setState("ready");
    game.style.setProperty("--charge", "0%");
    find("time").textContent = "0.00";
    find("button-label").textContent = "押してためる → 離して走る";
    resetButton.disabled = round === 0;
    message.textContent = "操作を中断しました。このコースからやり直せます。";
    animateWind();
  }
  function finish(distance) {
    positionCar(distance);
    const course = courses[round];
    const result = judgeStop(distance, course.target, course.precision);
    results.push(result);
    const total = summarizeRun(results);
    const complete = results.length === ROUND_COUNT;
    setState(complete ? "finished" : "between");
    game.dataset.grade = result.grade.toLowerCase();
    renderProgress();
    const offset = `${result.error < 0 ? "手前" : "先"}${result.difference.toFixed(2)}m`;
    const combo = total.streak > 1 ? ` ${total.streak}連続成功！ +${(total.streak - 1) * 100}点。` : "";
    message.textContent = `${result.grade} · ${result.score}点。${distance.toFixed(2)}mで停車、目標の${offset}。${combo}${complete ? "3走クリア！" : "次は路面も目標も変わります。"}`;
    button.disabled = false;
    resetButton.disabled = false;
    find("button-label").textContent = complete ? "もう一度 3コースに挑戦" : "次のコースへ →";
    if (restoreFocus && (document.activeElement === document.body || document.activeElement === button)) button.focus({ preventScroll: true });
    if (complete) {
      const difference = results.reduce((sum, entry) => sum + entry.difference, 0);
      const isRecord = !best || total.score > best.score || (total.score === best.score && difference < best.difference);
      if (isRecord) {
        best = { day, score: total.score, difference };
        try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch { /* An optional local record. */ }
        find("best").textContent = best.score.toLocaleString();
      }
      find("summary-title").textContent = `${isRecord ? "今日の自己ベスト！" : "FINISH"} ${total.score.toLocaleString()} / ${MAX_SCORE.toLocaleString()}点`;
      find("summary-bonus").textContent = `走行 ${total.score - total.bonus}点 ＋ 連続成功ボーナス ${total.bonus}点`;
      find("summary-rounds").replaceChildren(...results.map((entry, index) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = `${index + 1}. ${courses[index].name}`;
        value.textContent = `${entry.score}点 · ${entry.grade}`;
        item.append(label, value);
        return item;
      }));
      find("summary").hidden = false;
      recordText = `ぴたり、停める。 ${day}\n${total.score} / ${MAX_SCORE}点（3コース）\n${results.map(entry => entry.grade).join(" / ")}\n${location.origin}${location.pathname}#pit-stop`;
    }
  }
  function launch(milliseconds) {
    if (state !== "charging") return;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(windFrame);
    const held = Math.min(MAX_HOLD_MS, Math.max(0, milliseconds));
    const wind = renderWind(performance.now());
    releaseCapture();
    setState("driving");
    restoreFocus = document.activeElement === button;
    button.disabled = true;
    resetButton.disabled = true;
    find("button-label").textContent = "走行中…";
    find("time").textContent = (held / 1000).toFixed(2);
    game.style.setProperty("--charge", `${held / MAX_HOLD_MS * 100}%`);
    message.textContent = `${(held / 1000).toFixed(2)}秒ためてスタート。風と路面が停まる距離を変えます。`;
    const landing = distanceForHold(held, courses[round], wind);
    const duration = reducedMotion.matches ? 250 : 750 + held * .6;
    const departure = performance.now();
    function drive(now) {
      const progress = Math.min(1, (now - departure) / duration);
      positionCar(landing * coastProgress(progress));
      if (progress < 1) frame = requestAnimationFrame(drive);
      else finish(landing);
    }
    frame = requestAnimationFrame(drive);
  }
  function charge(now) {
    if (state !== "charging") return;
    const held = Math.min(MAX_HOLD_MS, now - started);
    game.style.setProperty("--charge", `${held / MAX_HOLD_MS * 100}%`);
    find("time").textContent = (held / 1000).toFixed(2);
    if (held >= MAX_HOLD_MS) launch(MAX_HOLD_MS);
    else frame = requestAnimationFrame(charge);
  }
  function startCharge() {
    if (state !== "ready") return false;
    setState("charging");
    started = performance.now();
    find("button-label").textContent = "風を見て、離そう！";
    message.textContent = "追い風は遠くへ、向かい風は短く。ためすぎると2.4秒で自動発進！";
    resetButton.disabled = true;
    frame = requestAnimationFrame(charge);
    return true;
  }

  button.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || state !== "ready") return;
    event.preventDefault();
    if (!startCharge()) return;
    button.focus({ preventScroll: true });
    activePointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", event => { if (event.pointerId === activePointer) launch(performance.now() - started); });
  button.addEventListener("pointercancel", cancelCharge);
  button.addEventListener("lostpointercapture", () => { if (state === "charging" && activePointer !== null) cancelCharge(); });
  button.addEventListener("keydown", event => {
    if (event.code === "Escape" && state === "charging") { event.preventDefault(); cancelCharge(); return; }
    if ((event.code !== "Space" && event.code !== "Enter") || state === "between" || state === "finished") return;
    event.preventDefault();
    if (!event.repeat && startCharge()) activeKey = event.code;
  });
  window.addEventListener("keyup", event => {
    if (event.code === activeKey) { event.preventDefault(); launch(performance.now() - started); }
  });
  // Transition buttons use a normal click; a fresh press starts the next drive.
  button.addEventListener("click", () => {
    if (state === "between") prepareRound(round + 1);
    else if (state === "finished") resetRun();
  });
  button.addEventListener("blur", cancelCharge);
  window.addEventListener("blur", cancelCharge);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelCharge(); cancelAnimationFrame(windFrame); }
    else animateWind();
  });
  button.addEventListener("contextmenu", event => event.preventDefault());
  resetButton.addEventListener("click", () => { resetRun(); button.focus({ preventScroll: true }); });
  find("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(recordText);
      find("copy").textContent = "コピーしました";
    } catch {
      find("copy").textContent = "コピーできませんでした";
    }
  });
  resetRun();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resizeScene).observe(scene);
  else window.addEventListener("resize", resizeScene);
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (!inView) { cancelCharge(); cancelAnimationFrame(windFrame); }
      else animateWind();
    }, { rootMargin: "120px" }).observe(game);
  } else { inView = true; animateWind(); }
}
