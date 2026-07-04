import { GameEventType } from "./types";
import type { GameEvent } from "./types";

type TeamId = "player" | "ai";

interface Phrases {
  player: string[];
  ai: string[];
}

const PHRASES: Partial<Record<GameEventType, Phrases>> = {
  [GameEventType.DRIBBLE]: {
    player: [
      "{name} drives forward!",
      "{name} surges ahead with the ball!",
      "{name} advances into space!",
      "{name} on the run!",
      "{name} carries it forward!",
      "{name} pushes up the pitch!",
      "{name} takes it on himself!",
      "{name} breaks forward!",
    ],
    ai: [
      "{name} advances for the opposition...",
      "{name} charges forward...",
      "Danger — {name} drives ahead!",
      "{name} pushes into our half...",
      "{name} on the move with the ball...",
      "{name} surging through...",
      "Watch out — {name} is forward!",
    ],
  },

  [GameEventType.PASS_COMPLETE]: {
    player: [
      "Good ball from {passer}!",
      "Neat pass — {passer} to {receiver}!",
      "Sharp link-up play!",
      "Good combination!",
      "Clean switch of play!",
      "Nice work, {receiver} collects!",
      "Slick move — great pass!",
      "Well played, {passer}!",
      "Into feet — {receiver} controls it!",
    ],
    ai: [
      "They work it around...",
      "Clean passing from the opposition.",
      "Neat combination — {receiver} takes it.",
      "The opposition moves the ball well.",
      "{receiver} picks it up...",
      "Good interchange — stay switched on!",
      "Slick move from the opposition.",
    ],
  },

  [GameEventType.PASS_INTERCEPTED]: {
    player: [
      "Brilliant interception!",
      "We've won it back!",
      "Dispossessed — we take over!",
      "Clever read — ball won!",
      "Cut out nicely!",
      "Reading the pass perfectly — ours!",
    ],
    ai: [
      "Interception — they've got it!",
      "Pass cut out by the opposition!",
      "Picked off — we've lost possession.",
      "They read that beautifully.",
    ],
  },

  [GameEventType.TACKLE]: {
    player: [
      "Excellent tackle!",
      "Ball won cleanly!",
      "Dispossessed in midfield — ours now!",
      "Crunching challenge — we've got it!",
      "Physical and effective!",
      "Won it! Keep it moving!",
      "Stolen! Great pressing.",
    ],
    ai: [
      "Tackled! They've taken it...",
      "Physical challenge — they win it.",
      "We've lost the ball there.",
      "Bundled off — they're in possession.",
      "Won by the opposition.",
    ],
  },

  [GameEventType.LOOSE_BALL]: {
    player: [
      "Holds on through the challenge!",
      "Strong — keeps possession!",
      "Body strength — holds them off!",
      "Shields it well!",
    ],
    ai: [
      "They hold on despite pressure...",
      "Strong hold-up play there.",
      "Holding possession under pressure...",
    ],
  },

  [GameEventType.SHOT_ON_GOAL]: {
    player: [
      "SHOOT! Drives at goal!",
      "Shot on target!",
      "Pulls the trigger! Can they score?",
      "STRIKE! Testing the keeper!",
      "Going for goal!",
      "Powerful effort!",
      "Let fly — forcing a save!",
    ],
    ai: [
      "SHOT! Dangerous!",
      "Strike at goal — hold your breath!",
      "They shoot! Can we keep it out?",
      "Powerful effort — stay focused!",
      "Going for goal — keeper alert!",
    ],
  },

  [GameEventType.SHOT_BLOCKED]: {
    player: [
      "Blocked! Brave defending!",
      "Blocked — scramble cleared!",
      "Great block — takes the sting out!",
    ],
    ai: [
      "Shot blocked!",
      "Brave block — cleared!",
      "Blocked — phew!",
    ],
  },

  [GameEventType.SAVE]: {
    player: [
      "SAVED! Keeper gets down!",
      "Brilliant stop!",
      "Denied! What a save!",
      "Keeper to the rescue!",
      "Fingertips — unbelievable!",
      "Great reflexes from the keeper!",
      "World-class stop!",
    ],
    ai: [
      "SAVED! Our keeper stands firm!",
      "Excellent save! Kept out!",
      "Denied! The keeper is sharp today!",
      "Great stop — nil-nil maintained!",
      "Tremendous save!",
    ],
  },

  [GameEventType.OFFSIDE]: {
    player: [
      "Offside — {name} caught in an advanced position!",
      "The trap worked — {name} is flagged!",
      "Offside! Flag is up for {name}.",
      "Clever defensive line — offside!",
    ],
    ai: [
      "Offside flag for {name}.",
      "{name} caught offside!",
      "The offside trap springs — {name} is caught!",
    ],
  },

  [GameEventType.GOAL]: {
    player: [
      "⚽ GOAL! UNBELIEVABLE! WE'VE SCORED!",
      "⚽ IT'S IN THE NET! INCREDIBLE FINISH!",
      "⚽ GOAL! WHAT A MOMENT!",
      "⚽ YES! THEY SCORE! BRILLIANT!",
      "⚽ GOOOAL! THE STADIUM ERUPTS!",
    ],
    ai: [
      "⚽ GOAL — They've scored. Unlucky.",
      "⚽ It's in. The opposition celebrate.",
      "⚽ CONCEDED. Come on, respond!",
      "⚽ They score. Shake it off — back in this!",
    ],
  },

  [GameEventType.KICKOFF]: {
    player: ["Match kicks off!", "Underway!", "Let's go — ball is live!"],
    ai: ["Match kicks off!", "Underway!", "Let's go — ball is live!"],
  },
};

let _counter = 0;

/** Returns a varied commentary string for the given event. */
export function getCommentary(event: GameEvent): string {
  const teamId: TeamId = event.teamId ?? "player";
  const bank = PHRASES[event.type];
  if (!bank) return event.message;

  const list = bank[teamId] ?? bank.player;
  if (!list || list.length === 0) return event.message;

  const idx = (_counter++ + event.tick * 7 + (event.playerId?.charCodeAt(0) ?? 0)) % list.length;
  const template = list[idx];

  // Fill in template placeholders from the event message field
  // convention: event.message encodes "passer → receiver" for passes,
  // or just the player name for other events
  const parts = event.message.split(" → ");
  const passer = parts[0] ?? event.message;
  const receiver = parts[1] ?? parts[0] ?? "";
  const name = event.message;

  return template
    .replace("{name}", name)
    .replace("{passer}", passer)
    .replace("{receiver}", receiver);
}
