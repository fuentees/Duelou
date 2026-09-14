# Batalha, intervalo e personagens

Implementação local de 13/09/2026.

## Fluxo da disputa

A largada apresenta nomes, personagens, indicação Você/Rival e patente quando a sala é competitiva. A contagem inicial continua em cinco segundos, com número direto, sem animar de zero a cada atualização.

No MD3, o encerramento de uma prova grava seu resultado e cria um intervalo persistido no servidor. A tela mostra vitória/derrota/empate, notas, detalhes pessoais e placar acumulado. Cada participante confirma **Pronto para a próxima** individualmente.

O intervalo dura no máximo 20 segundos; segue-se uma contagem de cinco segundos. Se todos os participantes que continuam na série estiverem prontos, o intervalo encurta, preservando pelo menos cinco segundos de leitura. A prontidão é validada pelo índice da próxima prova, não reinicia prazos e sobrevive à reconexão. Quem abandonou uma série competitiva não bloqueia a prontidão e não pode voltar a confirmá-la. Ausência de confirmação não prende os demais: o prazo máximo continua válido.

A tela final destaca o vencedor, seu personagem e o placar da série; empates não recebem vencedor inventado. Não há avanço automático após o fim da série. O jogador escolhe continuar, buscar rival, criar revanche ou voltar às salas.

Uma alteração paralela nas regras passou a desempatar pontuação pelo instante de conclusão registrado no servidor. Ela foi preservada; igualdade exata de pontos e instante permanece empate. Histórico e destaque usam o mesmo vencedor calculado. Essa medida inclui comunicação com o servidor e não representa apenas tempo de reação humana.

## Personagem

Menu → Meu perfil e conquistas → Personalizar personagem.

Escolhas iniciais: Robô/Gato/Alien; quatro cores; sem acessório, visor ou coroa; moldura circular, quadrada ou dourada. Todas as 108 combinações são gratuitas e cosméticas. A prévia muda imediatamente; Salvar personagem envia a seleção validada para a conta autenticada. Falhas mantêm o rascunho; Cancelar descarta apenas a edição local. Dados anteriores recebem um personagem padrão.

Os personagens são desenhados por componentes nativos, sem novos downloads de imagem. Aparecem na apresentação, no progresso do rival, no intervalo, no destaque final e no ranking. A conta guarda apenas identificadores de opções permitidas; nenhuma opção altera XP, moedas, pontuação ou Elo.

## Verificação

`npm run test:api` cobre intervalos, leitura mínima, prazo máximo, prontidão por conta, requisições repetidas/antigas, validação e isolamento dos personagens. `npm run test:md3` e `npm run test:competitive` exercitam prontidão entre provas no navegador. `npm run test:character` verifica escolha em 320 px, acessibilidade, falha de salvamento, nova tentativa e persistência após recarga.

Nenhuma publicação externa foi realizada. Toques e transições ainda devem ser observados em celulares físicos.

Validação local: 31 testes de API/operação aprovados; MD3, competitivo, editor de personagem, acessibilidade, TypeScript, arquivos do container e build web aprovados. Personagens não acrescentaram imagens ao bundle (13 assets; JavaScript cerca de 768 KB, dentro do orçamento).
