import fs from "node:fs";
import path from "node:path";

const target = path.resolve("artifacts/fta-game/src/components/MechanicPad.tsx");
const replacement = path.resolve(new URL("./MechanicPad.tsx", import.meta.url).pathname);

if (!fs.existsSync(target)) {
  console.error("ERROR: Run this from the repository root (~/workspace).");
  process.exit(1);
}

fs.copyFileSync(replacement, target);

const installed = fs.readFileSync(target, "utf8");
for (const marker of ["active: boolean;", "invisible pointer-events-none", "actionsDisabled || !active"]) {
  if (!installed.includes(marker)) {
    console.error(`ERROR: verification failed: ${marker}`);
    process.exit(1);
  }
}

console.log("SUCCESS: MechanicPad active prop restored.");
console.log("SUCCESS: empty hotbar frame preserved when no player is selected.");
