## Revisão de qualidade — 13/09/2026

Limite por conta, importação direta da fonte Ionicons, movimento reduzido, foco de teclado, controles de áudio com área de toque, cabeçalhos e nomes sem corte. Backup periódico cifrado em worker, restauração protegida, probe de saúde e métricas de término/fila. Instruções atuais em OPERACAO.md; protocolo humano em PILOTO-E-DISPOSITIVOS.md. Nenhuma implantação externa nesta revisão.

Validação final em 13/09/2026: 28 testes de API/operação aprovados, TypeScript sem erros, testes de interface dos nove jogos, MD3, competitivo com reconexão, conta e sincronização aprovados. Acessibilidade em 320 px com texto 200%, movimento reduzido e teclado passou; competição passou com CPU 4× mais lenta, atraso de 150 ms e resposta perdida após aceitação. Cópia dos arquivos do Dockerfile carrega a API; a imagem Docker não foi executada. Build web gerado em dist-web: aproximadamente 757 KB de JavaScript, uma fonte e 13 assets (antes cerca de 1,2 MB e 31 assets). Orçamento de bundle verificado. Corrigida a resposta atrasada da sala anterior que podia sobrescrever a continuação. Nenhuma publicação realizada.

## Atualização de implementação — 12/09/2026

Esta atualização substitui as configurações anteriores descritas abaixo.

- Competitivo: 18 questões em três blocos de seis, 45 segundos. Base por média das patentes (1, 6, 11 ou 16), mais 5 e 10 níveis nos blocos seguintes. Configuração comum congelada ao parear e preservada na série.
- Progresso do rival atualizado durante a prova; resumo de todas as provas e botão Buscar próximo rival.
- Campanha: metas específicas de reflexo (600/850) e memória (limiares alcançáveis pelo tamanho da sequência). Sincronização opcional importa os melhores resultados locais para a conta, sem conceder XP ou classificação. Falhas preservam progresso local e permitem nova sincronização.
- Histórico individual detalhado e paginado, independente da limpeza de salas. Exclusão da conta remove seus registros e preserva os históricos dos adversários.
- Imagens do catálogo: 16.433.957 para 275.149 bytes (98% menores). Originais preservados; reconstrução com npm run assets:optimize.
- Respostas competitivas exigem token rotativo de questão; reenvio idempotente continua disponível. No máximo cinco séries contra o mesmo rival por dia UTC alteram a classificação. Sinais de automação não aplicam sanções automaticamente. Revisão com npm run integrity:report; retenção de 90 dias.
- npm run metrics inclui notas médias, provas perfeitas, empates e provas sem pontuação por modo, nível e versão nos últimos sete dias.

Os novos parâmetros são uma hipótese de balanceamento, ainda sem validação com público real. Em um piloto, observar novatos e veteranos, comparar as métricas por jogo, coletar motivos de abandono e ajustar após uma amostra suficiente. A validação automatizada não mede diversão nem substitui testes em celulares físicos.

# Evolução da jogabilidade — 12/09/2026

Implementação local. Não houve publicação da API nem atualização de lojas nesta etapa.

## Experiências separadas

- **Campanha:** nove jogos, 30 fases por jogo, seis capítulos com objetivos, exemplo antes da fase, estrelas e melhor resultado por fase. Funciona sem conta. Metas padrão 650/900, reflexo 600/850 e memória por tamanho da sequência. Armazenamento local por jogo, com sincronização opcional na conta.
- **Treino livre:** todos os níveis disponíveis. Não desbloqueia campanha nem altera patente. Na busca competitiva, é possível treinar; a contagem regressiva do duelo interrompe o treino automaticamente.
- **Salas casuais:** nove jogos, grupos de 2/4/6 pessoas, MD1/MD3, convite e revanche. Mantêm estatísticas online e XP, mas não alteram a classificação competitiva.
- **Competitivo:** fila única 1×1, MD3, rotação diária UTC entre Conta rápida, Menor ou maior? e Sequência lógica. 18 questões, três blocos progressivos e 45 segundos; nível inicial pela média das patentes, sem depender da campanha. Os demais jogos continuam casuais até receberem protocolo e calibração adequados à competição.

## Classificação e justiça

Classificação Elo inicial 1.000; K=48 nas cinco primeiras séries e K=24 depois. A variação considera a classificação do adversário e o resultado da série. Patentes: Bronze abaixo de 900, Prata 900–1099, Ouro 1100–1299, Platina 1300–1499, Diamante 1500–1699 e Lendário a partir de 1700. Colocação fica identificada nas cinco primeiras séries.

A fila busca diferença de até 150 pontos, amplia 50 a cada dez segundos e para em 400. A busca é reavaliada nas consultas de presença. Não existem bots fingindo ser jogadores nem vantagem comprável. Salas oficiais não aparecem na lista de convites e não aceitam entrada por código; só o pareamento do servidor pode juntar adversários. Uma revanche direta é casual.

Pontuação igual é empate. Não se usa mais o instante de chegada do pacote para decidir o vencedor. Em MD3, vence quem acumular mais vitórias em até três provas; igualdade final é empate, inclusive em grupos. Prova zerada por todos não dá vitória; série inteira sem pontuação válida não movimenta classificação.

Cada série oficial atualiza rating uma única vez, em transação SQLite, com registro persistente separado das salas temporárias. Estatísticas casuais antigas são preservadas; não foram convertidas em rating.

## Protocolo competitivo

O endpoint de sala não fornece as questões competitivas. `/round` fornece apenas a questão atual, recebe a resposta daquela etapa e devolve acerto, combo e próximo enunciado. Não expõe gabarito nem explicação de questões futuras. Não aceita envio de um placar ou lista de respostas pelo endpoint casual.

Cada participante abre sua tentativa dentro dos dez segundos após a largada. O prazo individual começa na abertura registrada pelo servidor. Recarregar não reinicia tempo nem respostas. Repetir a mesma resposta é idempotente; trocar resposta confirmada, saltar índice e usar uma prova antiga são rejeitados. Há piso de 120 ms por questão para barrar envios instantâneos, sem alegar que isso detecta todos os bots.

Respostas confirmadas sobrevivem à expiração mesmo sem envio final. Sair de uma série oficial explicitamente zera a prova atual e as seguintes daquele participante. A interface pede confirmação de saída durante a disputa. A classificação não depende de tempo bruto, mas a qualidade da rede ainda pode influenciar a experiência e precisa ser medida em aparelhos reais.

## Mudanças nos jogos

- Fases de alternativas aumentam rodadas por capítulo; o cronômetro reduz dentro do capítulo e recupera margem ao introduzir conteúdo novo.
- Conta rápida introduz operações por capítulo e usa distratores baseados em erros plausíveis.
- Comparações introduzem negativos e decimais em capítulos separados.
- Sequências explicam o padrão depois do erro; a explicação não acompanha a questão pública.
- Fora do padrão usa formas desenhadas com componentes nativos, sem depender de I/l ou O/0. Grade 6×6 corrigida, com alvos de pelo menos 44 px na verificação web a 320 px de largura.
- Cor certa usa fundo escuro para a tinta do enunciado, mantendo os nomes nas alternativas.
- Reflexo distingue notas entre 100 e 180 ms; menos de 100 ms vale zero nas regras novas. Configurações anteriores mantêm a fórmula antiga.
- Mira mede o toque pelo relógio monotônico atual, rejeita pontuação de alvos fora da janela e evita sobreposição entre alvos ainda visíveis. A arena se adapta à largura disponível.
- Tempo certo informa antecipação ou atraso; resultados exibem vitória, derrota ou empate e informações para a próxima tentativa.

Jogos casuais usam `rulesVersion: 6`; a configuração competitiva atual usa versão 7. Metas continuam sujeitas à validação humana por modalidade.

## Retorno e observação

Desafio diário solo determinístico entre três jogos, com recorde local por data e novas tentativas permitidas. Não movimenta classificação. Objetivos semanais opcionais no perfil: concluir três disputas válidas, vencer uma série competitiva e criar uma revanche. Ao completar, o perfil mostra o selo Rival da semana; não concede vantagem no jogo.

Convites web usam `?room=CODIGO`; builds nativos usam `duelou://room/CODIGO`. O app oferece entrada direta no convite, sem escolher o jogo primeiro. Isso é um esquema de app, não universal/app link verificado; testar abertura externa em build nativo.

Eventos internos registram entrada em fila, início/conclusão competitiva, conclusão de série e criação de revanche. São vinculados ao identificador da conta, sem nome, segredo ou resposta, com retenção de até 90 dias e exclusão em cascata. `npm run metrics -- caminho/do/banco.sqlite` abre o banco somente para leitura e imprime agregados. O retorno calculado começa no primeiro evento registrado; não representa instalação nem cobre offline.

## Verificação e limites

A verificação inicial desta implementação foi ampliada pela revisão de 13/09/2026. Consulte os comandos abaixo e o checklist de publicação.

Comandos: `npm run test:api`, `npm run typecheck`, `npm run test:ui`, `npm run test:md3`, `npm run test:competitive`, `npm run build:web`.

O teste competitivo usa API isolada em memória e dois navegadores, incluindo campanha sem conta, persistência após recarga, grade 6×6, treino enquanto busca, retomada de rodada e rating após série. Não modifica a base real.

Ainda dependem de validação externa: dispositivos Android/iOS, fontes ampliadas e leitores de tela, latência real, abertura de convite nativo, curva de dificuldade, retenção e percepção de justiça. Não foram implementados detecção completa de automação, notificações push ou temporadas pagas. A sincronização opcional da campanha está implementada. Esses itens não são pré-requisitos para jogar a versão local, mas não devem ser anunciados como existentes.
