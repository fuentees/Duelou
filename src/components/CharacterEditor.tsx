import React, { useState, useRef, useEffect } from "react";
import { Text, View } from "react-native";
import { Avatar, readAvatar, avatarOptions } from "../../shared/avatar.mjs";
import { captureSession } from "../api";
import { palette } from "../theme";
import Character from "./Character";
import Card from "./Card";
import Button from "./Button";
import Pressy from "./Pressy";

export default function CharacterEditor({
  uid,
  avatar,
  onSaved,
}: {
  uid: string;
  avatar?: unknown;
  onSaved: (profile: any) => void;
}) {
  const [draft, setDraft] = useState(() => readAvatar(avatar)),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const owner = useRef(uid),
    lock = useRef(false);
  owner.current = uid;
  useEffect(() => {
    if (!editing) setDraft(readAvatar(avatar));
  }, [avatar, editing]);
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const id = uid,
      request = captureSession();
    try {
      const updated = await request("/v1/avatar", draft);
      if (alive.current && owner.current === id) {
        onSaved(updated);
        setEditing(false);
        setMessage("Personagem salvo na sua conta.");
      }
    } catch {
      if (alive.current && owner.current === id)
        setMessage(
          "Não foi possível salvar. Seu rascunho está aqui para tentar novamente.",
        );
    } finally {
      lock.current = false;
      if (alive.current && owner.current === id) setBusy(false);
    }
  };
  const names: Record<keyof Avatar, string> = {
    species: "Personagem",
    color: "Cor",
    accessory: "Acessório",
    frame: "Moldura",
  };
  return (
    <Card>
      <View style={{ alignItems: "center", gap: 12 }}>
        <Character avatar={draft} size={120} label="Prévia do seu personagem" />
        <Text style={{ fontSize: 22, fontWeight: "800", color: palette.text }}>
          Seu personagem
        </Text>
      </View>
      <Text style={{ color: palette.textDim, lineHeight: 21 }}>
        Seu estilo na batalha e no ranking. Todas as opções são gratuitas e não
        alteram pontos ou habilidade.
      </Text>
      {editing ? (
        <>
          {(Object.keys(avatarOptions) as (keyof Avatar)[]).map((key) => (
            <View key={key} style={{ gap: 8 }}>
              <Text style={{ color: palette.text, fontWeight: "700" }}>
                {names[key]}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {avatarOptions[key].map((option) => {
                  const checked = draft[key] === option.id;
                  return (
                    <Pressy
                      key={option.id}
                      accessibilityRole="radio"
                      disabled={busy}
                      accessibilityLabel={`${names[key]}: ${option.name}`}
                      accessibilityState={{ checked }}
                      onPress={() => setDraft({ ...draft, [key]: option.id })}
                      style={{
                        alignItems: "center",
                        gap: 6,
                        minWidth: 64,
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: checked ? palette.violet : palette.border,
                        backgroundColor: checked ? "#EFEAFF" : "#FFFFFF",
                      }}
                    >
                      {/* Pré-visualização de verdade em vez de só texto: um
                          círculo com a cor pra "Cor", ou uma miniatura do
                          próprio personagem com aquela opção aplicada pras
                          demais categorias — escolher fica mais parecido com
                          "ver o que vou ganhar" do que "ler um rótulo". */}
                      {key === "color" && option.hex ? (
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: option.hex,
                            borderWidth: checked ? 2 : 1,
                            borderColor: checked ? palette.violet : "#00000022",
                          }}
                        />
                      ) : (
                        <Character
                          avatar={{ ...draft, [key]: option.id }}
                          size={40}
                        />
                      )}
                      <Text style={{ color: palette.text, fontSize: 12, fontWeight: "700" }}>
                        {option.name}
                        {checked ? " ✓" : ""}
                      </Text>
                    </Pressy>
                  );
                })}
              </View>
            </View>
          ))}
          <Button disabled={busy} onPress={save}>
            {busy ? "Salvando personagem…" : "Salvar personagem"}
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() => {
              setDraft(readAvatar(avatar));
              setEditing(false);
              setMessage("");
            }}
          >
            Cancelar edição
          </Button>
        </>
      ) : (
        <Button
          secondary
          onPress={() => {
            setMessage("");
            setEditing(true);
          }}
        >
          Personalizar personagem
        </Button>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: palette.textDim }}
        >
          {message}
        </Text>
      )}
    </Card>
  );
}
