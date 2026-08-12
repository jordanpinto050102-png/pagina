import * as THREE from "three";

export function animateCamera(camera, controls, targetPosition, targetLookAt, duration = 850) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPosition = targetPosition.clone();
  const endTarget = targetLookAt.clone();
  const started = performance.now();

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const progress = Math.min(1, (now - started) / duration);
    const value = ease(progress);
    camera.position.lerpVectors(startPosition, endPosition, value);
    controls.target.lerpVectors(startTarget, endTarget, value);
    controls.update();
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

export function focusObject(camera, controls, object, offset = new THREE.Vector3(4, 3.2, 5.5)) {
  if (!object) return;
  const target = new THREE.Vector3();
  object.getWorldPosition(target);
  animateCamera(camera, controls, target.clone().add(offset), target);
}

export function generalView(camera, controls) {
  animateCamera(camera, controls, new THREE.Vector3(0, 24, 34), new THREE.Vector3(0, 1.9, 0), 950);
}
