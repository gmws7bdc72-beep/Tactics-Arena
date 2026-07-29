import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const game = path.join(root, "artifacts/fta-game");
const targets = [
  path.join(game, "src/pages/Match.tsx"),
  path.join(game, "src/pages/OnlineMatch.tsx"),
  path.join(game, "src/engine/ai.ts"),
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

for (const file of targets) {
  if (!fs.existsSync(file)) fail(`missing file: ${file}`);
}

function removeDuplicateConstStatements(source, variableName) {
  const marker = `const ${variableName}`;
  const occurrences = [];
  let searchFrom = 0;

  while (true) {
    const index = source.indexOf(marker, searchFrom);
    if (index < 0) break;

    // Only accept a declaration boundary, not text inside a longer identifier.
    const before = index > 0 ? source[index - 1] : "";
    if (/[A-Za-z0-9_$]/.test(before)) {
      searchFrom = index + marker.length;
      continue;
    }

    occurrences.push(index);
    searchFrom = index + marker.length;
  }

  if (occurrences.length <= 1) return source;

  // Preserve the first declaration and remove later complete statements.
  for (let occurrence = occurrences.length - 1; occurrence >= 1; occurrence -= 1) {
    const startAtConst = occurrences[occurrence];
    const lineStart = source.lastIndexOf("\n", startAtConst) + 1;

    let i = startAtConst;
    let paren = 0;
    let bracket = 0;
    let brace = 0;
    let quote = null;
    let escaped = false;
    let statementEnd = -1;

    for (; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (ch === "/" && next === "/") {
        const newline = source.indexOf("\n", i + 2);
        i = newline < 0 ? source.length : newline;
        continue;
      }

      if (ch === "/" && next === "*") {
        const endComment = source.indexOf("*/", i + 2);
        i = endComment < 0 ? source.length : endComment + 1;
        continue;
      }

      if (ch === "(") paren += 1;
      else if (ch === ")") paren -= 1;
      else if (ch === "[") bracket += 1;
      else if (ch === "]") bracket -= 1;
      else if (ch === "{") brace += 1;
      else if (ch === "}") brace -= 1;
      else if (ch === ";" && paren === 0 && bracket === 0 && brace === 0) {
        statementEnd = i + 1;
        break;
      }
    }

    if (statementEnd < 0) {
      throw new Error(`could not parse duplicate declaration: ${variableName}`);
    }

    // Consume trailing spaces and one newline.
    while (statementEnd < source.length && /[ \t]/.test(source[statementEnd])) {
      statementEnd += 1;
    }
    if (source[statementEnd] === "\r") statementEnd += 1;
    if (source[statementEnd] === "\n") statementEnd += 1;

    source = source.slice(0, lineStart) + source.slice(statementEnd);
  }

  return source;
}

function findNamedFunctionRanges(source, name) {
  const marker = `function ${name}(`;
  const ranges = [];
  let from = 0;

  while (true) {
    const start = source.indexOf(marker, from);
    if (start < 0) break;

    const braceStart = source.indexOf("{", start + marker.length);
    if (braceStart < 0) throw new Error(`malformed function ${name}`);

    let depth = 0;
    let quote = null;
    let escaped = false;
    let end = -1;

    for (let i = braceStart; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (ch === "/" && next === "/") {
        const newline = source.indexOf("\n", i + 2);
        i = newline < 0 ? source.length : newline;
        continue;
      }

      if (ch === "/" && next === "*") {
        const endComment = source.indexOf("*/", i + 2);
        i = endComment < 0 ? source.length : endComment + 1;
        continue;
      }

      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end < 0) throw new Error(`could not parse function ${name}`);

    while (end < source.length && /[ \t]/.test(source[end])) end += 1;
    if (source[end] === "\r") end += 1;
    if (source[end] === "\n") end += 1;

    ranges.push({ start: source.lastIndexOf("\n", start) + 1, end });
    from = end;
  }

  return ranges;
}

function removeDuplicateFunctions(source, name) {
  const ranges = findNamedFunctionRanges(source, name);
  if (ranges.length <= 1) return source;

  for (let i = ranges.length - 1; i >= 1; i -= 1) {
    source = source.slice(0, ranges[i].start) + source.slice(ranges[i].end);
  }
  return source;
}

try {
  for (const file of targets.slice(0, 2)) {
    let source = fs.readFileSync(file, "utf8");

    for (const name of [
      "selectedSimPlayer",
      "goalkeeperCanDive",
      "beginGoalkeeperDive",
      "[diveTargetMode, setDiveTargetMode]",
    ]) {
      source = removeDuplicateConstStatements(source, name);
    }

    const selectedCount = (source.match(/\bconst selectedSimPlayer\b/g) ?? []).length;
    if (selectedCount !== 1) {
      throw new Error(`${path.basename(file)} has ${selectedCount} selectedSimPlayer declarations after repair`);
    }

    const keeperCount = (source.match(/\bconst goalkeeperCanDive\b/g) ?? []).length;
    if (keeperCount > 1) {
      throw new Error(`${path.basename(file)} still has duplicate goalkeeperCanDive declarations`);
    }

    const diveHandlerCount = (source.match(/\bconst beginGoalkeeperDive\b/g) ?? []).length;
    if (diveHandlerCount > 1) {
      throw new Error(`${path.basename(file)} still has duplicate beginGoalkeeperDive declarations`);
    }

    fs.writeFileSync(file, source);
    console.log(`✓ repaired ${path.basename(file)}`);
  }

  let ai = fs.readFileSync(targets[2], "utf8");
  ai = removeDuplicateFunctions(ai, "aiClamp");

  const aiClampCount = findNamedFunctionRanges(ai, "aiClamp").length;
  if (aiClampCount > 1) {
    throw new Error(`ai.ts still has ${aiClampCount} aiClamp implementations`);
  }

  fs.writeFileSync(targets[2], ai);
  console.log("✓ repaired ai.ts");
  console.log("SUCCESS: duplicate declarations removed.");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
