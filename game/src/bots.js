// bots.js — the nine other guns in the yard: four Sakura Guard attackers who
// push a site and plant, five Iron Tide defenders who hold posts, rotate on
// contact and defuse. Every bot perceives through the same rules — field of
// view, line of sight against the real map boxes, smoke blocking sight, and
// gunfire noise — then acts on a small state machine:
//
//   push / hold / rotate   travel the waypoint graph (map.js findPath)
//   engage                 strafe, crouch in bursts, fire with human-ish aim
//   plant / defuse         channel the objective when the site is clear
//   investigate            walk to the last sound or sighting, then settle
//
// Shooting itself is not done here: bots ask main.js to fire through the
// exact same code path the player uses (ammo, spread, recoil, damage), so a
// bot's rifle obeys the same accuracy economy as yours.

import { collideMove, findPath, losClear, SITES } from './map.js';
import { createLoadout } from './weapons.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATTACK_NAMES = ['MOMO-2', 'RIN-3', 'YUI-4', 'SAKI-5'];
const DEFEND_NAMES = ['VOLT-1', 'HAVOC-2', 'ONYX-3', 'BRINE-4', 'KESTREL-5'];
const DEFEND_POSTS = [
  { x: -19, z: -17.5, site: 'A' }, { x: -25.5, z: -10.5, site: 'A' },
  { x: 21, z: 8.5, site: 'B' }, { x: 27.5, z: 15.5, site: 'B' },
  { x: 4, z: -6, site: 'MID' },
];
const GUARD_OFFSETS = [[3.5, 2], [-3, 3.5], [0.5, -4], [-4, -2.5]];

export function botEyeY(bot) { return bot.crouch ? 1.16 : 1.55; }

export function createBotRoster(THREE, scene) {
  const roster = [];
  const mk = (name, team, i) => {
    const bot = {
      id: `bot-${team}-${i}`, name, callsign: name, team, isPlayer: false,
      alive: true, hp: 100, kills: 0, deaths: 0, money: 800,
      pos: { x: 0, z: 0 }, y: 0, vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0, crouch: false, grounded: true, scoped: false,
      loadout: createLoadout(),
      // brain
      role: team === 'attack' ? 'push' : 'hold',
      path: [], pathIdx: 0, goalX: 0, goalZ: 0, hasGoal: false,
      seen: null, seenAt: -99, lastSeenX: 0, lastSeenZ: 0, hasLastSeen: false,
      thinkAt: Math.random() * 0.15, burstLeft: 0, burstPauseUntil: 0, reactAt: 0,
      strafeDir: 1, strafeFlipAt: 0, crouchUntil: 0, post: null, flashT: 0, deathT: 0,
      lastAttacker: null, lastHurtAt: -99, blindUntil: 0, stepAcc: 0,
      group: buildBotMesh(THREE, team, name),
    };
    if (team === 'defend') bot.post = DEFEND_POSTS[i];
    scene.add(bot.group);
    roster.push(bot);
    return bot;
  };
  ATTACK_NAMES.forEach((n, i) => mk(n, 'attack', i));
  DEFEND_NAMES.forEach((n, i) => mk(n, 'defend', i));
  return roster;
}

function buildBotMesh(THREE, team, name) {
  const g = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({
    color: team === 'attack' ? 0xd94f70 : 0x2f6f7e, roughness: 0.75,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.6, metalness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a37e, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const part = (mat, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(box, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  part(dark, -0.14, 0.3, 0, 0.2, 0.6, 0.24);   // legs
  part(dark, 0.14, 0.3, 0, 0.2, 0.6, 0.24);
  const torso = part(uniform, 0, 0.95, 0, 0.62, 0.68, 0.34); // torso (hit flash target)
  part(dark, 0, 0.98, -0.2, 0.5, 0.5, 0.08);   // vest plate (faces -Z, the facing dir)
  part(skin, 0, 1.55, 0, 0.34, 0.32, 0.34);    // head
  part(team === 'attack' ? new THREE.MeshStandardMaterial({ color: 0xff7aa8, roughness: 0.5 }) : dark, 0, 1.74, 0, 0.4, 0.12, 0.4); // cap
  part(dark, 0.18, 1.05, -0.42, 0.09, 0.09, 0.62); // rifle, points -Z
  g.userData.torso = torso;
  g.userData.uniform = uniform;
  // callsign sprite so screenshots read as a team fight, not mannequins
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const ctx2 = c.getContext('2d');
  ctx2.font = 'bold 30px ui-monospace, monospace';
  ctx2.textAlign = 'center';
  ctx2.fillStyle = 'rgba(10,12,16,0.55)';
  ctx2.fillRect(28, 6, 200, 42);
  ctx2.fillStyle = team === 'attack' ? '#ffb3c8' : '#a8e0ea';
  ctx2.fillText(name, 128, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 0.37, 1);
  sprite.position.y = 2.15;
  g.add(sprite);
  g.userData.sprite = sprite;
  return g;
}

export function resetBot(bot, spawn) {
  bot.alive = true;
  bot.hp = 100;
  bot.pos.x = spawn.x; bot.pos.z = spawn.z;
  bot.yaw = spawn.yaw;
  bot.vel.x = 0; bot.vel.z = 0;
  bot.crouch = false;
  bot.seen = null; bot.hasLastSeen = false;
  bot.path = []; bot.hasGoal = false;
  bot.role = bot.team === 'attack' ? 'push' : 'hold';
  bot.deathT = 0; bot.flashT = 0;
  bot.group.rotation.set(0, 0, 0);
  bot.group.visible = true;
  syncBotMesh(bot);
}

export function syncBotMesh(bot) {
  bot.group.position.set(bot.pos.x, bot.y, bot.pos.z);
  bot.group.rotation.y = bot.yaw; // model faces -Z; forward under yaw is (-sin, -cos), same as the player
  const crouchDip = bot.crouch ? 0.32 : 0;
  bot.group.position.y = bot.y - crouchDip * 0.4;
  bot.group.scale.y = bot.crouch ? 0.82 : 1;
  if (!bot.alive && bot.deathT > 0) {
    const t = Math.min(1, bot.deathT / 0.35);
    bot.group.rotation.x = -t * Math.PI * 0.48;
    bot.group.position.y = -t * 0.25;
  }
  const torso = bot.group.userData.torso;
  if (torso) {
    const flash = bot.flashT > 0 ? 0.85 : 0;
    torso.material.emissive?.setRGB(flash, flash * 0.25, flash * 0.25);
  }
  const sprite = bot.group.userData.sprite;
  if (sprite) sprite.material.opacity = bot.alive ? 0.92 : 0;
}

// --- perception -------------------------------------------------------------
function smokeBlocks(state, ax, az, bx, bz) {
  for (const s of state.smokes) {
    if (state.time > s.until) continue;
    // distance from smoke centre to the sight segment, in plan view
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((s.x - ax) * dx + (s.z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - s.x, pz = az + dz * t - s.z;
    if (px * px + pz * pz < s.radius * s.radius) return true;
  }
  return false;
}

function perceive(bot, ctx) {
  const { state, combatants, playerEyeY } = ctx;
  if (state.time < bot.blindUntil) { bot.seen = null; return; } // flashbanged
  let best = null, bestDist = Infinity;
  for (const e of combatants) {
    if (!e.alive || e.team === bot.team) continue;
    const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 58) continue;
    const eEye = e.isPlayer ? playerEyeY : botEyeY(e);
    const myEye = botEyeY(bot);
    // hearing at close range: a sprinting enemy within 8 m is "seen"
    const eSpeed = Math.hypot(e.vel.x, e.vel.z);
    let visible = false;
    if (dist < 8 && eSpeed > 3.4) visible = true;
    if (!visible) {
      const angTo = Math.atan2(-dx, -dz); // yaw that faces the enemy (player convention)
      let diff = angTo - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.85 && dist > 4) continue; // outside the 212° awareness cone
      if (!losClear(bot.pos.x, myEye, bot.pos.z, e.pos.x, eEye, e.pos.z)) continue;
      if (smokeBlocks(state, bot.pos.x, bot.pos.z, e.pos.x, e.pos.z)) continue;
      visible = true;
    }
    if (visible && dist < bestDist) { best = e; bestDist = dist; }
  }
  if (best) {
    if (!bot.seen || bot.seen !== best) bot.reactAt = state.time + 0.22 + ctx.rng() * 0.15;
    bot.seen = best;
    bot.seenAt = state.time;
    bot.lastSeenX = best.pos.x; bot.lastSeenZ = best.pos.z;
    bot.hasLastSeen = true;
  } else if (state.time - bot.seenAt > 3.5) {
    bot.seen = null;
  }
  // hearing gunfire: fresh noise from the other team becomes a lead
  for (const n of state.noiseEvents) {
    if (n.team === bot.team) continue;
    const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
    if (d < n.radius && state.time - n.at < 0.4) {
      if (!bot.seen) { bot.lastSeenX = n.x; bot.lastSeenZ = n.z; bot.hasLastSeen = true; }
    }
  }
  // being shot is the loudest signal of all
  if (bot.lastAttacker && bot.lastAttacker.alive && state.time - (bot.lastHurtAt ?? -99) < 2.5) {
    bot.lastSeenX = bot.lastAttacker.pos.x;
    bot.lastSeenZ = bot.lastAttacker.pos.z;
    bot.hasLastSeen = true;
  }
}

// --- movement ---------------------------------------------------------------
function setGoal(bot, nav, x, z) {
  bot.goalX = x; bot.goalZ = z;
  bot.path = findPath(nav, bot.pos.x, bot.pos.z, x, z);
  bot.pathIdx = 0;
  bot.hasGoal = true;
}

function followPath(bot, dt, nav, speed) {
  if (!bot.hasGoal) { bot.vel.x = 0; bot.vel.z = 0; return true; }
  let tx = bot.goalX, tz = bot.goalZ;
  if (bot.pathIdx < bot.path.length) {
    const node = nav.nodes[bot.path[bot.pathIdx]];
    tx = node.x; tz = node.z;
    if (Math.hypot(tx - bot.pos.x, tz - bot.pos.z) < 1.1) {
      bot.pathIdx++;
      return followPath(bot, dt, nav, speed);
    }
  }
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.55 && bot.pathIdx >= bot.path.length) {
    bot.vel.x = 0; bot.vel.z = 0;
    bot.hasGoal = false;
    return true;
  }
  const vx = (dx / (dist || 1)) * speed, vz = (dz / (dist || 1)) * speed;
  bot.vel.x += (vx - bot.vel.x) * Math.min(1, dt * 8);
  bot.vel.z += (vz - bot.vel.z) * Math.min(1, dt * 8);
  faceTowards(bot, Math.atan2(-(tx - bot.pos.x), -(tz - bot.pos.z)), dt, 6);
  return false;
}

function faceTowards(bot, targetYaw, dt, rate) {
  let diff = targetYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  bot.yaw += step;
  return Math.abs(diff);
}

// --- the brain ---------------------------------------------------------------
export function updateBots(roster, dt, ctx) {
  const { state, nav } = ctx;
  for (const bot of roster) {
    if (!bot.alive) {
      bot.deathT += dt;
      bot.flashT = Math.max(0, bot.flashT - dt);
      syncBotMesh(bot);
      continue;
    }
    bot.flashT = Math.max(0, bot.flashT - dt);
    bot.loadout.recoil = Math.max(0, bot.loadout.recoil - dt * 5.2);

    // perception on a staggered cadence keeps the frame cheap
    bot.thinkAt -= dt;
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.12;
      perceive(bot, ctx);
      chooseGoal(bot, ctx);
    }

    const target = bot.seen && bot.seen.alive && state.time - bot.seenAt < 0.6 ? bot.seen : null;
    if (target && state.phase !== 'buy' && state.time >= bot.reactAt) {
      engage(bot, target, dt, ctx);
    } else if (bot.role === 'plant' || bot.role === 'defuse') {
      bot.vel.x = 0; bot.vel.z = 0; // channeling: round.js drives progress
      if (target) faceTowards(bot, Math.atan2(-(target.pos.x - bot.pos.x), -(target.pos.z - bot.pos.z)), dt, 6);
    } else {
      const speed = bot.hasLastSeen && state.time - bot.seenAt < 6 ? 4.3 : 3.7;
      followPath(bot, dt, nav, state.phase === 'buy' ? 0 : speed);
      // settle onto the post: small idle sway reads as holding an angle
      if (!bot.hasGoal && bot.role === 'hold' && bot.post) {
        faceTowards(bot, bot.postYaw ?? bot.yaw, dt, 2);
      }
    }

    bot.pos.x += bot.vel.x * dt;
    bot.pos.z += bot.vel.z * dt;
    collideMove(bot.pos, 0.42);
    separate(bot, ctx.combatants);
    syncBotMesh(bot);
  }
}

function separate(bot, combatants) {
  for (const o of combatants) {
    if (o === bot || !o.alive) continue;
    const dx = bot.pos.x - o.pos.x, dz = bot.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < 0.81) {
      const d = Math.sqrt(d2);
      bot.pos.x = o.pos.x + (dx / d) * 0.9;
      bot.pos.z = o.pos.z + (dz / d) * 0.9;
    }
  }
}

function chooseGoal(bot, ctx) {
  const { state, nav, rng } = ctx;
  if (state.phase === 'buy' || state.phase === 'end' || state.phase === 'match_end') return;

  if (state.phase === 'planted') {
    const site = SITES.find((s) => s.id === state.plantedSite);
    if (bot.team === 'defend') {
      const d = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
      const nearest = ctx.combatants
        .filter((c) => c.team === 'defend' && c.alive)
        .sort((a, b) => Math.hypot(a.pos.x - site.x, a.pos.z - site.z) - Math.hypot(b.pos.x - site.x, b.pos.z - site.z))[0];
      if (bot === nearest && d < 2.2 && !bot.seen) { bot.role = 'defuse'; return; }
      bot.role = 'rotate';
      if (!bot.hasGoal || Math.hypot(bot.goalX - site.x, bot.goalZ - site.z) > 3) setGoal(bot, nav, site.x + (rng() - 0.5) * 3, site.z + (rng() - 0.5) * 3);
      return;
    }
    // attackers fall back and guard the planted charge from cover nearby
    bot.role = 'guard';
    const gi = ctx.roster.filter((c) => c.team === 'attack').indexOf(bot);
    const [ox, oz] = GUARD_OFFSETS[gi % GUARD_OFFSETS.length];
    if (!bot.hasGoal) setGoal(bot, nav, site.x + ox, site.z + oz);
    return;
  }

  if (bot.team === 'attack') {
    const site = SITES.find((s) => s.id === state.targetSite);
    const isPlanter = bot === ctx.planter;
    const dSite = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
    if (isPlanter && dSite < 2.4 && !bot.seen) { bot.role = 'plant'; return; }
    if (bot.role === 'plant' && bot.seen) bot.role = 'push';
    if (isPlanter) {
      if (!bot.hasGoal || Math.hypot(bot.goalX - site.x, bot.goalZ - site.z) > 2.5) setGoal(bot, nav, site.x, site.z);
      bot.role = 'push';
    } else {
      // escorts fan out around the planter's site, then hold its mouth
      const gi = ctx.roster.filter((c) => c.team === 'attack' && c !== ctx.planter).indexOf(bot);
      const [ox, oz] = GUARD_OFFSETS[gi % GUARD_OFFSETS.length];
      const tx = site.x + ox * 1.8, tz = site.z + oz * 1.8;
      if (!bot.hasGoal && Math.hypot(bot.pos.x - tx, bot.pos.z - tz) > 2) setGoal(bot, nav, tx, tz);
      bot.role = dSite < 9 ? 'hold' : 'push';
    }
    return;
  }

  // defenders: hold the post until a lead pulls them off it
  if (bot.hasLastSeen && state.time - bot.seenAt < 5) {
    bot.role = 'investigate';
    if (!bot.hasGoal || Math.hypot(bot.goalX - bot.lastSeenX, bot.goalZ - bot.lastSeenZ) > 3) {
      setGoal(bot, nav, bot.lastSeenX, bot.lastSeenZ);
    }
  } else if (bot.post) {
    bot.role = 'hold';
    bot.postYaw = Math.atan2(-(0 - bot.post.x), -(0 - bot.post.z)); // roughly toward mid
    if (Math.hypot(bot.pos.x - bot.post.x, bot.pos.z - bot.post.z) > 1.4 && !bot.hasGoal) {
      setGoal(bot, nav, bot.post.x, bot.post.z);
    }
  }
}

function engage(bot, target, dt, ctx) {
  const { state, rng } = ctx;
  const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  const aimYaw = Math.atan2(-dx, -dz);
  const diff = faceTowards(bot, aimYaw, dt, 7.5);

  // strafe perpendicular, flipping on a timer; crouch for a beat mid-burst —
  // the classic bot dance that also makes its own spread breathe
  if (state.time > bot.strafeFlipAt) {
    bot.strafeDir = rng() < 0.5 ? -1 : 1;
    bot.strafeFlipAt = state.time + 0.6 + rng() * 0.9;
    if (rng() < 0.3) bot.crouchUntil = state.time + 0.7;
  }
  bot.crouch = state.time < bot.crouchUntil;
  const px = Math.cos(bot.yaw) * bot.strafeDir, pz = -Math.sin(bot.yaw) * bot.strafeDir;
  const closing = dist > 16 ? 1.6 : dist < 5 ? -1.1 : 0;
  const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
  const wantX = (px * 2.1 + fx * closing), wantZ = (pz * 2.1 + fz * closing);
  if (bot.role === 'plant' || bot.role === 'defuse') {
    bot.vel.x = 0; bot.vel.z = 0;
  } else {
    bot.vel.x += (wantX - bot.vel.x) * Math.min(1, dt * 9);
    bot.vel.z += (wantZ - bot.vel.z) * Math.min(1, dt * 9);
  }

  // burst discipline: fire the weapon's burst, pause, re-acquire
  if (state.time < bot.burstPauseUntil) return;
  if (diff > 0.09) return; // not on target yet
  if (bot.burstLeft <= 0) {
    const def = bot.loadout.current;
    bot.burstLeft = def === 'smg' ? 5 : def === 'rifle' ? 4 : def === 'shotgun' ? 1 : 3;
  }
  const fired = ctx.fire(bot);
  if (fired) {
    bot.burstLeft--;
    if (bot.burstLeft <= 0) bot.burstPauseUntil = state.time + 0.32 + rng() * 0.5;
  }
}
