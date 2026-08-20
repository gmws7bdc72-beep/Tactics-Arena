from pathlib import Path
import re, shutil, sys, time

MARK = "FTA_ONLINE_KICKOFF_100_LONGGOAL_V1"


def find_project() -> Path:
    candidates = [
        Path.cwd() / "artifacts/fta-game",
        Path.cwd() if (Path.cwd() / "src/pages/OnlineMatch.tsx").exists() else None,
        Path.home() / "workspace/artifacts/fta-game",
    ]
    for candidate in candidates:
        if candidate and (candidate / "src/pages/OnlineMatch.tsx").exists():
            return candidate.resolve()
    raise SystemExit("Could not find artifacts/fta-game. Run this from ~/workspace.")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def patch_online(path: Path):
    text = path.read_text()
    if MARK in text:
        print("OnlineMatch already patched")
        return

    anchor = "const ONLINE_TURN_TIME = 25;"
    if anchor not in text:
        raise RuntimeError("OnlineMatch: ONLINE_TURN_TIME anchor not found")

    helper = r'''

// FTA_ONLINE_KICKOFF_100_LONGGOAL_V1
// Online PvP is a pure tactics sandbox: every on-pitch player uses maxed 10/10
// attributes (100 OVR on the management scale). Abilities remain role-correct.
const ONLINE_MAX_STATS: PlayerCard["stats"] = {
  attack: 10,
  defense: 10,
  passing: 10,
  speed: 10,
  movement: 10,
  shooting: 10,
  dribbling: 10,
  tackling: 10,
  marking: 10,
  stamina: 10,
  strength: 10,
  vision: 10,
  longPassing: 10,
  aerial: 10,
};

function onlineAbilityFor(card: PlayerCard): PlayerCard["ability"] {
  const seed = Math.abs(card.jerseyNumber ?? 0);
  switch (card.role) {
    case "goalkeeper":
      return "goalkeeper";
    case "defender": {
      const pool: PlayerCard["ability"][] = ["iron_tackle", "shadow_mark", "powerhouse"];
      return pool[seed % pool.length];
    }
    case "midfielder": {
      const pool: PlayerCard["ability"][] = ["bullet_pass", "shadow_mark", "ghost_run"];
      return pool[seed % pool.length];
    }
    case "forward": {
      const pool: PlayerCard["ability"][] = ["ghost_run", "eagle_eye", "powerhouse"];
      return pool[seed % pool.length];
    }
    case "striker": {
      const pool: PlayerCard["ability"][] = ["eagle_eye", "ghost_run", "powerhouse"];
      return pool[seed % pool.length];
    }
  }
}
'''
    text = text.replace(anchor, anchor + helper, 1)

    # Replace the runtime stat copy + ability assignment inside makeSimPlayer.
    # Supports both the older normalization block and later versions with the same
    # property ordering.
    pattern = re.compile(
        r'''(?P<indent>\s*)stats:\s*\{\s*\.\.\.card\.stats,\s*movement:\s*legacyStats\.movement\s*\?\?\s*legacyStats\.luck\s*\?\?\s*5,\s*\},\s*ability:\s*card\.ability,''',
        re.S,
    )
    text, n = pattern.subn(
        lambda m: f'{m.group("indent")}stats: {{ ...ONLINE_MAX_STATS }},\n{m.group("indent")}ability: onlineAbilityFor(card),',
        text,
        count=1,
    )
    if n == 0:
        # Later variants may simply spread card.stats without legacy movement fallback.
        pattern2 = re.compile(
            r'''(?P<indent>\s*)stats:\s*\{\s*\.\.\.card\.stats\s*\},\s*ability:\s*card\.ability,''',
            re.S,
        )
        text, n = pattern2.subn(
            lambda m: f'{m.group("indent")}stats: {{ ...ONLINE_MAX_STATS }},\n{m.group("indent")}ability: onlineAbilityFor(card),',
            text,
            count=1,
        )
    if n != 1:
        raise RuntimeError("OnlineMatch: could not replace makeSimPlayer stats/ability block")

    # Add deterministic post-goal kickoff reset helper before component.
    component_anchor = "export default function OnlineMatch("
    if component_anchor not in text:
        raise RuntimeError("OnlineMatch: component anchor not found")
    kickoff_helper = r'''
function resetOnlineKickoff(
  players: SimPlayer[],
  concedingTeam: "player" | "ai",
): { players: SimPlayer[]; ball: SimBall } {
  const resetPlayers = players.map((player) => ({
    ...player,
    position: { ...player.startPosition },
    velocity: { x: 0, y: 0 },
    state: "IDLE" as SimPlayer["state"],
    command: null,
    commandExecuted: false,
    stateTimer: 0,
    recoveryTimer: 0,
    curveMotion: undefined,
  }));

  const rolePriority: Record<SimPlayer["role"], number> = {
    striker: 0,
    forward: 1,
    midfielder: 2,
    defender: 3,
    goalkeeper: 4,
  };
  const candidates = resetPlayers
    .filter((player) => player.teamId === concedingTeam)
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || a.jerseyNumber - b.jerseyNumber);
  const kicker = candidates[0];

  if (!kicker) {
    return {
      players: resetPlayers,
      ball: {
        position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },
        velocity: { x: 0, y: 0 },
        ownerId: null,
        height: 0,
      },
    };
  }

  // Put the team that conceded on the centre spot immediately. A tiny own-half
  // offset keeps the player legal while the possessed ball visually sits at centre.
  kicker.position = {
    x: PITCH_WIDTH / 2 + (concedingTeam === "player" ? -1 : 1),
    y: PITCH_HEIGHT / 2,
  };

  return {
    players: resetPlayers,
    ball: {
      position: { ...kicker.position },
      velocity: { x: 0, y: 0 },
      ownerId: kicker.id,
      height: 0,
      passTarget: undefined,
      passStyle: undefined,
      passStart: undefined,
      curveMotion: undefined,
    },
  };
}

'''
    text = text.replace(component_anchor, kickoff_helper + component_anchor, 1)

    # Replace the end-of-simulation state transfer. This is intentionally narrow
    # so it preserves all newer player snapshot fields added by later patches.
    state_pattern = re.compile(
        r'''(?P<ball>\s*const newBall = \{ position: \{ \.\.\.lastFrame\.ball\.position \}, velocity: \{ \.\.\.lastFrame\.ball\.velocity \}, ownerId: lastFrame\.ball\.ownerId, height: 0, passStyle: undefined, passStart: undefined \};)\s*\n\s*setPlayers\(newPlayers\);\s*\n\s*playersRef\.current = newPlayers;\s*\n\s*setBall\(newBall\);\s*\n\s*ballRef\.current = newBall;''',
        re.S,
    )
    replacement = r'''
    const liveBall: SimBall = {
      position: { ...lastFrame.ball.position },
      velocity: { ...lastFrame.ball.velocity },
      ownerId: lastFrame.ball.ownerId,
      height: 0,
      passStyle: undefined,
      passStart: undefined,
      passTarget: undefined,
      curveMotion: undefined,
    };
    const concedingTeam: "player" | "ai" | null =
      goalsDelta.p1 > goalsDelta.p2
        ? "ai"
        : goalsDelta.p2 > goalsDelta.p1
          ? "player"
          : null;
    const restart = concedingTeam
      ? resetOnlineKickoff(newPlayers, concedingTeam)
      : null;
    const nextPlayers = restart?.players ?? newPlayers;
    const newBall = restart?.ball ?? liveBall;

    setPlayers(nextPlayers);
    playersRef.current = nextPlayers;
    setBall(newBall);
    ballRef.current = newBall;
    // Stop displaying the final goal frame. This makes the kickoff formation
    // appear immediately while the server completes the turn handshake.
    setCurrentFrame(null);'''
    text, n = state_pattern.subn(replacement, text, count=1)
    if n != 1:
        # More tolerant fallback for versions where newBall already includes extra keys.
        fallback = re.compile(
            r'''\s*const newBall = \{(?P<body>.*?)lastFrame\.ball(?P<body2>.*?)\};\s*\n\s*setPlayers\(newPlayers\);\s*\n\s*playersRef\.current = newPlayers;\s*\n\s*setBall\(newBall\);\s*\n\s*ballRef\.current = newBall;''',
            re.S,
        )
        text, n = fallback.subn(replacement, text, count=1)
    if n != 1:
        raise RuntimeError("OnlineMatch: could not patch finishSimulation state handoff")

    path.write_text(text)
    print("Patched OnlineMatch.tsx")


def patch_simulation(path: Path):
    text = path.read_text()
    sim_mark = "FTA_LONG_BALL_GOAL_DEPTH_V1"
    if sim_mark in text:
        print("simulation already patched")
        return

    # Preserve the user's requested goal-depth X coordinate before long-pass
    # inaccuracy converts an out-of-pitch target to a normal field tile.
    target_anchor = '''  let targetPos = cmd.targetPosition ?? {
    x: PITCH_WIDTH / 2,
    y: PITCH_HEIGHT / 2,
  };
'''
    if target_anchor not in text:
        raise RuntimeError("simulation: executePass target anchor not found")
    target_extra = target_anchor + '''
  // FTA_LONG_BALL_GOAL_DEPTH_V1
  // A long-ball attempt aimed into the net must stay a goal-depth attempt.
  // Accuracy can still pull it high/wide via Y, but must never turn the target
  // into the last in-field tile (the old invisible-wall behaviour).
  const requestedTargetPos = { ...targetPos };
  const requestedGoalDepth =
    isLongBall &&
    (requestedTargetPos.x < 0 || requestedTargetPos.x > PITCH_WIDTH) &&
    requestedTargetPos.y >= GOAL_TOP_Y &&
    requestedTargetPos.y <= GOAL_BOTTOM_Y;
'''
    text = text.replace(target_anchor, target_extra, 1)

    # Restore the goal-depth X after the existing accuracy deviation block.
    speed_anchor = '''
  let passSpd = PASS_SPEED;
'''
    if speed_anchor not in text:
        raise RuntimeError("simulation: pass speed anchor not found")
    restore = '''
  if (requestedGoalDepth) {
    targetPos = {
      ...targetPos,
      x: requestedTargetPos.x,
    };
  }

  let passSpd = PASS_SPEED;
'''
    text = text.replace(speed_anchor, restore, 1)

    path.write_text(text)
    print("Patched simulation.ts")


def patch_pitch(path: Path):
    text = path.read_text()
    if "FTA_PASS_INTO_NET_V2" in text or "insideGoalDepth" in text:
        print("PitchCanvas already supports goal-depth pass targeting")
        return

    # Put goal-depth pass handling after the selected player is resolved and
    # before tile clamping. OnlineMatch passes longPassTargetMode through the
    # same passTargetMode prop, so this covers both ground and long balls.
    anchor = '''      if (!selPlayer) return;
'''
    if anchor not in text:
        raise RuntimeError("PitchCanvas: selected player anchor not found")
    addition = anchor + '''      // FTA_PASS_INTO_NET_V2
      const insideGoalDepth =
        (pos.x < 0 || pos.x > PITCH_WIDTH) &&
        pos.y >= GOAL_TOP_Y &&
        pos.y <= GOAL_TOP_Y + GOAL_WIDTH;

      if (passTargetMode && insideGoalDepth) {
        onTileClick(
          {
            x: clamp(pos.x, -GOAL_DEPTH + BALL_RADIUS, PITCH_WIDTH + GOAL_DEPTH - BALL_RADIUS),
            y: clamp(pos.y, GOAL_TOP_Y + BALL_RADIUS, GOAL_TOP_Y + GOAL_WIDTH - BALL_RADIUS),
          },
          false,
        );
        return;
      }
'''
    text = text.replace(anchor, addition, 1)
    path.write_text(text)
    print("Patched PitchCanvas.tsx")


def main():
    project = find_project()
    print(f"FTA project: {project}")
    targets = [
        project / "src/pages/OnlineMatch.tsx",
        project / "src/engine/simulation.ts",
        project / "src/components/PitchCanvas.tsx",
    ]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = project / "backups" / f"fta-a16-{stamp}"
    backup.mkdir(parents=True, exist_ok=True)
    for src in targets:
        if not src.exists():
            raise SystemExit(f"Missing required file: {src}")
        rel = src.relative_to(project)
        dst = backup / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    try:
        patch_online(targets[0])
        patch_simulation(targets[1])
        patch_pitch(targets[2])
    except Exception:
        print("Patch failed; restoring target files...")
        for src in targets:
            rel = src.relative_to(project)
            shutil.copy2(backup / rel, src)
        raise

    print(f"Backup: {backup}")

if __name__ == "__main__":
    main()
