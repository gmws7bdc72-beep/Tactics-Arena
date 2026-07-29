
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const game = path.join(root, "artifacts/fta-game");
const files = {
  ai: path.join(game, "src/engine/ai.ts"),
  sim: path.join(game, "src/engine/simulation.ts"),
  types: path.join(game, "src/engine/types.ts"),
  match: path.join(game, "src/pages/Match.tsx"),
  online: path.join(game, "src/pages/OnlineMatch.tsx"),
  pitch: path.join(game, "src/components/PitchCanvas.tsx"),
  pad: path.join(game, "src/components/MechanicPad.tsx"),
};
const replacementPad = path.resolve(new URL("./MechanicPad.tsx", import.meta.url).pathname);

function fail(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) fail(`missing ${name}: ${file}`);
}

function replaceOnce(src, find, repl, label) {
  const count = src.split(find).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return src.replace(find, repl);
}
function insertBeforeOnce(src, anchor, content, label) {
  return replaceOnce(src, anchor, content + anchor, label);
}
function write(file, src) { fs.writeFileSync(file, src); }

try {
  let types = fs.readFileSync(files.types, "utf8");
  if (!types.includes('DIVING = "DIVING"')) {
    types = replaceOnce(
      types,
      '  RECOVERING = "RECOVERING",',
      '  RECOVERING = "RECOVERING",\n  DIVING = "DIVING",',
      "add diving player state",
    );
  }
  if (!types.includes('DIVE = "DIVE"')) {
    types = replaceOnce(
      types,
      '  SHOOT = "SHOOT",',
      '  SHOOT = "SHOOT",\n  DIVE = "DIVE",',
      "add dive command",
    );
  }
  write(files.types, types);

  let ai = fs.readFileSync(files.ai, "utf8");

  // Remove stale progression blocks left by earlier failed installers.
  ai = ai.replace(
    new RegExp("\n  // FTA_FORWARD_SPACE_PROGRESS_V\\d[\\s\\S]*?\n  return commands;\n}\n// ─── TACTIC BUFFS \\+ LONG BALLS"),
    "\n  return commands;\n}\n// ─── TACTIC BUFFS + LONG BALLS",
  );

  const blockStart = ai.indexOf("function zonalBlockTile(");
  const blockEnd = ai.indexOf("\nfunction shouldPressBall(", blockStart);
  if (blockStart < 0 || blockEnd < 0) throw new Error("could not locate zonalBlockTile");

  const newBlock = `function aiClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function zonalBlockTile(
  player: SimPlayer,
  playerIndex: number,
  ballTile: TilePos,
  tactic: TeamTactic,
): TilePos {
  const centerRow = Math.floor(GRID_ROWS / 2);
  const baseCol = blockColForRole(player, tactic);

  // The block breathes with the ball instead of sitting on fixed coordinates.
  const ballProgress = aiClamp((GRID_COLS - 1 - ballTile.col) / Math.max(1, GRID_COLS - 1), 0, 1);
  const danger = aiClamp((ballTile.col - Math.floor(GRID_COLS * 0.45)) / Math.max(1, GRID_COLS * 0.5), 0, 1);
  const lateralShift = Math.round((ballTile.row - centerRow) * (
    tactic.defensiveShape === "wide" || tactic.pressTrigger === "wide_trap" ? 0.72 : 0.48
  ));

  let lineStep = 0;
  if (tactic.blockHeight === "high") lineStep = Math.round(3 * ballProgress - 1 * danger);
  else if (tactic.blockHeight === "mid") lineStep = Math.round(2 * ballProgress - 1.5 * danger);
  else lineStep = Math.round(1.25 * ballProgress - 2 * danger);

  let col = aiClamp(baseCol - lineStep, 1, GRID_COLS - 2);
  const compactness =
    tactic.defensiveShape === "protect_box" ? 0.60 :
    tactic.defensiveShape === "compact" ? 0.76 :
    tactic.defensiveShape === "wide" ? 1.22 : 1.0;

  const roleIndex = player.role === "defender"
    ? aiPlayersRoleIndexFallback(playerIndex, 4)
    : player.role === "midfielder"
      ? aiPlayersRoleIndexFallback(playerIndex, 3)
      : aiPlayersRoleIndexFallback(playerIndex, 2);

  const roleSpread = player.role === "defender"
    ? [-2.5, -0.8, 0.8, 2.5]
    : player.role === "midfielder"
      ? [-2, 0, 2]
      : [-1.2, 1.2];

  const spread = roleSpread[roleIndex % roleSpread.length] ?? 0;
  let row = Math.round(centerRow + spread * compactness + lateralShift);

  // Expand away from the ball in harmless zones, compress sharply near goal.
  if (danger > 0.55) {
    row = Math.round((row * (1 - danger * 0.35)) + (ballTile.row * danger * 0.35));
  } else if (ballTile.col < Math.floor(GRID_COLS * 0.45)) {
    row = Math.round(centerRow + spread * Math.min(1.45, compactness + 0.2) + lateralShift);
  }

  return clampAITile({ col, row: aiClamp(row, 0, GRID_ROWS - 1) });
}

function aiPlayersRoleIndexFallback(index: number, size: number): number {
  return ((index % size) + size) % size;
}
`;
  ai = ai.slice(0, blockStart) + newBlock + ai.slice(blockEnd);

  // Add controlled forward-space progression before commands are returned.
  const returnAnchor = `  return commands;\n}\n// ─── TACTIC BUFFS + LONG BALLS`;
  if (!ai.includes("FTA_FORWARD_SPACE_PROGRESS_V4")) {
    ai = replaceOnce(ai, returnAnchor, `  // FTA_FORWARD_SPACE_PROGRESS_V4
  // Patient teams still advance when uncontested space exists. This prevents
  // adjacent-tile stagnation without turning possession teams reckless.
  if (aiHasBall && ballOwner?.teamId === "ai") {
    const turnsUrgency = tier >= 4 ? 0.45 : tier >= 3 ? 0.30 : 0.15;
    const patienceBias = tactic.progression === "slow" ? 0.72 : 1;
    for (const p of aiPlayers) {
      if (p.role === "goalkeeper") continue;
      const cmd = commands.get(p.id);
      if (!cmd || cmd.type !== CommandType.MOVE || !cmd.targetPosition) continue;
      const from = posToTile(p.position);
      const to = posToTile(cmd.targetPosition);
      const openAhead = playerPlayers.every((opp) => {
        const ot = posToTile(opp.position);
        return !(ot.col >= from.col - 3 && ot.col <= from.col && Math.abs(ot.row - from.row) <= 1);
      });
      const stalled = Math.abs(to.col - from.col) <= 1 && Math.abs(to.row - from.row) <= 1;
      if (openAhead && stalled && Math.random() < patienceBias + turnsUrgency * 0.25) {
        const advance = aiClamp(from.col - (turnsUrgency >= 0.40 ? 2 : 1), 1, GRID_COLS - 2);
        commands.set(p.id, {
          type: CommandType.MOVE,
          targetPosition: tileToPos(advance, aiClamp(from.row + Math.sign(ballTile.row - from.row), 0, GRID_ROWS - 1)),
        });
      }
    }
  }

  return commands;
}
// ─── TACTIC BUFFS + LONG BALLS`, "add forward-space progression");
  }
  write(files.ai, ai);

  let sim = fs.readFileSync(files.sim, "utf8");

  if (!sim.includes("function sanitizeBallCurve")) {
    const anchor = "function clamp(v: number, min: number, max: number): number {";
    const helper = `function sanitizeBallCurve(
  start: Vec2,
  rawPoints: Vec2[] | undefined,
  finalTarget: Vec2,
  rng: () => number,
): Vec2[] | undefined {
  if (!rawPoints?.length) return undefined;

  const points = [...rawPoints.map((p) => ({ ...p }))];
  points[points.length - 1] = { ...finalTarget };

  const direct = vec2Sub(finalTarget, start);
  const directLen = Math.max(1, vec2Len(direct));
  const forward = vec2Normalize(direct);
  const normal = { x: -forward.y, y: forward.x };

  // A legal ball curve can bend one way, but cannot reverse, loop, or form an S.
  let side = 0;
  let lastProgress = 0;
  const legal: Vec2[] = [];
  for (const point of points) {
    const rel = vec2Sub(point, start);
    const progress = vec2Dot(rel, forward);
    const lateral = vec2Dot(rel, normal);
    if (progress <= lastProgress + 2 || progress > directLen * 1.08) continue;
    const pointSide = Math.sign(lateral);
    if (pointSide !== 0 && side !== 0 && pointSide !== side) continue;
    if (pointSide !== 0) side = pointSide;
    lastProgress = progress;
    legal.push(point);
  }

  if (!legal.length || vec2Dist(legal[legal.length - 1], finalTarget) > 4) {
    legal.push({ ...finalTarget });
  }

  // Only PASS/LONG/SHOT routes call this helper. Movement/dribble curves stay untouched.
  const tileDistance = directLen / Math.max(TILE_W, TILE_H);
  if (tileDistance > 7) {
    const maxLateral = legal.reduce((m, p) => {
      const rel = vec2Sub(p, start);
      return Math.max(m, Math.abs(vec2Dot(rel, normal)));
    }, 0);
    const bendTiles = maxLateral / Math.max(TILE_W, TILE_H);
    const distancePenalty = clamp((tileDistance - 7) / 8, 0, 1);
    const bendPenalty = clamp(bendTiles / 4, 0, 1);
    const errorTiles = distancePenalty * (0.25 + bendPenalty * 1.75);
    if (errorTiles > 0.05) {
      const miss = (rng() * 2 - 1) * errorTiles * Math.max(TILE_W, TILE_H);
      const end = legal[legal.length - 1];
      legal[legal.length - 1] = {
        x: clamp(end.x + normal.x * miss, 4, PITCH_WIDTH - 4),
        y: clamp(end.y + normal.y * miss, 4, PITCH_HEIGHT - 4),
      };
    }
  }

  return legal;
}

`;
    sim = insertBeforeOnce(sim, anchor, helper, "add realistic ball curve helper");
  }

  sim = sim.replace(
    `  const curvePoints = cmd.curvePoints?.length
    ? cmd.curvePoints.map((point) => ({ ...point }))
    : undefined;`,
    `  const curvePoints = sanitizeBallCurve(
    ball.position,
    cmd.curvePoints,
    targetPos,
    rng,
  );`
  );

  sim = sim.replace(
    `  const curvePoints = player.command?.curvePoints?.length
    ? player.command.curvePoints.map((point) => ({ ...point }))
    : undefined;`,
    `  const curvePoints = sanitizeBallCurve(
    ball.position,
    player.command?.curvePoints,
    defaultTarget,
    rng,
  );`
  );

  if (!sim.includes("cmd.type === CommandType.DIVE")) {
    const moveAnchor = `} else if (cmd.type === CommandType.MOVE) {`;
    const diveBranch = `} else if (cmd.type === CommandType.DIVE) {
      if (player.role === "goalkeeper" && ball.ownerId !== player.id && cmd.targetPosition) {
        const from = posToTile(player.position);
        const wanted = posToTile(cmd.targetPosition);
        const maxTiles = Math.max(player.stats.defense, player.stats.speed) >= 9 ? 2 : 1;
        const dc = clamp(wanted.col - from.col, -maxTiles, maxTiles);
        const dr = clamp(wanted.row - from.row, -maxTiles, maxTiles);
        let col = from.col + dc;
        const row = clamp(from.row + dr, 0, GRID_ROWS - 1);
        col = player.teamId === "player"
          ? clamp(col, GK_COLS_PLAYER_MIN, GK_COLS_PLAYER_MAX)
          : clamp(col, GK_COLS_AI_MIN, GK_COLS_AI_MAX);
        player.position = tileToPos(col, row);
        player.velocity = vec2Scale(vec2Normalize(vec2Sub(player.position, tileToPos(from.col, from.row))), getLinearPixelSpeed(10) * 1.8);
        player.state = PlayerState.DIVING;
        player.stateTimer = 0.34;
        player.recoveryTimer = 0.28;
        player.commandExecuted = true;
      }
    ${moveAnchor}`;
    sim = replaceOnce(sim, moveAnchor, diveBranch, "add dive execution");
  }
  write(files.sim, sim);

  fs.copyFileSync(replacementPad, files.pad);

  function patchPage(file) {
    let src = fs.readFileSync(file, "utf8");

    // Remove stale goalkeeper-dive UI blocks from earlier failed installers.
    src = src.replace(new RegExp("\n  const selectedSimPlayer = selectedPlayerId[\\s\\S]*?\n  }, \\[selectedPlayerId, goalkeeperCanDive\\]\\);\n", "g"), "\n");
    src = src.replace(new RegExp("\n  const goalkeeperCanDive =[\\s\\S]*?\n  }, \\[selectedPlayerId, selectedSimPlayer, goalkeeperCanDive\\]\\);\n", "g"), "\n");
    src = src.replace(new RegExp("\n\\s*goalkeeperCanDive=\\{goalkeeperCanDive\\}\n\\s*onDive=\\{beginGoalkeeperDive\\}", "g"), "");
    src = src.replace(new RegExp("\n\\s*// FTA_GK_DIVE_TARGET_V[234][\\s\\S]*?\n\\s*}\n(?=\\s*(?:if|const|switch))", "g"), "\n");

    if (!src.includes("const [diveTargetMode, setDiveTargetMode]")) {
      const pendingState = /(^\s*const \[pendingCommands, setPendingCommands\][^;]+;)/m;
      if (!pendingState.test(src)) throw new Error(`missing pendingCommands state in ${path.basename(file)}`);
      src = src.replace(
        pendingState,
        `$1\n  const [diveTargetMode, setDiveTargetMode] = useState(false);`,
      );
    }

    if (!src.includes("const goalkeeperCanDive")) {
      const returnMatches = [...src.matchAll(/\n  return \(/g)];
      if (!returnMatches.length) throw new Error(`missing component return in ${path.basename(file)}`);
      const insertAt = returnMatches[returnMatches.length - 1].index;
      const block = `
  const selectedSimPlayer = selectedPlayerId
    ? currentFrame?.players.find((player) => player.id === selectedPlayerId) ?? null
    : null;
  const goalkeeperCanDive =
    !!selectedSimPlayer &&
    selectedSimPlayer.role === "goalkeeper" &&
    currentFrame?.ball.ownerId !== selectedSimPlayer.id;

  const beginGoalkeeperDive = useCallback(() => {
    if (!selectedPlayerId || !goalkeeperCanDive) return;
    setDiveTargetMode(true);
  }, [selectedPlayerId, goalkeeperCanDive]);
`;
      src = src.slice(0, insertAt) + block + src.slice(insertAt);
    }

    if (!src.includes("FTA_GK_DIVE_TARGET_V4")) {
      const tileGuard = '    if (phaseRef.current !== "planning" || !selectedPlayerId) return;';
      const guardIndex = src.indexOf(tileGuard, src.indexOf("const handleTileClick"));
      if (guardIndex < 0) throw new Error(`missing handleTileClick guard in ${path.basename(file)}`);
      const insertAt = guardIndex + tileGuard.length;
      const diveBlock = `

    // FTA_GK_DIVE_TARGET_V4
    if (diveTargetMode) {
      const cmd: Command = { type: CommandType.DIVE, targetPosition: pos };
      setPendingCommands(prev => {
        const next = new Map(prev);
        next.set(selectedPlayerId, cmd);
        return next;
      });
      setDiveTargetMode(false);
      clearSelection();
      return;
    }`;
      src = src.slice(0, insertAt) + diveBlock + src.slice(insertAt);
    }

    src = src.replace(
      /(<MechanicPad[\s\S]*?onShoot=\{[^}]+\})(?![\s\S]*?goalkeeperCanDive=)/g,
      `$1\n              goalkeeperCanDive={goalkeeperCanDive}\n              onDive={beginGoalkeeperDive}`
    );

    fs.writeFileSync(file, src);
  }

  patchPage(files.match);
  patchPage(files.online);

  let pitch = fs.readFileSync(files.pitch, "utf8");
  // PlayerState.DIVING automatically receives a strong airborne pose in both old and polished renderers.
  if (!pitch.includes("PlayerState.DIVING")) {
    pitch = pitch.replace(
      `const isRecovering = player.state === PlayerState.RECOVERING;`,
      `const isRecovering = player.state === PlayerState.RECOVERING;
    const isDiving = player.state === PlayerState.DIVING;`
    );
    pitch = pitch.replace(
      `const bodyLean =`,
      `const diveLift = isDiving ? Math.sin(Math.min(1, Math.max(0, player.stateTimer / 0.34)) * Math.PI) * 13 : 0;
    const diveLean = isDiving ? (player.velocity.x >= 0 ? 1.28 : -1.28) : 0;
    const bodyLean =`
    );
    pitch = pitch.replace(
      /ctx\.translate\(([^;]+)\);/,
      `ctx.translate($1);
    if (isDiving) {
      ctx.translate(0, -diveLift);
      ctx.rotate(diveLean);
    }`
    );
  }
  write(files.pitch, pitch);

  console.log("SUCCESS: defensive blocks, progression, realistic ball curves, and goalkeeper dive installed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
