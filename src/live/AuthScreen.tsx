import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Button from "../components/Button";
import Card from "../components/Card";
import Character from "../components/Character";
import { LinearGradient } from "expo-linear-gradient";
import { gradients } from "../theme";
import { palette } from "../theme";
import { s } from "./styles";

export default function AuthScreen({
  busy,
  error,
  defaultRecoveryOpen = false,
  onCreate,
  onRecover,
}: {
  busy: boolean;
  error: string;
  defaultRecoveryOpen?: boolean;
  onCreate: (name: string) => void;
  onRecover: (code: string) => void;
}) {
  const [name, setName] = useState(""),
    [recoveryInput, setRecoveryInput] = useState(""),
    [recoveryOpen, setRecoveryOpen] = useState(defaultRecoveryOpen);
  const trimmed = name.trim();
  const validName = /^[\p{L}\p{N} _-]{2,24}$/u.test(trimmed);
  // Botão desligado sem dizer por quê é beco sem saída: enquanto o apelido
  // não serve, a tela diz o que falta em vez de só ficar cinza.
  const nameHint = !name
    ? "Use de 2 a 24 letras ou números. Espaços, hífen e sublinhado também são aceitos."
    : trimmed.length < 2
      ? "Faltam letras: o apelido precisa de pelo menos 2 caracteres."
      : validName
        ? "Pode entrar. Dá pra trocar o personagem depois, no seu perfil."
        : "Esse apelido tem algum caractere que não dá: use letras, números, espaço, hífen ou sublinhado.";
  const recoveryCode = recoveryInput.replace(/[-\s]/g, "").toUpperCase();
  const validRecovery = /^[A-F0-9]{24}$/.test(recoveryCode);
  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <LinearGradient colors={gradients.hero} style={{ borderRadius: 24, padding: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Character size={64} /><Text style={{ color: "#EAE5FF", fontSize: 11, fontWeight: "800", flex: 1, letterSpacing: 1 }}>SEU JOGADOR. SEU ESTILO.</Text>
      </View>
      <Text style={[s.hero, { color: "#FFFFFF", fontSize: 28, lineHeight: 34 }]}>{"Seu amigo.\nSeu próximo rival."}</Text>
      <Text style={[s.muted, { color: "#F0EDFF" }]}>
        Escolha seu apelido para salvar partidas e desafiar amigos. Você
        receberá um código para recuperar a conta em outro aparelho.
      </Text>
      {/* O que tem do outro lado: antes a tela pedia um apelido sem dizer
          pra quê. */}
      <View style={{ gap: 6 }}>
        {[
          "9 jogos de raciocínio, com campanha de 30 fases cada",
          "Duelo 1 × 1 ao vivo, com nota e divisão",
          "Salas para a turma inteira, por código",
        ].map((linha) => (
          <Text key={linha} style={[s.muted, { color: "#F0EDFF" }]}>
            · {linha}
          </Text>
        ))}
      </View>
      </LinearGradient>
      <Card>
      {!recoveryOpen ? (
        <>
          <TextInput
            accessibilityLabel="Apelido"
            value={name}
            onChangeText={setName}
            maxLength={24}
            editable={!busy}
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => !busy && validName && onCreate(name.trim())}
            placeholder="Seu apelido"
            placeholderTextColor={palette.textFaint}
            style={s.input}
          />
          <Text style={[s.muted, validName ? { color: palette.green } : null]}>
            {nameHint}
          </Text>
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Button disabled={busy || !validName} onPress={() => onCreate(name.trim())}>
            {busy ? "Criando jogador…" : "Criar jogador"}
          </Button>
          <Button secondary disabled={busy} onPress={() => setRecoveryOpen(true)}>
            Já tenho uma conta
          </Button>
        </>
      ) : (
        <>
          <Text style={s.heading}>Recuperar jogador</Text>
          <TextInput
            accessibilityLabel="Código de recuperação"
            value={recoveryInput}
            onChangeText={setRecoveryInput}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            returnKeyType="go"
            onSubmitEditing={() => !busy && validRecovery && onRecover(recoveryCode)}
            maxLength={29}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={palette.textFaint}
            style={s.input}
          />
          <Text style={s.muted}>
            {recoveryInput && !validRecovery
              ? `${recoveryCode.length} de 24 caracteres. Cole o código inteiro, com ou sem hífens.`
              : "Cole os 24 caracteres do código que você guardou ao criar sua conta, com ou sem hífens."}
          </Text>
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Button disabled={busy || !validRecovery} onPress={() => onRecover(recoveryCode)}>
            {busy ? "Recuperando conta…" : "Recuperar conta"}
          </Button>
          <Button secondary disabled={busy} onPress={() => setRecoveryOpen(false)}>
            Voltar para criar conta
          </Button>
        </>
      )}
      </Card>
    </ScrollView>
  );
}
