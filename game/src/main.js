// main.js — Sakura Strike bootstrap and the glue between every system.
//
//   fixed-step simulation (60 Hz): rounds -> player -> bots -> reloads -> fx
//   rendering (per animation frame): camera, viewmodel, HUD, three.js
//
// The fire path lives here because it is the one place player and bots meet:
// ctx.fire(shooter) is handed to bots.js, the player's trigger calls the
// same function, and both travel through weapons.js hit resolution, so
// there is exactly one set of gun rules in the game.

import * as THREE from 'three';
import { createState, PHASE, TEAM, ECONOMY } from './state.js';
import { buildWorld, buildNav, SITES, rayHitWorld } from './map.js';
import { createInput, createPlayer, stepPlayer, eyePos, createViewmodel } from './player.js';
import { createBotRoster, updateBots, resetBot, botEyeY, mulberry32 } from './bots.js';
import { WEAPONS, SHOP, tryBuy, effectiveSpread, resolveShot, applyDamage, damageFor } from './weapons.js';
import { createRounds } from './round.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import * as sfx from './audio.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // start | buy | play | planted | null

// --- renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x93a9c4);
scene.fog = new THREE.Fog(0x9db1c7, 55, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

// dusk harbour light: low warm sun, cool sky fill, lamp pools on the sites
const sun = new THREE.DirectionalLight(0xffd9ae, 2.7);
sun.position.set(34, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x9db8d9, 0x54483a, 0.85));
for (const s of SITES) {
  const lamp = new THREE.PointLight(0xffb45e, 60, 20, 1.8);
  lamp.position.set(s.x + 2.4, 5.2, s.z + 2.4);
  scene.add(lamp);
}

// backdrop silhouettes beyond the fence: harbour cranes and sheds at dusk
{
  const silMat = new THREE.MeshStandardMaterial({ color: 0x46536a, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sil = (x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(box, silMat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    scene.add(m);
  };
  sil(-40, 7, -34, 3, 14, 3); sil(-38.5, 14.5, -34, 16, 1.6, 2); // far crane
  sil(44, 6, -20, 14, 12, 10); sil(46, 5, 18, 12, 10, 12);       // sheds
  sil(-44, 5, 16, 10, 10, 14); sil(0, 4, -40, 30, 8, 6);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 60), new THREE.MeshStandardMaterial({ color: 0x39536b, roughness: 0.35, metalness: 0.4 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.06, -68);
  scene.add(sea);
}

// --- world, cast, systems ---------------------------------------------------
const world = buildWorld(THREE, scene);
const nav = buildNav();
const state = createState();
state.shotMode = shotMode;
const rng = mulberry32(20261115);

const player = createPlayer({ x: -29, z: 19, yaw: -0.6 });
const roster = createBotRoster(THREE, scene);
const combatants = [player, ...roster];
const planter = roster.find((b) => b.team === TEAM.ATTACK);

const fx = createEffects(THREE, scene);
const hud = createHud();
const viewmodel = createViewmodel(THREE);
camera.add(viewmodel.group);

const roundsDeps = {
  state, player, roster, combatants, world, fx, rng,
  resetBot,
  playerPlantHeld: false,
};
const rounds = createRounds(roundsDeps);

// --- the one fire path --------------------------------------------------------
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

function shooterEye(c) {
  if (c.isPlayer) return eyePos(c, _eye);
  _eye.set(c.pos.x, botEyeY(c) - 0.08, c.pos.z);
  return _eye;
}

function fire(shooter) {
  if (state.phase !== PHASE.LIVE && state.phase !== PHASE.PLANTED) return false;
  if (!shooter.alive) return false;
  const lo = shooter.loadout;
  const wid = lo.current;
  if (wid === 'grenade') return false;
  const def = WEAPONS[wid];
  if (state.time < lo.nextShotAt) return false;
  if (state.time < lo.reloadingUntil) return false;
  if (lo.mag[wid] <= 0) {
    sfx.playDryFire();
    lo.nextShotAt = state.time + 0.3;
    startReload(shooter);
    return false;
  }
  lo.mag[wid] -= 1;
  lo.nextShotAt = state.time + 60 / def.rpm;
  lo.recoil = Math.min(1.7, lo.recoil + def.recoil * 0.16);
  shooter.lastShotAt = state.time;
  state.noiseEvents.push({ x: shooter.pos.x, z: shooter.pos.z, radius: 27, team: shooter.team, at: state.time });

  const eye = shooterEye(shooter);
  _from.copy(eye);
  if (!shooter.isPlayer && !shooter.seen) return false; // bots only fire at a seen target
  if (shooter.isPlayer) {
    const cp = Math.cos(shooter.pitch), sp = Math.sin(shooter.pitch);
    _dir.set(-Math.sin(shooter.yaw) * cp, sp, -Math.cos(shooter.yaw) * cp);
    // viewmodel + camera kick
    viewmodel.state.kick = Math.min(1, viewmodel.state.kick + def.recoil * 0.45);
    shooter.pitch += def.recoil * 0.0028;
    const mo = viewmodel.muzzleOffset();
    // muzzle sits low-right of the eye, half a metre ahead of the camera
    const fwdX = -Math.sin(shooter.yaw), fwdZ = -Math.cos(shooter.yaw);
    const rgtX = Math.cos(shooter.yaw), rgtZ = -Math.sin(shooter.yaw);
    _from.set(
      eye.x + fwdX * 0.5 + rgtX * Math.abs(mo.x) * 0.6,
      eye.y - 0.14,
      eye.z + fwdZ * 0.5 + rgtZ * Math.abs(mo.x) * 0.6,
    );
  } else {
    // bots aim at their current target's chest with priced-in error
    const t = shooter.seen;
    if (!t) return false;
    const ty = t.isPlayer ? t.y + (t.crouch ? 0.85 : 1.22) : (t.crouch ? 0.8 : 1.05);
    _dir.set(t.pos.x - eye.x, ty - eye.y, t.pos.z - eye.z).normalize();
    _from.set(eye.x - Math.sin(shooter.yaw) * 0.45, eye.y - 0.12, eye.z - Math.cos(shooter.yaw) * 0.45);
  }

  const distToPlayer = Math.hypot(player.pos.x - shooter.pos.x, player.pos.z - shooter.pos.z);
  sfx.playShot(wid, shooter.isPlayer ? 0 : distToPlayer);
  fx.muzzle(_from);

  const spread = effectiveSpread(def, shooter) + (shooter.isPlayer ? 0 : 0.013);
  for (let p = 0; p < def.pellets; p++) {
    const d = jitterDir(_dir, spread);
    const hit = resolveShot(_from, d, shooter, combatants);
    _to.set(hit.end.x, hit.end.y, hit.end.z);
    fx.tracer(_from, _to, shooter.team);
    if (hit.target) {
      const dmg = damageFor(def, hit.head, hit.dist);
      const result = applyDamage(hit.target, dmg, hit.head);
      hit.target.lastAttacker = shooter;
      hit.target.lastHurtAt = state.time;
      if (hit.target.isPlayer) sfx.playHurt();
      else hit.target.flashT = 0.14;
      fx.sparks(hit.end.x, hit.end.y, hit.end.z, hit.head ? 7 : 4, 0xff8f6b);
      if (shooter.isPlayer) {
        sfx.playHit(hit.head);
        hud.hitMarker(result === 'kill');
      }
      if (result === 'kill') onKill(shooter, hit.target, def, hit.head);
    } else if (hit.hitWorld) {
      fx.sparks(hit.end.x, hit.end.y, hit.end.z, 3, 0xffc46b);
    }
  }
  if (lo.mag[wid] === 0) startReload(shooter);
  return true;
}

const _jd = new THREE.Vector3();
function jitterDir(base, spread) {
  // uniform cone jitter; reuses one vector (callers copy into resolveShot args)
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  _jd.copy(base);
  _jd.x += Math.cos(a) * r;
  _jd.y += Math.sin(a) * r * 0.7 + spread * 0.35; // recoil bias climbs
  _jd.z += Math.sin(a + 1.3) * r;
  return _jd.normalize();
}

function onKill(killer, target, def, head) {
  killer.kills += 1;
  rounds.grant(killer, 300);
  state.killfeed.unshift({
    text: `${killer.callsign} ▸ ${def.name} ▸ ${target.callsign}${head ? ' ⌖ headshot' : ''}`,
    until: state.time + 5,
  });
  if (target.isPlayer) {
    state.message = 'You are down. Your team fights on.';
  }
}

function startReload(c) {
  const lo = c.loadout;
  const wid = lo.current;
  if (wid === 'grenade') return;
  const def = WEAPONS[wid];
  if (lo.mag[wid] >= def.mag || lo.reserve[wid] <= 0) return;
  if (state.time < lo.reloadingUntil) return;
  lo.reloadingUntil = state.time + def.reloadSec;
  lo.reloadWeapon = wid;
  if (c.isPlayer) sfx.playReloadStart();
}

function finishReloads() {
  for (const c of combatants) {
    const lo = c.loadout;
    if (!lo.reloadWeapon || state.time < lo.reloadingUntil) continue;
    const wid = lo.reloadWeapon;
    const def = WEAPONS[wid];
    const need = def.mag - lo.mag[wid];
    const take = Math.min(need, lo.reserve[wid]);
    lo.mag[wid] += take;
    lo.reserve[wid] -= take;
    lo.reloadWeapon = null;
    lo.reloadingUntil = 0;
    if (c.isPlayer) sfx.playReloadEnd();
  }
}

// --- grenades -----------------------------------------------------------------
function throwGrenade(c, kind) {
  const lo = c.loadout;
  if (lo[kind] <= 0) return false;
  lo[kind] -= 1;
  const eye = shooterEye(c);
  if (c.isPlayer) {
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    _dir.set(-Math.sin(c.yaw) * cp, sp + 0.18, -Math.cos(c.yaw) * cp).normalize();
  } else {
    _dir.set(-Math.sin(c.yaw), 0.35, -Math.cos(c.yaw)).normalize();
  }
  fx.throwGrenade(kind, { x: eye.x, y: eye.y - 0.1, z: eye.z }, _dir, c);
  sfx.playThrow();
  if (c.isPlayer && lo[kind] === 0 && lo.current === 'grenade') {
    lo.current = lo.primary ?? 'pistol';
    lo.grenade = null;
  }
  return true;
}

function onGrenadeDone(g) {
  const at = { x: g.x, y: Math.max(0.6, g.y), z: g.z };
  if (g.kind === 'smoke') {
    state.smokes.push({ x: at.x, z: at.z, radius: 2.7, since: state.time, until: state.time + 9 });
    fx.boom(at.x, at.y, at.z, false);
    return;
  }
  if (g.kind === 'flash') {
    sfx.playFlashbang();
    fx.boom(at.x, at.y + 0.4, at.z, false);
    for (const c of combatants) {
      if (!c.alive || c === g.owner) continue;
      const d = Math.hypot(c.pos.x - at.x, c.pos.z - at.z);
      if (d > 15) continue;
      // facing the bang and able to see it = blinded, scaled by distance
      const eyeY = c.isPlayer ? c.y + c.eye : botEyeY(c);
      _dir.set(at.x - c.pos.x, at.y - eyeY, at.z - c.pos.z).normalize();
      const fx2 = -Math.sin(c.yaw), fz2 = -Math.cos(c.yaw);
      const facing = _dir.x * fx2 + _dir.z * fz2;
      if (facing < 0.15) continue;
      if (rayDistance(at, c) < d - 0.4) continue; // a wall ate the flash
      const dur = (1 - d / 16) * 2.6 * facing;
      if (c.isPlayer) c.flashUntil = state.time + dur;
      else c.blindUntil = state.time + dur;
    }
    return;
  }
  // frag: radial damage, halved through cover, deadly at the core
  sfx.playExplosion();
  fx.boom(at.x, at.y, at.z, true);
  for (const c of combatants) {
    if (!c.alive) continue;
    const d = Math.hypot(c.pos.x - at.x, c.pos.z - at.z);
    if (d > 6) continue;
    let dmg = 95 * (1 - d / 6.5);
    // cover check: a wall between the blast and the body halves it again
    const wallT = rayDistance(at, c);
    if (wallT < d - 0.4) dmg *= 0.45;
    if (c === g.owner) dmg *= 0.5;
    if (dmg < 4) continue;
    const result = applyDamage(c, dmg, false);
    c.lastAttacker = g.owner;
    c.lastHurtAt = state.time;
    if (!c.isPlayer) c.flashT = 0.14;
    if (result === 'kill' && g.owner) onKill(g.owner, c, { name: 'Frag Grenade' }, false);
  }
}

function rayDistance(from, c) {
  const dx = c.pos.x - from.x, dy = 1 - from.y, dz = c.pos.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  return rayHitWorld(from.x, from.y, from.z, dx / dist, dy / dist, dz / dist, dist);
}

// --- input wiring ---------------------------------------------------------------
const input = createInput(renderer.domElement, (locked) => {
  if (!locked && started && !shotMode && state.phase !== PHASE.MATCH_END) showOverlay('paused');
});
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const playBtn = document.getElementById('play-btn');
let started = false;

function showOverlay(mode) {
  if (mode === 'paused') {
    overlayTitle.innerHTML = 'PAUSED';
    overlayCopy.textContent = 'The yard waits. Click to jump back in.';
    playBtn.textContent = 'Click to resume';
  } else if (mode === 'match_end') {
    overlayTitle.innerHTML = state.winner === TEAM.ATTACK ? 'SAKURA <em>GUARD</em> WIN' : 'IRON <em>TIDE</em> WIN';
    overlayCopy.textContent = `Final score ${state.score.attack} — ${state.score.defend}. The yard resets for another match.`;
    playBtn.textContent = 'Play again';
  }
  overlay.hidden = false;
}
function hideOverlay() { overlay.hidden = true; }

playBtn.addEventListener('click', () => {
  sfx.initAudio();
  hideOverlay();
  if (!started || state.phase === PHASE.MATCH_END) {
    started = true;
    rounds.startMatch();
    hud.setBuyOpen(true);
  }
  input.requestLock();
});
hud.buyButtons.forEach((btn, item) => {
  btn.addEventListener('click', () => {
    if (state.phase !== PHASE.BUY) return;
    if (tryBuy(player, item)) sfx.playBuy();
  });
});

// --- per-step player actions ------------------------------------------------------
let prevFiring = false;
function playerActions() {
  const lo = player.loadout;
  // buy phase shopping by number row
  if (hud.buyOpen && state.phase === PHASE.BUY) {
    for (const item of SHOP) {
      if (input.wasPressed(`Digit${item.key}`)) {
        if (tryBuy(player, item.item)) sfx.playBuy();
      }
    }
  } else {
    if (input.wasPressed('Digit1') && lo.primary) { lo.current = lo.primary; lo.grenade = null; }
    if (input.wasPressed('Digit2')) { lo.current = 'pistol'; lo.grenade = null; }
    if (input.wasPressed('Digit3') || input.wasPressed('KeyG')) cycleGrenade();
  }
  if (input.wasPressed('KeyB') && state.phase === PHASE.BUY) hud.setBuyOpen(!hud.buyOpen);
  if (input.wasPressed('Escape')) hud.setBuyOpen(false);
  if (input.wasPressed('KeyR')) startReload(player);

  player.scoped = input.state.aiming && lo.current === 'dmr' && player.alive;
  roundsDeps.playerPlantHeld = input.state.keys.has('KeyE');

  const firing = input.state.firing;
  if (firing && player.alive && !hud.buyOpen) {
    if (lo.current === 'grenade') {
      if (!prevFiring && lo.grenade) throwGrenade(player, lo.grenade);
    } else if (WEAPONS[lo.current].auto || !prevFiring) {
      fire(player);
    }
  }
  prevFiring = firing;
}

function cycleGrenade() {
  const lo = player.loadout;
  const kinds = ['frag', 'flash', 'smoke'].filter((k) => lo[k] > 0);
  if (!kinds.length) return;
  if (lo.current !== 'grenade') {
    lo.current = 'grenade';
    lo.grenade = kinds[0];
  } else {
    const next = kinds[(kinds.indexOf(lo.grenade) + 1) % kinds.length];
    lo.grenade = next;
  }
}

// --- simulation step ---------------------------------------------------------------
const botCtx = {
  state, nav, combatants, roster, planter,
  rng,
  fire,
  get playerEyeY() { return player.y + player.eye; },
};

let lastPhase = null;
function step(dt) {
  rounds.update(dt);
  if (state.phase === PHASE.BUY && lastPhase !== PHASE.BUY && started && !shotMode) hud.setBuyOpen(true);
  lastPhase = state.phase;
  if (player.alive) {
    stepPlayer(player, dt, input, state.phase === PHASE.BUY || state.phase === PHASE.END || !started);
    if (started && !shotMode) playerActions();
  } else {
    input.takeLook();
    roundsDeps.playerPlantHeld = false;
  }
  updateBots(roster, dt, botCtx);
  finishReloads();
  fx.update(dt, performance.now() / 1000, onGrenadeDone);
  fx.syncSmokes(state);
  if (state.phase === PHASE.MATCH_END && started && overlay.hidden && !shotMode) showOverlay('match_end');
  if (state.phase !== PHASE.BUY && hud.buyOpen) hud.setBuyOpen(false);
}

// --- camera + render ------------------------------------------------------------
const _camTarget = new THREE.Vector3();
function updateCamera(dt) {
  if (shotMode === 'cover') {
    camera.position.set(19, 7.5, 21);
    camera.lookAt(-6, 0.8, -6);
    camera.fov = 58;
    camera.updateProjectionMatrix();
    viewmodel.group.visible = false;
    return;
  }
  if (!player.alive && started) {
    // spectate the first living teammate from just behind their shoulder
    const ally = roster.find((b) => b.alive && b.team === player.team) ?? roster.find((b) => b.alive);
    if (ally) {
      const fx2 = -Math.sin(ally.yaw), fz2 = -Math.cos(ally.yaw);
      camera.position.set(ally.pos.x - fx2 * 4.2, 2.6, ally.pos.z - fz2 * 4.2);
      _camTarget.set(ally.pos.x + fx2 * 8, 1.2, ally.pos.z + fz2 * 8);
      camera.lookAt(_camTarget);
    }
    viewmodel.group.visible = false;
    document.getElementById('spectate').hidden = false;
    return;
  }
  document.getElementById('spectate').hidden = true;
  viewmodel.group.visible = true;
  eyePos(player, camera.position);
  camera.position.y += Math.sin(player.bobPhase * 2) * 0.02 * player.bobAmount - player.landDip;
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = Math.sin(player.bobPhase) * 0.0022 * player.bobAmount;
  const targetFov = player.scoped ? 36 : 75;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 11);
  camera.updateProjectionMatrix();
  const lookVelX = input.state.lookX, lookVelY = input.state.lookY;
  viewmodel.setWeapon(player.loadout.current === 'grenade' ? 'grenade' : player.loadout.current);
  viewmodel.update(dt, player, lookVelX, lookVelY, state.time < player.loadout.reloadingUntil);
}

// --- staged screenshot scenes -----------------------------------------------------
function stageShot(mode) {
  started = true;
  rounds.startMatch();
  state.banner = null; // staged scenes set their own banner (or none)
  // staging buys happen on a staging wallet, then the wallet is set to the
  // amount the scene should display — tryBuy on the $800 pistol-round wallet
  // would silently refuse the rifle and leave the scene holding a sidearm
  const buyKit = (moneyAfter) => {
    player.money = 6000;
    tryBuy(player, 'rifle'); tryBuy(player, 'armor'); tryBuy(player, 'frag');
    player.money = moneyAfter;
  };
  const put = (c, x, z, yaw) => { c.pos.x = x; c.pos.z = z; c.yaw = yaw; if (!c.isPlayer) resetBotPos(c); };
  const resetBotPos = (b) => { b.group.position.set(b.pos.x, 0, b.pos.z); b.group.rotation.y = b.yaw; };
  if (mode === 'cover') {
    document.getElementById('hud').style.display = 'none';
    overlay.hidden = false;
    return;
  }
  overlay.hidden = true;
  if (mode === 'buy') {
    buyKit(2550);
    state.phaseTime = 9;
    put(player, -27.5, 17.5, -0.7);
    // the whole squad stages well clear of the camera: a teammate two metres
    // away fills the frame with their callsign sprite and buries the menu
    put(roster[0], -20, 24, -0.5);
    put(roster[1], -34, 8, -0.9);
    put(roster[2], -18, 27, -0.4);
    put(roster[3], -36, 25, -1.1);
    hud.setBuyOpen(true);
    state.message = 'Buy phase — spend before the freeze lifts.';
  }
  if (mode === 'play') {
    state.phase = PHASE.LIVE;
    state.phaseTime = 47;
    state.round = 6;
    state.score.attack = 3; state.score.defend = 2;
    buyKit(1150);
    player.loadout.mag.rifle = 30;
    player.hp = 72; player.loadout.armor = 64;
    put(player, -1, 9, -0.785);
    put(roster[5], 7.5, 0.5, 2.2);   // a defender in the open, mid-lane
    put(roster[6], 16, -6, 2.6);
    put(roster[0], -5.5, 13, -1.1);  // escort behind the player
    put(roster[1], -8, 5, -1.3);
    roster[8].alive = false; roster[8].group.visible = false;
    roster[3].alive = false; roster[3].group.visible = false;
    state.killfeed = [
      { text: 'MOMO-2 ▸ Sakura AR-7 ▸ ONYX-3', until: 9999 },
      { text: 'VOLT-1 ▸ Kaze SMG ▸ SAKI-5', until: 9999 },
    ];
    state.message = 'Contact mid — hold your angle.';
    // keep the rifle firing on a loop so whichever frame the screenshot
    // lands on carries a tracer, a muzzle flash and a kicked viewmodel
    setInterval(() => { fire(player); }, 130);
  }
  if (mode === 'planted') {
    state.phase = PHASE.PLANTED;
    state.phaseTime = 14;
    state.plantedSite = 'A';
    state.round = 8;
    state.score.attack = 4; state.score.defend = 3;
    buyKit(2900);
    player.hp = 58; player.loadout.armor = 31;
    world.charge.visible = true;
    world.charge.position.set(-22, 0, -14);
    put(player, -16.5, -7.5, 0.67);
    put(roster[8], -20.5, -12.5, 0.6);  // KESTREL-5 closing on the charge
    roster[8].role = 'defuse';
    state.defuseProgress = 0.45;
    put(roster[0], -25, -17, -2.4);
    roster[6].alive = false; roster[6].group.visible = false;
    roster[7].alive = false; roster[7].group.visible = false;
    roster[2].alive = false; roster[2].group.visible = false;
    state.banner = { title: 'BLOOM CHARGE PLANTED', sub: 'Site A — Crane Deck · defend the fuse', until: 9999 };
    state.message = 'KESTREL-5 is defusing!';
  }
}

// --- boot + main loop ---------------------------------------------------------------
if (shotMode) stageShot(shotMode);
else rounds.startMatch();

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!shotMode) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  } else {
    // staged scenes still tick effects + bot idle so frames look alive
    fx.update(dt, now / 1000, onGrenadeDone);
    fx.syncSmokes(state);
    state.time += dt;
  }
  updateCamera(dt);
  const def = WEAPONS[player.loadout.current === 'grenade' ? 'pistol' : player.loadout.current];
  const spreadPx = (player.loadout.current === 'grenade' ? 4 : (effectiveSpread(def, player) * 620));
  hud.update(state, player, combatants, world.colliders, spreadPx);
  renderer.render(scene, camera);
  window.__sakuraReady = true;
}
requestAnimationFrame(frame);
window.__sakura = { state, player, combatants, rounds }; // console/debug handle

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
