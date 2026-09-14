# Contexto do projeto Duelou

- App Expo SDK 57, React Native 0.86, TypeScript. Servidor Node com node:sqlite.
- Regras de código: siga os padrões já existentes no repo. TypeScript deve passar em `npm run typecheck` ao fim de cada tarefa. Não introduza dependências novas sem avisar e justificar.
- Reutilize o que já existe: geração de desafios em shared/arcade.mjs e shared/skillGames.mjs; paleta e cores em src/theme.ts; sons em src/audio/sounds.ts; padrão de persistência local de src/arcade/campaign.ts (localStorage na web, SecureStore no nativo); navegação por "Section" em src/components/BottomNav.tsx e src/LiveApp.tsx.
- Acessibilidade: respeite src/useReducedMotion.ts, área de toque mínima ~44px, e não dependa só de cor (há usuários daltônicos).
- Trabalhe em pequenos passos. Ao terminar, liste o que mudou e como testar.

## Arena Rush

- **Completa e commitada**: Fase 0 (Tickets 1-9, offline contra bot: `shared/arena/engine.ts`, `src/arena/*`) e o PvP em tempo real (Tickets 12-26: motor autoritativo em `server/arena-match.mjs`, WebSocket em `server/arena-ws.mjs`, fila FIFO em `server/arena-queue.mjs`, desafios anti-trapaça em `server/arena-challenges.mjs`, histórico em `server/arena-persistence.mjs`, tela online em `src/arena/ArenaOnlineScreen.tsx`). Histórico completo do plano: `C:\Users\fuent\.claude\plans\drifting-frolicking-pixel.md`.
- **PvP é o único modo alcançável pelo menu** (decisão do usuário) — `src/LiveApp.tsx`'s seção "arenaRush" renderiza `ArenaOnlineScreen`. `ArenaScreen.tsx`/`bot.ts`/`src/arena/onboarding.ts` (modo bot) continuam no repo, testados, só não são mais alcançados pelo menu — não apagar, podem voltar a ser úteis (ex.: fallback se o volume de jogadores online se mostrar baixo).
- **Estritamente 1×1, sempre** — mesmo depois da capacidade de sala pra turma (abaixo), a Arena Rush nunca passa de 2 jogadores por partida.
- NÃO TOQUE em: server/competitive.mjs, shared/competition.mjs, nem em nada de Elo/rating/anti-trapaça. `server/rooms.mjs` passou a ser tocado a partir do Ticket 27 (capacidade de sala e resiliência de conexão — ver seção abaixo), mas nunca pra pontuação/rating. Toda a infraestrutura do PvP (fila, partidas, desafios, histórico) é independente, em arquivos próprios — nunca influencia classificação, XP competitivo ou as tabelas/lógica desses arquivos.
- Reconexão (Tickets 37-42 — reverte a decisão original de "desistência imediata, sem tolerância"): quem cai da partida ganha um grace period (`RECONNECT_GRACE_MS`, `shared/arena/reconnect.ts`, ~20s) pra voltar antes do forfeit de verdade. Servidor pausa a partida (`arena-match.mjs`'s `pauseMatch`/`resumeMatch`) e retoma sozinho (mensagem `matchResumed`) se a reconexão chegar a tempo com o mesmo token — sem passar pela fila de novo. Cliente (`src/arena/useArenaSocket.ts`) tenta reconectar sozinho com backoff antes de mostrar erro. Sem oponente na fila: só espera com botão cancelar, sem fallback pra bot.
- Único pacote novo autorizado até agora: `ws` (WebSocket no servidor) — não introduzir outras dependências sem avisar e justificar.
- **Rodada competitiva (14/09/2026)** — detalhes em `docs/ARENA-RUSH-COMPETITIVA.md`. Resumo do que passou a valer:
  - Desafio **igual pros dois lados**, com semente derivada de (matchId, índice, nível) em `shared/arena/deck.ts`; o nível vem do **tempo decorrido**, nunca do desempenho de quem responde. Rodízio inclui math, colors, order, sequence e reflexo.
  - `server/arena-latency.mjs` desconta a viagem da rede do tempo medido (menor RTT recente, teto de 300ms) — a medição continua sendo do relógio do servidor.
  - Motor: morte súbita nos últimos 20s (dano à base dobrado), desempate por tropa em campo → combo → invocações, vantagem de tipo (batedor>tanque>soldado>batedor, dano dobrado) e `spendCombo` (combo 4 invoca tanque na hora). `applyAnswer` devolve `spawned` — acerto com a pista cheia é avisado, não engolido.
  - `server/arena-rating.mjs` (tabela `arena_ratings`, isolada): nota, cartel, sequência e colocação da Arena, com `GET /v1/arena/me|leaderboard|history`. **Nunca** toca competitive/Elo.
  - Fila pareia por nota com janela que abre no tempo de espera + `sweep()` periódico; sem adversário em 25s, a tela oferece treino contra o robô (`ArenaScreen`, que voltou a ser alcançável só por aí, sem valer nota).
  - Revanche (janela de 20s depois da partida, sem passar pela fila) e convite direto por código de 6 caracteres (`createInvite`/`joinInvite`, 5 min). Partida por convite é **amistosa**: entra no histórico marcada, não mexe na nota.
  - Envio por delta (`shared/arena/statePatch.ts`): só o que mudou a cada tique, com retrato completo a cada ~2s. Medido: 3,6× menos tráfego.
  - Divisões da Arena (`arenaTierFor` em `src/theme.ts`) — "divisão" é da Arena, "patente" continua sendo da fila competitiva.
  - Tema escuro exclusivo da partida (tokens `arena` em `src/theme.ts`), barras de vida com avatar/nome dos dois jogadores, alvos de 56px, e o duelo com entrada própria na barra ("Arena" = jogos, "Duelo" = 1×1 ao vivo).
- Verificação de regressão: `npm run test:api` (inclui todos os `arena-*.test.mjs` e `rooms.test.mjs`), `npm run test:arena`, `node scripts/check-arena-pvp.mjs` e `node scripts/check-rush-polish.mjs` (manuais, dois clientes reais incluindo cenários de queda/retomada — precisam de `npm run api` + `npm run web:8083` já no ar).
- Cuidado real já encontrado uma vez: qualquer erro não tratado dentro dos listeners de WebSocket (`server/arena-ws.mjs`) derruba o processo Node inteiro, afetando TODOS os jogadores conectados — sempre envolver lógica nova ali (e em `arena-persistence.mjs`) em try/catch, nunca deixar propagar.
- Próximos passos possíveis (não pedidos ainda): temporadas com reset de nota, cosméticos por divisão/sequência, tema escuro no app inteiro (hoje só a partida é escura) e fonte de identidade própria.

## Jogos e telas fora da Arena Rush (rodada de 14/09/2026)

- **Jogos de alternativa** (`src/arcade/Round.tsx`): ao responder, a rodada segura por um instante (450ms acertando, 1500ms errando) mostrando ✓ na certa e ✗ na tocada, com a resposta e a `explanation` da rodada (que existia em `shared/arcade.mjs` e nunca chegava à tela). O cronômetro é adiado pelo mesmo tempo — o veredito não pode custar prova. Só no solo: online o servidor não manda gabarito.
- **Memória**: erro mostra qual era o bloco certo e em que passo antes de encerrar. **Mira**: toques no vazio são contados e exibidos durante a prova (não pontuam — pontuação continua do servidor).
- **Telas**: escolha de modo do jogo, topo da Arena, perfil, configurações (era "Som e música") e menu foram reorganizados em cartões; a lista de jogos mostra fase/estrelas por jogo (`readAllCampaigns`); a tela inicial tem "continuar de onde parou" (abre o jogo direto via `initialGame` em ArcadeScreen) e o cartel do duelo; o resultado da fase mostra meta com barra e "o que escapou".
- Scripts de navegação (`check-arena-pvp.mjs`, `check-rush-polish.mjs`, `check-accessibility.mjs`) acompanham os rótulos novos ("Duelo" na barra, "Configurações" no menu).

## Capacidade de sala, personagem pseudo-3D e reconexão fora da Arena Rush (Tickets 27-46)

- **Completa e commitada**. Três pedidos independentes do usuário: salas de arcade pra turma inteira (~30 pessoas, capacidade fixa em `shared/arcade.mjs`'s `ROOM_CAPACITIES`, usada por `server/rooms.mjs` e `src/arcade/BrowseView.tsx`); personagem/perfil com tratamento visual "pseudo-3D" (gradiente/sombra/brilho em `src/components/Character.tsx` + `shade()` em `src/theme.ts`, mesmo componente no editor, no perfil `src/live/PerfilTab.tsx` e nas salas); reconexão em todo o catálogo, não só a Arena Rush.
- `src/components/LiveStatus.tsx`: selo de conexão único ("live"/"reconnecting"/"lost"), reaproveitado pela Arena Rush (acima) e pelas salas casuais/ranqueadas. `src/arcade/ArcadeScreen.tsx`'s `poll()` deriva o status a partir de falhas seguidas de heartbeat, com backoff (1s/2s/4s/8s); `src/arcade/RoomView.tsx` mostra o selo.
- `server/rooms.mjs`'s `autoForfeitStale` desiste automaticamente de quem sumiu há mais de `STALE_MEMBER_GRACE_MS` (~45s) numa sala casual — **só casual**: ranqueada já tem o próprio mecanismo de crédito parcial (`server/competitive.mjs`, config expirada) e não deve ser tocada por essa regra.
- Verificação: `npm run test:classroom` (30 convidados numa sala casual de verdade), `npm run test:character`, `node scripts/check-competitive.mjs --resilience` (inclui queda/recuperação de heartbeat, além do cenário de resposta perdida já existente).
