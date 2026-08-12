import * as THREE from "three";
import { CONFIG_ALMACEN, parseUbicacion } from "./warehouse-data.js";
import { DIMENSIONES_ALMACEN, pisosLayout } from "./warehouse-layout.js";

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0xe8eef5, roughness: 0.72 }),
  rackFrame: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, transparent: true, opacity: 0.58 }),
  normal: new THREE.MeshStandardMaterial({ color: 0xd7e8f7, roughness: 0.5, emissive: 0x13263a }),
  stock: new THREE.MeshStandardMaterial({ color: 0x62c5ef, roughness: 0.55 }),
  pedido: new THREE.MeshStandardMaterial({ color: 0xffc72c, roughness: 0.42, emissive: 0x4a3100 }),
  selected: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.38, emissive: 0x063449 }),
  error: new THREE.MeshStandardMaterial({ color: 0xd64545, roughness: 0.42 }),
  door: new THREE.MeshStandardMaterial({ color: 0xf4b400, roughness: 0.5, emissive: 0x3a2500 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.72, transparent: true, opacity: 0.28 }),
};

export function createLabel(text, position, size = 0.75) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b3b66";
  ctx.font = "700 44px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.position.copy(position);
  sprite.scale.set(size * 2.4, size * 0.9, 1);
  return sprite;
}

function maxPositionForRack(componentes, rackNumber, basePositions) {
  const found = (componentes || [])
    .map((item) => parseUbicacion(item.ubicacion))
    .filter((parsed) => parsed.valid && parsed.rackNumber === rackNumber)
    .map((parsed) => parsed.posicion || 1);
  return Math.max(basePositions || CONFIG_ALMACEN.posicionesPorNivel, ...found);
}

function createDoor(config, piso) {
  const ancho = config.ancho || DIMENSIONES_ALMACEN.puerta.ancho;
  const alto = config.alto || DIMENSIONES_ALMACEN.puerta.alto;
  const door = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 0.22), materials.door);
  door.position.set(config.x || 0, (config.y || 0) + alto / 2, config.z || 0);
  door.rotation.y = config.rotacion || 0;
  door.userData = { type: "door", piso: piso.id };
  door.name = `puerta-piso-${piso.id}`;
  const label = createLabel("PUERTA", new THREE.Vector3(config.x || 0, alto + 0.65, config.z || 0), 0.52);
  label.rotation.y = config.rotacion || 0;
  return { door, label };
}

export function buildWarehouseScene(scene, componentes = []) {
  const positionMap = new Map();
  const group = new THREE.Group();
  group.name = "warehouse";
  scene.add(group);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(DIMENSIONES_ALMACEN.piso.ancho, 0.12, DIMENSIONES_ALMACEN.piso.largo), materials.floor);
  floor.position.set(0, -0.08, 1.2);
  floor.receiveShadow = true;
  group.add(floor);

  const aisle = new THREE.GridHelper(Math.max(DIMENSIONES_ALMACEN.piso.ancho, DIMENSIONES_ALMACEN.piso.largo), 32, 0x9fb3c8, 0xd5e0ea);
  aisle.position.y = 0;
  group.add(aisle);

  const axes = new THREE.AxesHelper(4);
  axes.position.set(-DIMENSIONES_ALMACEN.piso.ancho / 2 + 2.5, 0.08, -DIMENSIONES_ALMACEN.piso.largo / 2 + 2.5);
  group.add(axes);

  pisosLayout().forEach((piso) => {
    group.add(createLabel(piso.nombre, new THREE.Vector3(-DIMENSIONES_ALMACEN.piso.ancho / 2 + 5, 0.8, piso.id === 1 ? -14 : 14), 0.72));
    if (piso.puerta) {
      const { door, label } = createDoor(piso.puerta, piso);
      group.add(door, label);
    }

    (piso.racks || []).forEach((rackConfig) => {
    const rackNumber = Number(String(rackConfig.id).replace(/\D+/g, "")) || 0;
    const dimensions = { ...DIMENSIONES_ALMACEN.rack, ...(rackConfig.dimensiones || {}) };
    const levels = rackConfig.niveles || CONFIG_ALMACEN.nivelesPorRack;
    const positions = maxPositionForRack(componentes, rackNumber, rackConfig.posiciones || CONFIG_ALMACEN.posicionesPorNivel);
    const slotW = dimensions.ancho / positions;
    const levelH = dimensions.alto / levels;

    const rack = new THREE.Group();
    rack.name = rackConfig.id;
    rack.userData = { type: "rack", rack: rackConfig.id, piso: piso.id, niveles: levels, posiciones: positions };
    rack.position.set(rackConfig.x || 0, rackConfig.y || 0, rackConfig.z || 0);
    rack.rotation.y = rackConfig.rotacion || 0;
    group.add(rack);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions.ancho + 0.12, dimensions.alto + 0.12, dimensions.profundidad + 0.12),
      materials.rackFrame
    );
    frame.position.set(0, dimensions.alto / 2, 0);
    frame.material = materials.rackFrame;
    frame.scale.set(1, 1, 1);
    rack.add(frame);

    for (let nivel = 1; nivel <= levels; nivel += 1) {
      for (let posicion = 1; posicion <= positions; posicion += 1) {
        const cell = new THREE.Mesh(
          new THREE.BoxGeometry(slotW - 0.04, levelH - (dimensions.separacionNivel || 0.08), dimensions.profundidad - 0.12),
          materials.normal.clone()
        );
        const cx = -dimensions.ancho / 2 + slotW * (posicion - 0.5);
        const cy = levelH * (nivel - 0.5);
        cell.position.set(cx, cy, 0.02);
        const codigoUbicacion = `ALM-R${rackNumber}-P${nivel}-F${posicion}`;
        cell.userData = { type: "slot", codigoUbicacion, almacen: "ALM", rack: rackConfig.id, rackNumber, piso: piso.id, nivel, posicion };
        rack.add(cell);
        positionMap.set(codigoUbicacion, cell);
        if (posicion === 1) positionMap.set(`ALM-R${rackNumber}-P${nivel}`, cell);
      }
    }

    rack.add(createLabel(rackConfig.id, new THREE.Vector3(0, dimensions.alto + 0.65, 0), 0.72));
    });
  });
  return { group, positionMap, materials };
}
