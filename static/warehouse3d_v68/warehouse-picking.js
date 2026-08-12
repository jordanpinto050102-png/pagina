import * as THREE from "three";
import { parseUbicacion } from "./warehouse-data.js";

export function resolveLocationObject(positionMap, ubicacion) {
  const parsed = parseUbicacion(ubicacion);
  if (!parsed.valid) return { parsed, object: null };
  const exact = positionMap.get(parsed.codigo);
  if (exact) return { parsed, object: exact };
  const fallback = positionMap.get(`${parsed.almacen}-${parsed.rack}-P${parsed.nivel}`);
  return { parsed, object: fallback || null };
}

export function markPedido(positionMap, componentes, materials) {
  (componentes || []).forEach((item) => {
    const { object } = resolveLocationObject(positionMap, item.ubicacion);
    if (object) object.material = materials.pedido.clone();
  });
}

export function selectLocation(positionMap, componentes, selected, materials) {
  markPedido(positionMap, componentes, materials);
  const { parsed, object } = resolveLocationObject(positionMap, selected?.ubicacion || "");
  if (!object) return { parsed, object: null };
  object.material = materials.selected.clone();
  object.scale.set(1.05, 1.08, 1.18);
  const pulse = new THREE.PointLight(0xf4b400, 1.4, 5);
  pulse.name = "selected-pulse";
  pulse.position.set(0, 0.4, 0.7);
  object.add(pulse);
  return { parsed, object };
}
