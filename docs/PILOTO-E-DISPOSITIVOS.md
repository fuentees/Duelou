# Piloto de jogabilidade e dispositivos

Preparado em 13/09/2026. Nenhuma sessão com participantes reais ou aparelho físico foi realizada por esta revisão.

## Sessão moderada

Reunir 30–50 adultos voluntários, com novatos e pessoas habituadas a jogos. Fazer sessões de 20–30 minutos: descobrir um jogo sem ajuda, concluir o exemplo, tentar três fases, recuperar uma tentativa após falha, disputar três séries com adversários diferentes e consultar o resultado. Não interferir na primeira tentativa; registrar onde a instrução não foi suficiente.

Perguntar ao final: o que fez perder pontos, qual fase pareceu injusta, o que motivou continuar ou parar, qual dificuldade mudaria e se gostaria de uma nova partida. Usar identificador de sessão, sem nome civil ou dados sensíveis. Explicar finalidade e opção de não participar; não coletar áudio/vídeo automaticamente.

## Registro por sessão

Copiar este bloco em um arquivo de resultados do piloto (não preencher com dados simulados):

- ID / data / experiência prévia:
- Aparelho / sistema / tamanho de fonte / leitor de tela:
- Rede e interrupções observadas:
- Jogos, níveis e versões das regras:
- Conseguiu iniciar sem ajuda? Onde precisou de ajuda?
- Compreendeu a pontuação e o empate?
- Erros de toque, lentidão, corte de texto ou desconexão:
- Motivo relatado para parar:
- Quer jogar novamente? Por quê?
- Problema reproduzível e passos:

## Matriz física pendente

| Ambiente | Verificações | Estado |
|---|---|---|
| Android de entrada | toque, memória, aquecimento, FPS percebido, retorno do segundo plano | Pendente |
| Android intermediário | partida MD3 completa, fonte 200%, TalkBack, áudio desativado | Pendente |
| Android de alto desempenho | consistência de pontuação de reflexo e mira | Pendente |
| iPhone suportado | VoiceOver, fonte ampliada, interrupções, convite nativo | Pendente |
| Rede móvel instável | reconexão, resposta perdida, tempo restante, duplicação | Pendente em rede real |

A simulação automatizada usa tela de 320 px, texto ampliado, movimento reduzido, CPU desacelerada e resposta de rede perdida após aceitação. Ela identifica regressões, mas não reproduz sensores, tela, bateria, leitores de tela nativos ou a experiência humana.

## Critérios para ajustar

Comparar cada modo, faixa de nível e versão; não misturar jogadores novos e experientes sem segmentação. Examinar amostra e número de jogadores antes de interpretar médias. Investigar séries com muitos empates/perfeitos, baixo número de respostas, espera longa e repetição de time_limit. Os estados técnicos não revelam o motivo humano da saída.

Combinar `npm run metrics` com o relato das sessões. Alterar uma variável principal por rodada de ajuste (tempo, quantidade de questões ou dificuldade), preservar igualdade entre rivais e versionar as regras. Não declarar balanceamento validado apenas porque testes automatizados passaram. Registrar hipótese, mudança, participantes, resultados e decisão antes de aumentar o público.
