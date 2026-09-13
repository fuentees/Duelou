# Contexto do projeto Duelou

- App Expo SDK 57, React Native 0.86, TypeScript. Servidor Node com node:sqlite.
- Regras de código: siga os padrões já existentes no repo. TypeScript deve passar em `npm run typecheck` ao fim de cada tarefa. Não introduza dependências novas sem avisar e justificar.
- Reutilize o que já existe: geração de desafios em shared/arcade.mjs e shared/skillGames.mjs; paleta e cores em src/theme.ts; sons em src/audio/sounds.ts; padrão de persistência local de src/arcade/campaign.ts (localStorage na web, SecureStore no nativo); navegação por "Section" em src/components/BottomNav.tsx e src/LiveApp.tsx.
- Acessibilidade: respeite src/useReducedMotion.ts, área de toque mínima ~44px, e não dependa só de cor (há usuários daltônicos).
- Trabalhe em pequenos passos. Ao terminar, liste o que mudou e como testar.

## Arena Rush (novo modo, em construção por tickets)

- Sendo construído em tickets sequenciais (ver histórico da conversa/commits). Fase 0 é **offline, contra bot** — não envolve servidor nem rede.
- NÃO TOQUE, nesta fase, em: server/competitive.mjs, server/rooms.mjs, shared/competition.mjs, nem em nada de Elo/rating/anti-trapaça. O novo jogo é local e não deve influenciar classificação, XP competitivo ou o servidor.
- Tempo real (fase 2, WebSocket + simulação autoritativa no servidor) é um épico à parte — não começar antes das fases 0 e 1 estarem prontas e testadas com gente de verdade.
