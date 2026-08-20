import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MARK = 'FTA_PVP_GOAL_KICKOFF_V3';

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

  for (const candidate of candidates) {
    if (exists(path.join(candidate, 'src/pages/OnlineMatch.tsx'))) {
      return fs.realpathSync(candidate);
    }
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

function patchOnlineMatch(file) {
  let text = read(file);

  if (text.includes(MARK)) {
    console.log('OnlineMatch goal-kickoff fix already applied.');
    return false;
  }

  if (!text.includes('FTA_ONLINE_KICKOFF_100_LONGGOAL_V2')) {
    throw new Error('PVP2 online patch is not present. Apply FTA-PVP2 first, then rerun this patch.');
  }
  if (!text.includes('function resetOnlineKickoff(')) {
    throw new Error('OnlineMatch: resetOnlineKickoff helper not found.');
  }

  // 1) Remember the team that conceded. The restart is deliberately NOT
  // performed while the goal frame is still being acknowledged.
  const animAnchor = `  const animRef = useRef<number | null>(null);\n\n  const clearSelection = useCallback(() => {`;
  const animReplacement = `  const animRef = useRef<number | null>(null);\n\n  // ${MARK}\n  // A goal is a hard turn boundary. Remember who conceded during playback,\n  // then rebuild a clean kickoff only when the server opens the NEXT turn.\n  const pendingKickoffTeamRef = useRef<\"player\" | \"ai\" | null>(null);\n\n  const clearSelection = useCallback(() => {`;
  text = replaceOnce(text, animAnchor, animReplacement, 'OnlineMatch kickoff latch');

  // 2) Make the restart kicker occupy the actual center spot.
  const oldKicker = `  kicker.position = {\n    x: PITCH_WIDTH / 2 + (concedingTeam === \"player\" ? -1 : 1),\n    y: PITCH_HEIGHT / 2,\n  };`;
  const newKicker = `  kicker.position = {\n    x: PITCH_WIDTH / 2,\n    y: PITCH_HEIGHT / 2,\n  };`;
  if (text.includes(oldKicker)) {
    text = replaceOnce(text, oldKicker, newKicker, 'OnlineMatch center kickoff');
  }

  // 3) At the END of the scoring simulation, store only the pending kickoff.
  // Keep the actual scoring frame/ball until turn:done arrives.
  const oldFinish = `    const concedingTeam: \"player\" | \"ai\" | null =\n      goalsDelta.p1 > goalsDelta.p2\n        ? \"ai\"\n        : goalsDelta.p2 > goalsDelta.p1\n          ? \"player\"\n          : null;\n    const restart = concedingTeam\n      ? resetOnlineKickoff(newPlayers, concedingTeam)\n      : null;\n    const nextPlayers = restart?.players ?? newPlayers;\n    const newBall = restart?.ball ?? liveBall;\n\n    setPlayers(nextPlayers);\n    playersRef.current = nextPlayers;\n    setBall(newBall);\n    ballRef.current = newBall;\n    setCurrentFrame(null);`;

  const newFinish = `    const concedingTeam: \"player\" | \"ai\" | null =\n      goalsDelta.p1 > 0\n        ? \"ai\"\n        : goalsDelta.p2 > 0\n          ? \"player\"\n          : null;\n\n    // Do not create the kickoff during the scoring turn. turn:done is the\n    // single authoritative boundary between the goal and the next turn.\n    pendingKickoffTeamRef.current = concedingTeam;\n\n    setPlayers(newPlayers);\n    playersRef.current = newPlayers;\n    setBall(liveBall);\n    ballRef.current = liveBall;\n    setCurrentFrame(null);`;

  if (text.includes(oldFinish)) {
    text = replaceOnce(text, oldFinish, newFinish, 'OnlineMatch finishSimulation restart');
  } else {
    // Handle a lightly reformatted PVP2 block without depending on whitespace.
    const startNeedle = '    const concedingTeam: "player" | "ai" | null =';
    const start = text.indexOf(startNeedle);
    const endNeedle = '    setCurrentFrame(null);';
    const endStart = start >= 0 ? text.indexOf(endNeedle, start) : -1;
    if (start < 0 || endStart < 0) {
      throw new Error('OnlineMatch: PVP2 finishSimulation restart block not found.');
    }
    const end = endStart + endNeedle.length;
    text = text.slice(0, start) + newFinish + text.slice(end);
  }

  // 4) The server opening the next turn is where the kickoff actually happens.
  const doneAnchor = `    }) => {\n      setScore(score);\n      setTurn(nextTurn);\n      setPhase(\"planning\");`;
  const doneReplacement = `    }) => {\n      const kickoffTeam = pendingKickoffTeamRef.current;\n      if (kickoffTeam) {\n        const restart = resetOnlineKickoff(playersRef.current, kickoffTeam);\n\n        setPlayers(restart.players);\n        playersRef.current = restart.players;\n        setBall(restart.ball);\n        ballRef.current = restart.ball;\n        setCurrentFrame(null);\n        pendingKickoffTeamRef.current = null;\n\n        // No commands or selections from the scoring turn may survive into\n        // the kickoff. This also removes every old ball-flight physics field.\n        setPendingCommands(new Map());\n        pendingCommandsRef.current = new Map();\n        setOpponentSubmitted(false);\n        clearSelection();\n      }\n\n      setScore(score);\n      setTurn(nextTurn);\n      setPhase(\"planning\");`;
  text = replaceOnce(text, doneAnchor, doneReplacement, 'OnlineMatch turn:done kickoff');

  write(file, text);
  console.log('Patched OnlineMatch.tsx: goal -> next-turn kickoff latch');
  return true;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runTypecheck(project) {
  const result = spawnSync('npm', ['run', 'typecheck'], {
    cwd: project,
    stdio: 'inherit',
    shell: false,
  });
  return result.status === 0;
}

function main() {
  const project = findProject();
  const target = path.join(project, 'src/pages/OnlineMatch.tsx');
  if (!exists(target)) throw new Error(`Missing ${target}`);

  console.log(`FTA project: ${project}`);

  const backupDir = path.join(project, 'backups', `fta-pvp3-${stamp()}`);
  const backupFile = path.join(backupDir, 'src/pages/OnlineMatch.tsx');
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  fs.copyFileSync(target, backupFile);

  let changed = false;
  try {
    changed = patchOnlineMatch(target);
    if (!changed) {
      console.log('Nothing to do.');
      return;
    }

    console.log('Running TypeScript checks...');
    if (!runTypecheck(project)) {
      throw new Error('Typecheck failed.');
    }
  } catch (error) {
    console.error('Patch/check failed; restoring OnlineMatch.tsx...');
    fs.copyFileSync(backupFile, target);
    throw error;
  }

  console.log('FTA PVP3 applied successfully.');
  console.log(`Backup: ${backupDir}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
