from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path.cwd()
GAME = ROOT / "artifacts" / "fta-game"
if not GAME.exists():
    # Allow running from inside artifacts/fta-game as a convenience.
    if (ROOT / "src" / "pages" / "OnlineMatch.tsx").exists():
        GAME = ROOT
    else:
        raise SystemExit("Could not find artifacts/fta-game from the current directory.")

online_path = GAME / "src" / "pages" / "OnlineMatch.tsx"
pitch_path = GAME / "src" / "components" / "PitchCanvas.tsx"

for path in (online_path, pitch_path):
    if not path.exists():
        raise SystemExit(f"Missing required file: {path}")


def patch_pitch(text: str) -> str:
    if "flipVertical?: boolean;" not in text:
        text, count = re.subn(
            r'(\n\s*isVertical\?: boolean;)',
            r'\1\n  /** Rotate the mobile pitch 180° so the local team can always play from the bottom. */\n  flipVertical?: boolean;',
            text,
            count=1,
        )
        if count != 1:
            raise RuntimeError("Could not add flipVertical prop to PitchCanvas")

    has_view_bounds = "viewBounds?:" in text and "function createView" in text and "viewBounds" in text[text.find("function createView"):text.find("function drawPoly") if "function drawPoly" in text else text.find("function drawProjectedLine")]

    if has_view_bounds:
        # Current A9+ camera signature.
        text, count = re.subn(
            r'(function createView\(\s*W: number,\s*H: number,\s*isVertical: boolean,\s*viewBounds\?: \{ minX: number; maxX: number; minY: number; maxY: number \},?\s*)(\): View2_5D \{)',
            r'\1  flipVertical = false,\n\2',
            text,
            count=1,
            flags=re.S,
        )
        if count == 0 and "flipVertical = false" not in text[text.find("function createView"):text.find("function createView")+500]:
            # Formatting variant: add before closing signature by a narrower replacement.
            marker = "  viewBounds?: { minX: number; maxX: number; minY: number; maxY: number },\n): View2_5D {"
            if marker in text:
                text = text.replace(marker, "  viewBounds?: { minX: number; maxX: number; minY: number; maxY: number },\n  flipVertical = false,\n): View2_5D {", 1)
            else:
                raise RuntimeError("Could not extend createView(viewBounds) signature")

        old_base = '''  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? {
          x: p.y,
          y: viewMaxX - p.x,
        }
      : {
          x: p.x,
          y: p.y,
        };'''
        new_base = '''  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? flipVertical
        ? {
            // Full 180° mobile rotation: P2's canonical right half is shown at the bottom.
            x: viewMinY + viewMaxY - p.y,
            y: p.x - viewMinX,
          }
        : {
            x: p.y,
            y: viewMaxX - p.x,
          }
      : {
          x: p.x,
          y: p.y,
        };'''
        if old_base in text:
            text = text.replace(old_base, new_base, 1)
        elif "Full 180° mobile rotation" not in text:
            raise RuntimeError("Could not patch bounded PitchCanvas base projection")

        old_unproject = '''    const pitch = isVertical
      ? {
          x: viewMaxX - by,
          y: bx,
        }
      : {
          x: bx,
          y: by,
        };'''
        new_unproject = '''    const pitch = isVertical
      ? flipVertical
        ? {
            x: viewMinX + by,
            y: viewMinY + viewMaxY - bx,
          }
        : {
            x: viewMaxX - by,
            y: bx,
          }
      : {
          x: bx,
          y: by,
        };'''
        if old_unproject in text:
            text = text.replace(old_unproject, new_unproject, 1)
        elif "x: viewMinX + by" not in text:
            raise RuntimeError("Could not patch bounded PitchCanvas unprojection")

        # Both draw and touch conversion must share exactly the same view transform.
        text = text.replace(
            "createView(canvas.width, canvas.height, isVertical, viewBounds).unproject({",
            "createView(canvas.width, canvas.height, isVertical, viewBounds, flipVertical).unproject({",
        )
        text = text.replace(
            "const view = createView(W, H, isVertical, viewBounds);",
            "const view = createView(W, H, isVertical, viewBounds, flipVertical);",
        )
        text = text.replace("    [isVertical, viewBounds],", "    [isVertical, viewBounds, flipVertical],")
    else:
        # Older top-down camera signature.
        old_sig = "function createView(W: number, H: number, isVertical: boolean): View2_5D {"
        if old_sig in text:
            text = text.replace(old_sig, "function createView(W: number, H: number, isVertical: boolean, flipVertical = false): View2_5D {", 1)
        elif "function createView(W: number, H: number, isVertical: boolean, flipVertical = false)" not in text:
            raise RuntimeError("Could not extend createView signature")

        old_base = '''  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? {
          x: p.y,
          y: PITCH_WIDTH - p.x,
        }
      : {
          x: p.x,
          y: p.y,
        };'''
        new_base = '''  const base = (p: Vec2): ScreenPoint =>
    isVertical
      ? flipVertical
        ? {
            // Full 180° mobile rotation: P2's canonical right half is shown at the bottom.
            x: PITCH_HEIGHT - p.y,
            y: p.x,
          }
        : {
            x: p.y,
            y: PITCH_WIDTH - p.x,
          }
      : {
          x: p.x,
          y: p.y,
        };'''
        if old_base in text:
            text = text.replace(old_base, new_base, 1)
        elif "Full 180° mobile rotation" not in text:
            raise RuntimeError("Could not patch PitchCanvas base projection")

        old_unproject = '''    const pitch = isVertical
      ? {
          x: PITCH_WIDTH - by,
          y: bx,
        }
      : {
          x: bx,
          y: by,
        };'''
        new_unproject = '''    const pitch = isVertical
      ? flipVertical
        ? {
            x: by,
            y: PITCH_HEIGHT - bx,
          }
        : {
            x: PITCH_WIDTH - by,
            y: bx,
          }
      : {
          x: bx,
          y: by,
        };'''
        if old_unproject in text:
            text = text.replace(old_unproject, new_unproject, 1)
        elif "y: PITCH_HEIGHT - bx" not in text:
            raise RuntimeError("Could not patch PitchCanvas unprojection")

        text = text.replace(
            "createView(canvas.width, canvas.height, isVertical).unproject({",
            "createView(canvas.width, canvas.height, isVertical, flipVertical).unproject({",
        )
        text = text.replace(
            "const view = createView(W, H, isVertical);",
            "const view = createView(W, H, isVertical, flipVertical);",
        )
        text = text.replace("    [isVertical],", "    [isVertical, flipVertical],")

    if "flipVertical = false," not in text[text.find("export default function PitchCanvas"):text.find("export default function PitchCanvas")+1800]:
        text, count = re.subn(
            r'(\n\s*isVertical = false,)',
            r'\1\n  flipVertical = false,',
            text,
            count=1,
        )
        if count != 1:
            raise RuntimeError("Could not destructure flipVertical in PitchCanvas")

    # Keep the render effect responsive if orientation ever changes without remounting.
    # Insert immediately after an isVertical dependency when not already present nearby.
    dep_anchor = "    isVertical,\n"
    if "    flipVertical,\n" not in text and dep_anchor in text:
        # There may be one effect dependency list plus callbacks; the callback-specific
        # dependency was already handled above. Insert into the large draw effect only once.
        idx = text.rfind(dep_anchor)
        if idx != -1:
            text = text[:idx+len(dep_anchor)] + "    flipVertical,\n" + text[idx+len(dep_anchor):]

    return text


def patch_online(text: str) -> str:
    # Replace the old persistence of the goal-frame with a real post-goal kickoff reset.
    start = text.find("  const finishSimulation = useCallback((lastFrame: FrameSnapshot, goalsDelta: { p1: number; p2: number }) => {")
    if start == -1:
        if "FTA_ONLINE_GOAL_RESET_V1" not in text:
            raise RuntimeError("Could not locate OnlineMatch finishSimulation")
    else:
        end_marker = "  const playbackFrames = useCallback(("
        end = text.find(end_marker, start)
        if end == -1:
            raise RuntimeError("Could not locate end of OnlineMatch finishSimulation")
        old_block = text[start:end]
        if "FTA_ONLINE_GOAL_RESET_V1" not in old_block:
            new_block = '''  // FTA_ONLINE_GOAL_RESET_V1
  // Online matches use one canonical simulation for both clients. After a goal,
  // immediately restore the saved formation positions and give the restart to the
  // conceding goalkeeper. This prevents a ball left inside the net from being
  // counted again at the start of the following turn.
  const finishSimulation = useCallback((lastFrame: FrameSnapshot, goalsDelta: { p1: number; p2: number }) => {
    const goalScored = goalsDelta.p1 > 0 || goalsDelta.p2 > 0;

    const newPlayers = playersRef.current.map((p) => {
      const fp = lastFrame.players.find((f) => f.id === p.id);
      const resetPosition = goalScored
        ? { ...p.startPosition }
        : fp
          ? { ...fp.position }
          : { ...p.position };

      return {
        ...p,
        position: resetPosition,
        velocity: { x: 0, y: 0 },
        state: "IDLE" as SimPlayer["state"],
        command: null,
        commandExecuted: false,
      };
    });

    let newBall: SimBall;
    if (goalScored) {
      const scoringTeamId: "player" | "ai" = goalsDelta.p1 > 0 ? "player" : "ai";
      const concedingTeamId: "player" | "ai" = scoringTeamId === "player" ? "ai" : "player";
      const concedingKeeper =
        newPlayers.find((p) => p.teamId === concedingTeamId && p.role === "goalkeeper") ??
        newPlayers.find((p) => p.teamId === concedingTeamId);

      newBall = concedingKeeper
        ? {
            position: { ...concedingKeeper.position },
            velocity: { x: 0, y: 0 },
            ownerId: concedingKeeper.id,
            height: 0,
          }
        : {
            position: { x: PITCH_WIDTH / 2, y: PITCH_HEIGHT / 2 },
            velocity: { x: 0, y: 0 },
            ownerId: null,
            height: 0,
          };
    } else {
      newBall = {
        ...ballRef.current,
        position: { ...lastFrame.ball.position },
        velocity: { x: 0, y: 0 },
        ownerId: lastFrame.ball.ownerId,
        height: 0,
        passStyle: undefined,
        passStart: undefined,
      };
    }

    setPlayers(newPlayers);
    playersRef.current = newPlayers;
    setBall(newBall);
    ballRef.current = newBall;

    // Stop rendering the final goal frame during the next planning phase.
    // The fallback planning frame is rebuilt from the reset players/ball above.
    setCurrentFrame(null);

    getSocket().emit("turn:ready", { goalsDelta });
    setPendingCommands(new Map());
    setOpponentSubmitted(false);
  }, []);

'''
            text = text[:start] + new_block + text[end:]

    # P1 is canonical "player" and P2 canonical "ai". Keep colors tied to those
    # canonical IDs, then rotate only P2's mobile camera instead of swapping data.
    old_colors = '''          playerTeam={{ jerseyColor: myTeam.jerseyColor, secondaryColor: myTeam.secondaryColor } as any}
          aiTeamColor={oppTeam.jerseyColor}
          aiTeamSecondaryColor={oppTeam.secondaryColor}'''
    new_colors = '''          playerTeam={{ jerseyColor: p1Team.jerseyColor, secondaryColor: p1Team.secondaryColor } as any}
          aiTeamColor={p2Team.jerseyColor}
          aiTeamSecondaryColor={p2Team.secondaryColor}'''
    if old_colors in text:
        text = text.replace(old_colors, new_colors, 1)

    # Add camera flip immediately after the mobile vertical-mode prop.
    if "flipVertical={isMobile && myRole === \"p2\"}" not in text:
        marker = "          isVertical={isMobile}\n"
        if marker not in text:
            raise RuntimeError("Could not locate OnlineMatch PitchCanvas isVertical prop")
        text = text.replace(
            marker,
            marker + '          flipVertical={isMobile && myRole === "p2"}\n',
            1,
        )

    return text


pitch_original = pitch_path.read_text()
online_original = online_path.read_text()

pitch_new = patch_pitch(pitch_original)
online_new = patch_online(online_original)

pitch_path.write_text(pitch_new)
online_path.write_text(online_new)

print("Patched:")
print(f"  {pitch_path.relative_to(ROOT) if pitch_path.is_relative_to(ROOT) else pitch_path}")
print(f"  {online_path.relative_to(ROOT) if online_path.is_relative_to(ROOT) else online_path}")
