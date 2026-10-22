export function recordingType(recorder) {
  if (!recorder?.isTypeSupported) return "";
  return ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp8", "video/webm"].find(type => recorder.isTypeSupported(type)) || "";
}

export function setupParticleSharing({ root, canvas, onRecordingChange, getCaption, getWorldID }) {
  const find = name => root.querySelector(`[data-pl-${name}]`);
  const button = find("record"), note = find("record-note"), output = find("record-output"), preview = find("record-preview"), badge = find("record-badge");
  const mimeType = recordingType(window.MediaRecorder);
  let recorder, stream, paintFrame = 0, timer = 0, objectURL = "", recording = false, failed = false, chunks = [], recordingCanvas, context, began = 0, caption = "", worldID = "", file;
  if (!mimeType || !canvas.captureStream) {
    button.disabled = true; note.textContent = "このブラウザは動画録画に対応していません。ChromeやSafariで開くと録画できます。";
    return { isRecording: () => false, stop() {} };
  }
  function cleanup() {
    clearInterval(timer); timer = 0; cancelAnimationFrame(paintFrame); paintFrame = 0;
    stream?.getTracks().forEach(track => track.stop()); stream = null; badge.hidden = true;
    if (recording) { recording = false; onRecordingChange(false); }
    button.disabled = false; button.textContent = "10秒の動画を撮る";
  }
  function error(message) { cleanup(); note.textContent = message; }
  function stop() {
    if (!recording || !recorder || recorder.state === "inactive") return;
    clearInterval(timer); timer = 0; cancelAnimationFrame(paintFrame); paintFrame = 0;
    button.disabled = true; button.textContent = "動画を仕上げています…"; note.textContent = "録画した動画を準備しています。";
    try { recorder.stop(); } catch { error("録画を終了できませんでした。もう一度お試しください。"); }
  }
  function paint(now) {
    if (!recording) return;
    // Keep the video dimensions fixed even when the page is resized during recording.
    context.fillStyle = "#080e19"; context.fillRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    const scale = Math.min(recordingCanvas.width / canvas.width, recordingCanvas.height / canvas.height);
    const w = canvas.width * scale, h = canvas.height * scale;
    context.drawImage(canvas, (recordingCanvas.width - w) / 2, (recordingCanvas.height - h) / 2, w, h);
    paintFrame = requestAnimationFrame(paint);
  }
  function start() {
    if (recording) { stop(); return; }
    try {
      preview.pause(); preview.removeAttribute("src"); preview.load(); output.hidden = true;
      if (objectURL) { URL.revokeObjectURL(objectURL); objectURL = ""; }
      chunks = []; file = null; failed = false; caption = getCaption(); worldID = getWorldID();
      recordingCanvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
      recordingCanvas.width = Math.max(2, Math.floor(canvas.width * scale / 2) * 2); recordingCanvas.height = Math.max(2, Math.floor(canvas.height * scale / 2) * 2);
      context = recordingCanvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Canvas unavailable");
      stream = recordingCanvas.captureStream(24); recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { failed = true; error("録画できませんでした。もう一度お試しください。"); };
      recorder.onstop = () => {
        if (failed) { cleanup(); return; }
        const type = recorder.mimeType || mimeType, mp4 = type.startsWith("video/mp4"), blob = new Blob(chunks, { type: type.split(";")[0] });
        cleanup();
        if (!blob.size) { note.textContent = "動画を作成できませんでした。もう一度お試しください。"; return; }
        const filename = `particle-life-${worldID.toLowerCase()}.${mp4 ? "mp4" : "webm"}`;
        file = new File([blob], filename, { type: blob.type }); objectURL = URL.createObjectURL(blob);
        preview.src = objectURL; find("download").href = objectURL; find("download").download = filename;
        find("post").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`;
        let canShare = false; try { canShare = !!navigator.canShare?.({ files: [file] }); } catch { /* Downloads remain available. */ }
        find("native-share").hidden = !canShare;
        note.textContent = mp4 ? canShare ? "動画ができました。保存してXで添付するか、共有メニューでXを選んでください。" : "動画ができました。保存した動画を、Xの投稿画面で添付してください。" : "WebM動画で保存しました。X用のMP4動画は、MP4録画対応のChromeやSafariで作成できます。";
        find("post-help").textContent = "① 動画を保存 → ② Xの投稿画面で、その動画を添付";
        output.hidden = false;
      };
      recording = true; onRecordingChange(true); began = performance.now(); badge.hidden = false;
      note.textContent = "10秒間の動きを録画中。ドラッグや突然変異も、そのまま動画になります。";
      recorder.start(250); paint(began);
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil(10 - (performance.now() - began) / 1000));
        button.textContent = `録画を止める · 残り${remaining}秒`; find("record-remaining").textContent = `${remaining}s`;
        if (remaining <= 0) stop();
      }, 150);
      button.textContent = "録画を止める · 残り10秒"; find("record-remaining").textContent = "10s";
    } catch { error("録画を開始できませんでした。もう一度お試しいただくか、別のブラウザで開いてください。"); }
  }
  button.addEventListener("click", start);
  find("native-share").addEventListener("click", async () => {
    if (!file) return;
    try { await navigator.share({ title: "Particle Life", text: caption, files: [file] }); }
    catch (error) { if (error.name !== "AbortError") note.textContent = "共有できませんでした。動画を保存して、Xの投稿画面から添付できます。"; }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", () => { stop(); if (objectURL) URL.revokeObjectURL(objectURL); });
  return { isRecording: () => recording, stop };
}
