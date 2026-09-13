# Duelou — análise de jogabilidade e evolução competitiva

Data: 12/09/2026. Análise do código atual, inclusive alterações locais ainda não commitadas. Não houve alteração nas mecânicas. API: 9 testes passaram; TypeScript passou. Não houve teste visual, teste em aparelho físico ou pesquisa com jogadores nesta análise. Impactos sobre diversão e retenção abaixo são hipóteses a validar.

## Direção de produto

O Duelou pode se posicionar como uma arena de habilidades rápidas: aprender em segundos, perceber evolução e desafiar alguém para uma revanche. Já existem nove jogos, provas iguais dentro da sala, MD3, salas de grupo, reconexão, resultados persistentes e revanche. A prioridade é tornar essa base justa, compreensível e satisfatória.

Separar três motivos para jogar:

- **Campanha:** progredir mesmo sozinho, aprender mecânicas e desbloquear desafios.
- **Treino:** repetir dificuldades e trabalhar uma habilidade sem arriscar classificação.
- **Arena:** competir com adversários de habilidade próxima, sob regras comuns.

XP mede participação; domínio por jogo mede aprendizagem; patente competitiva mede resultados contra adversários. Cada indicador deve ter nome e função próprios.

## Achados prioritários no código

| Prioridade | Evidência | Efeito provável e proposta |
| --- | --- | --- |
| P0 | `src/arcade/BrowseView.tsx`: solo limitado ao nível online, convidado limitado ao 1 | Quem chega sem adversários não consegue evoluir. Criar progresso solo separado, sem alimentar a classificação competitiva. |
| P0 | `server/rooms.mjs`: ranking ordenado por vitórias acumuladas; estatísticas também contam provas privadas | Volume e partidas combinadas podem dominar o ranking. Reservar classificação competitiva à fila oficial; amigos continuam com histórico casual. |
| P0 | `server/rooms.mjs`: desempate por `finished`, gravado no recebimento | O tempo mistura execução, início local e rede. Não usar chegada do pacote para decidir diferenças pequenas; adotar empate ou desempate explícito e validar protocolo de tempo por modalidade. |
| P0 | `shared/arcade.mjs` gera 36 peças; `src/arcade/Round.tsx` só trata 9, 16 e 25 no layout | A grade de 36 cai no caso de 47% de largura e 90 de altura por peça. Implementar grade 6×6 e verificar telas pequenas, legibilidade e alcance do polegar. |
| P0 | `shared/skillGames.mjs` pontua valores enviados pelo cliente; `publicArcade` só remove `answer` | Sequência de memória e espera de reflexo continuam expostas; a validação de duração mínima não comprova execução humana. Definir revelação por etapa, validação de eventos e detecção de padrões impossíveis antes de promover ranking sério. Não prometer eliminação de automação. |
| P1 | `server/rooms.mjs`: progressão exige `roomLevel === before` | Um jogador pareado em nível próximo pode pontuar 650+ e não avançar. Desacoplar progressão de campanha da dificuldade sorteada na Arena. |
| P1 | `shared/arcade.mjs`: mais rodadas, menos tempo e conteúdo mais difícil simultaneamente | A dificuldade pode subir por vários motivos ao mesmo tempo. Calibrar uma mudança principal por fase. |
| P1 | `src/arcade/Round.tsx`: combo mostrado somente quando há resposta no config | Online oculta uma regra importante de pontuação. Validar resposta no servidor por etapa e devolver feedback sem expor questões futuras. |
| P1 | `server/rooms.mjs`: MD3 conta vitórias por prova, e grupo pode terminar 1–1–1 | Separar vitórias de série e de prova; definir desempate de grupo. Inicialmente reservar MD3 competitivo a 1×1. |
| P1 | `server/rooms.mjs`: primeiro resultado ordenado sempre vence, inclusive placares zerados | Diferenciar empate, abandono e partida sem desempenho válido; não premiar automaticamente uma sala em que todos abandonaram. |
| P1 | `src/arcade/ArcadeScreen.tsx`: consultas de sala a cada 3 segundos | A disponibilização da prova após a largada pode chegar em momentos diferentes. Preparar sessão com confirmação de prontidão e sincronização; transporte em tempo real sozinho não resolve justiça. |

Pontuar todos os jogos entre 0 e 1.000 não torna dificuldades equivalentes. Um 900 no nível 1 e um 900 no nível 30 não demonstram a mesma habilidade. Comparações de recordes devem identificar jogo, configuração/dificuldade e versão das regras.

Há divergências documentais: README e SALAS-E-NIVEIS ainda descrevem cinco jogos e avanço offline, mas o código tem nove e bloqueia o solo pelo progresso online. Também dizem que o nível vem exclusivamente do servidor, enquanto criação e pareamento aceitam `body.difficulty`. A análise usa o código como referência.

## Como tornar os níveis em fases interessantes

Manter inicialmente 30 fases por jogo, organizadas em seis capítulos de cinco. Cada capítulo ensina uma habilidade, combina o aprendido e termina com uma prova de domínio. O mapa mostra objetivo, melhor resultado e próxima novidade; números isolados e cadeados comunicam pouco.

Exemplo de capítulos para Conta rápida:

1. Somas e subtrações positivas, com demonstração jogável.
2. Alternância de operações, mantendo tempo confortável.
3. Negativos, introduzidos explicitamente antes de exigir velocidade.
4. Multiplicações e reconhecimento de resultados próximos.
5. Expressões com precedência, ensinada em uma rodada assistida.
6. Mistura das habilidades anteriores, com pressão de tempo calibrada.

Proposta inicial de estrelas: concluir, atingir domínio, atingir excelência. Limiares devem variar por jogo após observar distribuição real de desempenho. Liberar a próxima fase com domínio básico e deixar perfeição como objetivo opcional. Após erros repetidos, oferecer uma dica e prática da habilidade específica. Na Arena, manter condições iguais para todos.

O limiar universal de 650 merece revisão: em memória, a nota é discreta por quantidade de passos; em reflexo depende de uma curva de milissegundos; em alternativas depende também da posição dos erros no combo. A mesma nota não significa a mesma exigência.

## Melhorias por jogo

| Jogo | Próxima melhoria recomendada |
| --- | --- |
| Conta rápida | Gerar alternativas com erros plausíveis de cálculo. Hoje os distratores ficam próximos do resultado correto, o que pode permitir eliminar opções sem resolver toda a conta. |
| Menor ou maior? | Destacar o comando e ensinar separadamente negativos e decimais antes de misturá-los sob pressão. |
| Fora do padrão | Corrigir 6×6; avaliar formas vetoriais estáveis em vez de depender de diferenças tipográficas como I/l e O/0. |
| Sequência lógica | Apresentar o tipo de padrão no treino e explicar a regra no resultado; evitar que a dificuldade percebida seja adivinhação entre interpretações. |
| Cor certa | Ensinar tinta versus palavra com exemplos. Testar contraste e daltonismo; se uma variante alterar a tarefa, mantê-la em categoria separada. |
| Tempo certo | Exibir erro em milissegundos e antecipação/atraso. Avaliar várias tentativas curtas para reduzir o peso de um único toque. |
| Reflexo relâmpago | Revisar a faixa de nota máxima: atualmente 80–180 ms recebe 1.000. Medir em aparelhos reais e valorizar consistência, sem transformar diferenças do dispositivo em mérito. |
| Mira certeira | Mostrar acertos, perdas e precisão; o código atual não contabiliza toques no vazio. Avaliar toques excedentes e sobreposição entre alvos de momentos próximos. |
| Memória turbo | Criar sequências graduais em campanha e feedback do ponto do erro; rever exposição antecipada da sequência no protocolo competitivo. |

Preservar o papel de cada modalidade. Nem tudo precisa premiar velocidade: precisão, consistência e memória já dão identidades diferentes aos jogos.

## Arena proposta

Começar com uma fila competitiva 1×1 em destaque, com seleção pequena e rotativa de jogos já calibrados. Manter os nove no treino e nas salas de amigos. Evitar multiplicar filas independentes por jogo, nível, formato e tamanho antes de ter jogadores suficientes.

Na fila, buscar adversários por estimativa de habilidade e ampliar gradualmente a busca dentro de limites explícitos. Usar dificuldade comum da competição, independente dos desbloqueios da campanha. Se a espera aumentar, oferecer treino com retorno à partida após confirmação ou desafio assíncrono identificado; não simular adversários humanos.

Uma classificação baseada em resultados e incerteza, como a família TrueSkill, é referência útil; a escolha final deve considerar simplicidade, partidas em grupo e dados disponíveis. A Microsoft descreve explicitamente estimativa de habilidade, incerteza e empates: [TrueSkill](https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/).

Para 1×1 MD3, atualizar classificação ao final da série, preservando estatísticas das provas à parte. Colocação inicial e temporadas podem ser experimentos posteriores. Nunca exigir que alguém complete toda a campanha antes de competir.

Latência e desempenho do aparelho fazem parte da justiça competitiva, como discute a Riot em [Peeking into VALORANT's Netcode](https://www.riotgames.com/en/news/peeking-valorants-netcode). A aplicação aqui é específica do Duelou: não copiar arquitetura de um shooter, mas definir o que o relógio mede e quando cada jogador recebe a tarefa.

## Experiência que estimula outra partida

- Primeira sessão: botão para experiência solo imediata, exemplo jogável curto e resultado; cadastro entra quando a pessoa quiser preservar progresso ou competir.
- Durante a prova: confirmação clara do toque, acerto/erro quando validado, progresso e áudio opcional; instruções curtas com linguagem de jogador.
- Resultado: vitória/derrota/empate, motivo, recorde pessoal comparável e uma dica concreta. A avaliação atual por nota não substitui dizer quem venceu.
- Próxima ação: revanche e continuar campanha em destaque, conforme contexto, preservando jogo e grupo.
- Social: convite que abre a sala, rivais recentes e placar entre amigos. Evitar pedir vários passos manuais para inserir um código.
- Retorno: desafio diário, objetivos semanais opcionais e cosméticos por domínio. Verificar implementação atual antes de reaproveitar funcionalidades citadas em documentos antigos.

## Ordem de execução e critérios

**Etapa 1 — corrigir e medir:** grade 6×6; política de empates/abandono; explicação de resultado e pontuação; separar resultados casuais; eventos de primeira partida, fila, conclusão, falha e revanche. Critério: casos extremos cobertos e uma partida completa em dois aparelhos reais, incluindo rede instável.

**Etapa 2 — progressão solo:** progresso independente, tutorial e primeiro capítulo de dois jogos. Critério: jogador novo consegue aprender e avançar sem conta e sem adversário; progresso solo não altera patente competitiva.

**Etapa 3 — competição:** protocolo e validação dos jogos selecionados, fila concentrada, classificação por habilidade e resultado de série. Critério: dificuldade comum, política de rede verificável, empate definido e classificação sem influência de salas privadas.

**Etapa 4 — retenção e conteúdo:** expandir capítulos que funcionaram, convites diretos, desafios e cosméticos. Critério: crescimento observado de retorno e revanche, sem aumento de falhas ou desistência.

Piloto sugerido: 20–30 jogadores para observar uso e entrevistar, sem tratar a amostra como prova estatística. Medir tempo até primeira partida, conclusão do tutorial, abandono por fase, distribuição de notas, tempo de fila, diferença de desempenho entre adversários, revanche aceita, retorno D1/D7 e percepção de justiça. Separar novatos/experientes, solo/online, jogo e aparelho. Metas numéricas devem partir dessa linha de base.

Não há evidência de retenção real nesta revisão. Mais fases e mais jogos só devem ganhar prioridade quando os dados e as conversas mostrarem falta de conteúdo, em vez de dificuldade para entrar, aprender ou encontrar uma partida justa.
