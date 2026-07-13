import { useEffect, useState } from "react";
import { Billboard, Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export type PlayerRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "striker";

const MODEL_URL = "/models/players.gltf";

const MALE_ROOT_NAMES = [
  "_gltfNode_0",
  "_gltfNode_46",
  "_gltfNode_92",
] as const;

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

const TARGET_PLAYER_HEIGHT = 1.72;

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
  offside?: boolean;
}

function findSelectedPlayer(
  scene: THREE.Object3D,
  characterIndex: 0 | 1 | 2,
): THREE.Object3D | null {
  const preferredName = MALE_ROOT_NAMES[characterIndex];
  const preferredObject = scene.getObjectByName(preferredName);

  if (preferredObject) {
    return preferredObject;
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
): Set<THREE.Object3D> {
  const selectedMeshes = new Set<THREE.Object3D>();

  selectedRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (mesh.isMesh) {
      selectedMeshes.add(object);
    }
  });

  if (
    selectedMeshes.size === 0 &&
    selectedRoot instanceof THREE.Mesh
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
    /*
     * Some characters were exported with darker material tints.
     * Setting the material color to white lets the original texture
     * display without an extra dark multiplier.
     */
    material.color.set(0xffffff);

    /*
     * Prevent inconsistent exported vertex colors from darkening
     * individual characters.
     */
    material.vertexColors = false;

    /*
     * These player uniforms are cloth rather than metallic surfaces.
     * Normalizing these values keeps all three character variants
     * under the same lighting response.
     */
    material.metalness = 0;
    material.roughness = 0.72;

    /*
     * Some exported materials contain strong ambient-occlusion maps.
     * Reduce their strength so faces and uniforms do not become black.
     */
    material.aoMapIntensity = 0.15;

    if (material.map) {
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.map.needsUpdate = true;

      /*
       * Add a very small amount of texture-based fill lighting.
       * The player still reacts to scene lighting, but deeply shaded
       * characters remain readable.
       */
      material.emissive.set(0xffffff);
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.12;
    } else {
      material.emissive.set(0x111111);
      material.emissiveIntensity = 0.15;
    }

    material.needsUpdate = true;
  }

  return material;
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
  offside = false,
}: PlayerModel3DProps) {
  const { scene } = useGLTF(MODEL_URL);

  const [model, setModel] =
    useState<THREE.Group | null>(null);

  const [height, setHeight] =
    useState(TARGET_PLAYER_HEIGHT);

  const badge = ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  useEffect(() => {
    setModel(null);
    setHeight(TARGET_PLAYER_HEIGHT);

    /*
     * Clone the complete GLTF scene so every skinned player keeps
     * access to the armature and bones referenced by its skeleton.
     */
    const completeClone = SkeletonUtils.clone(
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
        "PlayerModel3D could not find a male player.",
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
        "PlayerModel3D found the player root but no mesh.",
        {
          characterIndex,
          rootName: selectedRoot.name,
          rootType: selectedRoot.type,
        },
      );

      return;
    }

    const ownedMaterials: THREE.Material[] = [];

    completeClone.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh) {
        return;
      }

      const isSelectedMesh =
        selectedMeshes.has(object);

      mesh.visible = isSelectedMesh;

      if (!isSelectedMesh) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        return;
      }

      const sourceMaterials = Array.isArray(
        mesh.material,
      )
        ? mesh.material
        : [mesh.material];

      const clonedMaterials = sourceMaterials.map(
        (sourceMaterial) => {
          const normalizedMaterial =
            createNormalizedMaterial(sourceMaterial);

          ownedMaterials.push(normalizedMaterial);

          return normalizedMaterial;
        },
      );

      mesh.material = Array.isArray(mesh.material)
        ? clonedMaterials
        : clonedMaterials[0];

      /*
       * Players still cast shadows onto the field, but they do not
       * receive their own harsh self-shadows. This removes the
       * inconsistent darkening seen on characters such as Mason.
       */
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      if (mesh instanceof THREE.SkinnedMesh) {
        mesh.normalizeSkinWeights();
        mesh.skeleton.update();
      }
    });

    completeClone.updateMatrixWorld(true);

    const box = new THREE.Box3();

    for (const selectedMesh of selectedMeshes) {
      selectedMesh.updateWorldMatrix(true, false);
      box.expandByObject(selectedMesh, true);
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
          rootName: selectedRoot.name,
          box,
        },
      );

      for (const material of ownedMaterials) {
        material.dispose();
      }

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

      for (const material of ownedMaterials) {
        material.dispose();
      }

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

    setHeight(TARGET_PLAYER_HEIGHT);
    setModel(completeClone);

    return () => {
      /*
       * Dispose only the cloned materials.
       * Their texture maps belong to the loaded GLTF and remain shared.
       */
      for (const material of ownedMaterials) {
        material.dispose();
      }
    };
  }, [scene, characterIndex]);

  if (!model) {
    return null;
  }

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, facing, 0]}
    >
      {isSelected && (
        <mesh
          position={[0, 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.32, 0.4, 32]} />

          <meshBasicMaterial
            color="#5fe0ff"
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
        position={[0, height + 0.18, 0]}
      >
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.98, 0.24]} />

          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.6}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>

        <Text
          position={[-0.18, 0.045, 0]}
          fontSize={0.085}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          depthOffset={-2}
        >
          {`${jerseyNumber} ${name}`}
        </Text>

        <Text
          position={[0.34, 0.045, 0]}
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

      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />

        <meshBasicMaterial
          color={teamColor}
          depthTest={false}
        />
      </mesh>

      {offside && (
        <Billboard
          position={[0.48, height + 0.18, 0]}
        >
          <mesh>
            <planeGeometry args={[0.32, 0.18]} />

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