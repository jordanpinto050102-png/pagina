// ================================
// CONFIGURACION DEL LAYOUT
// ================================
// Sistema de coordenadas:
// X = izquierda / derecha
// Y = altura
// Z = adelante / atras
// rotacion = giro horizontal del rack, en radianes. Ejemplo: Math.PI / 2 gira 90 grados.

export const DIMENSIONES_ALMACEN = {
  piso: { ancho: 42, largo: 34, alto: 5 },
  rack: { ancho: 6, profundidad: 1.5, alto: 4, separacionNivel: 0.08 },
  pasillo: { ancho: 3 },
  puerta: { ancho: 4, alto: 3 },
};

export const CONFIG_LAYOUT = {
  piso1: {
    id: 1,
    nombre: "ALMACEN PISO 1",
    y: 0,
    puerta: { x: 0, y: 0, z: -15.8, rotacion: 0, ancho: 4, alto: 3 },
    racks: [
      { id: "R1", x: -14, y: 0, z: -6, rotacion: 0, niveles: 4, posiciones: 24 },
      { id: "R2", x: -7, y: 0, z: -6, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R3", x: 0, y: 0, z: -6, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R4", x: 7, y: 0, z: -6, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R5", x: 14, y: 0, z: -6, rotacion: 0, niveles: 4, posiciones: 8 },
    ],
  },
  piso2: {
    id: 2,
    nombre: "ALMACEN PISO 2",
    y: 0,
    puerta: { x: 0, y: 0, z: 15.8, rotacion: Math.PI, ancho: 4, alto: 3 },
    racks: [
      { id: "R6", x: -14, y: 0, z: 7, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R7", x: -7, y: 0, z: 7, rotacion: 0, niveles: 4, posiciones: 8 },
      { id: "R8", x: 0, y: 0, z: 7, rotacion: 0, niveles: 4, posiciones: 6 },
      { id: "R9", x: 7, y: 0, z: 7, rotacion: 0, niveles: 4, posiciones: 8 },
      { id: "R10", x: 14, y: 0, z: 7, rotacion: 0, niveles: 4, posiciones: 6 },
    ],
  },
};

export function pisosLayout() {
  return Object.values(CONFIG_LAYOUT);
}

export function findRackLayout(rackId) {
  for (const piso of pisosLayout()) {
    const rack = piso.racks.find((item) => item.id === rackId);
    if (rack) return { piso, rack };
  }
  return null;
}
