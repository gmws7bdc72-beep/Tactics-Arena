import fs from "node:fs";
import path from "node:path";

const target = path.resolve("artifacts/fta-game/src/components/PitchCanvas.tsx");
const marker = "FTA_PLAYER_ANIMATION_RESTORED_FINAL";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) {
  fail(`missing ${target}. Run this from the repository root.`);
}

let src = fs.readFileSync(target, "utf8");

if (src.includes(marker)) {
  console.log("Animated 2.5D players are already restored.");
  process.exit(0);
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

function requireOnce(text, needle, label) {
  const found = count(text, needle);
  if (found !== 1) {
    fail(`${label}: expected exactly 1 match, found ${found}`);
  }
}

function replaceOnce(text, needle, replacement, label) {
  requireOnce(text, needle, label);
  return text.replace(needle, replacement);
}

// 1) React import: tolerate reordered hook names and existing useState.
const importMatch = src.match(/^import \{([^}]+)\} from "react";/m);
if (!importMatch) fail("could not find the React named import");

const hooks = importMatch[1]
  .split(",")
  .map((part) => part.trim())
  .filter(Boolean);

if (!hooks.includes("useState")) hooks.push("useState");

const newImport = `import { ${hooks.join(", ")} } from "react";`;
src = src.replace(importMatch[0], newImport);

// 2) Add one animation clock after the canvas ref.
const canvasRefLine =
  '  const canvasRef = useRef<HTMLCanvasElement>(null);';

src = replaceOnce(
  src,
  canvasRefLine,
  `${canvasRefLine}
  // ${marker}
  // Redraw the canvas at 30 FPS so the stylized 2.5D bodies remain animated.
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let previousTime = 0;

    const animate = (time: number) => {
      if (time - previousTime >= 33) {
        previousTime = time;
        setAnimationTick((tick) => (tick + 1) % 100000);
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);`,
  "canvas animation clock insertion",
);

// 3) Isolate the rendered-player block structurally instead of guessing whitespace.
const playersAnchor = "    const players = [...frame.players].sort(";
const ballAnchor =
  "    const visualBall = frame.ball as typeof frame.ball & {";

requireOnce(src, playersAnchor, "rendered players anchor");
requireOnce(src, ballAnchor, "visual ball anchor");

const playersStart = src.indexOf(playersAnchor);
const ballStart = src.indexOf(ballAnchor);

if (playersStart < 0 || ballStart <= playersStart) {
  fail("rendered-player block boundaries are invalid");
}

let prefix = src.slice(0, playersStart);
let playerBlock = src.slice(playersStart, ballStart);
let suffix = src.slice(ballStart);

// Only alter the visual render loop, never the occupancy/click loops.
const plainLoop = "    for (const p of players) {";
const indexedLoop =
  "    for (const [playerIndex, p] of players.entries()) {";

if (playerBlock.includes(plainLoop)) {
  playerBlock = replaceOnce(
    playerBlock,
    plainLoop,
    indexedLoop,
    "rendered player loop",
  );
} else if (!playerBlock.includes(indexedLoop)) {
  fail("could not identify the rendered player loop");
}

// 4) Add animation values immediately after the unique head-radius line.
const headLine = "      const headR = r * 0.42;";

playerBlock = replaceOnce(
  playerBlock,
  headLine,
  `${headLine}

      const gait = Math.sin(animationTick * 0.26 + playerIndex * 0.9);
      const idle = Math.sin(animationTick * 0.08 + playerIndex * 0.7);
      const isRunning = phase === "simulating";
      const bob = isRunning
        ? Math.abs(gait) * r * 0.13
        : idle * r * 0.035;
      const legSwing = isRunning ? gait * r * 0.52 : 0;
      const armSwing = isRunning ? -gait * r * 0.42 : idle * r * 0.04;
      const drawPos = {
        x: pos.x,
        y: pos.y - bob,
      };`,
  "player animation values",
);

// Change only drawing coordinates after drawPos is defined.
// This avoids self-referencing drawPos and leaves physics positions untouched.
const drawPosDeclarationEnd = playerBlock.indexOf("      };", playerBlock.indexOf("      const drawPos = {"));
if (drawPosDeclarationEnd < 0) fail("drawPos declaration end was not found");

const beforeDrawing = playerBlock.slice(0, drawPosDeclarationEnd + "      };".length);
let drawing = playerBlock.slice(drawPosDeclarationEnd + "      };".length);
drawing = drawing.replaceAll("pos.", "drawPos.");

// Add alternating limb motion using exact lines that exist in the visual block.
drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x - bodyW * 0.48, drawPos.y + r * 0.95);",
  `      ctx.lineTo(
        drawPos.x - bodyW * 0.48 + legSwing,
        drawPos.y + r * 0.95,
      );`,
  "left leg animation",
);

drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x + bodyW * 0.42, drawPos.y + r * 0.98);",
  `      ctx.lineTo(
        drawPos.x + bodyW * 0.42 - legSwing,
        drawPos.y + r * 0.98,
      );`,
  "right leg animation",
);

drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x - bodyW * 0.72, drawPos.y + r * 1);",
  `      ctx.lineTo(
        drawPos.x - bodyW * 0.72 + legSwing,
        drawPos.y + r * 1,
      );`,
  "left boot animation",
);

drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x + bodyW * 0.66, drawPos.y + r * 1);",
  `      ctx.lineTo(
        drawPos.x + bodyW * 0.66 - legSwing,
        drawPos.y + r * 1,
      );`,
  "right boot animation",
);

drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x - bodyW * 0.76, torsoY + bodyH * 0.38);",
  `      ctx.lineTo(
        drawPos.x - bodyW * 0.76 + armSwing,
        torsoY + bodyH * 0.38,
      );`,
  "left arm animation",
);

drawing = replaceOnce(
  drawing,
  "      ctx.lineTo(drawPos.x + bodyW * 0.75, torsoY + bodyH * 0.36);",
  `      ctx.lineTo(
        drawPos.x + bodyW * 0.75 - armSwing,
        torsoY + bodyH * 0.36,
      );`,
  "right arm animation",
);

playerBlock = beforeDrawing + drawing;
src = prefix + playerBlock + suffix;

// 5) Add animationTick to the draw effect dependencies.
// Scope the search to the section before handleClick to avoid touching another hook.
const handleClickAnchor = "  const handleClick = useCallback(";
requireOnce(src, handleClickAnchor, "handleClick anchor");

const handleClickIndex = src.indexOf(handleClickAnchor);
let drawSection = src.slice(0, handleClickIndex);
const afterDrawSection = src.slice(handleClickIndex);

const dependencyNeedle = "    buildTileMap,\n  ]);";
drawSection = replaceOnce(
  drawSection,
  dependencyNeedle,
  "    buildTileMap,\n    animationTick,\n  ]);",
  "draw effect dependency",
);

src = drawSection + afterDrawSection;

// Final safety checks before writing.
const required = [
  marker,
  "const [animationTick, setAnimationTick] = useState(0);",
  "for (const [playerIndex, p] of players.entries())",
  "const drawPos = {",
  "animationTick,",
];

for (const item of required) {
  if (!src.includes(item)) fail(`verification failed: missing ${item}`);
}

if (src.includes("for (const [playerIndex, p] of frame.players.entries())")) {
  fail("verification failed: a non-render player loop was modified");
}

fs.writeFileSync(target, src);
console.log("SUCCESS: restored animated 2.5D players.");
console.log("Verified: idle bob, running arms/legs, 30 FPS redraw, physics untouched.");
console.log(`Changed: ${path.relative(process.cwd(), target)}`);
