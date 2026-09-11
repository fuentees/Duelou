# Executar e operar a release candidate

## Requisitos

Node 22.13 ou superior. A API usa node:sqlite com a flag --experimental-sqlite. Esta máquina tem Node 22.12 e executou os testes, mas fica abaixo do requisito formal do Metro atual.
O projeto usa Expo SDK 57, React Native 0.86 e target Android API 36. Usar development build ou Expo Go compatível com o SDK 57.
Não há serviço externo provisionado, assinatura, cobrança ou publicação automática.

## Desenvolvimento

Use uma pasta Windows com nome válido, por exemplo duelou-app. Evite a pasta reservada con na execução.

1. npm ci
2. npm run api
3. Em outro terminal: npm run web:8083
4. Abra http://localhost:8083

API padrão: http://127.0.0.1:3001; banco data/duelou.sqlite.
O processo começa restrito à máquina local. Para piloto na LAN, definir HOST=0.0.0.0 explicitamente.
No PowerShell da API:

```powershell
$env:HOST='0.0.0.0'
npm run api
```

No PowerShell do aplicativo:

```powershell
$env:EXPO_PUBLIC_API_URL='http://IP_DO_COMPUTADOR:3001'
npx expo start --lan
```

O celular precisa alcançar tanto a porta Expo quanto a API (3001).
Túnel Expo não publica a API automaticamente. HTTP serve somente ao desenvolvimento de confiança; produção exige HTTPS.
A falha anterior de conexão não demonstrou que o firewall era a causa. Gateway, isolamento da rede, regra de firewall e compatibilidade do Expo Go ainda precisam ser verificados.
EXPO_PUBLIC_API_URL é configuração pública, nunca lugar de credenciais.
Para web em outro domínio, configurar ALLOWED_ORIGINS com lista de origens exatas separadas por vírgula.

## API

POST /v1/guests {name} → token, recoveryCode, profile. O código é exibido uma única vez.
POST /v1/sessions/recover {code} → novo token, profile; revoga a sessão anterior.
Demais rotas exigem Authorization: Bearer TOKEN.
GET /v1/me, /v1/games, /v1/history, /v1/leaderboard, /v1/duels.
GET /v1/daily → configuração diária e estado da tentativa.
POST /v1/duels {game,difficulty} → code.
POST /v1/duels/join {code} → vaga atribuída.
POST /v1/matches {game,difficulty}, {code} ou {daily:true} → id/config.
POST /v1/matches/:id/finish → {elapsedMs}, {reactionMs}, {falseStart:true} ou {answers:[...]}.
DELETE /v1/session → revoga a sessão atual sem apagar o jogador.
DELETE /v1/me → exclusão permanente.
GET /health e /v1/health são públicos.

## Banco, sessão e recuperação

Dados do jogador permanecem em SQLite; não enviar o banco ao repositório ou ao ZIP.
Para cópia fria: parar API, copiar diretório data inteiro e reiniciar. Para backup online, usar backup SQLite consistente, não copiar somente o arquivo principal enquanto WAL estiver ativo.
Antes de lançar: automatizar backup criptografado, retenção e teste de restauração em ambiente isolado. RPO/RTO ainda não definidos com o negócio.
Esquema atual versão 3, atualizado idempotentemente a partir da versão inicial. Evoluções exigem migration incremental, não apagar/recriar dados.
Tokens e códigos de recuperação são persistidos somente como SHA-256. A sessão vence em 180 dias; recuperar a conta ou sair deste aparelho invalida o token anterior. O código de recuperação não expira na V1 e deve ser tratado como segredo.

## Limites conhecidos

Web guarda token na sessionStorage, encerrado ao fechar a sessão; app nativo usa SecureStore.
Medições e sequência são visíveis no cliente: servidor valida intervalos/formato/duração, mas não comprova habilidade humana.
Sem rate limit distribuído; atrás de proxy, o limite por IP pode agrupar usuários.
Sem cobrança, push, upload, gravação de vídeo, e-mail/senha ou ranking competitivo verificado.
Sem confirmação em dispositivo físico nesta entrega.
O audit após a atualização tem 10 alertas moderados transitivos no toolchain Expo, concentrados em uuid/xcode. A correção automática sugere downgrade incompatível do Expo e não foi aplicada; acompanhar correção upstream antes da submissão final.

## Backup e restauração do banco

`npm run db:backup` gera uma cópia consistente do banco (via `VACUUM INTO`, seguro mesmo com WAL ativo) e cifra o arquivo com AES-256-GCM antes de gravar em `backups/`. Exige `BACKUP_ENCRYPTION_KEY` no ambiente (32 bytes em hex — gerar uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e guardar como segredo, nunca no repositório). `DB_PATH` e `BACKUP_DIR` são opcionais.

`npm run db:restore -- <arquivo.sqlite.enc> [destino]` decifra e grava o banco restaurado num arquivo separado; nunca sobrescreve o banco em uso diretamente. Testado localmente: roundtrip de backup/restauração preserva os dados e uma chave errada falha alto (erro de autenticação), não corrompe silenciosamente.

Pendente antes de produção: agendar a execução periódica (por exemplo um processo ou máquina agendada na Fly.io, ou GitHub Actions com acesso ao volume) e um ensaio de restauração num ambiente isolado de verdade, não só local.

## Deploy na Fly.io

`fly.toml` já está no repositório, apontando para `server/Dockerfile`. Passos, depois de `flyctl auth login`:

1. Escolher um nome de app único e criar: `flyctl apps create <nome>` — depois trocar `app = "duelou-api-trocar"` no `fly.toml` pelo nome escolhido.
2. Criar o volume persistente do banco: `flyctl volumes create duelou_data --region gru --size 1`.
3. Ajustar `ALLOWED_ORIGINS` no `fly.toml` para a origem real do app web publicado (ou várias, separadas por vírgula).
4. `flyctl deploy`.
5. Testar: `curl https://<nome>.fly.dev/health` deve responder `{"ok":true,...}`.
6. Apontar o app para a API publicada: `EXPO_PUBLIC_API_URL=https://<nome>.fly.dev` no ambiente de build/execução do Expo.

`min_machines_running = 0` deixa a máquina desligar quando ociosa (economiza no plano gratuito); a primeira requisição depois de um tempo parado pode demorar 1–2s a mais para acordar.

## Verificação

npm run test:api
npm run typecheck
npm run build:web
Testes cobrem regras, autorização, recuperação, revogação, replay, desafio diário, dois jogadores, expiração de partida, exclusão e migração/reabertura do banco.
A aprovação em web não substitui build nativo e testes de rede no celular.
