import React from "react";
import { Share, Text, TextInput, View } from "react-native";
import { palette } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import { catalog, title, Game } from "./catalog";
import { s } from "./styles";

const err = (e: unknown) =>
  e instanceof Error ? e.message : "Algo deu errado.";

export default function DuelosTab({
  connected,
  code,
  setCode,
  difficulty,
  setDifficulty,
  duels,
  profileId,
  busy,
  onJoinDuel,
  onCreateDuel,
  onPlayDuel,
  onError,
}: {
  connected: boolean;
  code: string;
  setCode: (code: string) => void;
  difficulty: number;
  setDifficulty: (n: number) => void;
  duels: any[];
  profileId: string;
  busy: boolean;
  onJoinDuel: () => void;
  onCreateDuel: (game: Game) => void;
  onPlayDuel: (game: Game, duelCode: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <View style={s.row}>
        <View
          style={[
            s.liveDot,
            { backgroundColor: connected ? palette.green : palette.red },
          ]}
        />
        <Text style={s.label}>
          {connected ? "CONECTADO AO SERVIDOR" : "RECONECTANDO…"}
        </Text>
      </View>
      <Text style={s.hero}>{"Uma prova.\nDois jogadores."}</Text>
      <Text style={s.muted}>
        Crie uma sala e envie o código. Cada jogador faz sua tentativa; o
        placar atualiza automaticamente quando o rival terminar.
      </Text>
      <Text style={s.heading}>Entre na sala de um amigo</Text>
      <TextInput
        accessibilityLabel="Código do duelo"
        style={s.input}
        value={code}
        onChangeText={setCode}
        maxLength={10}
        autoCapitalize="characters"
        placeholder="Código de 10 caracteres"
        placeholderTextColor={palette.textFaint}
      />
      <Button disabled={busy} onPress={onJoinDuel}>
        Entrar na sala
      </Button>
      <Text style={s.heading}>Ou crie uma sala</Text>
      <Text style={s.muted}>
        1. Escolha a dificuldade · 2. Escolha o jogo · 3. Convide
      </Text>
      <View style={s.choices}>
        {[1, 2, 3].map((n) => (
          <Button
            key={n}
            disabled={difficulty === n}
            onPress={() => setDifficulty(n)}
          >
            {n}
          </Button>
        ))}
      </View>
      {catalog.map((g) => (
        <Button key={g.id} disabled={busy} onPress={() => onCreateDuel(g.id)}>
          Desafiar: {g.name}
        </Button>
      ))}
      <Text style={s.heading}>Seus duelos</Text>
      {duels.length === 0 && (
        <Text style={s.muted}>Nenhum duelo ainda. Convide o primeiro amigo.</Text>
      )}
      {duels.map((d) => {
        const mine = d.results.find((r: any) => r.player === profileId);
        const other = d.results.find((r: any) => r.player !== profileId);
        return (
          <Card key={d.code}>
            <Text style={s.heading}>{title(d.config.game)}</Text>
            {(d.participants || []).map((p: any) => (
              <Text key={p.id} style={s.muted}>
                {p.name}
                {p.id === profileId ? " (você)" : ""} ·{" "}
                {p.online ? "online" : "ausente"}
              </Text>
            ))}
            {!d.guest && (
              <Text style={s.muted}>
                Sala aberta · esperando seu amigo entrar
              </Text>
            )}
            <Text selectable style={s.accent}>
              {d.code}
            </Text>
            <Text style={s.muted}>
              {Date.now() > d.expires
                ? "Expirado"
                : d.results.length === 2
                  ? mine.score === other.score
                    ? "Empate"
                    : mine.score > other.score
                      ? "Você venceu"
                      : "O rival venceu"
                  : mine
                    ? "Aguardando rival"
                    : "Sua vez"}{" "}
              · {mine ? mine.score + " pontos" : "Sem resultado"}
            </Text>
            {!mine && Date.now() < d.expires && (
              <Button
                disabled={busy || !connected || !d.guest}
                onPress={() => onPlayDuel(d.config.game, d.code)}
              >
                Jogar tentativa
              </Button>
            )}
            <Button
              onPress={() => {
                Share.share({
                  message: "Meu código Duelou: " + d.code,
                }).catch((e) => onError(err(e)));
              }}
            >
              Compartilhar código
            </Button>
          </Card>
        );
      })}
    </>
  );
}
