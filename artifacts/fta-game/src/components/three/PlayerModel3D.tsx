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

const MODEL_URL = "/models/players.gltf";

const MALE_ROOT_NAMES = [
  "_gltfNode_0",
  "_gltfNode_46",
  "_gltfNode_92",
] as const;

const TARGET_PLAYER_HEIGHT = 1.72;
const MAX_TEXTURE_WIDTH = 1024;

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
const MIN_SATURATION = 0.15;

const recoloredTextureCache = new WeakMap<
  THREE.Texture,
  Map<string, THREE.CanvasTexture>
>();

function hueDistance(a: number, b: number): number {
  const difference = Math.abs(a - b);
  return Math.min(difference, 1 - difference);
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

  let textureVariants =
    recoloredTextureCache.get(baseTexture);

  if (!textureVariants) {
    textureVariants =
      new Map<string, THREE.CanvasTexture>();

    recoloredTextureCache.set(
      baseTexture,
      textureVariants,
    );
  }

  const cachedTexture =
    textureVariants.get(cacheKey);

  if (cachedTexture) {
    return cachedTexture;
  }

  const image = baseTexture.image as
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

  const outputWidth = Math.min(
    sourceSize.width,
    MAX_TEXTURE_WIDTH,
  );

  const outputHeight = Math.max(
    1,
    Math.round(
      sourceSize.height *
        (outputWidth / sourceSize.width),
    ),
  );

  const canvas =
    document.createElement("canvas");

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d", {
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

  const imageData = context.getImageData(
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const pixels = imageData.data;

  const pixelColor = new THREE.Color();
  const outputColor = new THREE.Color();

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
      Math.floor(pixelHsl.h * 24) % 24;

    hueBuckets.set(
      bucket,
      (hueBuckets.get(bucket) ?? 0) + 1,
    );
  }

  const sortedBuckets =
    Array.from(hueBuckets.entries()).sort(
      (first, second) =>
        second[1] - first[1],
    );

  const sourcePrimaryHue =
    sortedBuckets.length > 0
      ? sortedBuckets[0][0] / 24
      : 0;

  let sourceSecondaryHue =
    sourcePrimaryHue;

  for (const [bucket] of sortedBuckets) {
    const candidateHue = bucket / 24;

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

  new THREE.Color(primaryHex).getHSL(
    primaryHsl,
  );

  new THREE.Color(secondaryHex).getHSL(
    secondaryHsl,
  );

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

    const isGray =
      pixelHsl.s < MIN_SATURATION;

    if (isSkin || isGray) {
      continue;
    }

    const targetHsl =
      hueDistance(
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
        pixelHsl.s,
        targetHsl.s * 0.65,
      ),
      pixelHsl.l,
    );

    pixels[index] =
      Math.round(outputColor.r * 255);

    pixels[index + 1] =
      Math.round(outputColor.g * 255);

    pixels[index + 2] =
      Math.round(outputColor.b * 255);
  }

  context.putImageData(
    imageData,
    0,
    0,
  );

  const texture =
    new THREE.CanvasTexture(canvas);

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

  textureVariants.set(
    cacheKey,
    texture,
  );

  return texture;
}

function findSelectedPlayer(
  scene: THREE.Object3D,
  characterIndex: 0 | 1 | 2,
): THREE.Object3D | null {
  const expectedName =
    MALE_ROOT_NAMES[characterIndex];

  const expectedPlayer =
    scene.getObjectByName(expectedName);

  if (expectedPlayer) {
    return expectedPlayer;
  }

  const maleMeshes:
    THREE.SkinnedMesh[] = [];

  scene.traverse((object) => {
    if (
      object instanceof
      THREE.SkinnedMesh
    ) {
      maleMeshes.push(object);
    }
  });

  return maleMeshes[characterIndex] ?? null;
}

function collectSelectedMeshes(
  selectedRoot: THREE.Object3D,
): Set<THREE.Mesh> {
  const selectedMeshes =
    new Set<THREE.Mesh>();

  selectedRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (mesh.isMesh) {
      selectedMeshes.add(mesh);
    }
  });

  if (
    selectedRoot instanceof THREE.Mesh &&
    selectedMeshes.size === 0
  ) {
    selectedMeshes.add(selectedRoot);
  }

  return selectedMeshes;
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
    material.color.set(0xffffff);
    material.vertexColors = false;
    material.metalness = 0;
    material.roughness = 0.72;
    material.aoMapIntensity = 0.1;

    const sourceStandardMaterial =
      sourceMaterial as
        THREE.MeshStandardMaterial;

    if (sourceStandardMaterial.map) {
      material.map = recolorTexture(
        sourceStandardMaterial.map,
        primaryColor,
        secondaryColor,
      );

      material.emissive.set(
        0xffffff,
      );

      material.emissiveMap =
        material.map;

      material.emissiveIntensity =
        0.07;
    }

    material.needsUpdate = true;
  }

  return material;
}

function addAnimationName(
  names: Set<string>,
  name: string,
): void {
  if (!name) {
    return;
  }

  names.add(name);

  names.add(
    THREE.PropertyBinding.sanitizeNodeName(
      name,
    ),
  );
}

function extractClipForPlayer(
  sourceClip: THREE.AnimationClip,
  selectedMeshes: Set<THREE.Mesh>,
  characterIndex: number,
): THREE.AnimationClip | null {
  const allowedNames =
    new Set<string>();

  for (const mesh of selectedMeshes) {
    addAnimationName(
      allowedNames,
      mesh.name,
    );

    if (
      mesh instanceof
      THREE.SkinnedMesh
    ) {
      for (
        const bone of
        mesh.skeleton.bones
      ) {
        addAnimationName(
          allowedNames,
          bone.name,
        );
      }
    }
  }

  const matchingTracks =
    sourceClip.tracks.filter(
      (track) => {
        try {
          const parsed =
            THREE.PropertyBinding.parseTrackName(
              track.name,
            );

          return (
            allowedNames.has(
              parsed.nodeName,
            ) ||
            allowedNames.has(
              THREE.PropertyBinding.sanitizeNodeName(
                parsed.nodeName,
              ),
            )
          );
        } catch (error) {
          console.warn(
            "PlayerModel3D skipped an invalid animation track:",
            track.name,
            error,
          );

          return false;
        }
      },
    );

  /*
   * Never use the full 771-track clip as a fallback.
   * That full clip controls all six source characters.
   */
  if (matchingTracks.length === 0) {
    console.warn(
      `PlayerModel3D found no matching run tracks for character ${characterIndex}.`,
    );

    return null;
  }

  const clip =
    new THREE.AnimationClip(
      `player-${characterIndex}-run`,
      sourceClip.duration,
      matchingTracks,
    );

  clip.optimize();

  return clip;
}

function shouldRun(
  playerState: PlayerAnimationState,
): boolean {
  return (
    playerState === "MOVING" ||
    playerState === "DRIBBLING" ||
    playerState === "CONTESTING"
  );
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
  facing = 0,
  characterIndex = 0,
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
  const { scene, animations } =
    useGLTF(MODEL_URL);

  const [model, setModel] =
    useState<THREE.Group | null>(null);

  const [height, setHeight] =
    useState(TARGET_PLAYER_HEIGHT);

  const mixerRef =
    useRef<THREE.AnimationMixer | null>(
      null,
    );

  const actionRef =
    useRef<THREE.AnimationAction | null>(
      null,
    );

  const badge =
    ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  const resolvedSecondaryColor =
    secondaryColor ?? teamColor;

  useFrame((_, delta) => {
    const mixer = mixerRef.current;

    if (!mixer) {
      return;
    }

    try {
      mixer.update(
        Math.min(delta, 0.05),
      );
    } catch (error) {
      console.error(
        "PlayerModel3D disabled a failed animation:",
        error,
      );

      mixer.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    }
  });

  useEffect(() => {
    setModel(null);
    setHeight(
      TARGET_PLAYER_HEIGHT,
    );

    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    actionRef.current = null;

    const ownedMaterials:
      THREE.Material[] = [];

    let completeClone:
      THREE.Group | null = null;

    let localMixer:
      THREE.AnimationMixer | null =
        null;

    let localAction:
      THREE.AnimationAction | null =
        null;

    let filteredClip:
      THREE.AnimationClip | null =
        null;

    try {
      /*
       * Clone the complete scene so the selected
       * SkinnedMesh keeps its matching armature.
       */
      completeClone =
        SkeletonUtils.clone(
          scene,
        ) as THREE.Group;

      completeClone.name =
        `FTA Player ${characterIndex + 1}`;

      completeClone.position.set(
        0,
        0,
        0,
      );

      completeClone.rotation.set(
        0,
        0,
        0,
      );

      completeClone.scale.set(
        1,
        1,
        1,
      );

      completeClone.visible = true;
      completeClone.updateMatrixWorld(
        true,
      );

      const selectedRoot =
        findSelectedPlayer(
          completeClone,
          characterIndex,
        );

      if (!selectedRoot) {
        console.error(
          "PlayerModel3D could not find the requested male model.",
          {
            characterIndex,
            expectedName:
              MALE_ROOT_NAMES[
                characterIndex
              ],
          },
        );

        return;
      }

      const selectedMeshes =
        collectSelectedMeshes(
          selectedRoot,
        );

      if (
        selectedMeshes.size === 0
      ) {
        console.error(
          "PlayerModel3D found no mesh inside the selected player.",
        );

        return;
      }

      /*
       * Keep every armature and bone but show only
       * the chosen character's actual meshes.
       */
      completeClone.traverse(
        (object) => {
          const mesh =
            object as THREE.Mesh;

          if (!mesh.isMesh) {
            return;
          }

          const isSelectedMesh =
            selectedMeshes.has(mesh);

          mesh.visible =
            isSelectedMesh;

          if (!isSelectedMesh) {
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
        },
      );

      completeClone.updateMatrixWorld(
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
        boundingBox.isEmpty() ||
        !Number.isFinite(
          boundingBox.min.x,
        ) ||
        !Number.isFinite(
          boundingBox.min.y,
        ) ||
        !Number.isFinite(
          boundingBox.min.z,
        ) ||
        !Number.isFinite(
          boundingBox.max.x,
        ) ||
        !Number.isFinite(
          boundingBox.max.y,
        ) ||
        !Number.isFinite(
          boundingBox.max.z,
        )
      ) {
        console.error(
          "PlayerModel3D produced an invalid bounding box.",
        );

        return;
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
        console.error(
          "PlayerModel3D produced an invalid player height.",
        );

        return;
      }

      const playerScale =
        TARGET_PLAYER_HEIGHT /
        originalHeight;

      completeClone.scale.setScalar(
        playerScale,
      );

      completeClone.position.set(
        -center.x * playerScale,
        -boundingBox.min.y *
          playerScale,
        -center.z * playerScale,
      );

      completeClone.updateMatrixWorld(
        true,
      );

      /*
       * Make the static player visible before
       * attempting animation setup.
       */
      setHeight(
        TARGET_PLAYER_HEIGHT,
      );

      setModel(completeClone);

      if (animations.length > 0) {
        try {
          filteredClip =
            extractClipForPlayer(
              animations[0],
              selectedMeshes,
              characterIndex,
            );

          if (filteredClip) {
            localMixer =
              new THREE.AnimationMixer(
                completeClone,
              );

            localAction =
              localMixer.clipAction(
                filteredClip,
              );

            localAction.enabled = true;

            localAction.setLoop(
              THREE.LoopRepeat,
              Infinity,
            );

            localAction.clampWhenFinished =
              false;

            localAction.setEffectiveWeight(
              1,
            );

            localAction.setEffectiveTimeScale(
              1,
            );

            mixerRef.current =
              localMixer;

            actionRef.current =
              localAction;
          }
        } catch (error) {
          console.error(
            "PlayerModel3D animation setup failed. The player will remain static.",
            error,
          );

          localMixer?.stopAllAction();

          localMixer = null;
          localAction = null;
          filteredClip = null;

          mixerRef.current = null;
          actionRef.current = null;
        }
      }

      return () => {
        localAction?.stop();
        localMixer?.stopAllAction();

        if (
          localMixer &&
          filteredClip
        ) {
          localMixer.uncacheClip(
            filteredClip,
          );
        }

        if (
          localMixer &&
          completeClone
        ) {
          localMixer.uncacheRoot(
            completeClone,
          );
        }

        if (
          mixerRef.current ===
          localMixer
        ) {
          mixerRef.current = null;
        }

        if (
          actionRef.current ===
          localAction
        ) {
          actionRef.current = null;
        }

        /*
         * Dispose only cloned player materials.
         * Team textures remain shared through the cache.
         */
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

      localMixer?.stopAllAction();

      mixerRef.current = null;
      actionRef.current = null;

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
    characterIndex,
    teamColor,
    resolvedSecondaryColor,
  ]);

  useEffect(() => {
    const action =
      actionRef.current;

    if (!action) {
      return;
    }

    try {
      if (shouldRun(playerState)) {
        if (!action.isRunning()) {
          action
            .reset()
            .fadeIn(0.18)
            .play();
        }
      } else {
        action.fadeOut(0.18);
      }
    } catch (error) {
      console.error(
        "PlayerModel3D animation playback failed:",
        error,
      );

      action.stop();
      actionRef.current = null;

      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
    }
  }, [playerState, model]);

  if (!model) {
    return null;
  }

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, facing, 0]}
    >
      {(isSelected || hasBall) && (
        <mesh
          position={[0, 0.015, 0]}
          rotation={[
            -Math.PI / 2,
            0,
            0,
          ]}
        >
          <ringGeometry
            args={[0.32, 0.4, 32]}
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

      <Billboard
        position={[
          0,
          height + 0.18,
          0,
        ]}
      >
        <mesh
          position={[0, 0, -0.01]}
        >
          <planeGeometry
            args={[0.98, 0.24]}
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
            -0.18,
            0.045,
            0,
          ]}
          fontSize={0.085}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          depthOffset={-2}
        >
          {`${jerseyNumber} ${name}`}
        </Text>

        <Text
          position={[
            0.34,
            0.045,
            0,
          ]}
          fontSize={0.07}
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
            0.48,
            height + 0.18,
            0,
          ]}
        >
          <mesh>
            <planeGeometry
              args={[0.32, 0.18]}
            />

            <meshBasicMaterial
              color="#ff1744"
              depthTest={false}
              depthWrite={false}
            />
          </mesh>

          <Text
            fontSize={0.09}
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