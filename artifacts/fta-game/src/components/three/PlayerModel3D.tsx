import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export type PlayerRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "striker";

export type PlayerAnimationState =
  | "IDLE"
  | "MOVING"
  | "DRIBBLING"
  | "PASSING"
  | "SHOOTING"
  | "CONTESTING"
  | "RECOVERING";

type PlayerActionKey =
  | "idle"
  | "run"
  | "kick";

const MODEL_URL = "/models/players.gltf";

const CHARACTER_ROOT_NAMES = [
  "_gltfNode_0",
  "_gltfNode_46",
  "_gltfNode_92",
  "_gltfNode_138",
  "_gltfNode_184",
  "_gltfNode_230",
] as const;

/*
 * Root 4 is the neutral male outfield model.
 * Root 5 is the goalkeeper model.
 *
 * This avoids using the original black-and-yellow model as the
 * visible outfield player.
 */
const OUTFIELD_VISUAL_ROOT_INDEX = 4;
const GOALKEEPER_VISUAL_ROOT_INDEX = 5;

/*
 * Animation sources discovered inside the combined GLTF clip:
 *
 * Source 2 = neutral/idle
 * Source 0 = running
 * Source 1 = kicking
 */
const ACTION_SOURCE_INDEX: Record<PlayerActionKey, number> = {
  idle: 2,
  run: 0,
  kick: 1,
};

/*
 * The previous value was 1.72.
 * This makes the players approximately 10% smaller.
 */
const TARGET_PLAYER_HEIGHT = 1.55;

const MAX_TEXTURE_WIDTH = 1024;
const TURN_SPEED = 14;

/*
 * This is squared movement distance.
 * Keep it tiny so slow movement still updates facing.
 */
const MOVEMENT_EPSILON_SQUARED = 0.000001;

const ROLE_BADGE: Record<PlayerRole, string> = {
  goalkeeper: "GK",
  defender: "DEF",
  midfielder: "MID",
  forward: "FWD",
  striker: "ATK",
};

const ROLE_BADGE_COLOR: Record<PlayerRole, string> = {
  goalkeeper: "#c9a34b",
  defender: "#3d7dd8",
  midfielder: "#3fae5c",
  forward: "#d9483b",
  striker: "#d9483b",
};

const SKIN_HUE_MIN = 0.02;
const SKIN_HUE_MAX = 0.15;
const MIN_SATURATION = 0.12;

const recoloredTextureCache = new WeakMap<
  THREE.Texture,
  Map<string, THREE.CanvasTexture>
>();

function actionKeyForState(
  state: PlayerAnimationState,
): PlayerActionKey {
  switch (state) {
    case "MOVING":
    case "DRIBBLING":
    case "CONTESTING":
      return "run";

    case "PASSING":
    case "SHOOTING":
      return "kick";

    case "IDLE":
    case "RECOVERING":
    default:
      return "idle";
  }
}

function isOneShotState(
  state: PlayerAnimationState,
): boolean {
  return (
    state === "PASSING" ||
    state === "SHOOTING"
  );
}

function normalizeBoneName(
  name: string,
): string {
  return THREE.PropertyBinding
    .sanitizeNodeName(name)
    .replace(/_\d+$/, "")
    .toLowerCase();
}

function hueDistance(
  first: number,
  second: number,
): number {
  const difference =
    Math.abs(first - second);

  return Math.min(
    difference,
    1 - difference,
  );
}

function shortestAngleDifference(
  from: number,
  to: number,
): number {
  return Math.atan2(
    Math.sin(to - from),
    Math.cos(to - from),
  );
}

function dampAngle(
  current: number,
  target: number,
  speed: number,
  delta: number,
): number {
  const factor =
    1 - Math.exp(-speed * delta);

  return (
    current +
    shortestAngleDifference(
      current,
      target,
    ) *
      factor
  );
}

function getImageDimensions(image: {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(
      1,
      image.naturalWidth ??
        image.width ??
        MAX_TEXTURE_WIDTH,
    ),
    height: Math.max(
      1,
      image.naturalHeight ??
        image.height ??
        128,
    ),
  };
}

function recolorTexture(
  baseTexture: THREE.Texture,
  primaryHex: string,
  secondaryHex: string,
): THREE.CanvasTexture {
  const cacheKey =
    `${primaryHex}|${secondaryHex}`.toLowerCase();

  let variants =
    recoloredTextureCache.get(baseTexture);

  if (!variants) {
    variants =
      new Map<string, THREE.CanvasTexture>();

    recoloredTextureCache.set(
      baseTexture,
      variants,
    );
  }

  const cached =
    variants.get(cacheKey);

  if (cached) {
    return cached;
  }

  const image =
    baseTexture.image as
      | (CanvasImageSource & {
          width?: number;
          height?: number;
          naturalWidth?: number;
          naturalHeight?: number;
        })
      | undefined;

  if (!image) {
    throw new Error(
      "PlayerModel3D could not read the player texture.",
    );
  }

  const sourceSize =
    getImageDimensions(image);

  const outputWidth =
    Math.min(
      sourceSize.width,
      MAX_TEXTURE_WIDTH,
    );

  const outputHeight =
    Math.max(
      1,
      Math.round(
        sourceSize.height *
          (outputWidth /
            sourceSize.width),
      ),
    );

  const canvas =
    document.createElement("canvas");

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context =
    canvas.getContext("2d", {
      willReadFrequently: true,
    });

  if (!context) {
    throw new Error(
      "PlayerModel3D could not create a texture canvas.",
    );
  }

  context.drawImage(
    image,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const imageData =
    context.getImageData(
      0,
      0,
      outputWidth,
      outputHeight,
    );

  const pixels =
    imageData.data;

  const pixelColor =
    new THREE.Color();

  const outputColor =
    new THREE.Color();

  const pixelHsl = {
    h: 0,
    s: 0,
    l: 0,
  };

  const hueBuckets =
    new Map<number, number>();

  for (
    let index = 0;
    index < pixels.length;
    index += 16
  ) {
    pixelColor.setRGB(
      pixels[index] / 255,
      pixels[index + 1] / 255,
      pixels[index + 2] / 255,
    );

    pixelColor.getHSL(pixelHsl);

    const isSkin =
      pixelHsl.h >= SKIN_HUE_MIN &&
      pixelHsl.h <= SKIN_HUE_MAX;

    if (
      isSkin ||
      pixelHsl.s < MIN_SATURATION
    ) {
      continue;
    }

    const bucket =
      Math.floor(pixelHsl.h * 24) %
      24;

    hueBuckets.set(
      bucket,
      (hueBuckets.get(bucket) ?? 0) +
        1,
    );
  }

  const sortedBuckets =
    Array.from(
      hueBuckets.entries(),
    ).sort(
      (first, second) =>
        second[1] - first[1],
    );

  const sourcePrimaryHue =
    sortedBuckets.length > 0
      ? sortedBuckets[0][0] / 24
      : 0;

  let sourceSecondaryHue =
    sourcePrimaryHue;

  for (
    const [bucket] of
    sortedBuckets
  ) {
    const candidateHue =
      bucket / 24;

    if (
      hueDistance(
        candidateHue,
        sourcePrimaryHue,
      ) > 0.08
    ) {
      sourceSecondaryHue =
        candidateHue;

      break;
    }
  }

  const primaryHsl = {
    h: 0,
    s: 0,
    l: 0,
  };

  const secondaryHsl = {
    h: 0,
    s: 0,
    l: 0,
  };

  new THREE.Color(
    primaryHex,
  ).getHSL(primaryHsl);

  new THREE.Color(
    secondaryHex,
  ).getHSL(secondaryHsl);

  for (
    let index = 0;
    index < pixels.length;
    index += 4
  ) {
    pixelColor.setRGB(
      pixels[index] / 255,
      pixels[index + 1] / 255,
      pixels[index + 2] / 255,
    );

    pixelColor.getHSL(pixelHsl);

    const isSkin =
      pixelHsl.h >= SKIN_HUE_MIN &&
      pixelHsl.h <= SKIN_HUE_MAX;

    if (isSkin) {
      continue;
    }

    const isDarkNeutralCloth =
      pixelHsl.s < MIN_SATURATION &&
      pixelHsl.l < 0.38;

    const isColoredCloth =
      pixelHsl.s >= MIN_SATURATION;

    if (
      !isDarkNeutralCloth &&
      !isColoredCloth
    ) {
      continue;
    }

    const targetHsl =
      isDarkNeutralCloth
        ? secondaryHsl
        : hueDistance(
              pixelHsl.h,
              sourcePrimaryHue,
            ) <=
            hueDistance(
              pixelHsl.h,
              sourceSecondaryHue,
            )
          ? primaryHsl
          : secondaryHsl;

    outputColor.setHSL(
      targetHsl.h,
      Math.max(
        targetHsl.s * 0.75,
        isDarkNeutralCloth
          ? 0.35
          : pixelHsl.s,
      ),
      isDarkNeutralCloth
        ? THREE.MathUtils.lerp(
            0.2,
            0.48,
            pixelHsl.l / 0.38,
          )
        : pixelHsl.l,
    );

    pixels[index] =
      Math.round(
        outputColor.r * 255,
      );

    pixels[index + 1] =
      Math.round(
        outputColor.g * 255,
      );

    pixels[index + 2] =
      Math.round(
        outputColor.b * 255,
      );
  }

  context.putImageData(
    imageData,
    0,
    0,
  );

  const texture =
    new THREE.CanvasTexture(
      canvas,
    );

  texture.colorSpace =
    baseTexture.colorSpace;

  texture.flipY =
    baseTexture.flipY;

  texture.wrapS =
    baseTexture.wrapS;

  texture.wrapT =
    baseTexture.wrapT;

  texture.magFilter =
    THREE.LinearFilter;

  texture.minFilter =
    THREE.LinearFilter;

  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  variants.set(
    cacheKey,
    texture,
  );

  return texture;
}

function findRoot(
  scene: THREE.Object3D,
  rootIndex: number,
): THREE.Object3D | null {
  return (
    scene.getObjectByName(
      CHARACTER_ROOT_NAMES[rootIndex],
    ) ?? null
  );
}

function collectMeshes(
  root: THREE.Object3D,
): Set<THREE.Mesh> {
  const meshes =
    new Set<THREE.Mesh>();

  root.traverse((object) => {
    const mesh =
      object as THREE.Mesh;

    if (mesh.isMesh) {
      meshes.add(mesh);
    }
  });

  if (
    root instanceof THREE.Mesh
  ) {
    meshes.add(root);
  }

  return meshes;
}

function collectBoneMap(
  meshes: Set<THREE.Mesh>,
): Map<string, string> {
  const map =
    new Map<string, string>();

  for (const mesh of meshes) {
    if (
      !(
        mesh instanceof
        THREE.SkinnedMesh
      )
    ) {
      continue;
    }

    for (
      const bone of
      mesh.skeleton.bones
    ) {
      map.set(
        normalizeBoneName(
          bone.name,
        ),
        bone.name,
      );
    }
  }

  return map;
}

function collectSourceBoneNames(
  scene: THREE.Object3D,
  sourceRootIndex: number,
): Set<string> {
  const sourceRoot =
    findRoot(
      scene,
      sourceRootIndex,
    );

  if (!sourceRoot) {
    return new Set<string>();
  }

  const meshes =
    collectMeshes(sourceRoot);

  const names =
    new Set<string>();

  for (const mesh of meshes) {
    if (
      !(
        mesh instanceof
        THREE.SkinnedMesh
      )
    ) {
      continue;
    }

    for (
      const bone of
      mesh.skeleton.bones
    ) {
      names.add(bone.name);

      names.add(
        THREE.PropertyBinding
          .sanitizeNodeName(
            bone.name,
          ),
      );
    }
  }

  return names;
}

function createRetargetedClip(
  sourceClip: THREE.AnimationClip,
  sourceScene: THREE.Object3D,
  sourceRootIndex: number,
  targetBoneMap: Map<string, string>,
  actionKey: PlayerActionKey,
  clipName: string,
): THREE.AnimationClip | null {
  const sourceNames =
    collectSourceBoneNames(
      sourceScene,
      sourceRootIndex,
    );

  const tracks:
    THREE.KeyframeTrack[] = [];

  for (
    const sourceTrack of
    sourceClip.tracks
  ) {
    let parsed:
      ReturnType<
        typeof THREE.PropertyBinding.parseTrackName
      >;

    try {
      parsed =
        THREE.PropertyBinding.parseTrackName(
          sourceTrack.name,
        );
    } catch {
      continue;
    }

    const rawNodeName =
      parsed.nodeName;

    const sanitizedNodeName =
      THREE.PropertyBinding
        .sanitizeNodeName(
          rawNodeName,
        );

    if (
      !sourceNames.has(
        rawNodeName,
      ) &&
      !sourceNames.has(
        sanitizedNodeName,
      )
    ) {
      continue;
    }

    /*
     * Scale tracks from Blender are unnecessary here and can produce
     * body stretching when retargeted between characters.
     */
    if (
      parsed.propertyName ===
      "scale"
    ) {
      continue;
    }

    const normalizedSourceName =
      normalizeBoneName(
        rawNodeName,
      );

    /*
     * The root translation in the source animation contains movement
     * through the original GLTF scene. The game already moves the player,
     * so keeping that track would make the model slide away from its tile.
     */
    if (
      normalizedSourceName ===
        "spine" &&
      parsed.propertyName ===
        "position"
    ) {
      continue;
    }

    const targetBoneName =
      targetBoneMap.get(
        normalizedSourceName,
      );

    if (!targetBoneName) {
      continue;
    }

    const clonedTrack =
      sourceTrack.clone();

    clonedTrack.name =
      `${targetBoneName}.${parsed.propertyName}`;

    tracks.push(clonedTrack);
  }

  if (tracks.length === 0) {
    return null;
  }

  let clip =
    new THREE.AnimationClip(
      clipName,
      sourceClip.duration,
      tracks,
    );

  /*
   * The combined kicking animation contains a long neutral lead-in.
   * Trim it so the actual kick starts immediately instead of the
   * player standing still before passing or shooting.
   */
  if (actionKey === "kick") {
    clip =
      THREE.AnimationUtils.subclip(
        clip,
        clipName,
        14,
        60,
        24,
      );
  }

  clip.optimize();

  return clip;
}

function createPlayerMaterial(
  sourceMaterial: THREE.Material,
  primaryColor: string,
  secondaryColor: string,
): THREE.Material {
  const material =
    sourceMaterial.clone();

  if (
    material instanceof
    THREE.MeshStandardMaterial
  ) {
    material.color.set(
      0xffffff,
    );

    material.vertexColors = false;
    material.metalness = 0;
    material.roughness = 0.72;
    material.aoMapIntensity = 0.1;

    const source =
      sourceMaterial as
        THREE.MeshStandardMaterial;

    if (source.map) {
      material.map =
        recolorTexture(
          source.map,
          primaryColor,
          secondaryColor,
        );

      material.emissive.set(
        0xffffff,
      );

      material.emissiveMap =
        material.map;

      material.emissiveIntensity =
        0.045;
    }

    material.needsUpdate = true;
  }

  return material;
}

interface PlayerModel3DProps {
  x: number;
  z: number;
  facing?: number;
  characterIndex?: 0 | 1 | 2;
  teamColor: string;
  secondaryColor?: string;
  jerseyNumber: number;
  name: string;
  role: PlayerRole;
  isSelected?: boolean;
  hasBall?: boolean;
  offside?: boolean;
  playerState?: PlayerAnimationState;
}

export function PlayerModel3D({
  x,
  z,
  facing,
  teamColor,
  secondaryColor,
  jerseyNumber,
  name,
  role,
  isSelected = false,
  hasBall = false,
  offside = false,
  playerState = "IDLE",
}: PlayerModel3DProps) {
  const {
    scene,
    animations,
  } = useGLTF(MODEL_URL);

  const [
    model,
    setModel,
  ] =
    useState<THREE.Group | null>(
      null,
    );

  const [
    height,
    setHeight,
  ] =
    useState(
      TARGET_PLAYER_HEIGHT,
    );

  const outerGroupRef =
    useRef<THREE.Group>(
      null,
    );

  const mixerRef =
    useRef<THREE.AnimationMixer | null>(
      null,
    );

  const actionsRef =
    useRef<
      Map<
        PlayerActionKey,
        THREE.AnimationAction
      >
    >(
      new Map(),
    );

  const currentActionRef =
    useRef<THREE.AnimationAction | null>(
      null,
    );

  const oneShotActionRef =
    useRef<THREE.AnimationAction | null>(
      null,
    );

  const desiredStateRef =
    useRef<PlayerAnimationState>(
      playerState,
    );

  const playStateRef =
    useRef<
      (
        state: PlayerAnimationState,
        force?: boolean,
      ) => void
    >(() => {});

  const previousPositionRef =
    useRef(
      new THREE.Vector2(
        x,
        z,
      ),
    );

  const targetFacingRef =
    useRef(
      facing ?? 0,
    );

  const currentFacingRef =
    useRef(
      facing ?? 0,
    );

  const badge =
    ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  const resolvedSecondaryColor =
    secondaryColor ??
    teamColor;

  useFrame((_, delta) => {
    const safeDelta =
      Math.min(
        delta,
        0.05,
      );

    mixerRef.current?.update(
      safeDelta,
    );

    const previousPosition =
      previousPositionRef.current;

    const differenceX =
      x - previousPosition.x;

    const differenceZ =
      z - previousPosition.y;

    const movementDistanceSquared =
      differenceX *
        differenceX +
      differenceZ *
        differenceZ;

    /*
     * Movement direction takes priority while the player is moving.
     * When stationary, use the explicit facing supplied for a pass,
     * shot, or planned command.
     */
    if (
      movementDistanceSquared >
      MOVEMENT_EPSILON_SQUARED
    ) {
      targetFacingRef.current =
        Math.atan2(
          differenceX,
          differenceZ,
        );
    } else if (
      facing !== undefined &&
      Number.isFinite(facing)
    ) {
      targetFacingRef.current =
        facing;
    }

    previousPosition.set(
      x,
      z,
    );

    /*
     * There is intentionally no PI offset here.
     * The former Math.PI offset caused every player to face exactly
     * opposite their real movement direction.
     */
    currentFacingRef.current =
      dampAngle(
        currentFacingRef.current,
        targetFacingRef.current,
        TURN_SPEED,
        safeDelta,
      );

    if (
      outerGroupRef.current
    ) {
      outerGroupRef.current.rotation.y =
        currentFacingRef.current;
    }
  });

  useEffect(() => {
    setModel(null);
    setHeight(
      TARGET_PLAYER_HEIGHT,
    );

    mixerRef.current?.stopAllAction();

    mixerRef.current = null;
    actionsRef.current.clear();
    currentActionRef.current = null;
    oneShotActionRef.current = null;
    playStateRef.current = () => {};

    previousPositionRef.current.set(
      x,
      z,
    );

    if (
      facing !== undefined &&
      Number.isFinite(facing)
    ) {
      targetFacingRef.current =
        facing;

      currentFacingRef.current =
        facing;
    }

    const ownedMaterials:
      THREE.Material[] = [];

    const generatedClips:
      THREE.AnimationClip[] = [];

    let clone:
      THREE.Group | null =
        null;

    let mixer:
      THREE.AnimationMixer | null =
        null;

    let finishedListener:
      ((event: {
        action: THREE.AnimationAction;
      }) => void) | null =
        null;

    try {
      clone =
        SkeletonUtils.clone(
          scene,
        ) as THREE.Group;

      clone.name =
        `FTA ${role} ${jerseyNumber}`;

      clone.position.set(
        0,
        0,
        0,
      );

      clone.rotation.set(
        0,
        0,
        0,
      );

      clone.scale.set(
        1,
        1,
        1,
      );

      clone.visible = true;

      clone.updateMatrixWorld(
        true,
      );

      const visualRootIndex =
        role === "goalkeeper"
          ? GOALKEEPER_VISUAL_ROOT_INDEX
          : OUTFIELD_VISUAL_ROOT_INDEX;

      const selectedRoot =
        findRoot(
          clone,
          visualRootIndex,
        );

      if (!selectedRoot) {
        throw new Error(
          `Could not find visual root ${
            CHARACTER_ROOT_NAMES[
              visualRootIndex
            ]
          }.`,
        );
      }

      const selectedMeshes =
        collectMeshes(
          selectedRoot,
        );

      if (
        selectedMeshes.size === 0
      ) {
        throw new Error(
          "Selected player root contains no meshes.",
        );
      }

      clone.traverse((object) => {
        const mesh =
          object as THREE.Mesh;

        if (!mesh.isMesh) {
          return;
        }

        const selected =
          selectedMeshes.has(mesh);

        mesh.visible = selected;

        if (!selected) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;

          return;
        }

        const sourceMaterials =
          Array.isArray(
            mesh.material,
          )
            ? mesh.material
            : [mesh.material];

        const playerMaterials =
          sourceMaterials.map(
            (sourceMaterial) => {
              const material =
                createPlayerMaterial(
                  sourceMaterial,
                  teamColor,
                  resolvedSecondaryColor,
                );

              ownedMaterials.push(
                material,
              );

              return material;
            },
          );

        mesh.material =
          Array.isArray(
            mesh.material,
          )
            ? playerMaterials
            : playerMaterials[0];

        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;

        if (
          mesh instanceof
          THREE.SkinnedMesh
        ) {
          mesh.normalizeSkinWeights();
          mesh.skeleton.update();
        }
      });

      clone.updateMatrixWorld(
        true,
      );

      const boundingBox =
        new THREE.Box3();

      for (
        const mesh of
        selectedMeshes
      ) {
        mesh.updateWorldMatrix(
          true,
          false,
        );

        boundingBox.expandByObject(
          mesh,
          true,
        );
      }

      if (
        boundingBox.isEmpty()
      ) {
        throw new Error(
          "Player model produced an empty bounding box.",
        );
      }

      const center =
        boundingBox.getCenter(
          new THREE.Vector3(),
        );

      const originalHeight =
        boundingBox.max.y -
        boundingBox.min.y;

      if (
        !Number.isFinite(
          originalHeight,
        ) ||
        originalHeight <= 0
      ) {
        throw new Error(
          "Player model produced an invalid height.",
        );
      }

      const playerScale =
        TARGET_PLAYER_HEIGHT /
        originalHeight;

      clone.scale.setScalar(
        playerScale,
      );

      clone.position.set(
        -center.x *
          playerScale,
        -boundingBox.min.y *
          playerScale,
        -center.z *
          playerScale,
      );

      clone.updateMatrixWorld(
        true,
      );

      const sourceClip =
        animations[0];

      if (sourceClip) {
        const targetBoneMap =
          collectBoneMap(
            selectedMeshes,
          );

        mixer =
          new THREE.AnimationMixer(
            clone,
          );

        const actionKeys:
          PlayerActionKey[] = [
            "idle",
            "run",
            "kick",
          ];

        for (
          const actionKey of
          actionKeys
        ) {
          const clip =
            createRetargetedClip(
              sourceClip,
              scene,
              ACTION_SOURCE_INDEX[
                actionKey
              ],
              targetBoneMap,
              actionKey,
              `fta-${actionKey}-${jerseyNumber}`,
            );

          if (!clip) {
            continue;
          }

          generatedClips.push(
            clip,
          );

          const action =
            mixer.clipAction(
              clip,
            );

          action.enabled = true;

          action.setEffectiveWeight(
            1,
          );

          if (
            actionKey === "kick"
          ) {
            action.setLoop(
              THREE.LoopOnce,
              1,
            );

            action.clampWhenFinished =
              true;
          } else {
            action.setLoop(
              THREE.LoopRepeat,
              Infinity,
            );

            action.clampWhenFinished =
              false;
          }

          actionsRef.current.set(
            actionKey,
            action,
          );
        }

        const playState = (
          requestedState:
            PlayerAnimationState,
          force = false,
        ) => {
          const requestedKey =
            actionKeyForState(
              requestedState,
            );

          const nextAction =
            actionsRef.current.get(
              requestedKey,
            );

          if (!nextAction) {
            return;
          }

          const lockedAction =
            oneShotActionRef.current;

          /*
           * Do not allow idle or running to instantly cancel a visible
           * pass or shot. Wait until the kick animation finishes.
           */
          if (
            lockedAction &&
            !force &&
            lockedAction !==
              nextAction
          ) {
            return;
          }

          const previousAction =
            currentActionRef.current;

          const oneShot =
            isOneShotState(
              requestedState,
            );

          if (
            previousAction ===
            nextAction
          ) {
            if (oneShot) {
              nextAction.reset();

              nextAction.setEffectiveTimeScale(
                requestedState ===
                  "SHOOTING"
                  ? 2.7
                  : 2.45,
              );

              nextAction
                .fadeIn(0.06)
                .play();

              oneShotActionRef.current =
                nextAction;
            } else if (
              !nextAction.isRunning()
            ) {
              nextAction.reset();

              nextAction.setEffectiveTimeScale(
                requestedKey ===
                  "run"
                  ? 1.2
                  : 0.8,
              );

              nextAction.play();
            }

            currentActionRef.current =
              nextAction;

            return;
          }

          if (previousAction) {
            previousAction.fadeOut(
              oneShot
                ? 0.06
                : 0.12,
            );
          }

          nextAction.reset();
          nextAction.enabled = true;

          nextAction.setEffectiveWeight(
            1,
          );

          if (oneShot) {
            nextAction.setLoop(
              THREE.LoopOnce,
              1,
            );

            nextAction.clampWhenFinished =
              true;

            nextAction.setEffectiveTimeScale(
              requestedState ===
                "SHOOTING"
                ? 2.7
                : 2.45,
            );

            oneShotActionRef.current =
              nextAction;
          } else {
            nextAction.setLoop(
              THREE.LoopRepeat,
              Infinity,
            );

            nextAction.clampWhenFinished =
              false;

            nextAction.setEffectiveTimeScale(
              requestedKey ===
                "run"
                ? 1.2
                : 0.8,
            );
          }

          nextAction
            .fadeIn(
              oneShot
                ? 0.06
                : 0.12,
            )
            .play();

          currentActionRef.current =
            nextAction;
        };

        playStateRef.current =
          playState;

        finishedListener = (
          event,
        ) => {
          if (
            event.action !==
            oneShotActionRef.current
          ) {
            return;
          }

          oneShotActionRef.current =
            null;

          const desiredState =
            desiredStateRef.current;

          /*
           * If the engine still says PASSING or SHOOTING after the
           * animation finishes, return to idle rather than repeatedly
           * kicking forever.
           */
          const nextState =
            isOneShotState(
              desiredState,
            )
              ? "IDLE"
              : desiredState;

          playStateRef.current(
            nextState,
            true,
          );
        };

        mixer.addEventListener(
          "finished",
          finishedListener as never,
        );

        mixerRef.current =
          mixer;
      }

      setModel(clone);
      setHeight(
        TARGET_PLAYER_HEIGHT,
      );

      return () => {
        if (
          mixer &&
          finishedListener
        ) {
          mixer.removeEventListener(
            "finished",
            finishedListener as never,
          );
        }

        currentActionRef.current?.stop();
        mixer?.stopAllAction();

        for (
          const clip of
          generatedClips
        ) {
          mixer?.uncacheClip(
            clip,
          );
        }

        if (clone) {
          mixer?.uncacheRoot(
            clone,
          );
        }

        if (
          mixerRef.current ===
          mixer
        ) {
          mixerRef.current =
            null;
        }

        actionsRef.current.clear();
        currentActionRef.current = null;
        oneShotActionRef.current = null;
        playStateRef.current = () => {};

        for (
          const material of
          ownedMaterials
        ) {
          material.dispose();
        }
      };
    } catch (error) {
      console.error(
        "PlayerModel3D setup failed:",
        error,
      );

      mixer?.stopAllAction();

      for (
        const material of
        ownedMaterials
      ) {
        material.dispose();
      }

      setModel(null);

      return;
    }
  }, [
    scene,
    animations,
    role,
    jerseyNumber,
    teamColor,
    resolvedSecondaryColor,
  ]);

  useEffect(() => {
    desiredStateRef.current =
      playerState;

    if (!model) {
      return;
    }

    playStateRef.current(
      playerState,
    );
  }, [
    playerState,
    model,
  ]);

  if (!model) {
    return null;
  }

  return (
    <group
      position={[
        x,
        0,
        z,
      ]}
    >
      <group
        ref={
          outerGroupRef
        }
        rotation={[
          0,
          currentFacingRef.current,
          0,
        ]}
      >
        {(isSelected ||
          hasBall) && (
          <mesh
            position={[
              0,
              0.015,
              0,
            ]}
            rotation={[
              -Math.PI / 2,
              0,
              0,
            ]}
          >
            <ringGeometry
              args={[
                0.29,
                0.37,
                32,
              ]}
            />

            <meshBasicMaterial
              color={
                isSelected
                  ? "#5fe0ff"
                  : "#ffd700"
              }
              transparent
              opacity={0.85}
              depthWrite={false}
            />
          </mesh>
        )}

        <primitive
          object={model}
          dispose={null}
        />
      </group>

      <Billboard
        position={[
          0,
          height + 0.16,
          0,
        ]}
      >
        <mesh
          position={[
            0,
            0,
            -0.01,
          ]}
        >
          <planeGeometry
            args={[
              0.91,
              0.22,
            ]}
          />

          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.6}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>

        <Text
          position={[
            -0.17,
            0.04,
            0,
          ]}
          fontSize={0.08}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          depthOffset={-2}
        >
          {`${jerseyNumber} ${name}`}
        </Text>

        <Text
          position={[
            0.31,
            0.04,
            0,
          ]}
          fontSize={0.065}
          color={badgeColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          depthOffset={-2}
        >
          {badge}
        </Text>
      </Billboard>

      {offside && (
        <Billboard
          position={[
            0.44,
            height + 0.16,
            0,
          ]}
        >
          <mesh>
            <planeGeometry
              args={[
                0.3,
                0.17,
              ]}
            />

            <meshBasicMaterial
              color="#ff1744"
              depthTest={false}
              depthWrite={false}
            />
          </mesh>

          <Text
            fontSize={0.085}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            depthOffset={-3}
          >
            OS
          </Text>
        </Billboard>
      )}
    </group>
  );
}

useGLTF.preload(MODEL_URL);