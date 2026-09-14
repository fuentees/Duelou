import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Character from "../components/Character";
import { arena, palette, radius } from "../theme";

// Extraído de ArenaScreen.tsx (Ticket 3) quando ganhou um segundo consumidor
// (ArenaOnlineScreen, Ticket 24) — mesmo visual nos dois modos, offline e
// online.
//
// Agora também mostra quem está do lado de lá: avatar, nome e o que estiver
// acontecendo com aquele jogador (combo, reconexão). Antes a partida inteira
// dizia só "SUA BASE" e "BASE INIMIGA" — o personagem que a pessoa montou no
// editor nunca aparecia em campo, e o adversário era um rótulo.
export default function HealthBar({
  label,
  hp,
  color,
  flash = false,
  danger = false,
  avatar,
  name,
  trailing,
  dark = false,
}: {
  label: string;
  hp: number;
  color: string;
  flash?: boolean;
  danger?: boolean;
  avatar?: unknown;
  name?: string;
  trailing?: React.ReactNode;
  dark?: boolean;
}) {
  const captionColor = dark ? arena.textDim : palette.textFaint;
  const trackColor = dark ? arena.surfaceAlt : palette.surfaceAlt;
  return (
    <View style={s.healthBlock} accessibilityLabel={`${label}: ${Math.round(hp)} de 100`}>
      <View style={s.row}>
        <View style={s.identity}>
          {name ? (
            <Character avatar={avatar} size={32} />
          ) : null}
          <Text style={[s.caption, { color: captionColor }]} numberOfLines={1}>
            {name ? `${name} · ` : `${label} · `}
            {Math.max(0, Math.round(hp))}/100
          </Text>
          {trailing}
        </View>
        {danger && (
          <Text
            style={[s.danger, dark ? { color: arena.danger } : null]}
            accessibilityLiveRegion="polite"
          >
            ⚠ CRÍTICO
          </Text>
        )}
      </View>
      <View
        style={[s.healthTrack, { backgroundColor: trackColor }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, hp)) }}
      >
        <View
          style={[
            s.healthFill,
            {
              width: `${Math.max(0, Math.min(100, hp))}%`,
              backgroundColor: danger ? (dark ? arena.danger : palette.red) : color,
            },
          ]}
        />
        {/* Flash branco por cima ao ser atingida — some sozinho logo em
            seguida (ver BASE_FLASH_MS em quem chama). */}
        {flash && <View style={s.healthFlash} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  identity: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  caption: { fontSize: 12, fontWeight: "700", color: palette.textFaint, flexShrink: 1 },
  danger: { fontSize: 11, fontWeight: "900", color: palette.red },
  healthBlock: { gap: 4 },
  healthTrack: {
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceAlt,
    overflow: "hidden",
    position: "relative",
  },
  healthFill: { height: 14 },
  healthFlash: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#FFFFFFB0" },
});
