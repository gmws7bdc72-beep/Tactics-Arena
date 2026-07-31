import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const game = path.join(root, "artifacts/fta-game");
const files = {
  customize: path.join(game, "src/pages/Customize.tsx"),
  state: path.join(game, "src/hooks/useGameState.ts"),
  match: path.join(game, "src/pages/Match.tsx"),
  online: path.join(game, "src/pages/OnlineMatch.tsx"),
  pitch: path.join(game, "src/components/PitchCanvas.tsx"),
  sim: path.join(game, "src/engine/simulation.ts"),
};

function fail(message) {
  throw new Error(message);
}

for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

function replaceOnce(source, find, replacement, label) {
  const count = source.split(find).length - 1;
  if (count !== 1) fail(`${label}: expected 1 match, found ${count}`);
  return source.replace(find, replacement);
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  const count = matches?.length ?? 0;
  if (count !== 1) fail(`${label}: expected 1 match, found ${count}`);
  return source.replace(pattern, replacement);
}

function ensureConstants(source, names) {
  const pattern = /import\s*\{([^{}]*)\}\s*from\s*["']([^"']*constants)["'];/m;
  const match = source.match(pattern);
  if (!match) fail("Could not find constants import");
  const existing = match[1].split(",").map((name) => name.trim()).filter(Boolean);
  for (const name of names) if (!existing.includes(name)) existing.push(name);
  const unique = [...new Set(existing)];
  return source.replace(pattern, `import {\n  ${unique.join(",\n  ")},\n} from "${match[2]}";`);
}

// Team name: save directly, then keep team/league/market stores synchronized.
{
  let source = fs.readFileSync(files.customize, "utf8");
  source = source.replace(
    /import\s*\{\s*JERSEY_COLORS,\s*SECONDARY_COLORS\s*\}\s*from\s*["']\.\.\/game\/persistence["'];/,
    'import { JERSEY_COLORS, SECONDARY_COLORS, saveTeam } from "../game/persistence";',
  );

  if (!source.includes("FTA_TEAM_NAME_PERSIST_V2")) {
    const anchor = `      : current.jerseyColor;\n\n  return (`;
    const handler = `      : current.jerseyColor;\n\n  // FTA_TEAM_NAME_PERSIST_V2\n  const handleSave = () => {\n    const next = {\n      ...current,\n      name: current.name.trim() || team.name,\n    };\n    saveTeam(next);\n    setCurrent(next);\n    onSave(next);\n  };\n\n  return (`;
    source = replaceOnce(source, anchor, handler, "insert persistent team-name handler");
  }

  source = source.replace(/onClick=\{\(\) => onSave\([^\n]*\)\}/, "onClick={handleSave}");
  source = source.replace(/onClick=\{\(\) => onSave\(\{ \.\.\.current,[\s\S]*?\}\)\}/, "onClick={handleSave}");
  if (!source.includes("onClick={handleSave}")) fail("Could not wire team save button");
  fs.writeFileSync(files.customize, source);
}

{
  let source = fs.readFileSync(files.state, "utf8");
  const start = source.indexOf("  const updateTeam = useCallback((nextTeam: TeamConfig) => {");
  const end = source.indexOf("\n\n  const updateLeague = useCallback", start);
  if (start < 0 || end < 0) fail("Could not find updateTeam callback");
  const replacement = `  const updateTeam = useCallback((nextTeam: TeamConfig) => {\n    const normalized = ensureTeamDevelopment(nextTeam);\n    setTeamState(normalized);\n    saveTeam(normalized);\n\n    setLeagueState((previous) => {\n      const updated = {\n        ...previous,\n        teams: previous.teams.map((entry) =>\n          entry.id === PLAYER_TEAM_ID_CONST\n            ? { ...entry, name: normalized.name }\n            : entry,\n        ),\n      };\n      saveLeague(updated);\n\n      setMarketState((previousMarket) => {\n        const nextMarket = normalizeMarket(previousMarket, normalized, updated);\n        saveTransferMarket(nextMarket);\n        return nextMarket;\n      });\n\n      return updated;\n    });\n  }, []);`;
  source = source.slice(0, start) + replacement + source.slice(end);
  fs.writeFileSync(files.state, source);
}

// Match and online match: include the goal depth in shot targeting and canvas input.
for (const file of [files.match, files.online]) {
  let source = fs.readFileSync(file, "utf8");
  source = ensureConstants(source, ["PITCH_WIDTH", "GOAL_DEPTH", "GOAL_TOP_Y", "GOAL_WIDTH", "BALL_RADIUS"]);

  source = source.replace(
    /passTargetMode=\{passTargetMode \|\| longPassTargetMode\}/g,
    "passTargetMode={passTargetMode || longPassTargetMode || shotTargetMode}",
  );

  const shotStart = source.indexOf("    if (shotTargetMode) {");
  const shotEnd = source.indexOf("\n    if (curve.active && !curve.baseCommand) {", shotStart);
  if (shotStart < 0 || shotEnd < 0) fail(`Could not find shot target block in ${path.basename(file)}`);
  const shotBlock = `    if (shotTargetMode) {\n      const selected = currentFrame?.players.find(\n        (player) => player.id === selectedPlayerId,\n      );\n      if (!selected) return;\n\n      const attackingRight = selected.teamId === "player";\n      const fallbackX = attackingRight\n        ? PITCH_WIDTH + GOAL_DEPTH * 0.65\n        : -GOAL_DEPTH * 0.65;\n      const target = {\n        x: attackingRight\n          ? Math.max(\n              PITCH_WIDTH + BALL_RADIUS,\n              Math.min(PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS, pos.x > PITCH_WIDTH ? pos.x : fallbackX),\n            )\n          : Math.min(\n              -BALL_RADIUS,\n              Math.max(-GOAL_DEPTH + BALL_RADIUS, pos.x < 0 ? pos.x : fallbackX),\n            ),\n        y: Math.max(\n          GOAL_TOP_Y + BALL_RADIUS,\n          Math.min(GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS, pos.y),\n        ),\n      };\n\n      if (curve.active) {\n        curve.setTargetCommand({\n          type: CommandType.SHOOT,\n          targetPosition: target,\n        });\n        setShotTargetMode(false);\n        return;\n      }\n\n      setPendingCommands((previous) => {\n        const next = new Map(previous);\n        next.set(selectedPlayerId, {\n          type: CommandType.SHOOT,\n          targetPosition: target,\n        });\n        return next;\n      });\n      setShotTargetMode(false);\n      clearSelection();\n      return;\n    }\n`;
  source = source.slice(0, shotStart) + shotBlock + source.slice(shotEnd);
  fs.writeFileSync(file, source);
}

// Pitch: fit both goal depths, allow clicking/passing into the nets, and draw straight shot lines.
{
  let source = fs.readFileSync(files.pitch, "utf8");
  source = replaceOnce(
    source,
    "  const baseH = isVertical ? PITCH_WIDTH : PITCH_HEIGHT;",
    `  // FTA_GOAL_VIEW_BOUNDS_V2\n  const viewMinX = -GOAL_DEPTH;\n  const viewMaxX = PITCH_WIDTH + GOAL_DEPTH;\n  const baseH = isVertical ? viewMaxX - viewMinX : PITCH_HEIGHT;`,
    "extend view bounds",
  );
  source = replaceOnce(
    source,
    "          y: PITCH_WIDTH - p.x,",
    "          y: viewMaxX - p.x,",
    "shift vertical view for goals",
  );
  source = replaceOnce(
    source,
    `  const corners = [\n    raw({ x: 0, y: 0 }),\n    raw({ x: PITCH_WIDTH, y: 0 }),\n    raw({ x: PITCH_WIDTH, y: PITCH_HEIGHT }),\n    raw({ x: 0, y: PITCH_HEIGHT }),\n  ];`,
    `  const corners = [\n    raw({ x: viewMinX, y: 0 }),\n    raw({ x: viewMaxX, y: 0 }),\n    raw({ x: viewMaxX, y: PITCH_HEIGHT }),\n    raw({ x: viewMinX, y: PITCH_HEIGHT }),\n  ];`,
    "fit goal-depth corners",
  );
  source = replaceOnce(
    source,
    "          x: PITCH_WIDTH - by,",
    "          x: viewMaxX - by,",
    "unproject vertical goal bounds",
  );
  source = replaceOnce(
    source,
    `    return {\n      x: clamp(pitch.x, 0, PITCH_WIDTH - 1),\n      y: clamp(pitch.y, 0, PITCH_HEIGHT - 1),\n    };`,
    `    return {\n      x: clamp(pitch.x, viewMinX, viewMaxX),\n      y: clamp(pitch.y, 0, PITCH_HEIGHT),\n    };`,
    "allow goal-depth coordinates",
  );

  const clickAnchor = "      const clickedCol = clamp(Math.floor(pos.x / TILE_W), 0, GRID_COLS - 1);";
  if (!source.includes("FTA_PASS_INTO_NET_V2")) {
    const goalClick = `      // FTA_PASS_INTO_NET_V2\n      const insideGoalDepth =\n        (pos.x < 0 || pos.x > PITCH_WIDTH) &&\n        pos.y >= GOAL_TOP_Y &&\n        pos.y <= GOAL_TOP_Y + GOAL_WIDTH;\n\n      if (passTargetMode && insideGoalDepth) {\n        onTileClick(\n          {\n            x: clamp(pos.x, -GOAL_DEPTH + BALL_RADIUS, PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS),\n            y: clamp(pos.y, GOAL_TOP_Y + BALL_RADIUS, GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS),\n          },\n          false,\n        );\n        return;\n      }\n\n`;
    source = replaceOnce(source, clickAnchor, goalClick + clickAnchor, "allow passes into goal depth");
  }

  const shotOld = /        \} else if \(cmd\.type === CommandType\.SHOOT\) \{[\s\S]*?          \);\n        \}/;
  const shotNew = `        } else if (cmd.type === CommandType.SHOOT) {\n          drawArrow(\n            pf.position,\n            cmd.targetPosition ?? {\n              x: pf.teamId === "player"\n                ? PITCH_WIDTH + GOAL_DEPTH * 0.65\n                : -GOAL_DEPTH * 0.65,\n              y: PITCH_HEIGHT / 2,\n            },\n            "#ff6b35",\n            true,\n            false,\n            cmd.curvePoints,\n          );\n        }`;
  source = replaceRegexOnce(source, shotOld, shotNew, "make shot guide straight");
  fs.writeFileSync(files.pitch, source);
}

// Simulation: long balls are definitely slower, shots use their selected point,
// and a goal only counts after the whole ball crosses the line into net depth.
{
  let source = fs.readFileSync(files.sim, "utf8");
  source = ensureConstants(source, ["BALL_RADIUS"]);

  source = replaceRegexOnce(
    source,
    /\n  let passSpd = PASS_SPEED;[\s\S]*?\n\n  ball\.curveMotion =/,
    `\n  // FTA_LONG_PASS_SLOW_V2\n  const abilityMultiplier = player.ability === "bullet_pass" ? 1.5 : 1;\n  const passSpd =\n    PASS_SPEED * abilityMultiplier * (isLongBall ? 0.58 : 1);\n\n  ball.curveMotion =`,
    "replace pass speeds",
  );

  const shotStart = source.indexOf("function executeShot(");
  const shotEnd = source.indexOf("\nfunction updateBallPhysics(", shotStart);
  if (shotStart < 0 || shotEnd < 0) fail("Could not find executeShot");
  const shotFunction = `function executeShot(\n  player: SimPlayer,\n  ball: SimBall,\n  rng: () => number,\n): void {\n  const cmd = player.command;\n  const attackingRight = player.teamId === "player";\n  const fallbackX = attackingRight\n    ? GOAL_RIGHT_X + GOAL_DEPTH * 0.65\n    : GOAL_LEFT_X - GOAL_DEPTH * 0.65;\n  const desired = cmd?.targetPosition ?? {\n    x: fallbackX,\n    y: PITCH_HEIGHT / 2,\n  };\n\n  const targetX = attackingRight\n    ? clamp(\n        desired.x,\n        GOAL_RIGHT_X + BALL_RADIUS,\n        GOAL_RIGHT_X + GOAL_DEPTH - BALL_RADIUS,\n      )\n    : clamp(\n        desired.x,\n        GOAL_LEFT_X - GOAL_DEPTH + BALL_RADIUS,\n        GOAL_LEFT_X - BALL_RADIUS,\n      );\n  const distanceTiles =\n    vec2Dist(player.position, desired) / Math.max(TILE_W, TILE_H);\n  const shooting = Math.max(1, Math.min(10, player.stats.shooting));\n  const rangePressure = Math.max(0, distanceTiles - 3) * 0.12;\n  const skillError = (11 - shooting) * 0.08;\n  const maxErrorTiles = Math.min(2.25, rangePressure + skillError);\n  const errorY =\n    (rng() * 2 - 1) * maxErrorTiles * Math.max(TILE_W, TILE_H);\n\n  const target = {\n    x: targetX,\n    y: clamp(desired.y + errorY, BALL_RADIUS, PITCH_HEIGHT - BALL_RADIUS),\n  };\n\n  let shotSpd = SHOT_SPEED * (0.72 + shooting * 0.045);\n  if (player.ability === "eagle_eye") shotSpd *= 1.08;\n\n  ball.curveMotion =\n    cmd?.curvePoints && cmd.curvePoints.length >= 2\n      ? createCurveMotion(ball.position, cmd.curvePoints, target)\n      : undefined;\n  const firstTarget = ball.curveMotion?.points[0] ?? target;\n  const dir = vec2Normalize(vec2Sub(firstTarget, ball.position));\n  ball.velocity = vec2Scale(dir, shotSpd);\n  ball.passTarget = target;\n  ball.passStart = { ...ball.position };\n  ball.ownerId = null;\n  ball.height = 0;\n  ball.passStyle = undefined;\n}\n`;
  source = source.slice(0, shotStart) + shotFunction + source.slice(shotEnd);

  const constrainStart = source.indexOf("function constrainToField(");
  const goalStart = source.indexOf("\nfunction checkGoal(", constrainStart);
  const goalEnd = source.indexOf("\n}", goalStart) + 2;
  if (constrainStart < 0 || goalStart < 0 || goalEnd < 2) fail("Could not find field/goal functions");
  const fieldAndGoal = `function constrainToField(players: SimPlayer[], ball: SimBall): void {\n  for (const player of players) {\n    player.position.x = clamp(\n      player.position.x,\n      PLAYER_RADIUS,\n      PITCH_WIDTH - PLAYER_RADIUS,\n    );\n    player.position.y = clamp(\n      player.position.y,\n      PLAYER_RADIUS,\n      PITCH_HEIGHT - PLAYER_RADIUS,\n    );\n  }\n\n  if (ball.ownerId !== null) return;\n\n  const inGoalYRange =\n    ball.position.y >= GOAL_TOP_Y && ball.position.y <= GOAL_BOTTOM_Y;\n\n  if (ball.position.y < 0) {\n    ball.velocity.y = Math.abs(ball.velocity.y) * 0.4;\n    ball.position.y = BALL_RADIUS;\n  } else if (ball.position.y > PITCH_HEIGHT) {\n    ball.velocity.y = -Math.abs(ball.velocity.y) * 0.4;\n    ball.position.y = PITCH_HEIGHT - BALL_RADIUS;\n  }\n\n  if (inGoalYRange) {\n    const leftBack = GOAL_LEFT_X - GOAL_DEPTH + BALL_RADIUS;\n    const rightBack = GOAL_RIGHT_X + GOAL_DEPTH - BALL_RADIUS;\n    if (ball.position.x < leftBack) {\n      ball.position.x = leftBack;\n      ball.velocity.x = Math.abs(ball.velocity.x) * 0.25;\n    } else if (ball.position.x > rightBack) {\n      ball.position.x = rightBack;\n      ball.velocity.x = -Math.abs(ball.velocity.x) * 0.25;\n    }\n  } else if (ball.position.x < GOAL_LEFT_X) {\n    ball.position.x = GOAL_LEFT_X + BALL_RADIUS;\n    ball.velocity.x = Math.abs(ball.velocity.x) * 0.3;\n    ball.velocity.y *= 0.3;\n  } else if (ball.position.x > GOAL_RIGHT_X) {\n    ball.position.x = GOAL_RIGHT_X - BALL_RADIUS;\n    ball.velocity.x = -Math.abs(ball.velocity.x) * 0.3;\n    ball.velocity.y *= 0.3;\n  }\n}\n\nfunction checkGoal(ball: SimBall): "player" | "ai" | null {\n  if (ball.ownerId !== null) return null;\n\n  const completelyBetweenPosts =\n    ball.position.y - BALL_RADIUS >= GOAL_TOP_Y &&\n    ball.position.y + BALL_RADIUS <= GOAL_BOTTOM_Y;\n  if (!completelyBetweenPosts) return null;\n\n  const fullyInsideRightNet =\n    ball.position.x - BALL_RADIUS > GOAL_RIGHT_X &&\n    ball.position.x <= GOAL_RIGHT_X + GOAL_DEPTH;\n  if (fullyInsideRightNet) return "player";\n\n  const fullyInsideLeftNet =\n    ball.position.x + BALL_RADIUS < GOAL_LEFT_X &&\n    ball.position.x >= GOAL_LEFT_X - GOAL_DEPTH;\n  if (fullyInsideLeftNet) return "ai";\n\n  return null;\n}`;
  source = source.slice(0, constrainStart) + fieldAndGoal + source.slice(goalEnd);
  fs.writeFileSync(files.sim, source);
}

console.log("SUCCESS: name saving, slower long balls, full goal-depth view, straight shot guides, and strict goal-line detection fixed.");
