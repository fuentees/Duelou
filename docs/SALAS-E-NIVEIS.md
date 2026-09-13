# Salas, offline e níveis — 11/09/2026

> Registro histórico: regras de progressão, ranking, jogos e desempate deste documento foram substituídas em 12/09/2026. Consulte [Evolução competitiva](EVOLUCAO-COMPETITIVA.md) para o funcionamento atual.

A entrada do app separa Online, Com amigos e Offline. O Arcade não usa mais quatro nomes fixos (Iniciante/Desafio/Mestre/Lendário): é uma escada numerada de 1 a `MAX_LEVEL` (30, em `shared/arcade.mjs`). O jogador não escolhe o nível — ele sobe sozinho quando uma sala é concluída com pontuação ≥ `CLEAR_SCORE` (650 de 1.000) na fase em que o jogador está agora; jogar uma fase já vencida não avança mais. Rodadas e tempo crescem suavemente com o nível (nível 1: 8 rodadas/75s; nível 30: 18 rodadas/35s — fórmula em `levelRules`). A pontuação é normalizada e sempre chega a no máximo 1.000, permitindo comparar entre níveis. Partidas offline não entram nos rankings.

- **Patente (Bronze a Lendário):** o nível também define a patente exibida no perfil (`src/theme.ts`, 5 níveis por patente: Bronze 1-5, Prata 6-10, Ouro 11-15, Platina 16-20, Diamante 21-25, Lendário 26-30). `MAX_LEVEL` foi de 20 para 30 justamente pra Lendário ser alcançável — com o teto antigo, a patente máxima do jogo nunca existia na prática. Chegar ao nível 30 também destrava a conquista "Lendário".
- **Combo em tempo real (offline):** enquanto joga uma prova Arcade offline, uma sequência de 2+ acertos seguidos mostra um selo "🔥 N seguidas" — o mesmo bônus que já vale mais pontos (ver `arcadeScore` abaixo) agora também aparece durante o jogo, não só no resultado final. Não aparece em sala online porque o cliente não recebe a resposta certa antes de pontuar (evita ler o gabarito pelo dev tools).

- **Online e Com amigos:** o nível da sala vem sempre do nível atual do jogador no servidor (tabela `arcade_stats`), nunca de uma escolha do cliente — evita pular nível manualmente.
- **Pareamento automático (`/v1/rooms/random`):** casa com o nível mais próximo do seu, com tolerância de 3 (`LEVEL_TOLERANCE`), não mais nível idêntico — com 30 níveis, exigir combinação exata deixaria pouca gente pra parear.
- **Offline (sem conta):** o progresso fica só no aparelho (`expo-secure-store` no nativo, `localStorage` na web), mesma regra de avanço.
- **Formato da sala (MD1/MD3):** ao criar uma sala (pública, privada ou pelo pareamento automático), o jogador escolhe "melhor de 1" (uma prova decide, padrão) ou "melhor de 3" (quem vencer 2 de 3 provas leva a sala). Entre uma prova e a próxima da mesma série, a sala volta para o estado de contagem regressiva com o placar da série até ali; o botão de revanche só aparece quando a série termina. Estatísticas pessoais (partidas, vitórias, melhor, média) contam cada prova individualmente, mesmo dentro de uma série — não a série inteira como uma partida só.
- Cada um dos 5 jogos do Arcade escala continuamente com o nível (mais opções, números maiores, casas decimais, grade maior, mais cores, padrões mais complexos) em vez de saltar entre 4 blocos fixos. "Qual é o menor?" gera valores realmente aleatórios e espalhados — não mais uma sequência de passo fixo (o "olha só o último dígito" que ficava fácil demais no nível difícil), e alterna com "Qual é o maior?" pra não virar reflexo de sempre clicar no mesmo lugar.
- Dentro de um mesmo nível, cada rodada sorteia sua própria variação de conteúdo (operação em Conta rápida, tipo de padrão em Sequência lógica etc.) puxada pelo progresso do nível, mas não fixa — antes, o nível inteiro repetia a mesma regra em todas as rodadas e só os números mudavam. Duas rodadas seguidas iguais são sorteadas de novo.
- Pontuação por prova pesa sequência de acertos, não só o total: cada acerto vale mais quanto maior a sequência de acertos seguidos até ali (capa em 5 acertos seguidos), normalizado pra ainda bater 1.000 no gabarito perfeito. Acertar metade da prova espalhado pontua menos que acertar a mesma metade em sequência.

Sequência lógica pede o próximo número de um padrão. Cor certa é um teste de Stroop: o jogador toca na cor real da tinta, não na palavra escrita. Os jogos clássicos (Cronômetro, Reflexo, Memória, no app fora do Arcade) continuam com três níveis fixos, escolhidos manualmente — essa escada numerada é exclusiva do Arcade.

## Salas e conexões

- Públicas: aparecem na listagem enquanto têm vaga e algum participante responde ao servidor.
- Aleatório: procura exclusivamente uma sala pública 1×1 do mesmo jogo e nível; abre uma se não encontrar. Ao chegar o segundo jogador, a contagem de cinco segundos começa automaticamente. Salas públicas de grupo continuam na listagem, mas não confundem o pareamento rápido. Nunca há jogador fictício.
- Privadas: acesso pelo código compartilhado, fora da listagem pública.
- Capacidade configurável: 2, 4 ou 6. Anfitrião inicia com pelo menos dois presentes.
- Largada marcada para cinco segundos depois no relógio do servidor. Cada cliente recebe a mesma prova após o horário da largada. Atualizações de sala por consulta a cada três segundos; não é sincronização de precisão para esportes competitivos.
- Respostas corretas ficam no servidor. O envio é idempotente. O placar ordena por pontos e, em empate, pelo menor tempo de conclusão registrado pelo servidor.
- Salas e participantes ficam no SQLite. Sair antes do início transfere a função de anfitrião ao próximo participante. Após a partida, sair preserva o placar.
- Partidas, vitórias, recorde e média pessoais ficam persistidos mesmo depois da limpeza técnica das salas antigas. Ao fim de uma partida, qualquer jogador pode criar uma revanche com o mesmo modo, nível, capacidade e privacidade — a sala antiga guarda o código da nova (`nextCode`) e quem ainda está nela vê um aviso pra aceitar ou recusar, em vez de ficar perdido sem saber que uma revanche existe. Clicar em "criar revanche" de novo (ou aceitar) depois que ela já existe só entra na mesma sala — não fragmenta o grupo em várias.
- Se o app for recarregado ou reaberto, a API devolve a sala ativa mais recente e a partida é restaurada automaticamente. A página Online também mostra o ranking Arcade por vitórias, com recorde como primeiro desempate.
- Sem rede, os três modos Arcade executam localmente. No app nativo, o código é incluído no binário; a prévia web precisa ter sido carregada antes de perder conexão, pois ainda não há instalação PWA/cache de abertura offline.
- Os modos clássicos continuam nas telas de treino/duelos anteriores e usam a API. Ainda não são offline nem salas de grupo.

## Operação

Iniciar `npm run api` e `npm run web:8083`. Testar com `npm run test:api`, `npm run typecheck`, `npm run test:ui` e `node scripts/check-arcade.mjs`.

Construir a imagem da API a partir da raiz do projeto: `docker build -f server/Dockerfile -t duelou-api .`. O contexto deve incluir `server/` e `shared/`.

Exposição na internet depende de API HTTPS pública, volume persistente, configuração de `EXPO_PUBLIC_API_URL` e origem web autorizada. `localhost:8083` é apenas a prévia desta máquina.

## Verificação realizada

Testes de servidor cobrem a escada de níveis (1, 2, meio e MAX_LEVEL para os 5 jogos), regras progressivas, avanço de nível só acima da nota mínima, pareamento com tolerância (casa nível próximo, rejeita nível muito distante), série MD3 (continua entre provas, só fecha com 2 vitórias, estatísticas contam por prova), sala privada fora da listagem, restauração de sala, ranking, permissões, ocultação de gabarito, grupo, desempate por tempo, estatísticas permanentes, replay e exclusão. Teste com três navegadores cobre entrada por código, largada, placar, revanche, recarga/reconexão, ranking e pareamento automático (todos no nível 1, o padrão de conta nova). Teste dedicado (`npm run test:md3`) cobre a série melhor-de-3 de ponta a ponta em dois navegadores reais. Teste offline bloqueia todas as chamadas à API e conclui as 8 rodadas do nível 1.

Ainda é preciso calibrar dificuldade com jogadores e testar em aparelhos físicos, inclusive fontes grandes e leitor de tela. Fora do padrão tem uma exigência visual inerente; os modos de raciocínio são alternativas, não uma certificação de acessibilidade universal.
