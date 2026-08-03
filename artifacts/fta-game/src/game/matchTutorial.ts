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
  | "dive"
  | "final";

export type TutorialSceneId =
  | "board"
  | "select"
  | "movement"
  | "pass"
  | "longBall"
  | "curve"
  | "combination"
  | "shooting"
  | "goalkeeper"
  | "offside"
  | "final";

export interface TutorialViewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MatchTutorialStep {
  title: string;
  body: string;
  hint?: string;
  focus: TutorialFocus;
  requirement: TutorialRequirement;
  scene: TutorialSceneId;
  view: TutorialViewBounds;
  /** Mobile pitch height. Each exercise gets only the amount of pitch it needs. */
  mobilePitchDvh: number;
  /** Most lessons keep the opposition still so the mechanic can be learned cleanly. */
  aiMode?: "still" | "active";
}

export const MATCH_TUTORIAL_STEPS: MatchTutorialStep[] = [
  {
    title: "How a phase works",
    body: "This is a paused tactical board. You plan first, press Confirm, and then both teams execute together until the actions finish.",
    hint: "This practice match never changes your season record.",
    focus: "none",
    requirement: "none",
    scene: "board",
    view: { minX: 190, maxX: 560, minY: 40, maxY: 420 },
    mobilePitchDvh: 32,
  },
  {
    title: "Select the highlighted player",
    body: "Tap your player in the center of the practice zone. Selection reveals their legal movement area and unlocks the command buttons.",
    hint: "Your team always attacks toward the top marker.",
    focus: "pitch",
    requirement: "selected",
    scene: "select",
    view: { minX: 120, maxX: 410, minY: 65, maxY: 395 },
    mobilePitchDvh: 38,
  },
  {
    title: "Create a short run",
    body: "Tap a reachable tile ahead of the selected player. The solid route is a real command that will be attempted during the next phase.",
    hint: "Ordinary players can run at most two tiles. Ghost Run can unlock the third tile.",
    focus: "pitch",
    requirement: "move",
    scene: "movement",
    view: { minX: 115, maxX: 440, minY: 55, maxY: 405 },
    mobilePitchDvh: 41,
  },
  {
    title: "Release the movement",
    body: "Press Confirm Turn. Watch the runner travel the exact distance you planned while the nearby defender remains a reference point.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "movement",
    view: { minX: 115, maxX: 440, minY: 55, maxY: 405 },
    mobilePitchDvh: 41,
  },
  {
    title: "Thread a ground pass",
    body: "Select the ball carrier, press Pass, then choose the teammate beyond the defender. You may target a player or open space.",
    hint: "A pass line is fast and flat, so defenders can intercept it at ground level.",
    focus: "pass",
    requirement: "pass",
    scene: "pass",
    view: { minX: 175, maxX: 525, minY: 35, maxY: 425 },
    mobilePitchDvh: 42,
  },
  {
    title: "Watch the passing lane",
    body: "Confirm the phase. Notice that the ball travels through the lane you chose and the receiver takes possession without needing to run first.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "pass",
    view: { minX: 175, maxX: 525, minY: 35, maxY: 425 },
    mobilePitchDvh: 42,
  },
  {
    title: "Lift a long ball",
    body: "Select the deep ball carrier, press Long Ball, and target the advanced teammate. The larger practice channel lets you read the full flight.",
    hint: "The ball cannot be intercepted like a ground pass while it is still unrealistically high.",
    focus: "longPass",
    requirement: "longPass",
    scene: "longBall",
    view: { minX: 70, maxX: 675, minY: 30, maxY: 430 },
    mobilePitchDvh: 46,
  },
  {
    title: "Read the landing",
    body: "Confirm and watch the arc rise, travel, and descend. Aerial players become relevant near the landing zone rather than at the launch point.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "longBall",
    view: { minX: 70, maxX: 675, minY: 30, maxY: 430 },
    mobilePitchDvh: 46,
  },
  {
    title: "Bend around the blocker",
    body: "Select the ball carrier, press Curve, choose Pass and the teammate first, then place at least two control points around the defender.",
    hint: "The destination is chosen first. Your later taps shape the route into that destination.",
    focus: "curve",
    requirement: "curve",
    scene: "curve",
    view: { minX: 285, maxX: 710, minY: 15, maxY: 365 },
    mobilePitchDvh: 44,
  },
  {
    title: "Play the curved route",
    body: "Finish the curve and confirm. The ball should bend around the defender while still obeying a physically legal path toward the receiver.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "curve",
    view: { minX: 285, maxX: 710, minY: 15, maxY: 365 },
    mobilePitchDvh: 44,
  },
  {
    title: "Build a two-part action",
    body: "Select the ball carrier. Tap the combo button for Move + Pass, or hold it for Pass + Move, then complete both targets in order.",
    hint: "Move + Pass changes the passing angle. Pass + Move releases the ball before attacking the next space.",
    focus: "combo",
    requirement: "combo",
    scene: "combination",
    view: { minX: 245, maxX: 690, minY: 30, maxY: 430 },
    mobilePitchDvh: 45,
  },
  {
    title: "Watch the sequence",
    body: "Confirm the phase. The two commands should happen in the order you selected instead of resolving as two unrelated turns.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "combination",
    view: { minX: 245, maxX: 690, minY: 30, maxY: 430 },
    mobilePitchDvh: 45,
  },
  {
    title: "Place a real shot",
    body: "Select the attacker, press Shoot, and tap an exact point inside the goal. You are aiming the attempt—not selecting a generic shot button.",
    hint: "Shooting controls how closely the ball follows your chosen point, plus its power and legal curve.",
    focus: "shoot",
    requirement: "shoot",
    scene: "shooting",
    view: { minX: 420, maxX: 790, minY: 55, maxY: 405 },
    mobilePitchDvh: 49,
  },
  {
    title: "Test the finish",
    body: "Confirm and watch the goalkeeper react. The whole ball must cross the line between the posts and enter the goal depth to count.",
    focus: "confirm",
    requirement: "confirmed",
    scene: "shooting",
    view: { minX: 420, maxX: 790, minY: 55, maxY: 405 },
    mobilePitchDvh: 49,
  },
  {
    title: "Goalkeeper dive radius",
    body: "Select your off-ball goalkeeper. Shoot changes to Dive. Tap inside the highlighted reach to set the keeper's launch point.",
    hint: "A normal keeper reaches one tile. An elite keeper can reach two.",
    focus: "dive",
    requirement: "dive",
    scene: "goalkeeper",
    view: { minX: -50, maxX: 315, minY: 50, maxY: 410 },
    mobilePitchDvh: 48,
  },
  {
    title: "Read the offside edge",
    body: "Study the attacker beside the dashed line. Offside begins at the goal-side edge of the second-deepest defender's tile—not through their body.",
    hint: "A runner may cross after the kick. Their position at the exact release moment is what matters.",
    focus: "pitch",
    requirement: "none",
    scene: "offside",
    view: { minX: 430, maxX: 790, minY: 25, maxY: 435 },
    mobilePitchDvh: 47,
  },
  {
    title: "Final attacking challenge",
    body: "Score within three turns using any legal method: shoot, dribble in, pass into the goal, long ball, curve, or a combination action.",
    hint: "The defenders are active now. Build the chance instead of treating the exercise as an empty-net shot.",
    focus: "none",
    requirement: "final",
    scene: "final",
    view: { minX: 255, maxX: 790, minY: 20, maxY: 440 },
    mobilePitchDvh: 50,
    aiMode: "active",
  },
];
