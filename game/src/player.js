// player.js — the human's body in the yard: input, pointer-lock mouse look,
// acceleration-based movement with crouch and a small jump, and the
// first-person viewmodel that bobs, sways and kicks with recoil.
//
// Movement is deliberately tactical-shooter flavoured: you accelerate fast
// but full speed takes a beat, crouching is slow and steady, and your spread
// (weapons.js) is priced off the velocity computed here — stop to shoot.

import { collideMove } from './map.js';
import { createLoadout } from './weapons.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.14;
const RADIUS = 0.42;
const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.3;

export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, consumed by the frame that reads them
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  window.addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; state.aiming = false; });
  window.addEventListener('mousemove', (e) => {
    if (!state.locked) return;
    state.lookX += e.movementX;
    state.lookY += e.movementY;
  });
  window.addEventListener('mousedown', (e) => {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); state.firing = false; state.aiming = false; }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    takeLook() {
      const x = state.lookX, y = state.lookY;
      state.lookX = 0; state.lookY = 0;
      return { x, y };
    },
    wasPressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearPressed() { pressed.clear(); },
  };
}

export function createPlayer(spawn) {
  return {
    id: 'player', name: 'You', callsign: 'BOSS-1', team: 'attack', isPlayer: true,
    alive: true, hp: 100, kills: 0, deaths: 0, money: 800,
    pos: { x: spawn.x, z: spawn.z }, y: 0,
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw, pitch: 0, crouch: false, grounded: true, scoped: false,
    eye: EYE_STAND, bobPhase: 0, bobAmount: 0, landDip: 0,
    loadout: createLoadout(),
    flashUntil: 0, lastHurtAt: -99, timeSeen: 0,
  };
}

export function eyePos(player, out) {
  out.set(player.pos.x, player.y + player.eye, player.pos.z);
  return out;
}

// One fixed step of movement. `frozen` (buy phase / round end) bleeds speed
// to zero and ignores input, the way a freeze time should feel.
export function stepPlayer(player, dt, input, frozen) {
  const look = input.takeLook();
  const sens = player.scoped ? 0.0011 : 0.0021;
  player.yaw -= look.x * sens;
  player.pitch -= look.y * sens;
  player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));

  const keys = input.state.keys;
  player.crouch = !frozen && (keys.has('ControlLeft') || keys.has('KeyC'));
  const targetEye = player.crouch ? EYE_CROUCH : EYE_STAND;
  player.eye += (targetEye - player.eye) * Math.min(1, dt * 11);

  let ix = 0, iz = 0;
  if (!frozen) {
    if (keys.has('KeyW')) iz -= 1;
    if (keys.has('KeyS')) iz += 1;
    if (keys.has('KeyA')) ix -= 1;
    if (keys.has('KeyD')) ix += 1;
  }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // yaw 0 looks down -Z; forward = (-sin? ) — keep one convention everywhere:
  // forward vector is ( -sin(yaw)? ) No: with rotation order YXZ and yaw about
  // Y, the camera forward is (-sin yaw * cos pitch, sin pitch, -cos yaw * cos pitch)
  // when pitch is positive-up. Movement uses the flat version of the same.
  const fx = -sin, fz = -cos;
  const rx = cos, rz = -sin;
  let wx = fx * -iz + rx * ix;
  let wz = fz * -iz + rz * ix;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }

  const walking = !frozen && keys.has('ShiftLeft');
  const maxSpeed = (player.crouch ? CROUCH_SPEED : WALK_SPEED) * (player.scoped ? 0.55 : 1) * (walking ? 0.55 : 1);
  player.walking = walking;
  const accel = player.grounded ? 42 : 6;
  player.vel.x += wx * accel * dt;
  player.vel.z += wz * accel * dt;
  // friction / speed cap on the ground plane
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const drag = player.grounded ? Math.max(0, 1 - dt * (wl > 0 ? 2.2 : 10)) : 1;
  player.vel.x *= drag; player.vel.z *= drag;
  const sp2 = Math.hypot(player.vel.x, player.vel.z);
  if (sp2 > maxSpeed) {
    player.vel.x *= maxSpeed / sp2;
    player.vel.z *= maxSpeed / sp2;
  }
  void sp;

  if (!frozen && player.grounded && keys.has('Space') && !player.crouch) {
    player.vel.y = 4.4;
    player.grounded = false;
  }
  player.vel.y -= 12.5 * dt;
  player.y += player.vel.y * dt;
  if (player.y <= 0) {
    if (!player.grounded && player.vel.y < -3.4) player.landDip = 0.09;
    player.y = 0; player.vel.y = 0; player.grounded = true;
  } else if (player.y > 0.02) {
    player.grounded = false;
  }
  player.landDip = Math.max(0, player.landDip - dt * 0.35);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collideMove(player.pos, RADIUS);

  // head-bob bookkeeping for the camera and viewmodel
  const planar = Math.hypot(player.vel.x, player.vel.z);
  if (player.grounded && planar > 0.4) {
    player.bobPhase += dt * planar * 1.9;
    player.bobAmount = Math.min(1, player.bobAmount + dt * 6);
  } else {
    player.bobAmount = Math.max(0, player.bobAmount - dt * 6);
  }
  player.loadout.recoil = Math.max(0, player.loadout.recoil - dt * 5.2);
  return planar;
}

// --- Viewmodel -------------------------------------------------------------
// A low-poly gun built from boxes, one silhouette per weapon, parented to the
// camera. It sways against mouse movement, bobs while walking, dips on
// reload and kicks back on every shot (main.js pokes `kick`).
export function createViewmodel(THREE) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.45, metalness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.4, metalness: 0.3 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const parts = new Map();

  function build(id, spec) {
    const g = new THREE.Group();
    for (const [mat, x, y, z, sx, sy, sz] of spec) {
      const m = new THREE.Mesh(box, mat === 'a' ? accent : mat === 'g' ? grip : dark);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz);
      g.add(m);
    }
    g.visible = false;
    group.add(g);
    parts.set(id, g);
  }

  build('pistol', [
    ['d', 0, 0.02, -0.18, 0.075, 0.09, 0.3], ['g', 0, -0.09, -0.05, 0.07, 0.16, 0.09],
    ['a', 0, 0.075, -0.3, 0.02, 0.02, 0.05],
  ]);
  build('smg', [
    ['d', 0, 0.02, -0.3, 0.09, 0.11, 0.52], ['g', 0, -0.1, -0.12, 0.07, 0.18, 0.08],
    ['d', 0, -0.08, -0.34, 0.05, 0.2, 0.06], ['a', 0, 0.09, -0.52, 0.03, 0.03, 0.06],
  ]);
  build('shotgun', [
    ['d', 0, 0.03, -0.36, 0.1, 0.1, 0.66], ['g', 0, -0.02, -0.5, 0.11, 0.09, 0.2],
    ['g', 0, -0.1, -0.08, 0.07, 0.16, 0.09], ['a', 0, 0.1, -0.66, 0.03, 0.03, 0.05],
  ]);
  build('rifle', [
    ['d', 0, 0.02, -0.36, 0.09, 0.12, 0.62], ['g', 0, -0.11, -0.16, 0.07, 0.19, 0.08],
    ['d', 0, -0.09, -0.4, 0.055, 0.22, 0.07], ['d', 0, 0.11, -0.3, 0.04, 0.07, 0.2],
    ['a', 0, 0.155, -0.62, 0.025, 0.03, 0.05], ['a', 0.0, 0.02, -0.68, 0.05, 0.05, 0.06],
  ]);
  build('dmr', [
    ['d', 0, 0.02, -0.44, 0.085, 0.11, 0.8], ['g', 0, -0.11, -0.2, 0.07, 0.18, 0.08],
    ['d', 0, 0.13, -0.36, 0.07, 0.09, 0.26], ['a', 0, 0.02, -0.84, 0.045, 0.045, 0.08],
  ]);
  build('grenade', [
    ['g', 0, -0.02, -0.22, 0.11, 0.14, 0.11], ['a', 0, 0.07, -0.22, 0.05, 0.05, 0.05],
  ]);
  build('charge', [
    ['d', 0, -0.04, -0.26, 0.3, 0.16, 0.22], ['a', 0, 0.06, -0.26, 0.1, 0.06, 0.1],
  ]);

  let current = null;
  const state = { kick: 0, swayX: 0, swayY: 0, reloadDip: 0 };
  return {
    group,
    state,
    setWeapon(id) {
      if (current === id) return;
      current = id;
      for (const [k, g] of parts) g.visible = k === id;
    },
    update(dt, player, lookVelX, lookVelY, reloading) {
      state.kick = Math.max(0, state.kick - dt * 7);
      state.swayX += ((-lookVelX * 0.0016) - state.swayX) * Math.min(1, dt * 10);
      state.swayY += ((-lookVelY * 0.0016) - state.swayY) * Math.min(1, dt * 10);
      const targetDip = reloading ? 0.16 : 0;
      state.reloadDip += (targetDip - state.reloadDip) * Math.min(1, dt * 9);
      const bobY = Math.sin(player.bobPhase * 2) * 0.012 * player.bobAmount;
      const bobX = Math.cos(player.bobPhase) * 0.01 * player.bobAmount;
      const scopedIn = player.scoped ? 0.16 : 0;
      group.position.set(
        0.25 + bobX + state.swayX - scopedIn * 0.25,
        -0.235 + bobY + state.swayY - state.reloadDip - player.landDip * 0.4,
        -0.5 + state.kick * 0.09,
      );
      group.rotation.set(state.kick * 0.06 + state.reloadDip * 0.7, state.swayX * 0.6, 0);
      group.visible = !(player.scoped && current === 'dmr');
    },
    muzzleOffset() {
      // where the flash + tracer origin sits, relative to the camera
      return { x: group.position.x, y: group.position.y + 0.03, z: group.position.z - 0.75 };
    },
  };
}
