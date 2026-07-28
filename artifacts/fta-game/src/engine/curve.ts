import type { Command, PlayerStats, Vec2 } from "./types";
import { CommandType } from "./types";
import {
  getLinearPixelSpeed,
  PITCH_HEIGHT,
  PITCH_WIDTH,
  TURN_DURATION,
} from "./constants";

export type CurveMechanic = "move" | "groundPass" | "longPass" | "shot";

export interface CurveMotion {
  points: Vec2[];
  index: number;
  travelled: number;
  totalLength: number;
}

export interface CurveAdvance {
  position: Vec2;
  direction: Vec2;
  distanceMoved: number;
  arrived: boolean;
}

const EPSILON = 0.001;
const MIN_CURVE_POINTS = 2;
const DEFAULT_SAMPLES_PER_SEGMENT = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFinitePoint(point: Vec2 | undefined): point is Vec2 {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= EPSILON) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function quadraticPoint(start: Vec2, control: Vec2, end: Vec2, t: number): Vec2 {
  const inverse = 1 - t;
  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * t * control.x +
      t * t * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * t * control.y +
      t * t * end.y,
  };
}

function pointSegmentDistance(
  point: Vec2,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): { distance: number; progress: number } {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) {
    return { distance: distance(point, segmentStart), progress: 0 };
  }

  const progress = clamp(
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
      lengthSquared,
    0,
    1,
  );
  const closest = {
    x: segmentStart.x + dx * progress,
    y: segmentStart.y + dy * progress,
  };
  return { distance: distance(point, closest), progress };
}

function polylineLength(start: Vec2, points: Vec2[]): number {
  let total = 0;
  let previous = start;
  for (const point of points) {
    total += distance(previous, point);
    previous = point;
  }
  return total;
}

export function curvePointLimit(stat: number): 2 | 3 | 4 | 5 {
  const normalized = clamp(
    Number.isFinite(stat) ? Math.round(stat) : 1,
    1,
    10,
  );
  if (normalized <= 4) return 2;
  if (normalized <= 6) return 3;
  if (normalized <= 8) return 4;
  return 5;
}

export function curveMechanicForCommand(command: Command): CurveMechanic {
  if (command.type === CommandType.MOVE) return "move";
  if (command.type === CommandType.SHOOT) return "shot";
  return command.passStyle === "long" ? "longPass" : "groundPass";
}

export function curveStatForMechanic(
  stats: PlayerStats,
  mechanic: CurveMechanic,
): number {
  switch (mechanic) {
    case "move":
      return stats.movement;
    case "groundPass":
      return stats.passing;
    case "longPass":
      return stats.longPassing;
    case "shot":
      return stats.shooting;
  }
}

export function curvePointLimitForMechanic(
  stats: PlayerStats,
  mechanic: CurveMechanic,
): 2 | 3 | 4 | 5 {
  return curvePointLimit(curveStatForMechanic(stats, mechanic));
}

export function curvePointLimitForCommand(
  stats: PlayerStats,
  command: Command,
): 2 | 3 | 4 | 5 {
  return curvePointLimitForMechanic(stats, curveMechanicForCommand(command));
}

export function sanitizeCurvePoints(
  points: Vec2[] | undefined,
  limit: number,
): Vec2[] {
  if (!Array.isArray(points) || limit < MIN_CURVE_POINTS) return [];

  const sanitized: Vec2[] = [];
  for (const rawPoint of points) {
    if (!isFinitePoint(rawPoint)) continue;
    const point = {
      x: clamp(rawPoint.x, 0, PITCH_WIDTH),
      y: clamp(rawPoint.y, 0, PITCH_HEIGHT),
    };
    const previous = sanitized[sanitized.length - 1];
    if (previous && distance(previous, point) < 2) continue;
    sanitized.push(point);
    if (sanitized.length >= limit) break;
  }

  return sanitized.length >= MIN_CURVE_POINTS ? sanitized : [];
}

/**
 * Samples a continuous chain of quadratic Bézier segments. For adjacent
 * controls, the shared endpoint is their midpoint, which keeps the tangent
 * continuous. The last segment always lands on the real action target.
 */
export function sampleChainedCurve(
  start: Vec2,
  controls: Vec2[],
  target: Vec2,
  samplesPerSegment = DEFAULT_SAMPLES_PER_SEGMENT,
): Vec2[] {
  if (!isFinitePoint(start) || !isFinitePoint(target)) return [];
  if (controls.length < MIN_CURVE_POINTS) return [{ ...target }];

  const samples: Vec2[] = [];
  let segmentStart = { ...start };
  const steps = Math.max(4, Math.floor(samplesPerSegment));

  for (let index = 0; index < controls.length; index++) {
    const control = controls[index];
    const segmentEnd =
      index === controls.length - 1
        ? target
        : midpoint(control, controls[index + 1]);

    for (let step = 1; step <= steps; step++) {
      samples.push(
        quadraticPoint(segmentStart, control, segmentEnd, step / steps),
      );
    }
    segmentStart = segmentEnd;
  }

  const last = samples[samples.length - 1];
  if (!last || distance(last, target) > EPSILON) samples.push({ ...target });
  else samples[samples.length - 1] = { ...target };
  return samples;
}

export function createCurveMotion(
  start: Vec2,
  controls: Vec2[],
  target: Vec2,
): CurveMotion {
  const points = sampleChainedCurve(start, controls, target);
  return {
    points,
    index: 0,
    travelled: 0,
    totalLength: Math.max(EPSILON, polylineLength(start, points)),
  };
}

export function advanceCurveMotion(
  currentPosition: Vec2,
  motion: CurveMotion,
  distanceBudget: number,
): CurveAdvance {
  let position = { ...currentPosition };
  let remaining = Math.max(0, distanceBudget);
  let moved = 0;
  let lastDirection = { x: 0, y: 0 };

  while (motion.index < motion.points.length && remaining > EPSILON) {
    const target = motion.points[motion.index];
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    const segmentDistance = Math.hypot(dx, dy);

    if (segmentDistance <= EPSILON) {
      position = { ...target };
      motion.index += 1;
      continue;
    }

    lastDirection = { x: dx / segmentDistance, y: dy / segmentDistance };
    if (segmentDistance <= remaining + EPSILON) {
      position = { ...target };
      remaining -= segmentDistance;
      moved += segmentDistance;
      motion.index += 1;
    } else {
      position = {
        x: position.x + lastDirection.x * remaining,
        y: position.y + lastDirection.y * remaining,
      };
      moved += remaining;
      remaining = 0;
    }
  }

  motion.travelled = Math.min(motion.totalLength, motion.travelled + moved);
  return {
    position,
    direction: lastDirection,
    distanceMoved: moved,
    arrived: motion.index >= motion.points.length,
  };
}

export function curveMotionProgress(motion: CurveMotion | undefined): number {
  if (!motion) return 0;
  return clamp(motion.travelled / Math.max(EPSILON, motion.totalLength), 0, 1);
}

export function curveRouteLength(
  start: Vec2,
  controls: Vec2[],
  target: Vec2,
): number {
  return polylineLength(start, sampleChainedCurve(start, controls, target));
}

export function curveRouteFitsMoveBudget(
  start: Vec2,
  controls: Vec2[],
  target: Vec2,
  speed: number,
): boolean {
  const maximumDistance = getLinearPixelSpeed(speed) * TURN_DURATION;
  return curveRouteLength(start, controls, target) <= maximumDistance + 1;
}

export interface TacticalCurveOptions {
  mechanic: CurveMechanic;
  maxPoints: number;
}

interface BlockerProjection {
  position: Vec2;
  progress: number;
  laneDistance: number;
}

function laneSettings(mechanic: CurveMechanic): {
  radius: number;
  offset: number;
} {
  switch (mechanic) {
    case "move":
      return { radius: 22, offset: 31 };
    case "groundPass":
      return { radius: 28, offset: 48 };
    case "longPass":
      return { radius: 25, offset: 54 };
    case "shot":
      return { radius: 31, offset: 58 };
  }
}

function minimumPathClearance(
  start: Vec2,
  path: Vec2[],
  opponents: Vec2[],
): number {
  if (opponents.length === 0) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  let previous = start;
  for (const point of path) {
    for (const opponent of opponents) {
      minimum = Math.min(
        minimum,
        pointSegmentDistance(opponent, previous, point).distance,
      );
    }
    previous = point;
  }
  return minimum;
}

/**
 * Builds a deterministic detour only when a direct lane is meaningfully
 * blocked and the sampled curve creates more clearance. No random roll is
 * involved: identical game states always return the same controls.
 */
export function planTacticalCurve(
  start: Vec2,
  target: Vec2,
  opponents: Vec2[],
  options: TacticalCurveOptions,
): Vec2[] | undefined {
  const maxPoints = clamp(
    Math.floor(options.maxPoints),
    MIN_CURVE_POINTS,
    5,
  );
  const settings = laneSettings(options.mechanic);
  const directLength = distance(start, target);
  if (directLength < 35 || opponents.length === 0) return undefined;

  const blockers: BlockerProjection[] = opponents
    .map((position) => {
      const projection = pointSegmentDistance(position, start, target);
      return {
        position,
        progress: projection.progress,
        laneDistance: projection.distance,
      };
    })
    .filter((blocker) => {
      if (
        blocker.progress <= 0.1 ||
        blocker.progress >= 0.92 ||
        blocker.laneDistance > settings.radius
      ) {
        return false;
      }
      if (options.mechanic === "longPass") {
        return blocker.progress <= 0.32 || blocker.progress >= 0.68;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.progress - b.progress ||
        a.position.y - b.position.y ||
        a.position.x - b.position.x,
    );

  if (blockers.length === 0) return undefined;

  const directVector = normalize({
    x: target.x - start.x,
    y: target.y - start.y,
  });
  const perpendicular = { x: -directVector.y, y: directVector.x };
  const primary = blockers.reduce((best, blocker) =>
    blocker.laneDistance < best.laneDistance ? blocker : best,
  );
  const baseProgresses = [
    clamp(primary.progress - 0.14, 0.12, 0.82),
    clamp(primary.progress + 0.14, 0.18, 0.88),
    ...blockers
      .filter((blocker) => blocker !== primary)
      .map((blocker) => blocker.progress),
  ]
    .sort((a, b) => a - b)
    .filter(
      (progress, index, list) =>
        index === 0 || Math.abs(progress - list[index - 1]) >= 0.06,
    )
    .slice(0, maxPoints);

  while (baseProgresses.length < MIN_CURVE_POINTS) {
    baseProgresses.push(
      clamp((baseProgresses[0] ?? primary.progress) + 0.12, 0.18, 0.88),
    );
  }

  const directClearance = minimumPathClearance(start, [target], opponents);
  let best:
    | { controls: Vec2[]; clearance: number; length: number; side: number }
    | undefined;

  for (const side of [-1, 1]) {
    const controls = baseProgresses.map((progress) => {
      const center = {
        x: start.x + (target.x - start.x) * progress,
        y: start.y + (target.y - start.y) * progress,
      };
      return {
        x: clamp(
          center.x + perpendicular.x * settings.offset * side,
          4,
          PITCH_WIDTH - 4,
        ),
        y: clamp(
          center.y + perpendicular.y * settings.offset * side,
          4,
          PITCH_HEIGHT - 4,
        ),
      };
    });
    const path = sampleChainedCurve(start, controls, target);
    const clearance = minimumPathClearance(start, path, opponents);
    const length = polylineLength(start, path);
    const candidate = { controls, clearance, length, side };

    if (
      !best ||
      candidate.clearance > best.clearance + EPSILON ||
      (Math.abs(candidate.clearance - best.clearance) <= EPSILON &&
        (candidate.length < best.length - EPSILON ||
          (Math.abs(candidate.length - best.length) <= EPSILON &&
            candidate.side < best.side)))
    ) {
      best = candidate;
    }
  }

  if (!best) return undefined;
  if (best.clearance < directClearance + 5) return undefined;
  if (best.clearance < settings.radius * 0.72) return undefined;
  return best.controls;
}

