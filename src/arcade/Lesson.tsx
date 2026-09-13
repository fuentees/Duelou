import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ArcadeMode, makeArcade, modes } from "../../shared/arcade.mjs";
import { chapterFor } from "../../shared/progression.mjs";
import Button from "../components/Button";
import { s } from "./styles";
const tips: Partial<Record<ArcadeMode, string>> = {
  timer:
    "Inicie o relógio, conte no seu ritmo e pare no alvo. O resultado mostra se você se antecipou ou atrasou.",
  reflex:
    "Toque para começar. Espere a palavra AGORA antes do segundo toque. Antecipar zera somente essa tentativa.",
  aim: "Comece e toque nos círculos antes que sumam. Cada alvo perdido reduz sua nota. Não é preciso tocar várias vezes no mesmo alvo.",
  memory:
    "Observe os blocos numerados. Quando aparecer Sua vez, repita a ordem. Agrupe os passos em pares para memorizar.",
};
export default function Lesson({
  mode,
  level,
  onStart,
}: {
  mode: ArcadeMode;
  level: number;
  onStart: () => void;
}) {
  const sample = useMemo(() => makeArcade(mode, 1).rounds[0], [mode]);
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <View style={s.round}>
      <Text style={s.eyebrow}>PREPARE-SE · FASE {level}</Text>
      <Text style={s.title}>{chapterFor(mode, level).lesson}</Text>
      <Text style={s.body}>
        {modes.find((m) => m.id === mode)?.description}
      </Text>
      {tips[mode] ? (
        <Text style={s.body}>{tips[mode]}</Text>
      ) : (
        <>
          <Text style={s.caption}>
            Exemplo sem cronômetro. Toque em uma resposta para experimentar.
          </Text>
          {mode === "colors" && (
            <Text style={s.body}>
              Leia a cor da tinta; ignore o significado da palavra.
            </Text>
          )}
          <Text
            style={[
              s.question,
              sample.promptColor ? { color: sample.promptColor,backgroundColor:"#172036",borderRadius:12,paddingHorizontal:12 } : null,
            ]}
          >
            {sample.prompt}
          </Text>
          {sample.options.map((v, i) => (
            <Button key={i} secondary onPress={() => setChoice(i)}>
              {String(v)}
            </Button>
          ))}
          {choice !== null && (
            <Text accessibilityLiveRegion="polite" style={s.body}>
              {choice === sample.answer
                ? "Acertou!"
                : "A resposta é " + sample.options[sample.answer!] + "."}{" "}
              {sample.explanation || ""}
            </Text>
          )}
          <Text style={s.caption}>
            Acertos seguidos aumentam o combo. Uma resposta por rodada.
          </Text>
        </>
      )}
      <Button onPress={onStart}>Começar fase</Button>
    </View>
  );
}
