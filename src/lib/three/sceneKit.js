import * as THREE from "three";

// Gemeinsamer Szenen-Setup für alle 3D-Fahrerlebnisse.
// Atmosphärische dunkle Beleuchtung passend zur Spiel-Optik.

export function createBaseScene(canvas, { fogColor = 0x0b1011, fogNear = 30, fogFar = 220 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1011);
  scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 1, 0);

  // Beleuchtung — warm/kalt Mischung, atmosphärisch
  const ambient = new THREE.AmbientLight(0x4a5a6a, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x8090a0, 0x1a1410, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd9a0, 0.9);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Boden
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Dezente Bodentextur: Gitterlinien für Tiefenwahrnehmung
  const grid = new THREE.GridHelper(600, 80, 0x2a3036, 0x1a2024);
  grid.position.y = 0.01;
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    renderer.dispose();
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  return { renderer, scene, camera, sun, ambient, resize, dispose };
}

// Gerade Straße mit Mittellinie und Randlinien.
// length in Welt-Einheiten, width ~ 8 (zwei Spuren).
export function buildStraightRoad(length = 400, width = 9) {
  const group = new THREE.Group();

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.9 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.03;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Mittellinie: gestrichelt
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xc8b070, roughness: 0.6, emissive: 0x3a3020, emissiveIntensity: 0.2 });
  const dashLen = 4;
  const gap = 3;
  const total = dashLen + gap;
  const count = Math.floor(length / total);
  for (let i = 0; i < count; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, dashLen), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.05, -length / 2 + i * total + dashLen / 2);
    group.add(dash);
  }

  // Randlinien
  for (const sx of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, length),
      new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(sx * (width / 2 - 0.3), 0.05, 0);
    group.add(edge);
  }

  return group;
}

// Oval-Teststrecke für die Probefahrt: zwei Geraden + zwei Kurven.
export function buildOvalTrack() {
  const group = new THREE.Group();
  const halfLen = 80;
  const curveR = 30;
  const width = 10;

  // Zwei Geraden
  for (const sz of [-1, 1]) {
    const straight = new THREE.Mesh(
      new THREE.PlaneGeometry(width, halfLen * 2),
      new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.9 })
    );
    straight.rotation.x = -Math.PI / 2;
    straight.position.set(curveR + width / 2, 0.03, sz * 0);
    straight.position.z = 0;
    // Verschiebe auf die Oval-Seite
    straight.position.x = 0;
    straight.position.z = sz * (halfLen);
    straight.receiveShadow = true;
    group.add(straight);
  }
  // Einfacherer Ansatz: ein breiter Ring (Torus-ähnlich) als Straße
  group.clear();
  const trackShape = new THREE.Shape();
  const innerR = curveR;
  const outerR = curveR + width;
  // Oval aus zwei Halbkreisen + zwei Geraden
  const straightLen = halfLen * 2;
  // Wir bauen die Straße als Gruppe von Segmenten
  const segs = 64;
  const ovalA = straightLen / 2 + curveR; // "Radius" in z
  const ovalB = curveR + width / 2; // Mittellinie x
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // Ovalpunkt: x = ovalB * sin(a), z = ovalA * cos(a) — aber das ergibt eine Ellipse.
    // Für eine echte Ovalstrecke mit Geraden nutzen wir einen parametrischen Ansatz:
    // Wir approximieren das Oval als Ellipse (einfacher, gut genug für visuelle Führung).
    const p0 = ellipsePoint(ovalB, ovalA, a0);
    const p1 = ellipsePoint(ovalB, ovalA, a1);
    const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
    const dx = p1.x - p0.x, dz = p1.z - p0.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(width, segLen + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.9 })
    );
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = -angle;
    seg.position.set(mid.x, 0.03, mid.z);
    seg.receiveShadow = true;
    group.add(seg);
  }
  // Mittellinie
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xc8b070, roughness: 0.6 });
  for (let i = 0; i < segs; i += 2) {
    const a = (i / segs) * Math.PI * 2;
    const p = ellipsePoint(ovalB, ovalA, a);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2.5), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(p.x, 0.05, p.z);
    group.add(dash);
  }
  return group;
}

function ellipsePoint(rx, rz, angle) {
  return { x: rx * Math.sin(angle), z: rz * Math.cos(angle) };
}

// Start-/Ziel-Tor: zwei Pfosten mit Querbalken.
export function buildGate(color = 0x80c080) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 8), postMat);
    post.position.set(sx * 5, 2.5, 0);
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.3, 0.3), postMat);
  bar.position.set(0, 5, 0);
  group.add(bar);
  return group;
}