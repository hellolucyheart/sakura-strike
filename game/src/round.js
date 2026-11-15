// round.js — the match director. Owns the phase clock and every transition:
//
//   buy ──12s──▶ live ──plant──▶ planted ──fuse 25s──▶ detonation
//    ▲            │                   │
//    │            ├─ elimination ─────┤
//    │            ├─ time expires     └─ defuse ──▶ defence wins
//    └──── 5s ◀── end (money settles, banner shows)
//
// Win money, loss money, the plant bonus and the kill reward all land here or
// in main.js's fire path, priced from ECONOMY in state.js. First to 7 rounds
// takes the match.

import { PHASE, TEAM, ECONOMY, settleRound } from './state.js';
import { SPAWNS, SITES, siteAt } from './map.js';
import { respawnLoadout, autoBuyBot } from './weapons.js';
import * as sfx from './audio.js';

export function aliveCount(combatants, team) {
  let n = 0;
  for (const c of combatants) if (c.alive && c.team === team) n++;
  return n;
}

export function createRounds(deps) {
  const { state, player, roster, combatants, world, fx, rng } = deps;
  let beepAt = 0;
  let settled = false;

  function grant(c, amount) {
    c.money = Math.max(0, Math.min(ECONOMY.maxMoney, c.money + amount));
  }

  function banner(title, sub, seconds = 3.2) {
    state.banner = { title, sub, until: state.time + seconds };
  }

  function startMatch() {
    state.score.attack = 0;
    state.score.defend = 0;
    state.round = 1;
    state.winner = null;
    for (const c of combatants) {
      c.money = ECONOMY.startMoney;
      c.kills = 0; c.deaths = 0;
      c.loadout = respawnLoadout(c.loadout);
      c.loadout.primary = null;
      c.loadout.frag = 0; c.loadout.flash = 0; c.loadout.smoke = 0;
      c.loadout.armor = 0;
    }
    startRound();
  }

  function startRound() {
    settled = false;
    state.phase = PHASE.BUY;
    state.phaseTime = ECONOMY.buySeconds;
    state.plantedSite = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.plantActor = null;
    state.roundWinner = null;
    state.targetSite = rng() < 0.5 ? 'A' : 'B';
    world.charge.visible = false;
    // everyone home, healed, magazines full; bought guns and vests persist
    const spawnsA = SPAWNS.attack, spawnsD = SPAWNS.defend;
    let ai = 0, di = 0;
    for (const c of combatants) {
      const spawn = c.team === TEAM.ATTACK ? spawnsA[ai++ % spawnsA.length] : spawnsD[di++ % spawnsD.length];
      c.alive = true;
      c.hp = 100;
      if (c.isPlayer) {
        c.pos.x = spawn.x; c.pos.z = spawn.z;
        c.yaw = spawn.yaw; c.pitch = 0; c.y = 0;
        c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
        respawnLoadout(c.loadout);
      }
    }
    // bots are placed by the resetBot loop below (it also resets their
    // meshes and brains); the player keeps the first attack spawn.
    let bai = 1, bdi = 0;
    for (const bot of roster) {
      const spawn = bot.team === TEAM.ATTACK ? spawnsA[bai++ % spawnsA.length] : spawnsD[bdi++ % spawnsD.length];
      deps.resetBot(bot, spawn);
      respawnLoadout(bot.loadout);
      autoBuyBot(bot, rng);
    }
    state.message = `Round ${state.round} — buy phase. Press B to shop.`;
    banner(`Round ${state.round}`, state.targetSite === 'A' ? 'Sakura Guard to move on a site' : 'Sakura Guard to move on a site', 2.4);
  }

  function endRound(winner, reason) {
    if (state.phase === PHASE.END || state.phase === PHASE.MATCH_END) return;
    const { winPay, lossPay } = settleRound(state, winner, reason, grant);
    for (const c of combatants) {
      if (!c.alive) continue;
      grant(c, c.team === winner ? winPay : lossPay);
    }
    // dead players still get the loss/win team pay in this yard's house rules
    for (const c of combatants) {
      if (c.alive) continue;
      grant(c, c.team === winner ? Math.floor(winPay * 0.7) : lossPay);
    }
    settled = true;
    const attackWon = winner === TEAM.ATTACK;
    const titles = {
      elimination: attackWon ? 'Iron Tide eliminated' : 'Sakura Guard eliminated',
      detonation: 'Bloom Charge detonated',
      defused: 'Charge defused',
      time: 'Time expired — site held',
    };
    banner(
      attackWon ? 'SAKURA GUARD TAKE THE ROUND' : 'IRON TIDE TAKE THE ROUND',
      titles[reason] ?? '',
      3.6,
    );
    sfx.playRoundWin(player.team === winner);
    if (reason === 'detonation') {
      const s = SITES.find((x) => x.id === state.plantedSite);
      if (s) { fx.boom(s.x, 1, s.z, true); sfx.playExplosion(); }
      world.charge.visible = false;
    }
    if (state.score.attack >= ECONOMY.roundsToWin || state.score.defend >= ECONOMY.roundsToWin) {
      state.phase = PHASE.MATCH_END;
      state.winner = state.score.attack > state.score.defend ? TEAM.ATTACK : TEAM.DEFEND;
      banner(
        state.winner === TEAM.ATTACK ? 'SAKURA GUARD WIN THE MATCH' : 'IRON TIDE WIN THE MATCH',
        `Final score ${state.score.attack} — ${state.score.defend}. Click to play again.`,
        999,
      );
    } else {
      state.phase = PHASE.END;
      state.phaseTime = ECONOMY.endSeconds;
    }
  }

  function completePlant(actor) {
    const site = siteAt(actor.pos.x, actor.pos.z);
    if (!site) return;
    state.plantedSite = site.id;
    state.phase = PHASE.PLANTED;
    state.phaseTime = ECONOMY.fuseSeconds;
    state.plantProgress = 0;
    state.plantActor = null;
    world.charge.visible = true;
    world.charge.position.set(actor.pos.x, 0, actor.pos.z);
    grant(actor, ECONOMY.plantReward);
    for (const c of combatants) if (c.team === TEAM.ATTACK && c.alive) grant(c, ECONOMY.plantedTeamBonus);
    banner('BLOOM CHARGE PLANTED', `${site.name} — ${ECONOMY.fuseSeconds} seconds to detonation`, 2.6);
    state.message = actor.isPlayer ? 'Charge planted. Guard it.' : `${actor.callsign} planted. Guard the site.`;
    sfx.playPlantDone();
    beepAt = state.time + 1;
  }

  // One channel tick: returns true while someone is actively channeling.
  function channel(dt) {
    // planting (live phase only)
    if (state.phase === PHASE.LIVE) {
      let actor = null;
      if (deps.playerPlantHeld && player.alive && siteAt(player.pos.x, player.pos.z)) actor = player;
      if (!actor) {
        for (const bot of roster) {
          if (bot.alive && bot.team === TEAM.ATTACK && bot.role === 'plant' && siteAt(bot.pos.x, bot.pos.z)) { actor = bot; break; }
        }
      }
      if (actor) {
        state.plantActor = actor.id;
        state.plantProgress += dt / ECONOMY.plantSeconds;
        state.message = actor.isPlayer ? 'Planting…' : `${actor.callsign} is planting…`;
        if (state.plantProgress >= 1) { completePlant(actor); return true; }
        return true;
      }
      state.plantProgress = Math.max(0, state.plantProgress - dt * 0.7);
      state.plantActor = null;
    }
    // defusing (planted phase only), at the charge itself
    if (state.phase === PHASE.PLANTED) {
      const site = SITES.find((s) => s.id === state.plantedSite);
      let actor = null;
      for (const bot of roster) {
        if (bot.alive && bot.team === TEAM.DEFEND && bot.role === 'defuse'
          && Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < 2.4) { actor = bot; break; }
      }
      if (actor) {
        state.defuseProgress += dt / ECONOMY.defuseSeconds;
        state.message = `${actor.callsign} is defusing!`;
        if (state.defuseProgress >= 1) {
          state.defuseProgress = 0;
          world.charge.visible = false;
          endRound(TEAM.DEFEND, 'defused');
          return true;
        }
        return true;
      }
      state.defuseProgress = Math.max(0, state.defuseProgress - dt * 0.7);
    }
    return false;
  }

  function update(dt) {
    state.time += dt;
    // prune transient state
    state.noiseEvents = state.noiseEvents.filter((n) => state.time - n.at < 1.2);
    state.smokes = state.smokes.filter((s) => state.time < s.until);
    state.killfeed = state.killfeed.filter((k) => state.time < k.until);
    if (state.banner && state.time > state.banner.until && state.phase !== PHASE.MATCH_END) state.banner = null;

    channel(dt);

    switch (state.phase) {
      case PHASE.BUY: {
        state.phaseTime -= dt;
        if (state.phaseTime <= 0) {
          state.phase = PHASE.LIVE;
          state.phaseTime = ECONOMY.roundSeconds;
          state.message = player.team === TEAM.ATTACK
            ? `Plant the Bloom Charge on Site ${state.targetSite} — or eliminate Iron Tide.`
            : 'Defend the sites.';
        }
        break;
      }
      case PHASE.LIVE: {
        state.phaseTime -= dt;
        const aAlive = aliveCount(combatants, TEAM.ATTACK);
        const dAlive = aliveCount(combatants, TEAM.DEFEND);
        if (dAlive === 0) endRound(TEAM.ATTACK, 'elimination');
        else if (aAlive === 0) endRound(TEAM.DEFEND, 'elimination');
        else if (state.phaseTime <= 0) endRound(TEAM.DEFEND, 'time');
        break;
      }
      case PHASE.PLANTED: {
        state.phaseTime -= dt;
        // the charge beeps faster as the fuse burns down
        const interval = state.phaseTime < 5 ? 0.25 : state.phaseTime < 12 ? 0.5 : 1;
        if (state.time >= beepAt) {
          beepAt = state.time + interval;
          sfx.playBeep(state.phaseTime < 5);
          world.coreMat.emissiveIntensity = 3.5;
        } else {
          world.coreMat.emissiveIntensity = Math.max(1.2, world.coreMat.emissiveIntensity - dt * 6);
        }
        const dAlive = aliveCount(combatants, TEAM.DEFEND);
        if (dAlive === 0) endRound(TEAM.ATTACK, 'elimination');
        else if (state.phaseTime <= 0) endRound(TEAM.ATTACK, 'detonation');
        break;
      }
      case PHASE.END: {
        state.phaseTime -= dt;
        if (state.phaseTime <= 0) {
          state.round += 1;
          startRound();
        }
        break;
      }
      default: break;
    }
    void settled;
  }

  return { update, startMatch, startRound, endRound, grant };
}
