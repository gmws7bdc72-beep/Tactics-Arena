import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MARK = 'FTA_PVP4_GOAL_KICKOFF_MAXED_LONGGOAL';

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
  if (first < 0) throw new Error(`${label}: expected block not found`);
  const second = text.indexOf(oldText, first + oldText.length);
  if (second >= 0) throw new Error(`${label}: expected one block, found multiple`);
  return text.slice(0, first) + newText + text.slice(first + oldText.length);
}

function patchOnline(file) {
  let text = read(file);

  // 100 OVR + position-appropriate abilities, independent of earlier PVP patches.
  if (!text.includes('const ONLINE_MAX_STATS: PlayerCard["stats"]')) {
    const anchor = 'const ONLINE_TURN_TIME = 25;';
    if (!text.includes(anchor)) throw new Error('OnlineMatch: ONLINE_TURN_TIME anchor not found');
    const helper = `\n\n// ${MARK}\n// Online matches are an even tactics sandbox: every on-pitch player is maxed,\n// while special abilities remain sensible for the player's football role.\nconst ONLINE_MAX_STATS: PlayerCard["stats"] = {\n  attack: 10,\n  defense: 10,\n  passing: 10,\n  speed: 10,\n  movement: 10,\n  shooting: 10,\n  dribbling: 10,\n  tackling: 10,\n  marking: 10,\n  stamina: 10,\n  strength: 10,\n  vision: 10,\n  longPassing: 10,\n  aerial: 10,\n};\n\nfunction onlineAbilityFor(card: PlayerCard): PlayerCard["ability"] {\n  const seed = Math.abs(card.jerseyNumber ?? 0);\n  switch (card.role) {\n    case "goalkeeper":\n      return "goalkeeper";\n    case "defender": {\n      const pool: PlayerCard["ability"][] = ["iron_tackle", "shadow_mark", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n    case "midfielder": {\n      const pool: PlayerCard["ability"][] = ["bullet_pass", "shadow_mark", "ghost_run"];\n      return pool[seed % pool.length];\n    }\n    case "forward": {\n      const pool: PlayerCard["ability"][] = ["ghost_run", "eagle_eye", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n    case "striker": {\n      const pool: PlayerCard["ability"][] = ["eagle_eye", "ghost_run", "powerhouse"];\n      return pool[seed % pool.length];\n    }\n  }\n  return "none";\n}\n`;
    text = replaceOnce(text, anchor, anchor + helper, 'OnlineMatch max-player helpers');
  }

  // Replace the runtime player's real stats/ability with the online sandbox values.
  if (!text.includes('stats: { ...ONLINE_MAX_STATS }')) {
    const patterns = [
      /(\s*)stats:\s*\{\s*\.\.\.card\.stats,\s*movement:\s*legacyStats\.movement\s*\?\?\s*legacyStats\.luck\s*\?\?\s*5,\s*\},\s*ability:\s*card\.ability,/s,
      /(\s*)stats:\s*\{\s*\.\.\.card\.stats\s*\},\s*ability:\s*card\.ability,/s,
    ];
    let changed = false;
    for (const pattern of patterns) {
      const before = text;
      text = text.replace(pattern, (...args) => {
        const indent = args[1];
        return `${indent}stats: { ...ONLINE_MAX_STATS },\n${indent}ability: onlineAbilityFor(card),`;
      });
      if (text !== before) { changed = true; break; }
    }
    if (!changed) throw new Error('OnlineMatch: makeSimPlayer stats/ability block not found');
  }

  // The legacy movement fallback is no longer needed once online stats are maxed.
  text = text.replace(
    /\n\s*const legacyStats = card\.stats as PlayerCard\["stats"\] & \{ luck\?: number \};/,
    '',
  );

  // Clean restart helper. This is intentionally independent of PVP2/PVP3.
  if (!text.includes('function resetOnlineKickoff(')) {
    const anchor = 'export default function OnlineMatch(';
    if (!text.includes(anchor)) throw new Error('OnlineMatch: component anchor not found');
    const helper = `function resetOnlineKickoff(\n  players: SimPlayer[],\n  concedingTeam: "player" | "ai",\n): { players: SimPlayer[]; ball: SimBall } {\n  const resetPlayers = players.map((player) => ({\n    ...player,\n    position: { ...player.startPosition },\n    velocity: { x: 0, y: 0 },\n    state: "IDLE" as SimPlayer["state"],\n    command: null,\n    commandExecuted: false,\n    stateTimer: 0,\n    recoveryTimer: 0,\n  }));\n\n  const rolePriority: Record<SimPlayer["role"], number> = {\n    striker: 0,\n    forward: 1,\n    midfielder: 2,\n    defender: 3,\n    goalkeeper: 4,\n  };\n\n  const candidates = resetPlayers\n    .filter((player) => player.teamId === concedingTeam)\n    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || a.jerseyNumber - b.jerseyNumber);\n  const kicker = candidates[0];\n\n  if (!kicker) {\n    return {\n      players: resetPlayers,\n      ball: {\n        position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },\n        velocity: { x: 0, y: 0 },\n        ownerId: null,\n        height: 0,\n        passTarget: undefined,\n        passStyle: undefined,\n        passStart: undefined,\n        curveMotion: undefined,\n      },\n    };\n  }\n\n  // The conceding team starts the next turn with an actual center-spot kickoff.\n  kicker.position = { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };\n  kicker.velocity = { x: 0, y: 0 };\n\n  return {\n    players: resetPlayers,\n    ball: {\n      position: { ...kicker.position },\n      velocity: { x: 0, y: 0 },\n      ownerId: kicker.id,\n      height: 0,\n      passTarget: undefined,\n      passStyle: undefined,\n      passStart: undefined,\n      curveMotion: undefined,\n    },\n  };\n}\n\n`;
    text = replaceOnce(text, anchor, helper + anchor, 'OnlineMatch kickoff helper');
  }

  // Initial online kickoff should also be at midfield rather than on the goalkeeper.
  if (!text.includes('FTA_PVP4_INITIAL_KICKOFF')) {
    const oldInit = /\s*const kickoffOwner = p1Players\.find\(p => p\.role === "goalkeeper"\) \?\? p1Players\[0\];\s*\n\s*const ball: SimBall = \{\s*\n\s*position: \{ \.\.\.kickoffOwner\.position \},\s*\n\s*velocity: \{ x: 0, y: 0 \},\s*\n\s*ownerId: kickoffOwner\.id,\s*\n\s*height: 0,\s*\n\s*\};/s;
    if (oldInit.test(text)) {
      text = text.replace(oldInit, `\n  // FTA_PVP4_INITIAL_KICKOFF\n  const kickoffOwner =\n    p1Players.find(p => p.role === "striker") ??\n    p1Players.find(p => p.role === "forward") ??\n    p1Players.find(p => p.role === "midfielder") ??\n    p1Players[0];\n  if (kickoffOwner) {\n    kickoffOwner.position = { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 };\n  }\n  const ball: SimBall = {\n    position: kickoffOwner\n      ? { ...kickoffOwner.position }\n      : { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },\n    velocity: { x: 0, y: 0 },\n    ownerId: kickoffOwner?.id ?? null,\n    height: 0,\n  };`);
    }
  }

  // Add the one-shot restart latch.
  if (!text.includes('pendingKickoffTeamRef')) {
    const anchor = '  const animRef = useRef<number | null>(null);';
    if (!text.includes(anchor)) throw new Error('OnlineMatch: animRef anchor not found');
    text = replaceOnce(
      text,
      anchor,
      `${anchor}\n\n  // ${MARK}\n  // A goal is consumed once, then the NEXT server turn starts from a clean kickoff.\n  const pendingKickoffTeamRef = useRef<"player" | "ai" | null>(null);`,
      'OnlineMatch kickoff latch',
    );
  }

  // Replace finishSimulation's state handoff. Do NOT keep restarting from a ball in the net.
  const finishStart = text.indexOf('  const finishSimulation = useCallback(');
  const playbackStart = text.indexOf('  const playbackFrames = useCallback(', finishStart);
  if (finishStart < 0 || playbackStart < 0) throw new Error('OnlineMatch: finishSimulation block not found');
  let finishBlock = text.slice(finishStart, playbackStart);
  if (!finishBlock.includes('pendingKickoffTeamRef.current = concedingTeam;')) {
    const bodyStart = finishBlock.indexOf('{', finishBlock.indexOf('=>'));
    const emitIndex = finishBlock.indexOf('    getSocket().emit("turn:ready", { goalsDelta });');
    if (bodyStart < 0 || emitIndex < 0) throw new Error('OnlineMatch: finishSimulation body/emit anchor not found');

    // Preserve the player-position mapping at top, but replace everything after it through state handoff.
    const newPlayersEndNeedle = '    });';
    const newPlayersEnd = finishBlock.indexOf(newPlayersEndNeedle, bodyStart);
    if (newPlayersEnd < 0) throw new Error('OnlineMatch: newPlayers mapping end not found');
    const prefixEnd = newPlayersEnd + newPlayersEndNeedle.length;
    const prefix = finishBlock.slice(0, prefixEnd);
    const suffix = finishBlock.slice(emitIndex);
    const handoff = `\n\n    const liveBall: SimBall = {\n      position: { ...lastFrame.ball.position },\n      velocity: { ...lastFrame.ball.velocity },\n      ownerId: lastFrame.ball.ownerId,\n      height: 0,\n      passTarget: undefined,\n      passStyle: undefined,\n      passStart: undefined,\n      curveMotion: undefined,\n    };\n\n    const concedingTeam: "player" | "ai" | null =\n      goalsDelta.p1 > 0\n        ? "ai"\n        : goalsDelta.p2 > 0\n          ? "player"\n          : null;\n\n    // Critical fix: a goal marks a pending restart. The net ball is NEVER\n    // allowed to become the starting ball for the next planning turn.\n    pendingKickoffTeamRef.current = concedingTeam;\n\n    setPlayers(newPlayers);\n    playersRef.current = newPlayers;\n    setBall(liveBall);\n    ballRef.current = liveBall;\n    setCurrentFrame(null);\n\n`;
    finishBlock = prefix + handoff + suffix;
    text = text.slice(0, finishStart) + finishBlock + text.slice(playbackStart);
  }

  // When the server opens the next turn, consume the pending goal and hard reset.
  if (!text.includes('const kickoffTeam = pendingKickoffTeamRef.current;')) {
    const doneNeedle = '    }) => {\n      setScore(score);\n      setTurn(nextTurn);\n      setPhase("planning");';
    if (!text.includes(doneNeedle)) throw new Error('OnlineMatch: turn:done anchor not found');
    const doneReplacement = `    }) => {\n      const kickoffTeam = pendingKickoffTeamRef.current;\n      if (kickoffTeam) {\n        const restart = resetOnlineKickoff(playersRef.current, kickoffTeam);\n        setPlayers(restart.players);\n        playersRef.current = restart.players;\n        setBall(restart.ball);\n        ballRef.current = restart.ball;\n        setCurrentFrame(null);\n        pendingKickoffTeamRef.current = null;\n\n        // Nothing from the scoring turn survives into the kickoff.\n        const clearedCommands = new Map<string, Command>();\n        setPendingCommands(clearedCommands);\n        pendingCommandsRef.current = clearedCommands;\n        setOpponentSubmitted(false);\n        clearSelection();\n      }\n\n      setScore(score);\n      setTurn(nextTurn);\n      setPhase("planning");`;
    text = replaceOnce(text, doneNeedle, doneReplacement, 'OnlineMatch turn:done restart');
  }

  write(file, text);
  console.log('Patched OnlineMatch.tsx');
}

function patchSimulation(file) {
  let text = read(file);
  if (!text.includes('FTA_LONG_BALL_GOAL_DEPTH_PVP4')) {
    const start = text.indexOf('function executePass(');
    if (start < 0) throw new Error('simulation: executePass not found');
    const braceStart = text.indexOf('{', start);
    let depth = 0;
    let end = -1;
    for (let i = braceStart; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end < 0) throw new Error('simulation: executePass closing brace not found');
    let fn = text.slice(start, end);

    if (!fn.includes('requestedGoalDepth')) {
      const match = fn.match(/let\s+targetPos\s*=\s*cmd\.targetPosition\s*\?\?\s*\{[\s\S]*?\};/);
      if (!match) throw new Error('simulation: targetPos declaration not found');
      const declaration = match[0];
      fn = fn.replace(declaration, `${declaration}\n\n  // FTA_LONG_BALL_GOAL_DEPTH_PVP4\n  // A deliberate long-ball target inside goal depth stays inside the goal.\n  const requestedGoalDepth =\n    isLongBall &&\n    (targetPos.x < 0 || targetPos.x > PITCH_WIDTH) &&\n    targetPos.y >= GOAL_TOP_Y &&\n    targetPos.y <= GOAL_BOTTOM_Y;`);
    }

    fn = fn.replace(
      /if\s*\(\s*isLongBall\s*&&\s*!cmd\.coordinated\s*\)/,
      'if (isLongBall && !cmd.coordinated && !requestedGoalDepth)',
    );
    if (!fn.includes('!requestedGoalDepth')) throw new Error('simulation: long-ball accuracy condition not found');

    text = text.slice(0, start) + fn + text.slice(end);
    write(file, text);
    console.log('Patched simulation.ts');
  } else {
    console.log('simulation.ts already has PVP4 long-ball goal-depth fix');
  }
}

function patchPitch(file) {
  let text = read(file);
  if (text.includes('insideGoalDepth')) {
    console.log('PitchCanvas already allows goal-depth pass/long-ball targets');
    return;
  }

  // Need GOAL_DEPTH + BALL_RADIUS imports for the click target clamp.
  // Existing files already import both in modern FTA; if not, add them conservatively.
  const selectedNeedle = '      if (!selPlayer) return;';
  const selectedIndex = text.lastIndexOf(selectedNeedle);
  if (selectedIndex < 0) throw new Error('PitchCanvas: selected player click anchor not found');
  const insertionPoint = selectedIndex + selectedNeedle.length;
  const addition = `\n      // FTA_PASS_INTO_NET_PVP4\n      const insideGoalDepth =\n        (pos.x < 0 || pos.x > PITCH_WIDTH) &&\n        pos.y >= GOAL_TOP_Y &&\n        pos.y <= GOAL_TOP_Y + GOAL_WIDTH;\n\n      if (passTargetMode && insideGoalDepth) {\n        onTileClick(\n          {\n            x: clamp(pos.x, -GOAL_DEPTH + BALL_RADIUS, PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS),\n            y: clamp(pos.y, GOAL_TOP_Y + BALL_RADIUS, GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS),\n          },\n          false,\n        );\n        return;\n      }`;
  text = text.slice(0, insertionPoint) + addition + text.slice(insertionPoint);
  write(file, text);
  console.log('Patched PitchCanvas.tsx');
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runTypecheck(project) {
  const result = spawnSync('npm', ['run', 'typecheck'], { cwd: project, stdio: 'inherit', shell: false });
  return result.status === 0;
}

function main() {
  const project = findProject();
  console.log('FTA PVP4 - cumulative online goal/kickoff + max players + long-ball goals');
  console.log(`FTA project: ${project}`);

  const targets = [
    path.join(project, 'src/pages/OnlineMatch.tsx'),
    path.join(project, 'src/engine/simulation.ts'),
    path.join(project, 'src/components/PitchCanvas.tsx'),
  ];
  for (const f of targets) if (!exists(f)) throw new Error(`Missing required file: ${f}`);

  const backup = path.join(project, 'backups', `fta-pvp4-${stamp()}`);
  fs.mkdirSync(backup, { recursive: true });
  for (const src of targets) {
    const dst = path.join(backup, path.relative(project, src));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  try {
    patchOnline(targets[0]);
    patchSimulation(targets[1]);
    patchPitch(targets[2]);
    console.log('Running TypeScript checks...');
    if (!runTypecheck(project)) throw new Error('Typecheck failed.');
  } catch (error) {
    console.error('Patch/check failed; restoring target files...');
    for (const src of targets) {
      fs.copyFileSync(path.join(backup, path.relative(project, src)), src);
    }
    throw error;
  }

  console.log('FTA PVP4 applied successfully.');
  console.log(`Backup: ${backup}`);
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
