import fs from "node:fs";
import path from "node:path";

const game = path.resolve("artifacts/fta-game");
const files = [
  path.join(game, "src/pages/Match.tsx"),
  path.join(game, "src/pages/OnlineMatch.tsx"),
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

  const source = fs.readFileSync(file, "utf8");
  const target = "const PLAYBACK_FPS = 48;";

  if (source.includes(target)) {
    console.log(`Already adjusted: ${path.relative(game, file)}`);
    continue;
  }

  const candidates = [
    "const PLAYBACK_FPS = 54;",
    "const PLAYBACK_FPS = 60;",
  ];
  const found = candidates.filter((value) => source.includes(value));

  if (found.length !== 1) {
    throw new Error(
      `${path.relative(game, file)}: expected PLAYBACK_FPS to be 54 or 60, found ${found.length} recognized declarations`,
    );
  }

  fs.writeFileSync(file, source.replace(found[0], target));
  console.log(`Set balanced playback speed: ${path.relative(game, file)}`);
}
