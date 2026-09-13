import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius, shadow } from "../theme";

export type Segment<T extends string> = { id: T; label: string };

export default function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  role = "button",
}: {
  items: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  role?: "button" | "tab";
}) {
  return (
    <View style={s.track}>
      {items.map((item) => {
        const selected = value === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole={role}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.id)}
            style={[s.item, selected && s.selected]}
          >
            <Text style={[s.label, selected && s.labelSelected]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  item: {
    flexGrow: 1,
    flexBasis: 80,
    minWidth: 60,
    paddingVertical: 8,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  selected: { backgroundColor: palette.surface, ...shadow.soft },
  label: {
    color: palette.textDim,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  labelSelected: { color: palette.violet, fontWeight: "900" },
});
