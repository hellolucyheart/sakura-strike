// effects.js — short-lived visual feedback: tracers, muzzle flashes, impact
// sparks, blood-free hit puffs, grenade bodies, smoke clouds and the
// detonation flash. Everything is pooled: a fixed set of meshes is recycled,
// so the hot loop allocates nothing per shot.

import { TEAM } from './state.js';

const MAX_TRACERS = 48;
const MAX_SPARKS = 240;
const MAX_GRENADES = 12;

export function createEffects(THREE, scene) {
  // Tracers: thin stretched boxes flown from muzzle to impact for one frame-ish.
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const tracerMatEnemy = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, until: 0 });
  }
  let tracerIdx = 0;

  // Sparks: one Points cloud, positions updated in place.
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIdx = 0;
  for (let i = 0; i < MAX_SPARKS; i++) sparkPos[i * 3 + 1] = -50;

  // Muzzle flash: a single additive sprite reused by whoever fired last,
  // plus per-bot small flashes are skipped — tracers carry bot shots.
  const flashTex = makeFlashTexture(THREE);
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, color: 0xffcf7d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.55, 0.55, 1);
  flash.visible = false;
  scene.add(flash);
  let flashUntil = 0;

  // Grenades in flight: small spheres with a trail of gravity.
  const grenGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenMats = {
    frag: new THREE.MeshStandardMaterial({ color: 0x3f5a36, roughness: 0.5, metalness: 0.3 }),
    flash: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.35, metalness: 0.5 }),
    smoke: new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.3 }),
  };
  const grenades = [];
  for (let i = 0; i < MAX_GRENADES; i++) {
    const m = new THREE.Mesh(grenGeo, grenMats.frag);
    m.visible = false;
    scene.add(m);
    grenades.push({ mesh: m, active: false, kind: 'frag', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, owner: null });
  }

  // Smoke clouds: soft dark spheres that also block bot sight (state.smokes).
  const smokeMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false });
  const smokeMeshes = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), smokeMat);
    m.visible = false;
    scene.add(m);
    smokeMeshes.push(m);
  }

  // Detonation / flash overlay light.
  const boomLight = new THREE.PointLight(0xffa050, 0, 30, 1.6);
  scene.add(boomLight);
  let boomUntil = 0;

  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  return {
    grenades,

    tracer(from, to, byPlayerTeam) {
      const t = tracers[tracerIdx++ % MAX_TRACERS];
      _mid.addVectors(from, to).multiplyScalar(0.5);
      t.mesh.position.copy(_mid);
      _dir.subVectors(to, from);
      const len = _dir.length();
      t.mesh.scale.set(1, 1, Math.max(0.1, len));
      t.mesh.lookAt(to);
      t.mesh.material = byPlayerTeam === TEAM.ATTACK ? tracerMat : tracerMatEnemy;
      t.mesh.visible = true;
      t.until = performance.now() / 1000 + 0.055;
    },

    muzzle(worldPos) {
      flash.position.copy(worldPos);
      flash.material.rotation = Math.random() * Math.PI;
      flash.visible = true;
      flashUntil = performance.now() / 1000 + 0.045;
    },

    sparks(x, y, z, n, color) {
      sparks.material.color.set(color);
      for (let k = 0; k < n; k++) {
        const i = sparkIdx++ % MAX_SPARKS;
        sparkPos[i * 3] = x; sparkPos[i * 3 + 1] = y; sparkPos[i * 3 + 2] = z;
        sparkVel[i * 3] = (Math.random() - 0.5) * 2.4;
        sparkVel[i * 3 + 1] = Math.random() * 2.2 + 0.4;
        sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
        sparkLife[i] = 0.32 + Math.random() * 0.2;
      }
    },

    throwGrenade(kind, from, dir, owner) {
      for (const g of grenades) {
        if (g.active) continue;
        g.active = true; g.kind = kind; g.owner = owner;
        g.mesh.material = grenMats[kind];
        g.mesh.visible = true;
        g.x = from.x; g.y = from.y; g.z = from.z;
        const speed = 13;
        g.vx = dir.x * speed; g.vy = dir.y * speed + 3.2; g.vz = dir.z * speed;
        g.fuse = kind === 'flash' ? 1.1 : 1.5;
        return g;
      }
      return null;
    },

    boom(x, y, z, big) {
      boomLight.position.set(x, y + 1, z);
      boomLight.intensity = big ? 260 : 60;
      boomUntil = performance.now() / 1000 + (big ? 0.5 : 0.2);
      this.sparks(x, y, z, big ? 60 : 18, big ? 0xff9a50 : 0xffffff);
    },

    syncSmokes(state) {
      for (let i = 0; i < smokeMeshes.length; i++) {
        const s = state.smokes[i];
        const m = smokeMeshes[i];
        if (!s) { m.visible = false; continue; }
        m.visible = true;
        m.position.set(s.x, 1.4, s.z);
        const grow = Math.min(1, (s.until - state.time) / 1.2, (state.time - s.since) / 0.8 + 0.2);
        m.scale.setScalar(Math.max(0.3, grow));
      }
    },

    update(dt, nowSec, onGrenadeDone) {
      for (const t of tracers) if (t.mesh.visible && nowSec > t.until) t.mesh.visible = false;
      if (flash.visible && nowSec > flashUntil) flash.visible = false;
      if (boomLight.intensity > 0 && nowSec > boomUntil) boomLight.intensity = 0;
      let dirty = false;
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6.5 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -50;
        dirty = true;
      }
      if (dirty) sparkGeo.attributes.position.needsUpdate = true;
      for (const g of grenades) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vy -= 16 * dt;
        g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
        if (g.y < 0.1) { g.y = 0.1; g.vy *= -0.35; g.vx *= 0.7; g.vz *= 0.7; }
        g.mesh.position.set(g.x, g.y, g.z);
        if (g.fuse <= 0) {
          g.active = false; g.mesh.visible = false;
          onGrenadeDone(g);
        }
      }
    },
  };
}

function makeFlashTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.35, 'rgba(255,180,80,0.85)');
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,230,180,0.9)';
  g.beginPath();
  g.moveTo(64, 2); g.lineTo(72, 52); g.lineTo(126, 64); g.lineTo(72, 76); g.lineTo(64, 126);
  g.lineTo(56, 76); g.lineTo(2, 64); g.lineTo(56, 52);
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
