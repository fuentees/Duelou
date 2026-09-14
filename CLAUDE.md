# Contexto do projeto Duelou

- App Expo SDK 57, React Native 0.86, TypeScript. Servidor Node com node:sqlite.
- Regras de código: siga os padrões já existentes no repo. TypeScript deve passar em `npm run typecheck` ao fim de cada tarefa. Não introduza dependências novas sem avisar e justificar.
- Reutilize o que já existe: geração de desafios em shared/arcade.mjs e shared/skillGames.mjs; paleta e cores em src/theme.ts; sons em src/audio/sounds.ts; padrão de persistência local de src/arcade/campaign.ts (localStorage na web, SecureStore no nativo); navegação por "Section" em src/components/BottomNav.tsx e src/LiveApp.tsx.
- Acessibilidade: respeite src/useReducedMotion.ts, área de toque mínima ~44px, e não dependa só de cor (há usuários daltônicos).
- Trabalhe em pequenos passos. Ao terminar, liste o que mudou e como testar.

## Arena Rush

- **Completa e commitada**: Fase 0 (Tickets 1-9, offline contra bot: `shared/arena/engine.ts`, `src/arena/*`) e o PvP em tempo real (Tickets 12-26: motor autoritativo em `server/arena-match.mjs`, WebSocket em `server/arena-ws.mjs`, fila FIFO em `server/arena-queue.mjs`, desafios anti-trapaça em `server/arena-challenges.mjs`, histórico em `server/arena-persistence.mjs`, tela online em `src/arena/ArenaOnlineScreen.tsx`). Histórico completo do plano: `C:\Users\fuent\.claude\plans\drifting-frolicking-pixel.md`.
- **PvP é o único modo alcançável pelo menu** (decisão do usuário) — `src/LiveApp.tsx`'s seção "arenaRush" renderiza `ArenaOnlineScreen`. `ArenaScreen.tsx`/`bot.ts`/`src/arena/onboarding.ts` (modo bot) continuam no repo, testados, só não são mais alcançados pelo menu — não apagar, podem voltar a ser úteis (ex.: fallback se o volume de jogadores online se mostrar baixo).
- NÃO TOQUE em: server/competitive.mjs, server/rooms.mjs, shared/competition.mjs, nem em nada de Elo/rating/anti-trapaça. Toda a infraestrutura do PvP (fila, partidas, desafios, histórico) é independente, em arquivos próprios — nunca influencia classificação, XP competitivo ou as tabelas/lógica desses arquivos.
- Reconexão: desistência imediata quando alguém cai da partida (sem tolerância). Sem oponente na fila: só espera com botão cancelar, sem fallback pra bot.
- Único pacote novo autorizado até agora: `ws` (WebSocket no servidor) — não introduzir outras dependências sem avisar e justificar.
- Verificação de regressão: `npm run test:api` (inclui todos os `arena-*.test.mjs`), `node --test shared/arena/engine.test.mjs src/arena/*.test.mjs`, e `node scripts/check-arena-pvp.mjs` (manual, dois clientes reais — precisa de `npm run api` + `npm run web:8083` já no ar).
- Cuidado real já encontrado uma vez: qualquer erro não tratado dentro dos listeners de WebSocket (`server/arena-ws.mjs`) derruba o processo Node inteiro, afetando TODOS os jogadores conectados — sempre envolver lógica nova ali (e em `arena-persistence.mjs`) em try/catch, nunca deixar propagar.
- Próximos passos possíveis (não pedidos ainda): convite de amigo pro PvP, progresso/coleção local, fila com pareamento por habilidade (fora do rating competitivo).
