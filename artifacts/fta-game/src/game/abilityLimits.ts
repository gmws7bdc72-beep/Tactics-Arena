import type { AbilityId, PlayerCard } from "../engine/types";
import { PLAYERS_PER_TEAM } from "../engine/constants";

export const STARTING_ABILITY_LIMITS: Partial<Record<AbilityId, number>> = {
  ghost_run: 1,
  bullet_pass: 3,
};

export interface AbilityLimitCheck {
  valid: boolean;
  ability?: AbilityId;
  limit?: number;
  count?: number;
  message?: string;
}

export function validateStartingAbilityCaps(players: PlayerCard[]): AbilityLimitCheck {
  const starters = players.slice(0, PLAYERS_PER_TEAM);
  for (const [ability, limit] of Object.entries(STARTING_ABILITY_LIMITS) as [AbilityId, number][]) {
    const count = starters.filter((player) => player.ability === ability).length;
    if (count > limit) {
      const label = ability === "ghost_run" ? "Ghost Run" : ability === "bullet_pass" ? "Bullet Pass" : ability;
      return {
        valid: false,
        ability,
        limit,
        count,
        message: `Starting lineup limit: ${limit} ${label}${limit === 1 ? " player" : " players"}.`,
      };
    }
  }
  return { valid: true };
}

function slotAccepts(slot: number, player: PlayerCard): boolean {
  return slot === 0 ? player.role === "goalkeeper" : player.role !== "goalkeeper";
}

export function enforceStartingAbilityCaps(players: PlayerCard[]): PlayerCard[] {
  if (players.length <= PLAYERS_PER_TEAM) return [...players];
  const result = [...players];

  for (const [ability, limit] of Object.entries(STARTING_ABILITY_LIMITS) as [AbilityId, number][]) {
    let starterIndexes = result
      .slice(0, PLAYERS_PER_TEAM)
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.ability === ability)
      .map(({ index }) => index);

    while (starterIndexes.length > limit) {
      const excessSlot = starterIndexes[starterIndexes.length - 1];
      const replacementIndex = result.findIndex((candidate, index) => {
        if (index < PLAYERS_PER_TEAM) return false;
        if (!slotAccepts(excessSlot, candidate)) return false;
        if (candidate.ability === ability) return false;

        const simulated = [...result];
        [simulated[excessSlot], simulated[index]] = [simulated[index], simulated[excessSlot]];
        return validateStartingAbilityCaps(simulated).valid;
      });

      if (replacementIndex < 0) break;
      [result[excessSlot], result[replacementIndex]] = [result[replacementIndex], result[excessSlot]];
      starterIndexes = result
        .slice(0, PLAYERS_PER_TEAM)
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => player.ability === ability)
        .map(({ index }) => index);
    }
  }

  return result;
}

export function getValidStartingLineup(players: PlayerCard[]): PlayerCard[] {
  return enforceStartingAbilityCaps(players).slice(0, PLAYERS_PER_TEAM);
}
