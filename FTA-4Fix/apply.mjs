import fs from "node:fs";
import path from "node:path";

const game = path.resolve("artifacts/fta-game");
const files = {
  customize: path.join(game, "src/pages/Customize.tsx"),
  market: path.join(game, "src/pages/TransferMarket.tsx"),
  match: path.join(game, "src/pages/Match.tsx"),
  online: path.join(game, "src/pages/OnlineMatch.tsx"),
  sim: path.join(game, "src/engine/simulation.ts"),
  pitch: path.join(game, "src/components/PitchCanvas.tsx"),
  curveHook: path.join(game, "src/hooks/useCurvePlanner.ts"),
};

function die(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
for (const file of Object.values(files)) {
  if (!fs.existsSync(file)) die(`missing ${file}`);
}

function replaceOnce(src, find, replacement, label) {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1 match, found ${n}`);
  return src.replace(find, replacement);
}

try {
  // 1) Team name saves through the same TeamConfig object as the kit.
  let customize = fs.readFileSync(files.customize, "utf8");

  if (!customize.includes("FTA_TEAM_NAME_SAVE")) {
    const mainAnchor = '      <main className="space-y-7 px-4 pb-28 pt-5">';
    const teamNameSection = `
        {/* FTA_TEAM_NAME_SAVE */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <label
            htmlFor="fta-team-name"
            className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-gray-400"
          >
            Team Name
          </label>
          <input
            id="fta-team-name"
            value={current.name}
            maxLength={28}
            onChange={(event) =>
              setCurrent((previous) => ({
                ...previous,
                name: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-base font-bold text-white outline-none focus:border-emerald-400"
            placeholder="Enter team name"
          />
        </section>
`;
    customize = replaceOnce(
      customize,
      mainAnchor,
      `${mainAnchor}\n${teamNameSection}`,
      "insert team name editor",
    );
  }

  customize = customize.replace(
    /onClick=\{\(\) => onSave\(current\)\}/,
    'onClick={() => onSave({ ...current, name: current.name.trim() || team.name })}',
  );
  customize = customize.replace(">Save Kit<", ">Save Team<");
  fs.writeFileSync(files.customize, customize);

  // 2) Show the complete player stat sheet when a market player is opened.
  let market = fs.readFileSync(files.market, "utf8");
  if (!market.includes("FTA_MARKET_STATS")) {
    const careerAnchor = `                      <div
                        className="mb-3 rounded-lg px-3 py-2"
                        style={{ background: "rgba(255,255,255,.035)" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[9px] font-black uppercase text-gray-500">
                            Career
                          </div>`;
    const stats = `                      {/* FTA_MARKET_STATS */}
                      <div className="mb-3 rounded-xl border border-white/10 bg-black/15 p-3">
                        <div className="mb-2 text-[9px] font-black uppercase tracking-wider text-gray-500">
                          Player Stats
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(player.stats).map(([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg bg-white/[0.045] px-2 py-2 text-center"
                            >
                              <div className="truncate text-[8px] font-bold uppercase text-gray-500">
                                {key.replace(/([A-Z])/g, " $1")}
                              </div>
                              <div className="mt-0.5 text-sm font-black text-white">
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

`;
    market = replaceOnce(
      market,
      careerAnchor,
      stats + careerAnchor,
      "insert market stats",
    );
  }
  fs.writeFileSync(files.market, market);

  // 3) Manual shot placement in both match modes.
  function patchMatch(file) {
    let src = fs.readFileSync(file, "utf8");

    if (!src.includes("FTA_SHOT_TARGET_MODE")) {
      src = replaceOnce(
        src,
        "  const [longPassTargetMode, setLongPassTargetMode] = useState(false);",
        `  const [longPassTargetMode, setLongPassTargetMode] = useState(false);
  // FTA_SHOT_TARGET_MODE
  const [shotTargetMode, setShotTargetMode] = useState(false);`,
        `add shot target state to ${path.basename(file)}`,
      );

      src = replaceOnce(
        src,
        "    setLongPassTargetMode(false);\n    setComboActive(false);",
        "    setLongPassTargetMode(false);\n    setShotTargetMode(false);\n    setComboActive(false);",
        `reset shot target state in ${path.basename(file)}`,
      );

      const tileAnchor = `    if (curve.active && !curve.baseCommand) {`;
      const shotTap = `    if (shotTargetMode) {
      const selected = currentFrame?.players.find(
        (player) => player.id === selectedPlayerId,
      );
      if (!selected) return;

      const goalX = selected.teamId === "player" ? PITCH_WIDTH + GOAL_DEPTH : -GOAL_DEPTH;
      const target = {
        x: goalX,
        y: Math.max(GOAL_TOP_Y, Math.min(GOAL_TOP_Y + GOAL_WIDTH, pos.y)),
      };

      if (curve.active) {
        curve.setTargetCommand({
          type: CommandType.SHOOT,
          targetPosition: target,
        });
        setShotTargetMode(false);
        return;
      }

      setPendingCommands((previous) => {
        const next = new Map(previous);
        next.set(selectedPlayerId, {
          type: CommandType.SHOOT,
          targetPosition: target,
        });
        return next;
      });
      setShotTargetMode(false);
      clearSelection();
      return;
    }

`;
      src = replaceOnce(
        src,
        tileAnchor,
        shotTap + tileAnchor,
        `add shot placement tap in ${path.basename(file)}`,
      );

      const shootStart = src.indexOf("  const setShoot = useCallback(() => {");
      const shootEnd = src.indexOf("\n  const setPass = useCallback", shootStart);
      if (shootStart < 0 || shootEnd < 0) {
        throw new Error(`setShoot block not found in ${path.basename(file)}`);
      }
      const newShoot = `  const setShoot = useCallback(() => {
    if (!selectedPlayerId) return;
    setPassTargetMode(false);
    setLongPassTargetMode(false);
    setShotTargetMode(true);
  }, [selectedPlayerId]);`;
      src = src.slice(0, shootStart) + newShoot + src.slice(shootEnd);

      src = src.replace(
        /\{!comboActive && \(passTargetMode \|\| longPassTargetMode\) && \(/,
        `{!comboActive && (passTargetMode || longPassTargetMode || shotTargetMode) && (`,
      );
      src = src.replace(
        /\{longPassTargetMode \? "Tap a tile or player to launch a long ball" : "Tap a tile or player to pass"\}/,
        `{shotTargetMode
              ? "Tap inside the goal to place the shot"
              : longPassTargetMode
                ? "Tap a tile or player to launch a long ball"
                : "Tap a tile or player to pass"}`,
      );
    }

    fs.writeFileSync(file, src);
  }

  patchMatch(files.match);
  patchMatch(files.online);

  // Ensure required constants are imported in both match pages.
  for (const file of [files.match, files.online]) {
    let src = fs.readFileSync(file, "utf8");
    const constantsImport = src.match(/import \{([\s\S]*?)\} from "\.\.\/engine\/constants";/);
    if (constantsImport) {
      const names = constantsImport[1]
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      for (const name of ["PITCH_WIDTH", "GOAL_DEPTH", "GOAL_TOP_Y", "GOAL_WIDTH"]) {
        if (!names.includes(name)) names.push(name);
      }
      src = src.replace(
        constantsImport[0],
        `import {\n  ${names.join(",\n  ")},\n} from "../engine/constants";`,
      );
    }
    fs.writeFileSync(file, src);
  }

  // Curve preview now respects a chosen shot target.
  let curveHook = fs.readFileSync(files.curveHook, "utf8");
  curveHook = curveHook.replace(
    `      baseCommand.type === CommandType.SHOOT
        ? {
            x: selectedPlayer.teamId === "player" ? PITCH_WIDTH : 0,
            y: PITCH_HEIGHT / 2,
          }
        : baseCommand.targetPosition;`,
    `      baseCommand.type === CommandType.SHOOT
        ? baseCommand.targetPosition ?? {
            x: selectedPlayer.teamId === "player" ? PITCH_WIDTH : 0,
            y: PITCH_HEIGHT / 2,
          }
        : baseCommand.targetPosition;`,
  );
  fs.writeFileSync(files.curveHook, curveHook);

  // Shot accuracy/power are driven by shooting stat. Long pass is slower than ground pass.
  let sim = fs.readFileSync(files.sim, "utf8");

  const shotStart = sim.indexOf("function executeShot(");
  const shotEnd = sim.indexOf("\nfunction updateBallPhysics(", shotStart);
  if (shotStart < 0 || shotEnd < 0) throw new Error("executeShot block not found");

  const newShot = `function executeShot(
  player: SimPlayer,
  ball: SimBall,
  rng: () => number,
): void {
  const cmd = player.command;
  const goalX = player.teamId === "player" ? GOAL_RIGHT_X + GOAL_DEPTH : GOAL_LEFT_X - GOAL_DEPTH;
  const desired = cmd?.targetPosition ?? {
    x: goalX,
    y: PITCH_HEIGHT / 2,
  };

  const distanceTiles =
    vec2Dist(player.position, desired) / Math.max(TILE_W, TILE_H);
  const shooting = Math.max(1, Math.min(10, player.stats.shooting));

  // Range increases error; shooting skill reduces it.
  const rangePressure = Math.max(0, distanceTiles - 3) * 0.12;
  const skillError = (11 - shooting) * 0.08;
  const maxErrorTiles = Math.min(2.25, rangePressure + skillError);
  const errorY =
    (rng() * 2 - 1) * maxErrorTiles * Math.max(TILE_W, TILE_H);

  const target = {
    x: goalX,
    y: Math.max(
      GOAL_TOP_Y,
      Math.min(GOAL_TOP_Y + GOAL_WIDTH, desired.y + errorY),
    ),
  };

  // Shooting controls power. Eagle Eye keeps a modest power bonus.
  let shotSpd = SHOT_SPEED * (0.72 + shooting * 0.045);
  if (player.ability === "eagle_eye") shotSpd *= 1.08;

  ball.curveMotion =
    cmd?.curvePoints && cmd.curvePoints.length >= 2
      ? createCurveMotion(ball.position, cmd.curvePoints, target)
      : undefined;
  const firstTarget = ball.curveMotion?.points[0] ?? target;
  const dir = vec2Normalize(vec2Sub(firstTarget, ball.position));
  ball.velocity = vec2Scale(dir, shotSpd);
  ball.passTarget = target;
  ball.passStart = { ...ball.position };
  ball.ownerId = null;
  ball.height = 0;
  ball.passStyle = undefined;
}
`;
  sim = sim.slice(0, shotStart) + newShot + sim.slice(shotEnd);

  sim = sim.replace(
    "  if (isLongBall) passSpd *= 1.12;",
    "  if (isLongBall) passSpd *= 0.78;",
  );

  fs.writeFileSync(files.sim, sim);

  // 4) Give both goals visible net depth/grid.
  let pitch = fs.readFileSync(files.pitch, "utf8");
  if (!pitch.includes("FTA_GOAL_DEPTH_NET")) {
    const goalAnchor = `    ctx.save();
    ctx.globalAlpha = 0.08;`;
    const net = `    // FTA_GOAL_DEPTH_NET
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const y = goalTop + (GOAL_WIDTH * i) / 4;
      drawProjectedPath(
        ctx,
        view,
        [
          { x: -GOAL_DEPTH, y },
          { x: 0, y },
        ],
        "rgba(255,255,255,0.22)",
        1,
      );
      drawProjectedPath(
        ctx,
        view,
        [
          { x: PITCH_WIDTH, y },
          { x: PITCH_WIDTH + GOAL_DEPTH, y },
        ],
        "rgba(255,255,255,0.22)",
        1,
      );
    }
    for (let i = 1; i < 3; i += 1) {
      const leftX = (-GOAL_DEPTH * i) / 3;
      const rightX = PITCH_WIDTH + (GOAL_DEPTH * i) / 3;
      drawProjectedPath(
        ctx,
        view,
        [
          { x: leftX, y: goalTop },
          { x: leftX, y: goalBottom },
        ],
        "rgba(255,255,255,0.18)",
        1,
      );
      drawProjectedPath(
        ctx,
        view,
        [
          { x: rightX, y: goalTop },
          { x: rightX, y: goalBottom },
        ],
        "rgba(255,255,255,0.18)",
        1,
      );
    }
    ctx.restore();

`;
    pitch = replaceOnce(pitch, goalAnchor, net + goalAnchor, "add goal net depth");
  }
  fs.writeFileSync(files.pitch, pitch);

  console.log("SUCCESS: team name, market stats, placed shooting, goal depth, and pass speeds updated.");
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}
