# Arena Rush: o que mudou para virar um duelo competitivo

Implementação local de 14/09/2026. Todo o trabalho abaixo é do PvP em tempo
real (Arena Rush). Nada aqui toca `server/competitive.mjs`,
`shared/competition.mjs` nem as tabelas de Elo/patente da fila competitiva: são
dois modos diferentes, medindo coisas diferentes.

## Justiça da partida

**Desafio igual pros dois lados.** Cada jogador sorteava o próprio desafio com
o `Math.random` do servidor, então um podia pegar uma conta fácil enquanto o
outro pegava uma difícil. Agora o conteúdo vem de uma semente derivada de
`(matchId, índice, nível)` — `shared/arena/deck.ts` — e dois jogadores no mesmo
índice e no mesmo momento recebem exatamente o mesmo desafio.

**Dificuldade pelo relógio, não pelo desempenho.** O nível subia com o número
de desafios que aquele jogador já tinha respondido: quem jogava melhor recebia
perguntas mais difíceis que o adversário. Agora sai de `levelForElapsed`, em
função do tempo decorrido — igual pros dois, o tempo todo.

**Latência deixa de valer como habilidade.** O tempo de resposta continua sendo
medido pelo relógio do servidor (é o que impede o cliente de se declarar mais
rápido do que foi), mas descontando a viagem da rede, medida pelo ping/pong do
próprio protocolo WebSocket (`server/arena-latency.mjs`). Usa o **menor** tempo
recente, não a média — atrasar respostas de propósito não compra desconto — e o
desconto tem teto de 300 ms. O jogador vê o próprio ping na tela.

**Rodízio maior de jogos.** O PvP usava só conta, cor e reflexo. Entraram
"menor ou maior?" e "sequência lógica", que já geravam rodada de alternativa
pronta em `shared/arcade.mjs`.

## Fim de partida

**Morte súbita.** Nos últimos 20 segundos, dano à base vale o dobro. Antes,
abrir vantagem cedo e empilhar tanque no meio da pista era a estratégia
dominante — travar a partida ganhava.

**Desempate.** Tempo esgotado com bases iguais dava empate direto. Agora
decide, em ordem: tropa viva em campo, maior combo, total de invocações.
Empate continua existindo, mas como último caso.

## Decisões do jogador

**Vantagem de tipo.** Batedor cerca tanque, tanque atropela soldado, soldado
segura batedor (dano dobrado no confronto favorável). Antes o combate era só
HP × dano: tanque era sempre a melhor tropa e empilhar um tipo só não tinha
resposta.

**Gastar combo.** Com combo 4, o jogador invoca um tanque na hora e volta do
zero. Segurar o combo deixa as próximas invocações mais fortes; gastar dá
pressão imediata. É a única escolha da partida que não é "seja mais rápido", e
quem valida o combo é sempre o servidor.

**Acerto nunca some.** Com a pista no teto de tropas, o acerto era engolido
sem nenhum aviso. O motor devolve `spawned` e a tela avisa "pista cheia". O
combo continua contando: o acerto foi legítimo.

## Classificação própria

`server/arena-rating.mjs`, tabela `arena_ratings`: nota inicial 1000, K maior
nas dez partidas de colocação, vitória sobre quem está acima vale mais, empate
aproxima as notas, sequência atual e melhor sequência, maior combo.
Desistência e queda contam como derrota.

API: `GET /v1/arena/me`, `GET /v1/arena/leaderboard`, `GET /v1/arena/history`.
Na tela: nota e variação no resultado, ficha com cartel e últimas partidas no
lobby, e a aba Ranking com "Arena Rush" ao lado de "Competitivo".

## Social

**Revanche.** Nos 20 segundos seguintes ao fim da partida, os dois podem se
reencontrar direto: quem chama fica esperando, o outro recebe o convite na tela
de resultado e, quando os dois topam, a partida nova começa sem passar pela
fila. Se o adversário sair ou o prazo acabar, quem aceitou é avisado.

**Convite direto.** `createInvite` devolve um código de seis caracteres que
vale cinco minutos; quem recebe entra com ele e a partida começa na hora.
Partida por convite é **amistosa**: entra no histórico marcada como tal, mas
não mexe na nota de ninguém — senão combinar vitórias com um amigo seria a
forma mais rápida de subir na classificação.

## Divisões

A nota também vira divisão (Bronze a Lendário, `arenaTierFor` em
`src/theme.ts`), com as mesmas cores e ícones que o app já usa. É "divisão", não
"patente": patente continua sendo da fila competitiva. Trocar de divisão é o
destaque da tela de resultado, acima da variação de pontos.

## Banda

O servidor mandava o estado completo — todas as tropas, com posição e vida —
para os dois sockets, quinze vezes por segundo. Agora manda só o que mudou
(`shared/arena/statePatch.ts`), com um retrato completo a cada ~2 segundos que
conserta mensagem perdida ou arredondamento acumulado. Medido no navegador com
dois jogadores reais: patch médio de 92 bytes contra 381 do estado completo,
3,6× menos tráfego no total.

## Fila

Era FIFO pura — 1400 contra 800 dava na mesma. Agora pareia por proximidade de
nota, com janela que abre com o tempo de espera (fila eterna é pior que
partida desigual) e uma varredura periódica pra juntar quem já estava
esperando. Passados 25 segundos sem adversário, a busca oferece treinar contra
o robô (modo offline que já existia e estava inalcançável), avisando que treino
não altera a nota.

## Design e navegação

A partida é o único lugar escuro do app (tokens `arena` em `src/theme.ts`), com
acentos claros próprios — verde/vermelho/âmbar da paleta clara somem no fundo
escuro justamente nos avisos que mais importam. As barras de vida mostram
avatar e nome dos dois jogadores em vez de "SUA BASE"/"BASE INIMIGA". A pista
tem altura mínima, o painel de resposta tem altura estável e alternativas de
56 px, e o cronômetro é maior. Som de acerto e erro, aviso do que foi invocado,
combo do adversário e faixa de morte súbita.

O duelo tem entrada própria na barra de navegação ("Arena" são os jogos,
"Duelo" é o 1×1 ao vivo) e o lobby mostra a barra como qualquer outra tela.

## Como verificar

- `npm run typecheck`
- `npm run test:api` (inclui `arena-latency`, `arena-rating` e os demais
  `arena-*`)
- `npm run test:arena`
- `npm run build:web` e `npm run check:bundle`
- Com API e prévia web no ar: `node scripts/check-arena-pvp.mjs` e
  `node scripts/check-rush-polish.mjs` (dois clientes reais; exigem Edge
  instalado).

## O que não foi feito

- **Temporadas** (reset periódico da nota): é decisão de produto, precisa de
  política de reinício e calendário antes de virar código.
- **Cosméticos por desempenho**: o editor de personagem existe e poderia
  premiar divisão ou sequência, mas isso é economia nova, não ajuste.
- **Tema escuro no app inteiro**: a partida é escura; o resto do app é claro.
  Trocar isso é refatorar todas as telas (a paleta é constante em tempo de
  módulo, `StyleSheet.create`), com risco espalhado e pouco a ver com o
  competitivo.
- **Fonte de identidade própria**: exige empacotar o arquivo da fonte e pesa no
  bundle, que tem guarda de tamanho (`npm run check:bundle`).

Nenhum teste em aparelho físico nem com jogadores reais: os efeitos sobre
diversão, equilíbrio e retenção descritos aqui são hipóteses a validar. Os
números de equilíbrio (bônus de tipo 2×, combo 4 pra invocar tanque, morte
súbita em 20s, janelas da fila) estão em constantes nomeadas, feitas pra serem
calibradas com gente jogando.
