# Contexto do projeto Duelou

- App Expo SDK 57, React Native 0.86, TypeScript. Servidor Node com node:sqlite.
- Regras de código: siga os padrões já existentes no repo. TypeScript deve passar em `npm run typecheck` ao fim de cada tarefa. Não introduza dependências novas sem avisar e justificar.
- Reutilize o que já existe: geração de desafios em shared/arcade.mjs e shared/skillGames.mjs; paleta e cores em src/theme.ts; sons em src/audio/sounds.ts; padrão de persistência local de src/arcade/campaign.ts (localStorage na web, SecureStore no nativo); navegação por "Section" em src/components/BottomNav.tsx e src/LiveApp.tsx.
- Acessibilidade: respeite src/useReducedMotion.ts, área de toque mínima ~44px, e não dependa só de cor (há usuários daltônicos).
- Trabalhe em pequenos passos. Ao terminar, liste o que mudou e como testar.

## Arena Rush (novo modo, em construção por tickets)

- Fase 0 (Tickets 1-9, offline contra bot) está pronta e commitada: `shared/arena/engine.ts`, `src/arena/*`. Não foi testada com gente de verdade antes de avançar — o usuário decidiu explicitamente pular esse gate e priorizar PvP direto (ver abaixo), então essa decisão já foi tomada conscientemente, não precisa ser revisitada.
- **Decisão do usuário: PvP em tempo real é a prioridade agora**, substituindo o bot como ponto de entrada (não coexistem por escolha de tela). `ArenaScreen.tsx`/`bot.ts`/`src/arena/onboarding.ts` continuam no repo, testados, só deixam de ser alcançados pelo menu — não apagar.
- Plano completo (Tickets 12-26: motor autoritativo no servidor, WebSocket, matchmaking FIFO próprio, anti-trapaça de desafios, etc.) está em `C:\Users\fuent\.claude\plans\drifting-frolicking-pixel.md`. Seguir na ordem, um commit por ticket.
- NÃO TOQUE em: server/competitive.mjs, server/rooms.mjs, shared/competition.mjs, nem em nada de Elo/rating/anti-trapaça. Toda a infraestrutura nova do PvP (fila, partidas, desafios) vai em arquivos novos e independentes — nunca deve influenciar classificação, XP competitivo ou as tabelas/lógica desses arquivos.
- Reconexão: desistência imediata quando alguém cai da partida (sem tolerância). Sem oponente na fila: só espera com botão cancelar, sem fallback pra bot.
- Único pacote novo autorizado: `ws` (WebSocket no servidor), justificado no plano acima — não introduzir outras dependências sem avisar.
