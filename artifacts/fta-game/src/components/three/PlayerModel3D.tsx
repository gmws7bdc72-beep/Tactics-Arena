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

interface PlayerModel3DProps {
  x: number;
  z: number;
  facing?: number;
  characterIndex?: 0 | 1 | 2;
  teamColor: string;
  jerseyNumber: number;
  name: string;
  role: PlayerRole;
  isSelected?: boolean;
  hasBall?: boolean;
  offside?: boolean;
  playerState?: PlayerAnimationState;
}

function findSelectedPlayer(
  scene: THREE.Object3D,
  characterIndex: 0 | 1 | 2,
): THREE.Object3D | null {
  const expectedName = MALE_ROOT_NAMES[characterIndex];
  const expectedPlayer = scene.getObjectByName(expectedName);

  if (expectedPlayer) {
    return expectedPlayer;
  }

  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  scene.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshes.push(object);
    }
  });

  return skinnedMeshes[characterIndex] ?? null;
}

function collectSelectedMeshes(
  selectedRoot: THREE.Object3D,
): Set<THREE.Mesh> {
  const selectedMeshes = new Set<THREE.Mesh>();

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

function createNormalizedMaterial(
  sourceMaterial: THREE.Material,
): THREE.Material {
  const material = sourceMaterial.clone();

  if (material instanceof THREE.MeshStandardMaterial) {
    material.color.set(0xffffff);
    material.vertexColors = false;
    material.metalness = 0;
    material.roughness = 0.72;
    material.aoMapIntensity = 0;

    if (material.map) {
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.map.needsUpdate = true;

      material.emissive.set(0xffffff);
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.08;
    } else {
      material.emissive.set(0x111111);
      material.emissiveIntensity = 0.1;
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
    THREE.PropertyBinding.sanitizeNodeName(name),
  );
}

function extractClipForPlayer(
  sourceClip: THREE.AnimationClip,
  selectedMeshes: Set<THREE.Mesh>,
  characterIndex: number,
): THREE.AnimationClip | null {
  const allowedNames = new Set<string>();

  for (const mesh of selectedMeshes) {
    addAnimationName(allowedNames, mesh.name);

    if (mesh instanceof THREE.SkinnedMesh) {
      for (const bone of mesh.skeleton.bones) {
        addAnimationName(allowedNames, bone.name);
      }
    }
  }

  const matchingTracks = sourceClip.tracks.filter(
    (track) => {
      try {
        const parsed =
          THREE.PropertyBinding.parseTrackName(
            track.name,
          );

        const nodeName = parsed.nodeName;

        return (
          allowedNames.has(nodeName) ||
          allowedNames.has(
            THREE.PropertyBinding.sanitizeNodeName(
              nodeName,
            ),
          )
        );
      } catch (error) {
        console.warn(
          "PlayerModel3D could not parse animation track:",
          track.name,
          error,
        );

        return false;
      }
    },
  );

  if (matchingTracks.length === 0) {
    console.warn(
      `PlayerModel3D found no animation tracks for character ${characterIndex}. The player will remain static.`,
    );

    return null;
  }

  const clip = new THREE.AnimationClip(
    `player-${characterIndex}-run`,
    sourceClip.duration,
    matchingTracks,
  );

  clip.optimize();

  return clip;
}

function shouldPlayerRun(
  playerState: PlayerAnimationState,
): boolean {
  return (
    playerState === "MOVING" ||
    playerState === "DRIBBLING" ||
    playerState === "CONTESTING"
  );
}

export function PlayerModel3D({
  x,
  z,
  facing = 0,
  characterIndex = 0,
  teamColor,
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
    useRef<THREE.AnimationMixer | null>(null);

  const actionRef =
    useRef<THREE.AnimationAction | null>(null);

  const badge = ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  useFrame((_, delta) => {
    const mixer = mixerRef.current;

    if (!mixer) {
      return;
    }

    try {
      mixer.update(Math.min(delta, 0.05));
    } catch (error) {
      console.error(
        "PlayerModel3D disabled a broken animation:",
        error,
      );

      mixer.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    }
  });

  useEffect(() => {
    setModel(null);
    setHeight(TARGET_PLAYER_HEIGHT);

    mixerRef.current?.stopAllAction();
    mixerRef.current = null;
    actionRef.current = null;

    const ownedMaterials: THREE.Material[] = [];

    let completeClone: THREE.Group | null = null;
    let localMixer: THREE.AnimationMixer | null = null;
    let localAction: THREE.AnimationAction | null = null;
    let filteredClip: THREE.AnimationClip | null = null;

    try {
      /*
       * The complete scene must be cloned because the player
       * meshes and their skeleton armatures are separate objects
       * inside this GLTF.
       */
      completeClone = SkeletonUtils.clone(
        scene,
      ) as THREE.Group;

      completeClone.name =
        `FTA Player ${characterIndex + 1}`;

      completeClone.position.set(0, 0, 0);
      completeClone.rotation.set(0, 0, 0);
      completeClone.scale.set(1, 1, 1);
      completeClone.visible = true;
      completeClone.updateMatrixWorld(true);

      const selectedRoot = findSelectedPlayer(
        completeClone,
        characterIndex,
      );

      if (!selectedRoot) {
        console.error(
          "PlayerModel3D could not find the selected male player.",
          {
            characterIndex,
            expectedName:
              MALE_ROOT_NAMES[characterIndex],
          },
        );

        return;
      }

      const selectedMeshes =
        collectSelectedMeshes(selectedRoot);

      if (selectedMeshes.size === 0) {
        console.error(
          "PlayerModel3D found the player root but no player mesh.",
          {
            characterIndex,
            rootName: selectedRoot.name,
            rootType: selectedRoot.type,
          },
        );

        return;
      }

      /*
       * Keep the full skeleton hierarchy but hide all five
       * character meshes that do not belong to this player.
       */
      completeClone.traverse((object) => {
        const mesh = object as THREE.Mesh;

        if (!mesh.isMesh) {
          return;
        }

        const isSelectedMesh =
          selectedMeshes.has(mesh);

        mesh.visible = isSelectedMesh;

        if (!isSelectedMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          return;
        }

        const sourceMaterials =
          Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];

        const playerMaterials =
          sourceMaterials.map(
            (sourceMaterial) => {
              const material =
                createNormalizedMaterial(
                  sourceMaterial,
                );

              ownedMaterials.push(material);

              return material;
            },
          );

        mesh.material = Array.isArray(
          mesh.material,
        )
          ? playerMaterials
          : playerMaterials[0];

        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;

        if (
          mesh instanceof THREE.SkinnedMesh
        ) {
          mesh.normalizeSkinWeights();
          mesh.skeleton.update();
        }
      });

      completeClone.updateMatrixWorld(true);

      const box = new THREE.Box3();

      for (const mesh of selectedMeshes) {
        mesh.updateWorldMatrix(true, false);
        box.expandByObject(mesh, true);
      }

      if (
        box.isEmpty() ||
        !Number.isFinite(box.min.x) ||
        !Number.isFinite(box.min.y) ||
        !Number.isFinite(box.min.z) ||
        !Number.isFinite(box.max.x) ||
        !Number.isFinite(box.max.y) ||
        !Number.isFinite(box.max.z)
      ) {
        console.error(
          "PlayerModel3D produced an invalid bounding box.",
          {
            characterIndex,
            box,
          },
        );

        return;
      }

      const center = box.getCenter(
        new THREE.Vector3(),
      );

      const rawHeight =
        box.max.y - box.min.y;

      if (
        !Number.isFinite(rawHeight) ||
        rawHeight <= 0
      ) {
        console.error(
          "PlayerModel3D produced an invalid height.",
          {
            characterIndex,
            rawHeight,
          },
        );

        return;
      }

      const scale =
        TARGET_PLAYER_HEIGHT / rawHeight;

      completeClone.scale.setScalar(scale);

      completeClone.position.set(
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale,
      );

      completeClone.updateMatrixWorld(true);

      /*
       * Display the static player before animation setup.
       * Animation failure must never remove the model.
       */
      setHeight(TARGET_PLAYER_HEIGHT);
      setModel(completeClone);

      if (animations.length > 0) {
        try {
          filteredClip = extractClipForPlayer(
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
            localAction.clampWhenFinished = false;
            localAction.setEffectiveWeight(1);
            localAction.setEffectiveTimeScale(1);

            localMixer.stopAllAction();

            mixerRef.current = localMixer;
            actionRef.current = localAction;
          }
        } catch (animationError) {
          console.error(
            "PlayerModel3D animation setup failed. The player will remain static.",
            animationError,
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
        if (localAction) {
          localAction.stop();
        }

        if (localMixer) {
          localMixer.stopAllAction();

          if (filteredClip) {
            localMixer.uncacheClip(
              filteredClip,
            );
          }

          if (completeClone) {
            localMixer.uncacheRoot(
              completeClone,
            );
          }
        }

        if (
          mixerRef.current === localMixer
        ) {
          mixerRef.current = null;
        }

        if (
          actionRef.current === localAction
        ) {
          actionRef.current = null;
        }

        for (const material of ownedMaterials) {
          material.dispose();
        }
      };
    } catch (setupError) {
      console.error(
        "PlayerModel3D model setup failed:",
        setupError,
      );

      localMixer?.stopAllAction();

      if (
        mixerRef.current === localMixer
      ) {
        mixerRef.current = null;
      }

      if (
        actionRef.current === localAction
      ) {
        actionRef.current = null;
      }

      for (const material of ownedMaterials) {
        material.dispose();
      }

      setModel(null);

      return;
    }
  }, [scene, animations, characterIndex]);

  useEffect(() => {
    const action = actionRef.current;

    if (!action) {
      return;
    }

    try {
      if (shouldPlayerRun(playerState)) {
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

      <mesh
        position={[0, 1.45, 0]}
      >
        <sphereGeometry
          args={[0.055, 12, 12]}
        />

        <meshBasicMaterial
          color={teamColor}
          depthTest={false}
        />
      </mesh>

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