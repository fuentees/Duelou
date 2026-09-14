import React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { readAvatar, avatarOptions } from "../../shared/avatar.mjs";
import { palette, shade, shadow } from "../theme";

// Code-drawn characters scale cleanly and need no image downloads or icon fonts.
export default function Character({
  avatar,
  size = 80,
  label,
}: {
  avatar?: unknown;
  size?: number;
  label?: string;
}) {
  const a = readAvatar(avatar),
    color = avatarOptions.color.find((c) => c.id === a.color)!.hex!;
  const unit = size / 100;
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    extra: object = {},
  ) => ({
    position: "absolute" as const,
    left: x * unit,
    top: y * unit,
    width: w * unit,
    height: h * unit,
    ...extra,
  });
  const frameRadius = a.frame === "square" ? size * 0.2 : size / 2;
  return (
    // Duas camadas: a de fora carrega a sombra (sem overflow:hidden, senão a
    // sombra também seria cortada); a de dentro mantém o recorte/borda que
    // já existia. Moldura "gold" ganha um brilho em vez da sombra neutra —
    // mesmo shadow.glow() já usado nas conquistas desbloqueadas (PerfilTab).
    <View
      style={[
        { width: size, height: size, borderRadius: frameRadius },
        a.frame === "gold" ? shadow.glow(palette.gold) : shadow.soft,
      ]}
    >
      <View
        accessible={!!label}
        accessibilityLabel={label}
        style={{
          width: size,
          height: size,
          borderRadius: frameRadius,
          backgroundColor: "#F0EBFF",
          borderWidth: a.frame === "gold" ? 3 : 1,
          borderColor: a.frame === "gold" ? "#A97517" : "#D7CEE9",
          overflow: "hidden",
        }}
      >
      <LinearGradient
        colors={[shade(color, 0.16), shade(color, -0.16)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={box(18, 68, 64, 42, { borderRadius: 20 * unit })}
      />
      {a.species === "cat" && (
        <>
          <View
            style={box(24, 18, 20, 25, {
              backgroundColor: color,
              transform: [{ rotate: "-20deg" }],
              borderRadius: 3 * unit,
            })}
          />
          <View
            style={box(56, 18, 20, 25, {
              backgroundColor: color,
              transform: [{ rotate: "20deg" }],
              borderRadius: 3 * unit,
            })}
          />
        </>
      )}
      {a.species === "robot" && (
        <>
          <View style={box(48, 12, 4, 18, { backgroundColor: "#24304B" })} />
          <View
            style={box(44, 10, 12, 12, {
              backgroundColor: color,
              borderRadius: 10 * unit,
            })}
          />
        </>
      )}
      {a.species === "alien" && (
        <>
          <View
            style={box(27, 13, 4, 25, {
              backgroundColor: color,
              transform: [{ rotate: "-25deg" }],
            })}
          />
          <View
            style={box(67, 13, 4, 25, {
              backgroundColor: color,
              transform: [{ rotate: "25deg" }],
            })}
          />
        </>
      )}
      <LinearGradient
        colors={[shade(color, 0.16), shade(color, -0.16)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={box(22, 28, 56, 48, {
          borderRadius: (a.species === "robot" ? 12 : 26) * unit,
          borderWidth: 2,
          borderColor: "#FFFFFF",
        })}
      />
      {/* Brilho — um oval branco translúcido no alto da cabeça, acima dos
          olhos (que começam em y=45), pra sugerir uma superfície curva sem
          precisar de um motor 3D de verdade. */}
      <View
        pointerEvents="none"
        style={box(30, 32, 18, 9, {
          backgroundColor: "#FFFFFF",
          opacity: 0.3,
          borderRadius: 8 * unit,
        })}
      />
      <View
        style={box(28, 39, 44, 24, {
          backgroundColor: "#17243C",
          borderRadius: 12 * unit,
        })}
      />
      {[35, 57].map((x) => (
        <View
          key={x}
          style={box(x, 45, 8, a.species === "alien" ? 13 : 9, {
            backgroundColor: "#D6FFF3",
            borderRadius: 8 * unit,
          })}
        />
      ))}
      <View
        style={box(42, 65, 16, 3, {
          backgroundColor: "#FFFFFF",
          borderRadius: 3 * unit,
        })}
      />
      {a.accessory === "visor" && (
        <View
          style={box(27, 43, 46, 8, {
            backgroundColor: "#8DE1EF",
            borderRadius: 4 * unit,
            opacity: 0.85,
          })}
        />
      )}
      {a.accessory === "crown" && (
        <>
          <View
            style={box(32, 24, 36, 10, {
              backgroundColor: "#E6AC28",
              borderRadius: 3 * unit,
            })}
          />
          {[32, 47, 62].map((x) => (
            <View
              key={x}
              style={box(x, 15, 7, 16, {
                backgroundColor: "#F5C644",
                borderRadius: 2 * unit,
              })}
            />
          ))}
        </>
      )}
      {a.species === "cat" && (
        <View
          style={box(47, 59, 6, 5, {
            backgroundColor: "#FFA9AE",
            borderRadius: 4 * unit,
          })}
        />
      )}
      </View>
    </View>
  );
}
