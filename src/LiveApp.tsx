import useReducedMotion from "./useReducedMotion";
import React, { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api, restore, remember, forget } from "./api";
import HomeScreen from "./HomeScreen";
import MenuScreen from "./MenuScreen";
import AudioSettingsScreen from "./AudioSettingsScreen";
import Arcade from "./arcade/ArcadeScreen";
import ArenaOnlineScreen from "./arena/ArenaOnlineScreen";
import { gradients } from "./theme";
import Button from "./components/Button";
import BottomNav, { Section } from "./components/BottomNav";
import AppHeader from "./components/AppHeader";
import AuthScreen from "./live/AuthScreen";
import RankingTab from "./live/RankingTab";
import PerfilTab from "./live/PerfilTab";
import { s } from "./live/styles";
type Profile = {
  id: string;
  name: string;
  xp: number;
  coins: number;
  played: number;
  streak: number;
  level: number;
  current: number;
  needed: number;
  achievements: {
    key: string;
    name: string;
    description: string;
    icon: string;
    unlocked: boolean;
  }[];
};

const err = (e: unknown) =>
  e instanceof Error ? e.message : "Algo deu errado.";
export default function LiveApp() {
  const reducedMotion = useReducedMotion();
  const [inviteCode, setInviteCode] = useState("");
  useEffect(() => {
    const receive = (url: string | null) => {
      const match = url?.match(
        /(?:[?&]room=|duelou:\/\/room\/)([A-Fa-f0-9]{8})(?:$|[&#/])/,
      );
      if (match) {
        setInviteCode(match[1].toUpperCase());
        setSection("arcade");
      }
    };
    Linking.getInitialURL()
      .then(receive)
      .catch(() => {});
    const sub = Linking.addEventListener("url", (e) => receive(e.url));
    return () => sub.remove();
  }, []);
  const [section, setSection] = useState<Section>("home");
  const [profile, setProfile] = useState<Profile | null>(null),
    [boot, setBoot] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ranking, setRanking] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [newRecoveryCode, setNewRecoveryCode] = useState(""),
    [returnToArcade, setReturnToArcade] = useState(false),
    [deleting, setDeleting] = useState(false),
    [suggestRecovery, setSuggestRecovery] = useState(false);
  const lock = useRef(false);
  const refresh = async () => {
    const [p, r, h] = await Promise.all([
      api<Profile>("/v1/me"),
      api("/v1/rooms/leaderboard"),
      api("/v1/history"),
    ]);
    setProfile(p);
    setRanking(r);
    setHistory(h);
  };
  const action = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(err(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    (async () => {
      try {
        if (await restore()) await refresh();
      } catch (e) {
        setError(err(e));
      } finally {
        setBoot(false);
      }
    })();
  }, []);
  // Sem isso, o botão físico de voltar do Android fecha o app inteiro em
  // qualquer tela — não existe biblioteca de navegação aqui, é tudo estado
  // React. "Início" é a raiz: só aí o voltar sai do app de verdade (padrão
  // Android). Nas outras seções, a Arena/BrowseView trata seu próprio
  // "← Voltar" primeiro (ver ArcadeScreen.tsx); só chega aqui quando ela
  // devolve o controle (já está na tela-raiz dela também).
  useEffect(() => {
    // react-native-web não implementa isso (e loga erro se chamado) — só faz
    // sentido em app nativo de verdade, não na prévia web.
    if (Platform.OS === "web") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (section === "home") return false;
      setSection("home");
      return true;
    });
    return () => sub.remove();
  }, [section]);
  useEffect(() => {
    if (!profile || !["ranking", "profile", "home"].includes(section)) return;
    let alive = true;
    const sync = async () => {
      try {
        const [p, r, h] = await Promise.all([
          api<Profile>("/v1/me"),
          api("/v1/rooms/leaderboard"),
          api("/v1/history"),
        ]);
        if (alive) {
          setProfile(p);
          setRanking(r);
          setHistory(h);
        }
      } catch (e) {
        if (alive) setError(err(e));
      }
    };
    sync();
    const timer = setInterval(sync, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [profile?.id, section]);
  const handleCreateAccount = (name: string) =>
    action(async () => {
      const r = await api("/v1/guests", { name });
      await remember(r.token);
      setNewRecoveryCode(r.recoveryCode);
      await refresh();
    });
  const handleRecover = (code: string) =>
    action(async () => {
      const r = await api("/v1/sessions/recover", { code });
      await remember(r.token);
      await refresh();
      if (returnToArcade) {
        setReturnToArcade(false);
        setSection("arcade");
      }
    });
  const handleSignOut = () =>
    action(async () => {
      await api("/v1/session", undefined, "DELETE");
      await forget();
      setProfile(null);
      setRanking([]);
      setHistory([]);
      setSuggestRecovery(true);
    });
  const handleDeleteAccount = () =>
    action(async () => {
      await api("/v1/me", undefined, "DELETE");
      await forget();
      setProfile(null);
      setRanking([]);
      setHistory([]);
      setDeleting(false);
      setSuggestRecovery(false);
    });
  // O modal de recuperação fica acima de todos os destinos, até a confirmação.
  const content = boot ? (
    <SafeAreaView style={s.screen}>
      <Text style={s.heading}>Carregando seu progresso…</Text>
    </SafeAreaView>
  ) : !profile ? (
    // Conta obrigatória pra usar o app — ver AuthScreen. Reaparece sempre que
    // `profile` fica null (não só na primeira vez): saiu da conta ou excluiu
    // a conta em qualquer tela caem aqui de novo, não só na aba Perfil.
    <SafeAreaView style={s.screen}>
      <AppHeader status="BEM-VINDO" />
      <AuthScreen
        busy={busy}
        error={error}
        defaultRecoveryOpen={suggestRecovery}
        onCreate={handleCreateAccount}
        onRecover={handleRecover}
      />
    </SafeAreaView>
  ) : section === "home" ? (
    <HomeScreen player={profile} onNavigate={setSection} />
  ) : section === "menu" ? (
    <MenuScreen onNavigate={setSection} />
  ) : section === "audio" ? (
    <AudioSettingsScreen onNavigate={setSection} />
  ) : section === "arcade" ? (
    <Arcade
      inviteCode={inviteCode}
      onInviteConsumed={() => setInviteCode("")}
      player={profile}
      onNavigate={setSection}
      onLogin={() => {
        setReturnToArcade(true);
        setSection("profile");
      }}
    />
  ) : section === "arenaRush" ? (
    // PvP é o único modo agora (decisão do usuário) — o modo contra bot
    // (ArenaScreen/bot.ts) continua no repositório, testado, só deixa de
    // ser alcançado por aqui.
    <ArenaOnlineScreen onExit={() => setSection("menu")} />
  ) : (
    <SafeAreaView style={s.screen}>
      <AppHeader status={profile.name} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.between}>
          <Text style={s.heading}>
            {section === "ranking" ? "Ranking da Arena" : "Perfil"}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => action(refresh)}
          >
            <Text style={s.accent}>
              {busy ? "Atualizando…" : "Atualizar"}
            </Text>
          </Pressable>
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {section === "ranking" ? (
          <RankingTab ranking={ranking} profileId={profile.id} />
        ) : (
          <PerfilTab
            profile={profile}
            onProfileUpdated={setProfile}
            history={history}
            busy={busy}
            deleting={deleting}
            setDeleting={setDeleting}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </ScrollView>
      <BottomNav section={section} onChange={setSection} />
    </SafeAreaView>
  );
  return (
    <>
      {content}
      <Modal
        visible={!!newRecoveryCode}
        animationType={reducedMotion ? "none" : "fade"}
        transparent
        onRequestClose={() => undefined}
      >
        <View style={s.overlay}>
          <LinearGradient colors={gradients.card} style={s.recoveryCard}>
            <Text style={s.label}>CÓDIGO DE RECUPERAÇÃO</Text>
            <Text style={s.heading}>Guarde antes de jogar</Text>
            <Text style={s.muted}>
              Este código é exibido uma única vez. Ele recupera seu jogador em
              outro aparelho e encerra a sessão antiga.
            </Text>
            <Text selectable style={s.recoveryCode}>
              {newRecoveryCode}
            </Text>
            <Button
              onPress={() =>
                Share.share({
                  message:
                    "Código de recuperação do Duelou: " + newRecoveryCode,
                }).catch((e) => setError(err(e)))
              }
            >
              Salvar ou compartilhar
            </Button>
            <Button
              onPress={() => {
                setNewRecoveryCode("");
                if (returnToArcade) {
                  setReturnToArcade(false);
                  setSection("arcade");
                }
              }}
            >
              Já guardei o código
            </Button>
          </LinearGradient>
        </View>
      </Modal>
    </>
  );
}
