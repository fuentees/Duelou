import React from "react";
import { Share, Text, View } from "react-native";
import {
  ArcadeMode,
  ArcadeConfig,
  levels,
  levelRules,
} from "../../shared/arcade.mjs";
import { medal } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import AnimatedNumber from "../components/AnimatedNumber";
import Round from "./Round";
import { s } from "./styles";

type Member = {
  id: string;
  name: string;
  online: boolean;
  score: number | null;
  seriesWins: number;
  durationMs: number | null;
};
type Room = {
  code: string;
  host: string;
  mode: ArcadeMode;
  difficulty: number;
  format: "md1" | "md3";
  gameIndex: number;
  gamesNeeded: number;
  capacity: number;
  public: boolean;
  state: string;
  starts: number | null;
  ends: number | null;
  serverNow: number;
  config: ArcadeConfig | null;
  members: Member[];
};

export default function RoomView({
  room,
  player,
  game,
  connected,
  now,
  busy,
  pending,
  onStart,
  onFinish,
  onLeave,
  onRematch,
  onError,
}: {
  room: Room;
  player: { id: string; name: string } | null;
  game: { name: string; description: string };
  connected: boolean;
  now: number;
  busy: boolean;
  pending: number[] | null;
  onStart: () => void;
  onFinish: (answers: number[]) => void;
  onLeave: () => void;
  onRematch: () => void;
  onError: (message: string) => void;
}) {
  const mine = room.members.find((m) => m.id === player?.id);
  return (
    <>
      <View style={s.row}>
        <Text style={s.eyebrow}>SALA {room.code}</Text>
        <Text style={s.tag}>{connected ? "CONECTADO" : "RECONECTANDO"}</Text>
      </View>
      <Text style={s.title}>{game.name}</Text>
      <Text style={s.caption}>
        {levels[(room.difficulty || 1) - 1]} ·{" "}
        {levelRules[(room.difficulty || 1) - 1].rounds} rodadas ·{" "}
        {levelRules[(room.difficulty || 1) - 1].seconds} segundos
      </Text>
      {room.state === "waiting" ? (
        <>
          <Text style={s.body}>
            {room.public && room.capacity === 2 && room.members.length === 1
              ? "Procurando alguém do mesmo jogo e nível… A partida começa automaticamente quando encontrar."
              : `${room.members.length} de ${room.capacity} jogadores. O anfitrião pode começar com pelo menos dois conectados.`}
          </Text>
          <Card>
            {room.members.map((m) => (
              <View style={s.row} key={m.id}>
                <Text style={s.member}>
                  {m.name}
                  {m.id === room.host ? " · anfitrião" : ""}
                </Text>
                <View
                  style={[s.presencePill, m.online ? s.presenceOn : s.presenceOff]}
                >
                  <Text style={s.caption}>
                    {m.online ? "Presente" : "Ausente"}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
          <Text selectable style={s.roomCode}>
            {room.code}
          </Text>
          <Button
            secondary
            accessibilityLabel="Compartilhar convite"
            onPress={() => {
              Share.share({
                message: `Entre na minha sala Duelou: ${room.code}. Abra Com amigos e digite o código.`,
              }).catch((e) => onError(e.message));
            }}
          >
            Compartilhar convite
          </Button>
          {room.public && room.capacity === 2 ? (
            <Text style={s.caption}>Pareamento automático ativo.</Text>
          ) : room.host === player?.id ? (
            <Button
              disabled={busy || room.members.filter((m) => m.online).length < 2}
              accessibilityLabel="Começar partida"
              onPress={onStart}
            >
              Começar partida
            </Button>
          ) : (
            <Text style={s.caption}>Aguardando o anfitrião iniciar…</Text>
          )}
        </>
      ) : room.starts && now < room.starts ? (
        <Card active>
          {room.gamesNeeded > 1 && (
            <Text style={s.eyebrow}>
              PROVA {room.gameIndex + 1} DE {room.gamesNeeded}
            </Text>
          )}
          {room.gameIndex > 0 && (
            <Text style={s.body}>
              Placar da série:{" "}
              {room.members.map((m) => `${m.name} ${m.seriesWins}`).join(" × ")}
            </Text>
          )}
          <Text style={s.body}>
            {room.gameIndex > 0
              ? "Prepare-se para a próxima prova."
              : "Prepare-se. A mesma prova para todos."}
          </Text>
          <AnimatedNumber
            value={Math.ceil((room.starts - now) / 1000)}
            style={s.score}
          />
          <Text style={s.body}>{game.description}</Text>
        </Card>
      ) : pending ? (
        <Card>
          <Text style={s.body}>
            {busy
              ? "Enviando resultado…"
              : "Seu resultado ainda não foi enviado."}
          </Text>
          <Button
            disabled={busy}
            accessibilityLabel="Tentar enviar novamente"
            onPress={() => onFinish(pending)}
          >
            Tentar enviar novamente
          </Button>
        </Card>
      ) : mine?.score !== null || room.state === "finished" ? (
        <Card>
          <Text style={s.eyebrow}>
            {room.state === "finished"
              ? room.gamesNeeded > 1
                ? "PLACAR DA SÉRIE"
                : "PLACAR FINAL"
              : "SEU RESULTADO FOI SALVO"}
          </Text>
          {room.state === "finished" && room.gamesNeeded > 1
            ? room.members.map((m, i) => (
                <View key={m.id} style={s.row}>
                  <Text style={s.member}>
                    {medal(i) ? medal(i) + " " : `${i + 1}. `}
                    {m.name}
                  </Text>
                  <Text style={s.member}>
                    {m.seriesWins} de {room.gamesNeeded} provas
                  </Text>
                </View>
              ))
            : room.members.map((m, i) => (
                <View key={m.id} style={s.row}>
                  <Text style={s.member}>
                    {m.score !== null
                      ? medal(i)
                        ? medal(i) + " "
                        : `${i + 1}. `
                      : ""}
                    {m.name}
                  </Text>
                  <Text style={s.member}>
                    {m.score === null
                      ? room.state === "finished"
                        ? "Não concluiu"
                        : "Jogando…"
                      : `${m.score}${m.durationMs !== null ? ` · ${(m.durationMs / 1000).toFixed(1)}s` : ""}`}
                  </Text>
                </View>
              ))}
          <Text style={s.caption}>
            Mais pontos vence. Em empate, termina na frente quem respondeu em
            menos tempo. O placar não altera o ranking clássico.
          </Text>
          {room.state === "finished" && (
            <Button
              disabled={busy}
              accessibilityLabel="Criar revanche"
              onPress={onRematch}
            >
              Criar revanche
            </Button>
          )}
        </Card>
      ) : room.config ? (
        <Round
          key={room.code}
          config={room.config}
          seconds={Math.max(0, ((room.ends || now) - now) / 1000)}
          onFinish={onFinish}
        />
      ) : (
        <Text style={s.body}>Preparando prova…</Text>
      )}
      <Button
        secondary
        disabled={busy}
        accessibilityLabel={
          room.state === "finished" ? "Voltar às salas" : "Sair da sala"
        }
        onPress={onLeave}
      >
        {room.state === "finished" ? "Voltar às salas" : "Sair da sala"}
      </Button>
    </>
  );
}
