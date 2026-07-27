import type {
  KitStyle,
  PlayerAppearance,
  PlayerRole,
  SleeveStyle,
  PassStyle,
} from "../../engine/types";
import { createPlayerAppearance, stableHash } from "../../game/visuals";
import { LONG_PASS_WIND_UP, PASS_WIND_UP, SHOT_WIND_UP } from "../../engine/constants";

type AnimationState =
  | "IDLE"
  | "MOVING"
  | "DRIBBLING"
  | "PASSING"
  | "SHOOTING"
  | "CONTESTING"
  | "RECOVERING";

export interface AnimatedPlayerSpriteArgs {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  radius: number;
  id: string;
  name: string;
  jerseyNumber: number;
  role: PlayerRole;
  state: AnimationState | string;
  stateTimer?: number;
  actionPassStyle?: PassStyle;
  facing: number;
  time: number;
  speed: number;
  primaryColor: string;
  secondaryColor: string;
  kitStyle: KitStyle;
  sleeveStyle: SleeveStyle;
  appearance?: PlayerAppearance;
  selected: boolean;
  ownsBall: boolean;
  offside?: boolean;
}

export interface PossessionBallOffsetArgs {
  radius: number;
  facing: number;
  time: number;
  moving: boolean;
  dribbling: boolean;
  seed: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function kickMotion(
  progress: number,
  backSwing: number,
  followThrough: number,
  backswingEnd: number,
  strikeEnd: number,
): number {
  const t = clamp(progress, 0, 1);
  if (t <= backswingEnd) {
    return -backSwing * easeInOutCubic(t / Math.max(backswingEnd, 0.001));
  }

  const strike = easeOutCubic(
    (t - backswingEnd) / Math.max(strikeEnd - backswingEnd, 0.001),
  );
  return -backSwing + (backSwing + followThrough) * strike;
}

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean.padEnd(6, "0");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${alpha})`;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function line(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stroke: string,
  width: number,
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function drawKitPattern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  primary: string,
  secondary: string,
  style: KitStyle,
): void {
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  const base = ctx.createLinearGradient(x, y, x + width, y + height);
  base.addColorStop(0, rgba("#ffffff", 0.18));
  base.addColorStop(0.25, primary);
  base.addColorStop(1, rgba(primary, 0.78));
  ctx.fillStyle = base;
  ctx.fillRect(x, y, width, height);

  ctx.fillStyle = rgba(secondary, 0.9);
  if (style === "vertical-stripes") {
    const stripeWidth = width / 5;
    ctx.fillRect(x + stripeWidth, y, stripeWidth, height);
    ctx.fillRect(x + stripeWidth * 3, y, stripeWidth, height);
  } else if (style === "horizontal-stripes") {
    const bandHeight = height / 5;
    ctx.fillRect(x, y + bandHeight, width, bandHeight);
    ctx.fillRect(x, y + bandHeight * 3, width, bandHeight);
  } else if (style === "diagonal-sash") {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(-0.52);
    ctx.fillRect(-width, -height * 0.14, width * 2, height * 0.28);
    ctx.restore();
  }

  const shine = ctx.createLinearGradient(x, y, x + width, y);
  shine.addColorStop(0, "rgba(255,255,255,0.14)");
  shine.addColorStop(0.45, "rgba(255,255,255,0)");
  shine.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = shine;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  appearance: PlayerAppearance,
  headX: number,
  headY: number,
  headRadius: number,
  sideFacing: number,
  frontness: number,
): void {
  const color = appearance.hairColor;
  const topY = headY - headRadius * 0.72;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = rgba("#000000", 0.35);
  ctx.lineWidth = Math.max(0.8, headRadius * 0.08);

  if (appearance.hairStyle === "bald") {
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(headX, topY, headRadius * 0.34, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (appearance.hairStyle === "short") {
    ctx.beginPath();
    ctx.ellipse(headX, topY, headRadius * 0.9, headRadius * 0.42, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (appearance.hairStyle === "fade") {
    ctx.beginPath();
    ctx.ellipse(headX + sideFacing * headRadius * 0.08, topY - headRadius * 0.06, headRadius * 0.72, headRadius * 0.38, sideFacing * 0.08, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.fillRect(headX - headRadius * 0.72, topY, headRadius * 1.44, headRadius * 0.18);
  } else if (appearance.hairStyle === "curly") {
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(headX + i * headRadius * 0.28, topY - Math.abs(i) * headRadius * 0.04, headRadius * 0.31, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (appearance.hairStyle === "mohawk") {
    ctx.beginPath();
    ctx.moveTo(headX - headRadius * 0.25, topY + headRadius * 0.1);
    ctx.lineTo(headX - headRadius * 0.08, topY - headRadius * 0.75);
    ctx.lineTo(headX + headRadius * 0.18, topY - headRadius * 0.28);
    ctx.lineTo(headX + headRadius * 0.28, topY + headRadius * 0.1);
    ctx.closePath();
    ctx.fill();
  } else {
    for (let i = -2; i <= 2; i++) {
      const lockX = headX + i * headRadius * 0.3;
      const lockLength = headRadius * (0.78 + ((i + 2) % 2) * 0.18);
      line(ctx, lockX, topY, lockX + sideFacing * headRadius * 0.08, topY + lockLength, color, headRadius * 0.2);
    }
  }

  if (frontness < -0.45 && appearance.hairStyle !== "bald") {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(headX, headY - headRadius * 0.15, headRadius * 0.85, headRadius * 0.65, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  appearance: PlayerAppearance,
  headX: number,
  headY: number,
  headRadius: number,
  sideFacing: number,
  frontness: number,
): void {
  if (frontness < -0.2) return;

  const eyeY = headY - headRadius * 0.05;
  const eyeSeparation = headRadius * (0.28 - Math.abs(sideFacing) * 0.1);
  const eyeShift = sideFacing * headRadius * 0.16;
  ctx.save();
  ctx.fillStyle = "rgba(20,15,12,0.82)";

  if (Math.abs(sideFacing) > 0.72) {
    ctx.beginPath();
    ctx.arc(headX + eyeShift, eyeY, headRadius * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba("#000000", 0.35);
    ctx.lineWidth = headRadius * 0.08;
    ctx.beginPath();
    ctx.moveTo(headX + sideFacing * headRadius * 0.6, headY + headRadius * 0.02);
    ctx.lineTo(headX + sideFacing * headRadius * 0.82, headY + headRadius * 0.12);
    ctx.stroke();
  } else {
    for (const offset of [-eyeSeparation, eyeSeparation]) {
      ctx.beginPath();
      ctx.arc(headX + eyeShift + offset, eyeY, headRadius * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (appearance.facialHair !== "none") {
    const beardAlpha = appearance.facialHair === "stubble" ? 0.35 : 0.75;
    ctx.fillStyle = rgba(appearance.hairColor, beardAlpha);
    if (appearance.facialHair === "goatee") {
      ctx.beginPath();
      ctx.ellipse(headX + eyeShift * 0.5, headY + headRadius * 0.45, headRadius * 0.22, headRadius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(headX + eyeShift * 0.35, headY + headRadius * 0.18, headRadius * 0.72, 0.15, Math.PI - 0.15);
      ctx.lineTo(headX, headY + headRadius * 0.72);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

export function getPossessionBallOffset({
  radius,
  facing,
  time,
  moving,
  dribbling,
  seed,
}: PossessionBallOffsetArgs): { x: number; y: number } {
  const hashPhase = (stableHash(seed) % 1000) / 1000;
  const cycle = (time * (dribbling ? 2.75 : 1.4) + hashPhase) % 1;
  const touchPulse = Math.sin(cycle * Math.PI) ** 2;
  const forwardDistance = moving
    ? radius * (0.55 + touchPulse * (dribbling ? 1.05 : 0.55))
    : radius * 0.72;
  const sideways = moving
    ? Math.sin((cycle + 0.25) * Math.PI * 2) * radius * 0.16
    : radius * 0.12;
  const forwardX = Math.cos(facing);
  const forwardY = Math.sin(facing);
  const sideX = -forwardY;
  const sideY = forwardX;

  return {
    x: forwardX * forwardDistance + sideX * sideways,
    // Keep the ball on the grass near the boots, independent of ball radius.
    y: forwardY * forwardDistance + sideY * sideways + radius * 0.78,
  };
}

export function drawAnimatedPlayerSprite(args: AnimatedPlayerSpriteArgs): void {
  const {
    ctx,
    x,
    y,
    radius: r,
    id,
    name,
    jerseyNumber,
    role,
    state,
    stateTimer,
    actionPassStyle = "ground",
    facing,
    time,
    speed,
    primaryColor,
    secondaryColor,
    kitStyle,
    sleeveStyle,
    selected,
    ownsBall,
    offside,
  } = args;

  const appearance = args.appearance ?? createPlayerAppearance(id, role);
  const phaseOffset = (stableHash(id) % 1000) / 1000 * Math.PI * 2;
  // Movement animation must follow actual velocity. A stationary ball owner stays idle.
  const moving = speed > 0.65;
  const dribbling = ownsBall && moving;
  const isShooting = state === "SHOOTING";
  const isPassing = state === "PASSING";
  const isLongPass = isPassing && actionPassStyle === "long";
  const isContesting = state === "CONTESTING";
  const isRecovering = state === "RECOVERING";
  const gaitSpeed = dribbling ? 11.5 : 9.2;
  const gait = moving ? Math.sin(time * gaitSpeed + phaseOffset) : 0;
  const idleBreath = moving ? 0 : Math.sin(time * 2.1 + phaseOffset) * r * 0.045;

  const actionDuration = isShooting
    ? SHOT_WIND_UP
    : isLongPass
      ? LONG_PASS_WIND_UP
      : PASS_WIND_UP;
  const actionProgress = isPassing || isShooting
    ? typeof stateTimer === "number"
      ? clamp(1 - stateTimer / Math.max(actionDuration, 0.001), 0, 1)
      : (time * (isLongPass ? 1.8 : isShooting ? 3.2 : 3.8) + phaseOffset) % 1
    : 0;

  // A ground pass is deliberately compact: almost no backswing and only a
  // short inside-foot follow-through. Long balls use the same idea stretched
  // into a graceful full-body motion; shots snap through that larger arc fast.
  const actionKick = isLongPass
    ? kickMotion(actionProgress, r * 0.34, r * 0.84, 0.38, 0.88)
    : isShooting
      ? kickMotion(actionProgress, r * 0.3, r * 0.98, 0.22, 0.66)
      : isPassing
        ? kickMotion(actionProgress, r * 0.08, r * 0.34, 0.28, 0.72)
        : 0;
  const actionStrike = easeOutCubic(
    clamp((actionProgress - (isLongPass ? 0.32 : isShooting ? 0.16 : 0.22)) / 0.56, 0, 1),
  );
  const actionLift = isLongPass
    ? Math.sin(clamp(actionProgress, 0, 1) * Math.PI) * r * 0.18
    : isShooting
      ? Math.sin(clamp(actionProgress, 0, 1) * Math.PI) * r * 0.15
      : isPassing
        ? Math.sin(clamp(actionProgress, 0, 1) * Math.PI) * r * 0.035
        : 0;
  const actionPlant = (isPassing || isShooting) ? -actionKick * 0.08 : 0;
  const actionLean = isLongPass
    ? r * (-0.08 + actionStrike * 0.2)
    : isShooting
      ? r * (-0.055 + actionStrike * 0.23)
      : isPassing
        ? r * actionStrike * 0.025
        : 0;
  const kickWithLeft = stableHash(`${id}:kick-foot`) % 2 === 0;

  const frontX = Math.cos(facing);
  const frontY = Math.sin(facing);
  const sideX = -frontY;
  const sideY = frontX;
  const frontness = clamp(frontY, -1, 1);
  const sideFacing = clamp(frontX, -1, 1);
  const depthScale = 0.9 + frontness * 0.08;
  const bodyWidth = r * (1.02 - Math.abs(sideFacing) * 0.17);
  // Taller, more human proportions: a longer torso with shorter legs.
  const bodyHeight = r * 1.48 * depthScale;
  const headRadius = r * 0.41;
  const hipY = y + r * 0.4 + idleBreath;
  const torsoY = y - bodyHeight * 0.44 + idleBreath;
  const torsoCenterX = x + sideFacing * r * 0.08;
  const lean =
    (moving ? r * 0.07 : 0) +
    (dribbling ? r * 0.05 : 0) +
    actionLean;
  const torsoCenterY = torsoY + lean * frontY;
  const stride = moving ? gait * r * 0.38 : 0;
  const armSwing = moving ? -gait * r * 0.32 : 0;
  const keeper = role === "goalkeeper";

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.14, y + r * 0.86, r * 1.15, r * 0.38, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ringColor = selected ? "#00e5ff" : ownsBall ? "#ffd700" : rgba(primaryColor, 0.9);
  ctx.save();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = selected ? 4 : 2.4;
  ctx.shadowColor = ringColor;
  ctx.shadowBlur = selected || ownsBall ? 15 : 4;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.7, r * 1.18, r * 0.45, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const legBaseX = torsoCenterX;
  const leftHipX = legBaseX - bodyWidth * 0.22;
  const rightHipX = legBaseX + bodyWidth * 0.22;
  const recoverDrop = isRecovering ? r * 0.18 : 0;
  const leftAction = kickWithLeft ? actionKick : actionPlant;
  const rightAction = kickWithLeft ? actionPlant : actionKick;
  const legForwardA = stride + leftAction;
  const legForwardB = -stride + rightAction;
  const leftFootX = leftHipX + sideX * legForwardA + frontX * legForwardA * 0.42;
  const leftFootY =
    hipY +
    r * 0.48 +
    sideY * legForwardA * 0.34 +
    frontY * legForwardA * 0.2 +
    recoverDrop -
    (kickWithLeft ? actionLift : 0);
  const rightFootX = rightHipX + sideX * legForwardB + frontX * legForwardB * 0.42;
  const rightFootY =
    hipY +
    r * 0.48 +
    sideY * legForwardB * 0.34 +
    frontY * legForwardB * 0.2 +
    recoverDrop -
    (kickWithLeft ? 0 : actionLift);

  ctx.save();
  line(ctx, leftHipX, hipY, leftFootX, leftFootY, "#171717", Math.max(3, r * 0.22));
  line(ctx, rightHipX, hipY, rightFootX, rightFootY, "#171717", Math.max(3, r * 0.22));
  line(ctx, leftFootX, leftFootY, leftFootX - sideFacing * r * 0.3 + frontX * r * 0.2, leftFootY + r * 0.06, secondaryColor, Math.max(2, r * 0.13));
  line(ctx, rightFootX, rightFootY, rightFootX - sideFacing * r * 0.3 + frontX * r * 0.2, rightFootY + r * 0.06, secondaryColor, Math.max(2, r * 0.13));
  ctx.restore();

  const torsoX = torsoCenterX - bodyWidth / 2;
  const torsoH = bodyHeight * 0.66;
  drawKitPattern(ctx, torsoX, torsoCenterY, bodyWidth, torsoH, r * 0.2, primaryColor, secondaryColor, kitStyle);

  ctx.save();
  ctx.strokeStyle = keeper ? "#ffd700" : "rgba(0,0,0,0.55)";
  ctx.lineWidth = keeper ? 2.4 : 1.4;
  roundedRectPath(ctx, torsoX, torsoCenterY, bodyWidth, torsoH, r * 0.2);
  ctx.stroke();
  ctx.restore();

  const sleeveColor = sleeveStyle === "secondary"
    ? secondaryColor
    : sleeveStyle === "split"
      ? rgba(secondaryColor, 0.88)
      : primaryColor;
  const shoulderY = torsoCenterY + torsoH * 0.2;
  const leftShoulderX = torsoCenterX - bodyWidth * 0.46;
  const rightShoulderX = torsoCenterX + bodyWidth * 0.46;
  const contestSpread = isContesting ? r * 0.42 : 0;
  const passPoint = isPassing && !isLongPass ? r * 0.11 * actionStrike : 0;
  const actionBalance = isLongPass
    ? r * 0.36 * actionStrike
    : isShooting
      ? r * 0.43 * actionStrike
      : isPassing
        ? r * 0.1 * actionStrike
        : 0;
  const leftHandX =
    leftShoulderX -
    bodyWidth * 0.42 +
    sideX * armSwing -
    frontX * (contestSpread + actionBalance);
  const leftHandY =
    shoulderY +
    r * 0.44 +
    sideY * armSwing * 0.3 -
    Math.abs(contestSpread + actionBalance) * 0.24;
  const rightHandX =
    rightShoulderX +
    bodyWidth * 0.42 -
    sideX * armSwing +
    frontX * (contestSpread + passPoint + actionBalance * 0.58);
  const rightHandY =
    shoulderY +
    r * 0.43 -
    sideY * armSwing * 0.3 -
    (passPoint + actionBalance * 0.42) * 0.28;

  line(ctx, leftShoulderX, shoulderY, leftHandX, leftHandY, sleeveColor, Math.max(3, r * 0.2));
  line(ctx, rightShoulderX, shoulderY, rightHandX, rightHandY, sleeveColor, Math.max(3, r * 0.2));
  ctx.save();
  ctx.fillStyle = appearance.skinTone;
  for (const [handX, handY] of [[leftHandX, leftHandY], [rightHandX, rightHandY]] as const) {
    ctx.beginPath();
    ctx.arc(handX, handY, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const headX = torsoCenterX + sideFacing * headRadius * 0.22;
  const headY = torsoCenterY - headRadius * 0.72 - (moving ? Math.abs(gait) * r * 0.025 : 0);
  ctx.save();
  ctx.fillStyle = appearance.skinTone;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(headX, headY, headRadius * (1 - Math.abs(sideFacing) * 0.08), headRadius, sideFacing * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawHair(ctx, appearance, headX, headY, headRadius, sideFacing, frontness);
  drawFace(ctx, appearance, headX, headY, headRadius, sideFacing, frontness);

  ctx.save();
  ctx.fillStyle = secondaryColor;
  ctx.font = `900 ${Math.round(r * 0.55)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(jerseyNumber), torsoCenterX, torsoCenterY + torsoH * 0.5);
  ctx.restore();

  const nameWidth = clamp(r * 3.55, 32, 64);
  const nameHeight = clamp(r * 0.68, 9, 15);
  const feetBottom = Math.max(leftFootY, rightFootY);
  const desiredNameY = feetBottom + r * 0.16;
  // Use the canvas drawing-coordinate height. clientHeight is CSS pixels and
  // caused labels to clamp far above mobile players on high-DPI screens.
  const canvasHeight = ctx.canvas.height;
  const nameY = clamp(
    desiredNameY,
    3,
    Math.max(3, canvasHeight - nameHeight - 3),
  );
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.76)";
  roundedRectPath(ctx, x - nameWidth / 2, nameY, nameWidth, nameHeight, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x - nameWidth / 2, nameY, nameWidth, nameHeight, 4);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(nameHeight * 0.55)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.slice(0, 10), x, nameY + nameHeight / 2);
  ctx.restore();

  if (offside) {
    const flagWidth = r * 1.1;
    const flagHeight = r * 0.62;
    ctx.save();
    ctx.fillStyle = "#ff1744";
    ctx.fillRect(x + r * 0.78, nameY + nameHeight * 0.05, flagWidth, flagHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.round(flagHeight * 0.55)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OS", x + r * 0.78 + flagWidth / 2, nameY + nameHeight * 0.05 + flagHeight / 2);
    ctx.restore();
  }
}
