import BattlePresentation from "./BattlePresentation";
import Character from "../components/Character";
import { performanceLabel } from "../../shared/arcade.mjs";
import React, { useState } from "react";
import { Share, Platform, Text, View } from "react-native";
import {
  ArcadeMode,
  ArcadeConfig,
  levels,
  MAX_LEVEL,
} from "../../shared/arcade.mjs";
import { medal } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import AnimatedNumber from "../components/AnimatedNumber";
import CompetitiveRound from "./CompetitiveRound";
import { ratingName } from "../../shared/progression.mjs";
import Round from "./Round";
import { s } from "./styles";

type Member = {
  id: string;
  name: string;
  online: boolean;
  avatar?:unknown;
  rank?:number|null;
  ready?:boolean;
  forfeited?:boolean;
  answered?: number;
  total?: number;
  score: number | null;
  seriesWins: number;
  durationMs: number | null;
  details?: string[];
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
  ranked?: boolean;
  ratingResult?: {
    delta: number;
    rating: number;
    outcome: number;
    status?: string;
  } | null;
  public: boolean;
  state: string;
  starts: number | null;
  breakStarted?:number|null;
  breakUntil?:number|null;
  ends: number | null;
  serverNow: number;
  config: ArcadeConfig | null;
  members: Member[];
  history?: {
    scores: Record<string, number>;
    winner: string | null;
    details?: string[];
  }[];
  ratingNotice?: string | null;
  nextCode: string | null;
  nextAction?: "continue" | "rematch" | null;
  nextDifficulty?: number | null;
};

export default function RoomView({
  room,
  onRefresh,
  onQueuePractice,
  player,
  game,
  connected,
  now,
  busy,
  pending,
  onStart,
  onReady,
  onFinish,
  onLeave,
  onRematch,
  onContinue,
  onAcceptRematch,
  onDeclineRematch,
  rematchDismissed,
  onError,
}: {
  room: Room;
  onRefresh: () => Promise<void>;
  onQueuePractice: () => void;
  player: { id: string; name: string } | null;
  game: { name: string; description: string };
  connected: boolean;
  now: number;
  busy: boolean;
  pending: number[] | null;
  onStart: () => void;
  onReady: () => void;
  onFinish: (answers: number[]) => void;
  onLeave: () => void;
  onRematch: () => void;
  onContinue: () => void;
  onAcceptRematch: () => void;
  onDeclineRematch: () => void;
  rematchDismissed: boolean;
  onError: (message: string) => void;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const mine = room.members.find((m) => m.id === player?.id);
  const final = room.state === "finished";
  const lastProof=room.history?.[room.history.length-1];
  const bestWins = Math.max(...room.members.map((m) => m.seriesWins));
  const winners = room.members.filter((m) => m.seriesWins === bestWins);
  const outcome =
    bestWins === 0
      ? "Empate — nenhuma prova teve vencedor"
      : winners.length > 1
        ? "Série empatada"
        : winners[0]?.id === player?.id
          ? "Você venceu!"
          : "Você perdeu esta disputa";
  return (
    <>
      <View style={s.row}>
        <Text style={s.eyebrow}>SALA {room.code}</Text>
        <Text style={s.tag}>{connected ? "CONECTADO" : "RECONECTANDO"}</Text>
      </View>
      <Text style={s.title}>{game.name}</Text>
      <Text style={s.caption}>
        {levels[(room.difficulty || 1) - 1]} ·{" "}
        {room.config ? room.config.seconds : ""}
        {room.config ? " segundos" : "Mesma dificuldade para todos"}
      </Text>
      {!!room.ratingNotice && (
        <Text style={s.caption}>{room.ratingNotice}</Text>
      )}
      {room.ranked && room.state === "playing" && (
        <View style={{ gap: 10 }}>
          {room.members
            .filter((m) => m.id !== player?.id)
            .map((rival) => (
              <View
                key={rival.id}
                accessibilityLabel={`Progresso de ${rival.name}: ${rival.answered || 0} de ${rival.total || 18} questões`}
                style={{ gap: 6 }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Character avatar={rival.avatar} size={40}/>
                  <Text style={s.caption}>
                    {rival.name} · {rival.answered || 0}/{rival.total || 18}{" "}
                    questões · {rival.seriesWins} vitória(s) na série
                  </Text>
                </View>
                <View
                  style={{
                    height: 5,
                    backgroundColor: "#DDD8EE",
                    borderRadius: 3,
                  }}
                >
                  <View
                    style={{
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: "#7759DF",
                      width: `${Math.min(100, (100 * (rival.answered || 0)) / Math.max(1, rival.total || 18))}%`,
                    }}
                  />
                </View>
              </View>
            ))}
        </View>
      )}
      {room.state === "waiting" ? (
        <>
          <Text style={s.body}>
            {room.public && room.capacity === 2 && room.members.length === 1
              ? room.ranked
                ? "Buscando um rival de habilidade próxima. A busca amplia aos poucos, até 400 pontos de diferença."
                : "Procurando alguém para uma partida casual…"
              : `${room.members.length} de ${room.capacity} jogadores. O anfitrião pode começar com pelo menos dois conectados.`}
          </Text>
          <Card>
            {room.members.length > 6 ? (
              <View style={s.memberGrid}>
                {room.members.map((m) => (
                  <View key={m.id} style={s.memberGridItem}>
                    <Text style={s.memberGridName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    {/* Símbolo (✓/–) além da cor — presença não pode depender só de
                        verde/vermelho pra quem não distingue bem as duas cores. */}
                    <Text
                      style={[
                        s.memberGridDetail,
                        m.online ? s.presenceTextOn : s.presenceTextOff,
                      ]}
                      accessibilityLabel={m.online ? "Presente" : "Ausente"}
                    >
                      {m.online ? "✓ presente" : "– ausente"}
                    </Text>
                    {m.id === room.host && (
                      <Text style={s.memberGridDetail}>anfitrião</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              room.members.map((m) => (
                <View style={[s.row,{flexWrap:"wrap"}]} key={m.id}>
                  <Text style={s.member}>
                    {m.name}
                    {m.id === room.host ? " · anfitrião" : ""}
                  </Text>
                  <View
                    style={[
                      s.presencePill,
                      m.online ? s.presenceOn : s.presenceOff,
                    ]}
                  >
                    <Text style={s.caption}>
                      {m.online ? "Presente" : "Ausente"}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
          {room.ranked && (
            <Button secondary onPress={onQueuePractice}>
              Treinar enquanto procura
            </Button>
          )}
          <Text selectable style={s.roomCode}>
            {room.code}
          </Text>
          {!room.ranked && (
            <Button
              secondary
              accessibilityLabel="Compartilhar convite"
              onPress={() => {
                Share.share({
                  message: `Entre na minha sala Duelou: ${room.code}. ${Platform.OS === "web" ? globalThis.location.origin + "?room=" + room.code : "duelou://room/" + room.code}`,
                }).catch((e) => onError(e.message));
              }}
            >
              Compartilhar convite
            </Button>
          )}
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
      ) : room.state === "intermission" && now < (room.breakUntil || 0) ? (
        <Card active>
          <Text style={s.eyebrow}>RESULTADO DA PROVA {room.gameIndex}</Text>
          <Text accessibilityLiveRegion="polite" style={s.title}>{lastProof?.winner===player?.id?"Você venceu a prova!":lastProof?.winner?"Seu rival levou esta prova":"Prova empatada"}</Text>
          <Text style={s.body}>Placar da série: {room.members.map(m=>`${m.name} ${m.seriesWins}`).join(" × ")}</Text>
          {room.members.map(m=><View key={m.id} style={{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <Character avatar={m.avatar} size={48}/><Text style={s.member}>{m.name}: {lastProof?.scores[m.id] ?? 0} pts</Text>
            <Text style={s.caption}>{m.forfeited?"Saiu da série":m.ready?"✓ Pronto":"Lendo resultado"}</Text>
          </View>)}
          {lastProof?.details?.map((detail,i)=><Text key={i} style={s.body}>{detail}</Text>)}
          <Text style={s.eyebrow}>PROVA {room.gameIndex+1} DE {room.gamesNeeded}</Text>
          <Text style={s.caption}>A próxima prova começa em até {Math.max(0,Math.ceil(((room.starts||now)-now)/1000))}s. Todos prontos antecipam a largada, com pelo menos 5 segundos para ler e 5 de contagem.</Text>
          <Button disabled={busy || !connected || !!mine?.ready || !!mine?.forfeited} onPress={onReady}>{mine?.ready?"Você está pronto":"Pronto para a próxima"}</Button>
          {mine?.ready && <Text accessibilityLiveRegion="polite" style={s.caption}>Prontidão confirmada. Aguarde os rivais ou o fim do intervalo.</Text>}
        </Card>
      ) : room.starts && now < room.starts ? (
        <Card active>
          <BattlePresentation members={room.members} playerId={player?.id}/>
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
          {final && <BattlePresentation members={room.members} playerId={player?.id} final outcome={outcome}/>}
          {room.ratingResult && (
            <Text style={s.body}>
              {ratingName(room.ratingResult.rating)} ·{" "}
              {room.ratingResult.rating} pontos (
              {room.ratingResult.delta >= 0 ? "+" : ""}
              {room.ratingResult.delta}).{" "}
              {room.ratingResult.status === "same_rival_limit"
                ? "Limite diário deste rival atingido; série sem alteração de classificação."
                : "Classificação atualizada pela série."}
            </Text>
          )}
          {final && mine && mine.seriesWins < bestWins && (
            <Text style={s.body}>
              Seu rival venceu {bestWins - mine.seriesWins} prova(s) a mais.
              Compare os detalhes abaixo e pratique antes da revanche.
            </Text>
          )}
          {mine?.score != null && (
            <>
              <Text style={s.title}>{performanceLabel(mine.score)}</Text>
              {mine.details?.map((line) => (
                <Text key={line} style={s.body}>
                  {line}
                </Text>
              ))}
            </>
          )}
          {room.state === "finished" && room.gamesNeeded > 1
            ? room.members.map((m) => {
                const rank = 1 + room.members.filter((other) => other.seriesWins > m.seriesWins).length;
                const medalPrefix = medal(rank - 1);
                return (
                  <View key={m.id} style={[s.row,{flexWrap:"wrap"}]}>
                    <Text style={s.member}>
                      {medalPrefix ? `${medalPrefix} ` : ""}
                      {`${rank}. `}
                      {m.name}
                    </Text>
                    <Text style={s.member}>
                      {m.seriesWins} de {room.gamesNeeded} provas
                    </Text>
                  </View>
                );
              })
            : room.members.map((m) => {
                // Mais pontos vence; empatado, quem respondeu mais rápido fica na frente.
                const rank = m.score !== null
                  ? 1 + room.members.filter((other) => (other.score ?? -1) > m.score! || ((other.score ?? -1) === m.score && (other.durationMs ?? Infinity) < (m.durationMs ?? Infinity))).length
                  : null;
                const medalPrefix = rank !== null ? medal(rank - 1) : "";
                return (
                  <View key={m.id} style={[s.row,{flexWrap:"wrap"}]}>
                    <Text style={s.member}>
                      {rank !== null
                        ? `${medalPrefix ? medalPrefix + " " : ""}${rank}. `
                        : ""}
                      {m.name}
                    </Text>
                    <Text style={s.member}>
                      {m.score === null
                        ? room.state === "finished"
                          ? "Não concluiu"
                          : "Jogando…"
                        : `${m.score} pts${m.durationMs !== null ? ` · ${(m.durationMs / 1000).toFixed(1)}s total` : ""}`}
                    </Text>
                  </View>
                );
              })}
          <Text style={s.caption}>
            Mais pontos vence a prova. Se a pontuação empatar, vence quem
            concluir primeiro no servidor. Pontuação e tempo iguais mantêm o
            empate.{" "}
            {room.ranked
              ? "Só esta fila oficial altera sua classificação."
              : "Sala casual: não altera a classificação competitiva."}
          </Text>
          {final && !!room.history?.length && (
            <>
              <Button
                secondary
                onPress={() => setShowBreakdown(!showBreakdown)}
              >
                {showBreakdown ? "Ocultar provas" : "Ver todas as provas"}
              </Button>
              {showBreakdown &&
                room.history.map((h, index) => (
                  <View key={index} style={{ gap: 6 }}>
                    <Text style={s.member}>
                      Prova {index + 1} ·{" "}
                      {h.winner === player?.id
                        ? "Vitória"
                        : h.winner
                          ? "Derrota"
                          : "Empate"}
                    </Text>
                    <Text style={s.body}>
                      {room.members
                        .map((m) => `${m.name}: ${h.scores[m.id] ?? 0} pts`)
                        .join(" · ")}
                    </Text>
                    {h.details?.map((detail, i) => (
                      <Text key={i} style={s.caption}>
                        {detail}
                      </Text>
                    ))}
                  </View>
                ))}
            </>
          )}
          {!final && (
            <Text style={s.body}>
              Seu resultado está salvo. Aguardando os outros jogadores
              terminarem…
            </Text>
          )}
          {final && (
            <>
              {(room.ranked || !room.nextCode) && (
                <Button
                  disabled={busy || !connected}
                  accessibilityLabel="Continuar"
                  onPress={onContinue}
                >
                  {room.ranked
                    ? "Buscar próximo rival"
                    : room.difficulty < MAX_LEVEL
                      ? "Continuar · nível " + (room.difficulty + 1)
                      : "Continuar · nível " + MAX_LEVEL}
                </Button>
              )}
              {(room.ranked || !room.nextCode) && (
                <Text style={s.caption}>
                  {room.ranked
                    ? "Encontre outro rival sem sair daqui. A fila define os jogos e a dificuldade."
                    : room.difficulty < MAX_LEVEL
                      ? "Avance com o grupo. Os outros jogadores recebem um convite para a próxima sala."
                      : "Você chegou ao nível máximo. Continue com uma nova prova neste nível."}
                </Text>
              )}
              {room.nextCode ? (
                <>
                  <Text style={s.body}>
                    {room.nextAction === "continue"
                      ? "O grupo foi convidado para continuar no nível " +
                        room.nextDifficulty +
                        "."
                      : "Há uma revanche disponível no mesmo nível."}
                  </Text>
                  {!rematchDismissed ? (
                    <Button
                      disabled={busy || !connected}
                      accessibilityLabel={
                        room.nextAction === "continue"
                          ? "Aceitar continuação"
                          : "Aceitar revanche"
                      }
                      onPress={onAcceptRematch}
                    >
                      {room.nextAction === "continue"
                        ? "Continuar com o grupo"
                        : "Aceitar revanche"}
                    </Button>
                  ) : (
                    <Button
                      secondary
                      disabled={busy || !connected}
                      onPress={onAcceptRematch}
                    >
                      Reabrir convite
                    </Button>
                  )}
                  {!rematchDismissed && (
                    <Button
                      secondary
                      disabled={busy}
                      accessibilityLabel="Agora não"
                      onPress={onDeclineRematch}
                    >
                      Agora não
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  secondary
                  disabled={busy || !connected}
                  accessibilityLabel="Criar revanche"
                  onPress={onRematch}
                >
                  {room.ranked ? "Revanche casual" : "Revanche · mesmo nível"}
                </Button>
              )}
            </>
          )}
        </Card>
      ) : room.ranked ? (
        <CompetitiveRound
          key={room.code + ":" + room.gameIndex}
          code={room.code}
          gameIndex={room.gameIndex}
          onRefresh={onRefresh}
        />
      ) : room.config ? (
        <Round
          key={room.code + ":" + room.gameIndex}
          config={room.config}
          seconds={Math.max(0, ((room.ends || now) - now) / 1000)}
          onFinish={onFinish}
        />
      ) : (
        <Text style={s.body}>Preparando prova…</Text>
      )}
      {confirmLeave && (
        <Card>
          <Text style={s.body}>
            Sair agora encerra sua participação. Na competição, você perde as
            provas restantes.
          </Text>
          <Button disabled={busy} onPress={onLeave}>
            Confirmar saída
          </Button>
          <Button secondary onPress={() => setConfirmLeave(false)}>
            Continuar jogando
          </Button>
        </Card>
      )}
      <Button
        secondary
        disabled={busy}
        accessibilityLabel={
          room.state === "finished" ? "Voltar às salas" : "Sair da sala"
        }
        onPress={() =>
          room.ranked && room.state !== "waiting" && room.state !== "finished"
            ? setConfirmLeave(true)
            : onLeave()
        }
      >
        {room.state === "finished" ? "Voltar às salas" : "Sair da sala"}
      </Button>
    </>
  );
}
