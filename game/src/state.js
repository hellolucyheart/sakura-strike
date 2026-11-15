// state.js — the single home for every piece of mutable match state.
//
// Nothing else in the game keeps long-lived state of its own: modules read and
// write the object built here, which keeps the simulation deterministic and
// makes the staged screenshot scenes trivial to set up (they just fill this
// object in and let the normal render path draw it).
//
// Match shape (all original, Counter-Strike-STYLE round structure):
//   Sakura Guard (attack, coral) plant the Bloom Charge on Site A or Site B.
//   Iron Tide (defence, teal) stop them, defuse, or run the clock down.
//   A match is first to 7 rounds. Rounds pay money; money buys guns, armour
//   and grenades in the buy phase that opens every round.

export const TEAM = { ATTACK: 'attack', DEFEND: 'defend' };

export const PHASE = {
  BUY: 'buy',       // frozen, buy menu open, round timer not yet running
  LIVE: 'live',     // round clock running, charge not planted
  PLANTED: 'planted', // charge planted, fuse burning, defuse possible
  END: 'end',       // banner up, scores settled, next round soon
  MATCH_END: 'match_end',
};

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  plantReward: 300,        // to the planter
  plantedTeamBonus: 800,   // whole attack team when the charge goes down
  winElimination: 1400,
  winObjective: 1900,      // detonation for attack, defusal / time for defence
  lossBonus: 1400,
  buySeconds: 12,
  roundSeconds: 100,
  fuseSeconds: 25,
  endSeconds: 5,
  plantSeconds: 3,
  defuseSeconds: 5,
  roundsToWin: 7,
};

export function createState() {
  return {
    phase: PHASE.BUY,
    phaseTime: ECONOMY.buySeconds, // seconds left in the current phase
    round: 1,
    score: { attack: 0, defend: 0 },
    roundWinner: null,      // TEAM.* once the round is decided
    roundReason: '',        // 'elimination' | 'detonation' | 'defused' | 'time'
    targetSite: 'A',        // the site the attack bots push this round
    plantedSite: null,      // 'A' | 'B' once the charge is down
    planterId: null,
    plantProgress: 0,       // 0..1 while someone is planting / defusing
    plantActor: null,       // combatant id doing the planting / defusing
    defuseProgress: 0,
    winner: null,           // match winner once MATCH_END
    // The player is a combatant too; combatants live in bots.js's roster but
    // the player's record is created here so every system treats it the same.
    money: ECONOMY.startMoney,
    noiseEvents: [],        // {x, z, radius, team} gunfire the bots can hear
    smokes: [],             // {x, y, z, radius, until} active smoke clouds
    killfeed: [],           // {text, until} newest first, hud renders it
    banner: null,           // {title, sub, until} centre-screen round banner
    message: '',            // small objective hint under the crosshair
    time: 0,                // simulated seconds since match start
    shotMode: null,         // set from ?shot= for staged screenshots
  };
}

// Whose turn it is to be happy: settle one round into score + money.
// `pay` is a function (combatant, amount) so state.js stays free of roster
// knowledge; round.js supplies it.
export function settleRound(state, winner, reason, pay) {
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const loser = winner === TEAM.ATTACK ? TEAM.DEFEND : TEAM.ATTACK;
  const winPay = reason === 'elimination' ? ECONOMY.winElimination : ECONOMY.winObjective;
  return { winner, loser, winPay, lossPay: ECONOMY.lossBonus };
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
