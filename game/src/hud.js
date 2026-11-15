// hud.js — everything flat on the glass: health and armour, money, the round
// clock and score, ammunition, the killfeed, the buy menu, the plant/defuse
// progress bar, round banners and a live minimap of Harbor Yard.
//
// The HUD never simulates anything; main.js hands it the state each frame and
// it only touches the DOM when a value actually changed.

import { PHASE, TEAM, formatClock } from './state.js';
import { SHOP, WEAPONS } from './weapons.js';
import { SITES, WORLD } from './map.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const timer = el('timer'), phaseLabel = el('phase-label');
  const scoreA = el('score-attack'), scoreD = el('score-defend'), roundLabel = el('round-label');
  const money = el('money'), hpValue = el('hp-value'), hpFill = el('hp-fill'), armorValue = el('armor-value');
  const weaponName = el('weapon-name'), ammoMag = el('ammo-mag'), ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo'), grenades = el('grenades');
  const killfeed = el('killfeed'), banner = el('banner'), bannerTitle = el('banner-title'), bannerSub = el('banner-sub');
  const objective = el('objective'), plantbar = el('plantbar'), plantFill = el('plant-fill'), plantLabel = el('plant-label');
  const crosshair = el('crosshair'), hitmarker = el('hitmarker');
  const damage = el('damage'), flashEl = el('flash'), scopeEl = el('scope');
  const teamA = el('team-attack'), teamD = el('team-defend');
  const buyMenu = el('buymenu'), buyMoney = el('buymoney'), buyItems = el('buy-items');
  const minimap = el('minimap');
  const mm = minimap.getContext('2d');

  const cache = new Map();
  const setText = (node, key, value) => {
    if (cache.get(key) === value) return;
    cache.set(key, value);
    node.textContent = value;
  };
  const setWidth = (node, key, pct) => {
    const v = `${pct.toFixed(1)}%`;
    if (cache.get(key) === v) return;
    cache.set(key, v);
    node.style.width = v;
  };

  // build the buy menu once
  const buyButtons = new Map();
  for (const item of SHOP) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'buy-item';
    b.dataset.item = item.item;
    b.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
    buyItems.appendChild(b);
    buyButtons.set(item.item, b);
  }
  // team pips
  const pips = { attack: [], defend: [] };
  for (const [team, node] of [[TEAM.ATTACK, teamA], [TEAM.DEFEND, teamD]]) {
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('i');
      node.appendChild(d);
      pips[team].push(d);
    }
  }

  let hitTimer = 0;
  let buyOpen = false;
  let lastFeedKey = '';

  const mmX = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * minimap.width;
  const mmY = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * minimap.height;

  function drawMinimap(state, player, combatants, colliders) {
    mm.fillStyle = '#12151b';
    mm.fillRect(0, 0, minimap.width, minimap.height);
    mm.fillStyle = '#2b3038';
    for (const b of colliders) {
      mm.fillRect(mmX(b.x - b.hx), mmY(b.z - b.hz), Math.max(2, (b.hx * 2 / 66) * minimap.width), Math.max(2, (b.hz * 2 / 46) * minimap.height));
    }
    for (const s of SITES) {
      mm.strokeStyle = s.color;
      mm.lineWidth = 1.5;
      mm.beginPath();
      mm.arc(mmX(s.x), mmY(s.z), 9, 0, Math.PI * 2);
      mm.stroke();
      mm.fillStyle = s.color;
      mm.font = 'bold 9px ui-monospace, monospace';
      mm.textAlign = 'center';
      mm.fillText(s.id, mmX(s.x), mmY(s.z) + 3);
    }
    if (state.plantedSite) {
      const s = SITES.find((x) => x.id === state.plantedSite);
      mm.fillStyle = Math.floor(state.time * 3) % 2 ? '#ff4d84' : '#ffffff';
      mm.beginPath(); mm.arc(mmX(s.x), mmY(s.z), 3.5, 0, Math.PI * 2); mm.fill();
    }
    for (const c of combatants) {
      if (!c.alive) continue;
      const isEnemy = c.team !== player.team;
      if (isEnemy && state.time - (c.lastShotAt ?? -99) > 3 && !state.shotMode) continue;
      mm.fillStyle = c.isPlayer ? '#ffffff' : c.team === TEAM.ATTACK ? '#ff8fab' : '#7fd4e6';
      mm.beginPath();
      mm.arc(mmX(c.pos.x), mmY(c.pos.z), c.isPlayer ? 3.4 : 2.6, 0, Math.PI * 2);
      mm.fill();
    }
    // player view cone
    mm.strokeStyle = 'rgba(255,255,255,0.5)';
    mm.beginPath();
    mm.moveTo(mmX(player.pos.x), mmY(player.pos.z));
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    mm.lineTo(mmX(player.pos.x + fx * 6), mmY(player.pos.z + fz * 6));
    mm.stroke();
  }

  return {
    buyButtons,
    get buyOpen() { return buyOpen; },
    setBuyOpen(open) {
      buyOpen = open;
      buyMenu.hidden = !open;
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), killed ? 220 : 110);
    },

    update(state, player, combatants, colliders, spreadPx) {
      // clock + score
      const clock = state.phase === PHASE.PLANTED || state.phase === PHASE.LIVE || state.phase === PHASE.BUY
        ? formatClock(state.phaseTime) : '—:—';
      setText(timer, 'timer', clock);
      timer.classList.toggle('urgent', (state.phase === PHASE.LIVE || state.phase === PHASE.PLANTED) && state.phaseTime < 11);
      setText(phaseLabel, 'phase', {
        buy: 'BUY PHASE', live: `ROUND ${state.round}`, planted: 'CHARGE PLANTED', end: 'ROUND OVER', match_end: 'MATCH OVER',
      }[state.phase]);
      setText(scoreA, 'sa', String(state.score.attack));
      setText(scoreD, 'sd', String(state.score.defend));
      setText(roundLabel, 'round', `ROUND ${state.round} · FIRST TO 7`);
      setText(money, 'money', `$${player.money}`);

      // pips: filled = alive, hollow = dead, first pip ringed = the player
      for (const team of [TEAM.ATTACK, TEAM.DEFEND]) {
        const members = combatants.filter((c) => c.team === team);
        members.forEach((c, i) => {
          const pip = pips[team][i];
          if (!pip) return;
          const cls = `pip ${c.alive ? 'alive' : 'dead'} ${c.isPlayer ? 'me' : ''}`;
          if (cache.get(`pip-${team}-${i}`) !== cls) { cache.set(`pip-${team}-${i}`, cls); pip.className = cls; }
        });
      }

      // vitals
      setText(hpValue, 'hp', String(Math.ceil(player.hp)));
      setWidth(hpFill, 'hpfill', Math.max(0, player.hp));
      hpFill.classList.toggle('low', player.hp <= 30);
      setText(armorValue, 'armor', player.loadout.armor > 0 ? `🛡 ${Math.ceil(player.loadout.armor)}` : '');

      // weapon + ammo
      const lo = player.loadout;
      const cur = lo.current;
      const def = cur === 'grenade' ? null : WEAPONS[cur];
      const wName = cur === 'grenade' ? `${lo.grenade?.toUpperCase()} GRENADE` : def.name + (lo.primary === cur ? '' : '');
      setText(weaponName, 'wname', wName);
      if (def) {
        setText(ammoMag, 'mag', String(lo.mag[cur]));
        setText(ammoReserve, 'res', `/ ${lo.reserve[cur]}`);
        ammoBox.classList.toggle('empty', lo.mag[cur] === 0);
        const reloading = state.time < lo.reloadingUntil;
        ammoBox.classList.toggle('reloading', reloading);
        if (reloading) setText(ammoMag, 'mag', '···');
      } else {
        setText(ammoMag, 'mag', '1');
        setText(ammoReserve, 'res', '');
      }
      const gText = [
        lo.frag ? `⬤ Frag ×${lo.frag}` : '', lo.flash ? `⬤ Flash ×${lo.flash}` : '', lo.smoke ? `⬤ Smoke ×${lo.smoke}` : '',
      ].filter(Boolean).join('  ');
      setText(grenades, 'gren', gText);

      // crosshair breathes with real spread
      crosshair.style.setProperty('--gap', `${6 + spreadPx}px`);
      crosshair.classList.toggle('hidden', player.scoped && cur === 'dmr');

      // killfeed
      const feedKey = state.killfeed.map((k) => k.text).join('|');
      if (feedKey !== lastFeedKey) {
        lastFeedKey = feedKey;
        killfeed.innerHTML = '';
        for (const k of state.killfeed.slice(0, 5)) {
          const d = document.createElement('div');
          d.className = 'feed-item';
          d.textContent = k.text;
          killfeed.appendChild(d);
        }
      }

      // banner + objective + progress
      if (state.banner) {
        banner.hidden = false;
        setText(bannerTitle, 'bt', state.banner.title);
        setText(bannerSub, 'bs', state.banner.sub);
      } else banner.hidden = true;
      setText(objective, 'obj', state.message || '');
      const prog = state.phase === 'planted' ? state.defuseProgress : state.plantProgress;
      if (prog > 0.01 && state.phase !== 'end') {
        plantbar.hidden = false;
        setText(plantLabel, 'pl', state.phase === 'planted' ? 'DEFUSING…' : 'PLANTING THE BLOOM CHARGE…');
        setWidth(plantFill, 'pfill', prog * 100);
      } else plantbar.hidden = true;

      // buy menu affordability
      if (buyOpen) {
        setText(buyMoney, 'bmoney', `$${player.money}`);
        for (const item of SHOP) {
          const b = buyButtons.get(item.item);
          const owned = (item.item === 'armor' && lo.armor >= 100)
            || ((item.item === 'frag' || item.item === 'flash' || item.item === 'smoke') && lo[item.item] >= 1)
            || lo.primary === item.item;
          b.classList.toggle('cant', !owned && player.money < item.price);
          b.classList.toggle('owned', owned);
        }
      }

      // full-screen feedback layers
      const hurt = player.alive && state.time - player.lastHurtAt < 0.35;
      damage.classList.toggle('on', hurt || !player.alive);
      flashEl.classList.toggle('on', state.time < player.flashUntil);
      const fl = state.time < player.flashUntil ? Math.min(1, (player.flashUntil - state.time) / 1.6) : 0;
      flashEl.style.opacity = String(fl * 0.92);
      scopeEl.hidden = !(player.scoped && cur === 'dmr');

      drawMinimap(state, player, combatants, colliders);
    },
  };
}
