import fs from "node:fs";
import path from "node:path";

const game = path.resolve("artifacts/fta-game");
const files = [
  path.join(game, "src/pages/Match.tsx"),
  path.join(game, "src/pages/OnlineMatch.tsx"),
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }

  const source = fs.readFileSync(file, "utf8");
  const current = "const PLAYBACK_FPS = 60;";
  const alreadyPatched = "const PLAYBACK_FPS = 54;";

  if (source.includes(alreadyPatched)) {
    console.log(`Already adjusted: ${path.relative(game, file)}`);
    continue;
  }

  const count = source.split(current).length - 1;
  if (count !== 1) {
    throw new Error(
      `${path.relative(game, file)}: expected one PLAYBACK_FPS = 60 declaration, found ${count}`,
    );
  }

  fs.writeFileSync(file, source.replace(current, alreadyPatched));
  console.log(`Slowed playback: ${path.relative(game, file)}`);
}
