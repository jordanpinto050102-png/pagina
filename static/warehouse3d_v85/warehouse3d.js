import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

// ================================
// CONFIGURACION DEL LAYOUT
// ================================
// X = izquierda / derecha
// Y = altura
// Z = adelante / atras
// rotacion = giro horizontal del rack en radianes. Math.PI / 2 gira 90 grados.
const DIMENSIONES_ALMACEN = {
  piso: { ancho: 46, largo: 38, alto: 5 },
  rack: { ancho: 6, profundidad: 1.6, alto: 4.2, separacionNivel: 0.08 },
  puerta: { ancho: 4, alto: 3 },
};

const CONFIG_LAYOUT = {
  piso1: {
    id: 1,
    nombre: "ALMACEN PISO 1",
    puerta: { x: 0, y: 0, z: -17, rotacion: 0, ancho: 4, alto: 3 },
    racks: [
      { id: "R1", x: -14, y: 0, z: -7, rotacion: 0, niveles: 4, posiciones: 24 },
      { id: "R2", x: -7, y: 0, z: -7, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R3", x: 0, y: 0, z: -7, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R4", x: 7, y: 0, z: -7, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R5", x: 14, y: 0, z: -7, rotacion: 0, niveles: 4, posiciones: 8 },
    ],
  },
  piso2: {
    id: 2,
    nombre: "ALMACEN PISO 2",
    puerta: { x: 0, y: 0, z: 17, rotacion: Math.PI, ancho: 4, alto: 3 },
    racks: [
      { id: "R6", x: -14, y: 0, z: 8, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R7", x: -7, y: 0, z: 8, rotacion: 0, niveles: 4, posiciones: 8 },
      { id: "R8", x: 0, y: 0, z: 8, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R9", x: 7, y: 0, z: 8, rotacion: 0, niveles: 4, posiciones: 8 },
      { id: "R10", x: 14, y: 0, z: 8, rotacion: 0, niveles: 4, posiciones: 6 },
    ],
  },
};

const pedidosDemo = [{
  numero: "PED-00125",
  estado: "LISTO",
  componentes: [
    { codigo: "ROD-6205", nombre: "Rodamiento 6205", cantidad: 2, unidad: "UND", ubicacion: "ALM-R1-P2-F17" },
    { codigo: "SEN-M18", nombre: "Sensor inductivo M18", cantidad: 1, unidad: "UND", ubicacion: "ALM-R5-P2" },
    { codigo: "CON-18A", nombre: "Contactor 18 A", cantidad: 2, unidad: "UND", ubicacion: "ALM-R7-P3" },
  ],
}];

const host = document.getElementById("warehouseCanvas");
const componentCard = document.getElementById("componentCard");
const pedidoList = document.getElementById("pedidoList");
const floorLabel = document.getElementById("floorLabel");
if (new URLSearchParams(window.location.search).get("embedded") === "1") document.body.classList.add("embedded");

let payload = getPayload();
let selected = null;
let selectedObject = null;
let positionMap = new Map();
let slotObjects = [];
let rackObjects = [];
let designMode = false;

const mats = {
  floor: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.78 }),
  rackFrame: new THREE.MeshStandardMaterial({ color: 0x145ea8, roughness: 0.45, transparent: true, opacity: 0.24 }),
  slot: new THREE.MeshStandardMaterial({ color: 0x67c7ee, roughness: 0.42, emissive: 0x0b3b66, emissiveIntensity: 0.12 }),
  pedido: new THREE.MeshStandardMaterial({ color: 0xffc72c, roughness: 0.34, emissive: 0x6b4300, emissiveIntensity: 0.55 }),
  selected: new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.25, emissive: 0x32116b, emissiveIntensity: 0.7 }),
  door: new THREE.MeshStandardMaterial({ color: 0xf4b400, roughness: 0.48, emissive: 0x3a2500, emissiveIntensity: 0.2 }),
  marker: new THREE.MeshBasicMaterial({ color: 0xffc72c }),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdbeafe);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xdbeafe, 1);
renderer.shadowMap.enabled = false;
host.innerHTML = "";
host.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.style.touchAction = "none";

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = true;
controls.enablePan = true;
controls.enableRotate = true;
controls.zoomSpeed = 1.25;
controls.panSpeed = 0.8;
controls.rotateSpeed = 0.75;
controls.minDistance = 4;
controls.maxDistance = 95;

scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 3.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.8);
sun.position.set(7, 14, 10);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdbeafe, 2.1);
fill.position.set(-12, 9, -10);
scene.add(fill);

buildWarehouse();
setGeneralViewNow();
renderSide();
markPedido();

function normalize(value) {
  return String(value || "").trim().replace(/[–—]/g, "-").toUpperCase();
}

function getPayload() {
  try {
    const saved = JSON.parse(localStorage.getItem("mantto_warehouse3d_payload") || "null");
    if (saved?.componentes?.length) return saved;
  } catch (err) {
    console.warn("Payload 3D no disponible", err);
  }
  return { modo: "demo", pedido: pedidosDemo[0], componentes: pedidosDemo[0].componentes };
}

function pisosLayout() {
  return Object.values(CONFIG_LAYOUT);
}

function parseUbicacion(raw) {
  const codigo = normalize(raw).replace(/\s+/g, "");
  const match = codigo.match(/^([A-Z]+)-R(\d+)-P(\d+)(?:-F(\d+))?$/);
  if (!match) return { codigo, valid: false, almacen: "", rack: "", rackNumber: 0, piso: 1, nivel: 1, posicion: 1 };
  const rackNumber = Number(match[2]);
  const rack = `R${rackNumber}`;
  const layout = findRackLayout(rack);
  return {
    codigo,
    valid: true,
    almacen: match[1],
    rack,
    rackNumber,
    piso: layout?.piso?.id || (rackNumber > 5 ? 2 : 1),
    nivel: Number(match[3] || 1),
    posicion: Number(match[4] || 1),
  };
}

function findRackLayout(rackId) {
  for (const piso of pisosLayout()) {
    const rack = (piso.racks || []).find((item) => item.id === rackId);
    if (rack) return { piso, rack };
  }
  return null;
}

function createLabel(text, position, size = 0.72) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 112;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(8,121,201,.35)";
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#0b3b66";
  ctx.font = "800 42px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(size * 2.8, size, 1);
  return sprite;
}

function buildWarehouse() {
  positionMap = new Map();
  slotObjects = [];
  rackObjects = [];

  const group = new THREE.Group();
  group.name = "warehouse-root";
  scene.add(group);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(DIMENSIONES_ALMACEN.piso.ancho, 0.12, DIMENSIONES_ALMACEN.piso.largo), mats.floor);
  floor.position.set(0, -0.08, 0);
  group.add(floor);

  const grid = new THREE.GridHelper(Math.max(DIMENSIONES_ALMACEN.piso.ancho, DIMENSIONES_ALMACEN.piso.largo), 38, 0x0879c9, 0xb7c7d8);
  grid.position.y = 0.01;
  group.add(grid);

  const axes = new THREE.AxesHelper(4);
  axes.position.set(-20, 0.15, -17);
  group.add(axes);

  pisosLayout().forEach((piso) => {
    group.add(createLabel(piso.nombre, new THREE.Vector3(-18, 0.9, piso.id === 1 ? -14.5 : 14.5), 0.64));
    addDoor(group, piso);
    (piso.racks || []).forEach((rackConfig) => addRack(group, piso, rackConfig));
  });

  const diagnostic = document.createElement("div");
  diagnostic.className = "warehouse-diagnostic";
  diagnostic.textContent = `3D OK · racks ${rackObjects.length} · ubicaciones ${positionMap.size}`;
  host.appendChild(diagnostic);
}

function addDoor(group, piso) {
  if (!piso.puerta) return;
  const cfg = piso.puerta;
  const ancho = cfg.ancho || DIMENSIONES_ALMACEN.puerta.ancho;
  const alto = cfg.alto || DIMENSIONES_ALMACEN.puerta.alto;
  const door = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 0.24), mats.door);
  door.position.set(cfg.x || 0, (cfg.y || 0) + alto / 2, cfg.z || 0);
  door.rotation.y = cfg.rotacion || 0;
  door.userData = { type: "door", piso: piso.id };
  group.add(door);
  const label = createLabel("PUERTA", new THREE.Vector3(cfg.x || 0, alto + 0.7, cfg.z || 0), 0.48);
  label.rotation.y = cfg.rotacion || 0;
  group.add(label);
}

function addRack(group, piso, cfg) {
  const dimensions = { ...DIMENSIONES_ALMACEN.rack, ...(cfg.dimensiones || {}) };
  const levels = cfg.niveles || 4;
  const positions = maxPositionForRack(Number(String(cfg.id).replace(/\D+/g, "")), cfg.posiciones || 6);
  const rackNumber = Number(String(cfg.id).replace(/\D+/g, "")) || 0;
  const slotW = dimensions.ancho / positions;
  const levelH = dimensions.alto / levels;

  const rack = new THREE.Group();
  rack.name = cfg.id;
  rack.position.set(cfg.x || 0, cfg.y || 0, cfg.z || 0);
  rack.rotation.y = cfg.rotacion || 0;
  rack.userData = { type: "rack", rack: cfg.id, piso: piso.id, niveles: levels, posiciones: positions };
  rackObjects.push(rack);
  group.add(rack);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(dimensions.ancho + 0.18, dimensions.alto + 0.18, dimensions.profundidad + 0.18), mats.rackFrame);
  frame.position.set(0, dimensions.alto / 2, 0);
  rack.add(frame);
  const frameEdge = new THREE.LineSegments(new THREE.EdgesGeometry(frame.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  frameEdge.position.copy(frame.position);
  rack.add(frameEdge);

  for (let nivel = 1; nivel <= levels; nivel += 1) {
    for (let posicion = 1; posicion <= positions; posicion += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, slotW - 0.04), Math.max(0.22, levelH - dimensions.separacionNivel), dimensions.profundidad - 0.1),
        mats.slot.clone()
      );
      cell.position.set(-dimensions.ancho / 2 + slotW * (posicion - 0.5), levelH * (nivel - 0.5), 0.04);
      const codigoUbicacion = `ALM-R${rackNumber}-P${nivel}-F${posicion}`;
      cell.userData = { type: "slot", codigoUbicacion, almacen: "ALM", rack: cfg.id, rackNumber, piso: piso.id, nivel, posicion };
      rack.add(cell);
      cell.add(new THREE.LineSegments(new THREE.EdgesGeometry(cell.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 })));
      slotObjects.push(cell);
      positionMap.set(codigoUbicacion, cell);
      if (posicion === 1) positionMap.set(`ALM-R${rackNumber}-P${nivel}`, cell);
    }
  }
  rack.add(createLabel(cfg.id, new THREE.Vector3(0, dimensions.alto + 0.75, 0), 0.68));
}

function maxPositionForRack(rackNumber, basePositions) {
  const fromPayload = (payload.componentes || [])
    .map((item) => parseUbicacion(item.ubicacion))
    .filter((item) => item.valid && item.rackNumber === rackNumber)
    .map((item) => item.posicion || 1);
  return Math.max(basePositions || 6, ...fromPayload);
}

function markPedido() {
  slotObjects.forEach((slot) => {
    slot.material = mats.slot.clone();
    slot.scale.set(1, 1, 1);
    slot.children.filter((child) => child.name === "selected-light").forEach((child) => slot.remove(child));
  });
  (payload.componentes || []).forEach((item) => {
    const slot = resolveLocationObject(item.ubicacion).object;
    if (slot) slot.material = mats.pedido.clone();
  });
}

function resolveLocationObject(ubicacion) {
  const parsed = parseUbicacion(ubicacion);
  if (!parsed.valid) return { parsed, object: null };
  return { parsed, object: positionMap.get(parsed.codigo) || positionMap.get(`${parsed.almacen}-${parsed.rack}-P${parsed.nivel}`) || null };
}

function setSelected(item) {
  selected = item || null;
  markPedido();
  const result = resolveLocationObject(selected?.ubicacion || "");
  selectedObject = result.object;
  if (selectedObject) {
    selectedObject.material = mats.selected.clone();
    selectedObject.scale.set(1.12, 1.16, 1.28);
    const light = new THREE.PointLight(0xffc72c, 2, 7);
    light.name = "selected-light";
    light.position.set(0, 0.5, 0.9);
    selectedObject.add(light);
    focusObject(selectedObject);
  }
  renderSide(result.parsed);
}

function renderSide(parsed = parseUbicacion(selected?.ubicacion || "")) {
  const pedido = payload.pedido || {};
  if (!selected) {
    componentCard.innerHTML = `<h2>Almacen 3D</h2><p>Vista general lista. Seleccione un componente desde la lista.</p>`;
  } else {
    componentCard.innerHTML = `
      <h2>Componente</h2>
      <dl>
        <dt>Pedido</dt><dd>${pedido.numero || pedido.id || "-"}</dd>
        <dt>Nombre</dt><dd>${selected.nombre || selected.descripcion || "-"}</dd>
        <dt>Codigo</dt><dd>${selected.codigo || "-"}</dd>
        <dt>Cantidad</dt><dd>${selected.cantidad || "-"} ${selected.unidad || ""}</dd>
        <dt>Ubicacion</dt><dd>${selected.ubicacion || "Sin ubicacion"}</dd>
        <dt>Rack</dt><dd>${parsed.valid ? parsed.rack : "-"}</dd>
        <dt>Nivel</dt><dd>${parsed.valid ? `P${parsed.nivel}` : "-"}</dd>
        <dt>Posicion</dt><dd>${parsed.valid && parsed.posicion ? `F${parsed.posicion}` : "Sin F"}</dd>
      </dl>`;
  }
  pedidoList.innerHTML = `<h3>Pedido ${pedido.numero || pedido.id || ""}</h3>${(payload.componentes || []).map((item) => `
    <button class="pedido-item ${normalize(item.codigo) === normalize(selected?.codigo) ? "active" : ""}" type="button" data-code="${escapeAttr(item.codigo || "")}">
      <strong>${escapeHtml(item.nombre || item.descripcion || item.codigo || "Material")}</strong>
      <div class="muted">${escapeHtml(item.codigo || "-")} · ${escapeHtml(item.cantidad || "-")} ${escapeHtml(item.unidad || "")}</div>
      <div>${escapeHtml(item.ubicacion || "Sin ubicacion")}</div>
    </button>`).join("")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }

function focusObject(object) {
  const target = new THREE.Vector3();
  object.getWorldPosition(target);
  animateCamera(target.clone().add(new THREE.Vector3(5, 4, 6)), target, 720);
}

function animateCamera(endPosition, endTarget, duration = 750) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const started = performance.now();
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function step(now) {
    const p = Math.min(1, (now - started) / duration);
    const v = ease(p);
    camera.position.lerpVectors(startPosition, endPosition, v);
    controls.target.lerpVectors(startTarget, endTarget, v);
    controls.update();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function setGeneralViewNow() {
  camera.position.set(0, 20, 31);
  controls.target.set(0, 1.8, 0);
  camera.lookAt(controls.target);
  controls.update();
}
function generalView() { animateCamera(new THREE.Vector3(0, 20, 31), new THREE.Vector3(0, 1.8, 0), 700); }
function showFloor(piso) {
  floorLabel.textContent = `PISO ${piso}`;
  const z = piso === 1 ? -7 : 8;
  animateCamera(new THREE.Vector3(1, 10, z + 12), new THREE.Vector3(0, 1.8, z), 650);
}

pedidoList.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-code]");
  if (!btn) return;
  const item = (payload.componentes || []).find((row) => normalize(row.codigo) === normalize(btn.dataset.code));
  if (item) setSelected(item);
});

renderer.domElement.addEventListener("click", (event) => {
  renderer.domElement.focus();
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(slotObjects, false);
  if (!hits.length) return;
  const data = hits[0].object.userData;
  const item = (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(data.codigoUbicacion))
    || (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(`${data.almacen}-${data.rack}-P${data.nivel}`));
  if (item) setSelected(item);
  else {
    selected = { codigo: "", nombre: "Ubicacion seleccionada", cantidad: "", unidad: "", ubicacion: data.codigoUbicacion };
    setSelected(selected);
  }
  window.parent?.postMessage({ type: "mantto:warehouse3d:selected", ubicacion: item?.ubicacion || data.codigoUbicacion }, "*");
});

renderer.domElement.addEventListener("wheel", (event) => {
  renderer.domElement.focus();
  event.stopPropagation();
}, { passive: false });

window.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "mantto:warehouse3d:payload") {
    payload = msg.payload || getPayload();
    scene.children.filter((item) => item.name === "warehouse-root").forEach((item) => scene.remove(item));
    buildWarehouse();
    selected = null;
    selectedObject = null;
    markPedido();
    renderSide();
    setGeneralViewNow();
  }
  if (msg.type === "mantto:warehouse3d:select") {
    const item = (payload.componentes || []).find((row) => row.id && row.id === msg.id)
      || (payload.componentes || []).find((row) => normalize(row.codigo) === normalize(msg.codigo))
      || (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(msg.ubicacion));
    if (item) setSelected(item);
  }
  if (msg.type === "mantto:warehouse3d:general") {
    floorLabel.textContent = "ALMACEN";
    generalView();
  }
});

document.getElementById("backBtn")?.addEventListener("click", () => window.parent?.postMessage({ type: "mantto:setView", view: "pedidosAceptados" }, "*"));
document.getElementById("floor1Btn")?.addEventListener("click", () => showFloor(1));
document.getElementById("floor2Btn")?.addEventListener("click", () => showFloor(2));
document.getElementById("generalBtn")?.addEventListener("click", () => { floorLabel.textContent = "ALMACEN"; generalView(); });
document.getElementById("designBtn")?.addEventListener("click", () => { designMode = !designMode; document.body.classList.toggle("design-mode", designMode); floorLabel.textContent = designMode ? "VISTA DE DISENO" : "ALMACEN"; generalView(); });
document.getElementById("centerBtn")?.addEventListener("click", () => { if (selectedObject) focusObject(selectedObject); });

function resizeRenderer() {
  const rect = host.getBoundingClientRect();
  const width = Math.max(360, Math.floor(rect.width || host.clientWidth || 360));
  const height = Math.max(420, Math.floor(rect.height || host.clientHeight || 600));
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

window.addEventListener("resize", resizeRenderer);
new ResizeObserver(resizeRenderer).observe(host);
resizeRenderer();
setTimeout(resizeRenderer, 150);
setTimeout(resizeRenderer, 600);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

const initial = (payload.componentes || []).find((item) => item.id && item.id === payload.selectedId)
  || (payload.componentes || []).find((item) => normalize(item.codigo) === normalize(payload.selectedCodigo))
  || (payload.componentes || []).find((item) => normalize(item.ubicacion) === normalize(payload.selectedUbicacion))
  || null;
if (initial && payload.modo !== "pedidosAceptados") setSelected(initial);
animate();
