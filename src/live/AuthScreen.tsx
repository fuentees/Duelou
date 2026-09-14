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
  const validName = /^[\p{L}\p{N} _-]{2,24}$/u.test(name.trim());
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
          <Text style={s.muted}>Use de 2 a 24 letras ou números. Espaços, hífen e sublinhado também são aceitos.</Text>
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
          <Text style={s.muted}>Cole os 24 caracteres do código que você guardou ao criar sua conta, com ou sem hífens.</Text>
          <Button disabled={busy || !validRecovery} onPress={() => onRecover(recoveryCode)}>
            {busy ? "Recuperando conta…" : "Recuperar conta"}
          </Button>
          <Button secondary disabled={busy} onPress={() => setRecoveryOpen(false)}>
            Voltar para criar conta
          </Button>
        </>
      )}
      </Card>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
