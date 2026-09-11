import React, { useState } from "react";
import { ScrollView, Text, TextInput } from "react-native";
import Button from "../components/Button";
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
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.hero}>{"Seu amigo.\nSeu próximo rival."}</Text>
      <Text style={s.muted}>
        Escolha seu apelido para salvar partidas e desafiar amigos. Você
        receberá um código para recuperar a conta em outro aparelho.
      </Text>
      {!recoveryOpen ? (
        <>
          <TextInput
            accessibilityLabel="Apelido"
            value={name}
            onChangeText={setName}
            maxLength={24}
            placeholder="Seu apelido"
            placeholderTextColor={palette.textFaint}
            style={s.input}
          />
          <Button disabled={busy} onPress={() => onCreate(name)}>
            Criar jogador
          </Button>
          <Button onPress={() => setRecoveryOpen(true)}>
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
            maxLength={29}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={palette.textFaint}
            style={s.input}
          />
          <Button disabled={busy} onPress={() => onRecover(recoveryInput)}>
            Recuperar conta
          </Button>
          <Button onPress={() => setRecoveryOpen(false)}>
            Voltar para criar conta
          </Button>
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
