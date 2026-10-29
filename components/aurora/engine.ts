// Aurora 3D engine shared by the landing, login and register pages.
// Everything is procedural (no textures or models): a night sea with aurora and a tanker,
// a low Earth orbit with the M.A.T.E agent, bloom and a cloud transition between the two.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type AuroraMode = 'story' | 'login' | 'register';

export interface AuroraHandle {
  /** Story timeline position, 0 to 4 (story mode). */
  setProgress(p: number): void;
  /** How far the agent swarm has formed into a document, 0 to 1 (register mode). */
  setMorph(m: number): void;
  /** Fire the uplink beam from the ship's mast (login mode). */
  uplink(): void;
  dispose(): void;
}

export interface AuroraOptions {
  mode: AuroraMode;
  onLink?: (label: string) => void;
  onHeading?: (deg: number) => void;
}

const GLSL_NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise3(p); p = p * 2.02 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return v; }
`;

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

const c01 = (x: number) => Math.max(0, Math.min(1, x));

interface Key { t: number; p: THREE.Vector3; g: THREE.Vector3 }
const K = (t: number, p: number[], g: number[]): Key => ({ t, p: new THREE.Vector3(p[0], p[1], p[2]), g: new THREE.Vector3(g[0], g[1], g[2]) });

function sampleKeys(keys: Key[], t: number, outP: THREE.Vector3, outG: THREE.Vector3) {
  if (t <= keys[0].t) { outP.copy(keys[0].p); outG.copy(keys[0].g); return; }
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) {
      let f = (t - a.t) / (b.t - a.t); f = f * f * (3 - 2 * f);
      outP.copy(a.p).lerp(b.p, f); outG.copy(a.g).lerp(b.g, f); return;
    }
  }
  const l = keys[keys.length - 1]; outP.copy(l.p); outG.copy(l.g);
}

export function createAurora(canvas: HTMLCanvasElement, container: HTMLElement, opts: AuroraOptions): AuroraHandle | null {
  if (!hasWebGL()) return null;
  const mode = opts.mode;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700 || /Mobi|Android/i.test(navigator.userAgent);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));

  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  {
    const x = glowCanvas.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const glow = new THREE.CanvasTexture(glowCanvas);
  function sprite(color: number, size: number, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s;
  }
  const stdMat = (c: string, o: any = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0.15 }, o));

  // ==========================================================
  // World 1: night sea
  // ==========================================================
  const sea = new THREE.Scene();
  const seaCam = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);
  const moonDir = new THREE.Vector3(-0.6, 0.26, -1).normalize();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GLSL_NOISE + `
uniform float uTime; uniform vec3 uMoon; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
 vec3 col = mix(vec3(0.05, 0.11, 0.17), vec3(0.012, 0.025, 0.06), smoothstep(0.0, 0.35, h));
 col = mix(col, vec3(0.004, 0.008, 0.022), smoothstep(0.35, 0.9, h));
 vec3 sc = d * 260.0; vec3 cell = floor(sc); float s = hash3(cell); vec3 f = fract(sc) - 0.5;
 float star = step(0.993, s) * smoothstep(0.28, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * 2.0 + s * 300.0));
 col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.02, 0.2, h) * 1.4;
 if (h > 0.0) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) { float fi = float(i);
   vec2 uv = vec2(d.x, -d.z) / (h + 0.06) * (0.26 + fi * 0.018);
   float n = fbm(vec2(uv.x * 0.7 + uTime * 0.015, fi * 0.13));
   float curve = 1.05 + 0.45 * sin(uv.x * 0.9 + n * 4.0 + uTime * 0.05);
   float dist = abs(uv.y - curve);
   float a = exp(-dist * dist * 9.0) * (0.35 + 0.9 * fbm(vec2(uv.x * 5.0 + fi * 0.3, uTime * 0.12)));
   vec3 c = mix(vec3(0.15, 1.0, 0.72), vec3(0.62, 0.38, 1.0), smoothstep(2.0, 7.0, fi));
   acc += c * a * (1.0 - fi / 9.0) * 0.16; }
  col += acc * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.75, 1.0, h));
 }
 float md = max(dot(d, uMoon), 0.0);
 col += vec3(0.95, 0.93, 0.85) * smoothstep(0.99965, 0.9998, md) * 2.0 + vec3(0.6, 0.7, 0.9) * (pow(md, 300.0) * 0.5 + pow(md, 12.0) * 0.06);
 if (h < 0.0) col = mix(vec3(0.05, 0.11, 0.17), vec3(0.01, 0.02, 0.04), smoothstep(0.0, -0.08, h));
 gl_FragColor = vec4(col, 1.0); }`
  });
  sea.add(new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMat));

  const WAVES = [[1.0, 0.25, 0.09, 72], [0.55, 1.0, 0.08, 39], [-0.45, 0.9, 0.07, 22], [0.9, -0.45, 0.05, 11]];
  const waveU = WAVES.map((w) => { const d = new THREE.Vector2(w[0], w[1]).normalize(); return new THREE.Vector4(d.x, d.y, w[2], w[3]); });
  function waveHeight(x: number, z: number, t: number) {
    let y = 0;
    for (const w of waveU) { const k = 2 * Math.PI / w.w, c = Math.sqrt(9.8 / k); y += (w.z / k) * Math.sin(k * (w.x * x + w.y * z - c * t)); }
    return y;
  }

  const seg = small ? 120 : 240;
  const waterGeo = new THREE.PlaneGeometry(1600, 1600, seg, seg); waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uW: { value: waveU }, uMoon: { value: moonDir }, uShipX: { value: 0 } },
    vertexShader: `
uniform float uTime; uniform vec4 uW[4]; varying vec3 vWorld; varying vec3 vN; varying float vH;
vec3 gerstner(vec4 w, vec3 p, inout vec3 T, inout vec3 B){ float k = 6.28318 / w.w; float c = sqrt(9.8 / k); vec2 d = w.xy; float f = k * (dot(d, p.xz) - c * uTime); float a = w.z / k;
 T += vec3(-d.x*d.x*(w.z*sin(f)), d.x*(w.z*cos(f)), -d.x*d.y*(w.z*sin(f)));
 B += vec3(-d.x*d.y*(w.z*sin(f)), d.y*(w.z*cos(f)), -d.y*d.y*(w.z*sin(f)));
 return vec3(d.x*(a*cos(f)), a*sin(f), d.y*(a*cos(f))); }
void main(){ vec3 p = (modelMatrix * vec4(position, 1.0)).xyz; vec3 T = vec3(1.0, 0.0, 0.0); vec3 B = vec3(0.0, 0.0, 1.0); vec3 q = p;
 for (int i = 0; i < 4; i++) q += gerstner(uW[i], p, T, B);
 vN = normalize(cross(B, T)); vH = q.y; vWorld = q; gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); }`,
    fragmentShader: GLSL_NOISE + `
uniform float uTime; uniform vec3 uMoon; uniform float uShipX; varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){ vec3 V = normalize(cameraPosition - vWorld);
 vec2 ripple = vec2(noise(vWorld.xz * 0.35 + uTime * 0.4), noise(vWorld.zx * 0.35 - uTime * 0.35)) - 0.5;
 vec3 N = normalize(vN + vec3(ripple.x, 0.0, ripple.y) * 0.18);
 float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
 vec3 R = reflect(-V, N);
 vec3 refl = mix(vec3(0.05, 0.11, 0.17), vec3(0.01, 0.025, 0.06), smoothstep(0.0, 0.4, R.y));
 refl += vec3(0.05, 0.35, 0.28) * smoothstep(0.08, 0.35, R.y) * step(R.z, 0.0) * 0.6;
 vec3 base = mix(vec3(0.004, 0.016, 0.035), vec3(0.02, 0.07, 0.11), clamp(vH * 0.2 + 0.35, 0.0, 1.0));
 vec3 col = mix(base, refl, 0.12 + fres * 0.85);
 float m = max(dot(R, uMoon), 0.0); col += vec3(0.9, 0.92, 1.0) * (pow(m, 500.0) * 6.0 + pow(m, 60.0) * 0.35);
 float crest = smoothstep(0.9, 1.9, vH) * noise(vWorld.xz * 0.5 + uTime * 0.3); col += vec3(0.25, 0.4, 0.5) * crest * 0.35;
 float behind = -(vWorld.x - uShipX) - 17.0; float w = 2.8 + max(behind, 0.0) * 0.26;
 float inside = smoothstep(w, w - 3.0, abs(vWorld.z)) * step(0.0, behind) * exp(-max(behind, 0.0) * 0.011);
 float edge = smoothstep(w - 5.0, w - 0.5, abs(vWorld.z));
 float spark = pow(noise(vec2(vWorld.x * 0.9 + uTime * 7.0, vWorld.z * 0.9)), 3.0) * 3.0 + noise(vec2(vWorld.x * 0.25 + uTime * 3.0, vWorld.z * 0.25)) * 0.6;
 col += vec3(0.1, 0.95, 0.8) * inside * (0.12 + edge * 0.7) * spark * 0.8;
 float bow = smoothstep(4.5, 0.0, abs(vWorld.z)) * smoothstep(24.0, 17.0, vWorld.x - uShipX) * step(14.0, vWorld.x - uShipX);
 col += vec3(0.3, 0.9, 0.85) * bow * spark * 0.35;
 float dist = length(vWorld.xz - cameraPosition.xz); col = mix(col, vec3(0.05, 0.11, 0.17), smoothstep(250.0, 780.0, dist));
 gl_FragColor = vec4(col, 1.0); }`
  });
  sea.add(new THREE.Mesh(waterGeo, waterMat));

  sea.add(new THREE.HemisphereLight(0x3a5a8a, 0x05080f, 0.75));
  const moonLight = new THREE.DirectionalLight(0xbfd2ff, 0.55); moonLight.position.copy(moonDir).multiplyScalar(100); sea.add(moonLight);
  const deckLight = new THREE.PointLight(0xffc27a, 1.4, 40, 2); deckLight.position.set(-8, 9, 0); sea.add(deckLight);

  // Product tanker: bow along +x, starboard along +z
  const ship = new THREE.Group(); sea.add(ship);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); ship.add(b); return b;
  };
  const hs = new THREE.Shape();
  hs.moveTo(-18, -3.1); hs.lineTo(11, -3.1); hs.quadraticCurveTo(17, -2.9, 19.5, 0); hs.quadraticCurveTo(17, 2.9, 11, 3.1); hs.lineTo(-18, 3.1); hs.quadraticCurveTo(-18.8, 0, -18, -3.1);
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 3.6, bevelEnabled: false, curveSegments: 16 }); hg.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hg, stdMat('#141c2a', { roughness: 0.5 })); hull.position.y = -1.9; ship.add(hull);
  const bg = new THREE.ExtrudeGeometry(hs, { depth: 0.45, bevelEnabled: false, curveSegments: 16 }); bg.rotateX(-Math.PI / 2); bg.scale(1.004, 1, 1.01);
  const boot = new THREE.Mesh(bg, stdMat('#6e2622')); boot.position.y = -0.55; ship.add(boot);
  const dg = new THREE.ShapeGeometry(hs); dg.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(dg, stdMat('#2f3d36')); deck.position.y = 1.72; ship.add(deck);
  const white = stdMat('#d9d4c6', { roughness: 0.5 });
  box(5.2, 6.4, 5.8, white, -14.2, 4.9, 0);
  box(4.6, 1.2, 8.4, white, -13.6, 8.6, 0);
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.55) });
  box(0.08, 0.45, 6.2, winMat, -11.25, 8.7, 0);
  box(0.08, 0.3, 4.4, winMat, -11.55, 6.4, 0);
  box(0.08, 0.3, 4.4, winMat, -11.55, 4.8, 0);
  [-2.92, 2.92].forEach((z) => { box(3.6, 0.28, 0.06, winMat, -14.2, 6.4, z); box(3.6, 0.28, 0.06, winMat, -14.2, 4.8, z); });
  box(2.4, 3.6, 2.3, stdMat('#1a2333'), -16.9, 10.4, 0);
  box(2.45, 0.6, 2.35, new THREE.MeshBasicMaterial({ color: 0xe3b862 }), -16.9, 11.4, 0);
  box(0.25, 3.4, 0.25, stdMat('#b9b3a3'), -13.2, 11, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), white); dome.position.set(-13.2, 12.7, 0); ship.add(dome);
  const pipeM = stdMat('#7e837b', { metalness: 0.5, roughness: 0.4 });
  [-1.2, 0, 1.2].forEach((z) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 22, 8), pipeM); p.rotation.z = Math.PI / 2; p.position.set(0, 2.05, z); ship.add(p); });
  box(1.4, 1.1, 5.4, pipeM, 0, 2.3, 0);
  box(0.2, 5.2, 0.2, stdMat('#b9b3a3'), 15.2, 4.3, 0);
  box(3.2, 1.1, 5.8, stdMat('#243142'), 16.4, 2.2, 0);
  sprite(0xffffff, 2.6, ship, 15.2, 7.1, 0);      // masthead
  sprite(0xffffff, 2.2, ship, -13.2, 13.6, 0);    // aft masthead
  sprite(0xff3b30, 2.2, ship, -12.6, 8.9, -4.3);  // port sidelight
  sprite(0x34e08a, 2.2, ship, -12.6, 8.9, 4.3);   // starboard sidelight
  sprite(0xffffff, 1.6, ship, -18.6, 2.6, 0);     // stern light
  [-6, 2, 10].forEach((x) => sprite(0xffb85c, 3.2, ship, x, 3.2, 0)); // deck lights

  // Uplink beam from the mast
  const beamTop = new THREE.Vector3(-90, 1100, -500);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uHead: { value: 0 }, uVis: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uHead; uniform float uVis; uniform float uTime; varying float vU; void main(){ float on = smoothstep(uHead, uHead - 0.01, vU); float pulse = pow(0.5 + 0.5 * sin((vU * 60.0 - uTime * 6.0)), 6.0); vec3 c = mix(vec3(0.35, 1.0, 0.85), vec3(1.0, 0.8, 0.45), pulse); float a = on * (0.35 + pulse * 0.9) * uVis * (1.0 - vU * 0.6); gl_FragColor = vec4(c * a * 1.6, a); }'
  });
  let beam: THREE.Mesh | null = null;
  const beamFrom = new THREE.Vector3();
  function buildBeam(from: THREE.Vector3) {
    if (beam) { sea.remove(beam); beam.geometry.dispose(); }
    beam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(from, beamTop), 64, 0.35, 8, false), beamMat);
    sea.add(beam); beamFrom.copy(from);
  }
  const beamHead = sprite(0xbfffee, 10, sea); beamHead.visible = false;

  // Hologram of the finished document above the bridge
  function docTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 660; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(160,255,230,.9)'; x.lineWidth = 3; x.strokeRect(10, 10, 492, 640);
    x.fillStyle = 'rgba(160,255,230,.9)'; x.font = '600 30px "JetBrains Mono", monospace'; x.fillText('RISK ASSESSMENT', 36, 66);
    x.font = '18px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(255,214,140,.95)'; x.fillText('M/V PIONEER · CHIEF MATE · HOT WORK', 36, 100);
    x.fillStyle = 'rgba(160,255,230,.35)'; x.fillRect(36, 118, 440, 2);
    const rows: [string, string[]][] = [
      ['HAZARDS', ['Explosive atmosphere in pump room', 'Slips and falls in bilge area', 'Limited escape route', 'Fire spread to adjacent spaces']],
      ['CONTROLS', ['Gas-free certificate, O2 / LEL / H2S', 'Dedicated fire watch, 30 min after', 'Bilge drained and wiped dry', 'Rescue line and BA set rigged']],
      ['RESIDUAL', ['LOW · acceptable with Master approval']]
    ];
    let y = 160;
    rows.forEach((r) => {
      x.fillStyle = 'rgba(255,214,140,.95)'; x.font = '600 18px "JetBrains Mono", monospace'; x.fillText(r[0], 36, y); y += 30;
      x.fillStyle = 'rgba(210,255,245,.85)'; x.font = '17px "JetBrains Mono", monospace';
      r[1].forEach((l) => { x.fillText('· ' + l, 48, y); y += 28; }); y += 16;
    });
    x.fillStyle = 'rgba(160,255,230,.35)'; x.fillRect(36, 600, 180, 2); x.fillRect(296, 600, 180, 2);
    x.font = '14px "JetBrains Mono", monospace'; x.fillStyle = 'rgba(160,255,230,.7)'; x.fillText('MASTER', 36, 625); x.fillText('CHIEF MATE', 296, 625);
    return new THREE.CanvasTexture(c);
  }
  const holoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTex: { value: null }, uReveal: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D uTex; uniform float uReveal; uniform float uTime; varying vec2 vUv; void main(){ vec4 t = texture2D(uTex, vUv); float cut = 1.0 - uReveal; float on = smoothstep(cut - 0.02, cut, vUv.y); float line = smoothstep(0.012, 0.0, abs(vUv.y - cut)) * step(0.001, uReveal) * step(uReveal, 0.999); float scan = 0.8 + 0.2 * sin(vUv.y * 500.0 + uTime * 6.0); float flick = 0.92 + 0.08 * sin(uTime * 23.0); vec3 bg = vec3(0.05, 0.25, 0.22) * 0.25; vec3 c = (t.rgb * t.a * 1.4 + bg) * scan * flick * on + vec3(0.6, 1.0, 0.9) * line * 1.5; float a = clamp(max(max(c.r, c.g), c.b), 0.0, 1.0) * min(uReveal * 4.0, 1.0); gl_FragColor = vec4(c, a); }'
  });
  const holo = new THREE.Mesh(new THREE.PlaneGeometry(13, 16.75), holoMat); holo.visible = false; sea.add(holo);
  const setHoloTex = () => { const old = holoMat.uniforms.uTex.value; holoMat.uniforms.uTex.value = docTexture(); if (old) old.dispose(); };
  setHoloTex();
  if ((document as any).fonts?.ready) (document as any).fonts.ready.then(setHoloTex);

  // ==========================================================
  // World 2: low Earth orbit and the agent
  // ==========================================================
  const orbit = new THREE.Scene();
  const orbitCam = new THREE.PerspectiveCamera(45, 1, 0.5, 6000);
  const sunDir = new THREE.Vector3(-1, 0.35, 0.45).normalize();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
    fragmentShader: GLSL_NOISE + `
uniform vec3 uSun; uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ vec3 p = normalize(vP); vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
 float n = fbm3(p * 2.3 + 4.0); float land = smoothstep(0.5, 0.53, n);
 float ndl = dot(N, uSun); float day = smoothstep(-0.12, 0.3, ndl);
 vec3 ocean = vec3(0.01, 0.05, 0.13); vec3 ground = mix(vec3(0.06, 0.1, 0.05), vec3(0.22, 0.17, 0.1), fbm3(p * 9.0));
 vec3 dayC = mix(ocean, ground, land) * (0.15 + max(ndl, 0.0) * 1.3);
 dayC += vec3(0.9, 0.85, 0.7) * pow(max(dot(reflect(-V, N), uSun), 0.0), 40.0) * (1.0 - land) * 0.5;
 float cl = smoothstep(0.52, 0.78, fbm3(p * 4.5 + vec3(uTime * 0.01, 0.0, 0.0)));
 dayC = mix(dayC, vec3(0.92) * (0.1 + max(ndl, 0.0)), cl * 0.85);
 float city = step(0.86, hash3(floor(p * 300.0))) * land * smoothstep(0.42, 0.62, fbm3(p * 14.0)) * (1.0 - cl * 0.8);
 vec3 nightC = vec3(1.4, 0.85, 0.4) * city * 1.4 + ocean * 0.08;
 vec3 col = mix(nightC, dayC, day);
 float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0); col += vec3(0.25, 0.55, 1.0) * fres * (0.2 + day * 0.5);
 gl_FragColor = vec4(col, 1.0); }`
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(100, small ? 96 : 160, small ? 48 : 80), earthMat);
  orbit.add(earth);
  orbit.add(new THREE.Mesh(new THREE.SphereGeometry(112, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0), 3.0); gl_FragColor = vec4(vec3(0.3, 0.65, 1.0) * i * 1.1, i); }'
  })));
  {
    const n = small ? 1500 : 3000, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2500 + Math.random() * 800);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    orbit.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  }
  orbit.add(new THREE.AmbientLight(0x334466, 0.6));
  const sunL = new THREE.DirectionalLight(0xfff1d6, 1.2); sunL.position.copy(sunDir).multiplyScalar(500); orbit.add(sunL);

  // Satellite rings
  const sats: { m: THREE.Object3D; r: number; a: number; sp: number }[] = [];
  [[0.35, 0.0, 134], [-0.25, 1.2, 140], [0.15, 2.3, 146]].forEach((o, ri) => {
    const g = new THREE.Group(); g.rotation.x = o[0]; g.rotation.y = o[1]; orbit.add(g);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * o[2], 0, Math.sin(a) * o[2])); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe3b862, transparent: true, opacity: 0.18 })));
    for (let s = 0; s < 6; s++) {
      const sat = new THREE.Group();
      sat.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), stdMat('#c9b07a', { metalness: 0.7, roughness: 0.3 })));
      [-2.6, 2.6].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.3), stdMat('#1f3f73', { emissive: 0x0a1a38 })); p.position.x = x; sat.add(p); });
      sprite(0xffe2a6, 4, sat);
      g.add(sat); sats.push({ m: sat, r: o[2], a: s / 6 * Math.PI * 2 + ri, sp: 0.06 + ri * 0.015 });
    }
  });

  // The agent: a particle swarm that morphs into a document
  const CORE = new THREE.Vector3(0, 150, 40);
  const agent = new THREE.Group(); agent.position.copy(CORE); orbit.add(agent);
  const NP = small ? 3500 : 7000;
  const aS = new Float32Array(NP * 3), aD = new Float32Array(NP * 3), aR = new Float32Array(NP);
  {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < NP; i++) {
      const y = 1 - (i / (NP - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i, rad = 13 + (Math.random() - 0.5) * 1.6;
      aS[i * 3] = Math.cos(th) * r * rad; aS[i * 3 + 1] = y * rad; aS[i * 3 + 2] = Math.sin(th) * r * rad;
      aR[i] = Math.random();
    }
    // Page layout: title, subtitle, three headed sections of text lines and two signature lines
    const W = 30, H = 40, top = H / 2 - 3;
    const lines: { y: number; x0: number; len: number; thick: number }[] = [];
    lines.push({ y: top, x0: -W / 2 + 2.5, len: 17, thick: 1.0 });
    lines.push({ y: top - 2.2, x0: -W / 2 + 2.5, len: 22, thick: 0.35 });
    let y = top - 5.5;
    [4, 4, 1].forEach((count) => {
      lines.push({ y, x0: -W / 2 + 2.5, len: 8, thick: 0.6 }); y -= 2.4;
      for (let k = 0; k < count; k++) { lines.push({ y, x0: -W / 2 + 3.5, len: 14 + Math.random() * 9, thick: 0.35 }); y -= 2.0; }
      y -= 1.4;
    });
    lines.push({ y: -H / 2 + 3.5, x0: -W / 2 + 2.5, len: 9, thick: 0.2 });
    lines.push({ y: -H / 2 + 3.5, x0: 3.5, len: 9, thick: 0.2 });
    const border = Math.floor(NP * 0.22);
    const totalLen = lines.reduce((s, l) => s + l.len * (1 + l.thick), 0);
    let idx = 0;
    for (let b = 0; b < border; b++, idx++) {
      const t = b / border * 2 * (W + H);
      let px: number, py: number;
      if (t < W) { px = -W / 2 + t; py = H / 2; }
      else if (t < W + H) { px = W / 2; py = H / 2 - (t - W); }
      else if (t < 2 * W + H) { px = W / 2 - (t - W - H); py = -H / 2; }
      else { px = -W / 2; py = -H / 2 + (t - 2 * W - H); }
      aD[idx * 3] = px; aD[idx * 3 + 1] = py; aD[idx * 3 + 2] = 0;
    }
    lines.forEach((l, li) => {
      const cnt = li === lines.length - 1 ? NP - idx : Math.floor((NP - border) * (l.len * (1 + l.thick)) / totalLen);
      for (let j = 0; j < cnt && idx < NP; j++, idx++) {
        aD[idx * 3] = l.x0 + Math.random() * l.len; aD[idx * 3 + 1] = l.y + (Math.random() - 0.5) * l.thick; aD[idx * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
    });
    for (; idx < NP; idx++) { aD[idx * 3] = (Math.random() - 0.5) * W; aD[idx * 3 + 1] = (Math.random() - 0.5) * H; aD[idx * 3 + 2] = 0; }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(aS, 3));
  pg.setAttribute('aDoc', new THREE.BufferAttribute(aD, 3));
  pg.setAttribute('aRand', new THREE.BufferAttribute(aR, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMorph: { value: 0 }, uScale: { value: 1 } },
    vertexShader: `
uniform float uTime; uniform float uMorph; uniform float uScale; attribute vec3 aDoc; attribute float aRand; varying vec3 vC; varying float vA;
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
void main(){ float m = smoothstep(aRand * 0.45, aRand * 0.45 + 0.55, uMorph);
 vec3 s = rotY(uTime * 0.25 + aRand * 0.2) * rotX(uTime * 0.1) * position; s *= 1.0 + 0.06 * sin(uTime * 2.0 + aRand * 40.0);
 vec3 p = mix(s, aDoc, m);
 p += vec3(sin(aRand * 91.0 + uTime), cos(aRand * 57.0 + uTime * 1.3), sin(aRand * 33.0 + uTime * 0.7)) * sin(m * 3.14159) * 5.0;
 vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
 gl_PointSize = uScale * (0.7 + aRand * 0.9) * (120.0 / -mv.z);
 vC = mix(mix(vec3(0.3, 1.0, 0.8), vec3(0.65, 0.5, 1.0), aRand), vec3(1.0, 0.86, 0.55), m); vA = 0.55 + 0.45 * m; }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a * vA * 1.3, a * vA); }'
  });
  agent.add(new THREE.Points(pg, pMat));
  const icoMat = new THREE.MeshBasicMaterial({ color: 0x5ef0c9, wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), icoMat); agent.add(ico);
  const coreGlow = sprite(0x9ff7e0, 26, agent);

  // Signal path: ship on Earth -> relay satellite -> agent
  const shipOnEarth = new THREE.Vector3(-0.35, 0.92, 0.25).normalize().multiplyScalar(100.5);
  const relay = new THREE.Vector3(-70, 150, 70);
  const pathMat = beamMat.clone();
  const pathCurve = new THREE.CatmullRomCurve3([shipOnEarth, relay, CORE.clone().add(new THREE.Vector3(-10, 0, 0))]);
  orbit.add(new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 160, 0.3, 6, false), pathMat));
  sprite(0xffd27a, 5, orbit, shipOnEarth.x, shipOnEarth.y, shipOnEarth.z);
  const relaySat = new THREE.Group(); relaySat.position.copy(relay); orbit.add(relaySat);
  relaySat.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), stdMat('#d6bd84', { metalness: 0.7, roughness: 0.3 })));
  [-6, 6].forEach((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 3), stdMat('#20437a', { emissive: 0x0c1e40 })); p.position.x = x; relaySat.add(p); });
  sprite(0xffe2a6, 9, relaySat);

  // ==========================================================
  // Post-processing: bloom, lens edge, grain and the cloud transition
  // ==========================================================
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(sea, seaCam); composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), small ? 0.8 : 1.0, 0.65, 0.62); composer.addPass(bloom);
  const finalPass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWipe: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GLSL_NOISE + `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uWipe; uniform vec2 uRes; varying vec2 vUv;
void main(){ vec2 c = vUv - 0.5; float r = dot(c, c);
 vec3 col; col.r = texture2D(tDiffuse, vUv + c * r * 0.018).r; col.g = texture2D(tDiffuse, vUv).g; col.b = texture2D(tDiffuse, vUv - c * r * 0.018).b;
 col *= 1.0 - smoothstep(0.12, 0.6, r) * 0.55;
 vec2 q = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.4; float n = fbm(q + vec2(0.0, uTime * 0.12)); float n2 = fbm(q * 2.3 - vec2(uTime * 0.05, 0.0));
 float cover = clamp((uWipe * 1.7 - (1.0 - n)) * 3.0, 0.0, 1.0);
 vec3 cloud = mix(vec3(0.16, 0.22, 0.32), vec3(0.78, 0.84, 0.92), n * 0.7 + n2 * 0.4);
 col = mix(col, cloud, cover);
 col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.04;
 gl_FragColor = vec4(col, 1.0); }`
  });
  composer.addPass(finalPass);

  // ==========================================================
  // Cameras
  // ==========================================================
  const seaStory = {
    wide: [K(0, [-40, 4.5, 60], [-2, 26, 0]), K(1, [0, 13, 38], [-14, 9, -6]), K(2, [-26, 5, 46], [10, 60, -40]), K(2.5, [-22, 60, 30], [-40, 400, -200]), K(3.5, [70, 70, 50], [-10, 8, 0]), K(4, [44, 14, 50], [-4, 20, 6])],
    narrow: [K(0, [-72, 8, 110], [-4, 64, 0]), K(1, [-36, 16, 36], [-14, 4, 0]), K(2, [-30, 8, 66], [-10, 52, -30]), K(2.5, [-22, 60, 30], [-40, 400, -200]), K(3.5, [70, 70, 60], [-10, 8, 0]), K(4, [40, 16, 66], [-12, 6, 0])]
  };
  const orbitStory = {
    wide: [K(2.5, [-150, 230, 360], [0, 90, 0]), K(3.0, [-36, 162, 112], [-14, 146, 30]), K(3.5, [-4, 152, 98], [-2, 150, 40])],
    narrow: [K(2.5, [-150, 230, 420], [0, 90, 0]), K(3.0, [-30, 170, 140], [0, 135, 40]), K(3.5, [-4, 152, 116], [0, 146, 40])]
  };
  // Login: the ship low in frame under the aurora, centred card above it
  const seaLogin = { wide: [K(0, [-46, 5, 66], [-2, 30, 0])], narrow: [K(0, [-74, 8, 112], [-4, 60, 0])] };
  // Register: the agent sits left of centre so the form can take the right half
  const orbitRegister = { wide: [K(0, [-6, 158, 112], [16, 152, 40])], narrow: [K(0, [-8, 150, 150], [0, 168, 40])] };

  let narrow = false;
  const pointer = new THREE.Vector2(), pS = new THREE.Vector2();
  const onPointer = (e: PointerEvent) => pointer.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  window.addEventListener('pointermove', onPointer, { passive: true });

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    narrow = w / h < 0.9;
    renderer.setSize(w, h, false);
    [seaCam, orbitCam].forEach((c) => { c.aspect = w / h; c.fov = narrow ? 60 : 45; c.updateProjectionMatrix(); });
    pMat.uniforms.uScale.value = renderer.getPixelRatio() * (h / 900) * 1.4;
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
    bloom.resolution.set(w * (small ? 0.5 : 1), h * (small ? 0.5 : 1));
    finalPass.uniforms.uRes.value.set(w, h);
    kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  let progress = 0, morphTarget = 0, morph = 0, uplinkAt = -1;
  const camP = new THREE.Vector3(), camG = new THREE.Vector3(), wantP = new THREE.Vector3(), wantG = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastScene: THREE.Scene | null = null, running = true, visible = true, raf = 0, frames = 0, slow = 0, disposed = false;
  let last = performance.now();
  const t0 = last;
  let lastLink = '', lastHdg = -1;
  const link = (s: string) => { if (s !== lastLink) { lastLink = s; opts.onLink?.(s); } };

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t = reduced ? 12.0 : (now - t0) / 1000;
    if (!reduced && frames < 120) {
      frames++; slow += dt;
      if (frames === 120 && slow / 120 > 0.026) { bloom.enabled = false; renderer.setPixelRatio(1); resize(); }
    }

    const p = progress;
    let inOrbit: boolean, keys: Key[], keyT: number, wipe = 0;
    if (mode === 'story') {
      inOrbit = p >= 2.5 && p < 3.5;
      wipe = Math.max(1 - c01(Math.abs(p - 2.5) / 0.22), 1 - c01(Math.abs(p - 3.5) / 0.22));
      keys = inOrbit ? (narrow ? orbitStory.narrow : orbitStory.wide) : (narrow ? seaStory.narrow : seaStory.wide);
      keyT = p;
    } else if (mode === 'login') {
      inOrbit = false; keys = narrow ? seaLogin.narrow : seaLogin.wide; keyT = 0;
    } else {
      inOrbit = true; keys = narrow ? orbitRegister.narrow : orbitRegister.wide; keyT = 0;
    }
    const scene = inOrbit ? orbit : sea, cam = inOrbit ? orbitCam : seaCam;
    sampleKeys(keys, keyT, wantP, wantG);
    if (mode !== 'story' && !reduced) { wantP.x += Math.sin(t * 0.07) * 6; wantP.y += Math.sin(t * 0.11) * 1.5; }
    pS.lerp(pointer, reduced ? 1 : 0.05);
    wantP.x += pS.x * 5; wantP.y -= pS.y * 2.5;
    if (scene !== lastScene || reduced) { camP.copy(wantP); camG.copy(wantG); lastScene = scene; }
    else { const k = 1 - Math.pow(0.002, dt); camP.lerp(wantP, k); camG.lerp(wantG, k); }
    cam.position.copy(camP); cam.lookAt(camG);

    if (!inOrbit) {
      skyMat.uniforms.uTime.value = t; waterMat.uniforms.uTime.value = t; beamMat.uniforms.uTime.value = t; holoMat.uniforms.uTime.value = t;
      const h0 = waveHeight(0, 0, t), hb = waveHeight(14, 0, t), hst = waveHeight(-14, 0, t), hp = waveHeight(0, -3, t), hsb = waveHeight(0, 3, t);
      ship.position.y = h0 * 0.85; ship.rotation.z = Math.atan2(hb - hst, 28) * 0.8; ship.rotation.x = Math.atan2(hsb - hp, 6) * 0.35;
      const hdg = 74 + Math.round(ship.rotation.x * 50);
      if (hdg !== lastHdg) { lastHdg = hdg; opts.onHeading?.(hdg); }
      const from = ship.localToWorld(tmp.set(-13.2, 13.4, 0));
      if (!beam || from.distanceTo(beamFrom) > 0.5) buildBeam(from.clone());
      let up: number, vis: number;
      if (mode === 'story') { up = c01((p - 1.35) / 1.1); vis = p < 3 && up > 0 ? 1 : 0; }
      else { up = uplinkAt < 0 ? 0 : c01((t - uplinkAt) / 2.2); vis = up > 0 ? 1 : 0; }
      beamMat.uniforms.uHead.value = up; beamMat.uniforms.uVis.value = vis;
      beamHead.visible = vis > 0 && up < 1; if (beamHead.visible) beamHead.position.copy(from).lerp(beamTop, up);
      const rev = mode === 'story' ? c01((p - 3.55) / 0.4) : 0;
      holo.visible = rev > 0; holoMat.uniforms.uReveal.value = rev;
      holo.position.set(-13.6, 24 + ship.position.y, 0); holo.lookAt(cam.position.x, holo.position.y, cam.position.z);
      if (mode === 'story') link(p < 1.35 ? 'VSAT · idle' : p < 2.5 ? 'VSAT · sending' : p < 3.9 ? 'VSAT · receiving' : 'VSAT · reply in');
      else link(uplinkAt < 0 ? 'VSAT · standing by' : 'VSAT · signing in');
    } else {
      earthMat.uniforms.uTime.value = t; earth.rotation.y = t * 0.01;
      sats.forEach((s) => { const a = s.a + t * s.sp; s.m.position.set(Math.cos(a) * s.r, 0, Math.sin(a) * s.r); s.m.rotation.y = -a; });
      pMat.uniforms.uTime.value = t;
      if (mode === 'story') morph = c01((p - 2.6) / 0.55);
      else morph += (morphTarget - morph) * (reduced ? 1 : 1 - Math.pow(0.05, dt));
      pMat.uniforms.uMorph.value = morph;
      icoMat.opacity = 0.5 * (1 - morph); ico.rotation.set(t * 0.3, t * 0.4, 0); ico.scale.setScalar(1 + 0.05 * Math.sin(t * 3));
      coreGlow.material.opacity = 1 - morph * 0.85;
      pathMat.uniforms.uTime.value = t; pathMat.uniforms.uHead.value = mode === 'story' ? c01((p - 2.5) / 0.25) : 1; pathMat.uniforms.uVis.value = 1;
      if (mode === 'story') link('Agent · drafting');
    }

    renderPass.scene = scene; renderPass.camera = cam;
    finalPass.uniforms.uTime.value = t; finalPass.uniforms.uWipe.value = wipe;
    composer.render(dt);

    const settling = mode === 'register' && Math.abs(morphTarget - morph) > 0.002;
    if (running && visible && (!reduced || settling)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && !disposed) raf = requestAnimationFrame(frame); }

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) { last = performance.now(); kick(); } }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { running = !document.hidden; if (running) { last = performance.now(); kick(); } };
  document.addEventListener('visibilitychange', onVis);

  resize();

  return {
    setProgress(v) { progress = v; kick(); },
    setMorph(v) { morphTarget = c01(v); kick(); },
    uplink() { uplinkAt = reduced ? 12.0 - 2.2 : (performance.now() - t0) / 1000; kick(); },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      [sea, orbit].forEach((s) => s.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m.dispose());
      }));
      glow.dispose(); holoMat.uniforms.uTex.value?.dispose();
      composer.dispose?.(); renderer.dispose();
    }
  };
}
