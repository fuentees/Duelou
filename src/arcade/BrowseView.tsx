import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArcadeMode,
  modes,
  levels,
  levelRules,
  levelDetails,
  MAX_LEVEL,
} from "../../shared/arcade.mjs";
import { contrastText, gameColors, medal, palette } from "../theme";
import Button from "../components/Button";
import Card from "../components/Card";
import Pressy from "../components/Pressy";
import { s } from "./styles";

type Stats = {
  played: number;
  wins: number;
  best: number;
  average: number;
  level: number;
};
type Leader = Stats & { id: string; name: string };

export default function BrowseView({
  player,
  stats,
  leaders,
  rooms,
  connected,
  busy,
  tab,
  setTab,
  mode,
  setMode,
  format,
  setFormat,
  level,
  capacity,
  setCapacity,
  code,
  setCode,
  onFindOpponent,
  onCreateRoom,
  onJoin,
  onPlayOffline,
  onLogin,
  onBack,
  onClearError,
}: {
  player: { id: string; name: string } | null;
  stats: Stats | null;
  leaders: Leader[];
  rooms: any[];
  connected: boolean;
  busy: boolean;
  tab: "online" | "friends" | "offline";
  setTab: (tab: "online" | "friends" | "offline") => void;
  mode: ArcadeMode;
  setMode: (mode: ArcadeMode) => void;
  format: "md1" | "md3";
  setFormat: (format: "md1" | "md3") => void;
  level: number;
  capacity: number;
  setCapacity: (n: number) => void;
  code: string;
  setCode: (code: string) => void;
  onFindOpponent: () => void;
  onCreateRoom: () => void;
  onJoin: (code: string) => void;
  onPlayOffline: () => void;
  onLogin: () => void;
  onBack: () => void;
  onClearError: () => void;
}) {
  const accent = gameColors[mode] || gameColors.math;
  return (
    <>
      <Text style={s.eyebrow}>PARTIDAS CURTAS. BOAS DISPUTAS.</Text>
      <Text style={s.hero}>Bora jogar?</Text>
      <Text style={s.body}>
        Encontre companhia, chame a turma ou curta uma partida só sua.
      </Text>
      {player && stats && stats.played > 0 && (
        <Card
          accessible
          accessibilityLabel={`Suas estatísticas: ${stats.played} partidas, ${stats.wins} vitórias, melhor ${stats.best}, média ${stats.average}`}
          style={s.stats}
        >
          <View>
            <Text style={s.statValue}>{stats.played}</Text>
            <Text style={s.caption}>partidas</Text>
          </View>
          <View>
            <Text style={[s.statValue, { color: palette.gold }]}>
              {stats.wins}
            </Text>
            <Text style={s.caption}>vitórias</Text>
          </View>
          <View>
            <Text style={s.statValue}>{stats.best}</Text>
            <Text style={s.caption}>melhor</Text>
          </View>
          <View>
            <Text style={s.statValue}>{stats.average}</Text>
            <Text style={s.caption}>média</Text>
          </View>
        </Card>
      )}
      <View style={s.tabs}>
        {[
          ["online", "Online"],
          ["friends", "Com amigos"],
          ["offline", "Offline"],
        ].map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => {
              setTab(id as typeof tab);
              onClearError();
            }}
            style={[s.tab, tab === id && s.tabActive]}
          >
            <Text style={[s.tabText, tab === id && s.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        accessible
        accessibilityLabel={`${levels[level - 1]} de ${MAX_LEVEL}${tab === "offline" ? ", progresso salvo neste aparelho" : ""}`}
        style={s.levelBadge}
      >
        <Text style={s.levelBadgeLabel}>
          {tab === "offline" ? "SEU NÍVEL NESTE APARELHO" : "SEU NÍVEL"}
        </Text>
        <Text style={[s.levelBadgeValue, { color: accent[0] }]}>
          {levels[level - 1]}{" "}
          <Text style={s.levelBadgeMax}>/ {MAX_LEVEL}</Text>
        </Text>
        <Text style={s.caption}>
          Sobe sozinho quando você faz uma boa pontuação na fase atual.
        </Text>
      </View>
      <Text style={s.body}>{levelDetails[mode]}</Text>
      <View style={[s.levelMeta, { borderColor: accent[0] + "55" }]}>
        <Text style={[s.levelMetaText, { color: accent[0] }]}>
          {levelRules[level - 1].rounds} rodadas ·{" "}
          {levelRules[level - 1].seconds}s · até 1.000 pontos
        </Text>
      </View>
      <View style={s.row}>
        <Text style={s.section}>Escolha sua prova</Text>
        <Text style={s.caption}>{modes.length} jogos disponíveis</Text>
      </View>
      {modes.map((m) => {
        const c = gameColors[m.id] || gameColors.math;
        const active = mode === m.id;
        return (
          <Pressy
            key={m.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={m.name}
            onPress={() => setMode(m.id)}
            style={[s.game, active && { borderColor: c[0] }]}
          >
            <LinearGradient
              colors={c}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.symbol}
            >
              <Text style={[s.symbolText, { color: contrastText(c[0]) }]}>
                {m.symbol}
              </Text>
            </LinearGradient>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[s.eyebrow, { color: c[0] }]}>{m.tag}</Text>
              <Text style={s.member}>{m.name}</Text>
              <Text style={s.caption}>{m.description}</Text>
            </View>
            <View
              style={[
                s.radioDot,
                active && { backgroundColor: c[0], borderColor: c[0] },
              ]}
            />
          </Pressy>
        );
      })}
      {tab === "offline" ? (
        <Card>
          <Text style={s.section}>Só você e a próxima rodada.</Text>
          <Text style={s.body}>
            Sem conta, sem conexão, sem espera. O resultado fica nesta partida
            e não entra no ranking online.
          </Text>
          <Button accessibilityLabel="Jogar offline" onPress={onPlayOffline}>
            Jogar offline
          </Button>
        </Card>
      ) : (
        <>
          {!player && (
            <Card>
              <Text style={s.body}>
                Entre com seu jogador para encontrar pessoas e participar de
                salas.
              </Text>
              <Button
                accessibilityLabel="Entrar para jogar online"
                onPress={onLogin}
              >
                Entrar para jogar online
              </Button>
            </Card>
          )}
          <Card>
            <Text style={s.section}>Melhor de quantas provas?</Text>
            <Text style={s.caption}>
              {format === "md3"
                ? "Quem vencer 2 de 3 provas leva a sala."
                : "Uma prova decide — mais rápido pra jogar de novo."}
            </Text>
            <View style={s.row}>
              <Button
                secondary={format !== "md1"}
                accessibilityLabel="Melhor de 1"
                onPress={() => setFormat("md1")}
              >
                Melhor de 1
              </Button>
              <Button
                secondary={format !== "md3"}
                accessibilityLabel="Melhor de 3"
                onPress={() => setFormat("md3")}
              >
                Melhor de 3
              </Button>
            </View>
          </Card>
          {tab === "online" && (
            <Button
              disabled={busy}
              accessibilityLabel="Encontrar adversário"
              onPress={onFindOpponent}
            >
              Encontrar adversário
            </Button>
          )}
          <Card>
            <Text style={s.section}>
              {tab === "online"
                ? "Abra uma sala pública"
                : "Uma sala para sua turma"}
            </Text>
            <Text style={s.caption}>
              {tab === "online"
                ? "Outros jogadores poderão encontrar sua sala."
                : "Somente quem receber o código pode entrar."}
            </Text>
            <View style={s.row}>
              {[2, 4, 6].map((n) => (
                <Button
                  key={n}
                  secondary={n !== capacity}
                  accessibilityLabel={`${n} pessoas`}
                  onPress={() => setCapacity(n)}
                >
                  {n} pessoas
                </Button>
              ))}
            </View>
            <Button
              disabled={busy}
              accessibilityLabel={
                tab === "online" ? "Criar sala pública" : "Criar sala privada"
              }
              onPress={onCreateRoom}
            >
              {tab === "online" ? "Criar sala pública" : "Criar sala privada"}
            </Button>
          </Card>
          {tab === "friends" ? (
            <Card>
              <Text style={s.section}>Recebeu um convite?</Text>
              <TextInput
                style={s.input}
                accessibilityLabel="Código da sala"
                placeholder="Código de 8 caracteres"
                placeholderTextColor={palette.textFaint}
                autoCapitalize="characters"
                maxLength={8}
                value={code}
                onChangeText={setCode}
              />
              <Button
                secondary
                disabled={busy || code.trim().length !== 8}
                accessibilityLabel="Entrar pelo código"
                onPress={() => onJoin(code)}
              >
                Entrar pelo código
              </Button>
            </Card>
          ) : (
            <>
              <View style={s.row}>
                <Text style={s.section}>Salas abertas</Text>
                <Text style={s.caption}>
                  {player
                    ? connected
                      ? "Atualização automática"
                      : "Conectando…"
                    : "Entre para consultar"}
                </Text>
              </View>
              {player && rooms.length === 0 && (
                <Text style={s.body}>
                  Nenhuma sala disponível agora. Abra a primeira ou use a
                  busca de adversário.
                </Text>
              )}
              {rooms.map((r) => (
                <Card key={r.code}>
                  <Text style={s.member}>
                    {modes.find((m) => m.id === r.mode)?.name}
                  </Text>
                  <Text style={s.caption}>
                    {levels[(r.difficulty || 1) - 1]} ·{" "}
                    {r.format === "md3" ? "Melhor de 3" : "Melhor de 1"} ·{" "}
                    {r.count}/{r.capacity} jogadores · {r.code}
                  </Text>
                  <Button
                    secondary
                    disabled={busy}
                    accessibilityLabel={`Entrar na sala ${r.code}`}
                    onPress={() => onJoin(r.code)}
                  >
                    Entrar na sala {r.code}
                  </Button>
                </Card>
              ))}
              {player && (
                <Card
                  accessible
                  accessibilityLabel={`Ranking Arcade com ${leaders.length} jogadores`}
                >
                  <View style={s.row}>
                    <Text style={s.section}>Ranking Arcade</Text>
                    <Text style={s.caption}>mais vitórias</Text>
                  </View>
                  {leaders.length ? (
                    leaders.slice(0, 5).map((leader, index) => (
                      <View key={leader.id} style={s.row}>
                        <Text style={s.member}>
                          {medal(index) || `${index + 1}.`} {leader.name}
                        </Text>
                        <Text style={s.caption}>
                          {leader.wins} vit. · melhor {leader.best}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={s.body}>
                      O primeiro vencedor estreia este ranking.
                    </Text>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}
      <Button
        secondary
        accessibilityLabel="Jogos clássicos, perfil e conquistas"
        onPress={onBack}
      >
        Jogos clássicos, perfil e conquistas
      </Button>
    </>
  );
}
