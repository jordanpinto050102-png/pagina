import { findRackLayout, pisosLayout } from "./warehouse-layout.js";

export const CONFIG_ALMACEN = {
  pisos: pisosLayout().length,
  racksPorPiso: 5,
  nivelesPorRack: 4,
  posicionesPorNivel: 6,
  anchoRack: 6,
  altoRack: 4,
  profundidadRack: 1.5,
  distanciaEntreRacks: 5,
};

export const pedidosDemo = [
  {
    numero: "PED-00125",
    estado: "LISTO",
    componentes: [
      { codigo: "ROD-6205", nombre: "Rodamiento 6205", cantidad: 2, unidad: "UND", ubicacion: "ALM-R1-P2-F17" },
      { codigo: "SEN-M18", nombre: "Sensor inductivo M18", cantidad: 1, unidad: "UND", ubicacion: "ALM-R5-P2" },
      { codigo: "CON-18A", nombre: "Contactor 18 A", cantidad: 2, unidad: "UND", ubicacion: "ALM-R7-P3" },
    ],
  },
];

export function parseUbicacion(raw) {
  const codigo = String(raw || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
  const match = codigo.match(/^([A-Z]+)-R(\d+)-P(\d+)(?:-F(\d+))?$/);
  if (!match) {
    return { codigo, valid: false, almacen: "", rack: "", piso: 1, nivel: 1, posicion: 1 };
  }
  const rackNumber = Number(match[2]);
  const rack = `R${rackNumber}`;
  const layout = findRackLayout(rack);
  return {
    codigo,
    valid: true,
    almacen: match[1],
    rack,
    rackNumber,
    piso: layout?.piso?.id || (rackNumber > CONFIG_ALMACEN.racksPorPiso ? 2 : 1),
    nivel: Number(match[3] || 1),
    posicion: Number(match[4] || 1),
  };
}

export function getPayload() {
  try {
    const payload = JSON.parse(localStorage.getItem("mantto_warehouse3d_payload") || "null");
    if (payload?.componentes?.length) return payload;
  } catch (err) {
    console.warn("No se pudo leer payload 3D", err);
  }
  return {
    modo: "demo",
    pedido: pedidosDemo[0],
    componentes: pedidosDemo[0].componentes,
    selectedCodigo: pedidosDemo[0].componentes[0].codigo,
    selectedUbicacion: pedidosDemo[0].componentes[0].ubicacion,
  };
}

export function getUbicacionComponente(codigo, componentes) {
  const item = (componentes || []).find((row) => String(row.codigo || "").toUpperCase() === String(codigo || "").toUpperCase());
  return item?.ubicacion || "";
}
