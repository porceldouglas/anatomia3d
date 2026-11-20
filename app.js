import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CATS, INFO } from './data.js';

const $ = (s) => document.querySelector(s);
const TA = await fetch('ta.json').then(r => r.json()).catch(() => ({}));

// ---------- Cena ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.0;
controls.screenSpacePanning = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3530, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
camera.add(key); key.position.set(0.4, 0.6, 1);
const fill = new THREE.DirectionalLight(0xffe6d0, 0.5);
camera.add(fill); fill.position.set(-1, -0.3, 0.5);
scene.add(camera);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const p = document.getElementById('panel');
  const off = p && !p.classList.contains('hide') && w >= 700 ? 150 : 0;
  if (off) camera.setViewOffset(w, h, -off, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- Estado ----------
const MODES = {
  face: { file: 'models/head.glb', curves: 'models/head_curves.json', group: null, items: [], cats: {},
          defaults: { pele: [true, 0.45], musc: [true, 1], osso: [true, 1], dente: [true, 1], cart: [true, 1], olho: [true, 1], glan: [true, 1], art: [true, 1], veia: [true, 1], nerv: [true, 1] } },
  body: { file: 'models/body.glb', curves: null, group: null, items: [], cats: {},
          defaults: { pele: [false, 0.35], fasc: [false, 1], musc: [true, 1], osso: [true, 1], orgao: [true, 1], nervc: [true, 1] } },
};
let mode = 'face';
let side = 'both';
let riskMode = false;
let selected = null;
const layerState = {}; // mode -> cat -> {on, op}

function makeMat(cat, op) {
  const c = CATS[cat]?.cor ?? 0xcccccc;
  const tube = cat === 'art' || cat === 'veia' || cat === 'nerv';
  return new THREE.MeshStandardMaterial({
    color: c, roughness: cat === 'pele' ? 0.75 : tube ? 0.35 : 0.6, metalness: 0,
    transparent: op < 1, opacity: op, depthWrite: op >= 0.99,
    side: cat === 'pele' ? THREE.FrontSide : THREE.DoubleSide,
  });
}
const ghostMat = new THREE.MeshStandardMaterial({ color: 0x8d9097, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.9 });
const selMat = new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x1a6f88, roughness: 0.4 });

// ---------- Carregamento ----------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function setLoad(p, t) {
  $('#load').style.display = p >= 1 ? 'none' : 'flex';
  $('#loadbar').style.width = Math.round(p * 100) + '%';
  if (t) $('#loadtxt').textContent = t;
}

function infoFor(base) {
  const i = INFO[base] || {};
  const ta = TA[base] || {};
  return { pt: i.pt || ta.pt || base, la: ta.la || '', en: base, info: i.info || '', clin: i.clin || '', risk: !!i.r };
}

async function loadMode(m) {
  const M = MODES[m];
  if (M.group) return;
  setLoad(0.02, m === 'face' ? 'Carregando face…' : 'Carregando corpo inteiro…');
  const gltf = await loader.loadAsync(M.file, (e) => { if (e.total) setLoad(Math.min(0.95, e.loaded / e.total)); });
  const group = new THREE.Group();
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const o of meshes) {
    const nm = o.userData.name || o.parent?.userData?.name || o.name;
    let [cat, base, sd] = nm.split('|');
    if (m === 'body' && cat === 'musc' && /fascia|aponeuros|tract|sheath|retinacul|bursa|tendon|ligament|septum|membrane|arch|band|sling|raphe/i.test(base)) cat = 'fasc';
    o.updateWorldMatrix(true, false);
    const mesh = new THREE.Mesh(o.geometry, null);
    mesh.applyMatrix4(o.matrixWorld);
    addItem(M, group, mesh, cat, base, sd);
  }
  if (M.curves) {
    const curves = await fetch(M.curves).then(r => r.json());
    const R = { art: 0.0011, veia: 0.0013, nerv: 0.0009, glan: 0.0012 };
    for (const c of curves) {
      const geos = [];
      for (const line of c.lines) {
        const pts = line.map(p => new THREE.Vector3(p[0], p[1], p[2]));
        if (pts.length < 2) continue;
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const seg = Math.min(400, Math.max(4, pts.length * 2));
        geos.push(new THREE.TubeGeometry(curve, seg, R[c.cat] || 0.001, 6, false));
      }
      if (!geos.length) continue;
      const g = mergeGeometries(geos, false);
      geos.forEach(x => x.dispose());
      addItem(M, group, new THREE.Mesh(g, null), c.cat, c.name, c.side);
    }
  }
  M.group = group;
  scene.add(group);
  layerState[m] = {};
  for (const cat of Object.keys(M.cats)) {
    const d = M.defaults[cat] || [true, 1];
    layerState[m][cat] = { on: d[0], op: d[1] };
    M.cats[cat].mat = makeMat(cat, d[1]);
  }
  // ordem de desenho: pele transparente por último
  M.items.forEach(it => { it.mesh.renderOrder = it.cat === 'pele' ? 2 : 0; });
  setLoad(1);
}

function addItem(M, group, mesh, cat, base, sd) {
  const info = infoFor(base);
  const it = { mesh, cat, base, side: sd || 'm', info, hidden: false };
  mesh.userData.item = it;
  group.add(mesh);
  M.items.push(it);
  M.cats[cat] ||= { count: 0 };
  M.cats[cat].count++;
}

// ---------- Aparência ----------
function refresh() {
  const M = MODES[mode];
  for (const k of Object.keys(MODES)) if (MODES[k].group) MODES[k].group.visible = k === mode;
  for (const it of M.items) {
    const ls = layerState[mode][it.cat];
    const sideOk = side === 'both' || it.side === 'm' || it.side === side;
    const vis = ls.on && !it.hidden && sideOk;
    it.mesh.visible = vis;
    if (!vis) continue;
    if (it === selected) it.mesh.material = selMat;
    else if (riskMode && !it.info.risk) it.mesh.material = ghostMat;
    else it.mesh.material = M.cats[it.cat].mat;
  }
}

// pulso nas zonas de risco
const riskMats = new Set();
function riskPulse(t) {
  if (!riskMode) return;
  const k = 0.35 + 0.35 * Math.sin(t * 0.005);
  for (const cat of ['art', 'veia', 'nerv', 'glan']) {
    const m = MODES[mode].cats[cat]?.mat;
    if (m) { m.emissive.setHex(CATS[cat].cor); m.emissiveIntensity = k; riskMats.add(m); }
  }
}
function clearPulse() { riskMats.forEach(m => { m.emissiveIntensity = 0; }); }

// ---------- Painel ----------
function buildPanel() {
  const M = MODES[mode];
  const box = $('#layers'); box.innerHTML = '';
  const order = Object.keys(CATS).filter(c => M.cats[c]);
  for (const cat of order) {
    const ls = layerState[mode][cat];
    const row = document.createElement('div'); row.className = 'layer';
    row.innerHTML = `<label><input type="checkbox" ${ls.on ? 'checked' : ''}><span class="sw" style="background:#${CATS[cat].cor.toString(16).padStart(6, '0')}"></span>${CATS[cat].nome}</label><input type="range" min="0.08" max="1" step="0.01" value="${ls.op}">`;
    const [cb, rg] = row.querySelectorAll('input');
    cb.onchange = () => { ls.on = cb.checked; refresh(); };
    rg.oninput = () => {
      ls.op = +rg.value; const m = M.cats[cat].mat;
      m.opacity = ls.op; m.transparent = ls.op < 1; m.depthWrite = ls.op >= 0.99; m.needsUpdate = true;
    };
    box.appendChild(row);
  }
  buildList();
}

function buildList() {
  const M = MODES[mode];
  const q = $('#search').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const seen = new Map();
  for (const it of M.items) {
    if (riskMode && !it.info.risk) continue;
    const key = it.base;
    if (seen.has(key)) continue;
    const hay = (it.info.pt + ' ' + it.info.en + ' ' + it.info.la).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (q && !hay.includes(q)) continue;
    seen.set(key, it);
  }
  const arr = [...seen.values()].sort((a, b) => (a.cat + a.info.pt).localeCompare(b.cat + b.info.pt, 'pt'));
  const list = $('#list'); list.innerHTML = '';
  const max = q ? 300 : (mode === 'face' ? 300 : 120);
  for (const it of arr.slice(0, max)) {
    const d = document.createElement('div');
    if (selected && selected.base === it.base) d.className = 'sel';
    d.innerHTML = `<i style="background:#${CATS[it.cat].cor.toString(16).padStart(6, '0')}"></i>${it.info.pt}${it.info.risk ? ' <small>⚠</small>' : ''}`;
    d.onclick = () => { const ls = layerState[mode][it.cat]; if (!ls.on) { ls.on = true; buildPanel(); } it.hidden = false; select(it); focusOn(it); };
    list.appendChild(d);
  }
  if (arr.length > max) { const d = document.createElement('div'); d.style.color = 'var(--mut)'; d.textContent = `+${arr.length - max} — use a busca`; list.appendChild(d); }
}
$('#search').addEventListener('input', buildList);

// ---------- Seleção ----------
const SIDE_TXT = { l: ' (esquerdo)', r: ' (direito)', m: '' };
function select(it) {
  selected = it;
  refresh();
  if (!it) { $('#card').classList.remove('show'); buildList(); return; }
  const i = it.info;
  $('#cName').textContent = i.pt + SIDE_TXT[it.side];
  $('#cLa').textContent = [i.la, i.en !== i.pt ? i.en : ''].filter(Boolean).join(' · ');
  $('#cInfo').textContent = i.info; $('#cInfo').style.display = i.info ? '' : 'none';
  $('#cClin').textContent = i.clin; $('#cClin').style.display = i.clin ? '' : 'none';
  $('#card').classList.add('show');
  buildList();
}
$('#cardX').onclick = () => select(null);
$('#aHide').onclick = () => { if (selected) { selected.hidden = true; select(null); } };
$('#aIso').onclick = () => {
  if (!selected) return;
  for (const it of MODES[mode].items) it.hidden = it.base !== selected.base;
  layerState[mode][selected.cat].on = true; buildPanel(); refresh();
};
$('#aFocus').onclick = () => selected && focusOn(selected);
$('#showAll').onclick = () => { for (const it of MODES[mode].items) it.hidden = false; refresh(); };

const ray = new THREE.Raycaster();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 500) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  const objs = MODES[mode].items.filter(it => it.mesh.visible && !(riskMode && !it.info.risk)).map(it => it.mesh);
  const hits = ray.intersectObjects(objs, false);
  // ignora pele muito transparente
  const hit = hits.find(h => { const it = h.object.userData.item; return !(it.cat === 'pele' && layerState[mode].pele.op < 0.3); });
  select(hit ? hit.object.userData.item : null);
});

// ---------- Câmera ----------
let anim = null;
function flyTo(target, pos, dur = 600) {
  anim = { t0: performance.now(), dur, ft: controls.target.clone(), fp: camera.position.clone(), tt: target, tp: pos };
}
function bboxOf(objs) { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o)); return b; }
function focusOn(it) {
  const meshes = MODES[mode].items.filter(x => x.base === it.base && x.mesh.visible).map(x => x.mesh);
  const b = bboxOf(meshes.length ? meshes : [it.mesh]);
  const c = b.getCenter(new THREE.Vector3());
  const r = Math.max(b.getSize(new THREE.Vector3()).length() / 2, 0.03);
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(c, c.clone().add(dir.multiplyScalar(r / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.3)));
}
function setView(v, dur = 600) {
  const M = MODES[mode];
  const meshes = M.items.filter(it => mode === 'face' ? it.cat === 'pele' : it.cat !== 'pele').map(it => it.mesh);
  const b = bboxOf(meshes);
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  const d = Math.max(s.y, s.x * innerHeight / innerWidth) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25 + s.z / 2;
  const dirs = { front: [0, 0, 1], side: [1, 0, 0], tq: [0.7, 0.05, 0.75], back: [0, 0, -1], top: [0, 1, 0.02] };
  const dir = new THREE.Vector3(...dirs[v]).normalize();
  flyTo(c, c.clone().add(dir.multiplyScalar(d)), dur);
}
document.querySelectorAll('#views [data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));

// ---------- Controles ----------
document.querySelectorAll('[data-side]').forEach(b => b.onclick = () => {
  side = b.dataset.side;
  document.querySelectorAll('[data-side]').forEach(x => x.classList.toggle('on', x === b));
  refresh();
});
$('#risk').onclick = () => {
  riskMode = !riskMode; $('#risk').classList.toggle('on', riskMode);
  if (!riskMode) clearPulse();
  else { const ls = layerState[mode]; for (const c of ['art', 'veia', 'nerv', 'glan']) if (ls[c]) ls[c].on = true; buildPanel(); }
  refresh(); buildList();
};
const panel = $('#panel'), tg = $('#toggle');
tg.onclick = () => { panel.classList.toggle('hide'); tg.classList.toggle('closed'); resize(); };
if (innerWidth < 700) { panel.classList.add('hide'); tg.classList.add('closed'); }
resize();

async function switchMode(m) {
  if (m === mode && MODES[m].group) return;
  select(null);
  if (riskMode && m === 'body') { riskMode = false; clearPulse(); $('#risk').classList.remove('on'); }
  mode = m;
  $('#search').value = '';
  $('#mFace').classList.toggle('on', m === 'face');
  $('#mBody').classList.toggle('on', m === 'body');
  $('#risk').style.display = m === 'face' ? '' : 'none';
  await loadMode(m);
  buildPanel(); refresh();
  setView('front', 0);
}
$('#mFace').onclick = () => switchMode('face');
$('#mBody').onclick = () => switchMode('body');

// ---------- Loop ----------
function loop(t) {
  if (anim && anim.t0 !== undefined) {
    const k = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    controls.target.lerpVectors(anim.ft, anim.tt, e);
    camera.position.lerpVectors(anim.fp, anim.tp, e);
    if (k >= 1) anim = null;
  }
  riskPulse(t);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- Offline ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
    $('#off').textContent = '● Disponível offline';
  }).catch(() => {});
}

await switchMode('face');
requestAnimationFrame(loop);
window.__app = { MODES, camera, controls, setView, switchMode, select, refresh };
