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

const MALE_CHARACTERS = [
  {
    meshName: "_gltfNode_0",
    rigName: "Metarig Man.010_44",
  },
  {
    meshName: "_gltfNode_46",
    rigName: "Metarig Man.011_89",
  },
  {
    meshName: "_gltfNode_92",
    rigName: "Metarig Man.012_134",
  },
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

const SKIN_HUE_MIN = 0.02;
const SKIN_HUE_MAX = 0.15;
const MIN_SATURATION = 0.15;
const MAX_TEXTURE_WIDTH = 1024;

const recoloredTextureCache = new WeakMap<
  THREE.Texture,
  Map<string, THREE.CanvasTexture>
>();

function getTextureSize(image: {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}) {
  const width = image.naturalWidth ?? image.width ?? MAX_TEXTURE_WIDTH;
  const height = image.naturalHeight ?? image.height ?? 128;

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function getRecoloredTexture(
  baseTexture: THREE.Texture,
  targetHex: string,
): THREE.CanvasTexture {
  const cacheKey = targetHex.toLowerCase();

  let colorCache = recoloredTextureCache.get(baseTexture);

  if (!colorCache) {
    colorCache = new Map<string, THREE.CanvasTexture>();
    recoloredTextureCache.set(baseTexture, colorCache);
  }

  const cachedTexture = colorCache.get(cacheKey);

  if (cachedTexture) {
    return cachedTexture;
  }

  const image = baseTexture.image as CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };

  if (!image) {
    throw new Error("Player texture image was not loaded.");
  }

  const sourceSize = getTextureSize(image);

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

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error(
      "Could not create the player texture canvas.",
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

  const targetColor = new THREE.Color(targetHex);
  const targetHsl = {
    h: 0,
    s: 0,
    l: 0,
  };

  targetColor.getHSL(targetHsl);

  const sourceColor = new THREE.Color();
  const sourceHsl = {
    h: 0,
    s: 0,
    l: 0,
  };

  const outputColor = new THREE.Color();

  for (let index = 0; index < pixels.length; index += 4) {
    sourceColor.setRGB(
      pixels[index] / 255,
      pixels[index + 1] / 255,
      pixels[index + 2] / 255,
    );

    sourceColor.getHSL(sourceHsl);

    const isSkinHue =
      sourceHsl.h >= SKIN_HUE_MIN &&
      sourceHsl.h <= SKIN_HUE_MAX;

    const isGrayish =
      sourceHsl.s < MIN_SATURATION;

    if (!isSkinHue && !isGrayish) {
      outputColor.setHSL(
        targetHsl.h,
        sourceHsl.s,
        sourceHsl.l,
      );

      pixels[index] = Math.round(outputColor.r * 255);
      pixels[index + 1] = Math.round(outputColor.g * 255);
      pixels[index + 2] = Math.round(outputColor.b * 255);
    }
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = baseTexture.colorSpace;
  texture.flipY = baseTexture.flipY;
  texture.wrapS = baseTexture.wrapS;
  texture.wrapT = baseTexture.wrapT;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  colorCache.set(cacheKey, texture);

  return texture;
}

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

  const [height, setHeight] = useState(1.7);

  const badge = ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  useEffect(() => {
    setModel(null);
    setHeight(1.7);

    const character =
      MALE_CHARACTERS[characterIndex];

    /*
     * Clone the complete scene first.
     *
     * In this GLTF, each male player mesh and its armature are
     * separate root objects. Cloning only the mesh leaves its
     * SkinnedMesh without a complete cloned bone hierarchy.
     */
    const completeClone = SkeletonUtils.clone(
      scene,
    ) as THREE.Group;

    completeClone.updateMatrixWorld(true);

    const playerMesh =
      completeClone.getObjectByName(
        character.meshName,
      );

    const playerRig =
      completeClone.getObjectByName(
        character.rigName,
      );

    if (!playerMesh || !playerRig) {
      console.error(
        "Could not find the required male player mesh or rig.",
        {
          meshName: character.meshName,
          rigName: character.rigName,
          meshFound: Boolean(playerMesh),
          rigFound: Boolean(playerRig),
        },
      );

      return;
    }

    const playerRoot = new THREE.Group();
    playerRoot.name = `FTA Player ${characterIndex + 1}`;

    /*
     * attach() preserves each object's world transform while
     * moving the selected mesh and matching armature out of the
     * full six-character clone.
     */
    playerRoot.attach(playerRig);
    playerRoot.attach(playerMesh);
    playerRoot.updateMatrixWorld(true);

    const ownedMaterials: THREE.Material[] = [];

    playerRoot.traverse((child) => {
      const mesh = child as THREE.Mesh;

      if (!mesh.isMesh) {
        return;
      }

      const originalMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      const clonedMaterials = originalMaterials.map(
        (originalMaterial) => {
          const clonedMaterial =
            originalMaterial.clone() as THREE.MeshStandardMaterial;

          ownedMaterials.push(clonedMaterial);

          const standardMaterial =
            originalMaterial as THREE.MeshStandardMaterial;

          if (standardMaterial.map) {
            clonedMaterial.map =
              getRecoloredTexture(
                standardMaterial.map,
                teamColor,
              );
          }

          clonedMaterial.needsUpdate = true;

          return clonedMaterial;
        },
      );

      mesh.material = Array.isArray(mesh.material)
        ? clonedMaterials
        : clonedMaterials[0];

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (mesh instanceof THREE.SkinnedMesh) {
        mesh.frustumCulled = false;
      }
    });

    const box = new THREE.Box3().setFromObject(playerRoot);

    if (box.isEmpty()) {
      console.error(
        "The selected player model produced an empty bounding box.",
      );

      for (const material of ownedMaterials) {
        material.dispose();
      }

      return;
    }

    const center = box.getCenter(
      new THREE.Vector3(),
    );

    const modelHeight = Math.max(
      0.1,
      box.max.y - box.min.y,
    );

    playerRoot.position.x -= center.x;
    playerRoot.position.z -= center.z;
    playerRoot.position.y -= box.min.y;

    playerRoot.updateMatrixWorld(true);

    setHeight(modelHeight);
    setModel(playerRoot);

    return () => {
      for (const material of ownedMaterials) {
        /*
         * Do not dispose material.map here.
         * Recolored textures are shared by every player on the
         * same team and stored in the cache above.
         */
        material.dispose();
      }
    };
  }, [scene, characterIndex, teamColor]);

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
            opacity={0.58}
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