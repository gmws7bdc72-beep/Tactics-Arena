import { useState, useEffect } from "react";
import { useGLTF, useAnimations, Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

// The source file's single "Animation" clip has every bone of all six
// characters baked into one timeline (771 tracks). Each track's name
// resolves to a specific bone via THREE's own PropertyBinding parsing, so
// we can filter down to just the tracks whose target bone actually exists
// in this specific character's cloned subtree, and leave the rest out.
// If parsing/matching finds nothing (should not happen, but just in case),
// fall back to the full clip -- THREE.AnimationMixer silently skips tracks
// that don't resolve to a node in the given root, so it's safe either way.
function extractClipForSkeleton(
  sourceClip: THREE.AnimationClip,
  root: THREE.Object3D,
): THREE.AnimationClip {
  const sanitizedNames = new Set<string>();
  root.traverse((obj) => {
    sanitizedNames.add(THREE.PropertyBinding.sanitizeNodeName(obj.name));
  });

  let tracks = sourceClip.tracks.filter((track) => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    return sanitizedNames.has(parsed.nodeName);
  });

  if (tracks.length === 0) {
    tracks = sourceClip.tracks;
  }

  return new THREE.AnimationClip("run", sourceClip.duration, tracks);
}

export type PlayerRole =
  | "goalkeeper"
  | "defender"
  | "midfielder"
  | "forward"
  | "striker";

// Path to the asset inside /public — see setup notes.
const MODEL_URL = "/models/players.gltf";

// Names of the three male root nodes in this specific export.
// (The three female "Metarig Woman" nodes are simply never referenced.)
const MALE_NODE_NAMES = ["_gltfNode_0", "_gltfNode_46", "_gltfNode_92"];

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

// Skin sits in a narrow orange hue band regardless of how saturated it's
// rendered, so we exclude by hue rather than by saturation. Everything
// outside that band (the jersey, shorts, and any trim) gets shifted to the
// team hue, while true grays/whites (socks, ball, teeth) are left alone.
const SKIN_HUE_MIN = 0.02;
const SKIN_HUE_MAX = 0.15;
const MIN_SATURATION = 0.15;

function recolorTexture(baseTexture: THREE.Texture, targetHex: string): THREE.CanvasTexture {
  const img = baseTexture.image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  const target = new THREE.Color(targetHex);
  const targetHsl = { h: 0, s: 0, l: 0 };
  target.getHSL(targetHsl);

  const px = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const out = new THREE.Color();

  for (let i = 0; i < d.length; i += 4) {
    px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    px.getHSL(hsl);

    const isSkinHue = hsl.h >= SKIN_HUE_MIN && hsl.h <= SKIN_HUE_MAX;
    const isGrayish = hsl.s < MIN_SATURATION;

    if (!isSkinHue && !isGrayish) {
      out.setHSL(targetHsl.h, hsl.s, hsl.l);
      d[i] = Math.round(out.r * 255);
      d[i + 1] = Math.round(out.g * 255);
      d[i + 2] = Math.round(out.b * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = baseTexture.colorSpace;
  tex.flipY = baseTexture.flipY;
  return tex;
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
  name,
  role,
  isSelected = false,
  offside = false,
}: PlayerModel3DProps) {
  const { scene, animations } = useGLTF(MODEL_URL);
  const badge = ROLE_BADGE[role];
  const badgeColor = role === "goalkeeper" ? "#c9a34b" : ROLE_BADGE_COLOR[role];

  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [height, setHeight] = useState(1.7);
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);
  const { actions } = useAnimations(clips, model ?? undefined);

  useEffect(() => {
    const nodeName = MALE_NODE_NAMES[characterIndex];
    const source = scene.getObjectByName(nodeName);
    if (!source) return;

    const clone = SkeletonUtils.clone(source) as THREE.Object3D;

    // Recenter: the source file lays all six characters out side by side,
    // so bottom-center this clone at the local origin regardless of where
    // it originally sat in that lineup.
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box.min.y;

    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.map) {
          const newMat = mat.clone();
          newMat.map = recolorTexture(mat.map, teamColor);
          mesh.material = newMat;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    setModel(clone);
    setHeight(box.max.y - box.min.y);
    setClips(animations.length > 0 ? [extractClipForSkeleton(animations[0], clone)] : []);

    // Paired with the setup above so React's mount->cleanup->remount cycle
    // (StrictMode in dev) always disposes the model it just created, never
    // one that's still in use.
    return () => {
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (mat) {
          mat.map?.dispose();
          mat.dispose();
        }
      });
    };
  }, [scene, characterIndex, teamColor]);

  useEffect(() => {
    const action = actions?.run;
    if (!action) return;

    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions]);

  if (!model) return null;

  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {isSelected && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.32, 0.4, 32]} />
          <meshBasicMaterial color="#5fe0ff" transparent opacity={0.85} />
        </mesh>
      )}

      <primitive object={model} />

      <Billboard position={[0, height + 0.18, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.85, 0.24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.55} />
        </mesh>
        <Text
          position={[-0.14, 0.045, 0]}
          fontSize={0.09}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {name}
        </Text>
        <Text
          position={[0.3, 0.045, 0]}
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
        <Billboard position={[0.42, height + 0.18, 0]}>
          <mesh>
            <planeGeometry args={[0.32, 0.18]} />
            <meshBasicMaterial color="#ff1744" />
          </mesh>
          <Text fontSize={0.09} color="#ffffff" anchorX="center" anchorY="middle">
            OS
          </Text>
        </Billboard>
      )}
    </group>
  );
}

useGLTF.preload(MODEL_URL);
