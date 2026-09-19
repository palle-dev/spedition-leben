import * as THREE from "three";

// Baut einen stilisierten Lkw aus Three.js-Primitiven.
// vehicleType: "regional" | "standard" | "heavy"
// bodyType: "planen" | "kuehl" | "tank" | "kipper"
// Gibt eine THREE.Group zurück, deren Vorwärts-Richtung -Z ist.

const CAB_COLOR = 0x2b3a4a;
const CAB_TOP_COLOR = 0x22303f;
const WHEEL_COLOR = 0x1a1a1a;
const WHEEL_RIM = 0x55606a;
const CHASSIS_COLOR = 0x33373b;
const WINDOW_COLOR = 0x0a1a2a;

const BODY_COLORS = {
  planen: 0x7a7460,
  kuehl: 0xeaeaea,
  tank: 0xa0a8b0,
  kipper: 0xc88a3a,
};

const DIMENSIONS = {
  regional: { cabL: 2.0, cabW: 2.2, cabH: 2.4, trailerL: 5.0, trailerW: 2.3, trailerH: 2.5, wheelR: 0.55 },
  standard: { cabL: 2.4, cabW: 2.4, cabH: 2.8, trailerL: 7.0, trailerW: 2.5, trailerH: 3.0, wheelR: 0.62 },
  heavy: { cabL: 2.8, cabW: 2.6, cabH: 3.1, trailerL: 8.5, trailerW: 2.6, trailerH: 3.4, wheelR: 0.72 },
};

function makeWheel(radius, width) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 18),
    new THREE.MeshStandardMaterial({ color: WHEEL_COLOR, roughness: 0.85 })
  );
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 10),
    new THREE.MeshStandardMaterial({ color: WHEEL_RIM, roughness: 0.4, metalness: 0.6 })
  );
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  return g;
}

function addWheels(group, dim, wheelbaseFront, wheelbaseRear, trailerWheels) {
  const w = makeWheel(dim.wheelR, 0.4);
  const halfW = dim.cabW / 2 + 0.05;
  // Vorderachse (Lenkachse)
  for (const sx of [-1, 1]) {
    const wheel = w.clone();
    wheel.position.set(sx * halfW, dim.wheelR, wheelbaseFront);
    group.add(wheel);
  }
  // Hinterachse Cab (Antriebsachse)
  for (const sx of [-1, 1]) {
    const wheel = w.clone();
    wheel.position.set(sx * halfW, dim.wheelR, wheelbaseRear);
    group.add(wheel);
  }
  // Trailer-Achsen
  if (trailerWheels) {
    for (const sx of [-1, 1]) {
      const wheel = w.clone();
      wheel.position.set(sx * (dim.trailerW / 2 + 0.05), dim.wheelR, wheelbaseRear - 1.2);
      group.add(wheel);
      const wheel2 = w.clone();
      wheel2.position.set(sx * (dim.trailerW / 2 + 0.05), dim.wheelR, wheelbaseRear - 2.0);
      group.add(wheel2);
    }
  }
}

function buildCab(dim) {
  const cab = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(dim.cabW, dim.cabH, dim.cabL),
    new THREE.MeshStandardMaterial({ color: CAB_COLOR, roughness: 0.55, metalness: 0.25 })
  );
  body.position.y = dim.wheelR + dim.cabH / 2;
  cab.add(body);

  // Dachaufbau (schlankere Kappe)
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(dim.cabW * 0.92, 0.25, dim.cabL * 0.85),
    new THREE.MeshStandardMaterial({ color: CAB_TOP_COLOR, roughness: 0.6 })
  );
  top.position.y = dim.wheelR + dim.cabH + 0.12;
  cab.add(top);

  // Windschutzscheibe
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(dim.cabW * 0.86, dim.cabH * 0.45, 0.08),
    new THREE.MeshStandardMaterial({ color: WINDOW_COLOR, roughness: 0.15, metalness: 0.7, emissive: 0x0a2030, emissiveIntensity: 0.3 })
  );
  windshield.position.set(0, dim.wheelR + dim.cabH * 0.62, dim.cabL / 2 + 0.02);
  cab.add(windshield);

  // Scheinwerfer
  for (const sx of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xffe090, emissiveIntensity: 0.7 })
    );
    light.position.set(sx * dim.cabW * 0.32, dim.wheelR + 0.5, dim.cabL / 2 + 0.04);
    cab.add(light);
  }
  return cab;
}

function buildTrailer(dim, bodyType) {
  const trailer = new THREE.Group();
  const color = BODY_COLORS[bodyType] || BODY_COLORS.planen;

  if (bodyType === "tank") {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(dim.trailerH / 2, dim.trailerH / 2, dim.trailerL, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 })
    );
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0, dim.wheelR + dim.trailerH / 2 + 0.1, -dim.trailerL / 2);
    trailer.add(tank);
    // Endringe
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(dim.trailerH / 2, 0.08, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.4, metalness: 0.6 })
    );
    ring.position.set(0, dim.wheelR + dim.trailerH / 2 + 0.1, -dim.trailerL);
    trailer.add(ring);
  } else if (bodyType === "kipper") {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(dim.trailerW, dim.trailerH, dim.trailerL),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 })
    );
    box.position.set(0, dim.wheelR + dim.trailerH / 2 + 0.15, -dim.trailerL / 2);
    trailer.add(box);
    // Kippkante oben
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(dim.trailerW + 0.1, 0.12, dim.trailerL + 0.1),
      new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.5 })
    );
    lip.position.set(0, dim.wheelR + dim.trailerH + 0.2, -dim.trailerL / 2);
    trailer.add(lip);
  } else if (bodyType === "kuehl") {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(dim.trailerW, dim.trailerH, dim.trailerL),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 })
    );
    box.position.set(0, dim.wheelR + dim.trailerH / 2 + 0.1, -dim.trailerL / 2);
    trailer.add(box);
    // Kühlaggregat vorne
    const reefer = new THREE.Mesh(
      new THREE.BoxGeometry(dim.trailerW * 0.5, 0.7, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 })
    );
    reefer.position.set(0, dim.wheelR + dim.trailerH - 0.2, -0.1);
    trailer.add(reefer);
  } else {
    // planen
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(dim.trailerW, dim.trailerH, dim.trailerL),
      new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
    );
    box.position.set(0, dim.wheelR + dim.trailerH / 2 + 0.1, -dim.trailerL / 2);
    trailer.add(box);
    // Plane-Rippen
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(dim.trailerW + 0.04, 0.06, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x4a4638, roughness: 0.8 })
      );
      rib.position.set(0, dim.wheelR + dim.trailerH + 0.12, -0.5 - i * (dim.trailerL / 4));
      trailer.add(rib);
    }
  }
  return trailer;
}

export function buildTruck(vehicleType = "standard", bodyType = "planen") {
  const dim = DIMENSIONS[vehicleType] || DIMENSIONS.standard;
  const group = new THREE.Group();

  // Chassis
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(dim.cabW * 0.9, 0.25, dim.cabL + dim.trailerL + 0.5),
    new THREE.MeshStandardMaterial({ color: CHASSIS_COLOR, roughness: 0.7 })
  );
  chassis.position.y = dim.wheelR + 0.15;
  group.add(chassis);

  // Kabine vorne (+Z)
  const cab = buildCab(dim);
  cab.position.z = dim.cabL / 2;
  group.add(cab);

  // Aufbau hinten (-Z)
  const trailer = buildTrailer(dim, bodyType);
  group.add(trailer);

  // Räder
  addWheels(group, dim, dim.cabL / 2 - 0.3, -0.3, true);

  // Schattenwurf: einfache Scheibe unter dem Lkw
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(dim.cabW + 1.2, dim.cabL + dim.trailerL + 1),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  group.add(shadow);

  return group;
}

export function truckDimensions(vehicleType = "standard") {
  return DIMENSIONS[vehicleType] || DIMENSIONS.standard;
}