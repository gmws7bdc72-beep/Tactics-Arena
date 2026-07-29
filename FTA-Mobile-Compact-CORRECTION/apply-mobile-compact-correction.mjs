import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "artifacts/fta-game";
const files = {
  pitch: path.join(root, "src/components/PitchCanvas.tsx"),
  pad: path.join(root, "src/components/MechanicPad.tsx"),
  curve: path.join(root, "src/hooks/useCurvePlanner.ts"),
};

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, text) { fs.writeFileSync(file, text); }
function mustReplace(text, regex, replacement, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected 1 match, found ${matches.length}`);
  }
  return text.replace(regex, replacement);
}

// 1) Truly straight top-down mobile projection. Desktop values remain untouched.
{
  let text = read(files.pitch);
  text = mustReplace(
    text,
    /const\s+CAMERA_ZOOM\s*=\s*isVertical\s*\?\s*[0-9.]+\s*:\s*([0-9.]+)\s*;/,
    (_m, desktop) => `const CAMERA_ZOOM = isVertical ? 1.0 : ${desktop};`,
    "mobile camera zoom"
  );
  text = mustReplace(
    text,
    /const\s+CAMERA_SHIFT_Y\s*=\s*isVertical\s*\?\s*[-0-9.]+\s*:\s*([-0-9.]+)\s*;/,
    (_m, desktop) => `const CAMERA_SHIFT_Y = isVertical ? 0 : ${desktop};`,
    "mobile camera vertical shift"
  );
  text = mustReplace(
    text,
    /const\s+skew\s*=\s*isVertical\s*\?\s*[-0-9.]+\s*:\s*([-0-9.]+)\s*;/,
    (_m, desktop) => `const skew = isVertical ? 0 : ${desktop};`,
    "mobile camera skew"
  );
  text = mustReplace(
    text,
    /const\s+squash\s*=\s*isVertical\s*\?\s*[-0-9.]+\s*:\s*([-0-9.]+)\s*;/,
    (_m, desktop) => `const squash = isVertical ? 1 : ${desktop};`,
    "mobile camera squash"
  );
  text = text.replace(
    /\/\/\s*Mobile football angle:[^\n]*/,
    "// Mobile: exact straight top-down projection. Desktop keeps its angled projection."
  );
  write(files.pitch, text);
}

// 2) Remove the dribble-route speed rejection completely, while keeping curve-point limits.
{
  let text = read(files.curve);
  const limiter = /\n\s*if\s*\(\s*baseCommand\.type\s*===\s*CommandType\.MOVE[\s\S]*?setError\(\s*["']That dribble curve is too long for this player['’]s speed\.["']\s*\);\s*return false;\s*\}\s*/;
  const count = [...text.matchAll(new RegExp(limiter.source, "g"))].length;
  if (count === 1) {
    text = text.replace(limiter, "\n");
  } else if (count === 0 && !text.includes("That dribble curve is too long for this player's speed.")) {
    console.log("Dribble limiter already absent; leaving it absent.");
  } else {
    throw new Error(`dribble curve limiter: expected 1 removable block, found ${count}`);
  }
  if (text.includes("That dribble curve is too long for this player's speed.")) {
    throw new Error("dribble curve limiter text still exists after patch");
  }
  write(files.curve, text);
}

// 3) Compact combo label: no long sentence inside the pad.
{
  let text = read(files.pad);
  const longBlock = /<span\s+className="block">Move \+ Pass<\/span>\s*<span\s+className="block text-\[8px\] sm:text-\[9px\] font-semibold opacity-75">\s*Hold: Pass \+ Move\s*<\/span>/;
  const compact = `<span className="block whitespace-nowrap text-sm sm:text-base">\n          {holdingCombo ? "P → M" : "M → P"}\n        </span>`;
  if (longBlock.test(text)) {
    text = text.replace(longBlock, compact);
  } else if (!text.includes('{holdingCombo ? "P → M" : "M → P"}')) {
    // Handle spacing/class changes from the earlier installer.
    const fallback = /<span[^>]*>\s*Move \+ Pass\s*<\/span>[\s\S]{0,220}?<span[^>]*>\s*Hold:\s*Pass \+ Move\s*<\/span>/;
    text = mustReplace(text, fallback, compact, "compact Move/Pass label");
  }
  text = text.replace(
    /title="Tap for Move → Pass\. Hold for Pass → Move\."/,
    'title="Tap: Move → Pass. Hold: Pass → Move." aria-label="Move then Pass; hold for Pass then Move"'
  );
  write(files.pad, text);
}

console.log("Applied corrections:");
console.log("- exact straight top-down mobile camera (skew 0, squash 1)");
console.log("- dribble curve speed limiter removed");
console.log("- combo pad label shortened to M → P / P → M");
