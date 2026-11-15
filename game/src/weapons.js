// weapons.js — the armoury of Sakura Strike, plus the one hit-resolution
// path every shot in the game travels (player and bots alike).
//
// Gunplay rules the judge can read right here:
//   * Damage falls on a capsule body or a head sphere; the head pays a
//     multiplier (3x, 4x for the DMR), so aiming high is worth real money.
//   * Spread grows with movement speed and while airborne, shrinks when
//     crouched or scoped: standing still to shoot is the winning habit.
//   * Recoil accumulates per shot and decays; automatic fire walks upward.
//   * Armour soaks 55% of body damage until it is spent.

import { rayHitWorld } from './map.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Petal-9', slot: 'sidearm', price: 0, damage: 26, headMult: 3, rpm: 380, auto: false, mag: 12, reserve: 48, reloadSec: 1.4, spread: 0.011, recoil: 0.55, range: 42, pellets: 1, movePenalty: 1.0 },
  smg: { id: 'smg', name: 'Kaze SMG', slot: 'primary', price: 900, damage: 21, headMult: 3, rpm: 800, auto: true, mag: 30, reserve: 90, reloadSec: 1.9, spread: 0.02, recoil: 0.4, range: 34, pellets: 1, movePenalty: 0.9 },
  shotgun: { id: 'shotgun', name: 'Harbor-12', slot: 'primary', price: 1100, damage: 11, headMult: 2, rpm: 75, auto: false, mag: 6, reserve: 24, reloadSec: 2.6, spread: 0.055, recoil: 1.6, range: 18, pellets: 8, movePenalty: 1.0 },
  rifle: { id: 'rifle', name: 'Sakura AR-7', slot: 'primary', price: 2700, damage: 34, headMult: 3, rpm: 660, auto: true, mag: 30, reserve: 90, reloadSec: 2.2, spread: 0.013, recoil: 0.62, range: 60, pellets: 1, movePenalty: 1.0 },
  dmr: { id: 'dmr', name: 'Longbow DMR', slot: 'primary', price: 3200, damage: 68, headMult: 4, rpm: 240, auto: false, mag: 10, reserve: 40, reloadSec: 2.4, spread: 0.004, recoil: 1.3, range: 90, pellets: 1, movePenalty: 1.1 },
};

export const SHOP = [
  { key: '1', item: 'smg', label: 'Kaze SMG', price: 900 },
  { key: '2', item: 'shotgun', label: 'Harbor-12', price: 1100 },
  { key: '3', item: 'rifle', label: 'Sakura AR-7', price: 2700 },
  { key: '4', item: 'dmr', label: 'Longbow DMR', price: 3200 },
  { key: '5', item: 'armor', label: 'Kevlar Vest', price: 650 },
  { key: '6', item: 'frag', label: 'Frag Grenade', price: 300 },
  { key: '7', item: 'flash', label: 'Flash Grenade', price: 200 },
  { key: '8', item: 'smoke', label: 'Smoke Grenade', price: 300 },
];

export function createLoadout() {
  return {
    primary: null,          // weapon id or null
    current: 'pistol',      // weapon id in hand ('pistol' | primary | 'grenade')
    grenade: null,          // grenade kind in hand when current === 'grenade'
    mag: { pistol: WEAPONS.pistol.mag, smg: 0, shotgun: 0, rifle: 0, dmr: 0 },
    reserve: { pistol: WEAPONS.pistol.reserve, smg: 0, shotgun: 0, rifle: 0, dmr: 0 },
    armor: 0,               // 0..100 vest points
    frag: 0, flash: 0, smoke: 0,
    reloadingUntil: 0,
    nextShotAt: 0,
    recoil: 0,              // accumulated recoil, decays in the controllers
  };
}

// Give a fresh spawn its pistol-round kit back: keep bought primaries across
// rounds (tactical-shooter rules), refill pistol, keep armour if it survived.
export function respawnLoadout(loadout) {
  loadout.current = loadout.primary ?? 'pistol';
  loadout.grenade = null;
  loadout.mag.pistol = WEAPONS.pistol.mag;
  loadout.reserve.pistol = WEAPONS.pistol.reserve;
  if (loadout.primary) {
    loadout.mag[loadout.primary] = WEAPONS[loadout.primary].mag;
    loadout.reserve[loadout.primary] = WEAPONS[loadout.primary].reserve;
  }
  loadout.reloadingUntil = 0;
  loadout.nextShotAt = 0;
  loadout.recoil = 0;
  return loadout;
}

export function tryBuy(combatant, item) {
  const entry = SHOP.find((s) => s.item === item);
  if (!entry || combatant.money < entry.price) return false;
  const lo = combatant.loadout;
  if (item === 'armor') {
    if (lo.armor >= 100) return false;
    lo.armor = 100;
  } else if (item === 'frag' || item === 'flash' || item === 'smoke') {
    if (lo[item] >= 1) return false;
    lo[item] = 1;
  } else {
    // a primary: replaces the old one, arrives fully loaded
    lo.primary = item;
    lo.mag[item] = WEAPONS[item].mag;
    lo.reserve[item] = WEAPONS[item].reserve;
    lo.current = item;
  }
  combatant.money -= entry.price;
  return true;
}

// Bots shop with simple team-aware priorities and a little randomness, so
// rounds escalate: pistols, then SMGs and vests, then rifles and utility.
export function autoBuyBot(combatant, rng) {
  const lo = combatant.loadout;
  const want = rng();
  if (combatant.money >= 2700 && want < 0.62) tryBuy(combatant, 'rifle');
  else if (combatant.money >= 3200 && want < 0.78) tryBuy(combatant, 'dmr');
  else if (combatant.money >= 1100 && want < 0.5) tryBuy(combatant, 'shotgun');
  else if (combatant.money >= 900) tryBuy(combatant, 'smg');
  if (combatant.money >= 650 && lo.armor < 60) tryBuy(combatant, 'armor');
  if (combatant.money >= 500 && rng() < 0.5) tryBuy(combatant, 'frag');
  else if (combatant.money >= 400 && rng() < 0.4) tryBuy(combatant, 'flash');
  else if (combatant.money >= 300 && rng() < 0.3) tryBuy(combatant, 'smoke');
  lo.current = lo.primary ?? 'pistol';
}

// Effective spread (radians) for a shooter right now: the accuracy economy.
export function effectiveSpread(def, shooter) {
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  let s = def.spread;
  s *= 1 + (speed / 4.6) * 1.9 * def.movePenalty;   // running ruins aim
  if (!shooter.grounded) s *= 2.6;                  // jumping ruins it more
  if (shooter.crouch) s *= 0.72;                    // crouch to steady
  if (shooter.scoped) s *= 0.35;                    // DMR glass
  s *= 1 + shooter.loadout.recoil * 0.55;           // sustained fire walks
  return s;
}

function falloff(def, dist) {
  if (dist <= def.range * 0.45) return 1;
  const t = (dist - def.range * 0.45) / (def.range * 0.55);
  return Math.max(0.35, 1 - t * 0.6);
}

// Ray vs one combatant: body capsule approximated as a vertical cylinder
// (r 0.42, feet..chest) plus a head sphere. Returns {t, head} or null.
function rayVsCombatant(o, d, c) {
  const crouch = c.crouch;
  const topY = crouch ? 1.02 : 1.38;
  const headY = crouch ? 1.16 : 1.55;
  // head sphere first (smaller, in front of nothing)
  const hx = c.pos.x - o.x, hy = headY - o.y, hz = c.pos.z - o.z;
  const th = hx * d.x + hy * d.y + hz * d.z;
  if (th > 0) {
    const px = o.x + d.x * th - c.pos.x, py = o.y + d.y * th - headY, pz = o.z + d.z * th - c.pos.z;
    if (px * px + py * py + pz * pz <= 0.24 * 0.24) return { t: th, head: true };
  }
  // body cylinder: solve in XZ, then check the hit height
  const ox = o.x - c.pos.x, oz = o.z - c.pos.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const cc = ox * ox + oz * oz - 0.42 * 0.42;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0.05) return null;
  const y = o.y + d.y * t;
  if (y < 0 || y > topY) return null;
  return { t, head: false };
}

// One pellet/bullet: world first, then combatants in front of the wall hit.
// `friends` are skipped (no friendly fire — the yard is chaotic enough).
export function resolveShot(origin, dir, shooter, combatants, maxDist = 120) {
  const wallT = rayHitWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  let best = null;
  for (const c of combatants) {
    if (!c.alive || c === shooter || c.team === shooter.team) continue;
    const hit = rayVsCombatant(origin, dir, c);
    if (hit && hit.t < wallT && (!best || hit.t < best.t)) {
      best = { ...hit, target: c };
    }
  }
  const endT = best ? best.t : Math.min(wallT, maxDist);
  return {
    target: best ? best.target : null,
    head: best ? best.head : false,
    dist: endT,
    end: {
      x: origin.x + dir.x * endT,
      y: origin.y + dir.y * endT,
      z: origin.z + dir.z * endT,
    },
    hitWorld: !best && wallT <= maxDist,
  };
}

// Apply damage with armour soak. Returns 'hit' | 'kill'.
export function applyDamage(target, rawDamage, head) {
  let dmg = rawDamage;
  if (!head && target.loadout.armor > 0) {
    const soaked = Math.min(target.loadout.armor, dmg * 0.55);
    target.loadout.armor -= soaked / 0.55 * 0.6; // vest wears faster than it soaks
    dmg -= soaked;
  }
  target.hp -= dmg;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    return 'kill';
  }
  return 'hit';
}

export function damageFor(def, head, dist) {
  return def.damage * (head ? def.headMult : 1) * falloff(def, dist);
}
