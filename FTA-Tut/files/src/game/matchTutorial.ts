import type { TutorialFocus } from "../components/TutorialCoach";

export type TutorialRequirement =
  | "none"
  | "selected"
  | "move"
  | "confirmed"
  | "pass"
  | "longPass"
  | "curve"
  | "combo"
  | "shoot"
  | "final";

export interface MatchTutorialStep {
  title: string;
  body: string;
  hint?: string;
  focus: TutorialFocus;
  requirement: TutorialRequirement;
}

export const MATCH_TUTORIAL_STEPS: MatchTutorialStep[] = [
  {
    title: "Welcome to the tactical board",
    body: "Both teams plan first. The phase plays only after you confirm, and it keeps running until every planned action has finished or been interrupted.",
    hint: "You are learning in a separate practice match. Your season record is untouched.",
    focus: "none",
    requirement: "none",
  },
  {
    title: "Select a player",
    body: "Tap one of your players. Their reachable area and the action bar will appear.",
    hint: "Your team attacks toward the goal marked Attacking.",
    focus: "pitch",
    requirement: "selected",
  },
  {
    title: "Plan movement",
    body: "With a player selected, tap a reachable tile. The line is the route they will attempt during the phase.",
    hint: "Movement and dribbling may use aggressive or unusual routes.",
    focus: "pitch",
    requirement: "move",
  },
  {
    title: "Play the movement",
    body: "Press Confirm Turn. The AI plans at the same time, then every command plays out before the next planning phase begins.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Ground pass",
    body: "Select the ball carrier, press Pass, then tap a teammate or open tile. A pass can also score if its path carries the whole ball into the goal.",
    focus: "pass",
    requirement: "pass",
  },
  {
    title: "Play the pass",
    body: "Confirm the phase and watch the receiving player take possession. A player who receives without travelling should stay in the idle receiving animation.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Long ball and landing vision",
    body: "Select the new ball carrier and use Long Ball for a distant target. The arc and landing vision show where it will descend.",
    hint: "Players cannot collect a curved long ball while it is still unrealistically high.",
    focus: "longPass",
    requirement: "longPass",
  },
  {
    title: "Play the long ball",
    body: "Confirm and watch the full flight. It remains slower than a ground pass, while its travel speed scales with distance so it does not freeze or teleport.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Curve: endpoint first",
    body: "Select a player and press Curve. Choose the action and its final endpoint before placing the control points. The endpoint is fixed first; the later points shape the route into it.",
    hint: "Extreme movement curves are allowed. Impossible pass, long-ball, or shot loops and reversals are automatically corrected.",
    focus: "curve",
    requirement: "curve",
  },
  {
    title: "Play the curve",
    body: "Finish the curve with at least two control points, then confirm the phase to see the corrected route in motion.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Combination actions",
    body: "Select the ball carrier. Tap the combo button for Move + Pass. Hold it, or press Pass and Move together, for Pass + Move. Complete both targets.",
    hint: "Patient teams favor Move + Pass. Direct teams favor Pass + Move. Balanced teams mix both.",
    focus: "combo",
    requirement: "combo",
  },
  {
    title: "Play the combination",
    body: "Confirm and watch the two actions happen in the planned order.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Place the shot",
    body: "Select the ball carrier, press Shoot, and tap the exact place inside the goal. Shooting controls range accuracy, power, and curve—not an automatic random destination.",
    hint: "A goal only counts after the entire ball crosses the line between the posts and enters the goal depth.",
    focus: "shoot",
    requirement: "shoot",
  },
  {
    title: "Play the shot",
    body: "Confirm to test the placement. A missed line or a ball that never fully enters the goal depth does not count.",
    focus: "confirm",
    requirement: "confirmed",
  },
  {
    title: "Goalkeeper dives",
    body: "When your off-ball goalkeeper is selected, Shoot becomes Dive. The highlighted radius is the exact legal reach: one tile normally, two for an elite keeper.",
    hint: "The AI goalkeeper predicts shots, through balls, loose balls, and one-on-one danger before deciding to dive.",
    focus: "dive",
    requirement: "none",
  },
  {
    title: "Offside on the tile edge",
    body: "The offside line sits on the goal-side edge of the relevant tile. A player standing inside that tile is still onside; they become offside only after crossing its leading edge.",
    focus: "pitch",
    requirement: "none",
  },
  {
    title: "Final challenge",
    body: "Create a goal within three turns. Shoot, dribble in, pass into the net, use a long ball, or score through either combination action.",
    hint: "Anything that legally carries the whole ball into the goal can score.",
    focus: "none",
    requirement: "final",
  },
];
