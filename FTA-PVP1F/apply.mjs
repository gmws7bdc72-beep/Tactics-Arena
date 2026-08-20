import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MARK = 'FTA_ONLINE_KICKOFF_100_LONGGOAL_V1';

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s); }

function findProject() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'artifacts/fta-game'),
    exists(path.join(cwd, 'src/pages/OnlineMatch.tsx')) ? cwd : null,
    path.join(os.homedir(), 'workspace/artifacts/fta-game'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (exists(path.join(c, 'src/pages/OnlineMatch.tsx'))) return fs.realpathSync(c);
  }
  throw new Error('Could not find artifacts/fta-game. Run this from ~/workspace.');
}

function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: expected 1 exact match, found 0`);
  const second = text.indexOf(oldText, first + oldText.length);
  if (second >= 0) throw new Error(`${label}: expected 1 exact match, found more than 1`);
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function patchOnline(file) {
  let text = read(file);
  if (text.includes(MARK)) {
    console.log('OnlineMatch already patched');
    return;
  }

  const anchor = 'const ONLINE_TURN_TIME = 25;';
  if (!text.includes(anchor)) throw new Error('OnlineMatch: ONLINE_TURN_TIME anchor not found');

  const helper = `\n\n// FTA_ONLINE_KICKOFF_100_LONGGOAL_V1\n// Online PvP is a pure tactics sandbox: every on-pitch player uses maxed 10/10\n// attributes (100 OVR on the management scale). Abilities remain role-correct.\nconst ONLINE_MAX_STATS: PlayerCard["stats"] = {\n  attack: 10,\n  defense: 10,\n  passing: 10,\n  speed: 10,\n  movement: 10,\n  shooting: 10,\n  dribbling: 10,\n  tackling: 10,\n  marking: 10,\n  stamina: 10,\n  strength: 10,\n  vision: 10,\n  longPassing: 10,\n  aerial: 10,\n};\n\nfunction onlineAbilityFor(card: PlayerCard): PlayerCard["ability"] {\n  const seed = Math.abs(card.jerseyNumber ?? 0);\n  switch (card.role) {\n    case "goalkeeper":\n      return "goalkeeper";\n    case "defender": {\n      const pool: PlayerCard["ability"][] = ["iron_tackle", "shadow_mark", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n    case "midfielder": {\n      const pool: PlayerCard["ability"][] = ["bullet_pass", "shadow_mark", "ghost_run"];\n      return pool[seed % pool.length];\n    }\n    case "forward": {\n      const pool: PlayerCard["ability"][] = ["ghost_run", "eagle_eye", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n    case "striker": {\n      const pool: PlayerCard["ability"][] = ["eagle_eye", "ghost_run", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n  }\n}\n`;
  text = replaceOnce(text, anchor, anchor + helper, 'OnlineMatch helper');

  let n = 0;
  const pattern1 = /(\s*)stats:\s*\{\s*\.\.\.card\.stats,\s*movement:\s*legacyStats\.movement\s*\?\?\s*legacyStats\.luck\s*\?\?\s*5,\s*\},\s*ability:\s*card\.ability,/s;
  text = text.replace(pattern1, (...args) => {
    n += 1;
    const indent = args[1];
    return `${indent}stats: { ...ONLINE_MAX_STATS },\n${indent}ability: onlineAbilityFor(card),`;
  });
  if (n === 0) {
    const pattern2 = /(\s*)stats:\s*\{\s*\.\.\.card\.stats\s*\},\s*ability:\s*card\.ability,/s;
    text = text.replace(pattern2, (...args) => {
      n += 1;
      const indent = args[1];
      return `${indent}stats: { ...ONLINE_MAX_STATS },\n${indent}ability: onlineAbilityFor(card),`;
    });
  }
  if (n !== 1) throw new Error('OnlineMatch: could not replace makeSimPlayer stats/ability block');

  const componentAnchor = 'export default function OnlineMatch(';
  if (!text.includes(componentAnchor)) throw new Error('OnlineMatch: component anchor not found');
  const kickoffHelper = `function resetOnlineKickoff(\n  players: SimPlayer[],\n  concedingTeam: "player" | "ai",\n): { players: SimPlayer[]; ball: SimBall } {\n  const resetPlayers = players.map((player) => ({\n    ...player,\n    position: { ...player.startPosition },\n    velocity: { x: 0, y: 0 },\n    state: "IDLE" as SimPlayer["state"],\n    command: null,\n    commandExecuted: false,\n    stateTimer: 0,\n    recoveryTimer: 0,\n    curveMotion: undefined,\n  }));\n\n  const rolePriority: Record<SimPlayer["role"], number> = {\n    striker: 0,\n    forward: 1,\n    midfielder: 2,\n    defender: 3,\n    goalkeeper: 4,\n  };\n  const candidates = resetPlayers\n    .filter((player) => player.teamId === concedingTeam)\n    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || a.jerseyNumber - b.jerseyNumber);\n  const kicker = candidates[0];\n\n  if (!kicker) {\n    return {\n      players: resetPlayers,\n      ball: {\n        position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },\n        velocity: { x: 0, y: 0 },\n        ownerId: null,\n        height: 0,\n      },\n    };\n  }\n\n  kicker.position = {\n    x: PITCH_WIDTH / 2 + (concedingTeam === "player" ? -1 : 1),\n    y: PITCH_HEIGHT / 2,\n  };\n\n  return {\n    players: resetPlayers,\n    ball: {\n      position: { ...kicker.position },\n      velocity: { x: 0, y: 0 },\n      ownerId: kicker.id,\n      height: 0,\n      passTarget: undefined,\n      passStyle: undefined,\n      passStart: undefined,\n      curveMotion: undefined,\n    },\n  };\n}\n\n`;
  text = replaceOnce(text, componentAnchor, kickoffHelper + componentAnchor, 'OnlineMatch kickoff helper');

  const statePattern = /\s*const newBall = \{ position: \{ \.\.\.lastFrame\.ball\.position \}, velocity: \{ \.\.\.lastFrame\.ball\.velocity \}, ownerId: lastFrame\.ball\.ownerId, height: 0, passStyle: undefined, passStart: undefined \};\s*\n\s*setPlayers\(newPlayers\);\s*\n\s*playersRef\.current = newPlayers;\s*\n\s*setBall\(newBall\);\s*\n\s*ballRef\.current = newBall;/s;
  const replacement = `\n    const liveBall: SimBall = {\n      position: { ...lastFrame.ball.position },\n      velocity: { ...lastFrame.ball.velocity },\n      ownerId: lastFrame.ball.ownerId,\n      height: 0,\n      passStyle: undefined,\n      passStart: undefined,\n      passTarget: undefined,\n      curveMotion: undefined,\n    };\n    const concedingTeam: "player" | "ai" | null =\n      goalsDelta.p1 > goalsDelta.p2\n        ? "ai"\n        : goalsDelta.p2 > goalsDelta.p1\n          ? "player"\n          : null;\n    const restart = concedingTeam\n      ? resetOnlineKickoff(newPlayers, concedingTeam)\n      : null;\n    const nextPlayers = restart?.players ?? newPlayers;\n    const newBall = restart?.ball ?? liveBall;\n\n    setPlayers(nextPlayers);\n    playersRef.current = nextPlayers;\n    setBall(newBall);\n    ballRef.current = newBall;\n    setCurrentFrame(null);`;

  let before = text;
  text = text.replace(statePattern, replacement);
  if (text === before) {
    const fallback = /\s*const newBall = \{[\s\S]*?lastFrame\.ball[\s\S]*?\};\s*\n\s*setPlayers\(newPlayers\);\s*\n\s*playersRef\.current = newPlayers;\s*\n\s*setBall\(newBall\);\s*\n\s*ballRef\.current = newBall;/;
    text = text.replace(fallback, replacement);
  }
  if (text === before) throw new Error('OnlineMatch: could not patch finishSimulation state handoff');

  write(file, text);
  console.log('Patched OnlineMatch.tsx');
}

function patchSimulation(file) {
  let text = read(file);
  if (text.includes('FTA_LONG_BALL_GOAL_DEPTH_V1')) {
    console.log('simulation already patched');
    return;
  }

  const targetAnchor = `  let targetPos = cmd.targetPosition ?? {\n    x: PITCH_WIDTH / 2,\n    y: PITCH_HEIGHT / 2,\n  };\n`;
  if (!text.includes(targetAnchor)) throw new Error('simulation: executePass target anchor not found');
  const targetExtra = targetAnchor + `\n  // FTA_LONG_BALL_GOAL_DEPTH_V1\n  // A long-ball attempt aimed into the net must stay a goal-depth attempt.\n  const requestedTargetPos = { ...targetPos };\n  const requestedGoalDepth =\n    isLongBall &&\n    (requestedTargetPos.x < 0 || requestedTargetPos.x > PITCH_WIDTH) &&\n    requestedTargetPos.y >= GOAL_TOP_Y &&\n    requestedTargetPos.y <= GOAL_BOTTOM_Y;\n`;
  text = replaceOnce(text, targetAnchor, targetExtra, 'simulation target');

  const speedAnchor = `\n  let passSpd = PASS_SPEED;\n`;
  if (!text.includes(speedAnchor)) throw new Error('simulation: pass speed anchor not found');
  const restore = `\n  if (requestedGoalDepth) {\n    targetPos = {\n      ...targetPos,\n      x: requestedTargetPos.x,\n    };\n  }\n\n  let passSpd = PASS_SPEED;\n`;
  text = replaceOnce(text, speedAnchor, restore, 'simulation pass speed');
  write(file, text);
  console.log('Patched simulation.ts');
}

function patchPitch(file) {
  let text = read(file);
  if (text.includes('FTA_PASS_INTO_NET_V2') || text.includes('insideGoalDepth')) {
    console.log('PitchCanvas already supports goal-depth pass targeting');
    return;
  }

  const anchor = `      if (!selPlayer) return;\n`;
  if (!text.includes(anchor)) throw new Error('PitchCanvas: selected player anchor not found');
  const addition = anchor + `      // FTA_PASS_INTO_NET_V2\n      const insideGoalDepth =\n        (pos.x < 0 || pos.x > PITCH_WIDTH) &&\n        pos.y >= GOAL_TOP_Y &&\n        pos.y <= GOAL_TOP_Y + GOAL_WIDTH;\n\n      if (passTargetMode && insideGoalDepth) {\n        onTileClick(\n          {\n            x: clamp(pos.x, -GOAL_DEPTH + BALL_RADIUS, PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS),\n            y: clamp(pos.y, GOAL_TOP_Y + BALL_RADIUS, GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS),\n          },\n          false,\n        );\n        return;\n      }\n`;
  text = replaceOnce(text, anchor, addition, 'PitchCanvas');
  write(file, text);
  console.log('Patched PitchCanvas.tsx');
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function main() {
  const project = findProject();
  console.log(`FTA project: ${project}`);
  const targets = [
    path.join(project, 'src/pages/OnlineMatch.tsx'),
    path.join(project, 'src/engine/simulation.ts'),
    path.join(project, 'src/components/PitchCanvas.tsx'),
  ];
  const backup = path.join(project, 'backups', `fta-pvp1f-${stamp()}`);
  fs.mkdirSync(backup, { recursive: true });

  for (const src of targets) {
    if (!exists(src)) throw new Error(`Missing required file: ${src}`);
    const rel = path.relative(project, src);
    const dst = path.join(backup, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  try {
    patchOnline(targets[0]);
    patchSimulation(targets[1]);
    patchPitch(targets[2]);
  } catch (err) {
    console.error('Patch failed; restoring target files...');
    for (const src of targets) {
      const rel = path.relative(project, src);
      fs.copyFileSync(path.join(backup, rel), src);
    }
    throw err;
  }
  console.log(`Backup: ${backup}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
