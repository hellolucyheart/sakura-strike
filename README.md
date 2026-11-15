# sakura-strike

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/hellolucyheart/sakura-strike/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/hellolucyheart/sakura-strike/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Sakura Strike is an original round-based tactical FPS for the browser: lead the Sakura Guard against the Iron Tide bot squad in Harbor Yard, a three-lane container port with two bomb sites, a plantable Bloom Charge, a full buy economy (five guns, armour, frag/flash/smoke grenades), and gunplay where standing still, crouching and aiming for the head beat spraying on the run. Single-player against nine AI bots that navigate a waypoint graph, hold posts, rotate on gunfire, plant and defuse. First to 7 rounds wins the match.

## Run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome and click Play. (Any static file server works — the game is plain ES modules with three.js 0.187.0 vendored under game/vendor/, no build step and no network requests.) To hand the entry in the way the grader does: `MAKEFUN_OUTPUT_DIR=out node main.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=68wvraae&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
