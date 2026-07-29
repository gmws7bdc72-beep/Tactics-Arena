import fs from "node:fs";
import path from "node:path";

const file = path.resolve("artifacts/fta-game/src/components/PitchCanvas.tsx");

if (!fs.existsSync(file)) {
  console.error(`ERROR: missing ${file}`);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

function replaceOnce(label, pattern, replacement) {
  const matches = [...src.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, found ${matches.length}`);
  }
  src = src.replace(pattern, replacement);
}

if (src.includes("FTA_PLAYER_ANIMATION_RESTORED")) {
  console.log("Animated 2.5D players are already restored.");
  process.exit(0);
}

replaceOnce(
  "React useState import",
  /import \{ useRef, useEffect, useCallback \} from "react";/,
  'import { useRef, useEffect, useCallback, useState } from "react";',
);

replaceOnce(
  "animation clock",
  /(\}: Props\) \{\n\s*const canvasRef = useRef<HTMLCanvasElement>\(null\);)/,
  `$1
  // FTA_PLAYER_ANIMATION_RESTORED
  // Keep the canvas alive even while the match frame is not changing.
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;

    const animate = (time: number) => {
      // Roughly 30 FPS is enough for the stylized 2.5D characters.
      if (time - last >= 33) {
        last = time;
        setAnimationTick((tick) => (tick + 1) % 100000);
      }
      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);`,
);

replaceOnce(
  "indexed player loop",
  /for \(const p of players\) \{/,
  "for (const [playerIndex, p] of players.entries()) {",
);

replaceOnce(
  "animation values",
  /(const headR = r \* 0\.42;\n)/,
  `$1
      const gait = Math.sin(animationTick * 0.26 + playerIndex * 0.9);
      const idle = Math.sin(animationTick * 0.08 + playerIndex * 0.7);
      const isRunning = phase === "simulating";
      const bob = isRunning
        ? Math.abs(gait) * r * 0.13
        : idle * r * 0.035;
      const legSwing = isRunning ? gait * r * 0.52 : 0;
      const armSwing = isRunning ? -gait * r * 0.42 : idle * r * 0.04;

      // One outer transform keeps the whole 2.5D character together.
      ctx.save();
      ctx.translate(0, -bob);
`,
);

replaceOnce(
  "animated legs",
  /ctx\.moveTo\(pos\.x - bodyW \* 0\.22, pos\.y \+ r \* 0\.45\);\n\s*ctx\.lineTo\(pos\.x - bodyW \* 0\.48, pos\.y \+ r \* 0\.95\);\n\s*ctx\.moveTo\(pos\.x \+ bodyW \* 0\.22, pos\.y \+ r \* 0\.45\);\n\s*ctx\.lineTo\(pos\.x \+ bodyW \* 0\.42, pos\.y \+ r \* 0\.98\);/,
  `ctx.moveTo(pos.x - bodyW * 0.22, pos.y + r * 0.45);
      ctx.lineTo(
        pos.x - bodyW * 0.48 + legSwing,
        pos.y + r * 0.95,
      );
      ctx.moveTo(pos.x + bodyW * 0.22, pos.y + r * 0.45);
      ctx.lineTo(
        pos.x + bodyW * 0.42 - legSwing,
        pos.y + r * 0.98,
      );`,
);

replaceOnce(
  "animated boots",
  /ctx\.moveTo\(pos\.x - bodyW \* 0\.48, pos\.y \+ r \* 0\.95\);\n\s*ctx\.lineTo\(pos\.x - bodyW \* 0\.72, pos\.y \+ r \* 1\);\n\s*ctx\.moveTo\(pos\.x \+ bodyW \* 0\.42, pos\.y \+ r \* 0\.98\);\n\s*ctx\.lineTo\(pos\.x \+ bodyW \* 0\.66, pos\.y \+ r \* 1\);/,
  `ctx.moveTo(
        pos.x - bodyW * 0.48 + legSwing,
        pos.y + r * 0.95,
      );
      ctx.lineTo(
        pos.x - bodyW * 0.72 + legSwing,
        pos.y + r * 1,
      );
      ctx.moveTo(
        pos.x + bodyW * 0.42 - legSwing,
        pos.y + r * 0.98,
      );
      ctx.lineTo(
        pos.x + bodyW * 0.66 - legSwing,
        pos.y + r * 1,
      );`,
);

replaceOnce(
  "animated arms",
  /ctx\.moveTo\(pos\.x - bodyW \* 0\.46, torsoY \+ bodyH \* 0\.12\);\n\s*ctx\.lineTo\(pos\.x - bodyW \* 0\.76, torsoY \+ bodyH \* 0\.38\);\n\s*ctx\.moveTo\(pos\.x \+ bodyW \* 0\.46, torsoY \+ bodyH \* 0\.12\);\n\s*ctx\.lineTo\(pos\.x \+ bodyW \* 0\.75, torsoY \+ bodyH \* 0\.36\);/,
  `ctx.moveTo(pos.x - bodyW * 0.46, torsoY + bodyH * 0.12);
      ctx.lineTo(
        pos.x - bodyW * 0.76 + armSwing,
        torsoY + bodyH * 0.38,
      );
      ctx.moveTo(pos.x + bodyW * 0.46, torsoY + bodyH * 0.12);
      ctx.lineTo(
        pos.x + bodyW * 0.75 - armSwing,
        torsoY + bodyH * 0.36,
      );`,
);

replaceOnce(
  "outer character restore",
  /\n    \}\n    const visualBall = frame\.ball as typeof frame\.ball & \{/,
  `
      ctx.restore();
    }
    const visualBall = frame.ball as typeof frame.ball & {`,
);

replaceOnce(
  "animation dependency",
  /(\s*buildTileMap,\n\s*\]\);)/,
  `    buildTileMap,
    animationTick,
  ]);`,
);

fs.writeFileSync(file, src);
console.log("SUCCESS: restored animated 2.5D canvas players.");
console.log("Changed: artifacts/fta-game/src/components/PitchCanvas.tsx");
