import { COLORS } from "./particle-life-model.mjs";

export function createParticleRenderer(canvas) {
  // Two draw calls per frame: fade the previous frame, then draw all point sprites.
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true, depth: false, stencil: false });
  let width = 1, height = 1, ratio = 1, clearNext = true;
  const rgb = COLORS.map(hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255));
  if (!gl) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas描画を利用できません。");
    return {
      backend: "Canvas", resize(w, h) { ratio = Math.min(devicePixelRatio || 1, 1.5); width = w; height = h; canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); clearNext = true; },
      clear() { clearNext = true; }, draw(data, trails) {
        ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = clearNext || !trails ? "#080e19" : "rgba(8,14,25,.25)"; ctx.fillRect(0, 0, width, height); clearNext = false;
        for (let kind = 0; kind < COLORS.length; kind++) { ctx.beginPath(); for (let i = 0; i < data.length; i += 3) if (data[i + 2] === kind) { const x = data[i] * width, y = data[i + 1] * height; ctx.moveTo(x + 1.65, y); ctx.arc(x, y, 1.65, 0, Math.PI * 2); } ctx.fillStyle = COLORS[kind]; ctx.fill(); }
      }, dispose() {},
    };
  }
  function program(vertex, fragment) {
    const result = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader); gl.deleteShader(shader);
    }
    gl.linkProgram(result); if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result)); return result;
  }
  const dots = program(`attribute vec2 position;attribute float kind;uniform float size;uniform vec3 palette[8];varying vec3 color;void main(){gl_Position=vec4(position.x*2.0-1.0,1.0-position.y*2.0,0.0,1.0);gl_PointSize=size;color=palette[int(kind)];}`, `precision mediump float;varying vec3 color;void main(){float r=length(gl_PointCoord-0.5)*2.0;if(r>1.0)discard;float core=1.0-smoothstep(0.15,0.75,r);float halo=(1.0-r)*0.26;gl_FragColor=vec4(color*(0.8+core*0.2),core*0.92+halo);}`);
  const fade = program(`attribute vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}`, `precision mediump float;uniform float opacity;void main(){gl_FragColor=vec4(0.03137,0.0549,0.098,opacity);}`);
  const vertices = gl.createBuffer(), quad = gl.createBuffer();
  const pointPosition = gl.getAttribLocation(dots, "position"), pointKind = gl.getAttribLocation(dots, "kind"), fadePosition = gl.getAttribLocation(fade, "position");
  const sizeUniform = gl.getUniformLocation(dots, "size"), opacityUniform = gl.getUniformLocation(fade, "opacity");
  gl.useProgram(dots); gl.uniform3fv(gl.getUniformLocation(dots, "palette[0]"), new Float32Array(rgb.flat()));
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
  return {
    backend: "WebGL",
    resize(w, h) { ratio = Math.min(devicePixelRatio || 1, 1.7); width = w; height = h; canvas.width = Math.max(1, Math.round(w * ratio)); canvas.height = Math.max(1, Math.round(h * ratio)); gl.viewport(0, 0, canvas.width, canvas.height); clearNext = true; },
    clear() { clearNext = true; },
    draw(data, trails) {
      if (gl.isContextLost()) return;
      gl.useProgram(fade); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(fadePosition); gl.vertexAttribPointer(fadePosition, 2, gl.FLOAT, false, 0, 0); gl.uniform1f(opacityUniform, clearNext || !trails ? 1 : .24); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(fadePosition); clearNext = false;
      gl.useProgram(dots); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(pointPosition); gl.vertexAttribPointer(pointPosition, 2, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(pointKind); gl.vertexAttribPointer(pointKind, 1, gl.FLOAT, false, 12, 8);
      gl.uniform1f(sizeUniform, (width < 600 ? 4.1 : 4.5) * ratio); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.drawArrays(gl.POINTS, 0, data.length / 3); gl.disableVertexAttribArray(pointPosition); gl.disableVertexAttribArray(pointKind);
    },
    dispose() { gl.deleteBuffer(vertices); gl.deleteBuffer(quad); gl.deleteProgram(dots); gl.deleteProgram(fade); },
  };
}
