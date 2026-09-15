import React, { memo, useMemo } from "react";
import { Platform, View } from "react-native";
import Svg, { Ellipse, Polygon } from "react-native-svg";
import { readAvatar } from "../../shared/avatar.mjs";
import { characterMesh, projectCharacter } from "../../shared/character3d.mjs";

// Software 3D renderer: XYZ geometry, perspective, face culling and directional
// lighting. Static portraits do not schedule animation frames or WebGL contexts.
function Character({
  avatar,
  size = 80,
  label,
  yaw = -0.35,
  framed = true,
}: {
  avatar?: unknown;
  size?: number;
  label?: string;
  yaw?: number;
  framed?: boolean;
}) {
  const a = readAvatar(avatar);
  const mesh = useMemo(
    () => characterMesh(a, size >= 160, !framed),
    [a.species, a.color, a.accessory, size >= 160, framed],
  );
  const faces = useMemo(() => projectCharacter(mesh, yaw), [mesh, yaw]);
  return (
    <View
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: a.frame === "square" ? size * 0.2 : size / 2,
        backgroundColor: framed ? "#EDEAF8" : "transparent",
        overflow: "hidden",
        borderWidth: framed ? (a.frame === "gold" ? 3 : 1) : 0,
        borderColor: a.frame === "gold" ? "#C39832" : "#D7D0EA",
      }}
    >
      {/* react-native-svg's web Svg passes unknown props straight through to
      the DOM <svg> element — accessible={false} became a raw (invalid)
      "accessible" HTML attribute there. The parent View already owns
      accessibility (accessible={!!label} above), so this only matters on
      native, where Svg accepts real RN accessibility props. */}
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 200 200"
        accessible={Platform.OS === "web" ? undefined : false}
      >
        <Ellipse
          cx={100}
          cy={177}
          rx={49}
          ry={10}
          fill="#292444"
          opacity={0.16}
        />
        {faces.map((face) => (
          <Polygon
            key={face.id}
            points={face.points}
            fill={face.color}
            stroke={face.color}
            strokeWidth={0.3}
          />
        ))}
      </Svg>
    </View>
  );
}
export default memo(Character);
