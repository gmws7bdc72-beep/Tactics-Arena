import { useEffect, useState } from "react";
import { useGLTF, Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

export type PlayerRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "striker";

const MODEL_URL = "/models/players.gltf";

const MALE_NODE_NAMES = [
  "_gltfNode_0",
  "_gltfNode_46",
  "_gltfNode_92",
];

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

// The original textures are 4096×512.
// Recoloring them at 1024×128 uses about 1/16 of the memory.
const MAX_RECOLOR_WIDTH = 1024;

// Share recolored textures between players instead of creating a separate
// 4096px texture for every player.
const recoloredTextureCache = new WeakMap<
  THREE.Texture,
  Map<string, THREE.CanvasTexture>
>();

function getRecoloredTexture(
  baseTexture: THREE.Texture,
  targetHex: string,
): THREE.CanvasTexture {
  const colorKey = targetHex.toLowerCase();

  let colorCache = recoloredTextureCache.get(baseTexture);

  if (!colorCache) {
    colorCache = new Map<string, THREE.CanvasTexture>();
    recoloredTextureCache.set(baseTexture, colorCache);
  }

  const existingTexture = colorCache.get(colorKey);

  if (existingTexture) {
    return existingTexture;
  }

  const image = baseTexture.image as CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };

  const sourceWidth =
    image.naturalWidth ??
    image.width ??
    MAX_RECOLOR_WIDTH;

  const sourceHeight =
    image.naturalHeight ??
    image.height ??
    128;

  const outputWidth = Math.min(
    sourceWidth,
    MAX_RECOLOR_WIDTH,
  );

  const outputHeight = Math.max(
    1,
    Math.round(
      sourceHeight * (outputWidth / sourceWidth),
    ),
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error(
      "Could not create player texture canvas.",
    );
  }

  ctx.drawImage(
    image,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const imageData = ctx.getImageData(
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const data = imageData.data;

  const targetColor = new THREE.Color(targetHex);
  const targetHsl = { h: 0, s: 0, l: 0 };
  targetColor.getHSL(targetHsl);

  const pixelColor = new THREE.Color();
  const pixelHsl = { h: 0, s: 0, l: 0 };
  const outputColor = new THREE.Color();

  for (let i = 0; i < data.length; i += 4) {
    pixelColor.setRGB(
      data[i] / 255,
      data[i + 1] / 255,
      data[i + 2] / 255,
    );

    pixelColor.getHSL(pixelHsl);

    const isSkinHue =
      pixelHsl.h >= SKIN_HUE_MIN &&
      pixelHsl.h <= SKIN_HUE_MAX;

    const isGrayish =
      pixelHsl.s < MIN_SATURATION;

    if (!isSkinHue && !isGrayish) {
      outputColor.setHSL(
        targetHsl.h,
        pixelHsl.s,
        pixelHsl.l,
      );

      data[i] = Math.round(outputColor.r * 255);
      data[i + 1] = Math.round(
        outputColor.g * 255,
      );
      data[i + 2] = Math.round(
        outputColor.b * 255,
      );
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = baseTexture.colorSpace;
  texture.flipY = baseTexture.flipY;
  texture.wrapS = baseTexture.wrapS;
  texture.wrapT = baseTexture.wrapT;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter =
    THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  colorCache.set(colorKey, texture);

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
    useState<THREE.Object3D | null>(null);

  const [height, setHeight] = useState(1.7);

  const badge = ROLE_BADGE[role];

  const badgeColor =
    role === "goalkeeper"
      ? "#c9a34b"
      : ROLE_BADGE_COLOR[role];

  useEffect(() => {
    const nodeName =
      MALE_NODE_NAMES[characterIndex];

    const source =
      scene.getObjectByName(nodeName);

    if (!source) {
      console.error(
        `Male player node not found: ${nodeName}`,
      );

      return;
    }

    const clone = SkeletonUtils.clone(
      source,
    ) as THREE.Object3D;

    const ownedMaterials: THREE.Material[] = [];

    const box =
      new THREE.Box3().setFromObject(clone);

    const center = box.getCenter(
      new THREE.Vector3(),
    );

    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box.min.y;

    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;

      if (!mesh.isMesh) return;

      const sourceMaterials =
        Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];

      const playerMaterials =
        sourceMaterials.map((sourceMaterial) => {
          const material =
            sourceMaterial.clone() as THREE.MeshStandardMaterial;

          ownedMaterials.push(material);

          const originalMaterial =
            sourceMaterial as THREE.MeshStandardMaterial;

          if (originalMaterial.map) {
            material.map = getRecoloredTexture(
              originalMaterial.map,
              teamColor,
            );
          }

          material.needsUpdate = true;

          return material;
        });

      mesh.material = Array.isArray(mesh.material)
        ? playerMaterials
        : playerMaterials[0];

      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    setHeight(box.max.y - box.min.y);
    setModel(clone);

    return () => {
      // Dispose only this player's cloned materials.
      // Do not dispose the cached team textures because other players
      // are sharing them.
      for (const material of ownedMaterials) {
        material.dispose();
      }
    };
  }, [scene, characterIndex, teamColor]);

  if (!model) return null;

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
          <planeGeometry args={[0.92, 0.24]} />

          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.58}
            depthTest={false}
          />
        </mesh>

        <Text
          position={[-0.18, 0.045, 0]}
          fontSize={0.085}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {`${jerseyNumber} ${name}`}
        </Text>

        <Text
          position={[0.31, 0.045, 0]}
          fontSize={0.07}
          color={badgeColor}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {badge}
        </Text>
      </Billboard>

      {offside && (
        <Billboard
          position={[0.46, height + 0.18, 0]}
        >
          <mesh>
            <planeGeometry args={[0.32, 0.18]} />

            <meshBasicMaterial
              color="#ff1744"
              depthTest={false}
            />
          </mesh>

          <Text
            fontSize={0.09}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            OS
          </Text>
        </Billboard>
      )}
    </group>
  );
}

useGLTF.preload(MODEL_URL);