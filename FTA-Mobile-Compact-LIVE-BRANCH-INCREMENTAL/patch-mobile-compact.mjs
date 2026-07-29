import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('ERROR: missing src path');
  process.exit(1);
}

function replaceOnce(file, oldText, newText, label) {
  const text = fs.readFileSync(file, 'utf8');
  const first = text.indexOf(oldText);
  const second = first === -1 ? -1 : text.indexOf(oldText, first + oldText.length);
  const count = first === -1 ? 0 : second === -1 ? 1 : 2;
  if (count !== 1) {
    console.error(`ERROR: ${label}: expected 1 exact match in ${file}, found ${count}${second !== -1 ? '+' : ''}`);
    process.exit(1);
  }
  fs.writeFileSync(file, text.slice(0, first) + newText + text.slice(first + oldText.length));
  console.log(`patched: ${label}`);
}

const pitch = path.join(src, 'components/PitchCanvas.tsx');
replaceOnce(
  pitch,
`  // Slightly zoomed out from the previous version.
  // Still angled, but not so close that the outside breaks.
  const CAMERA_ZOOM = isVertical ? 1.12 : 1.08;
  const CAMERA_SHIFT_X = 0;
  const CAMERA_SHIFT_Y = isVertical ? 0.015 : 0.015;

  // Mobile football angle: mostly top-down, slightly rotated.
  const skew = isVertical ? 0.16 : 0.13;
  const squash = isVertical ? 0.9 : 0.88;`,
`  // Mobile is a fixed, straight top-down view. Desktop keeps the angled presentation.
  const CAMERA_ZOOM = isVertical ? 1.0 : 1.08;
  const CAMERA_SHIFT_X = 0;
  const CAMERA_SHIFT_Y = isVertical ? 0 : 0.015;
  const skew = isVertical ? 0 : 0.13;
  const squash = isVertical ? 1 : 0.88;`,
  'fixed straight top-down mobile camera'
);
replaceOnce(
  pitch,
  '      className="w-full h-full cursor-pointer rounded-lg"',
  '      className="w-full h-full cursor-pointer rounded-none sm:rounded-lg"',
  'remove mobile pitch corner waste'
);

const planner = path.join(src, 'hooks/useCurvePlanner.ts');
replaceOnce(
  planner,
`  curvePointLimitForMechanic,
  curveRouteFitsMoveBudget,
  sanitizeCurvePoints,`,
`  curvePointLimitForMechanic,
  sanitizeCurvePoints,`,
  'remove unused dribble-budget warning import'
);
replaceOnce(
  planner,
`    if (
      baseCommand.type === CommandType.MOVE &&
      baseCommand.targetPosition &&
      !curveRouteFitsMoveBudget(
        selectedPlayer.position,
        cleanControls,
        baseCommand.targetPosition,
        selectedPlayer.stats.speed,
      )
    ) {
      setError("That dribble curve is too long for this player's speed.");
      return false;
    }
`,
  '',
  'remove dribble curve too-long rejection'
);

const match = path.join(src, 'pages/Match.tsx');
replaceOnce(match,
  'className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"',
  'className="flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2.5 flex-shrink-0"',
  'compact offline match header');
replaceOnce(match,
  '<div className="flex-1 relative" style={{ minHeight: 0, padding: "4px 4px 0" }}>',
  '<div className="flex-1 relative" style={{ minHeight: 0, padding: isMobile ? 0 : "4px 4px 0" }}>',
  'maximize offline mobile pitch');
replaceOnce(match,
`className="flex-shrink-0"
        style={{
          background: "rgba(0,0,0,0.62)",`,
`className="flex-shrink-0 text-[11px] sm:text-sm"
        style={{
          background: "rgba(0,0,0,0.62)",`,
  'compact offline control shell');
replaceOnce(match,
  'className="flex gap-2 px-4 pt-2.5"',
  'className="flex gap-1.5 px-2 sm:px-4 pt-1.5 sm:pt-2.5"',
  'compact offline combo banner');

const online = path.join(src, 'pages/OnlineMatch.tsx');
replaceOnce(online,
  'className="flex items-center justify-between px-3 py-2 flex-shrink-0"',
  'className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0"',
  'compact online match header');
replaceOnce(online,
  '<div className="flex-1 flex flex-col items-center justify-center overflow-hidden">',
  '<div className="flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden">',
  'protect online pitch height');
replaceOnce(online,
  'className="flex-shrink-0 px-2 pt-2"',
  'className="flex-shrink-0 px-1.5 sm:px-2 pt-1 sm:pt-2 text-[11px] sm:text-sm"',
  'compact online action shell');
replaceOnce(online,
  '<p className="text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>',
  '<p className="hidden sm:block text-center text-xs mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>',
  'hide redundant tall hint block on mobile');

console.log('All live-branch mobile compact changes applied.');
