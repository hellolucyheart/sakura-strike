// map.js — Harbor Yard: an original container-yard map built for Sakura Strike.
//
// Layout (metres, x east, z south; playfield 68 x 48 inside the fence):
//   Sakura Guard spawn south-west and push north to Site A (the crane deck,
//   north-west) or east along the south lane into the warehouse, Site B
//   (south-east). Iron Tide spawn north-east and hold both sites.
//   Three lanes (west, mid, east) joined by two cross cuts give flanks,
//   corners and two long sightlines: the north lane and the mid spine gap.
//
// One box list drives everything — the meshes you see, the AABBs the player
// and bots collide with, and the boxes sightlines and bullets test against —
// so what blocks your view is exactly what blocks your body and your shot.

import { containerTexture, groundTexture, claddingTexture, hazardTexture, crateTexture } from './textures.js';

export const WORLD = { minX: -33, maxX: 33, minZ: -23, maxZ: 23 };

export const SITES = [
  { id: 'A', name: 'Site A — Crane Deck', x: -22, z: -14, radius: 6, color: '#ff7aa8' },
  { id: 'B', name: 'Site B — Warehouse', x: 24, z: 12, radius: 6, color: '#ffd166' },
];

// kind: cont = container (coloured), stack = two containers, crate, wall, leg
const BOXES = [
  // west lane cover
  { x: -28, z: -2, hx: 1.6, hz: 3, h: 2.6, kind: 'cont', color: '#e2607f', label: 'SK-104' },
  { x: -18, z: 6, hx: 3, hz: 1.6, h: 2.6, kind: 'cont', color: '#3e7d8c', label: 'SK-217' },
  { x: -24, z: 12, hx: 1.6, hz: 2.4, h: 5.2, kind: 'stack', color: '#c9556d', label: 'SK-098' },
  // mid spine and cross cover
  { x: -8, z: -8, hx: 4, hz: 1.6, h: 2.6, kind: 'cont', color: '#4d8a7a', label: 'SK-331' },
  { x: 2, z: -2, hx: 1.6, hz: 4, h: 5.2, kind: 'stack', color: '#b98a3c', label: 'SK-412' },
  { x: 8, z: 6, hx: 4, hz: 1.6, h: 2.6, kind: 'cont', color: '#5b7fa6', label: 'SK-527' },
  { x: -2, z: 12, hx: 3, hz: 1.6, h: 2.6, kind: 'cont', color: '#e2607f', label: 'SK-640' },
  { x: 12, z: -12, hx: 3, hz: 1.6, h: 2.6, kind: 'cont', color: '#3e7d8c', label: 'SK-733' },
  // north lane
  { x: -6, z: -18, hx: 4, hz: 1.6, h: 2.6, kind: 'cont', color: '#4d8a7a', label: 'SK-845' },
  { x: 14, z: -18, hx: 3, hz: 1.6, h: 5.2, kind: 'stack', color: '#c9556d', label: 'SK-856' },
  // east lane
  { x: 26, z: -4, hx: 1.6, hz: 4, h: 2.6, kind: 'cont', color: '#b98a3c', label: 'SK-902' },
  { x: 18, z: 2, hx: 3, hz: 1.6, h: 2.6, kind: 'cont', color: '#5b7fa6', label: 'SK-918' },
  // warehouse B: north wall with a door gap at x 23..27, west wall gap z 11..13
  { x: 20, z: 5, hx: 3, hz: 0.5, h: 4.2, kind: 'wall' },
  { x: 29, z: 5, hx: 4, hz: 0.5, h: 4.2, kind: 'wall' },
  { x: 17, z: 8, hx: 0.5, hz: 3, h: 4.2, kind: 'wall' },
  { x: 17, z: 16, hx: 0.5, hz: 3, h: 4.2, kind: 'wall' },
  { x: 24, z: 16.5, hx: 3, hz: 1.4, h: 2.6, kind: 'cont', color: '#3e7d8c', label: 'SK-077' },
  // site A furniture + crane legs
  { x: -27, z: -10, hx: 1.3, hz: 1.3, h: 1.3, kind: 'crate' },
  { x: -17.5, z: -18, hx: 1.3, hz: 1.3, h: 1.3, kind: 'crate' },
  { x: -28, z: -20, hx: 0.45, hz: 0.45, h: 11, kind: 'leg' },
  { x: -16, z: -20, hx: 0.45, hz: 0.45, h: 11, kind: 'leg' },
  { x: -28, z: -8, hx: 0.45, hz: 0.45, h: 11, kind: 'leg' },
  { x: -16, z: -8, hx: 0.45, hz: 0.45, h: 11, kind: 'leg' },
  // scattered crates (crouch cover)
  { x: 0, z: 18, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
  { x: -12, z: -15, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
  { x: 6, z: -16, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
  { x: 13, z: 13, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
  { x: -14, z: 16, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
  { x: 30, z: 18, hx: 1.2, hz: 1.2, h: 1.2, kind: 'crate' },
];

export const SPAWNS = {
  attack: [
    { x: -29, z: 19, yaw: -0.6 }, { x: -26.5, z: 20.5, yaw: -0.6 }, { x: -30.5, z: 16.5, yaw: -0.6 },
    { x: -27, z: 16, yaw: -0.6 }, { x: -25, z: 18.5, yaw: -0.6 },
  ],
  defend: [
    { x: -20, z: -19, yaw: 2.6 }, { x: -25, z: -12, yaw: 1.2 }, { x: 22, z: 8, yaw: -2.4 },
    { x: 27, z: 15, yaw: -2.8 }, { x: 6, z: -14, yaw: 3.0 },
  ],
};

// Waypoint graph nodes; edges are derived from clear straight-line sight.
const NAV_NODES = [
  [-29, 19], [-22, 18], [-14, 18], [-6, 18], [4, 18], [12, 16], [17, 12], [21, 12], [24, 12],
  [-28, 8], [-22, 4], [-14, 2], [-6, 4], [4, 4], [12, 2], [20, -2], [26, -8],
  [-28, -6], [-22, -12], [-22, -14], [-14, -12], [-6, -10], [4, -10], [12, -8], [20, -14],
  [28, -16], [28, -19], [-6, -19.5], [6, -19.5], [-16, -19.5], [25, 5], [25, 9], [30, 12],
  [-31, -14], [10, 10], [-10, -3], [16, -18],
];

const _v = { x: 0, y: 0, z: 0 };

// Ray vs every box (3D slab test, boxes stand on y=0) plus the ground plane.
// Returns the nearest hit distance or Infinity. Used for bullets and sight.
export function rayHitWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    let tmin = 0, tmax = maxDist;
    // x slab
    if (Math.abs(dx) < 1e-8) { if (ox < b.x - b.hx || ox > b.x + b.hx) continue; }
    else {
      let t1 = (b.x - b.hx - ox) / dx, t2 = (b.x + b.hx - ox) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // y slab (0..h)
    if (Math.abs(dy) < 1e-8) { if (oy < 0 || oy > b.h) continue; }
    else {
      let t1 = (0 - oy) / dy, t2 = (b.h - oy) / dy;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // z slab
    if (Math.abs(dz) < 1e-8) { if (oz < b.z - b.hz || oz > b.z + b.hz) continue; }
    else {
      let t1 = (b.z - b.hz - oz) / dz, t2 = (b.z + b.hz - oz) / dz;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best && tmin > 0.01) best = tmin;
  }
  return best;
}

// Is the straight line between two eye points free of world geometry?
// Smoke is checked by the caller (it lives in match state, not the map).
export function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const hit = rayHitWorld(ax, ay, az, dx / dist, dy / dist, dz / dist, dist);
  return hit >= dist - 0.35;
}

// Circle-vs-AABB push-out, run twice so corners resolve cleanly. Mutates pos.
export function collideMove(pos, radius) {
  pos.x = Math.max(WORLD.minX + radius, Math.min(WORLD.maxX - radius, pos.x));
  pos.z = Math.max(WORLD.minZ + radius, Math.min(WORLD.maxZ - radius, pos.z));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < BOXES.length; i++) {
      const b = BOXES[i];
      const nx = Math.max(b.x - b.hx, Math.min(b.x + b.hx, pos.x));
      const nz = Math.max(b.z - b.hz, Math.min(b.z + b.hz, pos.z));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smaller penetration axis
        const px = b.hx + radius - Math.abs(pos.x - b.x);
        const pz = b.hz + radius - Math.abs(pos.z - b.z);
        if (px < pz) pos.x = b.x + (pos.x >= b.x ? 1 : -1) * (b.hx + radius);
        else pos.z = b.z + (pos.z >= b.z ? 1 : -1) * (b.hz + radius);
      }
    }
  }
  return pos;
}

function segmentClear(ax, az, bx, bz, inflate) {
  // 2D segment vs inflated footprints of boxes tall enough to block walking.
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    const minX = b.x - b.hx - inflate, maxX = b.x + b.hx + inflate;
    const minZ = b.z - b.hz - inflate, maxZ = b.z + b.hz + inflate;
    if (segmentHitsRect(ax, az, bx, bz, minX, minZ, maxX, maxZ)) return false;
  }
  return true;
}

function segmentHitsRect(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  // Liang-Barsky clip; true when the segment touches the rect at all.
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - minX, maxX - ax, az - minZ, maxZ - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
    else {
      const r = q[i] / p[i];
      if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

export function buildNav() {
  const nodes = NAV_NODES.map(([x, z], id) => ({ id, x, z }));
  const edges = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x, dz = nodes[j].z - nodes[i].z;
      const d = Math.hypot(dx, dz);
      if (d > 19) continue;
      if (!segmentClear(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, 0.55)) continue;
      edges[i].push({ to: j, cost: d });
      edges[j].push({ to: i, cost: d });
    }
  }
  return { nodes, edges };
}

// Dijkstra over the waypoint graph; returns a list of node ids or [].
export function findPath(nav, fromX, fromZ, toX, toZ) {
  const nearest = (x, z) => {
    let best = -1, bd = Infinity;
    for (const n of nav.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  };
  const start = nearest(fromX, fromZ), goal = nearest(toX, toZ);
  if (start === goal) return [goal];
  const dist = new Array(nav.nodes.length).fill(Infinity);
  const prev = new Array(nav.nodes.length).fill(-1);
  const done = new Array(nav.nodes.length).fill(false);
  dist[start] = 0;
  for (let iter = 0; iter < nav.nodes.length; iter++) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < nav.nodes.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u === -1 || u === goal) break;
    done[u] = true;
    for (const e of nav.edges[u]) {
      const nd = dist[u] + e.cost;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  if (!isFinite(dist[goal])) return [];
  const path = [];
  for (let cur = goal; cur !== -1; cur = prev[cur]) path.push(cur);
  path.reverse();
  return path;
}

export function siteAt(x, z) {
  for (const s of SITES) {
    if (Math.hypot(x - s.x, z - s.z) <= s.radius) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scene construction. Materials are shared; geometry is shared unit boxes
// scaled per prop, so the whole yard is a few dozen draw calls.
// ---------------------------------------------------------------------------
export function buildWorld(THREE, scene) {
  const group = new THREE.Group();
  scene.add(group);

  const lanes = [
    [[-29, 19], [-22, -14]], [[-29, 19], [24, 12]], [[28, -19], [-22, -14]], [[28, -19], [24, 12]],
    [[-6, 18], [-6, -19.5]], [[12, 16], [12, -8]],
  ];
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 52),
    new THREE.MeshStandardMaterial({ map: groundTexture(THREE, SITES, lanes), roughness: 0.94, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const clad = new THREE.MeshStandardMaterial({ map: claddingTexture(THREE), roughness: 0.8, metalness: 0.25 });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(THREE), roughness: 0.85 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(THREE), roughness: 0.9 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd8641f, roughness: 0.55, metalness: 0.5 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const containerMats = new Map();
  const matFor = (b) => {
    if (b.kind === 'wall') return clad;
    if (b.kind === 'crate') return crateMat;
    if (b.kind === 'leg') return legMat;
    if (!containerMats.has(b.label)) {
      const tex = containerTexture(THREE, b.color, shade(b.color, -38), b.label);
      containerMats.set(b.label, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.35 }));
    }
    return containerMats.get(b.label);
  };

  for (const b of BOXES) {
    if (b.kind === 'stack') {
      addBox(THREE, group, unitBox, matFor(b), b.x, 1.3, b.z, b.hx * 2, 2.6, b.hz * 2);
      addBox(THREE, group, unitBox, matFor(b), b.x, 3.9, b.z, b.hx * 2, 2.6, b.hz * 2);
    } else {
      addBox(THREE, group, unitBox, matFor(b), b.x, b.h / 2, b.z, b.hx * 2, b.h, b.hz * 2);
    }
    if (b.kind === 'cont' || b.kind === 'stack') {
      const skirt = new THREE.Mesh(unitBox, hazard);
      skirt.scale.set(b.hx * 2 + 0.06, 0.28, b.hz * 2 + 0.06);
      skirt.position.set(b.x, 0.14, b.z);
      group.add(skirt);
    }
  }

  // Perimeter fence: posts + two long walls of cladding, low enough to see sky.
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x394048, roughness: 0.7, metalness: 0.4 });
  addBox(THREE, group, unitBox, fenceMat, 0, 1.6, WORLD.minZ - 0.6, 70, 3.2, 0.4);
  addBox(THREE, group, unitBox, fenceMat, 0, 1.6, WORLD.maxZ + 0.6, 70, 3.2, 0.4);
  addBox(THREE, group, unitBox, fenceMat, WORLD.minX - 0.6, 1.6, 0, 0.4, 3.2, 48);
  addBox(THREE, group, unitBox, fenceMat, WORLD.maxX + 0.6, 1.6, 0, 0.4, 3.2, 48);

  // The crane over Site A: beam, trolley and a hanging hook block.
  const crane = new THREE.Group();
  const beam = new THREE.Mesh(unitBox, legMat);
  beam.scale.set(15, 0.8, 1.1); beam.position.set(-22, 11.2, -14); beam.castShadow = true;
  crane.add(beam);
  const trolley = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.6 }));
  trolley.scale.set(1.6, 0.9, 1.5); trolley.position.set(-22, 10.6, -14);
  crane.add(trolley);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.4, 6), trolley.material);
  cable.position.set(-22, 8.2, -14);
  crane.add(cable);
  const hook = new THREE.Mesh(unitBox, legMat);
  hook.scale.set(1.1, 0.9, 1.1); hook.position.set(-22, 5.8, -14); hook.castShadow = true;
  crane.add(hook);
  group.add(crane);

  // Warehouse roof over Site B (open sides face the doors; it reads as a
  // building in screenshots without darkening the fight inside too much).
  const roof = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.85, metalness: 0.2 }));
  roof.scale.set(17.5, 0.35, 19.5); roof.position.set(25.2, 4.45, 14.7); roof.castShadow = true;
  group.add(roof);

  // Lamp posts: emissive heads; the real light comes from 3 PointLights.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6, metalness: 0.5 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb45e, emissiveIntensity: 2.2 });
  const lampSpots = [[-22, -14], [24, 12], [0, 0], [-29, 19], [28, -19]];
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), lampMat);
    pole.position.set(x + 2.4, 2.7, z + 2.4);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulbMat);
    bulb.position.set(x + 2.4, 5.5, z + 2.4);
    group.add(bulb);
  }

  // The Bloom Charge prop: a coral case with a blinking core, planted by
  // round.js (visible only while planted). Returned for the round manager.
  const charge = new THREE.Group();
  const caseMesh = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.4, metalness: 0.6 }));
  caseMesh.scale.set(0.62, 0.34, 0.44); caseMesh.position.y = 0.17; caseMesh.castShadow = true;
  charge.add(caseMesh);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xff7aa8, emissive: 0xff4d84, emissiveIntensity: 2.5 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), coreMat);
  core.position.y = 0.42;
  charge.add(core);
  charge.visible = false;
  group.add(charge);

  return { group, charge, coreMat, colliders: BOXES };
}

function addBox(THREE, group, geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}
