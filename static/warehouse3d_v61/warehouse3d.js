import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getPayload, parseUbicacion } from "./warehouse-data.js";
import { buildWarehouseScene } from "./warehouse-racks.js";
import { focusObject, generalView } from "./warehouse-camera.js";
import { markPedido, selectLocation, resolveLocationObject } from "./warehouse-picking.js";

const host = document.getElementById("warehouseCanvas");
const componentCard = document.getElementById("componentCard");
const pedidoList = document.getElementById("pedidoList");
const floorLabel = document.getElementById("floorLabel");
if (new URLSearchParams(window.location.search).get("embedded") === "1") document.body.classList.add("embedded");

let payload = getPayload();
let selected = null;
let positionMap = new Map();
let materials = {};
let selectedObject = null;
let warehouseGroup = null;
let designMode = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 1000);
camera.position.set(10, 12, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.shadowMap.enabled = true;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.8, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(5, 12, 8);
sun.castShadow = true;
scene.add(sun);

rebuildWarehouse(payload.componentes || []);

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function rebuildWarehouse(componentes = []) {
  if (warehouseGroup) scene.remove(warehouseGroup);
  const built = buildWarehouseScene(scene, componentes);
  warehouseGroup = built.group;
  positionMap = built.positionMap;
  materials = built.materials;
}

function applyPayload(nextPayload, options = {}) {
  payload = nextPayload || getPayload();
  rebuildWarehouse(payload.componentes || []);
  const item = (payload.componentes || []).find((row) => row.id && row.id === payload.selectedId)
    || (payload.componentes || []).find((row) => normalize(row.codigo) === normalize(payload.selectedCodigo))
    || (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(payload.selectedUbicacion))
    || null;
  if (item && options.focus) setSelected(item);
  else {
    selected = item;
    renderSide(item ? parseUbicacion(item.ubicacion || "") : undefined);
    markPedido(positionMap, payload.componentes || [], materials);
    generalView(camera, controls);
  }
}

function setSelected(item) {
  selected = item || payload.componentes?.[0] || null;
  scene.traverse((object) => {
    if (object.userData?.type === "slot") {
      object.scale.set(1, 1, 1);
      object.children.filter((child) => child.name === "selected-pulse").forEach((child) => object.remove(child));
      object.material = materials.normal.clone();
    }
  });
  markPedido(positionMap, payload.componentes || [], materials);
  const result = selectLocation(positionMap, payload.componentes || [], selected, materials);
  selectedObject = result.object;
  renderSide(result.parsed);
  if (selectedObject) focusObject(camera, controls, selectedObject);
}

function selectByMessage(message) {
  const item = (payload.componentes || []).find((row) => row.id && row.id === message.id)
    || (payload.componentes || []).find((row) => normalize(row.codigo) === normalize(message.codigo))
    || (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(message.ubicacion));
  if (item) setSelected(item);
  else if (message.ubicacion) {
    selected = { codigo: "", nombre: "Ubicacion seleccionada", cantidad: "", unidad: "", ubicacion: message.ubicacion };
    setSelected(selected);
  }
}

function showFloor(piso) {
  floorLabel.textContent = `PISO ${piso}`;
  const z = piso === 1 ? -3.3 : 5.4;
  camera.position.set(2, 8, z + 8);
  controls.target.set(0, 1.8, z);
  controls.update();
}

function renderSide(parsed = parseUbicacion(selected?.ubicacion || "")) {
  const pedido = payload.pedido || {};
  if (!selected) {
    componentCard.innerHTML = `<h2>Componente</h2><p class="error">No hay componente seleccionado.</p>`;
    return;
  }
  const valid = parsed.valid;
  componentCard.innerHTML = `
    <h2>📦 Componente</h2>
    <dl>
      <dt>Pedido</dt><dd>${pedido.numero || pedido.id || "-"}</dd>
      <dt>Nombre</dt><dd>${selected.nombre || selected.descripcion || "-"}</dd>
      <dt>Codigo</dt><dd>${selected.codigo || "-"}</dd>
      <dt>Cantidad</dt><dd>${selected.cantidad || "-"} ${selected.unidad || ""}</dd>
      <dt>Ubicacion</dt><dd>${selected.ubicacion || "Sin ubicacion"}</dd>
      <dt>Almacen</dt><dd>${valid ? parsed.almacen : "-"}</dd>
      <dt>Rack</dt><dd>${valid ? parsed.rack : "-"}</dd>
      <dt>Nivel</dt><dd>${valid ? `P${parsed.nivel}` : "-"}</dd>
      <dt>Posicion</dt><dd>${valid && selected.ubicacion?.includes("-F") ? `F${parsed.posicion}` : "Sin F"}</dd>
    </dl>
    ${valid ? "" : `<p class="error">Ubicacion no reconocida por el simulador.</p>`}
  `;

  pedidoList.innerHTML = `
    <h3>Pedido ${pedido.numero || pedido.id || ""}</h3>
    ${(payload.componentes || []).map((item) => `
      <button class="pedido-item ${normalize(item.codigo) === normalize(selected.codigo) ? "active" : ""}" type="button" data-code="${item.codigo || ""}">
        <strong>${item.nombre || item.descripcion || item.codigo || "Material"}</strong>
        <div class="muted">${item.codigo || "-"} · ${item.cantidad || "-"} ${item.unidad || ""}</div>
        <div>📍 ${item.ubicacion || "Sin ubicacion"}</div>
      </button>
    `).join("")}
  `;
}

pedidoList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-code]");
  if (!button) return;
  const item = (payload.componentes || []).find((row) => normalize(row.codigo) === normalize(button.dataset.code));
  if (item) setSelected(item);
});

renderer.domElement.addEventListener("click", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find((entry) => entry.object.userData?.type === "slot" || entry.object.parent?.userData?.type === "rack");
  if (!hit) return;
  const data = hit.object.userData?.type === "slot" ? hit.object.userData : hit.object.parent.userData;
  if (data.type === "slot") {
    const item = (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(data.codigoUbicacion))
      || (payload.componentes || []).find((row) => normalize(row.ubicacion) === normalize(`${data.almacen}-${data.rack}-P${data.nivel}`));
    if (item) setSelected(item);
    else {
      componentCard.innerHTML = `
        <h2>Ubicacion seleccionada</h2>
        <dl>
          <dt>Codigo</dt><dd>${data.codigoUbicacion}</dd>
          <dt>Rack</dt><dd>${data.rack}</dd>
          <dt>Piso</dt><dd>${data.piso}</dd>
          <dt>Nivel</dt><dd>P${data.nivel}</dd>
          <dt>Posicion</dt><dd>F${data.posicion}</dd>
        </dl>
      `;
    }
    window.parent?.postMessage({ type: "mantto:warehouse3d:selected", ubicacion: item?.ubicacion || data.codigoUbicacion }, "*");
  } else {
    componentCard.innerHTML = `
      <h2>Rack ${data.rack}</h2>
      <dl>
        <dt>Piso</dt><dd>${data.piso}</dd>
        <dt>Niveles</dt><dd>${data.niveles}</dd>
        <dt>Posiciones</dt><dd>${data.posiciones}</dd>
      </dl>
    `;
  }
});

document.getElementById("backBtn").addEventListener("click", () => {
  window.parent?.postMessage({ type: "mantto:setView", view: "pedidosAceptados" }, "*");
  try {
    window.parent?.document?.querySelector('[data-view="pedidosAceptados"]')?.click();
  } catch (err) {
    history.back();
  }
});
document.getElementById("floor1Btn").addEventListener("click", () => showFloor(1));
document.getElementById("floor2Btn").addEventListener("click", () => showFloor(2));
document.getElementById("generalBtn").addEventListener("click", () => {
  floorLabel.textContent = "ALMACEN";
  generalView(camera, controls);
});
document.getElementById("designBtn").addEventListener("click", () => {
  designMode = !designMode;
  document.body.classList.toggle("design-mode", designMode);
  floorLabel.textContent = designMode ? "VISTA DE DISEÑO" : "ALMACEN";
  generalView(camera, controls);
});
document.getElementById("centerBtn").addEventListener("click", () => {
  if (selectedObject) focusObject(camera, controls, selectedObject);
});

window.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "mantto:warehouse3d:payload") {
    applyPayload(message.payload, { focus: false });
  }
  if (message.type === "mantto:warehouse3d:select") {
    selectByMessage(message);
  }
  if (message.type === "mantto:warehouse3d:general") {
    floorLabel.textContent = "ALMACEN";
    generalView(camera, controls);
  }
});

window.addEventListener("resize", () => {
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
});

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
else {
  selected = initial;
  renderSide(parseUbicacion(initial?.ubicacion || ""));
  markPedido(positionMap, payload.componentes || [], materials);
  generalView(camera, controls);
}
animate();
