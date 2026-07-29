import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const game = path.join(root, "artifacts/fta-game");
const aiFile = path.join(game, "src/engine/ai.ts");
const pages = [
  path.join(game, "src/pages/Match.tsx"),
  path.join(game, "src/pages/OnlineMatch.tsx"),
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

for (const file of [aiFile, ...pages]) {
  if (!fs.existsSync(file)) fail(`missing file: ${file}`);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

try {
  let ai = fs.readFileSync(aiFile, "utf8");

  // Remove every duplicate helper, then install exactly one copy.
  ai = ai.replace(
    /\nfunction aiClamp\(value: number, min: number, max: number\): number \{\n\s*return Math\.max\(min, Math\.min\(max, value\)\);\n\}\n/g,
    "\n",
  );

  const zonalAnchor = "\nfunction zonalBlockTile(";
  const zonalIndex = ai.indexOf(zonalAnchor);
  if (zonalIndex < 0) throw new Error("zonalBlockTile was not found in ai.ts");

  const helper = `
function aiClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
`;
  ai = ai.slice(0, zonalIndex) + helper + ai.slice(zonalIndex);

  if (count(ai, "function aiClamp(") !== 1) {
    throw new Error("aiClamp cleanup did not produce exactly one helper");
  }

  fs.writeFileSync(aiFile, ai);

  for (const file of pages) {
    let src = fs.readFileSync(file, "utf8");

    // Remove every generated goalkeeper selection block from previous attempts.
    src = src.replace(
      /\n\s*const selectedSimPlayer = selectedPlayerId\s*\n\s*\? currentFrame\?\.players\.find\(\(player\) => player\.id === selectedPlayerId\) \?\? null\s*\n\s*: null;\s*\n\s*const goalkeeperCanDive =\s*\n\s*!!selectedSimPlayer &&\s*\n\s*selectedSimPlayer\.role === "goalkeeper" &&\s*\n\s*currentFrame\?\.ball\.ownerId !== selectedSimPlayer\.id;\s*\n\s*const beginGoalkeeperDive = useCallback\(\(\) => \{\s*\n\s*if \(!selectedPlayerId \|\| !goalkeeperCanDive\) return;\s*\n\s*setDiveTargetMode\(true\);\s*\n\s*\}, \[selectedPlayerId, goalkeeperCanDive\]\);\s*\n/g,
      "\n",
    );

    // Collapse accidental duplicate dive state declarations.
    const diveState = '  const [diveTargetMode, setDiveTargetMode] = useState(false);';
    const firstDiveState = src.indexOf(diveState);
    if (firstDiveState < 0) {
      const pendingState = /(^\s*const \[pendingCommands, setPendingCommands\][^;]+;)/m;
      if (!pendingState.test(src)) {
        throw new Error(`pendingCommands state not found in ${path.basename(file)}`);
      }
      src = src.replace(pendingState, `$1\n${diveState}`);
    } else {
      let seen = false;
      src = src
        .split("\n")
        .filter((line) => {
          if (line.trim() !== diveState.trim()) return true;
          if (!seen) {
            seen = true;
            return true;
          }
          return false;
        })
        .join("\n");
    }

    const returnMatches = [...src.matchAll(/\n  return \(/g)];
    if (!returnMatches.length) {
      throw new Error(`component return not found in ${path.basename(file)}`);
    }

    const insertAt = returnMatches[returnMatches.length - 1].index;
    const cleanBlock = `
  const selectedSimPlayer = selectedPlayerId
    ? currentFrame?.players.find((player) => player.id === selectedPlayerId) ?? null
    : null;
  const goalkeeperCanDive =
    !!selectedSimPlayer &&
    selectedSimPlayer.role === "goalkeeper" &&
    currentFrame?.ball.ownerId !== selectedSimPlayer.id;

  const beginGoalkeeperDive = useCallback(() => {
    if (!selectedPlayerId || !goalkeeperCanDive) return;
    setDiveTargetMode(true);
  }, [selectedPlayerId, goalkeeperCanDive]);
`;

    src = src.slice(0, insertAt) + cleanBlock + src.slice(insertAt);

    if (count(src, "const selectedSimPlayer =") !== 1) {
      throw new Error(`${path.basename(file)} still has duplicate selectedSimPlayer declarations`);
    }
    if (count(src, "const goalkeeperCanDive =") !== 1) {
      throw new Error(`${path.basename(file)} still has duplicate goalkeeperCanDive declarations`);
    }
    if (count(src, "const beginGoalkeeperDive =") !== 1) {
      throw new Error(`${path.basename(file)} still has duplicate beginGoalkeeperDive declarations`);
    }
    if (count(src, "const [diveTargetMode, setDiveTargetMode]") !== 1) {
      throw new Error(`${path.basename(file)} has an invalid diveTargetMode declaration count`);
    }

    fs.writeFileSync(file, src);
  }

  console.log("SUCCESS: duplicate AI and goalkeeper declarations repaired.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
