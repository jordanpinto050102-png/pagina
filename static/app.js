const state = {
  token: localStorage.getItem("mantto_token") || "",
  user: JSON.parse(localStorage.getItem("mantto_user") || "null"),
  catalogos: { equipos: [], personal: [], productos: [], repuestos: [] },
  ots: [],
  avisos: [],
  peticiones: [],
  calificaciones: [],
  selectedAviso: null,
  selectedOt: null,
  selectedRatingOt: null,
  dashboard: null,
  currentView: "home",
  currentConfigTab: "equipos",
  appTimer: null,
  loginTimer: null,
  equipmentSelectors: {},
  personnelSelectors: {},
  configSearch: "",
  configFilters: { personal: {} },
  accessMatrix: JSON.parse(localStorage.getItem("mantto_access_matrix") || "{}"),
  almacenSearch: "",
  almacenTipo: "",
  almacenCategoria: "todas",
  almacenStockFilter: "",
  peticionSearch: "",
  peticionCart: [],
  peticionCriticidad: "",
  historialPeticiones: [],
  pedidoAceptadoSeleccionado: null,
  pedidoAceptadoSearch: "",
  pedidoAceptadoCategoria: "todas",
  pedidoAceptadoComponente: "",
  pedidoAceptadoComponentes: [],
  peticionCategoriaAbierta: "",
  warehouse3dPayload: null,
  inventarioMovimientos: [],
  kardexDesde: "",
  kardexHasta: "",
  ingresoItemMode: "existente",
  ingresoItemSearch: "",
  ingresoItemSelected: null,
  selectedAtenderAviso: null,
  selectedBulkOts: new Set(),
  codeSearchTimers: {},
  voice: {
    recognition: null,
    listening: false,
    enabled: localStorage.getItem("mantto_voice_enabled") === "true",
    wakeWord: localStorage.getItem("mantto_voice_wake_word") || "hey cielo",
    voiceName: localStorage.getItem("mantto_voice_name") || "",
    rate: Number(localStorage.getItem("mantto_voice_rate") || 1),
    pitch: Number(localStorage.getItem("mantto_voice_pitch") || 1),
  },
};

const $ = (id) => document.getElementById(id);

// Edite estas listas para controlar las opciones visibles en Generar OT
// y en Cerrar avisos > Atender aviso.
const MANTTO_TIPOS_FALLA = [
  "mecanica",
  "electrica",
  "instrumentacion",
  "operativa",
  "seguridad",
  "otra",
];

const MANTTO_TIPOS_INTERVENCION = [
  "correctivo",
  "preventivo",
  "inspeccion",
  "mejora",
  "emergencia",
];

// Encabezados usados por DB _inventario / productos / repuestos.
const MANTTO_ITEM_KEYS = {
  codigo: ["codigo", "código", "cod", "cod_item", "item_codigo"],
  tipo: ["tipo", "clase"],
  categoria: ["categoria", "categoría", "familia", "grupo"],
  area: ["area", "área"],
  descripcion: ["descripcion", "descripción", "nombre", "item_nombre", "producto", "repuesto"],
  modelo: ["modelo", "modelo_repuesto", "referencia"],
  cantidad: ["cantidad", "stock", "existencia", "saldo"],
  ubicacion: ["ubicacion", "ubicación", "almacen", "almacén", "rack"],
  proveedor: ["proveedor", "proovedor"],
  unidad: ["unidad", "und", "um"],
};

const MANTTO_INVENTORY_TABLES = ["productos", "repuestos"];

const MANTTO_CATEGORIAS_REPUESTOS = [
  { id: "todas", nombre: "Todas", icono: "▦", imagen: "/static/assets/categorias/todas.png" },
  { id: "rodamientos", nombre: "Rodamientos", icono: "⚙", imagen: "/static/assets/categorias/rodamientos.png", palabras: ["rodamiento", "bearing", "chumacera"] },
  { id: "sensores", nombre: "Sensores", icono: "◉", imagen: "/static/assets/categorias/sensores.png", palabras: ["sensor", "inductivo", "fotoelectrico", "fotocelula", "proximidad"] },
  { id: "contactores", nombre: "Contactores", icono: "▣", imagen: "/static/assets/categorias/contactores.png", palabras: ["contactor", "contactor auxiliar"] },
  { id: "correas", nombre: "Correas", icono: "▱", imagen: "/static/assets/categorias/correas.png", palabras: ["correa", "faja", "banda"] },
  { id: "motores", nombre: "Motores", icono: "◌", imagen: "/static/assets/categorias/motores.png", palabras: ["motor", "motoreductor", "reductor"] },
  { id: "valvulas", nombre: "Valvulas", icono: "◇", imagen: "/static/assets/categorias/valvulas.png", palabras: ["valvula", "valvula", "neumatica", "solenoide"] },
  { id: "protecciones", nombre: "Protecciones electricas", icono: "⚡", imagen: "/static/assets/categorias/protecciones.png", palabras: ["fusible", "breaker", "termico", "guardamotor", "interruptor"] },
  { id: "reles", nombre: "Reles", icono: "⌁", imagen: "/static/assets/categorias/reles.png", palabras: ["rele", "relay", "temporizador"] },
  { id: "tornilleria", nombre: "Tornilleria", icono: "✚", imagen: "/static/assets/categorias/tornilleria.png", palabras: ["tornillo", "tuerca", "arandela", "perno"] },
  { id: "otros", nombre: "Otros", icono: "□", imagen: "/static/assets/categorias/otros.png", palabras: ["grasa", "aceite", "lubricante", "manguera"] },
  { id: "sin_categorizar", nombre: "Sin categorizar", icono: "?", imagen: "/static/assets/categorias/sin-categorizar.png", palabras: [] },
];

function manttoWarehouse3dUrl(embedded = false) {
  const file = "warehouse3d_v66/warehouse3d.html";
  const query = embedded ? "?embedded=1&v=66" : "?v=66";
  const match = window.location.pathname.match(/^\/networks\/([^/]+)\//);
  if (match) return `/networks/${match[1]}/${file}${query}`;
  return `/static/${file}${query}`;
}

function categoriaManualMap() {
  try {
    return JSON.parse(localStorage.getItem("mantto_categoria_repuestos") || "{}");
  } catch (err) {
    return {};
  }
}

function saveCategoriaManualMap(map) {
  localStorage.setItem("mantto_categoria_repuestos", JSON.stringify(map || {}));
}

function authHeaders() {
  return { Authorization: `Bearer ${state.token}` };
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const method = String(options.method || "GET").toUpperCase();
  let requestPath = path;
  if (method === "GET") {
    const separator = requestPath.includes("?") ? "&" : "?";
    requestPath = `${requestPath}${separator}_ts=${Date.now()}`;
  }
  const res = await fetch(requestPath, { ...options, headers, cache: "no-store" });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Error ${res.status}`);
  }
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return res.blob();
}

async function apiOptional(path, fallback = null, options = {}) {
  try {
    return await api(path, options);
  } catch (err) {
    return fallback;
  }
}

function toast(msg, type = "info") {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3600);
}

function confirmar(titulo, detalle = "") {
  const box = $("confirmBox");
  document.body.appendChild($("confirmBox"));
  $("confirmTitle").textContent = titulo;
  $("confirmDetail").textContent = detalle;
  box.classList.remove("hidden");
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.add("hidden"), 4200);
}

function pedirConfirmacion(titulo, detalleHtml, okText = "Confirmar registro") {
  return new Promise((resolve) => {
    const modal = $("actionConfirm");
    const ok = $("actionOk");
    const cancel = $("actionCancel");

    document.body.appendChild(modal);
    modal.style.zIndex = "14000";

    $("actionConfirmTitle").textContent = titulo;
    $("actionConfirmDetail").innerHTML = detalleHtml;
    ok.textContent = okText;
    modal.classList.remove("hidden");

    const finish = (value) => {
      modal.classList.add("hidden");
      modal.style.zIndex = "";
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      resolve(value);
    };

    const onOk = () => finish(true);
    const onCancel = () => finish(false);

    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function removeReferenceFields() {
  ["avisoForm", "otForm", "avisoOtForm", "atenderAvisoForm"].forEach((formId) => {
    const form = $(formId);
    if (!form) return;
    const field = form.elements?.referencia;
    if (!field) return;
    const label = field.closest("label");
    if (label) label.remove();
    else field.remove();
  });
}

const removeReferenceFieldsForOt = removeReferenceFields;

function ensureOtExtraTextFields(form, source = {}) {
  if (!form || form.querySelector("[data-ot-extra-text]")) return;
  const target = form.querySelector('label.span-2 textarea[name="descripcion_trabajo"]')?.closest("label");
  if (!target) return;

  const falla = source.descripcion_falla || source.descripcion || source.tipo_falla || "";
  const observacion = source.observaciones || "";
  const wrap = document.createElement("div");
  wrap.className = "form-block span-full";
  wrap.setAttribute("data-ot-extra-text", "true");
  wrap.innerHTML = `
    <h3>Descripcion de la falla y observacion</h3>
    <div class="form-block-grid">
      <label class="span-2">Descripcion de la falla<textarea name="descripcion_falla" placeholder="Detalle de la falla reportada">${escapeHtml(falla)}</textarea></label>
      <label class="span-2">Observacion<textarea name="observaciones" placeholder="Observaciones adicionales">${escapeHtml(observacion)}</textarea></label>
    </div>
  `;
  target.insertAdjacentElement("beforebegin", wrap);
}

function normalizeOtPayload(data) {
  delete data.referencia;

  const descripcionFalla = String(data.descripcion_falla || "").trim();
  const observaciones = String(data.observaciones || "").trim();
  const descripcionTrabajo = String(data.descripcion_trabajo || "").trim();

  if (descripcionFalla && descripcionTrabajo && !descripcionTrabajo.includes(descripcionFalla)) {
    data.descripcion_trabajo = `Falla reportada: ${descripcionFalla}\n\nTrabajo a realizar: ${descripcionTrabajo}`;
  } else if (descripcionFalla && !descripcionTrabajo) {
    data.descripcion_trabajo = descripcionFalla;
  }

  data.observaciones = observaciones;
  delete data.descripcion_falla;

  return data;
}

function userRoleLabel(role) {
  return {
    admin: "Administrador",
    supervisor: "Supervisor",
    jefe: "Jefe",
    tecnico: "Tecnico",
    almacen: "Almacen",
  }[role] || role || "Usuario";
}

function setUserUi() {
  const username = state.user?.full_name || state.user?.username || "Usuario";
  const role = state.user?.cargo || userRoleLabel(state.user?.role);
  ["sidebarUserName", "topbarUserName"].forEach((id) => {
    if ($(id)) $(id).textContent = username;
  });
  ["sidebarUserRole", "topbarUserRole"].forEach((id) => {
    if ($(id)) $(id).textContent = role;
  });
  document.querySelectorAll(".avatar").forEach((avatar) => {
    avatar.textContent = (state.user?.username || "U").slice(0, 1).toUpperCase();
  });
  updateRoleUi();
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function currentPersonalRecord() {
  const user = state.user || {};
  const candidates = [
    user.username,
    user.full_name,
    user.nombre,
    user.dni_codigo,
  ].map(compactText).filter(Boolean);
  if (!candidates.length) return null;
  return (state.catalogos.personal || []).find((p) => {
    const values = [
      personalValue(p, "nombre"),
      p.codigo,
      p.username,
      p.usuario,
      p.dni_codigo,
      p.dni,
    ].map(compactText).filter(Boolean);
    return values.some((value) => candidates.includes(value));
  }) || null;
}

function accessUserKey(user = state.user) {
  return compactText(user?.username || user?.full_name || "");
}

function accessUserLabel(user = state.user) {
  return String(user?.username || user?.full_name || "").trim();
}

const configurableViews = [
  ["home", "Inicio"],
  ["aviso", "Generar aviso"],
  ["ot", "Generar OT"],
  ["atenderAviso", "Atender aviso"],
  ["peticion", "Peticiones"],
  ["almacen", "Almacen"],
  ["ingresoItem", "Ingreso de item"],
  ["kardex", "Kardex"],
  ["historialPeticiones", "Historial peticiones"],
  ["pedidosAceptados", "Pedidos aceptados"],
  ["cerrarOt", "Cerrar OT"],
  ["calificarOt", "Calificar OT"],
  ["historialCalificaciones", "Historial calificaciones"],
  ["historialOt", "Historial OT"],
  ["config", "Configuracion"],
];

function configuredAccessForCurrentUser(id) {
  if (String(state.user?.role || "").toLowerCase() === "admin") return true;
  const key = accessUserKey();
  const config = key ? state.accessMatrix[key] : null;
  if (!config) return null;
  return config[id] !== false;
}

function canAccessView(id) {
  if (id === "cerrarAvisos") id = "atenderAviso";
  const configured = configuredAccessForCurrentUser(id);
  if (configured !== null) return configured;
  if (["aviso", "cerrarOt", "calificarOt", "historialCalificaciones", "cerrarAvisos", "atenderAviso"].includes(id)) return esJefe();
  return true;
}

function updateRoleUi() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const allowed = canAccessView(button.dataset.view);
    button.classList.toggle("is-disabled", !allowed);
    button.setAttribute("aria-disabled", allowed ? "false" : "true");
    button.title = allowed ? "" : "Acceso no habilitado para este usuario";
  });
}

function showApp() {
  injectManttoV38Styles();
  ensureManttoV46Ui();
  ensureVoiceAssistantUi();
  ensureConfigAccessTab();
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  document.body.classList.add("is-app");
  document.body.classList.remove("is-login");
  setUserUi();
  if ($("avisoCreado")) $("avisoCreado").value = state.user.username;
  stopLoginPolling();
  loadAll({ forceRender: true });
  startAppPolling();
  setView("home");
  if (state.voice.enabled) setTimeout(startVoiceAssistant, 600);
}

function showLogin() {
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  document.body.classList.add("is-login");
  document.body.classList.remove("is-app", "nav-open");
  stopAppPolling();
  loadPublicDashboard();
  startLoginPolling();
}

function setView(id) {
  ensureManttoV46Ui();
  if (id === "cerrarAvisos") id = "atenderAviso";
  const validViews = ["home", "aviso", "ot", "atenderAviso", "peticion", "almacen", "ingresoItem", "kardex", "historialPeticiones", "pedidosAceptados", "warehouse3d", "cerrarOt", "calificarOt", "historialCalificaciones", "historialOt", "cerrarAvisos", "config", "asistenteCielo"];
  const nextView = validViews.includes(id) ? id : "home";
  if (!canAccessView(nextView)) {
    toast("Esta opcion esta disponible solo para personal JEFE", "error");
    return;
  }
  state.currentView = nextView;
  $("appView").dataset.currentView = nextView;

  const screens = [$("homeScreen"), ...document.querySelectorAll(".panel")].filter(Boolean);
  screens.forEach((screen) => {
    screen.classList.add("hidden");
    screen.setAttribute("aria-hidden", "true");
    screen.style.display = "none";
  });

  const selected = nextView === "home" ? $("homeScreen") : $(nextView);
  if (selected) {
    selected.classList.remove("hidden");
    selected.setAttribute("aria-hidden", "false");
    selected.style.display = "block";
  }
  bindRequiredIndicators(selected || document);

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === nextView);
  });

  if (nextView === "home") renderDashboard("app");
  if (nextView === "aviso") {
    removeReferenceFields();
    ensureAvisoServiceSelect();
    ensureAvisoImageInput();
    renderEquipmentSelector("aviso");
  }
  if (nextView === "ot") {
    removeReferenceFieldsForOt();
    ensureOtExtraTextFields($("otForm"));
    ensureOtTypeSelects($("otForm"));
    renderEquipmentSelector("ot");
  }
  if (nextView === "almacen") renderAlmacen();
  if (nextView === "ingresoItem") renderIngresoItem();
  if (nextView === "kardex") renderKardex();
  if (nextView === "atenderAviso") renderAtenderAviso();
  if (nextView === "historialPeticiones") renderHistorialPeticiones();
  if (nextView === "pedidosAceptados") renderPedidosAceptados();
  if (nextView === "warehouse3d") renderWarehouse3dPanel();
  if (nextView === "cerrarOt") renderOtsPendientes();
  if (nextView === "cerrarAvisos") renderAvisos();
  if (nextView === "calificarOt") renderCalificarOt();
  if (nextView === "historialCalificaciones") renderHistorialCalificaciones();
  if (nextView === "historialOt") renderHistorialOt();
  if (nextView === "config") renderConfig(state.currentConfigTab || "equipos");
  if (nextView === "asistenteCielo") renderVoiceAssistant();
  document.body.classList.remove("nav-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function ensureVoiceAssistantUi() {
  document.querySelector('[data-view="asistenteCielo"]')?.remove();

  if (!$("cieloFloatButton")) {
    const button = document.createElement("button");
    button.id = "cieloFloatButton";
    button.className = "cielo-float";
    button.type = "button";
    button.innerHTML = '<span>🎙</span><strong>Cielo</strong>';
    document.body.appendChild(button);
    button.addEventListener("click", () => toggleCieloPanel());
  }

  if (!$("cieloAssistantPanel")) {
    const panel = document.createElement("aside");
    panel.id = "cieloAssistantPanel";
    panel.className = "cielo-panel hidden";
    panel.innerHTML = `
      <div class="cielo-panel-head">
        <div>
          <strong>Asistente Cielo</strong>
          <span>Escucha "${escapeHtml(state.voice.wakeWord)}"</span>
        </div>
        <button type="button" id="cieloCloseBtn" aria-label="Cerrar asistente">×</button>
      </div>
      <div class="cielo-panel-body">
        <p class="muted">Puede abrir ventanas, consultar conteos reales y responder ayuda de uso del sistema.</p>
        <div class="form-actions">
          <button class="primary" type="button" id="voiceStartBtn">🎙 Activar</button>
          <button class="secondary" type="button" id="voiceStopBtn">⏹ Detener</button>
        </div>
        <div id="voiceStatus" class="selected-card">Asistente en espera.</div>
        <div id="voiceTranscript" class="selected-card">Sin comandos recibidos.</div>
        <form id="cieloTextForm" class="cielo-query">
          <input id="cieloTextInput" placeholder="Escriba una pregunta para Cielo">
          <button class="primary" type="submit">Enviar</button>
        </form>
      </div>
    `;
    document.body.appendChild(panel);
    $("cieloCloseBtn").addEventListener("click", () => panel.classList.add("hidden"));
  }
  bindVoiceAssistantControls();
}

function toggleCieloPanel(forceOpen = false) {
  ensureVoiceAssistantUi();
  const panel = $("cieloAssistantPanel");
  if (!panel) return;
  panel.classList.toggle("hidden", forceOpen ? false : !panel.classList.contains("hidden"));
  bindVoiceAssistantControls();
  updateVoiceStatus();
}

function ensureManttoV46Ui() {
  ensureManttoV51VisibilityCss();
  ensureNavButton("atenderAviso", "🔧", "Atender aviso", "cerrarAvisos");
  const cerrarAvisosBtn = document.querySelector('[data-view="cerrarAvisos"]');
  if (cerrarAvisosBtn) {
    cerrarAvisosBtn.classList.add("hidden");
    cerrarAvisosBtn.style.display = "none";
    cerrarAvisosBtn.setAttribute("aria-hidden", "true");
  }
  ensureNavButton("historialPeticiones", "📋", "Historial peticiones", "almacen");
  ensureNavButton("pedidosAceptados", "✅", "Pedidos aceptados", "historialPeticiones");
  ensureNavButton("ingresoItem", "📥", "Ingreso de item", "almacen");
  ensureNavButton("kardex", "📒", "Kardex", "historialPeticiones");
  ensurePeticionCatalogHost();
  ensurePanel("atenderAviso", `
    <div class="screen-head">
      <div><h2>Atender aviso</h2><p>Avisos pendientes de atencion por mantenimiento.</p></div>
      <button class="back-btn" data-view="home">Volver</button>
    </div>
    <div id="atenderAvisoTable" class="table-wrap"></div>
    <div id="atenderAvisoBox" class="subpanel hidden"></div>
  `);
  ensurePanel("historialPeticiones", `
    <div class="screen-head">
      <div><h2>Historial de peticiones</h2><p>Seguimiento de solicitudes, aceptacion y salida de inventario.</p></div>
      <button class="back-btn" data-view="home">Volver</button>
    </div>
    <div id="historialPeticionesTable" class="table-wrap"></div>
    <div id="historialPeticionDetalle" class="subpanel hidden"></div>
  `);
  ensurePanel("pedidosAceptados", `
    <div class="screen-head">
      <div><h2>Peticiones aceptadas</h2><p>Ubicacion visual WMS de materiales aprobados. La salida de inventario se mantiene en Historial de peticiones.</p></div>
      <button class="back-btn" data-view="historialPeticiones">Volver</button>
    </div>
    <div class="accepted-wms-layout">
      <section class="accepted-wms-stage">
        <iframe id="pedidosAceptadosWarehouseFrame" title="Almacen 3D de peticiones aceptadas" src="${manttoWarehouse3dUrl(true)}"></iframe>
      </section>
      <aside class="accepted-wms-side">
        <div class="accepted-wms-tools">
          <label>Buscar repuesto
            <input id="pedidoAceptadoSearch" type="search" autocomplete="off" placeholder="Codigo, descripcion, modelo o ubicacion">
          </label>
          <button type="button" class="secondary" onclick="centrarPedidoAceptado3D()">Vista general</button>
        </div>
        <div id="pedidosAceptadosTable" class="accepted-orders-list"></div>
        <div id="pedidoAceptadoMapa" class="warehouse-location-card hidden"></div>
      </aside>
    </div>
  `);
  ensurePanel("warehouse3d", `
    <div class="screen-head">
      <div><h2>Ubicacion 3D de almacen</h2><p>Simulacion visual WMS conectada a las ubicaciones reales registradas.</p></div>
      <button class="back-btn" data-view="pedidosAceptados">Volver a pedidos</button>
    </div>
    <div class="warehouse3d-shell">
      <iframe id="warehouse3dFrame" title="Almacen 3D" src="${manttoWarehouse3dUrl(false)}"></iframe>
    </div>
  `);
  ensurePanel("ingresoItem", `
    <div class="screen-head">
      <div><h2>Ingreso de item</h2><p>Registre entradas de almacen y actualice el stock real.</p></div>
      <button class="back-btn" data-view="almacen">Volver</button>
    </div>
    <form id="ingresoItemForm" class="form-grid"></form>
    <div id="ingresoItemPreview" class="subpanel hidden"></div>
  `);
  ensurePanel("kardex", `
    <div class="screen-head">
      <div><h2>Kardex</h2><p>Movimientos reales de inventario por salidas de peticiones.</p></div>
      <button class="back-btn" data-view="home">Volver</button>
    </div>
    <div class="config-toolbar">
      <label>Buscar movimiento<input id="kardexSearch" type="search" placeholder="Codigo, descripcion, peticion o usuario"></label>
      <label>Desde<input id="kardexDesde" type="date"></label>
      <label>Hasta<input id="kardexHasta" type="date"></label>
      <button class="secondary" type="button" onclick="recargarKardex()">Recargar</button>
      <button class="primary" type="button" onclick="exportarKardexExcel()">📊 Exportar Excel</button>
    </div>
    <div id="kardexTable" class="table-wrap"></div>
  `);
}

function ensureManttoV51VisibilityCss() {
  if (document.getElementById("manttoV51VisibilityCss")) return;
  const style = document.createElement("style");
  style.id = "manttoV51VisibilityCss";
  style.textContent = `
    .app[data-current-view="historialPeticiones"] #historialPeticiones,
    .app[data-current-view="pedidosAceptados"] #pedidosAceptados,
    .app[data-current-view="warehouse3d"] #warehouse3d,
    .app[data-current-view="kardex"] #kardex,
    .app[data-current-view="ingresoItem"] #ingresoItem,
    .app[data-current-view="atenderAviso"] #atenderAviso {
      display: block !important;
      visibility: visible !important;
    }
    .nav-list [data-view="cerrarAvisos"] {
      display: none !important;
    }
    #atenderAviso .table-wrap td:last-child,
    #historialPeticiones .table-wrap td:last-child {
      white-space: nowrap;
    }
    #atenderAvisoBox textarea {
      min-height: 86px;
    }
    #peticionMaterialSearch,
    #kardexSearch {
      direction: ltr;
      text-align: left;
      unicode-bidi: plaintext;
    }
    #kardex .table-wrap {
      max-height: 520px;
      overflow: auto;
    }
    .accepted-wms-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      gap: 16px;
      align-items: stretch;
      min-height: min(760px, calc(100vh - 170px));
    }
    .accepted-wms-stage {
      min-height: 620px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      background: #0f172a;
      box-shadow: var(--shadow);
    }
    .accepted-wms-stage iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    .accepted-wms-side {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
    }
    .accepted-wms-tools {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: end;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 12px;
      box-shadow: var(--shadow);
    }
    .accepted-category-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      max-height: 258px;
      overflow: auto;
    }
    .accepted-category-card {
      min-height: 104px;
      display: grid;
      gap: 5px;
      align-content: start;
      text-align: left;
      border: 1px solid var(--line);
      border-left: 5px solid transparent;
      background: #fff;
      box-shadow: 0 8px 18px rgba(12,42,80,.08);
      padding: 9px;
    }
    .accepted-category-card.active {
      border-left-color: var(--primary);
      background: var(--primary-soft);
    }
    .category-image {
      height: 38px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      background-color: #f1f5f9;
      background-size: cover;
      background-position: center;
      color: var(--primary-dark);
      font-weight: 900;
      overflow: hidden;
    }
    .category-image i {
      font-style: normal;
      min-width: 28px;
      min-height: 28px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(255,255,255,.88);
    }
    .accepted-orders-list {
      min-height: 0;
      overflow: auto;
      display: grid;
      align-content: start;
      gap: 10px;
    }
    .accepted-order-card {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      box-shadow: 0 8px 18px rgba(12,42,80,.08);
      padding: 11px;
    }
    .accepted-order-card > header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .accepted-order-card > header span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }
    .accepted-component {
      width: 100%;
      display: grid;
      gap: 3px;
      margin-top: 7px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--primary);
      background: #fbfdff;
      color: var(--ink);
      text-align: left;
      padding: 9px;
    }
    .accepted-component.active {
      border-left-color: var(--yellow);
      background: #fff8df;
      box-shadow: inset 0 0 0 1px rgba(244,180,0,.28);
    }
    .accepted-component span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .peticion-category-grid-large {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-items: start;
    }
    .peticion-category-group {
      display: grid;
      gap: 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 0;
      box-shadow: 0 8px 18px rgba(12,42,80,.07);
      overflow: hidden;
    }
    .peticion-category-group.is-open {
      grid-column: 1 / -1;
      border-color: #b7d5f1;
    }
    .peticion-category-cover {
      width: 100%;
      min-height: 154px;
      display: grid;
      grid-template-columns: 116px 1fr;
      gap: 14px;
      align-items: center;
      text-align: left;
      border: 0;
      border-radius: 0;
      background: #fff;
      padding: 14px;
      color: var(--ink);
    }
    .peticion-category-cover:hover {
      background: #f7fbff;
    }
    .peticion-category-group h3 {
      margin: 0;
      color: var(--primary-dark);
      font-size: 16px;
    }
    .peticion-category-group p {
      margin: 2px 0 0;
      font-size: 12px;
    }
    .peticion-category-group small {
      color: var(--primary);
      font-weight: 900;
    }
    .category-image-large {
      height: 106px !important;
    }
    .peticion-category-items {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .peticion-category-list {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--line);
      background: #f8fbff;
    }
    .peticion-material-row {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) 120px 124px auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fbfdff;
      padding: 10px;
    }
    .peticion-material-main {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .peticion-material-main strong {
      color: var(--primary-dark);
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    .peticion-material-main span,
    .peticion-material-stock span,
    .peticion-material-stock small {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .peticion-material-stock {
      display: grid;
      gap: 2px;
    }
    .peticion-material-stock strong {
      color: var(--ink);
    }
    .peticion-material-qty {
      margin: 0;
    }
    .peticion-material-add {
      min-width: 96px;
    }
    .almacen-category-filter {
      display: flex;
      align-items: end;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0 0 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 12px;
      box-shadow: 0 8px 18px rgba(12,42,80,.07);
    }
    .almacen-category-filter label {
      min-width: min(360px, 100%);
    }
    .almacen-category-quick-grid {
      flex: 1 1 100%;
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }
    .almacen-category-chip {
      min-height: 96px;
      display: grid;
      gap: 5px;
      align-content: start;
      text-align: left;
      border: 1px solid var(--line);
      background: #fff;
      padding: 8px;
    }
    .almacen-category-chip.active {
      border-color: var(--primary);
      background: var(--primary-soft);
      box-shadow: inset 4px 0 0 var(--primary);
    }
    .almacen-category-chip strong {
      font-size: 12px;
      color: var(--primary-dark);
    }
    .almacen-category-chip small {
      color: var(--muted);
      font-weight: 900;
    }
    .inventory-category-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 0 0 12px;
    }
    .inventory-kpi {
      display: grid;
      gap: 5px;
      border: 1px solid var(--line);
      border-left: 5px solid var(--primary);
      border-radius: var(--radius);
      background: #fff;
      padding: 12px;
      text-align: left;
      color: var(--ink);
    }
    .inventory-kpi span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .inventory-kpi strong {
      font-size: 26px;
      color: var(--primary-dark);
    }
    .inventory-kpi.danger-soft { border-left-color: var(--danger); background: var(--danger-soft); }
    .inventory-kpi.ok-soft { border-left-color: var(--green); background: var(--green-soft); }
    @media (max-width: 1180px) {
      .accepted-wms-layout {
        grid-template-columns: 1fr;
      }
      .accepted-wms-stage {
        min-height: 520px;
      }
      .accepted-wms-side {
        grid-template-rows: auto auto;
      }
    }
    @media (max-width: 760px) {
      .accepted-wms-tools,
      .inventory-category-summary {
        grid-template-columns: 1fr;
      }
      .accepted-category-grid,
      .peticion-category-grid-large,
      .almacen-category-quick-grid {
        grid-template-columns: 1fr;
      }
      .peticion-category-items,
      .peticion-material-row {
        grid-template-columns: 1fr;
      }
      .peticion-category-cover {
        grid-template-columns: 86px 1fr;
        min-height: 120px;
      }
      .category-image-large {
        height: 82px !important;
      }
    }
    .accepted-orders-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
      gap: 16px;
      align-items: start;
    }
    .warehouse-location-card {
      min-height: 360px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: #fff;
      padding: 16px;
      box-shadow: var(--shadow);
    }
    .warehouse-map {
      position: relative;
      min-height: 260px;
      border: 1px solid #c8dcf2;
      border-radius: var(--radius);
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(8,119,216,.08) 1px, transparent 1px),
        linear-gradient(rgba(8,119,216,.08) 1px, transparent 1px),
        #f8fbff;
      background-size: 52px 52px;
    }
    .warehouse-map img {
      width: 100%;
      height: 260px;
      object-fit: cover;
      display: block;
    }
    .warehouse-marker {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      max-width: min(360px, calc(100% - 30px));
      border: 3px solid var(--danger);
      border-radius: 999px;
      background: rgba(255,255,255,.94);
      color: var(--danger);
      padding: 14px 18px;
      font-weight: 900;
      text-align: center;
      box-shadow: 0 16px 30px rgba(199,55,47,.22);
    }
    .warehouse-marker::before {
      content: "📍";
      display: block;
      font-size: 30px;
      line-height: 1;
      margin-bottom: 4px;
    }
    .warehouse-items {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .warehouse-item {
      border: 1px solid var(--line);
      border-left: 5px solid var(--primary);
      border-radius: var(--radius);
      padding: 10px;
      background: #fbfdff;
    }
    .warehouse-item-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .warehouse3d-shell {
      height: min(720px, calc(100vh - 160px));
      min-height: 520px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      overflow: hidden;
      background: #0f172a;
      box-shadow: var(--shadow);
    }
    .warehouse3d-shell iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
    @media (max-width: 980px) {
      .accepted-orders-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensurePeticionCatalogHost() {
  const panel = $("peticion");
  if (!panel || $("peticionCatalogHost")) return;
  const oldForm = $("peticionForm");
  if (oldForm) oldForm.classList.add("hidden");
  const host = document.createElement("div");
  host.id = "peticionCatalogHost";
  host.className = "span-full";
  const head = panel.querySelector(".screen-head");
  if (head) head.insertAdjacentElement("afterend", host);
  else panel.appendChild(host);
}

function ensureNavButton(view, icon, label, beforeView = "") {
  const nav = document.querySelector(".nav-list");
  if (!nav || nav.querySelector(`[data-view="${view}"]`)) return;
  const button = document.createElement("button");
  button.dataset.view = view;
  button.innerHTML = `<span aria-hidden="true">${icon}</span>${escapeHtml(label)}`;
  button.addEventListener("click", () => setView(view));
  const before = beforeView ? nav.querySelector(`[data-view="${beforeView}"]`) : null;
  if (before) nav.insertBefore(button, before);
  else nav.appendChild(button);
}

function ensurePanel(id, html) {
  if ($(id)) return;
  const area = document.querySelector(".content-area") || $("appView")?.querySelector("main") || $("appView");
  if (!area) return;
  const panel = document.createElement("section");
  panel.className = "panel hidden";
  panel.id = id;
  panel.innerHTML = html;
  area.appendChild(panel);
  panel.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
}

function ensureConfigAccessTab() {
  const tabs = document.querySelector(".tabs.config-cards");
  if (!tabs) return;
  if (!tabs.querySelector('[data-tab="accesos"]')) {
    const button = document.createElement("button");
    button.dataset.tab = "accesos";
    button.innerHTML = "<strong>Accesos</strong><span>Permisos segun DB Personal</span>";
    tabs.appendChild(button);
    button.addEventListener("click", () => renderConfig("accesos"));
  }
  if (String(state.user?.role || "").toLowerCase() === "admin" && !tabs.querySelector('[data-tab="resetSistema"]')) {
    const resetButton = document.createElement("button");
    resetButton.dataset.tab = "resetSistema";
    resetButton.innerHTML = "<strong>Reset sistema</strong><span>Poner en cero datos operativos</span>";
    tabs.appendChild(resetButton);
    resetButton.addEventListener("click", () => renderConfig("resetSistema"));
  }
}

async function loadAll(options = {}) {
  const { forceRender = false, silent = false } = options;
  try {
    const [equipos, personal, productos, repuestos, ots, avisos, peticiones, calificaciones, dashboard, movimientos] = await Promise.all([
      api("/api/catalogos/equipos"),
      api("/api/catalogos/personal"),
      api("/api/catalogos/productos"),
      api("/api/catalogos/repuestos"),
      api("/api/ots"),
      api("/api/avisos"),
      api("/api/peticiones"),
      api("/api/calificaciones"),
      api("/api/dashboard"),
      apiOptional("/api/inventario-movimientos", []),
    ]);
    state.catalogos = { equipos, personal, productos, repuestos };
    state.ots = ots;
    state.avisos = avisos;
    state.peticiones = peticiones;
    state.calificaciones = calificaciones;
    state.dashboard = dashboard;
    state.inventarioMovimientos = movimientos || [];
    state.historialPeticiones = await apiOptional("/api/peticiones-historial", peticiones);
    fillLists();
    updateRoleUi();

    if (forceRender) {
      renderSafeView();
      return;
    }
    renderSafePollingUpdates();
  } catch (err) {
    if (!silent) toast(err.message, "error");
  }
}

async function refreshAfterMutation(options = {}) {
  await loadAll({ silent: true });
  renderDashboard("app");
  if (options.home) setView("home");
}

function renderSafeView() {
  renderDashboard("app");
  removeReferenceFields();
  renderEquipmentSelector("aviso");
  removeReferenceFieldsForOt();
  ensureOtExtraTextFields($("otForm"));
  ensureOtTypeSelects($("otForm"));
  renderEquipmentSelector("ot");
  renderPeticiones();
  renderAtenderAviso();
  renderHistorialPeticiones();
  renderAvisos();
  renderOtsPendientes();
  renderHistorialOt();
  renderCalificarOt();
  renderHistorialCalificaciones();
  renderAlmacen();
  if (state.currentView === "config") renderConfig(state.currentConfigTab);
}

function renderSafePollingUpdates() {
  if (isUserEditing()) return;
  if (state.currentView === "home") renderDashboard("app");
  if (state.currentView === "atenderItem") renderPeticiones();
  if (state.currentView === "atenderAviso" && !$("atenderAvisoBox")?.classList.contains("hidden")) return;
  if (state.currentView === "atenderAviso") renderAtenderAviso();
  if (state.currentView === "historialPeticiones") renderHistorialPeticiones();
  if (state.currentView === "kardex") renderKardex();
  if (state.currentView === "cerrarAvisos" && !$("avisoOtBox")?.classList.contains("hidden")) return;
  if (state.currentView === "cerrarAvisos") renderAvisos();
  if (state.currentView === "cerrarOt" && !$("atenderOtBox")?.classList.contains("hidden")) return;
  if (state.currentView === "cerrarOt") renderOtsPendientes();
  if (state.currentView === "calificarOt") renderCalificarOt();
  if (state.currentView === "historialCalificaciones") renderHistorialCalificaciones();
  if (state.currentView === "historialOt") renderHistorialOt();
  if (state.currentView === "almacen") renderAlmacen();
  if (state.currentView === "config" && !["usuarios", "accesos"].includes(state.currentConfigTab)) renderConfig(state.currentConfigTab);
}

function isUserEditing() {
  const active = document.activeElement;
  if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return true;
  if (!$("actionConfirm")?.classList.contains("hidden")) return true;
  if (!$("serviceRatingModal")?.classList.contains("hidden")) return true;
  return false;
}

async function loadPublicDashboard() {
  try {
    state.dashboard = await api("/api/dashboard-publico");
    renderDashboard("login");
  } catch (err) {
    state.dashboard = null;
  }
}

function startAppPolling() {
  if (state.appTimer) return;
  state.appTimer = setInterval(() => loadAll({ silent: true }), 3500);
}

function stopAppPolling() {
  if (!state.appTimer) return;
  clearInterval(state.appTimer);
  state.appTimer = null;
}

function startLoginPolling() {
  if (state.loginTimer) return;
  state.loginTimer = setInterval(loadPublicDashboard, 5000);
}

function stopLoginPolling() {
  if (!state.loginTimer) return;
  clearInterval(state.loginTimer);
  state.loginTimer = null;
}

function fillLists() {
  if ($("equiposList")) $("equiposList").innerHTML = state.catalogos.equipos.map((e) => `<option value="${escapeHtml(equipoValue(e, "codigo") || "")}"></option>`).join("");
  if ($("personalList")) $("personalList").innerHTML = tecnicosDisponibles().map((p) => `<option value="${escapeHtml(personalValue(p, "nombre") || p.codigo || "")}">${escapeHtml(personalValue(p, "cargo"))}</option>`).join("");
  fillTechnicianSelects();
  const items = [...state.catalogos.productos, ...state.catalogos.repuestos];
  if ($("itemsList")) $("itemsList").innerHTML = items.map((i) => `<option value="${escapeHtml(itemValue(i, "codigo") || "")}">${escapeHtml(itemValue(i, "descripcion") || "")}</option>`).join("");
  if ($("otsList")) $("otsList").innerHTML = state.ots.map((o) => `<option value="${escapeHtml(o.numero || "")}"></option>`).join("");
  if ($("historialSede")) fillSelect($("historialSede"), uniqueValues(state.catalogos.equipos, "sede"), "Todas");
}

function fillTechnicianSelects() {
  document.querySelectorAll("[data-tecnico-select]").forEach((select) => {
    const current = select.value;
    const optional = select.dataset.optional === "true";
    const placeholder = optional ? "Sin tecnico 2" : "Seleccione tecnico";
    select.innerHTML = `<option value="">${placeholder}</option>${tecnicosDisponibles().map((p) => {
      const nombre = personalValue(p, "nombre");
      const meta = [personalValue(p, "cargo"), personalValue(p, "area"), personalValue(p, "sede")].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(nombre)}">${escapeHtml(nombre)}${meta ? ` - ${escapeHtml(meta)}` : ""}</option>`;
    }).join("")}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
}

function equipoValue(row, key) {
  const aliases = {
    sede: ["sede", "planta", "local", "unidad", "centro", "empresa", "sucursal"],
    estado: ["estado", "estado_equipo", "condicion", "tipo_servicio"],
    referencia: ["referencia", "ref", "codigo_referencia"],
    rubro: ["rubro", "categoria", "familia", "tipo_activo"],
    ubicacion: ["ubicacion", "ubicación", "ubicacion_tecnica", "ubicación_técnica", "area", "área", "area_equipo", "área_equipo", "zona", "sector", "ubicacion_fisica"],
    proceso: ["proceso", "proceso_productivo", "subproceso", "sub_proceso", "etapa", "operacion"],
    sistema: ["sistema", "linea", "línea", "linea_produccion", "línea_producción", "linea_equipo", "linea_de_produccion", "sistema_equipo"],
    equipo: ["equipo", "maquina", "máquina", "nombre_equipo", "descripcion_equipo", "descripcion", "activo", "nombre_activo"],
    sub_equipo: ["sub_equipo", "sub-equipo", "sub equipo", "sub_equipo_nombre", "subequipo"],
    codigo: ["codigo", "código", "equipo_codigo", "codigo_equipo", "código_equipo", "cod_equipo", "cod. equipo", "codigo_de_equipo", "codigoequipo", "tag", "tag_equipo"],
    tipo_equipo: ["tipo_equipo", "tipo-equipo", "tipo equipo", "tipo_de_equipo", "clase_equipo", "tipo_activo"],
    componente: ["componente", "component", "componente_equipo", "parte", "parte_equipo"],
  }[key] || [key];
  if (!row) return "";
  const rowKeys = Object.keys(row);
  for (const alias of aliases) {
    const direct = row[alias];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return direct;
    const normalizedAlias = normalizeText(alias);
    const foundKey = rowKeys.find((rowKey) => normalizeText(rowKey) === normalizedAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== "") return row[foundKey];
  }
  const keyHints = {
    sede: ["sede", "planta", "local", "centro"],
    ubicacion: ["ubicacion", "area", "zona", "sector"],
    proceso: ["proceso", "operacion", "etapa"],
    sistema: ["sistema", "linea"],
    equipo: ["equipo", "maquina", "activo"],
    codigo: ["codigo", "cod", "tag"],
    tipo_equipo: ["tipo", "clase"],
  }[key] || [];
  const foundLooseKey = rowKeys.find((rowKey) => {
    const normalizedKey = compactText(rowKey);
    if (key === "equipo" && (normalizedKey.includes("codigo") || normalizedKey.includes("tipo") || normalizedKey.includes("sub"))) return false;
    if (key === "codigo" && normalizedKey.includes("referencia")) return false;
    return keyHints.some((hint) => normalizedKey.includes(compactText(hint)));
  });
  if (foundLooseKey && row[foundLooseKey] !== undefined && row[foundLooseKey] !== null && String(row[foundLooseKey]).trim() !== "") return row[foundLooseKey];
  return "";
}

function itemValue(row, key) {
  if (!row) return "";
  const aliases = MANTTO_ITEM_KEYS[key] || [key];
  const rowKeys = Object.keys(row);
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== "") return row[alias];
    const normalizedAlias = normalizeText(alias);
    const foundKey = rowKeys.find((rowKey) => normalizeText(rowKey) === normalizedAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== "") return row[foundKey];
  }
  return "";
}

function inventoryRows() {
  return [
    ...(state.catalogos.productos || []).map((row) => ({ ...row, _tabla: "productos", _tipo: itemValue(row, "tipo") || "Producto" })),
    ...(state.catalogos.repuestos || []).map((row) => ({ ...row, _tabla: "repuestos", _tipo: itemValue(row, "tipo") || "Repuesto" })),
  ].map(normalizarRepuesto);
}

function categoriaById(id) {
  return MANTTO_CATEGORIAS_REPUESTOS.find((cat) => cat.id === id) || MANTTO_CATEGORIAS_REPUESTOS[MANTTO_CATEGORIAS_REPUESTOS.length - 1];
}

function categoriaByName(nombre) {
  const normalized = normalizeText(nombre);
  return MANTTO_CATEGORIAS_REPUESTOS.find((cat) => normalizeText(cat.nombre) === normalized || cat.id === normalized)
    || categoriaById("sin_categorizar");
}

function categorizarRepuesto(row) {
  const codigo = itemValue(row, "codigo");
  const manual = categoriaManualMap()[codigo];
  if (manual) return categoriaById(manual).nombre;
  const existing = itemValue(row, "categoria");
  if (existing) return existing;
  const text = normalizeText(`${codigo} ${itemValue(row, "descripcion")} ${itemValue(row, "modelo")}`);
  for (const categoria of MANTTO_CATEGORIAS_REPUESTOS) {
    if (["todas", "sin_categorizar"].includes(categoria.id)) continue;
    if ((categoria.palabras || []).some((word) => text.includes(normalizeText(word)))) return categoria.nombre;
  }
  return "Sin categorizar";
}

function normalizarRepuesto(row) {
  const categoria = categorizarRepuesto(row);
  const meta = categoriaByName(categoria);
  return {
    ...row,
    categoria_virtual: categoria,
    categoria_id: meta.id,
  };
}

function guardarCategoria(codigo, categoriaId) {
  const map = categoriaManualMap();
  map[codigo] = categoriaId;
  saveCategoriaManualMap(map);
}

function contarCategorias(rows = inventoryRows()) {
  const counts = new Map();
  MANTTO_CATEGORIAS_REPUESTOS.forEach((cat) => counts.set(cat.id, 0));
  rows.forEach((row) => {
    counts.set(row.categoria_id || "sin_categorizar", (counts.get(row.categoria_id || "sin_categorizar") || 0) + 1);
  });
  counts.set("todas", rows.length);
  return counts;
}

function repuestosSinCategorizar() {
  return inventoryRows().filter((row) => row.categoria_id === "sin_categorizar");
}

function inventoryNumber(row, key) {
  const raw = key === "stock_minimo"
    ? (row.stock_minimo ?? row.minimo ?? row.min ?? row.stock_min)
    : key === "stock_maximo"
      ? (row.stock_maximo ?? row.maximo ?? row.max ?? row.stock_max)
      : itemValue(row, "cantidad");
  const cleaned = String(raw ?? "").replace(",", ".").replace(/[^\d.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function inventoryStatus(row) {
  const stock = inventoryNumber(row, "cantidad");
  const minimo = inventoryNumber(row, "stock_minimo");
  const maximo = inventoryNumber(row, "stock_maximo");
  if (minimo > 0 && stock <= minimo) return { label: "🔴 STOCK BAJO", className: "stock-low", state: "bajo" };
  if (maximo > 0 && stock >= maximo) return { label: "🔵 STOCK MAXIMO", className: "stock-max", state: "maximo" };
  return { label: "🟢 STOCK NORMAL", className: "stock-normal", state: "normal" };
}

function lowStockRows() {
  return inventoryRows().filter((row) => inventoryStatus(row).state === "bajo");
}

function itemIdentity(row) {
  return `${row._tabla || ""}:${row.id || itemValue(row, "codigo") || itemValue(row, "descripcion")}`;
}

function personalValue(row, key) {
  const aliases = {
    sede: ["sede", "SEDE"],
    area: ["area", "AREA"],
    nombre: ["nombre", "NOMBRE"],
    cargo: ["cargo", "CARGO"],
  }[key] || [key];
  for (const alias of aliases) {
    if (row && row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== "") return row[alias];
  }
  return "";
}

function tecnicosDisponibles() {
  return state.catalogos.personal.filter((p) => String(personalValue(p, "cargo")).trim().toLowerCase() === "tecnico");
}

function esJefe() {
  if (String(state.user?.role || "").toLowerCase() === "admin") return true;
  const personal = currentPersonalRecord();
  const cargo = normalizeText(personalValue(personal, "cargo") || state.user?.cargo || "");
  return ["jefe", "jefe de area", "supervisor", "admin", "administrador"].includes(cargo);
}

function uniqueValues(rows, key) {
  const seen = new Map();
  rows.forEach((row) => {
    const value = String(equipoValue(row, key) || "").trim();
    if (!value) return;
    const normalized = normalizeText(value);
    if (!seen.has(normalized)) seen.set(normalized, value);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function fillSelect(select, options, placeholder = "Seleccione", selected = "") {
  const current = selected || select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  const matching = options.find((option) => sameText(option, current));
  if (matching) select.value = matching;
}

function uniqueFormValues(rows, keys) {
  const seen = new Map();
  (rows || []).forEach((row) => {
    keys.forEach((key) => {
      const value = String(row?.[key] || "").trim();
      if (!value) return;
      const normalized = normalizeText(value);
      if (!seen.has(normalized)) seen.set(normalized, value);
    });
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function otSelectOptions(kind, selected = "", includeBlank = true) {
  const defaults = kind === "tipo_falla"
    ? MANTTO_TIPOS_FALLA
    : MANTTO_TIPOS_INTERVENCION;
  const seen = new Map();
  defaults.forEach((value) => {
    const normalized = normalizeText(value);
    if (normalized && !seen.has(normalized)) seen.set(normalized, value);
  });
  const options = [...seen.values()];
  const current = selected && options.find((option) => sameText(option, selected)) ? selected : "";
  return `${includeBlank ? '<option value="">Seleccione</option>' : ""}${options.map((value) => `<option value="${escapeHtml(value)}" ${sameText(value, current) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
}

function replaceInputWithSelect(form, name, labelText) {
  const field = form?.elements?.[name];
  if (!field || field.tagName === "SELECT") return;
  const value = field.value || "";
  const label = field.closest("label");
  const select = document.createElement("select");
  select.name = name;
  select.required = field.required;
  select.innerHTML = otSelectOptions(name, value);
  if (label) {
    label.innerHTML = `${labelText}`;
    label.appendChild(select);
  } else {
    field.replaceWith(select);
  }
}

function ensureOtTypeSelects(form) {
  if (!form) return;
  replaceInputWithSelect(form, "tipo_falla", "Tipo de falla");
  replaceInputWithSelect(form, "tipo_intervencion", "Tipo intervencion");
}

function ensureAvisoServiceSelect() {
  const form = $("avisoForm");
  if (!form) return;
  form.querySelectorAll("[data-aviso-service-field]").forEach((node) => node.remove());
}

function ensureAvisoImageInput() {
  const form = $("avisoForm");
  if (!form || form.elements.imagenes) return;
  const label = document.createElement("label");
  label.className = "span-2 aviso-image-input";
  label.innerHTML = `
    Imagen del aviso <span class="muted">Opcional, puede seleccionar una o varias fotos.</span>
    <input name="imagenes" type="file" accept="image/*" multiple>
    <small id="avisoImagenesInfo" class="muted">Sin imagen seleccionada.</small>
  `;
  const descriptionField = form.querySelector('textarea[name="descripcion"], input[name="descripcion"]');
  const target = descriptionField?.closest("label");
  if (target) target.insertAdjacentElement("afterend", label);
  else form.appendChild(label);
  const input = label.querySelector('input[type="file"]');
  input.addEventListener("change", () => {
    const total = input.files ? input.files.length : 0;
    const info = $("avisoImagenesInfo");
    if (info) info.textContent = total ? `${total} imagen(es) seleccionada(s)` : "Sin imagen seleccionada.";
  });
}

function equipmentServiceValue(row) {
  return equipoValue(row, "estado") || row?.tipo_servicio || row?.interno_externo || row?.origen || "";
}

function uniqueEquipmentServiceValues(rows) {
  const values = uniqueFormValues(rows, ["estado", "tipo_servicio", "interno_externo", "origen"]);
  return values.length ? values : ["interno", "externo"];
}

function fillAvisoServiceSelect(rows = state.catalogos.equipos) {
  const form = $("avisoForm");
  const select = form?.elements?.tipo_servicio;
  if (!select) return;
  fillSelect(select, uniqueEquipmentServiceValues(rows), "Seleccione", select.value || state.equipmentSelectors.aviso?.filters?.tipo_servicio || "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sameText(a, b) {
  return compactText(a) === compactText(b);
}

function rowMatchesFilter(row, key, value) {
  return !value || sameText(equipoValue(row, key), value);
}

function renderEquipmentSelector(scope) {
  const host = $(`${scope}EquipmentSelector`);
  const form = scope === "aviso" ? $("avisoForm") : scope === "avisoAtender" ? $("avisoOtForm") : $("otForm");
  if (!host || !form) return;

  const st = state.equipmentSelectors[scope] || { mode: "filter", filters: {}, code: "", selected: null };
  state.equipmentSelectors[scope] = st;

  const showSummary = scope !== "aviso";

  host.innerHTML = `
    <p class="muted">Modo de busqueda</p>
    <div class="selector-mode">
      <button type="button" data-selector-mode="code" class="${st.mode === "code" ? "active" : ""}">
        <strong>🔎 Buscar por codigo</strong>
        <span>${scope === "aviso" ? "Codigo del registro" : "Busqueda completa"}</span>
      </button>
      <button type="button" data-selector-mode="filter" class="${st.mode === "filter" ? "active" : ""}">
        <strong>🔍 Buscar por filtros</strong>
        <span>${scope === "aviso" ? "Sede, ubicacion, proceso y sistema" : "Busqueda completa por filtros"}</span>
      </button>
    </div>
    <div class="selector-body"></div>
    ${showSummary ? `<div class="equipment-summary">${equipmentSummaryHtml(st.selected, scope)}</div>` : ""}
  `;

  host.querySelectorAll("[data-selector-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      st.mode = button.dataset.selectorMode;
      clearSelectedEquipment(scope);
    });
  });

  if (st.mode === "code") renderEquipmentCodeSearch(scope, host.querySelector(".selector-body"));
  else renderEquipmentFilterSearch(scope, host.querySelector(".selector-body"));
}

function renderEquipmentCodeSearch(scope, body) {
  const st = state.equipmentSelectors[scope];
  const serviceFilters = scope === "aviso"
    ? `
      <div class="filter-grid">
        <label>Sede<select data-code-pre-filter="sede"></select></label>
        <label>Interno / externo<select data-code-pre-filter="tipo_servicio"></select></label>
      </div>
    `
    : "";
  body.innerHTML = `
    ${serviceFilters}
    <div class="equipment-search">
      <label>Codigo de equipo<input data-code-search value="${escapeHtml(st.code || "")}" placeholder="Escriba codigo: EV, EV1, WT..." autocomplete="off"></label>
      <div data-code-results class="code-results"></div>
    </div>
  `;
  const input = body.querySelector("[data-code-search]");
  const results = body.querySelector("[data-code-results]");
  if (scope === "aviso") {
    const sedeSelect = body.querySelector('[data-code-pre-filter="sede"]');
    const tipoSelect = body.querySelector('[data-code-pre-filter="tipo_servicio"]');
    fillSelect(sedeSelect, uniqueValues(state.catalogos.equipos, "sede"), "Seleccione", st.filters.sede || "");
    const rowsBySede = state.catalogos.equipos.filter((row) => !sedeSelect.value || rowMatchesFilter(row, "sede", sedeSelect.value));
    fillSelect(tipoSelect, uniqueEquipmentServiceValues(rowsBySede), "Seleccione", st.filters.tipo_servicio || "");
    [sedeSelect, tipoSelect].forEach((select) => {
      select.addEventListener("change", () => {
        st.filters[select.dataset.codePreFilter] = select.value;
        if (select.dataset.codePreFilter === "sede") delete st.filters.tipo_servicio;
        renderEquipmentCodeSearch(scope, body);
      });
    });
  }
  const renderResults = () => renderEquipmentCodeResults(scope, results, input.value);
  input.addEventListener("input", () => {
    st.code = input.value;
    clearTimeout(state.codeSearchTimers[scope]);
    state.codeSearchTimers[scope] = setTimeout(renderResults, 300);
  });
  renderResults();
}

function renderEquipmentCodeResults(scope, host, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    host.innerHTML = '<p class="muted">Escriba parte del codigo para ver resultados.</p>';
    return;
  }

  const rows = state.catalogos.equipos
    .filter((item) => normalizeText(equipoValue(item, "codigo")).includes(normalizeText(q)))
    .filter((item) => scope !== "aviso" || !state.equipmentSelectors.aviso?.filters?.sede || rowMatchesFilter(item, "sede", state.equipmentSelectors.aviso.filters.sede))
    .filter((item) => scope !== "aviso" || !state.equipmentSelectors.aviso?.filters?.tipo_servicio || sameText(equipmentServiceValue(item), state.equipmentSelectors.aviso.filters.tipo_servicio))
    .slice(0, 30);

  if (!rows.length) {
    host.innerHTML = `<p class="empty-state">No se encontraron registros relacionados con este codigo.</p>`;
    if (scope === "aviso") renderAvisoResumenSeleccion(null);
    return;
  }

  const columns = scope === "aviso"
    ? [
        { key: "codigo", label: "Codigo", render: (row) => escapeHtml(equipoValue(row, "codigo") || "-") },
        { key: "sede", label: "Sede", render: (row) => escapeHtml(equipoValue(row, "sede") || "-") },
        { key: "ubicacion", label: "Ubicacion", render: (row) => escapeHtml(equipoValue(row, "ubicacion") || "-") },
        { key: "proceso", label: "Proceso", render: (row) => escapeHtml(equipoValue(row, "proceso") || "-") },
        { key: "sistema", label: "Sistema", render: (row) => escapeHtml(equipoValue(row, "sistema") || "-") },
        { key: "equipo", label: "Equipo", render: (row) => escapeHtml(equipoValue(row, "equipo") || "-") },
        { key: "estado", label: "Estado", render: (row) => badge(equipoValue(row, "estado") || "-") },
      ]
    : [
        { key: "codigo", label: "Codigo", render: (row) => escapeHtml(equipoValue(row, "codigo")) },
        { key: "sede", label: "Sede", render: (row) => escapeHtml(equipoValue(row, "sede")) },
        { key: "estado", label: "Estado", render: (row) => escapeHtml(equipoValue(row, "estado")) },
        { key: "ubicacion", label: "Ubicacion", render: (row) => escapeHtml(equipoValue(row, "ubicacion")) },
        { key: "proceso", label: "Proceso", render: (row) => escapeHtml(equipoValue(row, "proceso")) },
        { key: "sistema", label: "Sistema", render: (row) => escapeHtml(equipoValue(row, "sistema")) },
        { key: "equipo", label: "Equipo", render: (row) => escapeHtml(equipoValue(row, "equipo")) },
        { key: "sub_equipo", label: "Sub-equipo", render: (row) => escapeHtml(equipoValue(row, "sub_equipo")) },
        { key: "tipo_equipo", label: "Tipo equipo", render: (row) => escapeHtml(equipoValue(row, "tipo_equipo")) },
      ];

  host.innerHTML = renderTable(
    rows,
    columns,
    (row) => `<button class="primary" type="button" onclick="selectEquipmentById('${scope}', ${Number(row.id)})">✓ Seleccionar</button>`
  );
}

function selectEquipmentById(scope, id) {
  const equipo = state.catalogos.equipos.find((item) => Number(item.id) === Number(id));
  if (!equipo) return toast("Registro no encontrado", "error");
  applySelectedEquipment(scope, equipo);
  toast("Registro seleccionado correctamente", "success");
}

function renderEquipmentFilterSearch(scope, body) {
  const st = state.equipmentSelectors[scope];

  if (scope === "aviso") {
    const order = [
      ["sede", "Sede"],
      ["tipo_servicio", "Interno / externo"],
      ["ubicacion", "Ubicacion"],
      ["proceso", "Proceso"],
      ["sistema", "Sistema"],
    ];

    body.innerHTML = `
      <div class="filter-grid">
        ${order.map(([key, label]) => `<label>${label}<select data-filter="${key}"></select></label>`).join("")}
      </div>
      <div class="form-actions span-full" style="justify-content:flex-start; margin-top:12px;">
        <button class="primary" type="button" id="avisoBuscarFiltros">🔍 Buscar</button>
        <button class="secondary" type="button" id="avisoLimpiarFiltros">🧹 Limpiar</button>
      </div>
    `;

    let filtered = state.catalogos.equipos;

    order.forEach(([key]) => {
      const select = body.querySelector(`[data-filter="${key}"]`);
      const options = key === "tipo_servicio" ? uniqueEquipmentServiceValues(filtered) : uniqueValues(filtered, key);
      fillSelect(select, options, "Seleccione", st.filters[key] || "");

      if (select.value) {
        st.filters[key] = select.value;
        filtered = filtered.filter((row) => key === "tipo_servicio" ? sameText(equipmentServiceValue(row), select.value) : rowMatchesFilter(row, key, select.value));
      }

      select.addEventListener("change", () => {
        const index = order.findIndex(([item]) => item === key);
        st.filters[key] = select.value;
        order.slice(index + 1).forEach(([later]) => delete st.filters[later]);
        aplicarAvisoDesdeFiltros();
        renderEquipmentSelector("aviso");
      });
    });

    aplicarAvisoDesdeFiltros();

    $("avisoBuscarFiltros").addEventListener("click", () => {
      for (const [key, label] of order) {
        if (!st.filters[key]) return toast(`Seleccione ${label.toLowerCase()}`, "warning");
      }
      aplicarAvisoDesdeFiltros();
      toast("Filtros aplicados correctamente", "success");
    });

    $("avisoLimpiarFiltros").addEventListener("click", () => clearSelectedEquipment("aviso"));
    return;
  }

  const order = scope === "ot"
    ? [
        ["sede", "Sede"],
        ["tipo_servicio", "Interno / externo"],
        ["ubicacion", "Ubicacion"],
        ["proceso", "Proceso"],
        ["sistema", "Sistema"],
        ["equipo", "Equipo"],
        ["tipo_equipo", "Tipo de equipo"],
        ["sub_equipo", "Sub-equipo"],
        ["codigo", "Codigo"],
      ]
    : [
    ["sede", "Sede"],
    ["estado", "Estado"],
    ["ubicacion", "Ubicacion"],
    ["proceso", "Proceso"],
    ["sistema", "Sistema"],
    ["equipo", "Equipo"],
    ["tipo_equipo", "Tipo de equipo"],
    ["sub_equipo", "Sub-equipo"],
    ["codigo", "Codigo"],
  ];

  body.innerHTML = `<div class="filter-grid">${order.map(([key, label]) => `<label>${label}<select data-filter="${key}"></select></label>`).join("")}</div>`;

  let filtered = state.catalogos.equipos;

  order.forEach(([key]) => {
    const select = body.querySelector(`[data-filter="${key}"]`);
    const options = key === "tipo_servicio" ? uniqueEquipmentServiceValues(filtered) : uniqueValues(filtered, key);
    fillSelect(select, options, "Seleccione", st.filters[key] || "");

    const selected = select.value;
    st.filters[key] = selected;

    if (selected) filtered = filtered.filter((row) => equipmentMatchesFilterKey(row, key, selected));

    select.addEventListener("change", () => {
      const index = order.findIndex(([item]) => item === key);
      st.filters[key] = select.value;
      order.slice(index + 1).forEach(([later]) => delete st.filters[later]);
      const found = findEquipmentByFilters(st.filters);
      if (scope === "ot" && st.mode === "filter") {
        applyOtFilterSelection(st.filters);
      } else if (found && st.filters.codigo) applySelectedEquipment(scope, found, false);
      else st.selected = null;
      renderEquipmentSelector(scope);
    });
  });

  const selected = findEquipmentByFilters(st.filters);
  if (scope === "ot" && st.mode === "filter") applyOtFilterSelection(st.filters);
  else if (selected && st.filters.codigo) applySelectedEquipment(scope, selected, false);
}

function applyOtFilterSelection(filters = {}) {
  const form = $("otForm");
  if (!form) return;
  ["sede", "tipo_servicio", "ubicacion", "proceso", "sistema", "equipo", "sub_equipo", "tipo_equipo"].forEach((name) => setFormValue(form, name, filters[name] || ""));
  setFormValue(form, "equipo_codigo", filters.codigo || "");
  setFormValue(form, "componente", "");
  if (state.equipmentSelectors.ot) state.equipmentSelectors.ot.selected = null;
}

function equipmentMatchesFilterKey(row, key, value) {
  if (!value) return true;
  if (key === "tipo_servicio") return sameText(equipmentServiceValue(row), value);
  return rowMatchesFilter(row, key, value);
}

function findEquipmentByFilters(filters) {
  return state.catalogos.equipos.find((row) => Object.entries(filters).every(([key, value]) => equipmentMatchesFilterKey(row, key, value)));
}

function findEquipmentForAviso(aviso) {
  if (!aviso) return null;
  const codigo = aviso.equipo_codigo || aviso.codigo;
  if (codigo) {
    const byCode = state.catalogos.equipos.find((row) => sameText(equipoValue(row, "codigo"), codigo));
    if (byCode) return byCode;
  }

  const filters = {
    sede: aviso.sede,
    ubicacion: aviso.ubicacion,
    proceso: aviso.proceso,
    sistema: aviso.sistema,
  };
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => String(value || "").trim()));
  if (!Object.keys(activeFilters).length) return null;

  const strict = findEquipmentByFilters(activeFilters);
  if (strict) return strict;

  return state.catalogos.equipos.find((row) => {
    const score = Object.entries(activeFilters).reduce((acc, [key, value]) => acc + (rowMatchesFilter(row, key, value) ? 1 : 0), 0);
    return score >= Math.min(3, Object.keys(activeFilters).length);
  }) || null;
}

function avisoBaseFilters(aviso) {
  return {
    sede: aviso?.sede || "",
    ubicacion: aviso?.ubicacion || "",
    proceso: aviso?.proceso || "",
    sistema: aviso?.sistema || "",
  };
}

function matchingEquipmentForAviso(aviso) {
  const activeFilters = Object.fromEntries(
    Object.entries(avisoBaseFilters(aviso)).filter(([, value]) => String(value || "").trim())
  );
  return state.catalogos.equipos.filter((row) =>
    Object.entries(activeFilters).every(([key, value]) => rowMatchesFilter(row, key, value))
  );
}

function avisoHasSpecificEquipment(aviso) {
  return Boolean(
    String(aviso?.equipo || "").trim() ||
    String(aviso?.equipo_codigo || "").trim() ||
    String(aviso?.sub_equipo || "").trim() ||
    String(aviso?.componente || "").trim()
  );
}

function comboOptionsFromRows(rows, key, selected = "", placeholder = "Seleccione") {
  const options = uniqueValues(rows, key);
  const current = String(selected || "").trim();
  if (current && !options.some((option) => sameText(option, current))) options.unshift(current);
  return `<option value="">${escapeHtml(placeholder)}</option>${options.map((value) => `<option value="${escapeHtml(value)}" ${sameText(value, current) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
}

function comboOptions(values, selected = "", placeholder = "Seleccione") {
  const seen = new Map();
  values.forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = normalizeText(text);
    if (!seen.has(key)) seen.set(key, text);
  });
  const current = String(selected || "").trim();
  if (current && !seen.has(normalizeText(current))) seen.set(normalizeText(current), current);
  return `<option value="">${escapeHtml(placeholder)}</option>${[...seen.values()].map((value) => `<option value="${escapeHtml(value)}" ${sameText(value, current) ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
}

function renderAssetCascadeCombos(form, rows, defaults = {}, onChange = null) {
  if (!form) return;
  const getCurrent = (name) => String(form.elements?.[name]?.value || defaults[name] || "").trim();
  const selected = {
    equipo: getCurrent("equipo"),
    tipo_equipo: getCurrent("tipo_equipo"),
    equipo_codigo: getCurrent("equipo_codigo"),
    sub_equipo: getCurrent("sub_equipo"),
    componente: getCurrent("componente"),
  };

  const rowsByEquipo = selected.equipo
    ? rows.filter((row) => rowMatchesFilter(row, "equipo", selected.equipo))
    : rows;
  const rowsByTipo = selected.tipo_equipo
    ? rowsByEquipo.filter((row) => rowMatchesFilter(row, "tipo_equipo", selected.tipo_equipo))
    : rowsByEquipo;
  const rowsBySubEquipoForCode = selected.sub_equipo && !sameText(selected.sub_equipo, "No aplica")
    ? rowsByTipo.filter((row) => rowMatchesFilter(row, "sub_equipo", selected.sub_equipo))
    : rowsByTipo;
  const rowsByCodigo = selected.equipo_codigo
    ? rowsBySubEquipoForCode.filter((row) => rowMatchesFilter(row, "codigo", selected.equipo_codigo))
    : rowsBySubEquipoForCode;
  const rowsBySubEquipo = selected.sub_equipo && !sameText(selected.sub_equipo, "No aplica")
    ? rowsByCodigo.filter((row) => rowMatchesFilter(row, "sub_equipo", selected.sub_equipo))
    : rowsByCodigo;

  if (form.elements?.equipo) {
    form.elements.equipo.innerHTML = comboOptions(uniqueValues(rows, "equipo"), selected.equipo, "Seleccionar equipo");
  }
  if (form.elements?.tipo_equipo) {
    form.elements.tipo_equipo.innerHTML = comboOptions(uniqueValues(rowsByEquipo, "tipo_equipo"), selected.tipo_equipo, "Seleccionar tipo equipo");
  }
  if (form.elements?.sub_equipo) {
    form.elements.sub_equipo.innerHTML = comboOptions([...uniqueValues(rowsByTipo, "sub_equipo"), "No aplica"], selected.sub_equipo, "Seleccionar sub-equipo");
  }
  if (form.elements?.equipo_codigo) {
    const codeValues = uniqueValues(rowsBySubEquipoForCode, "codigo");
    if (!selected.equipo_codigo && codeValues.length === 1) selected.equipo_codigo = codeValues[0];
    form.elements.equipo_codigo.innerHTML = comboOptions(codeValues, selected.equipo_codigo, "Codigo equipo");
  }
  if (form.elements?.componente && form.elements.componente.tagName === "SELECT") {
    form.elements.componente.innerHTML = comboOptions([...uniqueValues(rowsBySubEquipo, "componente"), "No aplica"], selected.componente, "Seleccionar componente");
  }
  if (onChange) {
    ["equipo", "tipo_equipo", "sub_equipo", "equipo_codigo", "componente"].forEach((name) => {
      const field = form.elements?.[name];
      if (!field || field.tagName !== "SELECT") return;
      field.onchange = () => onChange();
    });
  }
}

function renderAvisoOtEquipmentCombos(aviso) {
  const form = $("avisoOtForm");
  if (!form) return;

  const rows = matchingEquipmentForAviso(aviso);
  const useAvisoSpecific = avisoHasSpecificEquipment(aviso);
  const defaults = useAvisoSpecific
    ? {
        equipo: aviso.equipo || "",
        tipo_equipo: aviso.tipo_equipo || "",
        equipo_codigo: aviso.equipo_codigo || "",
        sub_equipo: aviso.sub_equipo || "",
        componente: aviso.componente || "",
      }
    : { equipo: "", tipo_equipo: "", equipo_codigo: "", sub_equipo: "", componente: "" };

  const refreshCascade = () => {
    renderAssetCascadeCombos(form, rows, {}, refreshCascade);
    updateAvisoOtEquipmentFromSelection(rows);
  };
  renderAssetCascadeCombos(form, rows, defaults, refreshCascade);
  updateAvisoOtEquipmentFromSelection(rows, false);
}

function updateAvisoOtEquipmentFromSelection(rows, fillBlank = true) {
  const form = $("avisoOtForm");
  if (!form) return;
  const selected = {
    equipo: form.elements.equipo?.value || "",
    tipo_equipo: form.elements.tipo_equipo?.value || "",
    codigo: form.elements.equipo_codigo?.value || "",
    sub_equipo: form.elements.sub_equipo?.value || "",
    componente: form.elements.componente?.value || "",
  };
  const active = Object.entries(selected).filter(([, value]) => String(value || "").trim());
  const found = rows.find((row) => active.every(([key, value]) => rowMatchesFilter(row, key, value)));

  if (found && fillBlank) {
    if (!selected.equipo) setFormValue(form, "equipo", equipoValue(found, "equipo"));
    if (!selected.tipo_equipo) setFormValue(form, "tipo_equipo", equipoValue(found, "tipo_equipo"));
    if (!selected.codigo) setFormValue(form, "equipo_codigo", equipoValue(found, "codigo"));
    if (!selected.sub_equipo) setFormValue(form, "sub_equipo", equipoValue(found, "sub_equipo"));
    if (!selected.componente) setFormValue(form, "componente", equipoValue(found, "componente"));
  }
}

function applySelectedEquipment(scope, equipo, rerender = true) {
  const st = state.equipmentSelectors[scope];
  st.selected = equipo;
  st.filters = {
    sede: equipoValue(equipo, "sede"),
    estado: equipoValue(equipo, "estado"),
    ubicacion: equipoValue(equipo, "ubicacion"),
    proceso: equipoValue(equipo, "proceso"),
    sistema: equipoValue(equipo, "sistema"),
    equipo: equipoValue(equipo, "equipo"),
    tipo_equipo: equipoValue(equipo, "tipo_equipo"),
    sub_equipo: equipoValue(equipo, "sub_equipo"),
    codigo: equipoValue(equipo, "codigo"),
  };

  const form = scope === "aviso" ? $("avisoForm") : scope === "avisoAtender" ? $("avisoOtForm") : $("otForm");
  setFormValue(form, "sede", st.filters.sede);
  setFormValue(form, "rubro", equipoValue(equipo, "rubro"));
  setFormValue(form, "ubicacion", st.filters.ubicacion);
  setFormValue(form, "proceso", st.filters.proceso);
  setFormValue(form, "sistema", st.filters.sistema);
  setFormValue(form, "equipo", st.filters.equipo);
  setFormValue(form, "sub_equipo", st.filters.sub_equipo);
  setFormValue(form, "componente", st.filters.sub_equipo || equipoValue(equipo, "componente"));
  setFormValue(form, "tipo_equipo", st.filters.tipo_equipo);
  setFormValue(form, "equipo_codigo", st.filters.codigo);

  if (scope === "aviso") renderAvisoResumenSeleccion(equipo);
  if (rerender) renderEquipmentSelector(scope);
}

function setFormValue(form, name, value) {
  const field = form?.elements?.[name];
  if (!field) return;
  const normalized = value || "";
  if (field.tagName === "SELECT" && normalized && ![...field.options].some((option) => option.value === normalized)) {
    field.add(new Option(normalized, normalized));
  }
  field.value = normalized;
}

function equipmentSummaryHtml(equipo, scope = "") {
  if (!equipo) return "<p>Seleccione un equipo para continuar.</p>";
  const rows = [
    ["Sede", equipoValue(equipo, "sede")],
    ["Estado", equipoValue(equipo, "estado")],
    ["Ubicacion", equipoValue(equipo, "ubicacion")],
    ["Proceso", equipoValue(equipo, "proceso")],
    ["Sistema", equipoValue(equipo, "sistema")],
    ["Equipo", equipoValue(equipo, "equipo")],
    ["Tipo equipo", equipoValue(equipo, "tipo_equipo")],
    ["Sub-equipo", equipoValue(equipo, "sub_equipo")],
    ["Codigo", equipoValue(equipo, "codigo")],
  ];
  return `<strong>Equipo seleccionado</strong><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v || "-")}</dd>`).join("")}</dl>${scope ? `<button class="secondary compact-btn" type="button" onclick="clearSelectedEquipment('${escapeJs(scope)}')">🧹 Cambiar equipo</button>` : ""}`;
}

function clearSelectedEquipment(scope) {
  if (!scope || !state.equipmentSelectors[scope]) return;

  state.equipmentSelectors[scope] = {
    mode: state.equipmentSelectors[scope].mode || "filter",
    filters: {},
    code: "",
    selected: null,
  };

  const form = scope === "aviso" ? $("avisoForm") : scope === "avisoAtender" ? $("avisoOtForm") : $("otForm");

  if (form) {
    [
      "sede", "rubro", "ubicacion", "proceso", "sistema",
      "equipo", "sub_equipo", "componente", "tipo_equipo", "equipo_codigo"
    ].forEach((name) => setFormValue(form, name, ""));
  }

  if (scope === "aviso") renderAvisoResumenSeleccion(null);

  renderEquipmentSelector(scope);
}

function renderAvisoResumenSeleccion(equipo = null) {
  const el = $("avisoResumenSeleccion") || $("avisoEquipoFicha");
  if (!el) return;

  const st = state.equipmentSelectors.aviso || { mode: "filter", filters: {}, selected: null };
  const descripcion = $("avisoForm")?.elements.descripcion?.value || "";

  if (st.mode === "code") {
    const row = equipo || st.selected;
    if (!row) {
      el.textContent = "Busque y seleccione un codigo para ver el resumen.";
      return;
    }

    el.innerHTML = `
      <strong>Resumen del registro</strong>
      <dl>
        <dt>Codigo</dt><dd>${escapeHtml(equipoValue(row, "codigo") || "-")}</dd>
        <dt>Sede</dt><dd>${escapeHtml(equipoValue(row, "sede") || "-")}</dd>
        <dt>Ubicacion</dt><dd>${escapeHtml(equipoValue(row, "ubicacion") || "-")}</dd>
        <dt>Proceso</dt><dd>${escapeHtml(equipoValue(row, "proceso") || "-")}</dd>
        <dt>Sistema</dt><dd>${escapeHtml(equipoValue(row, "sistema") || "-")}</dd>
        <dt>Equipo</dt><dd>${escapeHtml(equipoValue(row, "equipo") || "-")}</dd>
        <dt>Estado aviso</dt><dd>${badge("ABIERTO")}</dd>
        <dt>Descripcion</dt><dd>${escapeHtml(descripcion || "Pendiente")}</dd>
      </dl>
    `;
    return;
  }

  const f = st.filters || {};
  if (!f.sede && !f.ubicacion && !f.proceso && !f.sistema) {
    el.textContent = "Seleccione los filtros para ver el resumen.";
    return;
  }

  el.innerHTML = `
    <strong>Resumen de seleccion</strong>
    <dl>
      <dt>Sede</dt><dd>${escapeHtml(f.sede || "-")}</dd>
      <dt>Ubicacion</dt><dd>${escapeHtml(f.ubicacion || "-")}</dd>
      <dt>Proceso</dt><dd>${escapeHtml(f.proceso || "-")}</dd>
      <dt>Sistema</dt><dd>${escapeHtml(f.sistema || "-")}</dd>
      <dt>Estado aviso</dt><dd>${badge("ABIERTO")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(descripcion || "Pendiente")}</dd>
    </dl>
  `;
}

function renderAvisoEquipoFicha(equipo) {
  renderAvisoResumenSeleccion(equipo);
}

function aplicarAvisoDesdeFiltros() {
  const form = $("avisoForm");
  if (!form) return;

  const st = state.equipmentSelectors.aviso || { filters: {} };
  const f = st.filters || {};
  const row = findEquipmentByFilters({
    sede: f.sede,
    ubicacion: f.ubicacion,
    proceso: f.proceso,
    sistema: f.sistema,
  });

  setFormValue(form, "sede", f.sede || "");
  setFormValue(form, "tipo_servicio", f.tipo_servicio || "");
  setFormValue(form, "ubicacion", f.ubicacion || "");
  setFormValue(form, "proceso", f.proceso || "");
  setFormValue(form, "sistema", f.sistema || "");
  setFormValue(form, "rubro", row ? equipoValue(row, "rubro") : "");
  setFormValue(form, "equipo", "");
  setFormValue(form, "sub_equipo", "");
  setFormValue(form, "componente", "");
  setFormValue(form, "equipo_codigo", "");
  setFormValue(form, "tipo_equipo", "");

  st.selected = row || null;
  fillAvisoServiceSelect(state.catalogos.equipos.filter((item) => !f.sede || rowMatchesFilter(item, "sede", f.sede)));
  renderAvisoResumenSeleccion(row || null);
}


function renderPersonnelSelector(hostId, inputId) {
  const host = $(hostId);
  const input = $(inputId);
  if (!host || !input) return;
  host.innerHTML = `
    <div class="personnel-search">
      <input type="search" data-person-search placeholder="Buscar tecnico..." autocomplete="off">
      <div data-person-results class="table-wrap hidden"></div>
    </div>
  `;
  const search = host.querySelector("[data-person-search]");
  const results = host.querySelector("[data-person-results]");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) {
      results.classList.add("hidden");
      return;
    }
    const found = tecnicosDisponibles().filter((p) => ["nombre", "sede", "area", "cargo"].some((key) => String(personalValue(p, key)).toLowerCase().includes(q))).slice(0, 8);
    results.innerHTML = renderTable(
      found,
      [
        { key: "nombre", label: "Nombre", render: (row) => escapeHtml(personalValue(row, "nombre")) },
        { key: "cargo", label: "Cargo", render: (row) => escapeHtml(personalValue(row, "cargo")) },
        { key: "sede", label: "Sede", render: (row) => escapeHtml(personalValue(row, "sede")) },
      ],
      (row) => `<button type="button" onclick="selectPersonnel('${inputId}', '${escapeJs(personalValue(row, "nombre"))}')">✓ Seleccionar</button>`
    );
    results.classList.remove("hidden");
  });
}

function selectPersonnel(inputId, nombre) {
  $(inputId).value = nombre;
  document.querySelectorAll("[data-person-results]").forEach((el) => el.classList.add("hidden"));
}

function injectManttoV38Styles() {
  if ($("manttoV38Styles")) return;
  const style = document.createElement("style");
  style.id = "manttoV38Styles";
  style.textContent = `
    .app-shell, .content-area { width:100%; max-width:none; }
    .content-area { padding:16px 18px 12px; }
    #homeScreen { width:min(100%, 1450px); max-width:1450px; margin:0 auto; padding-right:0; }
    #homeScreen .dashboard-layout, #homeScreen .charts-row { display:none !important; }
    .dashboard-head { align-items:stretch; gap:12px; width:100%; margin-bottom:10px; min-height:88px; padding:14px 16px; border-radius:10px; background:linear-gradient(135deg, #0B3B66, #0879C9); box-shadow:0 10px 26px rgba(11,59,102,.16); }
    .dashboard-head > div:first-child { flex:1 1 auto; min-width:0; }
    .dashboard-head h2 { margin-bottom:4px; font-size:24px; line-height:1.08; color:#FFFFFF; font-weight:900; letter-spacing:0; }
    .dashboard-head p { color:rgba(255,255,255,.88); font-size:13px; }
    .dashboard-head .eyebrow { margin-bottom:6px; font-size:11px; color:rgba(255,255,255,.72); }
    .system-status { min-width:180px; padding:11px 14px; background:rgba(255,255,255,.14); border-color:rgba(255,255,255,.24); color:#fff; }
    .system-status span, .system-status small, .system-status strong { color:#fff; }
    .kpi-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap:9px; width:100%; margin-bottom:10px; }
    .kpi-card { position:relative; min-height:68px; padding:9px 10px 8px 12px; border:1px solid #D8E2EA; border-left:4px solid #0879C9; border-radius:8px; background:#fff; overflow:hidden; box-shadow:0 5px 14px rgba(15,35,55,.055); }
    .kpi-card::after { content: attr(data-icon); position:absolute; right:9px; top:6px; opacity:.14; font-size:24px; }
    .kpi-card span { display:block; font-size:9.5px; text-transform:uppercase; color:#64748B; font-weight:800; line-height:1.1; max-width:92px; }
    .kpi-card strong { display:block; margin-top:4px; font-size:24px; line-height:1; color:#1F2937; }
    .kpi-green { border-left-color:#18A558; }
    .kpi-yellow { border-left-color:#F4B400; }
    .kpi-red { border-left-color:#D64545; }
    .mantto-dashboard-v38 { display:grid; grid-template-columns:repeat(12, minmax(0, 1fr)); gap:10px; width:100%; margin-top:0; align-items:stretch; }
    .chart-card-v38, .compact-card-v38 { background:#fff; border:1px solid #D8E2EA; border-radius:8px; padding:10px 11px; box-shadow:0 6px 16px rgba(15,35,55,.055); min-height:166px; overflow:hidden; }
    .chart-card-v38.chart-main-v40 { grid-column:span 6; min-height:218px; }
    .chart-card-v38.chart-side-v40 { grid-column:span 3; min-height:218px; }
    .chart-card-v38.chart-small-v44 { grid-column:span 4; min-height:168px; }
    .chart-card-v38 h3, .compact-card-v38 h3 { margin:0 0 8px; font-size:13px; line-height:1.15; text-transform:uppercase; color:#0B3B66; letter-spacing:0; font-weight:900; }
    .chart-card-v38.wide { grid-column:span 6; }
    .donut-wrap-v38 { display:grid; grid-template-columns:112px minmax(0, 1fr); align-items:center; justify-content:center; gap:9px; min-height:138px; }
    .donut-v38 { width:112px; height:112px; border-radius:50%; display:grid; place-items:center; flex:0 0 auto; box-shadow:inset 0 0 0 1px #D8E2EA; }
    .donut-v38 > div { width:66px; height:66px; border-radius:50%; background:#fff; display:grid; place-items:center; text-align:center; color:#0B3B66; font-size:8px; font-weight:800; box-shadow:0 0 0 1px #D8E2EA; }
    .donut-v38 strong { display:block; font-size:20px; color:#1F2937; }
    .legend-v38 { display:grid; gap:5px; width:100%; min-width:0; }
    .legend-v38 div { display:flex; justify-content:space-between; gap:8px; font-size:11px; color:#1F2937; min-width:0; }
    .legend-v38 span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .legend-v38 i { width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px; }
    .bar-row { display:grid; grid-template-columns:minmax(116px, 1fr) minmax(150px, 2.6fr) minmax(58px, auto); align-items:center; gap:8px; min-height:19px; }
    .bar-row span { font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bar-row strong { min-width:54px; text-align:right; font-size:10px; color:#1F2937; }
    .bar-row div { height:9px; background:#EAF4FB; border-radius:999px; overflow:hidden; }
    .bar-row i { display:block; height:100%; background:linear-gradient(90deg, #0879C9, #18A558); border-radius:999px; }
    .metric-bars { display:grid; gap:4px; }
    .month-chart-v40 { height:172px; display:grid; grid-template-columns:28px 1fr; grid-template-rows:1fr 18px; gap:5px 8px; }
    .month-y-v40 { display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end; color:#64748B; font-size:9px; padding-bottom:3px; border-right:1px solid #CBD5DD; padding-right:5px; }
    .month-bars-v40 { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:6px; align-items:end; border-bottom:1px solid #CBD5DD; padding:5px 4px 0; background:linear-gradient(to top, rgba(203,213,221,.25) 1px, transparent 1px); background-size:100% 25%; }
    .month-group-v40 { height:100%; display:flex; align-items:end; justify-content:center; gap:4px; }
    .month-bar-v40 { min-width:12px; max-width:24px; width:38%; border-radius:5px 5px 0 0; background:#0879C9; position:relative; }
    .month-bar-v40.closed { background:#18A558; }
    .month-bar-v40 small { position:absolute; top:-12px; left:50%; transform:translateX(-50%); font-size:8px; color:#1F2937; font-weight:800; }
    .month-labels-v40 { grid-column:2; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:6px; text-align:center; color:#64748B; font-size:9px; font-weight:800; }
    .month-legend-v40 { display:flex; gap:12px; align-items:center; margin-top:1px; font-size:9px; color:#64748B; font-weight:800; }
    .month-legend-v40 i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:4px; background:#0879C9; vertical-align:-1px; }
    .month-legend-v40 i.closed { background:#18A558; }
    .recent-card-v41 { grid-column:1 / -1; min-height:170px; max-height:220px; padding-bottom:8px; }
    .recent-head-v41 { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:5px; }
    .recent-head-v41 h3 { margin:0; }
    .recent-select-v41 { min-width:170px; max-width:230px; height:28px; border:1px solid #CBD5DD; border-radius:6px; background:#fff; color:#0B3B66; font-weight:800; font-size:11px; padding:0 8px; }
    .recent-content-v41 { max-height:158px; overflow:auto; }
    .compact-table-v38 { width:100%; border-collapse:collapse; font-size:10.5px; }
    .compact-table-v38 th { color:#0B3B66; text-align:left; font-size:9px; text-transform:uppercase; border-bottom:1px solid #D8E2EA; padding:5px 6px; position:sticky; top:0; background:#fff; }
    .compact-table-v38 td { padding:5px 6px; border-bottom:1px solid #EEF3F7; max-width:180px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .activity-v38 { display:grid; gap:4px; font-size:10.5px; }
    .activity-v38 div { display:grid; grid-template-columns:42px 1fr; gap:6px; align-items:center; }
    .activity-v38 span { color:#667581; font-weight:700; }
    .activity-v38 strong { color:#1F2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cielo-float { position:fixed; right:22px; bottom:22px; z-index:16000; border:0; border-radius:999px; background:#0B3B66; color:#fff; padding:12px 16px; display:flex; gap:8px; align-items:center; box-shadow:0 12px 30px rgba(11,59,102,.28); cursor:pointer; }
    .cielo-float span { font-size:18px; }
    .cielo-float strong { font-size:13px; }
    .cielo-panel { position:fixed; right:22px; bottom:78px; width:min(360px, calc(100vw - 28px)); z-index:16000; background:#fff; border:1px solid #CBD5DD; border-radius:10px; box-shadow:0 20px 45px rgba(15,35,55,.22); overflow:hidden; }
    .cielo-panel-head { background:#0B3B66; color:#fff; display:flex; justify-content:space-between; gap:12px; padding:12px 14px; }
    .cielo-panel-head strong, .cielo-panel-head span { display:block; }
    .cielo-panel-head span { opacity:.78; font-size:11px; }
    .cielo-panel-head button { border:0; background:transparent; color:#fff; font-size:22px; cursor:pointer; }
    .cielo-panel-body { padding:14px; }
    .cielo-query { display:grid; grid-template-columns:1fr auto; gap:8px; margin-top:10px; }
    .cielo-query input { min-width:0; }
    .voice-config-grid { display:grid; grid-template-columns:repeat(2, minmax(180px, 1fr)); gap:10px; margin-top:10px; }
    .access-matrix { overflow:auto; }
    .access-matrix table { min-width:900px; width:100%; border-collapse:collapse; font-size:12px; }
    .access-matrix th, .access-matrix td { border:1px solid #D8E2EA; padding:7px; text-align:center; }
    .access-matrix th:first-child, .access-matrix td:first-child { text-align:left; position:sticky; left:0; background:#fff; z-index:1; }
    .access-matrix th { background:#EAF4FB; color:#0B3B66; font-size:10px; text-transform:uppercase; }
    .inventory-alert-card { cursor:pointer; }
    .inventory-alert-card strong { color:#D64545; }
    .catalog-layout-v46 { display:grid; grid-template-columns:minmax(0, 1.65fr) minmax(280px, .85fr); gap:12px; align-items:start; }
    .catalog-search-v46 { background:#fff; border:1px solid #D8E2EA; border-radius:8px; padding:12px; margin-bottom:10px; }
    .catalog-search-v46 input { width:100%; }
    .catalog-results-v46 { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:10px; }
    .item-card-v46 { border:1px solid #D8E2EA; border-radius:8px; padding:10px; background:#fff; box-shadow:0 5px 14px rgba(15,35,55,.05); display:grid; gap:7px; }
    .item-card-v46 h4 { margin:0; color:#0B3B66; font-size:13px; line-height:1.2; }
    .item-card-v46 small { color:#64748B; display:block; }
    .qty-control-v46 { display:grid; grid-template-columns:30px 1fr 30px; gap:5px; align-items:center; }
    .qty-control-v46 input { text-align:center; height:30px; }
    .cart-v46 { position:sticky; top:12px; background:#fff; border:1px solid #D8E2EA; border-radius:8px; padding:12px; box-shadow:0 6px 16px rgba(15,35,55,.06); }
    .cart-v46 h3 { margin-top:0; color:#0B3B66; }
    .cart-row-v46 { display:grid; grid-template-columns:1fr auto auto; gap:7px; align-items:center; padding:7px 0; border-bottom:1px solid #EEF3F7; font-size:12px; }
    .cart-row-v46 strong { display:block; color:#1F2937; }
    .cart-row-v46 span { color:#64748B; font-size:11px; }
    .stock-low { color:#D64545; font-weight:800; }
    .stock-normal { color:#18A558; font-weight:800; }
    .stock-max { color:#0879C9; font-weight:800; }
    .detail-modal-v46 { background:#fff; border:1px solid #D8E2EA; border-radius:8px; padding:12px; box-shadow:0 8px 20px rgba(15,35,55,.08); }
    .compact-actions-v46 { display:flex; gap:6px; flex-wrap:wrap; }
    @media (max-width: 1100px) {
      .content-area { padding:14px 12px; }
      .kpi-grid { grid-template-columns: repeat(3, minmax(120px, 1fr)); }
      .mantto-dashboard-v38 { grid-template-columns:1fr; }
      .chart-card-v38.chart-main-v40, .chart-card-v38.chart-side-v40, .chart-card-v38.chart-small-v44, .chart-card-v38.wide, .recent-card-v41 { grid-column:auto; }
      .chart-card-v38, .compact-card-v38, .chart-card-v38.chart-main-v40, .chart-card-v38.chart-side-v40 { min-height:180px; }
      .recent-card-v41 { max-height:230px; }
      .recent-content-v41 { max-height:170px; }
      .catalog-layout-v46 { grid-template-columns:1fr; }
      .cart-v46 { position:static; }
    }
    @media (min-width: 1500px) {
      .chart-card-v38.chart-main-v40, .chart-card-v38.chart-side-v40 { min-height:204px; }
      .month-chart-v40 { height:160px; }
    }
    @media (max-height: 780px) and (min-width: 1101px) {
      .content-area { padding-top:12px; }
      #homeScreen { max-width:1320px; }
      .dashboard-head { min-height:78px; margin-bottom:8px; padding:11px 14px; }
      .dashboard-head h2 { font-size:21px; }
      .dashboard-head p { font-size:12px; }
      .system-status { padding:10px 12px; }
      .kpi-card { min-height:56px; padding-top:7px; }
      .kpi-card strong { font-size:22px; }
      .mantto-dashboard-v38 { gap:8px; }
      .chart-card-v38, .compact-card-v38 { min-height:142px; padding:8px 9px; }
      .chart-card-v38.chart-main-v40, .chart-card-v38.chart-side-v40 { min-height:184px; }
      .month-chart-v40 { height:142px; }
      .donut-wrap-v38 { min-height:126px; grid-template-columns:98px minmax(0, 1fr); gap:8px; }
      .donut-v38 { width:98px; height:98px; }
      .donut-v38 > div { width:58px; height:58px; }
      .recent-card-v41 { min-height:142px; max-height:170px; }
      .recent-content-v41 { max-height:108px; }
    }
  `;
  document.head.appendChild(style);
}

function renderDashboard(prefix) {
  if (!state.dashboard) return;
  if (prefix !== "app") return;
  $("dashboardRefreshBtn")?.closest(".form-actions")?.remove();
  const now = new Date();
  if ($("dashboardClock")) $("dashboardClock").textContent = now.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
  const headTitle = document.querySelector("#homeScreen .dashboard-head h2");
  const headText = document.querySelector("#homeScreen .dashboard-head h2 + p");
  if (headTitle) headTitle.textContent = "Gestion de Mantenimiento Industrial";
  if (headText) headText.textContent = "Centro de control de OT, avisos, peticiones y equipos.";
  const metrics = dashboardMetrics();
  const kpis = [
    ["OT abiertas", metrics.otsAbiertas, "blue", "🛠"],
    ["OT cerradas", metrics.otsCerradas, "green", "✅"],
    ["Avisos abiertos", metrics.avisosAbiertos, "yellow", "⚠"],
    ["Peticiones", metrics.peticionesPendientes, "blue", "📦"],
    ["Por calificar", metrics.porCalificar, "green", "⭐"],
    ["Equipos en DB", state.dashboard.equipos || state.catalogos.equipos.length || 0, "blue", "🏭"],
    ["Stock bajo", lowStockRows().length, lowStockRows().length ? "red" : "green", "📦"],
  ];
  $("dashboardKpis").innerHTML = kpis.map(([label, value, tone, icon]) => `
    <article class="kpi-card kpi-${tone} ${label === "Stock bajo" ? "inventory-alert-card" : ""}" data-icon="${escapeHtml(icon)}" ${label === "Stock bajo" ? 'data-open-low-stock="true"' : ""}>
      <span>${escapeHtml(label)}</span>
      <strong>${Number(value)}</strong>
    </article>
  `).join("");
  document.querySelector('[data-open-low-stock="true"]')?.addEventListener("click", () => {
    state.almacenStockFilter = "bajo";
    setView("almacen");
  });
  renderDashboardV38();
}

function isAvisoOpen(row) {
  const estado = normalizeText(row?.estado || "");
  if (!estado) return true;
  return !["atendido", "atendida", "convertido en ot", "cerrado", "cerrada", "cancelado", "cancelada", "eliminado", "eliminada"].includes(estado);
}

function dashboardMetrics() {
  const ots = activeDashboardOts();
  const avisos = state.avisos || [];
  const peticiones = state.peticiones || [];
  const abiertas = ["abierta", "asignada", "pendiente", "creada", "en ejecucion", "en proceso"];
  const cerradas = ["terminada", "cerrada", "calificada"];
  return {
    totalOts: ots.length,
    otsAbiertas: ots.filter((o) => abiertas.includes(normalizeText(o.estado))).length,
    otsCerradas: ots.filter((o) => cerradas.includes(normalizeText(o.estado))).length,
    otsCanceladas: ots.filter((o) => ["cancelada", "eliminada"].includes(normalizeText(o.estado))).length,
    avisosAbiertos: avisos.filter(isAvisoOpen).length,
    avisosCerrados: avisos.filter((a) => !isAvisoOpen(a)).length,
    peticionesPendientes: peticiones.filter((p) => ["pendiente", "pendientes"].includes(normalizeText(p.estado))).length,
    porCalificar: ots.filter((o) => ["terminada", "cerrada"].includes(normalizeText(o.estado)) && !(o.promedio || o.calificacion)).length,
  };
}

function activeDashboardOts() {
  return (state.ots || []).filter((row) => !["cancelada", "cancelado", "eliminada", "eliminado"].includes(normalizeText(row.estado)));
}

function renderDashboardV38() {
  const firstLayout = document.querySelector("#homeScreen .dashboard-layout");
  const chartsRow = document.querySelector("#homeScreen .charts-row");
  if (firstLayout) firstLayout.style.display = "none";
  if (chartsRow) chartsRow.style.display = "none";

  let host = $("dashboardV38");
  if (!host) {
    host = document.createElement("div");
    host.id = "dashboardV38";
    $("dashboardKpis")?.insertAdjacentElement("afterend", host);
  }

  host.innerHTML = `
    <section class="mantto-dashboard-v38">
      <article class="chart-card-v38 chart-main-v40">
        <h3>OT creadas por mes</h3>
        <div id="dashOtMes"></div>
      </article>
      <article class="chart-card-v38 chart-side-v40">
        <h3>Estado de ordenes de trabajo</h3>
        <div id="dashOtEstado"></div>
      </article>
      <article class="chart-card-v38 chart-side-v40">
        <h3>Avisos por estado</h3>
        <div id="dashAvisos"></div>
      </article>
      <article class="chart-card-v38 chart-small-v44">
        <h3>OT por area</h3>
        <div id="dashOtArea"></div>
      </article>
      <article class="chart-card-v38 chart-small-v44">
        <h3>OT por equipo</h3>
        <div id="dashOtEquipo"></div>
      </article>
      <article class="chart-card-v38 chart-small-v44">
        <h3>OT por tipo</h3>
        <div id="dashOtTipo"></div>
      </article>
      <article class="chart-card-v38 chart-small-v44">
        <h3>OT por linea / proceso</h3>
        <div id="dashOtLinea"></div>
      </article>
      <article class="chart-card-v38 chart-small-v44">
        <h3>OT por tecnico</h3>
        <div id="dashOtTecnico"></div>
      </article>
      <article class="compact-card-v38 recent-card-v41">
        <div class="recent-head-v41">
          <h3>Resumen reciente</h3>
          <select id="dashboardRecentSelect" class="recent-select-v41" aria-label="Seleccionar resumen reciente">
            <option value="ot">Ultimas OT</option>
            <option value="avisos">Ultimos avisos</option>
            <option value="actividad">Actividad reciente</option>
          </select>
        </div>
        <div id="dashboardRecentContent" class="recent-content-v41"></div>
      </article>
    </section>
  `;

  const otsActivas = activeDashboardOts();
  renderDonutChart("dashOtEstado", groupRows(otsActivas, (row) => row.estado, "Sin estado"));
  renderMonthBarChart("dashOtMes", groupOtsByMonth(otsActivas));
  renderBarChartRows("dashOtArea", groupRows(otsActivas, (row) => otAreaValue(row), "Sin area"), 6);
  renderBarChartRows("dashOtEquipo", groupRows(otsActivas, (row) => otEquipoValue(row), "Sin equipo"), 6);
  renderBarChartRows("dashOtLinea", groupRows(otsActivas, (row) => otLineaValue(row), "Sin linea"), 6);
  renderBarChartRows("dashOtTipo", groupRows(otsActivas, (row) => row.tipo_intervencion || row.tipo_servicio, "Sin tipo"), 6);
  renderBarChartRows("dashOtTecnico", groupOtsByTechnician(otsActivas), 6);
  renderBarChartRows("dashAvisos", groupRows(state.avisos, (row) => row.estado, "Sin estado"), 5);
  renderDashboardRecentPanel();
}

function renderDashboardRecentPanel() {
  const select = $("dashboardRecentSelect");
  const host = $("dashboardRecentContent");
  if (!select || !host) return;

  const render = () => {
    if (select.value === "avisos") {
      renderCompactAvisosTable("dashboardRecentContent", (state.avisos || []).slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).slice(0, 12));
      return;
    }

    if (select.value === "actividad") {
      renderCompactActivity("dashboardRecentContent", state.dashboard?.actividad || []);
      return;
    }

    renderCompactOtTable("dashboardRecentContent", (state.ots || []).slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).slice(0, 12));
  };

  select.addEventListener("change", render);
  render();
}

function groupRows(rows, valueFn, emptyLabel = "Sin dato") {
  const counts = new Map();
  (rows || []).forEach((row) => {
    const raw = valueFn(row);
    const label = String(raw || "").trim() || emptyLabel;
    const key = normalizeText(label) || normalizeText(emptyLabel);
    const current = counts.get(key) || { label, total: 0 };
    current.total += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function cleanDashboardLabel(value, emptyLabel = "Sin dato") {
  const text = String(value || "").trim();
  if (!text || ["null", "undefined", "none"].includes(text.toLowerCase())) return emptyLabel;
  return text.replace(/\s+/g, " ");
}

function otAreaValue(row) {
  return cleanDashboardLabel(row.ubicacion || row.area || row.sede, "Sin area");
}

function otLineaValue(row) {
  return cleanDashboardLabel(row.proceso || row.sistema || row.linea, "Sin linea");
}

function otEquipoValue(row) {
  return cleanDashboardLabel(row.equipo || row.equipo_codigo || row.codigo, "Sin equipo");
}

function groupOtsByMonth(rows = state.ots || []) {
  const monthNames = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];
  const counts = new Map();
  (rows || []).forEach((row) => {
    const raw = String(row.creado_en || row.fecha_intervencion || "").slice(0, 10);
    const date = raw ? new Date(`${raw}T00:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = `${monthNames[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
    const current = counts.get(key) || { label, total: 0, closed: 0, sort: key };
    current.total += 1;
    if (row.fecha_atencion || row.cerrado_en || ["cerrada", "terminada", "calificada"].includes(normalizeText(row.estado))) current.closed += 1;
    counts.set(key, current);
  });
  return [...counts.values()].sort((a, b) => a.sort.localeCompare(b.sort)).slice(-12);
}

function groupOtsByTechnician(rows = state.ots || []) {
  const counts = new Map();
  (rows || []).forEach((row) => {
    ["tecnico_1", "tecnico_2", "tecnico_3"].forEach((key) => {
      const label = String(row[key] || "").trim();
      if (!label) return;
      const mapKey = normalizeText(label);
      const current = counts.get(mapKey) || { label, total: 0 };
      current.total += 1;
      counts.set(mapKey, current);
    });
  });
  return [...counts.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function bestAvisosChart() {
  const byEstado = groupRows(state.avisos, (row) => row.estado, "Sin estado");
  const byPrioridad = groupRows(state.avisos, (row) => row.prioridad, "Sin prioridad");
  const byTipo = groupRows(state.avisos, (row) => row.tipo_aviso, "Sin tipo");
  return [byEstado, byPrioridad, byTipo].sort((a, b) => filledCategories(b) - filledCategories(a))[0] || [];
}

function bestPeticionesEquiposChart() {
  const peticiones = groupRows(state.peticiones, (row) => row.estado, "Sin estado");
  if (peticiones.length) return peticiones.map((row) => ({ ...row, label: `Pet. ${row.label}` }));
  const equiposPorArea = groupRows(state.catalogos.equipos, (row) => equipoValue(row, "ubicacion") || equipoValue(row, "sede"), "Sin area");
  if (equiposPorArea.length) return equiposPorArea.map((row) => ({ ...row, label: `Eq. ${row.label}` }));
  return [];
}

function filledCategories(rows) {
  return (rows || []).filter((row) => normalizeText(row.label) && !normalizeText(row.label).startsWith("sin ")).length;
}

function renderBarChartRows(id, rows, limit = 12) {
  const host = $(id);
  if (!host) return;
  rows = (rows || []).filter((row) => Number(row.total || 0) >= 0).slice(0, limit);
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row.total || 0)), 1);
  const sum = rows.reduce((acc, row) => acc + Number(row.total || 0), 0) || 1;
  host.innerHTML = `<div class="metric-bars">${rows.map((row) => {
    const total = Number(row.total || 0);
    const width = Math.max(total ? 7 : 0, Math.round((total / max) * 100));
    const percent = Math.round((total / sum) * 100);
    return `<div class="bar-row"><span title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span><div><i style="width:${width}%"></i></div><strong>${total} · ${percent}%</strong></div>`;
  }).join("")}</div>`;
}

function renderMonthBarChart(id, rows) {
  const host = $(id);
  if (!host) return;
  rows = (rows || []).filter((row) => Number(row.total || 0) > 0);
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  const max = Math.max(...rows.flatMap((row) => [Number(row.total || 0), Number(row.closed || 0)]), 1);
  const yValues = [max, Math.ceil(max * 0.75), Math.ceil(max * 0.5), Math.ceil(max * 0.25), 0];
  const hasClosed = rows.some((row) => Number(row.closed || 0) > 0);
  host.innerHTML = `
    <div class="month-chart-v40">
      <div class="month-y-v40">${yValues.map((value) => `<span>${value}</span>`).join("")}</div>
      <div class="month-bars-v40">
        ${rows.map((row) => {
          const created = Number(row.total || 0);
          const closed = Number(row.closed || 0);
          const createdH = Math.max(created ? 8 : 0, Math.round((created / max) * 100));
          const closedH = Math.max(closed ? 8 : 0, Math.round((closed / max) * 100));
          return `
            <div class="month-group-v40" title="${escapeHtml(row.label)}: ${created} creadas${hasClosed ? `, ${closed} cerradas` : ""}">
              <i class="month-bar-v40" style="height:${createdH}%"><small>${created}</small></i>
              ${hasClosed ? `<i class="month-bar-v40 closed" style="height:${closedH}%"><small>${closed}</small></i>` : ""}
            </div>
          `;
        }).join("")}
      </div>
      <div class="month-labels-v40">${rows.map((row) => `<span>${escapeHtml(row.label)}</span>`).join("")}</div>
    </div>
    <div class="month-legend-v40"><span><i></i>OT creadas</span>${hasClosed ? '<span><i class="closed"></i>OT cerradas</span>' : ""}</div>
  `;
}

function renderDonutChart(id, rows) {
  const host = $(id);
  if (!host) return;
  rows = (rows || []).filter((row) => Number(row.total || 0) > 0);
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  const colors = ["#0879C9", "#18A558", "#F4B400", "#D64545", "#0B3B66", "#667581", "#8B5CF6"];
  const total = rows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += (Number(row.total || 0) / total) * 100;
    return `${colors[index % colors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  host.innerHTML = `
    <div class="donut-wrap-v38">
      <div class="donut-v38" style="background:conic-gradient(${stops.join(", ")});"><div><span>Total OT</span><strong>${total}</strong></div></div>
      <div class="legend-v38">
        ${rows.slice(0, 7).map((row, index) => {
          const percent = Math.round((Number(row.total || 0) / total) * 100);
          return `<div><span><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(row.label)}</span><strong>${row.total} · ${percent}%</strong></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderCompactOtTable(id, rows) {
  const host = $(id);
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  host.innerHTML = `
    <table class="compact-table-v38">
      <thead><tr><th>OT</th><th>Fecha</th><th>Area</th><th>Equipo</th><th>Tipo</th><th>Estado</th></tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td>${escapeHtml(row.numero || "")}</td>
        <td>${escapeHtml(String(row.creado_en || row.fecha_intervencion || "").slice(0, 10))}</td>
        <td>${escapeHtml(otAreaValue(row))}</td>
        <td>${escapeHtml(otEquipoValue(row))}</td>
        <td>${escapeHtml(row.tipo_intervencion || row.tipo_servicio || "")}</td>
        <td>${badge(row.estado)}</td>
      </tr>`).join("")}</tbody>
    </table>
  `;
}

function renderCompactAvisosTable(id, rows) {
  const host = $(id);
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  host.innerHTML = `
    <table class="compact-table-v38">
      <thead><tr><th>Aviso</th><th>Fecha</th><th>Area</th><th>Equipo</th><th>Tipo</th><th>Estado</th></tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td>${escapeHtml(row.numero || "")}</td>
        <td>${escapeHtml(String(row.creado_en || "").slice(0, 10))}</td>
        <td>${escapeHtml(cleanDashboardLabel(row.ubicacion || row.sede, ""))}</td>
        <td>${escapeHtml(cleanDashboardLabel(row.equipo || row.equipo_codigo, ""))}</td>
        <td>${escapeHtml(row.tipo_aviso || row.tipo_falla || "")}</td>
        <td>${badge(row.estado || row.prioridad)}</td>
      </tr>`).join("")}</tbody>
    </table>
  `;
}

function renderCompactActivity(id, rows) {
  const host = $(id);
  if (!host) return;
  rows = (rows || []).slice(0, 8);
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">No hay datos disponibles.</p>';
    return;
  }
  host.innerHTML = `<div class="activity-v38">${rows.map((row) => `
    <div><span>${escapeHtml(String(row.creado_en || "").replace("T", " ").slice(11, 16) || "--:--")}</span><strong>● ${escapeHtml(row.accion || "")} ${escapeHtml(row.registro || "")}</strong></div>
  `).join("")}</div>`;
}

function dashboardOtIndicators(metrics) {
  return [
    { label: "Abiertas", total: metrics.otsAbiertas },
    { label: "Cerradas", total: metrics.otsCerradas },
    { label: "Por calificar", total: metrics.porCalificar },
    { label: "Canceladas", total: metrics.otsCanceladas },
  ];
}

function dashboardWorkloadIndicators(metrics) {
  return [
    { label: "Avisos abiertos", total: metrics.avisosAbiertos },
    { label: "Avisos cerrados", total: metrics.avisosCerrados },
    { label: "Peticiones pendientes", total: metrics.peticionesPendientes },
    { label: "Total OT", total: metrics.totalOts },
  ];
}

function relabelDashboardCharts() {
  const chartEstados = $("chartEstados")?.closest(".dashboard-card")?.querySelector("h3");
  const chartAreas = $("chartAreas")?.closest(".dashboard-card")?.querySelector("h3");
  if (chartEstados) chartEstados.textContent = "Indicadores de OT";
  if (chartAreas) chartAreas.textContent = "Carga operativa";
}

function renderMiniList(rows, titleFn, metaFn) {
  if (!rows.length) return '<p class="empty-state">Sin registros recientes.</p>';
  return `<div class="mini-list">${rows.map((row) => `
    <div>
      <strong>${titleFn(row)}</strong>
      <span>${metaFn(row)}</span>
    </div>
  `).join("")}</div>`;
}

function renderBarChart(id, rows, labelKey) {
  const host = $(id);
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = '<p class="empty-state">Sin datos para graficar.</p>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row.total || 0)), 1);
  const sum = rows.reduce((acc, row) => acc + Number(row.total || 0), 0) || 1;
  host.innerHTML = rows.map((row) => {
    const total = Number(row.total || 0);
    const width = Math.max(8, Math.round((total / max) * 100));
    const percent = Math.round((total / sum) * 100);
    return `<div class="bar-row"><span>${escapeHtml(row[labelKey] || "Sin dato")}</span><div><i style="width:${width}%"></i></div><strong>${total} · ${percent}%</strong></div>`;
  }).join("");
}

function renderDashboardChart(id, rows) {
  const host = $(id);
  if (!host) return;
  const max = Math.max(...rows.map((row) => Number(row.total || 0)), 1);
  const sum = rows.reduce((acc, row) => acc + Number(row.total || 0), 0) || 1;
  host.innerHTML = `
    <div class="metric-bars">
      ${rows.map((row) => {
        const total = Number(row.total || 0);
        const width = Math.max(total ? 8 : 0, Math.round((total / max) * 100));
        const percent = Math.round((total / sum) * 100);
        return `
          <div class="bar-row">
            <span>${escapeHtml(row.label)}</span>
            <div><i style="width:${width}%"></i></div>
            <strong>${total} · ${percent}%</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function avisoImagenes(aviso) {
  const raw = aviso?.imagenes;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((img) => img && img.url);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((img) => img && img.url) : [];
  } catch (err) {
    return [];
  }
}

function avisoImagenesHtml(aviso) {
  const imagenes = avisoImagenes(aviso);
  if (!imagenes.length) return '<p class="empty-state aviso-empty-images">Sin fotos registradas.</p>';
  return `
    <div class="aviso-image-gallery">
      ${imagenes.map((img, index) => `
        <a href="${escapeHtml(img.url)}" target="_blank" rel="noopener" title="${escapeHtml(img.nombre || `Foto ${index + 1}`)}">
          <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.nombre || `Foto ${index + 1}`)}">
          <span>${escapeHtml(img.nombre || `Foto ${index + 1}`)}</span>
        </a>
      `).join("")}
    </div>
  `;
}

function badge(value) {
  const text = String(value || "").toLowerCase();
  let className = "badge-blue";
  if (["alta", "urgente", "critico", "crítico", "cancelada", "vencida"].includes(text)) className = "badge-red";
  if (["media", "pendiente", "en proceso", "en ejecucion", "creada", "abierta", "asignada"].includes(text)) className = "badge-yellow";
  if (["baja", "atendido", "atendida", "terminada", "cerrada", "calificada", "convertido en ot"].includes(text)) className = "badge-green";
  return `<span class="badge ${className}">${escapeHtml(value || "")}</span>`;
}

function otStatusBadge(row) {
  const estado = String(row?.estado || "").toUpperCase();
  if (row?.promedio || row?.calificacion) return '<span class="badge badge-green">⭐ CALIFICADA</span>';
  if (estado === "CERRADA") return '<span class="badge badge-green">🟢 CERRADA</span>';
  if (["EN EJECUCION", "EN PROCESO"].includes(estado)) return `<span class="badge badge-blue">🔵 ${escapeHtml(row.estado)}</span>`;
  if (["ABIERTA", "ASIGNADA", "PENDIENTE", "CREADA"].includes(estado)) return `<span class="badge badge-yellow">🟡 ${escapeHtml(row.estado)}</span>`;
  return badge(row?.estado || "");
}

function renderTable(rows, columns, actions = () => "") {
  if (!rows.length) return "<p>No hay registros.</p>";
  const hasActions = typeof actions === "function";
  return `
    <table>
      <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}${hasActions ? "<th>Acciones</th>" : ""}</tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map((c) => `<td>${c.render ? c.render(row) : escapeHtml(row[c.key] || "")}</td>`).join("")}
            ${hasActions ? `<td><div class="row-actions">${actions(row)}</div></td>` : ""}
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function renderPeticiones() {
  ensurePeticionCatalogHost();
  const host = $("peticionCatalogHost") || $("peticionesPendientes") || $("peticion")?.querySelector(".table-wrap");
  if (!host) return;
  host.innerHTML = `
    <div class="peticion-wms-layout-v65">
      <section class="peticion-catalog-v65">
        <div class="catalog-search-v46">
          <label>🔎 Buscar material por descripcion o codigo
            <input id="peticionMaterialSearch" type="search" placeholder="Ejemplo: rodamiento, faja, grasa..." value="${escapeHtml(state.peticionSearch)}">
          </label>
        </div>
        <div class="catalog-results-v46">
          ${renderPeticionGroupedResults()}
        </div>
      </section>
      <aside class="cart-v46">
        <h3>🛒 Mi peticion</h3>
        <label>Criticidad del pedido (opcional)
          <select id="peticionCriticidad">
            <option value="">Sin criticidad</option>
            <option value="BAJA" ${state.peticionCriticidad === "BAJA" ? "selected" : ""}>BAJA</option>
            <option value="MEDIA" ${state.peticionCriticidad === "MEDIA" ? "selected" : ""}>MEDIA</option>
            <option value="ALTA" ${state.peticionCriticidad === "ALTA" ? "selected" : ""}>ALTA</option>
            <option value="URGENTE" ${state.peticionCriticidad === "URGENTE" ? "selected" : ""}>URGENTE</option>
          </select>
        </label>
        <div id="peticionCartRows">${renderPeticionCartRows()}</div>
        <div class="form-actions">
          <button class="secondary" type="button" onclick="vaciarPeticionCart()">Vaciar</button>
          <button class="primary" type="button" onclick="generarPeticionCarrito()">📤 Generar peticion</button>
        </div>
      </aside>
    </div>
  `;
  $("peticionMaterialSearch")?.addEventListener("input", (event) => {
    state.peticionSearch = event.target.value;
    renderPeticionSearchResults();
  });
  $("peticionCriticidad")?.addEventListener("change", (event) => {
    state.peticionCriticidad = event.target.value;
  });
}

function renderPeticionSearchResults() {
  const results = document.querySelector("#peticionCatalogHost .catalog-results-v46");
  if (!results) return;
  results.innerHTML = renderPeticionGroupedResults();
}

function peticionFilteredRows(limit = 220) {
  const q = normalizeText(state.peticionSearch || "");
  return inventoryRows()
    .filter((row) => {
      const haystack = [
        itemValue(row, "descripcion"),
        itemValue(row, "codigo"),
        row.categoria_virtual,
        itemValue(row, "categoria"),
        itemValue(row, "modelo"),
        itemValue(row, "ubicacion"),
      ].map(normalizeText).join(" ");
      return !q || haystack.includes(q);
    })
    .slice(0, limit);
}

function renderPeticionGroupedResults() {
  const rows = peticionFilteredRows();
  if (!rows.length) return '<p class="empty-state">No hay materiales disponibles con esa busqueda.</p>';
  const groups = new Map();
  rows.forEach((row) => {
    const categoria = row.categoria_virtual || categorizarRepuesto(row) || "Sin categorizar";
    if (!groups.has(categoria)) groups.set(categoria, []);
    groups.get(categoria).push(row);
  });
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  if (state.peticionCategoriaAbierta) {
    const selectedEntry = entries.find(([categoria]) => categoriaByName(categoria).id === state.peticionCategoriaAbierta);
    if (selectedEntry) {
      const [categoria, items] = selectedEntry;
      const meta = categoriaByName(categoria);
      return `
        <div class="peticion-category-open-view">
          <div class="peticion-category-open-head">
            <button class="secondary" type="button" onclick="togglePeticionCategoria('')">← Ver categorias</button>
            <span class="category-image category-image-large" style="background-image:url('${escapeHtml(meta.imagen)}')"><i>${escapeHtml(meta.icono)}</i></span>
            <div>
              <h3>${escapeHtml(categoria)}</h3>
              <p>${items.length.toLocaleString("es-PE")} material(es) disponible(s)</p>
              <small>Seleccione cantidad y agregue a su peticion.</small>
            </div>
          </div>
          <div class="peticion-category-list-open">
            ${items.map(renderMaterialListRow).join("")}
          </div>
        </div>
      `;
    }
  }
  const ordered = entries
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .map(([categoria, items]) => {
      const meta = categoriaByName(categoria);
      return `
        <section class="peticion-category-group peticion-category-block">
          <button class="peticion-category-cover" type="button" onclick="togglePeticionCategoria('${escapeJs(meta.id)}')">
            <span class="category-image category-image-large" style="background-image:url('${escapeHtml(meta.imagen)}')"><i>${escapeHtml(meta.icono)}</i></span>
            <div>
              <h3>${escapeHtml(categoria)}</h3>
              <p>${items.length.toLocaleString("es-PE")} material(es) disponible(s)</p>
              <small>Ver materiales</small>
            </div>
          </button>
        </section>
      `;
    }).join("");
  return `<div class="peticion-category-grid-large">${ordered}</div>`;
}

function togglePeticionCategoria(categoriaId) {
  state.peticionCategoriaAbierta = categoriaId || "";
  renderPeticionSearchResults();
}

function renderMaterialListRow(row) {
  const id = itemIdentity(row);
  const stock = inventoryNumber(row, "cantidad");
  const unidad = itemValue(row, "unidad");
  const status = inventoryStatus(row);
  return `
    <article class="peticion-material-row">
      <div class="peticion-material-main">
        <strong>${escapeHtml(itemValue(row, "descripcion") || "Sin descripcion")}</strong>
        <span>Codigo: ${escapeHtml(itemValue(row, "codigo") || "-")} · Modelo: ${escapeHtml(itemValue(row, "modelo") || "-")} · Ubicacion: ${escapeHtml(itemValue(row, "ubicacion") || "-")}</span>
      </div>
      <div class="peticion-material-stock">
        <span>Stock</span>
        <strong>${stock.toLocaleString("es-PE")} ${escapeHtml(unidad)}</strong>
        <small class="${status.className}">${escapeHtml(status.label)}</small>
      </div>
      <div class="qty-control-v46 peticion-material-qty">
        <button type="button" onclick="stepMaterialQty('${escapeJs(id)}', -1)">−</button>
        <input id="qty-${cssSafeId(id)}" type="number" min="1" max="${escapeHtml(stock)}" value="1">
        <button type="button" onclick="stepMaterialQty('${escapeJs(id)}', 1)">+</button>
      </div>
      <button class="primary peticion-material-add" type="button" onclick="agregarMaterialPeticion('${escapeJs(id)}')">Agregar</button>
    </article>
  `;
}

function renderMaterialCard(row) {
  const id = itemIdentity(row);
  const stock = inventoryNumber(row, "cantidad");
  const unidad = itemValue(row, "unidad");
  const status = inventoryStatus(row);
  return `
    <article class="item-card-v46">
      <h4>${escapeHtml(itemValue(row, "descripcion") || "Sin descripcion")}</h4>
      <small>Codigo: ${escapeHtml(itemValue(row, "codigo") || "-")} · ${escapeHtml(row._tipo || "")}</small>
      <small>Stock disponible: <strong>${stock.toLocaleString("es-PE")} ${escapeHtml(unidad)}</strong></small>
      <small class="${status.className}">${escapeHtml(status.label)}</small>
      <div class="qty-control-v46">
        <button type="button" onclick="stepMaterialQty('${escapeJs(id)}', -1)">−</button>
        <input id="qty-${cssSafeId(id)}" type="number" min="1" max="${escapeHtml(stock)}" value="1">
        <button type="button" onclick="stepMaterialQty('${escapeJs(id)}', 1)">+</button>
      </div>
      <button class="primary" type="button" onclick="agregarMaterialPeticion('${escapeJs(id)}')">🛒 Agregar</button>
    </article>
  `;
}

function cssSafeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function findInventoryItem(id) {
  return inventoryRows().find((row) => itemIdentity(row) === id);
}

function stepMaterialQty(id, delta) {
  const item = findInventoryItem(id);
  const input = $(`qty-${cssSafeId(id)}`);
  if (!item || !input) return;
  const stock = inventoryNumber(item, "cantidad");
  const next = Math.min(Math.max(Number(input.value || 1) + delta, 1), Math.max(stock, 1));
  input.value = next;
}

function agregarMaterialPeticion(id) {
  const item = findInventoryItem(id);
  const input = $(`qty-${cssSafeId(id)}`);
  if (!item || !input) return;
  const stock = inventoryNumber(item, "cantidad");
  const cantidad = Number(input.value || 0);
  if (!cantidad || cantidad <= 0) return toast("Ingrese una cantidad mayor a cero", "warning");
  if (cantidad > stock) return toast(`Stock insuficiente. Disponible: ${stock}`, "warning");
  const existing = state.peticionCart.find((row) => row.id === id);
  if (existing) {
    const next = existing.cantidad + cantidad;
    if (next > stock) return toast(`No puede superar el stock disponible: ${stock}`, "warning");
    existing.cantidad = next;
  } else {
    state.peticionCart.push({
      id,
      tabla: item._tabla,
      item_id: item.id || null,
      codigo: itemValue(item, "codigo"),
      descripcion: itemValue(item, "descripcion"),
      unidad: itemValue(item, "unidad"),
      stock,
      cantidad,
    });
  }
  renderPeticiones();
}

function renderPeticionCartRows() {
  if (!state.peticionCart.length) return '<p class="empty-state">Agregue materiales a la peticion.</p>';
  return state.peticionCart.map((row) => `
    <div class="cart-row-v46">
      <div><strong>${escapeHtml(row.descripcion || row.codigo)}</strong><span>${escapeHtml(row.codigo)} · ${escapeHtml(row.unidad)}</span></div>
      <input type="number" min="1" max="${escapeHtml(row.stock)}" value="${escapeHtml(row.cantidad)}" onchange="actualizarCantidadCarrito('${escapeJs(row.id)}', this.value)">
      <button class="danger" type="button" onclick="eliminarMaterialCarrito('${escapeJs(row.id)}')">🗑</button>
    </div>
  `).join("") + `<p class="muted">Total de items: ${state.peticionCart.length}</p>`;
}

function actualizarCantidadCarrito(id, value) {
  const item = state.peticionCart.find((row) => row.id === id);
  if (!item) return;
  const qty = Number(value || 0);
  if (!qty || qty <= 0) return toast("Cantidad invalida", "warning");
  if (qty > item.stock) return toast(`Stock insuficiente. Disponible: ${item.stock}`, "warning");
  item.cantidad = qty;
  renderPeticiones();
}

function eliminarMaterialCarrito(id) {
  state.peticionCart = state.peticionCart.filter((row) => row.id !== id);
  renderPeticiones();
}

function vaciarPeticionCart() {
  state.peticionCart = [];
  renderPeticiones();
}

async function generarPeticionCarrito() {
  if (!state.peticionCart.length) return toast("Agregue materiales al carrito", "warning");
  const ok = await pedirConfirmacion(
    "Generar peticion de materiales",
    `<p>Se registrara una peticion PENDIENTE con ${state.peticionCart.length} item(s). No se descontara stock hasta marcar salida.</p>`,
    "📤 Generar peticion"
  );
  if (!ok) return;
  try {
    const result = await api("/api/peticiones-carrito", {
      method: "POST",
      body: JSON.stringify({ items: state.peticionCart, criticidad: state.peticionCriticidad || "" }),
    });
    confirmar("Peticion generada correctamente", `Codigo: ${result.numero || "registrado"} · Estado: PENDIENTE`);
    toast("Peticion generada correctamente", "success");
    state.peticionCart = [];
    await refreshAfterMutation();
    renderPeticiones();
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderAvisos() {
  const pendientes = state.avisos.filter((a) => !["ATENDIDO", "ATENDIDA", "CONVERTIDO EN OT", "CERRADO", "CANCELADO", "ELIMINADO"].includes(String(a.estado || "").toUpperCase()));
  $("avisosPendientes").innerHTML = renderTable(
    pendientes,
    [
      { key: "numero", label: "Nro" },
      { key: "creado_en", label: "Fecha" },
      { key: "ubicacion", label: "Ubicacion" },
      { key: "equipo", label: "Equipo" },
      { key: "prioridad", label: "Prioridad", render: (row) => badge(row.prioridad) },
      { key: "estado", label: "Estado", render: (row) => badge(row.estado) },
      { key: "tipo_falla", label: "Falla" },
      { key: "tipo_aviso", label: "Aviso" },
      { key: "usuario", label: "Usuario" },
    ],
    (row) => `
      <button onclick="verAviso('${row.numero}')">👁 Ver</button>
      <button class="primary" onclick="abrirAtencionAviso('${row.numero}')">🔧 Atender</button>
      <button class="danger" onclick="eliminarAviso('${row.numero}')">🗑 Eliminar</button>
    `
  );
}

function renderAtenderAviso() {
  const host = $("atenderAvisoTable");
  if (!host) return;
  const pendientes = (state.avisos || [])
    .filter(isAvisoOpen)
    .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
  host.innerHTML = renderTable(
    pendientes,
    [
      { key: "numero", label: "Codigo aviso" },
      { key: "creado_en", label: "Fecha", render: (row) => escapeHtml(String(row.creado_en || "").slice(0, 10)) },
      { key: "hora", label: "Hora", render: (row) => escapeHtml(String(row.creado_en || "").replace("T", " ").slice(11, 16)) },
      { key: "sede", label: "Sede" },
      { key: "ubicacion", label: "Ubicacion" },
      { key: "area", label: "Area", render: (row) => escapeHtml(row.area || row.ubicacion || "") },
      { key: "proceso", label: "Proceso" },
      { key: "sistema", label: "Sistema" },
      { key: "descripcion", label: "Descripcion", render: (row) => escapeHtml(String(row.descripcion || "").slice(0, 90)) },
      { key: "prioridad", label: "Prioridad", render: (row) => badge(row.prioridad) },
      { key: "estado", label: "Estado", render: (row) => badge(row.estado || "ABIERTO") },
    ],
    (row) => `
      <button type="button" onclick="verDetalleAvisoAtender('${escapeJs(row.numero)}')">👁 Ver detalle</button>
      <button class="primary" type="button" onclick="abrirAtencionAviso('${escapeJs(row.numero)}')">🔧 Atender</button>
      <button class="danger" type="button" onclick="eliminarAviso('${escapeJs(row.numero)}')">🗑 Eliminar</button>
    `
  );
}

function avisoDetailHtml(aviso) {
  return `
    <dl class="detail-grid">
      <dt>Codigo de aviso</dt><dd><strong>${escapeHtml(aviso.numero || "-")}</strong></dd>
      <dt>Fecha</dt><dd>${escapeHtml(String(aviso.creado_en || "").replace("T", " ").slice(0, 16) || "-")}</dd>
      <dt>Solicitante</dt><dd>${escapeHtml(aviso.usuario || aviso.creado || "-")}</dd>
      <dt>Sede</dt><dd>${escapeHtml(aviso.sede || "-")}</dd>
      <dt>Ubicacion</dt><dd>${escapeHtml(aviso.ubicacion || "-")}</dd>
      <dt>Area</dt><dd>${escapeHtml(aviso.area || aviso.ubicacion || "-")}</dd>
      <dt>Proceso</dt><dd>${escapeHtml(aviso.proceso || "-")}</dd>
      <dt>Sistema</dt><dd>${escapeHtml(aviso.sistema || "-")}</dd>
      <dt>Equipo</dt><dd>${escapeHtml(aviso.equipo || "-")}</dd>
      <dt>Codigo equipo</dt><dd>${escapeHtml(aviso.equipo_codigo || "-")}</dd>
      <dt>Sub-equipo</dt><dd>${escapeHtml(aviso.sub_equipo || "-")}</dd>
      <dt>Descripcion de la falla</dt><dd>${escapeHtml(aviso.descripcion_falla || aviso.descripcion || "-")}</dd>
      <dt>Trabajo realizado</dt><dd>${escapeHtml(aviso.trabajo_realizado || "-")}</dd>
      <dt>Observacion</dt><dd>${escapeHtml(aviso.observaciones || aviso.observacion || "-")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(aviso.descripcion || "-")}</dd>
      <dt>Prioridad</dt><dd>${badge(aviso.prioridad || "-")}</dd>
      <dt>Estado</dt><dd>${badge(aviso.estado || "ABIERTO")}</dd>
    </dl>
    <div class="aviso-images-panel">
      <h4>Fotos del aviso</h4>
      ${avisoImagenesHtml(aviso)}
    </div>
  `;
}

async function verDetalleAvisoAtender(numero) {
  const aviso = state.avisos.find((row) => row.numero === numero);
  if (!aviso) return;
  await pedirConfirmacion(`Detalle ${numero}`, avisoDetailHtml(aviso), "Cerrar");
}

function abrirAtencionAviso(numero) {
  const aviso = state.avisos.find((row) => row.numero === numero);
  if (!aviso) return;
  state.selectedAtenderAviso = aviso;
  const box = $("atenderAvisoBox");
  const hoy = new Date().toISOString().slice(0, 10);
  const rows = matchingEquipmentForAviso(aviso);
  const hasSpecific = avisoHasSpecificEquipment(aviso);
  const defaults = hasSpecific
    ? {
        equipo: aviso.equipo || "",
        tipo_equipo: aviso.tipo_equipo || "",
        equipo_codigo: aviso.equipo_codigo || "",
        sub_equipo: aviso.sub_equipo || "",
      }
    : { equipo: "", tipo_equipo: "", equipo_codigo: "", sub_equipo: "" };
  box.innerHTML = `
    <div class="detail-modal-v46">
      <h3>🔧 Atender aviso ${escapeHtml(numero)}</h3>
      <form id="atenderAvisoForm" class="form-grid">
        <div class="form-block span-full">
          <h3>Datos del aviso</h3>
          <dl class="detail-grid">
            <dt>Codigo aviso</dt><dd><strong>${escapeHtml(aviso.numero || "-")}</strong></dd>
            <dt>Fecha</dt><dd>${escapeHtml(String(aviso.creado_en || "").replace("T", " ").slice(0, 16) || "-")}</dd>
            <dt>Estado</dt><dd>${badge(aviso.estado || "ABIERTO")}</dd>
            <dt>Solicitante</dt><dd>${escapeHtml(aviso.usuario || aviso.creado || "-")}</dd>
          </dl>
          <div class="aviso-images-panel">
            <h4>Fotos del aviso</h4>
            ${avisoImagenesHtml(aviso)}
          </div>
        </div>
        <div class="form-block span-full">
          <h3>Ubicacion del activo</h3>
          <div class="form-block-grid">
            <label>Sede<input name="sede" value="${escapeHtml(aviso.sede || "")}" required readonly></label>
            <label>Ubicacion<input name="ubicacion" value="${escapeHtml(aviso.ubicacion || "")}" required readonly></label>
            <label>Proceso<input name="proceso" value="${escapeHtml(aviso.proceso || "")}" required readonly></label>
            <label>Sistema<input name="sistema" value="${escapeHtml(aviso.sistema || "")}" required readonly></label>
          </div>
        </div>
        <div class="form-block span-full">
          <h3>Activo</h3>
          <p class="muted">Si el aviso fue creado por filtros, complete Equipo, Tipo equipo y Sub-equipo con los combos filtrados por la ubicacion del aviso.</p>
          <div class="form-block-grid">
            <label>Equipo<select name="equipo" required></select></label>
            <label>Tipo equipo<select name="tipo_equipo" required></select></label>
            <label>Sub-equipo<select name="sub_equipo" required></select></label>
            <label>Codigo equipo<select name="equipo_codigo"></select></label>
            <input type="hidden" name="componente" value="">
          </div>
        </div>
        <label>Tecnico/persona que atiende<select name="tecnico" data-tecnico-select required></select></label>
        <label>Fecha de atencion<input name="fecha_atencion" type="date" value="${escapeHtml(hoy)}" required></label>
        <label>Hora inicio<input name="hora_inicio" type="time" required></label>
        <label>Hora termino<input name="hora_fin" type="time" required></label>
        <label>Tipo de intervencion<select name="tipo_intervencion" required>${otSelectOptions("tipo_intervencion", aviso.tipo_intervencion || "")}</select></label>
        <label>Tipo de falla<select name="tipo_falla" required>${otSelectOptions("tipo_falla", aviso.tipo_falla || "")}</select></label>
        <label>Estado de atencion<select name="estado" required><option>ATENDIDO</option><option>ATENDIENDO</option><option>CERRADO</option></select></label>
        <label class="span-2">Descripcion de la falla<textarea name="descripcion_falla" required>${escapeHtml(aviso.descripcion_falla || aviso.descripcion || "")}</textarea></label>
        <label class="span-2">Trabajo realizado<textarea name="trabajo_realizado" required></textarea></label>
        <label class="span-2">Observacion<textarea name="observacion"></textarea></label>
        <div class="form-actions span-full">
          <button class="secondary" type="button" onclick="$('atenderAvisoBox').classList.add('hidden')">Cancelar</button>
          <button class="primary" type="submit">🔧 Guardar atencion</button>
        </div>
      </form>
    </div>
  `;
  const form = $("atenderAvisoForm");
  const refreshCascade = () => renderAssetCascadeCombos(form, rows, {}, refreshCascade);
  renderAssetCascadeCombos(form, rows, defaults, refreshCascade);
  fillTechnicianSelects();
  bindRequiredIndicators(box);
  form.addEventListener("submit", guardarAtencionAviso);
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function guardarAtencionAviso(event) {
  event.preventDefault();
  if (!state.selectedAtenderAviso) return;
  if (!validateRequiredForm(event.target)) return;
  const data = formData(event.target);
  try {
    await api(`/api/avisos/${encodeURIComponent(state.selectedAtenderAviso.numero)}/atencion`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    toast("Aviso atendido correctamente", "success");
    confirmar("Atencion registrada", `Aviso ${state.selectedAtenderAviso.numero} actualizado.`);
    state.selectedAtenderAviso = null;
    $("atenderAvisoBox").classList.add("hidden");
    await refreshAfterMutation();
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderOtsPendientes() {
  const filters = getCerrarOtFilters();
  const abiertasBase = state.ots
    .filter((o) => ["ABIERTA", "ASIGNADA", "PENDIENTE", "CREADA", "EN EJECUCION", "EN PROCESO"].includes(String(o.estado || "").toUpperCase()));
  const pendientes = filterOtRows(abiertasBase, filters, false)
    .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
  const summary = $("cerrarOtSummary");
  if (summary) {
    const enEjecucion = abiertasBase.filter((o) => ["EN EJECUCION", "EN PROCESO"].includes(String(o.estado || "").toUpperCase())).length;
    const abiertas = abiertasBase.filter((o) => ["ABIERTA", "ASIGNADA", "PENDIENTE", "CREADA"].includes(String(o.estado || "").toUpperCase())).length;
    summary.innerHTML = `
      <div class="closing-summary-card"><strong>${abiertasBase.length}</strong><span>OT pendientes de cierre</span></div>
      <div class="closing-summary-card"><strong>${abiertas}</strong><span>Abiertas / asignadas</span></div>
      <div class="closing-summary-card"><strong>${enEjecucion}</strong><span>En ejecucion</span></div>
    `;
  }
  if (!pendientes.length) {
    $("otsPendientes").innerHTML = '<p class="empty-state">No hay OT pendientes de cierre con los filtros actuales.</p>';
    return;
  }
  $("otsPendientes").innerHTML = renderTable(
    pendientes,
    [
      { key: "numero", label: "OT" },
      { key: "creado_en", label: "Fecha", render: (row) => escapeHtml(String(row.creado_en || "").slice(0, 10)) },
      { key: "ubicacion", label: "Area" },
      { key: "equipo", label: "Equipo" },
      { key: "estado", label: "Estado", render: (row) => otStatusBadge(row) },
    ],
    (row) => `
  <button class="secondary" onclick="prepararAtenderOt('${escapeJs(row.numero)}')">👁 Ver detalle</button>
  <button class="primary action-strong" onclick="cerrarOtDirecta('${escapeJs(row.numero)}')">🔒 Cerrar OT</button>
  <button class="danger" onclick="eliminarOtCalificar('${escapeJs(row.numero)}')">🗑 Eliminar</button>
`
  );
}

function renderCalificarOt() {
  const host = $("calificarOtTable");
  if (!host) return;
  const filters = getCalificarOtFilters();
  // Calificar OT es una pantalla independiente: aqui solo se listan ordenes de trabajo.
  // Avisos, peticiones y documentos historicos pertenecen a sus propios modulos.
  const rows = filterOtRows(state.ots, filters, false)
    .filter((row) => !["CANCELADA", "ELIMINADA"].includes(String(row.estado || "").toUpperCase()))
    .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
  host.innerHTML = renderTable(
    rows,
    [
      { key: "numero", label: "OT" },
      { key: "creado_en", label: "Fecha", render: (row) => escapeHtml(String(row.creado_en || "").slice(0, 10)) },
      { key: "ubicacion", label: "Area" },
      { key: "equipo", label: "Equipo" },
      { key: "estado", label: "Estado", render: (row) => otStatusBadge(row) },
      { key: "tecnico_1", label: "Personal asignado" },
      { key: "calificacion", label: "Calificacion", render: (row) => row.promedio || row.calificacion ? '<span class="badge badge-green">⭐ CALIFICADA</span>' : '<span class="badge badge-yellow">Sin calificar</span>' },
    ],
    (row) => {
      const estado = String(row.estado || "").toUpperCase();
      const calificada = Boolean(row.promedio || row.calificacion || estado === "CALIFICADA");
      const puedeCalificar = estado === "CERRADA" && !calificada;
      const textoAccion = calificada ? "✓ Ver calificacion" : puedeCalificar ? "⭐ Calificar" : "🔒 Calificar";
      return `
        <button onclick="verOt('${row.numero}')">👁 Ver detalle</button>
        <button class="primary action-strong" ${puedeCalificar || calificada ? "" : "disabled aria-disabled=\"true\""} onclick="abrirCalificacion('${row.numero}')">${textoAccion}</button>
        <button class="danger" onclick="eliminarOtCalificar('${row.numero}')">🗑 Eliminar</button>
      `;
    }
  );
}

function getHistorialFilters() {
  return $("historialFilters") ? formData($("historialFilters")) : {};
}

function getCalificarOtFilters() {
  return $("calificarOtFilters") ? formData($("calificarOtFilters")) : {};
}

function getCerrarOtFilters() {
  return $("cerrarOtFilters") ? formData($("cerrarOtFilters")) : {};
}

function getCalificacionesFilters() {
  return $("calificacionesFilters") ? formData($("calificacionesFilters")) : {};
}

function filterOtRows(rows, filters, onlyOpen = false) {
  let result = [...rows];
  if (onlyOpen) result = result.filter((o) => ["ABIERTA", "ASIGNADA", "PENDIENTE", "CREADA", "EN EJECUCION", "EN PROCESO"].includes(String(o.estado || "").toUpperCase()));
  if (filters.desde) result = result.filter((o) => String(o.creado_en || "").slice(0, 10) >= filters.desde);
  if (filters.hasta) result = result.filter((o) => String(o.creado_en || "").slice(0, 10) <= filters.hasta);
  if (filters.estado) result = result.filter((o) => String(o.estado || "").toUpperCase() === String(filters.estado || "").toUpperCase());
  if (filters.sede) result = result.filter((o) => o.sede === filters.sede);
  if (filters.tecnico) result = result.filter((o) => `${o.tecnico_1 || ""} ${o.tecnico_2 || ""}`.toLowerCase().includes(filters.tecnico.toLowerCase()));
  if (filters.equipo) result = result.filter((o) => String(o.equipo || "").toLowerCase().includes(filters.equipo.toLowerCase()));
  if (filters.codigo) result = result.filter((o) => String(o.equipo_codigo || "").toLowerCase().includes(filters.codigo.toLowerCase()));
  if (filters.numero) result = result.filter((o) => String(o.numero || "").toLowerCase().includes(filters.numero.toLowerCase()));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    result = result.filter((o) => [o.numero, o.ubicacion, o.sede, o.equipo, o.equipo_codigo].some((value) => String(value || "").toLowerCase().includes(q)));
  }
  if (filters.prioridad) result = result.filter((o) => String(o.tipo_falla || "").toLowerCase().includes(filters.prioridad.toLowerCase()));
  if (filters.tipo_mantenimiento) result = result.filter((o) => String(o.tipo_intervencion || o.tipo_servicio || "").toLowerCase().includes(filters.tipo_mantenimiento.toLowerCase()));
  return result;
}

function filterCalificacionRows(rows, filters) {
  let result = [...rows];
  if (filters.desde) result = result.filter((r) => String(r.fecha || "").slice(0, 10) >= filters.desde);
  if (filters.hasta) result = result.filter((r) => String(r.fecha || "").slice(0, 10) <= filters.hasta);
  if (filters.numero) result = result.filter((r) => String(r.ot_numero || "").toLowerCase().includes(filters.numero.toLowerCase()));
  if (filters.area) result = result.filter((r) => String(r.ubicacion || r.sede || "").toLowerCase().includes(filters.area.toLowerCase()));
  if (filters.usuario) result = result.filter((r) => String(r.usuario || "").toLowerCase().includes(filters.usuario.toLowerCase()));
  if (filters.minimo) result = result.filter((r) => Number(r.promedio || r.calificacion || 0) >= Number(filters.minimo));
  return result;
}

function filterAvisoRows(rows, filters) {
  let result = rows.filter((a) => !["ATENDIDO", "ATENDIDA", "CONVERTIDO EN OT", "CERRADO", "CANCELADO", "ELIMINADO"].includes(String(a.estado || "").toUpperCase()));
  if (filters.desde) result = result.filter((a) => String(a.creado_en || "").slice(0, 10) >= filters.desde);
  if (filters.hasta) result = result.filter((a) => String(a.creado_en || "").slice(0, 10) <= filters.hasta);
  if (filters.estado) result = result.filter((a) => String(a.estado || "").toUpperCase() === String(filters.estado || "").toUpperCase());
  if (filters.sede) result = result.filter((a) => a.sede === filters.sede);
  if (filters.equipo) result = result.filter((a) => String(a.equipo || "").toLowerCase().includes(filters.equipo.toLowerCase()));
  if (filters.codigo) result = result.filter((a) => String(a.equipo_codigo || "").toLowerCase().includes(filters.codigo.toLowerCase()));
  if (filters.numero) result = result.filter((a) => String(a.numero || "").toLowerCase().includes(filters.numero.toLowerCase()));
  if (filters.prioridad) result = result.filter((a) => String(a.prioridad || "").toLowerCase().includes(filters.prioridad.toLowerCase()));
  return result;
}

function renderSeguimientoCalificar() {
  const host = $("seguimientoTable");
  if (!host) return;
  const filters = getHistorialFilters();
  const otRows = filterOtRows(state.ots, filters, true).map((row) => ({ ...row, tipo_registro: "OT", fecha_registro: row.creado_en, area_registro: row.ubicacion, prioridad_registro: row.tipo_falla }));
  const avisoRows = filterAvisoRows(state.avisos, filters).map((row) => ({ ...row, tipo_registro: "AVISO", numero: row.numero, fecha_registro: row.creado_en, area_registro: row.ubicacion, equipo_codigo: row.equipo_codigo, prioridad_registro: row.prioridad }));
  const rows = [...otRows, ...avisoRows].sort((a, b) => String(b.fecha_registro || "").localeCompare(String(a.fecha_registro || "")));
  host.innerHTML = renderTable(
    rows,
    [
      { key: "tipo_registro", label: "Tipo", render: (row) => badge(row.tipo_registro) },
      { key: "numero", label: "Numero" },
      { key: "fecha_registro", label: "Fecha", render: (row) => escapeHtml(String(row.fecha_registro || "").slice(0, 10)) },
      { key: "area_registro", label: "Area" },
      { key: "equipo", label: "Equipo" },
      { key: "prioridad_registro", label: "Prioridad", render: (row) => badge(row.prioridad_registro) },
      { key: "estado", label: "Estado", render: (row) => badge(row.estado) },
    ],
    (row) => row.tipo_registro === "AVISO"
      ? `<button onclick="verAviso('${row.numero}')">👁 Ver</button><button class="primary" onclick="abrirAtencionAviso('${row.numero}')">🔧 Atender</button>`
      : `<button onclick="verOt('${row.numero}')">👁 Ver</button>`
  );
}

function renderHistorialOt() {
  const host = $("historialOtTable");
  if (!host) return;
  prepareHistorialOtToolbar();
  const filters = getHistorialFilters();
  let rows = filterOtRows(state.ots, filters, false)
  .filter((row) => !["CANCELADA", "ELIMINADA"].includes(String(row.estado || "").toUpperCase()));
  const visibleNumbers = new Set(rows.map((row) => row.numero).filter(Boolean));
  state.selectedBulkOts = new Set([...state.selectedBulkOts].filter((numero) => visibleNumbers.has(numero)));
  host.innerHTML = renderTable(
    rows,
    [
      { key: "numero", label: "OT", render: (row) => `<label class="inline-check"><input type="checkbox" data-ot-check="${escapeHtml(row.numero)}" ${state.selectedBulkOts.has(row.numero) ? "checked" : ""}> ${escapeHtml(row.numero)}</label>` },
      { key: "creado_en", label: "Fecha" },
      { key: "ubicacion", label: "Area" },
      { key: "estado", label: "Estado", render: (row) => badge(row.estado) },
      { key: "equipo", label: "Equipo" },
      { key: "equipo_codigo", label: "Codigo" },
      { key: "tipo_falla", label: "Prioridad", render: (row) => badge(row.tipo_falla) },
      { key: "tipo_intervencion", label: "Tipo mantto" },
      { key: "tecnico_1", label: "Tecnico" },
      { key: "fecha_atencion", label: "Fecha atencion" },
      { key: "calificacion", label: "Calificacion", render: (row) => row.promedio ? `${Number(row.promedio).toFixed(1)}/5` : "Sin calificar" },
    ],
    (row) => `<button onclick="verOt('${escapeJs(row.numero)}')">👁 Ver detalle</button>`
  );
  document.querySelectorAll("[data-ot-check]").forEach((check) => {
    check.addEventListener("change", () => {
      if (check.checked) state.selectedBulkOts.add(check.dataset.otCheck);
      else state.selectedBulkOts.delete(check.dataset.otCheck);
    });
  });
}

function renderHistorialCalificaciones() {
  const host = $("historialCalificacionesTable");
  if (!host) return;
  if (!$("exportarCalificacionesExcel")) {
    const toolbar = document.createElement("div");
    toolbar.className = "form-actions";
    toolbar.style.margin = "0 0 12px";
    toolbar.innerHTML = `<button id="exportarCalificacionesExcel" class="primary" type="button" onclick="exportarCalificacionesExcel()">📊 Exportar Excel</button>`;
    host.parentElement?.insertBefore(toolbar, host);
  }
  document.querySelectorAll("#historialCalificaciones button, #historialCalificaciones a").forEach((el) => {
    const text = normalizeText(el.textContent || "");
    const id = normalizeText(el.id || "");
    if (text.includes("excel") || text.includes("exportar") || id.includes("exportar")) {
      el.classList.remove("hidden");
      el.style.display = "";
    }
  });
  const rows = filterCalificacionRows(state.calificaciones, getCalificacionesFilters())
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  host.innerHTML = renderTable(
    rows,
    [
      { key: "ot_numero", label: "OT" },
      { key: "tecnico", label: "Personal", render: (row) => escapeHtml(row.tecnico || row.tecnico_1 || "") },
      { key: "sede", label: "Sede" },
      { key: "ubicacion", label: "Ubicacion" },
      { key: "proceso", label: "Proceso" },
      { key: "sistema", label: "Sistema" },
      { key: "equipo", label: "Equipo" },
      { key: "usuario", label: "Calificado por" },
      { key: "fecha", label: "Fecha", render: (row) => escapeHtml(String(row.fecha || "").slice(0, 10)) },
      { key: "hora", label: "Hora", render: (row) => escapeHtml(String(row.fecha || "").replace("T", " ").slice(11, 16)) },
      { key: "limpieza", label: "Limpieza", render: (row) => `${Number(row.limpieza || row.calificacion || 0)}/5` },
      { key: "calidad", label: "Calidad", render: (row) => `${Number(row.calidad || row.calificacion || 0)}/5` },
      { key: "tiempo", label: "Tiempo", render: (row) => `${Number(row.tiempo || row.calificacion || 0)}/5` },
      { key: "orden", label: "Orden", render: (row) => `${Number(row.orden || row.calificacion || 0)}/5` },
      { key: "promedio", label: "Promedio", render: (row) => `${Number(row.promedio || row.calificacion || 0).toFixed(2)}/5` },
    ],
    (row) => `
      <button type="button" data-ver-calificacion="${escapeHtml(row.ot_numero)}">👁 Ver detalle</button>
      <button type="button" class="danger" data-eliminar-calificacion="${escapeHtml(row.ot_numero)}">🗑 Eliminar</button>
    `
  );

  host.querySelectorAll("[data-ver-calificacion]").forEach((button) => {
    button.addEventListener("click", () => verDetalleCalificacion(button.dataset.verCalificacion));
  });

  host.querySelectorAll("[data-eliminar-calificacion]").forEach((button) => {
    button.addEventListener("click", () => eliminarCalificacion(button.dataset.eliminarCalificacion));
  });
}

function renderAlmacen() {
  const q = normalizeText(state.almacenSearch || "");
  const tipo = state.almacenTipo || "";
  const categoriaFiltro = state.almacenCategoria || "todas";
  const allRows = inventoryRows();
  const counts = contarCategorias(allRows);
  const rows = allRows
    .filter((row) => !tipo || row._tabla === tipo)
    .filter((row) => categoriaFiltro === "todas" || row.categoria_id === categoriaFiltro)
    .filter((row) => !state.almacenStockFilter || inventoryStatus(row).state === state.almacenStockFilter)
    .filter((row) => !q || ["codigo", "descripcion", "categoria", "area", "modelo", "ubicacion", "proveedor", "unidad", "tipo"].some((key) => normalizeText(itemValue(row, key) || row[key] || row.categoria_virtual || "").includes(q)));
  ensureAlmacenToolbar();
  ensureAlmacenCategoryFilter(counts);
  ensureAlmacenCategorySummary(counts);
  $("almacenTable").innerHTML = renderTable(
    rows,
    [
      { key: "codigo", label: "Codigo", render: (row) => escapeHtml(itemValue(row, "codigo")) },
      { key: "descripcion", label: "Descripcion", render: (row) => escapeHtml(itemValue(row, "descripcion")) },
      { key: "modelo", label: "Modelo", render: (row) => escapeHtml(itemValue(row, "modelo")) },
      { key: "categoria_virtual", label: "Categoria", render: (row) => badge(row.categoria_virtual || "Sin categorizar") },
      { key: "cantidad", label: "Cantidad", render: (row) => inventoryNumber(row, "cantidad").toLocaleString("es-PE") },
      { key: "ubicacion", label: "Ubicacion", render: (row) => escapeHtml(itemValue(row, "ubicacion")) },
      { key: "unidad", label: "Unidad", render: (row) => escapeHtml(itemValue(row, "unidad")) },
      { key: "stock_minimo", label: "Minimo", render: (row) => inventoryNumber(row, "stock_minimo").toLocaleString("es-PE") },
      { key: "stock_maximo", label: "Maximo", render: (row) => inventoryNumber(row, "stock_maximo").toLocaleString("es-PE") },
      { key: "estado", label: "Estado", render: (row) => {
        const status = inventoryStatus(row);
        return `<span class="${status.className}">${escapeHtml(status.label)}</span>`;
      } },
    ],
    (row) => `
      <button type="button" onclick="abrirConfigInventario('${escapeJs(itemIdentity(row))}')">⚙ Configurar</button>
      <button type="button" onclick="abrirCategorizarRepuesto('${escapeJs(itemIdentity(row))}')">Categorizar</button>
    `
  );
}

function ensureAlmacenToolbar() {
  const table = $("almacenTable");
  if (!table || $("exportarAlmacenExcel")) return;
  const toolbar = document.createElement("div");
  toolbar.className = "form-actions almacen-export-actions";
  toolbar.innerHTML = '<button id="exportarAlmacenExcel" class="primary" type="button">📊 Exportar Excel</button>';
  table.insertAdjacentElement("beforebegin", toolbar);
  $("exportarAlmacenExcel").addEventListener("click", exportarAlmacenExcel);
}

function ensureAlmacenCategoryFilter(counts) {
  const table = $("almacenTable");
  if (!table) return;
  let filter = $("almacenCategoryFilterBox");
  if (!filter) {
    filter = document.createElement("div");
    filter.id = "almacenCategoryFilterBox";
    filter.className = "almacen-category-filter";
    table.insertAdjacentElement("beforebegin", filter);
  }
  filter.innerHTML = `
    <div class="almacen-category-quick-grid">
      ${MANTTO_CATEGORIAS_REPUESTOS.map((cat) => `
        <button type="button" class="almacen-category-chip ${state.almacenCategoria === cat.id ? "active" : ""}" onclick="seleccionarCategoriaAlmacen('${escapeJs(cat.id)}')">
          <span class="category-image" style="background-image:url('${escapeHtml(cat.imagen)}')"><i>${escapeHtml(cat.icono)}</i></span>
          <strong>${escapeHtml(cat.nombre)}</strong>
          <small>${(counts.get(cat.id) || 0).toLocaleString("es-PE")}</small>
        </button>
      `).join("")}
    </div>
    <label>Categoria
      <select id="almacenCategoriaSelect">
        ${MANTTO_CATEGORIAS_REPUESTOS.map((cat) => `
          <option value="${escapeHtml(cat.id)}" ${state.almacenCategoria === cat.id ? "selected" : ""}>
            ${escapeHtml(cat.nombre)} (${(counts.get(cat.id) || 0).toLocaleString("es-PE")})
          </option>
        `).join("")}
      </select>
    </label>
    <button type="button" class="secondary" onclick="limpiarFiltroCategoriaAlmacen()">Todas</button>
    <button type="button" class="secondary" onclick="verSinCategorizarAlmacen()">Sin categorizar</button>
  `;
  $("almacenCategoriaSelect")?.addEventListener("change", (event) => {
    state.almacenCategoria = event.target.value || "todas";
    renderAlmacen();
  });
}

function seleccionarCategoriaAlmacen(categoriaId) {
  state.almacenCategoria = categoriaId || "todas";
  renderAlmacen();
}

function ensureAlmacenCategorySummary(counts) {
  const table = $("almacenTable");
  if (!table) return;
  let summary = $("almacenCategorySummary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "almacenCategorySummary";
    summary.className = "inventory-category-summary";
    table.insertAdjacentElement("beforebegin", summary);
  }
  const total = counts.get("todas") || 0;
  const sin = counts.get("sin_categorizar") || 0;
  summary.innerHTML = `
    <div class="inventory-kpi"><span>Total</span><strong>${total.toLocaleString("es-PE")}</strong></div>
    <div class="inventory-kpi"><span>Categorizados</span><strong>${(total - sin).toLocaleString("es-PE")}</strong></div>
    <button class="inventory-kpi ${sin ? "danger-soft" : "ok-soft"}" type="button" onclick="verSinCategorizarAlmacen()">
      <span>Sin categorizar</span><strong>${sin.toLocaleString("es-PE")}</strong>
    </button>
    <div class="inventory-kpi"><span>Categorias</span><strong>${Math.max(0, [...counts.entries()].filter(([id, count]) => !["todas", "sin_categorizar"].includes(id) && count > 0).length).toLocaleString("es-PE")}</strong></div>
  `;
}

function verSinCategorizarAlmacen() {
  state.almacenSearch = "";
  state.almacenTipo = "";
  state.almacenCategoria = "sin_categorizar";
  state.almacenStockFilter = "";
  renderAlmacen();
  setTimeout(() => {
    const rows = repuestosSinCategorizar();
    toast(rows.length ? `${rows.length} componente(s) sin categorizar` : "Todos los componentes estan categorizados", rows.length ? "warning" : "success");
  }, 50);
}

function limpiarFiltroCategoriaAlmacen() {
  state.almacenCategoria = "todas";
  renderAlmacen();
}

function abrirCategorizarRepuesto(id) {
  const row = findInventoryItem(id);
  if (!row) return;
  const codigo = itemValue(row, "codigo");
  pedirConfirmacion(
    "Categorizar componente",
    `
      <form id="categorizarRepuestoForm" class="form-grid">
        <dl class="span-full">
          <dt>Codigo</dt><dd>${escapeHtml(codigo || "-")}</dd>
          <dt>Descripcion</dt><dd>${escapeHtml(itemValue(row, "descripcion") || "-")}</dd>
          <dt>Modelo</dt><dd>${escapeHtml(itemValue(row, "modelo") || "-")}</dd>
        </dl>
        <label class="span-full">Categoria
          <select name="categoria" required>
            ${MANTTO_CATEGORIAS_REPUESTOS.filter((cat) => cat.id !== "todas").map((cat) => `
              <option value="${escapeHtml(cat.id)}" ${cat.id === row.categoria_id ? "selected" : ""}>${escapeHtml(cat.nombre)}</option>
            `).join("")}
          </select>
        </label>
      </form>
    `,
    "Guardar"
  ).then((ok) => {
    if (!ok) return;
    const categoriaId = $("categorizarRepuestoForm")?.elements?.categoria?.value;
    if (!categoriaId) return;
    guardarCategoria(codigo, categoriaId);
    toast("Categoria guardada localmente", "success");
    renderAlmacen();
    if (state.currentView === "pedidosAceptados") renderPedidosAceptados();
  });
}

function abrirConfigInventario(id) {
  const row = findInventoryItem(id);
  if (!row) return;
  pedirConfirmacion(
    "Configurar inventario",
    `
      <form id="inventoryLimitForm" class="form-grid">
        <dl class="span-full">
          <dt>Codigo</dt><dd>${escapeHtml(itemValue(row, "codigo") || "-")}</dd>
          <dt>Descripcion</dt><dd>${escapeHtml(itemValue(row, "descripcion") || "-")}</dd>
          <dt>Stock actual</dt><dd>${inventoryNumber(row, "cantidad").toLocaleString("es-PE")}</dd>
        </dl>
        <label>Cantidad actual<input name="cantidad" type="number" min="0" step="0.01" value="${escapeHtml(inventoryNumber(row, "cantidad"))}"></label>
        <label>Stock minimo<input name="stock_minimo" type="number" min="0" step="0.01" value="${escapeHtml(inventoryNumber(row, "stock_minimo"))}"></label>
        <label>Stock maximo<input name="stock_maximo" type="number" min="0" step="0.01" value="${escapeHtml(inventoryNumber(row, "stock_maximo"))}"></label>
      </form>
    `,
    "Guardar"
  ).then(async (ok) => {
    if (!ok) return;
    const form = $("inventoryLimitForm");
    const data = formData(form);
    try {
      await api(`/api/inventario/${encodeURIComponent(row._tabla)}/${encodeURIComponent(row.id || itemValue(row, "codigo"))}/stock-limits`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      toast("Inventario configurado correctamente", "success");
      await refreshAfterMutation();
      renderAlmacen();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

async function exportarAlmacenExcel() {
  try {
    const params = new URLSearchParams();
    if (state.almacenTipo) params.set("tabla", state.almacenTipo);
    if (state.almacenStockFilter) params.set("stock", state.almacenStockFilter);
    if (state.almacenSearch) params.set("q", state.almacenSearch);
    const blob = await api(`/api/inventario/exportar-excel?${params.toString()}`);
    downloadBlob(blob, `ALMACEN_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Almacen exportado a Excel", "success");
  } catch (err) {
    toast(err.message || "No se pudo exportar almacen", "error");
  }
}

async function exportarCalificacionesExcel() {
  try {
    const filters = getCalificacionesFilters();
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, value);
    });
    const blob = await api(`/api/calificaciones/exportar-excel?${params.toString()}`);
    downloadBlob(blob, `HISTORIAL_CALIFICACIONES_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Historial de calificaciones exportado", "success");
  } catch (err) {
    toast(err.message || "No se pudo exportar calificaciones", "error");
  }
}

function renderIngresoItem() {
  ensureManttoV46Ui();
  const form = $("ingresoItemForm");
  if (!form) return;
  const mode = state.ingresoItemMode || "existente";
  const selected = state.ingresoItemSelected;
  const q = normalizeText(state.ingresoItemSearch || "");
  const results = inventoryRows()
    .filter((row) => {
      if (!q) return false;
      return [itemValue(row, "codigo"), itemValue(row, "descripcion")].some((value) => normalizeText(value).includes(q));
    })
    .slice(0, 10);
  form.innerHTML = `
    <div class="form-block span-full">
      <h3>Tipo de ingreso</h3>
      <div class="selector-mode">
        <button type="button" class="${mode === "existente" ? "active" : ""}" onclick="setIngresoItemMode('existente')">
          <strong>Producto existente</strong>
          <span>Buscar por codigo o descripcion y sumar stock.</span>
        </button>
        <button type="button" class="${mode === "nuevo" ? "active" : ""}" onclick="setIngresoItemMode('nuevo')">
          <strong>Nuevo producto</strong>
          <span>Crear codigo nuevo con datos del inventario.</span>
        </button>
      </div>
    </div>
    ${mode === "existente" ? `
      <div class="form-block span-full">
        <h3>Buscar producto existente</h3>
        <label>Codigo o descripcion
          <input id="ingresoItemSearch" type="search" autocomplete="off" value="${escapeHtml(state.ingresoItemSearch || "")}" placeholder="Escriba codigo o descripcion">
        </label>
        <div id="ingresoItemResults" class="table-wrap ingreso-results">
          ${q ? renderTable(results, [
            { key: "codigo", label: "Codigo", render: (row) => escapeHtml(itemValue(row, "codigo")) },
            { key: "descripcion", label: "Descripcion", render: (row) => escapeHtml(itemValue(row, "descripcion")) },
            { key: "unidad", label: "Unidad", render: (row) => escapeHtml(itemValue(row, "unidad")) },
            { key: "cantidad", label: "Stock", render: (row) => inventoryNumber(row, "cantidad").toLocaleString("es-PE") },
          ], (row) => `<button class="primary" type="button" onclick="seleccionarIngresoItem('${escapeJs(itemIdentity(row))}')">Seleccionar</button>`) : '<p class="empty-state">Escriba para buscar por codigo o descripcion.</p>'}
        </div>
      </div>
      <input type="hidden" name="tabla" value="${escapeHtml(selected?._tabla || "repuestos")}">
      <label>Codigo<input name="codigo" required readonly value="${escapeHtml(selected ? itemValue(selected, "codigo") : "")}" placeholder="Seleccione un producto"></label>
      <label>Descripcion<input name="descripcion" required readonly value="${escapeHtml(selected ? itemValue(selected, "descripcion") : "")}"></label>
      <label>Unidad<input name="unidad" readonly value="${escapeHtml(selected ? itemValue(selected, "unidad") : "")}"></label>
    ` : `
      <label>Tipo de inventario
        <select name="tabla" required>
          <option value="repuestos">Repuestos</option>
          <option value="productos">Productos</option>
        </select>
      </label>
      <label>Codigo nuevo<input name="codigo" required placeholder="Codigo nuevo del item"></label>
      <label>Descripcion<input name="descripcion" required placeholder="Descripcion del item"></label>
      <label>Unidad<input name="unidad" placeholder="UND, KG, LT..."></label>
      <label>Tipo<input name="tipo" placeholder="Tipo"></label>
      <label>Categoria<input name="categoria" placeholder="Categoria"></label>
      <label>Area<input name="area" placeholder="Area"></label>
      <label>Modelo<input name="modelo" placeholder="Modelo"></label>
      <label>Ubicacion<input name="ubicacion" placeholder="Ubicacion en almacen"></label>
      <label>Proveedor<input name="proveedor" placeholder="Proveedor"></label>
      <label>Stock minimo<input name="stock_minimo" type="number" min="0" step="0.01"></label>
      <label>Stock maximo<input name="stock_maximo" type="number" min="0" step="0.01"></label>
    `}
    <label>Cantidad a ingresar<input name="cantidad" type="number" min="0.01" step="0.01" required></label>
    <label>Motivo<select name="motivo"><option>INGRESO DE ALMACEN</option><option>COMPRA</option><option>AJUSTE</option><option>DEVOLUCION</option></select></label>
    <label class="span-2">Observacion<textarea name="observacion" placeholder="Detalle opcional del ingreso"></textarea></label>
    <div class="form-actions span-full">
      <button class="secondary" type="reset">Limpiar</button>
      <button class="primary" type="submit">📥 Registrar ingreso</button>
    </div>
  `;
  $("ingresoItemSearch")?.addEventListener("input", (event) => {
    state.ingresoItemSearch = event.target.value;
    state.ingresoItemSelected = null;
    renderIngresoItem();
    const next = $("ingresoItemSearch");
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!validateRequiredForm(form)) return;
    if (state.ingresoItemMode === "existente" && !state.ingresoItemSelected) {
      return toast("Seleccione un producto existente antes de registrar el ingreso", "warning");
    }
    try {
      const result = await api("/api/inventario-ingreso", {
        method: "POST",
        body: JSON.stringify(formData(form)),
      });
      confirmar("Ingreso registrado", `Codigo: ${result.codigo || ""} · Stock actual: ${result.stock_actual ?? ""}`);
      toast("Ingreso de item registrado", "success");
      form.reset();
      state.ingresoItemSearch = "";
      state.ingresoItemSelected = null;
      await refreshAfterMutation();
      renderIngresoItem();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  bindRequiredIndicators(form);
}

function setIngresoItemMode(mode) {
  state.ingresoItemMode = mode === "nuevo" ? "nuevo" : "existente";
  state.ingresoItemSearch = "";
  state.ingresoItemSelected = null;
  renderIngresoItem();
}

function seleccionarIngresoItem(id) {
  const row = findInventoryItem(id);
  if (!row) return toast("Item no encontrado", "error");
  state.ingresoItemSelected = row;
  state.ingresoItemSearch = `${itemValue(row, "codigo")} ${itemValue(row, "descripcion")}`.trim();
  renderIngresoItem();
  toast("Item seleccionado", "success");
}

function renderHistorialPeticiones() {
  ensureManttoV46Ui();
  const host = $("historialPeticionesTable");
  if (!host) return;
  const merged = new Map();
  [...(state.peticiones || []), ...(state.historialPeticiones || [])].forEach((row) => {
    if (!row) return;
    const key = String(row.numero || row.id || "").trim();
    if (!key) return;
    merged.set(key, { ...(merged.get(key) || {}), ...row });
  });
  const rows = [...merged.values()]
    .slice()
    .sort((a, b) => String(b.creado_en || b.fecha || "").localeCompare(String(a.creado_en || a.fecha || "")));
  if (!rows.length) {
    host.innerHTML = `
      <div class="empty-state">
        <strong>No hay peticiones registradas para mostrar.</strong>
        <p>Si acaba de generar una peticion, presione recargar. Si sigue vacio, revise que el servidor tenga activo el endpoint /api/peticiones-historial.</p>
        <button class="primary" type="button" onclick="recargarHistorialPeticiones()">🔄 Recargar historial</button>
      </div>
    `;
    return;
  }
  host.innerHTML = renderTable(
    rows,
    [
      { key: "numero", label: "Codigo" },
      { key: "creado_en", label: "Fecha", render: (row) => escapeHtml(String(row.creado_en || row.fecha || "").replace("T", " ").slice(0, 16)) },
      { key: "usuario", label: "Solicitante" },
      { key: "items", label: "Items", render: (row) => escapeHtml(row.items_count ?? row.cantidad_items ?? row.cantidad ?? 1) },
      { key: "criticidad", label: "Criticidad", render: (row) => row.criticidad ? badge(row.criticidad) : "-" },
      { key: "estado", label: "Estado", render: (row) => badge(row.estado || "PENDIENTE") },
    ],
    (row) => `
      <button type="button" onclick="verDetallePeticion('${escapeJs(row.numero)}')">👁 Ver detalle</button>
      ${normalizeText(row.estado || "pendiente") === "pendiente" ? `<button class="primary" type="button" onclick="aceptarPeticion('${escapeJs(row.numero)}')">✓ Aceptar</button>` : ""}
      ${normalizeText(row.estado || "") === "aceptada" ? `<button class="primary" type="button" onclick="marcarSalidaPeticion('${escapeJs(row.numero)}')">📦 Marcar salida</button>` : ""}
      <button class="danger" type="button" onclick="eliminarPeticionHistorial('${escapeJs(row.numero)}')">🗑 Eliminar</button>
    `
  );
}

function peticionesAceptadasRows() {
  const merged = new Map();
  [...(state.peticiones || []), ...(state.historialPeticiones || [])].forEach((row) => {
    if (!row) return;
    const key = String(row.numero || row.id || "").trim();
    if (!key) return;
    merged.set(key, { ...(merged.get(key) || {}), ...row });
  });
  return [...merged.values()]
    .filter((row) => normalizeText(row.estado || "") === "aceptada")
    .sort((a, b) => String(b.creado_en || b.fecha || "").localeCompare(String(a.creado_en || a.fecha || "")));
}

async function renderPedidosAceptados() {
  ensureManttoV46Ui();
  const host = $("pedidosAceptadosTable");
  const categoryHost = $("pedidoAceptadoCategorias");
  const searchInput = $("pedidoAceptadoSearch");
  if (!host) return;
  if (searchInput && searchInput.value !== state.pedidoAceptadoSearch) searchInput.value = state.pedidoAceptadoSearch || "";
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.addEventListener("input", (event) => {
      state.pedidoAceptadoSearch = event.target.value;
      renderPedidosAceptados();
    });
  }

  const rows = peticionesAceptadasRows();
  if (!rows.length) {
    host.innerHTML = `
      <div class="empty-state">
        <strong>No hay pedidos aceptados.</strong>
        <p>Cuando una peticion pase a ACEPTADA aparecera aqui para ubicar sus materiales.</p>
        <button class="primary" type="button" onclick="recargarHistorialPeticiones()">🔄 Recargar</button>
      </div>
    `;
    if (categoryHost) categoryHost.innerHTML = "";
    enviarPayloadPedidosAceptados3D({ modo: "general", pedido: null, componentes: [] });
    return;
  }

  host.innerHTML = `<div class="empty-state">Cargando pedidos aceptados...</div>`;
  const pedidos = await Promise.all(rows.map(async (row) => {
    const info = await buildPedidoUbicacionInfo(row.numero);
    return { ...info, row: { ...row, ...(info.row || {}) } };
  }));
  const componentes = pedidos.flatMap((pedido) => pedido.items.map((item, index) => {
    const inv = inventoryMatchForPeticionItem({ item_codigo: item.codigo, item_nombre: item.descripcion });
    const normalized = normalizarRepuesto(inv || {
      codigo: item.codigo,
      descripcion: item.descripcion,
      modelo: "",
      cantidad: item.stock,
      ubicacion: item.ubicacion,
      unidad: item.unidad,
      _tabla: "repuestos",
    });
    return {
      id: `${pedido.row.numero}-${index + 1}`,
      pedidoNumero: pedido.row.numero,
      codigo: item.codigo || itemValue(normalized, "codigo") || "",
      nombre: item.descripcion || itemValue(normalized, "descripcion") || "Material",
      descripcion: item.descripcion || itemValue(normalized, "descripcion") || "",
      modelo: itemValue(normalized, "modelo") || "",
      cantidad: item.cantidad || "",
      unidad: item.unidad || itemValue(normalized, "unidad") || "",
      ubicacion: normalizarCodigoUbicacion(item.ubicacion || itemValue(normalized, "ubicacion") || ""),
      stock: item.stock === "" ? inventoryNumber(normalized, "cantidad") : item.stock,
      categoria: normalized.categoria_virtual || "Sin categorizar",
      categoria_id: normalized.categoria_id || "sin_categorizar",
    };
  }));
  state.pedidoAceptadoComponentes = componentes;
  if (!state.pedidoAceptadoComponente && componentes[0]) state.pedidoAceptadoComponente = componentes[0].id;

  const filtered = filtrarComponentesAceptados(componentes);
  if (categoryHost) renderCategoriasAceptadas(componentes);
  host.innerHTML = renderListaPedidosAceptados(pedidos, filtered);
  enviarPayloadPedidosAceptados3D({
    modo: "pedidosAceptados",
    pedido: { numero: state.pedidoAceptadoSeleccionado || rows[0]?.numero || "" },
    componentes: filtered,
    selectedId: state.pedidoAceptadoComponente || "",
    selectedCodigo: filtered.find((item) => item.id === state.pedidoAceptadoComponente)?.codigo || "",
    selectedUbicacion: filtered.find((item) => item.id === state.pedidoAceptadoComponente)?.ubicacion || "",
  });
}

function filtrarComponentesAceptados(componentes) {
  const q = normalizeText(state.pedidoAceptadoSearch || "");
  return (componentes || [])
    .filter((item) => !q || normalizeText(`${item.pedidoNumero} ${item.codigo} ${item.nombre} ${item.descripcion} ${item.modelo} ${item.ubicacion} ${item.categoria}`).includes(q));
}

function renderCategoriasAceptadas(componentes) {
  const host = $("pedidoAceptadoCategorias");
  if (!host) return;
  const counts = contarCategorias(componentes.map((item) => ({
    categoria_id: item.categoria_id,
    categoria_virtual: item.categoria,
    codigo: item.codigo,
    descripcion: item.descripcion,
  })));
  host.innerHTML = MANTTO_CATEGORIAS_REPUESTOS
    .filter((cat) => cat.id === "todas" || (counts.get(cat.id) || 0) > 0 || cat.id === "sin_categorizar")
    .map((cat) => `
      <button type="button" class="accepted-category-card ${state.pedidoAceptadoCategoria === cat.id ? "active" : ""}" onclick="seleccionarCategoriaPedidosAceptados('${escapeJs(cat.id)}')">
        <span class="category-image" style="background-image:url('${escapeHtml(cat.imagen)}')"><i>${escapeHtml(cat.icono)}</i></span>
        <strong>${escapeHtml(cat.nombre)}</strong>
        <small>${(counts.get(cat.id) || 0).toLocaleString("es-PE")} componente(s)</small>
      </button>
    `).join("");
}

function renderListaPedidosAceptados(pedidos, componentesFiltrados) {
  const byPedido = new Map();
  componentesFiltrados.forEach((item) => {
    if (!byPedido.has(item.pedidoNumero)) byPedido.set(item.pedidoNumero, []);
    byPedido.get(item.pedidoNumero).push(item);
  });
  if (!componentesFiltrados.length) return `<div class="empty-state">No hay componentes para el filtro seleccionado.</div>`;
  return pedidos
    .filter((pedido) => byPedido.has(pedido.row.numero))
    .map((pedido) => `
      <article class="accepted-order-card ${state.pedidoAceptadoSeleccionado === pedido.row.numero ? "active" : ""}">
        <header>
          <div>
            <strong>Pedido ${escapeHtml(pedido.row.numero || "")}</strong>
            <span>${escapeHtml(String(pedido.row.creado_en || pedido.row.fecha || "").replace("T", " ").slice(0, 16))}</span>
          </div>
          ${pedido.row.criticidad ? badge(pedido.row.criticidad) : ""}
        </header>
        ${(byPedido.get(pedido.row.numero) || []).map((item) => `
          <button type="button" class="accepted-component ${state.pedidoAceptadoComponente === item.id ? "active" : ""}" data-component-id="${escapeHtml(item.id)}" onclick="seleccionarComponentePedidoAceptado('${escapeJs(item.id)}')">
            <strong>${escapeHtml(item.nombre || item.codigo || "Material")}</strong>
            <span>${escapeHtml(item.codigo || "-")} · ${escapeHtml(item.cantidad || "-")} ${escapeHtml(item.unidad || "")}</span>
            <span>${escapeHtml(item.categoria || "Sin categorizar")} · ${escapeHtml(item.ubicacion || "Sin ubicacion")}</span>
          </button>
        `).join("")}
      </article>
    `).join("");
}

function seleccionarCategoriaPedidosAceptados(categoriaId) {
  state.pedidoAceptadoCategoria = categoriaId || "todas";
  state.pedidoAceptadoComponente = "";
  renderPedidosAceptados();
}

function seleccionarComponentePedidoAceptado(id, options = {}) {
  const item = (state.pedidoAceptadoComponentes || []).find((row) => row.id === id || sameText(row.codigo, id) || sameText(row.ubicacion, id));
  if (!item) return;
  state.pedidoAceptadoComponente = item.id;
  state.pedidoAceptadoSeleccionado = item.pedidoNumero;
  document.querySelectorAll(".accepted-component.active").forEach((el) => el.classList.remove("active"));
  document.querySelector(`.accepted-component[data-component-id="${CSS.escape(item.id)}"]`)?.classList.add("active");
  enviarPedidoAceptado3D({ type: "mantto:warehouse3d:select", codigo: item.codigo, id: item.id, ubicacion: item.ubicacion });
  if (options.speak) speakCielo(`${item.nombre || item.codigo}. Ubicacion ${item.ubicacion || "sin ubicacion registrada"}.`);
}

function centrarPedidoAceptado3D() {
  enviarPedidoAceptado3D({ type: "mantto:warehouse3d:general" });
}

function enviarPedidoAceptado3D(message) {
  const frame = $("pedidosAceptadosWarehouseFrame");
  frame?.contentWindow?.postMessage(message, "*");
}

function enviarPayloadPedidosAceptados3D(payload) {
  state.warehouse3dPayload = payload;
  localStorage.setItem("mantto_warehouse3d_payload", JSON.stringify(payload));
  const frame = $("pedidosAceptadosWarehouseFrame");
  if (!frame) return;
  const send = () => enviarPedidoAceptado3D({ type: "mantto:warehouse3d:payload", payload });
  frame.onload = send;
  send();
}

function renderWarehouseEmpty() {
  return `
    <h3>Ubicacion de almacen</h3>
    <p class="muted">Seleccione un pedido aceptado para ver donde se encuentran sus materiales.</p>
    <div class="warehouse-map">
      <div class="warehouse-marker">SIN PEDIDO SELECCIONADO</div>
    </div>
  `;
}

async function getPeticionDetalleItems(numero) {
  const detail = await apiOptional(`/api/peticiones/${encodeURIComponent(numero)}/detalle`, null);
  const row = detail || (state.historialPeticiones || state.peticiones || []).find((p) => p.numero === numero) || {};
  const items = detail?.items?.length ? detail.items : [row];
  return { row, items };
}

function inventoryMatchForPeticionItem(item) {
  const codigo = item.item_codigo || item.codigo || "";
  const descripcion = item.item_nombre || item.descripcion || "";
  return inventoryRows().find((row) => sameText(itemValue(row, "codigo"), codigo))
    || inventoryRows().find((row) => sameText(itemValue(row, "descripcion"), descripcion))
    || inventoryRows().find((row) => {
      const haystack = normalizeText(`${itemValue(row, "codigo")} ${itemValue(row, "descripcion")}`);
      const needle = normalizeText(`${codigo} ${descripcion}`).trim();
      return needle && needle.split(" ").filter(Boolean).every((part) => haystack.includes(part));
    });
}

async function buildPedidoUbicacionInfo(numero) {
  const { row, items } = await getPeticionDetalleItems(numero);
  const ubicaciones = items.map((item) => {
    const inv = inventoryMatchForPeticionItem(item);
    return {
      codigo: item.item_codigo || item.codigo || itemValue(inv, "codigo") || "",
      descripcion: item.item_nombre || item.descripcion || itemValue(inv, "descripcion") || "",
      cantidad: item.cantidad || "",
      unidad: item.unidad || itemValue(inv, "unidad") || "",
      ubicacion: inv ? itemValue(inv, "ubicacion") : "",
      stock: inv ? inventoryNumber(inv, "cantidad") : "",
    };
  });
  const conUbicacion = ubicaciones.filter((item) => String(item.ubicacion || "").trim());
  const primeraUbicacion = conUbicacion[0]?.ubicacion || "";
  const voz = conUbicacion.length
    ? `Pedido ${numero} aceptado. Ubicacion de almacen: ${conUbicacion.slice(0, 3).map((item) => `${item.descripcion || item.codigo}, ${item.ubicacion}`).join(". ")}.`
    : `Pedido ${numero} aceptado. No hay ubicacion registrada en almacen para sus materiales.`;
  return { row, items: ubicaciones, primeraUbicacion, voz };
}

async function renderPedidoAceptadoMapa(numero) {
  const mapHost = $("pedidoAceptadoMapa");
  if (!mapHost) return;
  state.pedidoAceptadoSeleccionado = numero;
  mapHost.innerHTML = `<div class="empty-state">Cargando ubicacion del pedido ${escapeHtml(numero)}...</div>`;
  const info = await buildPedidoUbicacionInfo(numero);
  const marker = info.primeraUbicacion || "SIN UBICACION REGISTRADA";
  mapHost.innerHTML = `
    <h3>Ubicacion del pedido ${escapeHtml(numero)}</h3>
    <p class="muted">Cielo indicara por voz la ubicacion registrada en inventario. Si agrega una imagen en <code>static/assets/almacen.png</code>, se usara como fondo.</p>
    <div class="warehouse-map">
      <img src="/static/assets/almacen.png" alt="Imagen del almacen" onerror="this.style.display='none'">
      <div class="warehouse-marker">${escapeHtml(marker)}</div>
    </div>
    <div class="warehouse-items">
      ${info.items.map((item) => `
        <div class="warehouse-item">
          <strong>${escapeHtml(item.descripcion || item.codigo || "Material")}</strong>
          <div class="muted">Codigo: ${escapeHtml(item.codigo || "-")} · Pedido: ${escapeHtml(item.cantidad || "-")} ${escapeHtml(item.unidad || "")}</div>
          <div><b>Ubicacion:</b> ${escapeHtml(item.ubicacion || "Sin ubicacion registrada")}</div>
          <div class="muted">Stock actual: ${escapeHtml(item.stock === "" ? "-" : item.stock)} ${escapeHtml(item.unidad || "")}</div>
          <div class="warehouse-item-actions">
            <button class="secondary" type="button" onclick="abrirAlmacen3DPedido('${escapeJs(numero)}', '${escapeJs(item.codigo)}')">🏭 Ver ubicacion 3D</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function normalizarCodigoUbicacion(raw) {
  return String(raw || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

async function buildWarehouse3dPayload(numero, selectedCodigo = "") {
  const info = await buildPedidoUbicacionInfo(numero);
  const componentes = info.items.map((item, index) => ({
    id: `${numero}-${index + 1}`,
    codigo: item.codigo || "",
    nombre: item.descripcion || item.codigo || "Material",
    cantidad: item.cantidad || "",
    unidad: item.unidad || "",
    ubicacion: normalizarCodigoUbicacion(item.ubicacion || ""),
    stock: item.stock === "" ? "" : item.stock,
  }));
  const selected = componentes.find((item) => sameText(item.codigo, selectedCodigo))
    || componentes.find((item) => item.ubicacion)
    || componentes[0]
    || null;
  return {
    modo: selectedCodigo ? "componente" : "pedido",
    pedido: {
      numero,
      estado: info.row?.estado || "ACEPTADA",
      solicitante: info.row?.usuario || "",
      fecha: info.row?.creado_en || info.row?.fecha || "",
    },
    componentes,
    selectedCodigo: selected?.codigo || "",
    selectedUbicacion: selected?.ubicacion || "",
    generadoEn: new Date().toISOString(),
  };
}

async function abrirAlmacen3DPedido(numero, selectedCodigo = "") {
  try {
    const payload = await buildWarehouse3dPayload(numero, selectedCodigo);
    state.warehouse3dPayload = payload;
    localStorage.setItem("mantto_warehouse3d_payload", JSON.stringify(payload));
    setView("warehouse3d");
  } catch (err) {
    toast(err.message || "No se pudo abrir la ubicacion 3D", "error");
  }
}

function renderWarehouse3dPanel() {
  const frame = $("warehouse3dFrame");
  if (!frame) return;
  const payload = state.warehouse3dPayload || JSON.parse(localStorage.getItem("mantto_warehouse3d_payload") || "null");
  if (payload) localStorage.setItem("mantto_warehouse3d_payload", JSON.stringify(payload));
  frame.src = `${manttoWarehouse3dUrl(false)}&t=${Date.now()}`;
}

function attachWarehouse3dBridge() {
  if (window.__manttoWarehouse3dBridge) return;
  window.__manttoWarehouse3dBridge = true;
  window.addEventListener("message", (event) => {
    if (!event.data) return;
    if (event.data.type === "mantto:setView") {
      setView(event.data.view || "pedidosAceptados");
      return;
    }
    if (event.data.type === "mantto:warehouse3d:selected") {
      const ubicacion = normalizarCodigoUbicacion(event.data.ubicacion || "");
      const item = (state.pedidoAceptadoComponentes || []).find((row) => normalizarCodigoUbicacion(row.ubicacion) === ubicacion);
      if (item) {
        state.pedidoAceptadoComponente = item.id;
        state.pedidoAceptadoSeleccionado = item.pedidoNumero;
        document.querySelectorAll(".accepted-component.active").forEach((el) => el.classList.remove("active"));
        document.querySelector(`.accepted-component[data-component-id="${CSS.escape(item.id)}"]`)?.classList.add("active");
      }
    }
  });
}

async function verUbicacionPedidoAceptado(numero, options = {}) {
  try {
    if (state.currentView !== "pedidosAceptados") setView("pedidosAceptados");
    await renderPedidoAceptadoMapa(numero);
    const info = await buildPedidoUbicacionInfo(numero);
    toast(info.voz, "success");
    if (options.speak !== false) speakCielo(info.voz);
  } catch (err) {
    toast(err.message || "No se pudo obtener la ubicacion del pedido", "error");
  }
}

function renderKardex() {
  const host = $("kardexTable");
  if (!host) return;
  const input = $("kardexSearch");
  const desdeInput = $("kardexDesde");
  const hastaInput = $("kardexHasta");
  if (desdeInput && !desdeInput.value) desdeInput.value = state.kardexDesde || "";
  if (hastaInput && !hastaInput.value) hastaInput.value = state.kardexHasta || "";
  const q = normalizeText(input?.value || "");
  const desde = desdeInput?.value || state.kardexDesde || "";
  const hasta = hastaInput?.value || state.kardexHasta || "";
  const rows = (state.inventarioMovimientos || [])
    .filter((row) => {
      const text = [
        row.peticion_numero,
        row.item_codigo,
        row.descripcion,
        row.usuario,
        row.tipo_movimiento,
        row.tabla,
      ].map(normalizeText).join(" ");
      const fecha = String(row.creado_en || "").slice(0, 10);
      if (q && !text.includes(q)) return false;
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    })
    .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));

  host.innerHTML = renderTable(
    rows,
    [
      { key: "creado_en", label: "Fecha", render: (row) => escapeHtml(String(row.creado_en || "").replace("T", " ").slice(0, 16)) },
      { key: "peticion_numero", label: "Peticion" },
      { key: "item_codigo", label: "Codigo" },
      { key: "descripcion", label: "Descripcion" },
      { key: "cantidad", label: "Cantidad" },
      { key: "unidad", label: "Unidad" },
      { key: "tipo_movimiento", label: "Movimiento", render: (row) => badge(row.tipo_movimiento || "SALIDA") },
      { key: "stock_anterior", label: "Stock anterior" },
      { key: "stock_posterior", label: "Stock posterior" },
      { key: "usuario", label: "Usuario" },
    ],
    (row) => `<button class="danger" type="button" onclick="eliminarMovimientoKardex(${Number(row.id)})">🗑 Eliminar</button>`
  );

  if (input && !input.dataset.boundKardex) {
    input.dataset.boundKardex = "true";
    input.addEventListener("input", renderKardex);
  }
  [desdeInput, hastaInput].forEach((field) => {
    if (!field || field.dataset.boundKardexDate) return;
    field.dataset.boundKardexDate = "true";
    field.addEventListener("change", () => {
      state.kardexDesde = desdeInput?.value || "";
      state.kardexHasta = hastaInput?.value || "";
      renderKardex();
    });
  });
}

async function recargarKardex() {
  try {
    state.inventarioMovimientos = await apiOptional("/api/inventario-movimientos", []);
    renderKardex();
    toast("Kardex actualizado", "success");
  } catch (err) {
    toast(err.message || "No se pudo cargar Kardex", "error");
  }
}

async function eliminarMovimientoKardex(id) {
  const row = (state.inventarioMovimientos || []).find((item) => Number(item.id) === Number(id));
  const ok = await pedirConfirmacion(
    "Eliminar movimiento de Kardex",
    `<dl><dt>Movimiento</dt><dd>${escapeHtml(row?.tipo_movimiento || "-")}</dd><dt>Codigo</dt><dd>${escapeHtml(row?.item_codigo || "-")}</dd><dt>Cantidad</dt><dd>${escapeHtml(row?.cantidad ?? "-")}</dd></dl><p class="muted">Se eliminara el registro del Kardex. No se recalculara stock historico automaticamente.</p>`,
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/inventario-movimientos/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("Movimiento eliminado", "success");
    await recargarKardex();
  } catch (err) {
    toast(err.message || "No se pudo eliminar movimiento", "error");
  }
}

async function exportarKardexExcel() {
  try {
    const params = new URLSearchParams();
    const desde = $("kardexDesde")?.value || state.kardexDesde || "";
    const hasta = $("kardexHasta")?.value || state.kardexHasta || "";
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const blob = await api(`/api/inventario-movimientos/exportar-excel?${params.toString()}`);
    downloadBlob(blob, `KARDEX_${desde || "inicio"}_${hasta || "fin"}.xlsx`);
    toast("Kardex exportado a Excel", "success");
  } catch (err) {
    toast(err.message || "No se pudo exportar Kardex", "error");
  }
}

async function recargarHistorialPeticiones() {
  try {
    const [peticiones, historial] = await Promise.all([
      apiOptional("/api/peticiones", []),
      apiOptional("/api/peticiones-historial", []),
    ]);
    state.peticiones = peticiones || [];
    state.historialPeticiones = historial?.length ? historial : state.peticiones;
    renderHistorialPeticiones();
    if (state.currentView === "pedidosAceptados") renderPedidosAceptados();
  } catch (err) {
    toast(err.message || "No se pudo recargar historial de peticiones", "error");
  }
}

async function verDetallePeticion(numero) {
  const detail = await apiOptional(`/api/peticiones/${encodeURIComponent(numero)}/detalle`, null);
  const row = detail || (state.historialPeticiones || state.peticiones || []).find((p) => p.numero === numero);
  if (!row) return;
  const items = detail?.items || [row];
  await pedirConfirmacion(
    `Peticion ${numero}`,
    `
      <dl class="detail-grid">
        <dt>Solicitante</dt><dd>${escapeHtml(row.usuario || "-")}</dd>
        <dt>Fecha</dt><dd>${escapeHtml(String(row.creado_en || row.fecha || "").replace("T", " ").slice(0, 16) || "-")}</dd>
        <dt>Estado</dt><dd>${badge(row.estado || "PENDIENTE")}</dd>
      </dl>
      ${renderTable(items, [
        { key: "item_codigo", label: "Codigo", render: (item) => escapeHtml(item.item_codigo || item.codigo || "") },
        { key: "item_nombre", label: "Descripcion", render: (item) => escapeHtml(item.item_nombre || item.descripcion || "") },
        { key: "cantidad", label: "Cantidad" },
        { key: "unidad", label: "Unidad" },
      ], null)}
    `,
    "Cerrar"
  );
}

async function aceptarPeticion(numero) {
  const ok = await pedirConfirmacion("Aceptar peticion", `La peticion ${escapeHtml(numero)} pasara a estado ACEPTADA. No se descuenta stock todavia.`, "✓ Aceptar");
  if (!ok) return;
  try {
    await api(`/api/peticiones/${encodeURIComponent(numero)}/aceptar`, { method: "POST" });
    await refreshAfterMutation();
    await recargarHistorialPeticiones();
    await verUbicacionPedidoAceptado(numero);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function peticionUbicacionResumen(numero) {
  const detail = await apiOptional(`/api/peticiones/${encodeURIComponent(numero)}/detalle`, null);
  const items = detail?.items || [];
  const lines = items.map((item) => {
    const codigo = item.item_codigo || item.codigo || "";
    const descripcion = item.item_nombre || item.descripcion || "";
    const inv = inventoryRows().find((row) => sameText(itemValue(row, "codigo"), codigo))
      || inventoryRows().find((row) => sameText(itemValue(row, "descripcion"), descripcion));
    const ubicacion = inv ? itemValue(inv, "ubicacion") : "";
    return ubicacion ? `${codigo || descripcion}: ${ubicacion}` : "";
  }).filter(Boolean);
  if (!lines.length) return "Peticion aceptada. No hay ubicacion registrada para sus items.";
  return `Peticion aceptada. Ubicacion: ${lines.slice(0, 3).join(" · ")}${lines.length > 3 ? "..." : ""}`;
}

async function marcarSalidaPeticion(numero) {
  const ok = await pedirConfirmacion("Marcar salida de inventario", `Se validara stock y se descontaran los materiales de la peticion ${escapeHtml(numero)}.`, "📦 Marcar salida");
  if (!ok) return;
  try {
    await api(`/api/peticiones/${encodeURIComponent(numero)}/salida`, { method: "POST" });
    toast("Salida registrada y stock actualizado", "success");
    await refreshAfterMutation();
    renderHistorialPeticiones();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarPeticionHistorial(numero) {
  const ok = await pedirConfirmacion(
    "Eliminar peticion",
    `<p>Se eliminara la peticion ${escapeHtml(numero)} y su detalle. Esta accion no modifica stock ni elimina movimientos Kardex ya registrados.</p>`,
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/peticiones/${encodeURIComponent(numero)}`, { method: "DELETE" });
    toast("Peticion eliminada", "success");
    await refreshAfterMutation();
    await recargarHistorialPeticiones();
  } catch (err) {
    toast(err.message || "No se pudo eliminar peticion", "error");
  }
}

function verAviso(numero) {
  const aviso = state.avisos.find((a) => a.numero === numero);
  if (!aviso) return;
  pedirConfirmacion(`Aviso ${aviso.numero}`, avisoDetailHtml(aviso), "Cerrar");
}

function verOt(numero) {
  const ot = state.ots.find((o) => o.numero === numero);
  if (!ot) return;
  pedirConfirmacion(
    `OT ${numero}`,
    `<dl class="detail-grid">
      <dt>Equipo</dt><dd>${escapeHtml(ot.equipo || "-")}</dd>
      <dt>Sub-equipo</dt><dd>${escapeHtml(ot.sub_equipo || ot.componente || "-")}</dd>
      <dt>Codigo</dt><dd>${escapeHtml(ot.equipo_codigo || "-")}</dd>
      <dt>Estado</dt><dd>${escapeHtml(ot.estado || "-")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(ot.descripcion_trabajo || "-")}</dd>
      <dt>Trabajo realizado</dt><dd>${escapeHtml(ot.trabajo_realizado || "-")}</dd>
    </dl>`,
    "Cerrar"
  );
}

async function atenderItem(numero) {
  try {
    await api(`/api/peticiones/${numero}/atender`, { method: "POST" });
    confirmar("Item atendido correctamente", `Peticion ${numero} fue marcada como atendida.`);
    toast("Item atendido correctamente", "success");
    await refreshAfterMutation();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarAviso(numero) {
  const aviso = state.avisos.find((a) => a.numero === numero);
  const ok = await pedirConfirmacion(
    "Esta seguro de eliminar este aviso?",
    `<dl><dt>Aviso</dt><dd>${escapeHtml(numero)}</dd><dt>Equipo</dt><dd>${escapeHtml(aviso?.equipo || "-")}</dd><dt>Estado</dt><dd>${escapeHtml(aviso?.estado || "-")}</dd></dl><p class="muted">Se usara eliminacion logica para conservar trazabilidad.</p>`,
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/avisos/${encodeURIComponent(numero)}`, { method: "DELETE" });
    toast("Aviso eliminado de la lista correctamente", "success");
    await refreshAfterMutation();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarOtCalificar(numero) {
  const ot = state.ots.find((o) => o.numero === numero);
  const ok = await pedirConfirmacion(
    "Esta seguro de eliminar esta OT?",
    `<dl><dt>OT</dt><dd>${escapeHtml(numero)}</dd><dt>Equipo</dt><dd>${escapeHtml(ot?.equipo || "-")}</dd><dt>Estado</dt><dd>${escapeHtml(ot?.estado || "-")}</dd></dl><p class="muted">La OT quedara CANCELADA para conservar el historial y la trazabilidad.</p>`,
    "Eliminar"
  );
  if (!ok) return;
  try {
    await api(`/api/ots/${encodeURIComponent(numero)}`, { method: "DELETE" });
    toast("OT eliminada de la lista correctamente", "success");
    await refreshAfterMutation();
  } catch (err) {
    toast(err.message, "error");
  }
}

function prepararAtenderAviso(numero) {
  state.selectedAviso = state.avisos.find((a) => a.numero === numero);
  if (!state.selectedAviso) return;
  const aviso = state.selectedAviso;
  const avisoEquipo = aviso.equipo || "";
  const avisoCodigo = aviso.equipo_codigo || "";
  const avisoSubEquipo = aviso.sub_equipo || "";
  const hoy = new Date().toISOString().slice(0, 10);

  $("avisoSeleccionado").innerHTML = `
    <dl class="detail-grid">
      <dt>Aviso</dt><dd><strong>${escapeHtml(aviso.numero || "-")}</strong></dd>
      <dt>Fecha</dt><dd>${escapeHtml(String(aviso.creado_en || "").replace("T", " ").slice(0, 16) || "-")}</dd>
      <dt>Sede</dt><dd>${escapeHtml(aviso.sede || "-")}</dd>
      <dt>Ubicacion</dt><dd>${escapeHtml(aviso.ubicacion || "-")}</dd>
      <dt>Proceso</dt><dd>${escapeHtml(aviso.proceso || "-")}</dd>
      <dt>Sistema</dt><dd>${escapeHtml(aviso.sistema || "-")}</dd>
      <dt>Equipo</dt><dd>${escapeHtml(avisoEquipo || "-")}</dd>
      <dt>Codigo equipo</dt><dd>${escapeHtml(avisoCodigo || "-")}</dd>
      <dt>Sub-equipo</dt><dd>${escapeHtml(avisoSubEquipo || "-")}</dd>
      <dt>Falla reportada</dt><dd>${escapeHtml(aviso.tipo_falla || "-")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(aviso.descripcion || "-")}</dd>
    </dl>
  `;

  $("avisoOtForm").innerHTML = `
    <div class="form-block">
      <h3>Datos reportados en el aviso</h3>
      <p class="muted">Se precargan los campos disponibles del aviso. Complete solo los datos faltantes o necesarios para crear la OT.</p>
      <div class="form-block-grid">
        <label>Sede<input name="sede" value="${escapeHtml(aviso.sede || "")}"></label>
        <label>Ubicacion<input name="ubicacion" value="${escapeHtml(aviso.ubicacion || "")}"></label>
        <label>Proceso<input name="proceso" value="${escapeHtml(aviso.proceso || "")}"></label>
        <label>Sistema<input name="sistema" value="${escapeHtml(aviso.sistema || "")}"></label>
        <label>Equipo<select name="equipo" required></select></label>
        <label>Tipo equipo<select name="tipo_equipo" required></select></label>
        <label>Sub-equipo<select name="sub_equipo" required></select></label>
        <label>Codigo equipo<select name="equipo_codigo" required></select></label>
        <input type="hidden" name="componente" value="">
      </div>
    </div>
    <label>Interno / externo<select name="tipo_servicio" required><option>interno</option><option>externo</option></select></label>
    <input type="hidden" name="modo_equipo" value="aviso">
    <input type="hidden" name="rubro" value="${escapeHtml(aviso.rubro || "")}">
    <label>Tipo de falla<select name="tipo_falla" required>${otSelectOptions("tipo_falla", "")}</select></label>
    <label>Tipo intervencion<select name="tipo_intervencion" required>${otSelectOptions("tipo_intervencion", "")}</select></label>
    <label>Parada de linea<select name="parada_linea" required><option>No</option><option>Si</option></select></label>
    <label>Tecnico 1<select name="tecnico_1" data-tecnico-select required></select></label>
    <label>Tecnico 2<select name="tecnico_2" data-tecnico-select data-optional="true"></select></label>
    <label>Hora inicio<input name="hora_inicio" type="time" required></label>
    <label>Hora finalizacion<input name="hora_fin" type="time" required></label>
    <label>Fecha intervencion<input name="fecha_intervencion" type="date" value="${escapeHtml(hoy)}" required></label>
    <div class="form-block span-full" data-ot-extra-text="true">
      <h3>Descripcion de la falla y observacion</h3>
      <div class="form-block-grid">
        <label class="span-2">Descripcion de la falla<textarea name="descripcion_falla">${escapeHtml(aviso.descripcion || "")}</textarea></label>
        <label class="span-2">Observacion<textarea name="observaciones" placeholder="Observaciones adicionales"></textarea></label>
      </div>
    </div>
    <label class="span-2">Descripcion trabajo<textarea name="descripcion_trabajo" required>${escapeHtml(aviso.descripcion || "")}</textarea></label>
    <div class="form-actions span-full">
      <button class="secondary" type="button" onclick="$('avisoOtBox').classList.add('hidden')">Cancelar</button>
      <button class="primary" type="submit">✓ Atender aviso y crear OT</button>
    </div>
  `;
  renderAvisoOtEquipmentCombos(aviso);
  removeReferenceFieldsForOt();
  ensureOtTypeSelects($("avisoOtForm"));
  fillTechnicianSelects();
  bindRequiredIndicators($("avisoOtForm"));
  $("avisoOtBox").classList.remove("hidden");
  $("avisoOtBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

function prepareHistorialOtToolbar() {
  const seleccionar = $("seleccionarTodasOt");
  const generarPdf = $("exportarSeleccionadas");
  const imprimir = $("imprimirHistorialOt");
  const excel = $("exportarHistorialExcel");

  if (seleccionar) {
    seleccionar.classList.add("hidden");
    seleccionar.style.display = "none";
  }
  if (generarPdf) {
    generarPdf.classList.add("hidden");
    generarPdf.style.display = "none";
  }
  if (imprimir) {
    imprimir.textContent = "🖨 Imprimir OT";
    imprimir.classList.remove("hidden");
    imprimir.style.display = "";
  }
  if (excel) {
    excel.textContent = "📊 Exportar Excel";
    excel.classList.remove("hidden");
    excel.style.display = "";
  }
}

function prepararAtenderOt(numero) {
  const ot = state.ots.find((o) => o.numero === numero);
  if (!ot) return;
  state.selectedOt = ot;
  $("otSeleccionada").innerHTML = `
    <dl class="detail-grid">
      <dt>OT</dt><dd><strong>${escapeHtml(numero)}</strong></dd>
      <dt>Fecha</dt><dd>${escapeHtml(String(ot.creado_en || "").slice(0, 10) || "-")}</dd>
      <dt>Area</dt><dd>${escapeHtml(ot.ubicacion || ot.sede || "-")}</dd>
      <dt>Equipo</dt><dd>${escapeHtml(ot.equipo || "-")}</dd>
      <dt>Codigo</dt><dd>${escapeHtml(ot.equipo_codigo || "-")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(ot.descripcion_trabajo || "-")}</dd>
      <dt>Personal asignado</dt><dd>${escapeHtml(ot.tecnico_1 || "-")}</dd>
      <dt>Estado</dt><dd>${otStatusBadge(ot)}</dd>
    </dl>
  `;
  $("atenderOtBox").classList.remove("hidden");
  $("atenderOtForm").reset();
  $("atenderOtForm").elements.fecha_atencion.value = new Date().toISOString().slice(0, 10);
  $("atenderOtForm").elements.estado_final.value = "CERRADA";
  $("atenderOtTecnico").value = ot.tecnico_1 || "";
  renderPersonnelSelector("atenderOtPersonalSelector", "atenderOtTecnico");
  $("atenderOtBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function cerrarOtDirecta(numero) {
  const ot = state.ots.find((o) => o.numero === numero);
  if (!ot) return;
  const estado = String(ot.estado || "").toUpperCase();
  if (["CERRADA", "TERMINADA", "CALIFICADA", "CANCELADA"].includes(estado)) {
    toast("Esta OT ya no esta pendiente de cierre", "warning");
    return;
  }
  const ok = await pedirConfirmacion(
    `Esta seguro de cerrar la OT ${numero}?`,
    `<dl>
      <dt>OT</dt><dd>${escapeHtml(numero)}</dd>
      <dt>Area</dt><dd>${escapeHtml(ot.ubicacion || ot.sede || "-")}</dd>
      <dt>Equipo</dt><dd>${escapeHtml(ot.equipo || "-")}</dd>
      <dt>Estado actual</dt><dd>${escapeHtml(ot.estado || "-")}</dd>
    </dl>
    <form id="cerrarOtDirectaForm" class="compact-form">
      <label>Fecha de atencion<input name="fecha_atencion" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
    </form>`,
    "🔒 Cerrar OT"
  );
  if (!ok) return;
  try {
    await api(`/api/ots/${encodeURIComponent(numero)}/cerrar`, {
      method: "POST",
      body: JSON.stringify(formData($("cerrarOtDirectaForm"))),
    });
    confirmar("OT cerrada correctamente", `${numero} quedo en estado CERRADA.`);
    toast("OT cerrada correctamente", "success");
    if (state.selectedOt?.numero === numero) {
      $("atenderOtBox").classList.add("hidden");
      state.selectedOt = null;
    }
    await refreshAfterMutation();
    setView("cerrarOt");
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderConfig(tab) {
  ensureConfigAccessTab();
  state.currentConfigTab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "accesos") return renderAccesosConfig();
  if (tab === "resetSistema") return renderResetSistemaConfig();
  if (tab === "usuarios") return renderUsuarios();
  if (tab === "personal") return renderPersonalConfig();
  if (tab === "repuestos" || tab === "productos") return renderInventarioConfig(tab);
  const rows = state.catalogos[tab] || [];
  const columnsByTab = {
    equipos: ["estado", "ubicacion", "proceso", "sistema", "equipo", "sub_equipo", "codigo", "tipo_equipo", "sede"],
    repuestos: ["codigo", "nombre", "unidad", "stock", "estado"],
  };
  const labelsByKey = {
    estado: "ESTADO",
    ubicacion: "UBICACION",
    proceso: "PROCESO",
    sistema: "SISTEMA",
    equipo: "EQUIPO",
    sub_equipo: "SUB-EQUIPO",
    codigo: "CODIGO",
    tipo_equipo: "TIPO EQUIPO",
    sede: "SEDE",
  };
  const existingKeys = rows.length ? Object.keys(rows[0]) : columnsByTab[tab] || [];
  const columns = (columnsByTab[tab] || existingKeys).filter((key) => existingKeys.includes(key)).map((key) => ({ key, label: labelsByKey[key] || key.replaceAll("_", " ") }));
  $("configContent").innerHTML = `
    <div class="config-card-intro">
      <h3>${tab === "equipos" ? "Maestro de equipos" : "DB Repuestos"}</h3>
      <p>${tab === "equipos" ? "Este maestro es utilizado para generar avisos y OT. El orden de columnas respeta el Excel oficial." : "Maestro utilizado para peticiones de materiales y repuestos."}</p>
    </div>
    <div class="import-box">
      <label>Subir Excel para ${tab}<input type="file" id="excelFile" accept=".xlsx,.xls"></label>
      <button class="primary" onclick="importarExcel('${tab}')">📥 Importar</button>
    </div>
    <div class="table-wrap">${renderTable(rows, columns, null)}</div>
  `;
}

function renderInventarioConfig(tab) {
  const rows = state.catalogos[tab] || [];
  $("configContent").innerHTML = `
    <div class="config-card-intro">
      <h3>${tab === "productos" ? "DB Productos" : "DB Repuestos / Inventario"}</h3>
      <p>Maestro usado para almacen y peticiones. Se respetan las columnas del Excel: CODIGO, TIPO, CATEGORIA, AREA, DESCRIPCION, MODELO, CANTIDAD, UBICACION, PROOVEDOR y UNIDAD.</p>
    </div>
    <div class="import-box">
      <label>Subir Excel para ${tab}<input type="file" id="excelFile" accept=".xlsx,.xls"></label>
      <button class="primary" onclick="importarExcel('${tab}')">📥 Importar</button>
    </div>
    <div class="table-wrap">${renderTable(
      rows,
      [
        { key: "codigo", label: "CODIGO", render: (row) => escapeHtml(itemValue(row, "codigo")) },
        { key: "tipo", label: "TIPO", render: (row) => escapeHtml(itemValue(row, "tipo")) },
        { key: "categoria", label: "CATEGORIA", render: (row) => escapeHtml(itemValue(row, "categoria")) },
        { key: "area", label: "AREA", render: (row) => escapeHtml(itemValue(row, "area")) },
        { key: "descripcion", label: "DESCRIPCION", render: (row) => escapeHtml(itemValue(row, "descripcion")) },
        { key: "modelo", label: "MODELO", render: (row) => escapeHtml(itemValue(row, "modelo")) },
        { key: "cantidad", label: "CANTIDAD", render: (row) => escapeHtml(itemValue(row, "cantidad")) },
        { key: "ubicacion", label: "UBICACION", render: (row) => escapeHtml(itemValue(row, "ubicacion")) },
        { key: "proveedor", label: "PROOVEDOR", render: (row) => escapeHtml(itemValue(row, "proveedor")) },
        { key: "unidad", label: "UNIDAD", render: (row) => escapeHtml(itemValue(row, "unidad")) },
      ],
      null
    )}</div>
  `;
}

function renderPersonalConfig() {
  const filters = state.configFilters.personal || {};
  const q = state.configSearch.toLowerCase();
  const rows = (state.catalogos.personal || []).filter((p) => {
    const matchesQ = !q || ["nombre", "sede", "area", "cargo"].some((key) => String(personalValue(p, key)).toLowerCase().includes(q));
    const matchesSede = !filters.sede || personalValue(p, "sede") === filters.sede;
    const matchesArea = !filters.area || personalValue(p, "area") === filters.area;
    const matchesCargo = !filters.cargo || personalValue(p, "cargo") === filters.cargo;
    return matchesQ && matchesSede && matchesArea && matchesCargo;
  });
  $("configContent").innerHTML = `
    <div class="config-card-intro">
      <h3>DB Personal</h3>
      <p>Importe y consulte el maestro oficial de personal. CARGO = Tecnico aparece como responsable disponible para OT; CARGO/rol Jefe puede crear avisos y calificar OT.</p>
    </div>
    <div class="import-box">
      <label>Subir Excel para personal<input type="file" id="excelFile" accept=".xlsx,.xls"></label>
      <button class="primary" onclick="importarExcel('personal')">📥 Importar</button>
    </div>
    <div class="config-toolbar">
      <label>Buscar personal<input id="personalSearch" type="search" placeholder="Buscar por nombre, sede, area o cargo..." value="${escapeHtml(state.configSearch)}"></label>
      <label>Sede<select id="personalFilterSede"></select></label>
      <label>Area<select id="personalFilterArea"></select></label>
      <label>Cargo<select id="personalFilterCargo"></select></label>
    </div>
    <div class="table-wrap">
      ${renderTable(
        rows,
        [
          { key: "sede", label: "Sede", render: (row) => escapeHtml(personalValue(row, "sede")) },
          { key: "area", label: "Area", render: (row) => escapeHtml(personalValue(row, "area")) },
          { key: "nombre", label: "Nombre", render: (row) => escapeHtml(personalValue(row, "nombre")) },
          { key: "cargo", label: "Cargo", render: (row) => escapeHtml(personalValue(row, "cargo")) },
        ],
        null
      )}
    </div>
  `;
  fillSelect($("personalFilterSede"), [...new Set(state.catalogos.personal.map((p) => personalValue(p, "sede")).filter(Boolean))].sort(), "Todas", filters.sede || "");
  fillSelect($("personalFilterArea"), [...new Set(state.catalogos.personal.map((p) => personalValue(p, "area")).filter(Boolean))].sort(), "Todas", filters.area || "");
  fillSelect($("personalFilterCargo"), [...new Set(state.catalogos.personal.map((p) => personalValue(p, "cargo")).filter(Boolean))].sort(), "Todos", filters.cargo || "");
  $("personalSearch").addEventListener("input", (event) => {
    state.configSearch = event.target.value;
    renderPersonalConfig();
    $("personalSearch").focus();
  });
  ["Sede", "Area", "Cargo"].forEach((name) => {
    const id = `personalFilter${name}`;
    $(id).addEventListener("change", (event) => {
      state.configFilters.personal[name.toLowerCase()] = event.target.value;
      renderPersonalConfig();
    });
  });
}

function abrirPersonalForm(id = null) {
  const row = id ? state.catalogos.personal.find((p) => Number(p.id) === Number(id)) : {};
  const box = $("personalFormBox");
  box.classList.remove("hidden");
  box.innerHTML = `
    <h3>${id ? "Editar personal" : "Nuevo personal"}</h3>
    <form id="personalForm" class="form-grid">
      <label>Sede<input name="sede" value="${escapeHtml(personalValue(row, "sede"))}"></label>
      <label>Area<input name="area" value="${escapeHtml(personalValue(row, "area"))}"></label>
      <label>Nombre<input name="nombre" value="${escapeHtml(personalValue(row, "nombre"))}" required></label>
      <label>Cargo<input name="cargo" value="${escapeHtml(personalValue(row, "cargo"))}"></label>
      <div class="form-actions span-full">
        <button class="secondary" type="button" onclick="$('personalFormBox').classList.add('hidden')">Cancelar</button>
        <button class="primary" type="submit">✓ Guardar</button>
      </div>
    </form>
  `;
  $("personalForm").addEventListener("submit", (event) => guardarPersonal(event, id));
}

async function guardarPersonal(event, id) {
  event.preventDefault();
  const data = formData(event.target);
  if (!data.nombre) return toast("Personal sin nombre", "warning");
  const ok = await pedirConfirmacion(
    id ? "Desea actualizar este personal?" : "Desea registrar este personal?",
    `<dl>
      <dt>Sede</dt><dd>${escapeHtml(data.sede || "-")}</dd>
      <dt>Area</dt><dd>${escapeHtml(data.area || "-")}</dd>
      <dt>Nombre</dt><dd>${escapeHtml(data.nombre || "-")}</dd>
      <dt>Cargo</dt><dd>${escapeHtml(data.cargo || "-")}</dd>
    </dl>`,
    "Confirmar"
  );
  if (!ok) return;
  try {
    await api(id ? `/api/catalogos/personal/${id}` : "/api/catalogos/personal", {
      method: id ? "PATCH" : "POST",
      body: JSON.stringify(data),
    });
    toast(id ? "Personal actualizado correctamente" : "Personal registrado correctamente", "success");
    $("personalFormBox").classList.add("hidden");
    await loadAll({ forceRender: true });
    renderConfig("personal");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarPersonal(id) {
  const ok = await pedirConfirmacion("Desea eliminar este personal?", "Esta accion elimina el registro de la tabla de personal.", "Eliminar");
  if (!ok) return;
  try {
    await api(`/api/catalogos/personal/${id}`, { method: "DELETE" });
    toast("Personal eliminado correctamente", "success");
    await loadAll({ forceRender: true });
  } catch (err) {
    toast(err.message, "error");
  }
}

async function importarExcel(tabla) {
  const file = $("excelFile").files[0];
  if (!file) return toast("Selecciona un Excel", "warning");
  const body = new FormData();
  body.append("archivo", file);
  try {
    const result = await api(`/api/importar/${tabla}`, { method: "POST", body });
    const detalle = result.nuevos !== undefined
      ? `Registros nuevos: ${result.nuevos || 0}. Actualizados: ${result.actualizados || 0}. Duplicados: ${result.duplicados || 0}. Errores: ${result.errores || 0}.`
      : `${result.importados} registros cargados en ${tabla}.`;
    confirmar("Importacion completada", detalle);
    toast("Datos cargados correctamente", "success");
    await loadAll({ forceRender: true });
    renderConfig(tabla);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function renderUsuarios() {
  if (state.user.role !== "admin") {
    $("configContent").innerHTML = "<p>Solo el administrador puede configurar usuarios.</p>";
    return;
  }
  try {
    const users = await api("/api/users");
    $("configContent").innerHTML = `
      <div class="config-card-intro">
        <h3>DB Usuarios</h3>
        <p>Gestiona cuentas de acceso. La eliminacion desactiva el usuario para conservar trazabilidad historica.</p>
      </div>
      <div class="import-box">
        <label>Importar Excel de usuarios<input type="file" id="excelFile" accept=".xlsx,.xls"></label>
        <button class="secondary" type="button" onclick="importarExcel('usuarios')">📥 Importar Excel</button>
      </div>
      <form id="userForm" class="form-grid">
        <h3 class="span-full">Agregar usuario manualmente</h3>
        <label>Usuario<input name="username" required></label>
        <label>Nombre<input name="full_name" required></label>
        <label>Apellidos<input name="apellidos"></label>
        <label>DNI / Codigo<input name="dni_codigo"></label>
        <label>Area<input name="area"></label>
        <label>Cargo<input name="cargo"></label>
        <label>Clave<input name="password" type="password" required></label>
        <label>Rol<select name="role" required><option value="admin">ADMINISTRADOR</option><option value="supervisor">SUPERVISOR</option><option value="jefe">JEFE DE AREA</option><option value="tecnico" selected>MANTENIMIENTO / TECNICO</option><option value="almacen">ALMACEN</option></select></label>
        <label>Estado<select name="active"><option value="true">ACTIVO</option><option value="false">INACTIVO</option></select></label>
        <div class="form-actions span-full"><button class="primary" type="submit">+ Agregar usuario</button></div>
      </form>
      <br>
      <div class="table-wrap">
        ${renderTable(
          users,
          [
            { key: "username", label: "Usuario" },
            { key: "full_name", label: "Nombre" },
            { key: "apellidos", label: "Apellidos" },
            { key: "dni_codigo", label: "DNI / Codigo" },
            { key: "area", label: "Area" },
            { key: "cargo", label: "Cargo" },
            { key: "role", label: "Rol" },
            { key: "active", label: "Estado", render: (row) => badge(row.active ? "ACTIVO" : "INACTIVO") },
          ],
          (row) => `<button onclick="resetClave('${row.username}')">🔑 Cambiar clave</button><button class="danger" onclick="eliminarUsuario('${row.username}')">🗑 Eliminar</button>`
        )}
      </div>
    `;
    $("userForm").addEventListener("submit", crearUsuario);
    bindRequiredIndicators($("userForm"));
  } catch (err) {
    toast(err.message, "error");
  }
}

async function crearUsuario(event) {
  event.preventDefault();
  if (!validateRequiredForm(event.target)) return;
  const data = formData(event.target);
  data.active = data.active === "true";
  const ok = await pedirConfirmacion(
    "Desea registrar este usuario?",
    `<dl><dt>Usuario</dt><dd>${escapeHtml(data.username)}</dd><dt>Nombre</dt><dd>${escapeHtml(data.full_name)}</dd><dt>Rol</dt><dd>${escapeHtml(data.role)}</dd><dt>Estado</dt><dd>${data.active ? "ACTIVO" : "INACTIVO"}</dd></dl>`,
    "Confirmar"
  );
  if (!ok) return;
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(data) });
    confirmar("Usuario creado", "El usuario ya puede iniciar sesion.");
    toast("Usuario creado correctamente", "success");
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarUsuario(username) {
  const ok = await pedirConfirmacion("Esta seguro de eliminar este usuario?", `El usuario ${escapeHtml(username)} quedara INACTIVO para conservar historial.`, "Eliminar");
  if (!ok) return;
  try {
    await api(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    toast("Usuario desactivado correctamente", "success");
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function resetClave(username) {
  const password = prompt(`Nueva clave para ${username}`);
  if (!password) return;
  try {
    await api(`/api/users/${encodeURIComponent(username)}`, { method: "PATCH", body: JSON.stringify({ password }) });
    confirmar("Clave actualizada", `Se cambio la clave de ${username}.`);
    toast("Clave actualizada correctamente", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function avisoResumenHtml(data) {
  return `
    <dl>
      <dt>Equipo</dt><dd>${escapeHtml(data.equipo || "Sin equipo")}</dd>
      <dt>Sub-equipo</dt><dd>${escapeHtml(data.sub_equipo || "Sin sub-equipo")}</dd>
      <dt>Codigo</dt><dd>${escapeHtml(data.equipo_codigo || "Sin codigo")}</dd>
      <dt>Prioridad</dt><dd>${escapeHtml(data.prioridad || "")}</dd>
      <dt>Tipo de falla</dt><dd>${escapeHtml(data.tipo_falla || "")}</dd>
    </dl>
  `;
}

function otResumenHtml(data) {
  return `
    <dl>
      <dt>Equipo</dt><dd>${escapeHtml(data.equipo || "Sin equipo")}</dd>
      <dt>Codigo</dt><dd>${escapeHtml(data.equipo_codigo || "Sin codigo")}</dd>
      <dt>Tecnico</dt><dd>${escapeHtml(data.tecnico_1 || "")}</dd>
      <dt>Fecha</dt><dd>${escapeHtml(data.fecha_intervencion || "")}</dd>
      <dt>Trabajo</dt><dd>${escapeHtml(data.descripcion_trabajo || "")}</dd>
    </dl>
  `;
}

async function descargarPdfOt(numero) {
  try {
    const blob = await api(`/api/ots/${numero}/pdf`);
    downloadBlob(blob, `${numero}.pdf`);
    toast("PDF generado correctamente", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function exportarPdfMasivo() {
  return imprimirHistorialOt();
}

async function renderAccesosConfig() {
  if (String(state.user?.role || "").toLowerCase() !== "admin") {
    $("configContent").innerHTML = "<p>Solo el administrador puede configurar accesos.</p>";
    return;
  }
  $("configContent").innerHTML = '<p class="muted">Cargando usuarios y accesos...</p>';
  let users = [];
  try {
    users = await api("/api/users");
  } catch (err) {
    $("configContent").innerHTML = `<p class="empty-state">No se pudieron cargar usuarios: ${escapeHtml(err.message)}</p>`;
    return;
  }
  users = users.filter((user) => user.active !== false && user.active !== 0);
  $("configContent").innerHTML = `
    <div class="config-card-intro">
      <h3>Accesos por usuario</h3>
      <p>El administrador define qué ventanas puede abrir cada usuario creado. Si no hay casillas guardadas para un usuario, se conserva la regla por cargo de DB Personal.</p>
    </div>
    <div class="form-actions">
      <button class="primary" type="button" id="saveAccessMatrix">✓ Guardar accesos</button>
      <button class="secondary" type="button" id="resetAccessMatrix">Restablecer regla por cargo</button>
    </div>
    <div class="access-matrix">
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            ${configurableViews.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${users.map((user) => {
            const key = accessUserKey(user);
            const personal = findPersonalForUser(user);
            const defaultAllowed = (viewId) => viewDefaultAccessForUser(user, personal, viewId);
            const configured = state.accessMatrix[key] || {};
            return `
              <tr data-access-user="${escapeHtml(key)}">
                <td>
                  <strong>${escapeHtml(user.full_name || user.username)}</strong><br>
                  <span class="muted">${escapeHtml(user.username || "")} · ${escapeHtml(user.cargo || personalValue(personal, "cargo") || user.role || "")}</span>
                </td>
                ${configurableViews.map(([viewId]) => {
                  const checked = configured[viewId] !== undefined ? configured[viewId] !== false : defaultAllowed(viewId);
                  return `<td><input type="checkbox" data-access-view="${escapeHtml(viewId)}" ${checked ? "checked" : ""}></td>`;
                }).join("")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="subpanel">
      <h3>Asistente Cielo</h3>
      <label><input id="voiceEnabledConfig" type="checkbox" ${state.voice.enabled ? "checked" : ""}> Activar escucha por voz al iniciar sesion</label>
      <div class="voice-config-grid">
        <label>Palabra de activacion<input id="voiceWakeWordConfig" value="${escapeHtml(state.voice.wakeWord)}" placeholder="hey cielo"></label>
        <label>Voz<select id="voiceNameConfig"></select></label>
        <label>Velocidad<input id="voiceRateConfig" type="range" min="0.8" max="1.3" step="0.1" value="${escapeHtml(state.voice.rate)}"></label>
        <label>Tono<input id="voicePitchConfig" type="range" min="0.8" max="1.3" step="0.1" value="${escapeHtml(state.voice.pitch)}"></label>
      </div>
      <div class="form-actions">
        <button class="primary" type="button" id="saveVoiceConfig">✓ Guardar configuracion del asistente</button>
        <button class="secondary" type="button" id="testVoiceConfig">🔊 Probar voz</button>
      </div>
      <p class="muted">La escucha depende del permiso del navegador y de que la pagina este abierta. Cielo responde ayuda de uso y datos reales cargados del sistema.</p>
    </div>
  `;
  populateVoiceSelect();
  $("voiceEnabledConfig")?.addEventListener("change", (event) => {
    state.voice.enabled = event.target.checked;
    localStorage.setItem("mantto_voice_enabled", String(state.voice.enabled));
    if (state.voice.enabled) startVoiceAssistant();
    else stopVoiceAssistant();
    toast(state.voice.enabled ? "Asistente Cielo activado" : "Asistente Cielo desactivado", "success");
  });
  $("saveVoiceConfig")?.addEventListener("click", saveVoiceAssistantConfig);
  $("testVoiceConfig")?.addEventListener("click", () => {
    saveVoiceAssistantConfig(false);
    speakCielo("Hola, soy Cielo. Estoy lista para ayudarte con MANTTO.");
  });
  $("saveAccessMatrix")?.addEventListener("click", () => {
    const matrix = {};
    document.querySelectorAll("[data-access-user]").forEach((row) => {
      const key = row.dataset.accessUser;
      matrix[key] = {};
      row.querySelectorAll("[data-access-view]").forEach((check) => {
        matrix[key][check.dataset.accessView] = check.checked;
      });
    });
    state.accessMatrix = matrix;
    localStorage.setItem("mantto_access_matrix", JSON.stringify(state.accessMatrix));
    updateRoleUi();
    toast("Accesos guardados correctamente", "success");
  });
  $("resetAccessMatrix")?.addEventListener("click", () => {
    state.accessMatrix = {};
    localStorage.removeItem("mantto_access_matrix");
    updateRoleUi();
    renderAccesosConfig();
    toast("Accesos restablecidos a la regla por cargo", "success");
  });
}

function renderResetSistemaConfig() {
  if (String(state.user?.role || "").toLowerCase() !== "admin") {
    $("configContent").innerHTML = "<p>Solo el administrador puede resetear el sistema.</p>";
    return;
  }
  $("configContent").innerHTML = `
    <div class="config-card-intro">
      <h3>Reset sistema</h3>
      <p>Deja en cero los datos operativos: OT, avisos, atenciones, calificaciones, peticiones, historial y movimientos Kardex. No borra usuarios, DB Personal, DB Equipos, productos ni repuestos.</p>
    </div>
    <div class="subpanel">
      <label>Confirmacion obligatoria
        <input id="resetSistemaConfirmText" autocomplete="off" placeholder="Escriba RESET MANTTO">
      </label>
      <p class="muted">Use esta opcion para limpiar datos de prueba sin afectar los maestros importados.</p>
      <div class="form-actions">
        <button class="danger" type="button" id="resetSistemaBtn">Reset sistema</button>
      </div>
    </div>
  `;
  $("resetSistemaBtn")?.addEventListener("click", resetSistema);
}

async function resetSistema() {
  const text = String($("resetSistemaConfirmText")?.value || "").trim().toUpperCase();
  if (text !== "RESET MANTTO") {
    toast("Escriba RESET MANTTO para confirmar", "warning");
    return;
  }
  const ok = await pedirConfirmacion(
    "Reset sistema",
    "<p>Se borraran los datos operativos y el sistema quedara en cero. No se borraran usuarios ni maestros.</p>",
    "Reset sistema"
  );
  if (!ok) return;
  try {
    await api("/api/admin/reset-sistema", { method: "POST" });
    state.ots = [];
    state.avisos = [];
    state.peticiones = [];
    state.historialPeticiones = [];
    state.calificaciones = [];
    state.inventarioMovimientos = [];
    toast("Sistema reiniciado correctamente", "success");
    await loadAll({ forceRender: true, silent: true });
    setView("home");
  } catch (err) {
    toast(err.message || "No se pudo resetear sistema", "error");
  }
}

function populateVoiceSelect() {
  const select = $("voiceNameConfig");
  if (!select || !("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith("es"));
  const options = preferred.length ? preferred : voices;
  select.innerHTML = `<option value="">Voz automatica</option>${options.map((voice) => `
    <option value="${escapeHtml(voice.name)}" ${voice.name === state.voice.voiceName ? "selected" : ""}>${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>
  `).join("")}`;
  if (!select.value && state.voice.voiceName) select.value = state.voice.voiceName;
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
}

function saveVoiceAssistantConfig(showToast = true) {
  state.voice.enabled = Boolean($("voiceEnabledConfig")?.checked);
  state.voice.wakeWord = String($("voiceWakeWordConfig")?.value || "hey cielo").trim().toLowerCase() || "hey cielo";
  state.voice.voiceName = $("voiceNameConfig")?.value || "";
  state.voice.rate = Number($("voiceRateConfig")?.value || 1);
  state.voice.pitch = Number($("voicePitchConfig")?.value || 1);
  localStorage.setItem("mantto_voice_enabled", String(state.voice.enabled));
  localStorage.setItem("mantto_voice_wake_word", state.voice.wakeWord);
  localStorage.setItem("mantto_voice_name", state.voice.voiceName);
  localStorage.setItem("mantto_voice_rate", String(state.voice.rate));
  localStorage.setItem("mantto_voice_pitch", String(state.voice.pitch));
  document.querySelector(".cielo-panel-head span") && (document.querySelector(".cielo-panel-head span").textContent = `Escucha "${state.voice.wakeWord}"`);
  if (state.voice.enabled) startVoiceAssistant();
  else stopVoiceAssistant();
  if (showToast) toast("Configuracion del asistente guardada", "success");
}

function findPersonalForUser(user) {
  const candidates = [user.username, user.full_name, user.dni_codigo].map(compactText).filter(Boolean);
  return (state.catalogos.personal || []).find((p) => {
    const values = [personalValue(p, "nombre"), p.codigo, p.username, p.usuario, p.dni_codigo, p.dni].map(compactText).filter(Boolean);
    return values.some((value) => candidates.includes(value));
  }) || null;
}

function viewDefaultAccessForUser(user, personal, viewId) {
  if (String(user?.role || "").toLowerCase() === "admin") return true;
  const cargo = normalizeText(user?.cargo || personalValue(personal, "cargo") || "");
  const jefe = ["jefe", "jefe de area", "supervisor", "admin", "administrador"].includes(cargo);
  if (["aviso", "cerrarOt", "calificarOt", "historialCalificaciones", "atenderAviso"].includes(viewId)) return jefe;
  return true;
}

function renderVoiceAssistant() {
  const panelReady = $("cieloAssistantPanel") && $("voiceStartBtn") && $("voiceStopBtn");
  if (!panelReady) ensureVoiceAssistantUi();
  bindVoiceAssistantControls();
  updateVoiceStatus();
}

function bindVoiceAssistantControls() {
  const start = $("voiceStartBtn");
  const stop = $("voiceStopBtn");
  if (start && !start.dataset.bound) {
    start.dataset.bound = "true";
    start.addEventListener("click", () => {
      state.voice.enabled = true;
      localStorage.setItem("mantto_voice_enabled", "true");
      startVoiceAssistant();
    });
  }
  if (stop && !stop.dataset.bound) {
    stop.dataset.bound = "true";
    stop.addEventListener("click", () => {
      state.voice.enabled = false;
      localStorage.setItem("mantto_voice_enabled", "false");
      stopVoiceAssistant();
    });
  }
  const form = $("cieloTextForm");
  if (form && !form.dataset.bound) {
    form.dataset.bound = "true";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("cieloTextInput");
      const question = String(input?.value || "").trim();
      if (!question) return;
      if ($("voiceTranscript")) $("voiceTranscript").textContent = question;
      const response = answerCielo(question, { requireWakeWord: false });
      updateVoiceStatus(response);
      speakCielo(response);
      input.value = "";
    });
  }
  updateVoiceStatus();
}

function updateVoiceStatus(message = "") {
  const status = $("voiceStatus");
  if (!status) return;
  status.textContent = message || (state.voice.listening ? 'Escuchando. Diga "hey cielo".' : "Asistente detenido.");
}

function startVoiceAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    updateVoiceStatus("Este navegador no soporta reconocimiento de voz.");
    toast("El navegador no soporta reconocimiento de voz", "warning");
    return;
  }
  if (!state.voice.recognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "es-PE";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const text = String(result?.[0]?.transcript || "").trim();
      if (!text) return;
      if ($("voiceTranscript")) $("voiceTranscript").textContent = text;
      handleVoiceCommand(text);
    };
    recognition.onerror = () => {
      state.voice.listening = false;
      updateVoiceStatus("La escucha se detuvo. Active nuevamente si el navegador lo solicita.");
    };
    recognition.onend = () => {
      state.voice.listening = false;
      updateVoiceStatus();
      if (state.voice.enabled) {
        setTimeout(() => {
          if (state.voice.enabled) startVoiceAssistant();
        }, 700);
      }
    };
    state.voice.recognition = recognition;
  }
  try {
    state.voice.recognition.start();
    state.voice.listening = true;
    updateVoiceStatus();
  } catch (err) {
    updateVoiceStatus("La escucha ya esta activa o el navegador bloqueo el microfono.");
  }
}

function stopVoiceAssistant() {
  state.voice.enabled = false;
  if (state.voice.recognition) {
    try {
      state.voice.recognition.stop();
    } catch (err) {
      // No action needed.
    }
  }
  state.voice.listening = false;
  updateVoiceStatus();
}

function speakCielo(message) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "es-PE";
  utterance.rate = Number(state.voice.rate || 1);
  utterance.pitch = Number(state.voice.pitch || 1);
  const voices = window.speechSynthesis.getVoices();
  const selected = voices.find((voice) => voice.name === state.voice.voiceName);
  if (selected) utterance.voice = selected;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function handleVoiceCommand(rawText) {
  const response = answerCielo(rawText, { requireWakeWord: true });
  if (!response) return;
  updateVoiceStatus(response);
  speakCielo(response);
}

function answerCielo(rawText, options = {}) {
  const text = normalizeText(rawText);
  const wake = normalizeText(state.voice.wakeWord || "hey cielo");
  if (options.requireWakeWord && !text.includes(wake)) return "";
  const command = options.requireWakeWord ? text.replace(wake, "").trim() : text;
  let response = "Estoy lista. Puede pedirme abrir inicio, generar OT, historial de OT, cerrar OT, calificar OT, almacen o configuracion.";
  if (command.includes("inicio")) {
    setView("home");
    response = "Abriendo inicio.";
  } else if (command.includes("generar ot") || command.includes("orden de trabajo")) {
    setView("ot");
    response = "Abriendo generar OT.";
  } else if (command.includes("generar aviso") || command.includes("aviso")) {
    setView("aviso");
    response = "Abriendo generar aviso.";
  } else if (command.includes("historial")) {
    setView("historialOt");
    response = "Abriendo historial de OT.";
  } else if (command.includes("cerrar ot")) {
    setView("cerrarOt");
    response = "Abriendo cerrar OT.";
  } else if (command.includes("calificar")) {
    setView("calificarOt");
    response = "Abriendo calificar OT.";
  } else if (command.includes("almacen")) {
    setView("almacen");
    response = "Abriendo almacen.";
  } else if (command.includes("ubicacion") || command.includes("donde esta") || command.includes("donde se encuentra")) {
    response = answerInventoryLocation(command);
  } else if (command.includes("configuracion")) {
    setView("config");
    response = "Abriendo configuracion.";
  } else if (command.includes("peticion")) {
    setView("peticion");
    response = "Abriendo peticiones.";
  } else if (command.includes("pedido aceptado") || command.includes("pedidos aceptados") || command.includes("aceptados")) {
    setView("pedidosAceptados");
    response = "Abriendo pedidos aceptados. Seleccione Ver ubicacion para que le indique donde esta el material.";
  } else if (command.includes("cuantos avisos")) {
    response = `Hay ${dashboardMetrics().avisosAbiertos} avisos abiertos.`;
  } else if (command.includes("cuantas ot") || command.includes("ordenes abiertas") || command.includes("ot abiertas")) {
    response = `Hay ${dashboardMetrics().otsAbiertas} ordenes de trabajo abiertas.`;
  } else if (command.includes("ot cerradas")) {
    response = `Hay ${dashboardMetrics().otsCerradas} ordenes de trabajo cerradas.`;
  } else if (command.includes("equipos")) {
    response = `Hay ${state.catalogos.equipos.length} equipos cargados en la base de datos.`;
  } else if (command.includes("por calificar")) {
    response = `Hay ${dashboardMetrics().porCalificar} ordenes de trabajo por calificar.`;
  } else if (command.includes("imprimir")) {
    response = "Para imprimir OT, entre a Historial de OT, seleccione las ordenes y presione Imprimir OT. El PDF sale con dos vales por hoja A4.";
  } else if (command.includes("crear aviso") || command.includes("generar aviso")) {
    response = "Para generar un aviso, use Generar aviso, seleccione sede, ubicacion, proceso y sistema o busque por codigo, escriba la descripcion y registre.";
  } else if (command.includes("crear ot") || command.includes("generar ot")) {
    response = "Para generar una OT, use Generar OT, cargue los datos del equipo, complete tecnico, horarios, fecha y descripcion del trabajo.";
  } else if (command.includes("cerrar aviso")) {
    response = "Para atender un aviso, use Atender aviso, revise el detalle y presione Atender.";
  } else if (command.includes("cerrar ot")) {
    response = "Para cerrar una OT, use Cerrar OT, seleccione la orden pendiente, registre el trabajo realizado y confirme el cierre.";
  } else if (command.includes("calificar")) {
    response = "Para calificar, use Calificar OT. Solo se califican ordenes cerradas y el acceso depende del permiso configurado por el administrador.";
  } else if (command.includes("acceso") || command.includes("permiso")) {
    response = "Los accesos se configuran en Configuracion, pestaña Accesos. El administrador marca las ventanas permitidas para cada usuario.";
  } else if (command.includes("ayuda") || command.includes("que puedes")) {
    response = "Puedo abrir ventanas, explicar como crear avisos, generar OT, cerrar avisos, cerrar OT, calificar, imprimir y consultar conteos reales del dashboard.";
  }
  return response;
}

function answerInventoryLocation(command) {
  const cleaned = normalizeText(command)
    .replace(/\b(buscar|busca|ubicacion|donde|esta|se|encuentra|material|item|producto|repuesto|codigo|por|favor|de|del|la|el)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Indique el codigo o descripcion del item para buscar su ubicacion en almacen.";
  const rows = inventoryRows();
  const found = rows.find((row) => {
    const code = normalizeText(itemValue(row, "codigo"));
    const desc = normalizeText(itemValue(row, "descripcion"));
    return cleaned && (code.includes(cleaned) || cleaned.includes(code) || desc.includes(cleaned) || cleaned.includes(desc));
  }) || rows.find((row) => {
    const haystack = normalizeText(`${itemValue(row, "codigo")} ${itemValue(row, "descripcion")}`);
    return cleaned.split(" ").filter(Boolean).every((part) => haystack.includes(part));
  });
  if (!found) return "No encontre ese item en almacen. Puede decir: hey cielo, buscar ubicacion y luego el codigo o descripcion.";
  const codigo = itemValue(found, "codigo") || "sin codigo";
  const descripcion = itemValue(found, "descripcion") || "sin descripcion";
  const ubicacion = itemValue(found, "ubicacion") || "sin ubicacion registrada";
  const cantidad = inventoryNumber(found, "cantidad").toLocaleString("es-PE");
  const unidad = itemValue(found, "unidad") || "";
  return `${descripcion}, codigo ${codigo}, esta en ${ubicacion}. Stock actual: ${cantidad} ${unidad}.`;
}

async function exportarHistorialExcel() {
  const params = new URLSearchParams(getHistorialFilters());
  try {
    const blob = await api(`/api/ots/exportar-excel?${params.toString()}`);
    downloadBlob(blob, `HISTORIAL_OT_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Historial exportado a Excel", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function imprimirHistorialOt() {
  const rows = filterOtRows(state.ots, getHistorialFilters(), false);
  if (!rows.length) return toast("No hay OT para imprimir", "warning");
  const visible = rows.map((ot) => ot.numero).filter(Boolean);
  const visibleSet = new Set(visible);
  const selected = [...state.selectedBulkOts].filter((numero) => visibleSet.has(numero));
  const numeros = selected.length ? selected : visible;
  if (!numeros.length) return toast("No hay OT para imprimir", "warning");

  try {
    const blob = await api(`/api/ots/imprimir-pdf?numeros=${encodeURIComponent(numeros.join(","))}`);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) downloadBlob(blob, `ORDENES_TRABAJO_${new Date().toISOString().slice(0, 10)}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`PDF de impresion generado: ${numeros.length} OT`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function validateRequiredForm(form) {
  const missing = [];
  form.querySelectorAll("[required]").forEach((field) => {
    const empty = !String(field.value || "").trim();
    field.classList.toggle("field-required-empty", empty);
    field.closest("label")?.classList.toggle("label-required-empty", empty);
    if (empty) missing.push(field.closest("label")?.childNodes?.[0]?.textContent?.trim() || field.name || field.id);
  });
  if (missing.length) {
    toast(`No se puede guardar. Faltan: ${missing.join(", ")}`, "warning");
    return false;
  }
  return true;
}

function bindRequiredIndicators(root = document) {
  root.querySelectorAll("input[required], select[required], textarea[required]").forEach((field) => {
    const update = () => {
      const empty = !String(field.value || "").trim();
      field.classList.toggle("field-required-empty", empty);
      field.closest("label")?.classList.toggle("label-required-empty", empty);
    };
    field.removeEventListener("input", field._requiredUpdate);
    field.removeEventListener("change", field._requiredUpdate);
    field._requiredUpdate = update;
    field.addEventListener("input", update);
    field.addEventListener("change", update);
    update();
  });
}

function setDateRange(range, formId = "historialFilters") {
  const form = $(formId);
  if (!form) return;
  const today = new Date();
  const iso = (date) => date.toISOString().slice(0, 10);
  const start = new Date(today);
  const end = new Date(today);
  if (range === "yesterday") {
    start.setDate(today.getDate() - 1);
    end.setDate(today.getDate() - 1);
  } else if (range === "7days") {
    start.setDate(today.getDate() - 6);
  } else if (range === "month") {
    start.setDate(1);
  } else if (range === "all") {
    form.elements.desde.value = "";
    form.elements.hasta.value = "";
    renderFilterOwner(formId);
    return;
  }
  form.elements.desde.value = iso(start);
  form.elements.hasta.value = iso(end);
  renderFilterOwner(formId);
}

function renderFilterOwner(formId) {
  if (formId === "calificarOtFilters") renderCalificarOt();
  else if (formId === "cerrarOtFilters") renderOtsPendientes();
  else if (formId === "calificacionesFilters") renderHistorialCalificaciones();
  else renderHistorialOt();
}

const ratingFactorDefs = [
  ["limpieza", "Limpieza", "Que tan satisfecho esta con la limpieza dejada despues del trabajo?"],
  ["calidad", "Calidad del trabajo", "Que tan satisfecho esta con la calidad del trabajo realizado?"],
  ["tiempo", "Tiempo de atencion", "Que tan satisfecho esta con el tiempo de atencion de la OT?"],
  ["orden", "Orden", "Que tan satisfecho esta con el orden durante y despues del trabajo?"],
];

async function abrirCalificacion(numero) {
  const ot = state.ots.find((o) => o.numero === numero);
  if (!ot) return;
  const estado = String(ot.estado || "").toUpperCase();
  state.selectedRatingOt = ot;
  try {
    const existing = await api(`/api/ots/${numero}/calificacion`);
    if (existing && (existing.promedio || existing.calificacion)) {
      await pedirConfirmacion(
        `Calificacion ${numero}`,
        `<dl>
          <dt>Calidad</dt><dd>${escapeHtml(existing.calidad || existing.calificacion || "-")}/5</dd>
          <dt>Limpieza</dt><dd>${escapeHtml(existing.limpieza || existing.calificacion || "-")}/5</dd>
          <dt>Tiempo</dt><dd>${escapeHtml(existing.tiempo || existing.calificacion || "-")}/5</dd>
          <dt>Orden</dt><dd>${escapeHtml(existing.orden || existing.calificacion || "-")}/5</dd>
          <dt>Promedio</dt><dd>${escapeHtml(existing.promedio || existing.calificacion || "-")}/5</dd>
          <dt>Comentario</dt><dd>${escapeHtml(existing.comentario || "-")}</dd>
        </dl>`,
        "Cerrar"
      );
      return;
    }
  } catch (err) {
    toast(err.message, "error");
    return;
  }
  if (estado !== "CERRADA") {
    toast("Solo se puede calificar una OT cerrada. Use primero Cerrar OT's.", "warning");
    state.selectedRatingOt = null;
    return;
  }
  $("ratingSummary").innerHTML = `
    <h4>OT seleccionada</h4>
    <dl>
      <dt>OT</dt><dd>${escapeHtml(ot.numero)}</dd>
      <dt>Area</dt><dd>${escapeHtml(ot.ubicacion || ot.sede || "-")}</dd>
      <dt>Equipo</dt><dd>${escapeHtml(ot.equipo || "-")}</dd>
      <dt>Fecha</dt><dd>${escapeHtml(String(ot.creado_en || "").slice(0, 10) || "-")}</dd>
      <dt>Descripcion</dt><dd>${escapeHtml(ot.descripcion_trabajo || "-")}</dd>
      <dt>Tecnico</dt><dd>${escapeHtml(ot.tecnico_1 || "-")}</dd>
      <dt>Fecha de cierre</dt><dd>${escapeHtml(ot.fecha_atencion || "-")}</dd>
      <dt>Trabajo realizado</dt><dd>${escapeHtml(ot.trabajo_realizado || "-")}</dd>
    </dl>
  `;
  $("ratingForm").reset();
  renderRatingFactors();
  $("serviceRatingModal").classList.remove("hidden");
}

async function verDetalleCalificacion(numero) {

  
  try {
    const existing = await api(`/api/ots/${numero}/calificacion`);
    if (!existing || (!existing.promedio && !existing.calificacion)) {
      toast("Esta OT no tiene calificacion registrada", "warning");
      return;
    }
    await pedirConfirmacion(
      `Calificacion ${numero}`,
      `<dl>
        <dt>Usuario que califico</dt><dd>${escapeHtml(existing.usuario || "-")}</dd>
        <dt>Fecha</dt><dd>${escapeHtml(String(existing.fecha || "").replace("T", " ").slice(0, 16))}</dd>
        <dt>Limpieza</dt><dd>${escapeHtml(existing.limpieza || existing.calificacion || "-")}/5</dd>
        <dt>Calidad del trabajo</dt><dd>${escapeHtml(existing.calidad || existing.calificacion || "-")}/5</dd>
        <dt>Tiempo de atencion</dt><dd>${escapeHtml(existing.tiempo || existing.calificacion || "-")}/5</dd>
        <dt>Orden</dt><dd>${escapeHtml(existing.orden || existing.calificacion || "-")}/5</dd>
        <dt>Promedio final</dt><dd>${escapeHtml(existing.promedio || existing.calificacion || "-")}/5</dd>
        <dt>Comentarios</dt><dd>${escapeHtml(existing.comentario || "-")}</dd>
      </dl>`,
      "Cerrar"
    );
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarCalificacion(numero) {
  const ok = await pedirConfirmacion(
    "Esta seguro de eliminar esta calificacion?",
    `<dl>
      <dt>OT</dt><dd>${escapeHtml(numero)}</dd>
    </dl>
    <p class="muted">La calificacion se quitara del historial.</p>`,
    "Eliminar"
  );

  if (!ok) return;

  try {
    await api(`/api/ots/${encodeURIComponent(numero)}/calificacion`, {
      method: "DELETE",
    });

    state.calificaciones = state.calificaciones.filter((c) => c.ot_numero !== numero);

    const ot = state.ots.find((o) => o.numero === numero);
    if (ot) {
      delete ot.promedio;
      delete ot.calificacion;
    }

    renderHistorialCalificaciones();
    renderCalificarOt();

    confirmar("Calificacion eliminada", `Se elimino la calificacion de la OT ${numero}.`);
    toast("Calificacion eliminada correctamente", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderRatingFactors() {
  $("ratingFactors").innerHTML = ratingFactorDefs.map(([name, label, question]) => `
    <div class="rating-factor" data-factor="${name}">
      <strong>${label}</strong>
      <p>${question}</p>
      <div class="rating-stars" role="group" aria-label="${escapeHtml(label)}">
        ${[1, 2, 3, 4, 5].map((value) => `<button type="button" title="${value}/5" data-factor="${name}" data-rating="${value}">☆</button>`).join("")}
      </div>
      <input type="hidden" name="${name}" value="">
    </div>
  `).join("");
  updateRatingAverage();
}

function setFactorRating(name, value) {
  const input = $(`ratingForm`).elements[name];
  if (input) input.value = value;
  document.querySelectorAll(`[data-factor="${name}"][data-rating]`).forEach((button) => {
    const active = Number(button.dataset.rating) <= Number(value);
    button.classList.toggle("active", active);
    button.textContent = active ? "★" : "☆";
  });
  updateRatingAverage();
}

function updateRatingAverage() {
  const form = $("ratingForm");
  const values = ratingFactorDefs.map(([name]) => Number(form?.elements?.[name]?.value || 0));
  const complete = values.every((value) => value >= 1);
  const avg = complete ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  $("ratingAverage").textContent = `${avg.toFixed(1)} / 5`;
  return complete ? avg : 0;
}

function attachEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginMsg").textContent = "";
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ username: $("loginUser").value, password: $("loginPass").value }) });
      state.token = result.token;
      state.user = result.user;
      localStorage.setItem("mantto_token", state.token);
      localStorage.setItem("mantto_user", JSON.stringify(state.user));
      showApp();
    } catch (err) {
      $("loginMsg").textContent = err.message;
      toast("No se pudo iniciar sesion", "error");
    }
  });

  $("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("mantto_token");
    localStorage.removeItem("mantto_user");
    state.token = "";
    state.user = null;
    showLogin();
  });

  $("menuToggle").addEventListener("click", () => {
    document.body.classList.toggle("nav-open");
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => renderConfig(button.dataset.tab));
  });

  $("avisoForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!esJefe()) return toast("Solo personal JEFE puede crear avisos", "error");
    if (!validateRequiredForm(event.target)) return;
    const data = formData(event.target);
    const avisoMode = state.equipmentSelectors.aviso?.mode || "filter";

    if (avisoMode === "filter") {
      if (!data.sede) return toast("Seleccione una sede", "warning");
      if (!data.ubicacion) return toast("Seleccione una ubicacion", "warning");
      if (!data.proceso) return toast("Seleccione un proceso", "warning");
      if (!data.sistema) return toast("Seleccione un sistema", "warning");
      if (!data.descripcion) return toast("Ingrese una descripcion", "warning");
    }

    if (avisoMode === "code") {
      if (!data.equipo_codigo) return toast("Seleccione o ingrese un codigo valido", "warning");
      if (!state.equipmentSelectors.aviso?.selected) return toast("No se encontro el registro", "warning");
      if (!data.descripcion) return toast("Ingrese una descripcion", "warning");
    }

    delete data.referencia;
    delete data.imagenes;
    const ok = await pedirConfirmacion("Desea registrar este aviso?", avisoResumenHtml(data), "Confirmar registro");
    if (!ok) return;
    try {
      const payload = new FormData(event.target);
      payload.delete("referencia");
      const result = await api("/api/avisos", { method: "POST", body: payload });
      confirmar("AVISO GENERADO CORRECTAMENTE", `Codigo de aviso: ${result.numero} · Estado: ABIERTO`);
toast(`AVISO GENERADO CORRECTAMENTE: ${result.numero}`, "success");

event.target.reset();
state.equipmentSelectors.aviso = { mode: "filter", filters: {}, code: "", selected: null };
$("avisoCreado").value = state.user.username;
if ($("avisoImagenesInfo")) $("avisoImagenesInfo").textContent = "Sin imagen seleccionada.";
renderAvisoResumenSeleccion(null);

await refreshAfterMutation({ home: true });
    } catch (err) {
      toast(err.message || "No se pudo registrar el aviso", "error");
    }
  });

  $("otForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateRequiredForm(event.target)) return;
    const data = normalizeOtPayload(formData(event.target));
    const otMode = state.equipmentSelectors.ot?.mode || "filter";
    
    if (!data.sede) return toast("Complete sede", "warning");
    if (!data.ubicacion) return toast("Complete ubicacion", "warning");
    if (!data.proceso) return toast("Complete proceso", "warning");
    if (!data.sistema) return toast("Complete sistema", "warning");
    if (otMode === "filter") {
      data.equipo = "";
      data.sub_equipo = "";
      data.componente = "";
      data.tipo_equipo = "";
      data.equipo_codigo = "";
    }
    if (!data.descripcion_trabajo) return toast("Complete descripcion del trabajo", "warning");

    const ok = await pedirConfirmacion("Desea generar esta OT?", otResumenHtml(data), "Generar OT");
    if (!ok) return;
    try {
      const result = await api("/api/ots", { method: "POST", body: JSON.stringify(data) });
      confirmar("OT generada correctamente", `Numero de OT: ${result.numero}`);
      toast(`OT generada correctamente: ${result.numero}`, "success");
      event.target.reset();
      state.equipmentSelectors.ot = { mode: "filter", filters: {}, code: "", selected: null };
      await refreshAfterMutation();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("peticionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateRequiredForm(event.target)) return;
    try {
      const result = await api("/api/peticiones", { method: "POST", body: JSON.stringify(formData(event.target)) });
      confirmar("Peticion generada correctamente", `Numero de peticion: ${result.numero}`);
      toast(`Peticion generada correctamente: ${result.numero}`, "success");
      event.target.reset();
      await refreshAfterMutation();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("avisoOtForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedAviso) return;
    if (!validateRequiredForm(event.target)) return;
    try {
      updateAvisoOtEquipmentFromSelection(matchingEquipmentForAviso(state.selectedAviso));
      const data = normalizeOtPayload(formData(event.target));
      if (!data.descripcion_trabajo) return toast("Complete descripcion del trabajo", "warning");
      const result = await api(`/api/avisos/${state.selectedAviso.numero}/atender`, { method: "POST", body: JSON.stringify(data) });
      confirmar("Aviso atendido correctamente", `Se genero la OT ${result.ot_numero}.`);
      toast(`Aviso convertido en OT: ${result.ot_numero}`, "success");
      state.selectedAviso = null;
      $("avisoOtBox").classList.add("hidden");
      await refreshAfterMutation();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("atenderOtForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedOt) return;
    if (!validateRequiredForm(event.target)) return;
    const data = formData(event.target);
    if (!data.tecnico || !data.trabajo_realizado) return toast("Complete tecnico y trabajo realizado", "warning");
    const ok = await pedirConfirmacion("Desea cerrar esta OT?", `<dl><dt>OT</dt><dd>${escapeHtml(state.selectedOt.numero)}</dd><dt>Tecnico</dt><dd>${escapeHtml(data.tecnico)}</dd><dt>Estado</dt><dd>${escapeHtml(data.estado_final)}</dd></dl>`, "Confirmar cierre");
    if (!ok) return;
    try {
      await api(`/api/ots/${state.selectedOt.numero}/atender`, { method: "POST", body: JSON.stringify(data) });
      confirmar("OT cerrada correctamente", `${state.selectedOt.numero} quedo en estado CERRADA.`);
      toast("OT cerrada correctamente", "success");
      $("atenderOtBox").classList.add("hidden");
      state.selectedOt = null;
      await refreshAfterMutation();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("cancelarAtenderOt").addEventListener("click", () => {
    $("atenderOtBox").classList.add("hidden");
    state.selectedOt = null;
  });

  $("historialFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    state.selectedBulkOts.clear();
    renderHistorialOt();
  });

  $("calificarOtFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    renderCalificarOt();
  });

  $("cerrarOtFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    renderOtsPendientes();
  });

  $("calificacionesFilters").addEventListener("submit", (event) => {
    event.preventDefault();
    renderHistorialCalificaciones();
  });

  document.querySelectorAll("[data-date-range]").forEach((button) => {
    button.addEventListener("click", () => setDateRange(button.dataset.dateRange, button.dataset.filterForm || "historialFilters"));
  });

  $("seleccionarTodasOt")?.addEventListener("click", () => {
    document.querySelectorAll("[data-ot-check]").forEach((check) => {
      check.checked = true;
      state.selectedBulkOts.add(check.dataset.otCheck);
    });
    toast(`${state.selectedBulkOts.size} OT seleccionadas`, "info");
  });

  $("exportarSeleccionadas")?.addEventListener("click", exportarPdfMasivo);
  $("exportarHistorialExcel")?.addEventListener("click", exportarHistorialExcel);
  $("imprimirHistorialOt")?.addEventListener("click", imprimirHistorialOt);

  $("almacenSearch").addEventListener("input", (event) => {
    state.almacenSearch = event.target.value;
    renderAlmacen();
  });

  $("almacenTipo").addEventListener("change", (event) => {
    state.almacenTipo = event.target.value;
    renderAlmacen();
  });

  $("equipoCodigo").addEventListener("change", () => {
    const equipo = state.catalogos.equipos.find((e) => equipoValue(e, "codigo") === $("equipoCodigo").value);
    if (!equipo) return;
    applySelectedEquipment("ot", equipo);
  });

  $("itemCodigo").addEventListener("change", () => {
    const items = [...state.catalogos.productos, ...state.catalogos.repuestos];
    const item = items.find((i) => sameText(itemValue(i, "codigo"), $("itemCodigo").value));
    if (!item) return;
    $("itemNombre").value = itemValue(item, "descripcion") || "";
    $("itemUnidad").value = itemValue(item, "unidad") || "";
  });

  $("ratingCancel").addEventListener("click", () => {
    $("serviceRatingModal").classList.add("hidden");
    state.selectedRatingOt = null;
  });

  $("ratingFactors").addEventListener("click", (event) => {
    const button = event.target.closest("[data-factor][data-rating]");
    if (!button) return;
    setFactorRating(button.dataset.factor, button.dataset.rating);
  });

  $("ratingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.selectedRatingOt) return;
    const data = formData(event.target);
    const missing = ratingFactorDefs
      .filter(([name]) => Number(data[name]) < 1)
      .map(([, label]) => label);
    if (missing.length) {
      toast(`Complete la calificacion de: ${missing.join(", ")}`, "warning");
      document.querySelectorAll(".rating-factor").forEach((factor) => {
        const input = $("ratingForm").elements[factor.dataset.factor];
        factor.classList.toggle("field-required-empty", !input?.value);
      });
      return;
    }
    const promedio = updateRatingAverage();
    const ok = await pedirConfirmacion(
      "Desea registrar esta calificacion?",
      `<dl><dt>OT</dt><dd>${escapeHtml(state.selectedRatingOt.numero)}</dd><dt>Tecnico</dt><dd>${escapeHtml(state.selectedRatingOt.tecnico_1 || "-")}</dd><dt>Promedio</dt><dd>${promedio.toFixed(1)} / 5</dd></dl>`,
      "Confirmar"
    );
    if (!ok) return;
    try {
      await api(`/api/ots/${state.selectedRatingOt.numero}/calificacion`, { method: "POST", body: JSON.stringify(data) });
      const numero = state.selectedRatingOt.numero;
      $("serviceRatingModal").classList.add("hidden");
      state.selectedRatingOt = null;
      toast("Calificacion registrada correctamente", "success");
      confirmar("Calificacion guardada", `${numero} - Calificacion: ${promedio.toFixed(2)} / 5`);
      state.selectedRatingOt = null;
      await refreshAfterMutation();
      setView("calificarOt");
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

attachWarehouse3dBridge();
attachEvents();
bindRequiredIndicators();
if (state.token && state.user) {
  showApp();
} else {
  showLogin();
}

