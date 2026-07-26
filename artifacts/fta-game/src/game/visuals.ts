import type {
  KitStyle,
  PlayerAppearance,
  PlayerRole,
  SleeveStyle,
} from "../engine/types";

export const KIT_STYLES: { id: KitStyle; name: string; description: string }[] = [
  { id: "solid", name: "Solid", description: "Classic single-color shirt" },
  { id: "vertical-stripes", name: "Vertical", description: "Traditional vertical stripes" },
  { id: "horizontal-stripes", name: "Hoops", description: "Bold horizontal bands" },
  { id: "diagonal-sash", name: "Sash", description: "Diagonal secondary-color slash" },
];

export const SLEEVE_STYLES: { id: SleeveStyle; name: string }[] = [
  { id: "primary", name: "Primary" },
  { id: "secondary", name: "Secondary" },
  { id: "split", name: "Split" },
];

const SKIN_TONES = [
  "#f1c7a5",
  "#dca77d",
  "#c98b5b",
  "#a96d43",
  "#7b4b31",
  "#4f2f24",
] as const;

const HAIR_COLORS = [
  "#17120f",
  "#2c1c13",
  "#4b2d1b",
  "#6d4a2b",
  "#b98245",
  "#d6c09a",
  "#20242a",
] as const;

const HAIR_STYLES: PlayerAppearance["hairStyle"][] = [
  "short",
  "fade",
  "curly",
  "mohawk",
  "bald",
  "dreadlocks",
];

const FACIAL_HAIR: PlayerAppearance["facialHair"][] = [
  "none",
  "none",
  "none",
  "stubble",
  "goatee",
  "full",
];

export function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeKitStyle(value?: KitStyle): KitStyle {
  return KIT_STYLES.some((style) => style.id === value) ? value! : "solid";
}

export function normalizeSleeveStyle(value?: SleeveStyle): SleeveStyle {
  return SLEEVE_STYLES.some((style) => style.id === value) ? value! : "primary";
}

export function deriveKitStyle(seed: string): KitStyle {
  return KIT_STYLES[stableHash(seed) % KIT_STYLES.length].id;
}

export function deriveSleeveStyle(seed: string): SleeveStyle {
  return SLEEVE_STYLES[(stableHash(`${seed}:sleeves`) >>> 3) % SLEEVE_STYLES.length].id;
}

export function createPlayerAppearance(
  seed: string,
  role: PlayerRole,
): PlayerAppearance {
  const hash = stableHash(seed);
  const hairIndex = (hash >>> 4) % HAIR_STYLES.length;
  const facialHairIndex = (hash >>> 9) % FACIAL_HAIR.length;
  const isKeeper = role === "goalkeeper";

  return {
    skinTone: SKIN_TONES[hash % SKIN_TONES.length],
    hairColor: HAIR_COLORS[(hash >>> 12) % HAIR_COLORS.length],
    hairStyle: isKeeper && hairIndex === 4 ? "short" : HAIR_STYLES[hairIndex],
    facialHair: isKeeper && facialHairIndex === 5 ? "stubble" : FACIAL_HAIR[facialHairIndex],
  };
}
