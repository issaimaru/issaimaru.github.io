import * as T from "../lib/three/three.module.js";
import { fuelGate, asteroidField } from "./rocket-ascent.mjs";

// All scenery is procedural. The only GPU work is in this lazily loaded module.
export function createScene(canvas, { reducedMotion = false, onContextLost } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new T.Scene();
  scene.background = new T.Color(0x071321);
  scene.fog = new T.FogExp2(0x101f2d, .0029);
  const camera = new T.PerspectiveCamera(44, 1, .2, 1600);
  const aim = new T.Vector3(), cameraGoal = new T.Vector3(), lookGoal = new T.Vector3();
  const up = new T.Vector3(0, 1, 0), temp = new T.Vector3();
  const hemisphere = new T.HemisphereLight(0xbedfeb, 0x25313a, 2.1);
  scene.add(hemisphere);
  const sun = new T.DirectionalLight(0xffe7bd, 3.8);
  sun.position.set(-35, 90, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 80, bottom: -65, near: 1, far: 220 });
  sun.shadow.bias = -.0005;
  sun.shadow.normalBias = .1;
  scene.add(sun);
  const fill = new T.DirectionalLight(0x699cff, 1.1); fill.position.set(45, 20, -50); scene.add(fill);
  let randomSeed = 73241;
  const random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const material = (color, roughness = .7, metalness = .15) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const white = material(0xd3dce0, .37, .55), graphite = material(0x17232e, .45, .6), orange = material(0xf49659, .45, .35), steel = material(0x8eabb7, .35, .8);
  const terrainMaterial = new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .98, metalness: .08 });
  function mesh(geometry, mat, parent = scene, cast = true) {
    const object = new T.Mesh(geometry, mat); object.castShadow = cast; object.receiveShadow = true; parent.add(object); return object;
  }
  function cylinderBetween(a, b, radius, mat, parent = scene) {
    const direction = new T.Vector3().subVectors(b, a);
    const object = mesh(new T.CylinderGeometry(radius, radius, direction.length(), 7), mat, parent);
    object.position.copy(a).add(b).multiplyScalar(.5);
    object.quaternion.setFromUnitVectors(up, direction.normalize());
    return object;
  }
  function discTexture(draw, size = 512) {
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); return texture;
  }

  const terrain = new T.PlaneGeometry(650, 650, 85, 85); terrain.rotateX(-Math.PI / 2);
  const terrainPositions = terrain.attributes.position, terrainColors = [];
  for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i), z = terrainPositions.getZ(i), r = Math.hypot(x, z);
    const fade = Math.min(1, Math.max(0, (r - 18) / 55));
    terrainPositions.setY(i, -2.3 + fade * (Math.sin(x * .045 + .5) * Math.cos(z * .06) * 6 + Math.sin(x * .13 + z * .07) * 2.4 + random() * 1.8));
    const light = .22 + random() * .085;
    terrainColors.push(light * .88, light, light * 1.12);
  }
  terrain.setAttribute("color", new T.Float32BufferAttribute(terrainColors, 3)); terrain.computeVertexNormals();
  mesh(terrain, terrainMaterial, scene, false);

  const rockGeometry = new T.DodecahedronGeometry(1, 0), rockMaterial = material(0x46535e, .95, .05);
  const rocks = new T.InstancedMesh(rockGeometry, rockMaterial, 170), dummy = new T.Object3D();
  for (let i = 0; i < 170; i++) {
    const angle = random() * Math.PI * 2, radius = 21 + random() * 180, size = .35 + random() * 2.6;
    dummy.position.set(Math.cos(angle) * radius, -1.9, Math.sin(angle) * radius);
    dummy.rotation.set(random(), random() * Math.PI, random()); dummy.scale.set(size * 1.4, size * .65, size); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);
  for (let i = 0; i < 19; i++) {
    const angle = i / 19 * Math.PI * 2, radius = 230 + random() * 70;
    const mountain = mesh(new T.ConeGeometry(28 + random() * 40, 28 + random() * 55, 5, 1), material(0x293e4c, 1, 0), scene, false);
    mountain.position.set(Math.cos(angle) * radius, -5, Math.sin(angle) * radius); mountain.rotation.y = random() * Math.PI;
  }
  // A small outpost gives the landing site a human scale.
  const base = new T.Group(); base.position.set(-32, -1.8, -22); scene.add(base);
  const station = mesh(new T.CylinderGeometry(3, 3, 6, 12), white, base); station.position.set(0, 2.6, 0);
  const stationRoof = mesh(new T.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), graphite, base); stationRoof.position.y = 5.6;
  const habitat = mesh(new T.BoxGeometry(9, 4, 5), white, base); habitat.position.set(8, 1.8, 0);
  const windowMat = new T.MeshStandardMaterial({ color: 0x9bdbdb, emissive: 0x5abdb5, emissiveIntensity: 1, roughness: .2 });
  for (let i = 0; i < 4; i++) { const window = mesh(new T.BoxGeometry(.9, .65, .08), windowMat, base, false); window.position.set(5 + i * 1.8, 2.2, 2.55); }
  const airlock = mesh(new T.CylinderGeometry(1.2, 1.2, 5, 12), graphite, base); airlock.rotation.z = Math.PI / 2; airlock.position.set(3, 1.7, 0);
  cylinderBetween(new T.Vector3(-5, 0, -3), new T.Vector3(-5, 14, -3), .1, steel, base);
  const dish = mesh(new T.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), steel, base); dish.position.set(-5, 13, -3); dish.rotation.z = -.45;
  const solarMat = material(0x153d5c, .24, .65);
  for (let i = 0; i < 5; i++) {
    const panel = mesh(new T.BoxGeometry(3.8, .1, 6.5), solarMat, base); panel.position.set(i * 4.2 - 6, 1.8, -11); panel.rotation.z = -.27;
    cylinderBetween(new T.Vector3(i * 4.2 - 6, -1, -11), new T.Vector3(i * 4.2 - 6, 1.8, -11), .12, steel, base);
    for (let j = 0; j < 3; j++) { const strip = mesh(new T.BoxGeometry(.035, .13, 6.5), steel, panel, false); strip.position.x = j * 1.1 - 1.1; }
  }
  for (let i = 0; i < 4; i++) { const crate = mesh(new T.BoxGeometry(1.5, 1.3, 1.5), i % 2 ? orange : graphite, base); crate.position.set(13 + (i % 2) * 1.7, .1, 5 + Math.floor(i / 2) * 1.7); }

  const padGroup = new T.Group(); scene.add(padGroup);
  const pad = mesh(new T.CylinderGeometry(1, 1.04, 1.2, 64), graphite, padGroup); pad.position.y = -.65;
  const padTexture = discTexture((ctx, s) => {
    ctx.fillStyle = "#263b45"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) { ctx.fillStyle = `rgba(210,230,220,${random() * .035})`; ctx.fillRect(random() * s, random() * s, 2, 2); }
    ctx.strokeStyle = "#8bb7ae"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * .44, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#688c8b"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * .32, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#bdceba"; ctx.lineWidth = 12; ctx.setLineDash([22, 19]); ctx.beginPath(); ctx.arc(s / 2, s / 2, s * .48, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#c4d7cd"; ctx.font = "bold 132px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("07", s / 2, s / 2);
    ctx.font = "14px monospace"; ctx.fillStyle = "#93b1aa"; ctx.fillText("TRANQUILITY / LUNAR BASE", s / 2, s * .78);
    ctx.strokeStyle = "#789d96"; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(s / 2, s / 2); ctx.rotate(i * Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -s * .36); ctx.lineTo(0, -s * .43); ctx.stroke(); ctx.restore(); }
  });
  const top = mesh(new T.CircleGeometry(1, 64), new T.MeshStandardMaterial({ map: padTexture, roughness: .82, metalness: .25 }), padGroup); top.rotation.x = -Math.PI / 2; top.position.y = .012;
  const rimMat = new T.MeshStandardMaterial({ color: 0x98eed4, emissive: 0x98eed4, emissiveIntensity: 2 });
  const rim = mesh(new T.TorusGeometry(1, .012, 6, 80), rimMat, padGroup, false); rim.rotation.x = Math.PI / 2; rim.position.y = .08;
  const padLights = [];
  for (let i = 0; i < 12; i++) { const lamp = mesh(new T.BoxGeometry(.26, .22, .6), rimMat, scene, false); lamp.rotation.y = -i / 12 * Math.PI * 2; padLights.push(lamp); }
  const beacon = new T.PointLight(0x8eefd4, 18, 28, 2); beacon.position.set(0, 2, 0); scene.add(beacon);

  const starPositions = [];
  for (let i = 0; i < 1000; i++) { const a = random() * Math.PI * 2, y = random() * 1.8 - .25, r = Math.sqrt(1 - Math.min(.98, y * y)); starPositions.push(Math.cos(a) * r * 750, Math.max(35, y * 650), Math.sin(a) * r * 750); }
  const starGeometry = new T.BufferGeometry(); starGeometry.setAttribute("position", new T.Float32BufferAttribute(starPositions, 3));
  const stars = new T.Points(starGeometry, new T.PointsMaterial({ color: 0xc4e3ff, size: 1.05, sizeAttenuation: true, transparent: true, opacity: .75, fog: false })); scene.add(stars);
  const earthTexture = discTexture((ctx, s) => {
    ctx.fillStyle = "#195a87"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = random() * s, y = random() * s;
      ctx.fillStyle = i < 30 ? "#467f7b" : "rgba(220,238,235,.58)"; ctx.beginPath(); ctx.ellipse(x, y, 8 + random() * 75, 4 + random() * 13, -.3 + random(), 0, Math.PI * 2); ctx.fill();
    }
  });
  const earth = mesh(new T.SphereGeometry(27, 48, 32), new T.MeshStandardMaterial({ map: earthTexture, roughness: .95, emissive: 0x123955, emissiveIntensity: .18, fog: false }), scene, false); earth.position.set(0, 55, -210); earth.rotation.z = .35;
  const atmosphere = mesh(new T.SphereGeometry(28.1, 40, 24), new T.MeshBasicMaterial({ color: 0x72bfff, transparent: true, opacity: .12, side: T.BackSide, blending: T.AdditiveBlending, depthWrite: false, fog: false }), earth, false);

  const rocket = new T.Group(); scene.add(rocket);
  const body = mesh(new T.CylinderGeometry(.88, .96, 4.9, 24), white, rocket); body.position.y = 4.2;
  const nose = mesh(new T.ConeGeometry(.88, 2.1, 24), white, rocket); nose.position.y = 7.7;
  const lower = mesh(new T.CylinderGeometry(.96, 1.1, 1.2, 24), graphite, rocket); lower.position.y = 1.95;
  for (const y of [2.7, 6.5]) { const band = mesh(new T.CylinderGeometry(.9 + (y < 3 ? .06 : 0), .9 + (y < 3 ? .06 : 0), .18, 24), orange, rocket); band.position.y = y; }
  const blackBand = mesh(new T.CylinderGeometry(.89, .89, .65, 24), graphite, rocket); blackBand.position.y = 5.9;
  const decalTexture = discTexture((ctx, s) => { ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#24363e"; ctx.textAlign = "center"; ctx.font = "bold 140px monospace"; ctx.fillText("07", s / 2, 300); ctx.font = "36px monospace"; ctx.fillText("SOFT LANDING", s / 2, 370); });
  const decal = mesh(new T.PlaneGeometry(1.4, 1.4), new T.MeshBasicMaterial({ map: decalTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), rocket, false); decal.position.set(.48, 4.4, .77); decal.rotation.y = .55;
  const nozzle = mesh(new T.CylinderGeometry(.36, .64, .7, 18, 1, true), steel, rocket); nozzle.position.y = 1.02;
  const nozzleInside = mesh(new T.CircleGeometry(.59, 18), graphite, rocket); nozzleInside.rotation.x = Math.PI / 2; nozzleInside.position.y = .68;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    cylinderBetween(new T.Vector3(c * .85, 2.6, s * .85), new T.Vector3(c * 2, .18, s * 2), .085, steel, rocket);
    cylinderBetween(new T.Vector3(c * .85, 1.35, s * .85), new T.Vector3(c * 1.85, .4, s * 1.85), .055, steel, rocket);
    const foot = mesh(new T.CylinderGeometry(.34, .4, .15, 10), graphite, rocket); foot.position.set(c * 2, .1, s * 2);
    const fin = mesh(new T.BoxGeometry(.08, 1.7, .7), graphite, rocket); fin.position.set(c * .94, 2.8, s * .94); fin.rotation.y = -a + Math.PI / 2;
    const rcs = mesh(new T.BoxGeometry(.25, .22, .25), graphite, rocket); rcs.position.set(c * .94, 5.25, s * .94);
  }
  const flameGroup = new T.Group(); rocket.add(flameGroup);
  const flame = mesh(new T.ConeGeometry(.53, 4, 12, 1, true), new T.MeshBasicMaterial({ color: 0x8dd7ff, transparent: true, opacity: .8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), flameGroup, false); flame.rotation.z = Math.PI; flame.position.y = -1.2;
  const flameCore = mesh(new T.ConeGeometry(.3, 2.8, 10, 1, true), new T.MeshBasicMaterial({ color: 0xe1f8ff, transparent: true, opacity: .95, blending: T.AdditiveBlending, depthWrite: false }), flameGroup, false); flameCore.rotation.z = Math.PI; flameCore.position.y = -.6;
  const engineLight = new T.PointLight(0x85cfff, 0, 22, 2); engineLight.position.y = .5; rocket.add(engineLight);
  const glowTexture = discTexture((ctx, s) => { const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.15, "rgba(255,255,255,.8)"); g.addColorStop(.5, "rgba(255,255,255,.2)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); }, 64);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: 0x93dfff, transparent: true, opacity: .6, blending: T.AdditiveBlending, depthWrite: false })); glow.position.y = .5; glow.scale.set(3, 3, 1); rocket.add(glow);

  const particleCount = 260, particles = Array.from({ length: particleCount }, () => ({ life: 0, max: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, hot: false }));
  const positions = new Float32Array(particleCount * 3), colors = new Float32Array(particleCount * 3);
  const particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute("position", new T.BufferAttribute(positions, 3)); particleGeometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  const particleMaterial = new T.PointsMaterial({ size: 2.6, map: glowTexture, transparent: true, opacity: .65, vertexColors: true, depthWrite: false, blending: T.AdditiveBlending });
  const points = new T.Points(particleGeometry, particleMaterial); points.frustumCulled = false; scene.add(points);
  const gateMaterial = new T.MeshStandardMaterial({ color: 0xb2ffda, emissive: 0x65e9b4, emissiveIntensity: 2, roughness: .3, metalness: .3 });
  const gateLabelTexture = discTexture((ctx, s) => { ctx.clearRect(0, 0, s, s); ctx.fillStyle = "#c2ffe6"; ctx.font = "bold 66px monospace"; ctx.textAlign = "center"; ctx.fillText("FUEL +24", s / 2, s / 2 + 24); });
  const gates = Array.from({ length: 4 }, () => {
    const group = new T.Group(); scene.add(group);
    const ring = mesh(new T.TorusGeometry(1, .022, 8, 48), gateMaterial, group, false); ring.rotation.x = Math.PI / 2;
    const core = mesh(new T.OctahedronGeometry(.9), gateMaterial, group, false);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: 0x8dffd2, transparent: true, opacity: .6, blending: T.AdditiveBlending, depthWrite: false })); halo.scale.set(6, 6, 1); group.add(halo);
    const label = new T.Sprite(new T.SpriteMaterial({ map: gateLabelTexture, transparent: true, depthWrite: false })); label.scale.set(12, 12, 1); label.position.set(0, 5, 0); group.add(label);
    group.visible = false; return { group, ring, core };
  });
  const hazards = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), material(0x82786e, .9, .18), 12); hazards.castShadow = false; hazards.frustumCulled = false; hazards.visible = false; scene.add(hazards);
  let ascent = false;
  let cursor = 0, particleBudget = 0, explosion = 0;
  const guideMaterial = new T.LineDashedMaterial({ color: 0x8be0cb, dashSize: 1.1, gapSize: 1, transparent: true, opacity: .35 });
  const guideGeometry = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const guide = new T.Line(guideGeometry, guideMaterial); guide.frustumCulled = false; scene.add(guide);
  const marker = mesh(new T.RingGeometry(1.7, 1.82, 32), new T.MeshBasicMaterial({ color: 0xb7ffe7, side: T.DoubleSide, transparent: true, opacity: .6, depthWrite: false }), scene, false); marker.rotation.x = -Math.PI / 2;
  const shadow = mesh(new T.PlaneGeometry(6, 6), new T.MeshBasicMaterial({ map: glowTexture, color: 0x02090d, transparent: true, opacity: .3, depthWrite: false }), scene, false); shadow.rotation.x = -Math.PI / 2;
  let width = 1, height = 1, firstCamera = true, elapsed = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); onContextLost?.(); });
  function reset(mission, mode = "landing") {
    ascent = mode === "ascent";
    padGroup.scale.set(mission.radius, 1, mission.radius); rimMat.color.setHex(mission.color); rimMat.emissive.setHex(mission.color); beacon.color.setHex(mission.color);
    marker.material.color.setHex(mission.color); guideMaterial.color.setHex(mission.color);
    padLights.forEach((lamp, i) => { const a = i / 12 * Math.PI * 2; lamp.position.set(Math.cos(a) * (mission.radius + .5), .06, Math.sin(a) * (mission.radius + .5)); });
    for (const p of particles) p.life = 0;
    rocket.visible = true; explosion = 0; particleBudget = 0; firstCamera = true; gates.forEach(gate => { gate.group.visible = false; }); hazards.visible = false;
    earth.position.set(0, 55, -210); stars.position.y = 0;
  }
  function emit(state, hot = false, burst = false) {
    const p = particles[cursor++ % particleCount]; p.life = p.max = burst ? 1.2 + random() * 1.6 : .5 + random() * .8; p.hot = hot;
    p.x = state.x + (random() - .5) * (burst ? 3 : .7); p.y = state.y + (burst ? 2 : .6); p.z = state.z + (random() - .5) * (burst ? 3 : .7);
    const a = random() * Math.PI * 2, speed = burst ? 4 + random() * 17 : 1 + random() * 3;
    p.vx = Math.cos(a) * speed; p.vz = Math.sin(a) * speed; p.vy = burst ? random() * 17 : -5 - random() * 12;
  }
  function impact(state, success) {
    explosion = success ? .2 : 1;
    if (!success) rocket.visible = false;
    if (!reducedMotion) for (let i = 0; i < (success ? 42 : 180); i++) emit(state, !success, true);
  }
  function render(state, dt, { playing = false, idle = false } = {}) {
    elapsed += dt;
    const y = state.y + (idle && !ascent && !reducedMotion ? Math.sin(elapsed * .7) * .6 : 0);
    rocket.position.set(state.x, y, state.z); rocket.rotation.set(state.leanZ, 0, -state.leanX);
    if (ascent && !state.contact) rocket.visible = reducedMotion || state.invincible <= 0 || Math.floor(state.time * 8) % 2 === 0;
    const power = playing ? state.throttle : 0;
    flameGroup.visible = power > .025; glow.visible = power > .025;
    const flicker = reducedMotion ? 1 : .88 + Math.sin(elapsed * 67) * .12;
    flameGroup.scale.set(1, Math.max(.1, power * flicker), 1); glow.material.opacity = power * .75; engineLight.intensity = power * 30;
    if (!reducedMotion && power > .1 && playing) { particleBudget += dt * power * 65; while (particleBudget >= 1) { emit(state); particleBudget--; } }
    for (let i = 0; i < particleCount; i++) {
      const p = particles[i]; p.life -= dt;
      if (p.life > 0) {
        p.vy -= dt * (p.hot ? 5 : 1.8); p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < .1) { p.y = .1; p.vy = Math.abs(p.vy) * .16; p.vx *= 1.03; p.vz *= 1.03; }
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const fade = Math.max(0, p.life / p.max);
        colors[i * 3] = fade * (p.hot ? 1 : .3); colors[i * 3 + 1] = fade * (p.hot ? .42 : .65); colors[i * 3 + 2] = fade * (p.hot ? .09 : .85);
      } else { positions[i * 3 + 1] = -1000; }
    }
    particleGeometry.attributes.position.needsUpdate = true; particleGeometry.attributes.color.needsUpdate = true;
    marker.position.set(state.x, .045, state.z); marker.visible = !state.contact && !ascent;
    shadow.position.set(state.x, .025, state.z); shadow.material.opacity = Math.max(.02, .3 - state.y * .004); shadow.scale.setScalar(1 + state.y * .02); shadow.visible = rocket.visible;
    const gp = guide.geometry.attributes.position;
    const nextGate = ascent ? fuelGate(state.nextGate) : null;
    gp.setXYZ(0, state.x, ascent ? state.y + 3 : .08, state.z); gp.setXYZ(1, nextGate?.x || 0, nextGate?.y || .08, nextGate?.z || 0); gp.needsUpdate = true; guide.computeLineDistances(); guide.visible = playing;
    const aspectAdjust = Math.max(1, .88 / camera.aspect);
    const distance = (ascent ? 62 + Math.max(0, state.vy) * .18 : Math.max(40, state.y * .95 + 45)) * aspectAdjust;
    lookGoal.set(ascent ? state.x * .8 : state.x * .3, ascent ? state.y + 24 + Math.max(0, state.vy) * .15 : (state.y + 8) * .55 + 6, ascent ? state.z * .8 : state.z * .3);
    if (ascent) {
      gates.forEach(({ group, ring, core }, i) => { const gate = fuelGate(state.nextGate + i); group.visible = gate.y - state.y < 250; group.position.set(gate.x, gate.y, gate.z); ring.scale.setScalar(gate.radius); core.rotation.set(elapsed * .5, elapsed, .3); });
      const field = asteroidField(state.y, state.time); hazards.count = field.length; hazards.visible = true;
      field.forEach((rock, i) => { dummy.position.set(rock.x, rock.y, rock.z); dummy.rotation.set(rock.id + elapsed * .12, elapsed * .08, rock.id); dummy.scale.set(rock.radius, rock.radius * .85, rock.radius * 1.1); dummy.updateMatrix(); hazards.setMatrixAt(i, dummy.matrix); }); hazards.instanceMatrix.needsUpdate = true;
      earth.position.set(-110, state.y - 15, -240); stars.position.y = state.y * .95;
    }
    cameraGoal.copy(lookGoal).add(temp.set(distance * .72, distance * .5, distance * .86));
    const blend = firstCamera ? 1 : 1 - Math.exp(-dt * 3);
    camera.position.lerp(cameraGoal, blend); aim.lerp(lookGoal, blend); firstCamera = false;
    if (!reducedMotion && explosion > .01) { camera.position.x += (random() - .5) * explosion * .5; camera.position.y += (random() - .5) * explosion * .3; }
    explosion *= Math.exp(-dt * 5); camera.lookAt(aim);
    earth.rotation.y += dt * .008;
    renderer.render(scene, camera);
  }
  resize();
  return { render, reset, impact, resize, pulse(state, kind) { explosion = kind === "hit" ? .5 : 0; if (!reducedMotion) for (let i = 0; i < 35; i++) emit(state, kind === "hit", true); }, dispose() { resizeObserver.disconnect(); scene.traverse(object => { object.geometry?.dispose(); const mats = Array.isArray(object.material) ? object.material : [object.material]; mats.forEach(mat => mat?.dispose()); }); [padTexture, earthTexture, decalTexture, glowTexture, gateLabelTexture].forEach(t => t.dispose()); renderer.dispose(); } };
}
