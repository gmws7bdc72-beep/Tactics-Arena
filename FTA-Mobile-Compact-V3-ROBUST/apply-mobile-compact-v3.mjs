import fs from "node:fs";

const pitchPath = "artifacts/fta-game/src/components/PitchCanvas.tsx";
const padPath = "artifacts/fta-game/src/components/MechanicPad.tsx";
const curvePath = "artifacts/fta-game/src/hooks/useCurvePlanner.ts";

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceDeclaration(text, name, mobileValue) {
  const re = new RegExp(`(const\\s+${name}\\s*=\\s*isVertical\\s*\\?\\s*)([^:;]+)(\\s*:\\s*[^;]+;)`);
  if (!re.test(text)) throw new Error(`Could not locate ${name} declaration`);
  return text.replace(re, `$1${mobileValue}$3`);
}

// 1) True mobile top-down projection. Desktop values are preserved.
let pitch = read(pitchPath);
pitch = replaceDeclaration(pitch, "CAMERA_ZOOM", "1.0");
pitch = replaceDeclaration(pitch, "CAMERA_SHIFT_Y", "0");
pitch = replaceDeclaration(pitch, "skew", "0");
pitch = replaceDeclaration(pitch, "squash", "1");
if (!pitch.includes("FTA_MOBILE_TOP_DOWN_V3")) {
  pitch = pitch.replace(
    /(function createView\([^\n]+\{\n)/,
    `$1  // FTA_MOBILE_TOP_DOWN_V3: mobile uses a straight orthographic top-down pitch.\n`,
  );
}
write(pitchPath, pitch);

// 2) Remove the dribble route-length/speed rejection, no matter its spacing.
let curve = read(curvePath);
curve = curve.replace(/^\s*curveRouteFitsMoveBudget,\s*\n/m, "");
const lines = curve.split("\n");
let functionLine = lines.findIndex((line) => line.includes("curveRouteFitsMoveBudget("));
if (functionLine !== -1) {
  let start = functionLine;
  while (start >= 0 && !/^\s*if\s*\(/.test(lines[start])) start--;
  if (start < 0) throw new Error("Found curveRouteFitsMoveBudget but could not find its if block");
  let depth = 0;
  let opened = false;
  let end = start;
  for (; end < lines.length; end++) {
    for (const ch of lines[end]) {
      if (ch === "{") { depth++; opened = true; }
      if (ch === "}") depth--;
    }
    if (opened && depth === 0) break;
  }
  if (!opened || end >= lines.length) throw new Error("Could not determine limiter block boundaries");
  lines.splice(start, end - start + 1);
  curve = lines.join("\n");
}
// Also remove the exact warning if an earlier partial patch left a variant block.
curve = curve.replace(/^.*dribble curve is too long.*\n?/gim, "");
write(curvePath, curve);

// 3) Replace the combo button body itself, rather than matching old label text.
let pad = read(padPath);
const titleNeedles = [
  'title="Tap for Move → Pass. Hold for Pass → Move."',
  'title="Tap for Move + Pass. Hold for Pass + Move."',
];
let titleIndex = -1;
for (const needle of titleNeedles) {
  titleIndex = pad.indexOf(needle);
  if (titleIndex !== -1) break;
}
if (titleIndex === -1) {
  // Fallback: identify the combo button by its movePass pointer handler.
  titleIndex = pad.indexOf('handlePointerDown(event, "movePass")');
}
if (titleIndex === -1) throw new Error("Could not locate the Move/Pass combo button");
const buttonStart = pad.lastIndexOf("<button", titleIndex);
const openEnd = pad.indexOf(">", titleIndex);
const closeStart = pad.indexOf("</button>", openEnd);
if (buttonStart === -1 || openEnd === -1 || closeStart === -1) {
  throw new Error("Could not locate combo button boundaries");
}
const compactBody = `\n          <span className="block text-sm font-black tracking-tight">\n            {holdingCombo ? "P→M" : "M→P"}\n          </span>\n        `;
pad = pad.slice(0, openEnd + 1) + compactBody + pad.slice(closeStart);
write(padPath, pad);

// Final assertions: fail only if the desired final state is not present.
const finalPitch = read(pitchPath);
const finalCurve = read(curvePath);
const finalPad = read(padPath);
const checks = [
  [finalPitch.includes("FTA_MOBILE_TOP_DOWN_V3"), "camera marker"],
  [/const CAMERA_ZOOM = isVertical \? 1\.0\s*:/.test(finalPitch), "mobile zoom 1.0"],
  [/const CAMERA_SHIFT_Y = isVertical \? 0\s*:/.test(finalPitch), "mobile vertical shift 0"],
  [/const skew = isVertical \? 0\s*:/.test(finalPitch), "mobile skew 0"],
  [/const squash = isVertical \? 1\s*:/.test(finalPitch), "mobile squash 1"],
  [!finalCurve.includes("curveRouteFitsMoveBudget"), "dribble speed limiter removed"],
  [!finalCurve.toLowerCase().includes("dribble curve is too long"), "limiter warning removed"],
  [finalPad.includes('{holdingCombo ? "P→M" : "M→P"}'), "compact combo label"],
];
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Verification failed: ${label}`);
  console.log(`OK: ${label}`);
}
