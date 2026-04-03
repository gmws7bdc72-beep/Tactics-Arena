import type { Formation } from "../engine/types";
import { PITCH_WIDTH, PITCH_HEIGHT } from "../engine/constants";

const PW = PITCH_WIDTH;
const PH = PITCH_HEIGHT;

export const FORMATIONS: Formation[] = [
  {
    id: "2-1-1",
    name: "2-1-1",
    positions: [
      { x: PW * 0.12, y: PH * 0.33 },
      { x: PW * 0.12, y: PH * 0.67 },
      { x: PW * 0.38, y: PH * 0.50 },
      { x: PW * 0.62, y: PH * 0.50 },
    ],
  },
  {
    id: "1-2-1",
    name: "1-2-1",
    positions: [
      { x: PW * 0.12, y: PH * 0.50 },
      { x: PW * 0.38, y: PH * 0.33 },
      { x: PW * 0.38, y: PH * 0.67 },
      { x: PW * 0.62, y: PH * 0.50 },
    ],
  },
  {
    id: "1-1-2",
    name: "1-1-2",
    positions: [
      { x: PW * 0.12, y: PH * 0.50 },
      { x: PW * 0.38, y: PH * 0.50 },
      { x: PW * 0.62, y: PH * 0.33 },
      { x: PW * 0.62, y: PH * 0.67 },
    ],
  },
  {
    id: "2-2",
    name: "2-2",
    positions: [
      { x: PW * 0.2, y: PH * 0.33 },
      { x: PW * 0.2, y: PH * 0.67 },
      { x: PW * 0.55, y: PH * 0.33 },
      { x: PW * 0.55, y: PH * 0.67 },
    ],
  },
];

export const AI_FORMATIONS: Formation[] = [
  {
    id: "ai-2-1-1",
    name: "2-1-1",
    positions: [
      { x: PW * 0.88, y: PH * 0.33 },
      { x: PW * 0.88, y: PH * 0.67 },
      { x: PW * 0.62, y: PH * 0.50 },
      { x: PW * 0.38, y: PH * 0.50 },
    ],
  },
  {
    id: "ai-1-2-1",
    name: "1-2-1",
    positions: [
      { x: PW * 0.88, y: PH * 0.50 },
      { x: PW * 0.62, y: PH * 0.33 },
      { x: PW * 0.62, y: PH * 0.67 },
      { x: PW * 0.38, y: PH * 0.50 },
    ],
  },
];

export function getFormationById(id: string): Formation {
  return FORMATIONS.find(f => f.id === id) ?? FORMATIONS[0];
}

export function getAIFormationForArena(arena: string): Formation {
  const idx = ["bronze", "silver", "gold", "elite"].indexOf(arena);
  return AI_FORMATIONS[idx % AI_FORMATIONS.length];
}
