import type { ComponentProps } from "react";
import {
  PITCH_HEIGHT,
  PITCH_WIDTH,
} from "../engine/constants";
import MatchPitch3D from "./MatchPitch3D";

type Props = ComponentProps<
  typeof MatchPitch3D
>;

export default function PitchCanvas(
  props: Props,
) {
  const isVertical =
    props.isVertical ?? false;

  const aspectRatio = isVertical
    ? `${PITCH_HEIGHT} / ${PITCH_WIDTH}`
    : `${PITCH_WIDTH} / ${PITCH_HEIGHT}`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio,
        minHeight: isVertical
          ? 520
          : 280,
        overflow: "hidden",
        borderRadius: 8,
        background: "#1e4a31",
      }}
    >
      <MatchPitch3D {...props} />
    </div>
  );
}