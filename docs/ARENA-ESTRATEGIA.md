# Arena Rush: exército pessoal e posturas

Cada jogador invoca tropas com seu personagem 3D. Os emblemas e tamanhos
distinguem batedor, soldado e tanque; a direção e a cor do emblema identificam o time.
Os cosméticos continuam sem vantagens de combate.

Antes de responder, o jogador pode escolher a postura das próximas invocações:

| Postura | Vida | Velocidade | Uso sugerido |
| --- | --- | --- | --- |
| Equilíbrio | normal | normal | Manter ritmo sem uma fraqueza adicional |
| Investida | −20% | +30% | Pressionar uma pista livre antes que o rival se organize |
| Guarda | +30% | −20% | Sustentar a linha de frente, aceitando avançar mais devagar |

O dano permanece igual. As classes continuam determinadas por precisão,
velocidade de resposta e combo. Trocar a postura não transforma nem cura tropas
já invocadas. Não há custo em moedas nem melhoria permanente comprável.

O servidor aceita apenas posturas conhecidas e aplica os modificadores ao
invocar. Clientes anteriores sem esse campo usam Equilíbrio. Respostas durante
pausa ou antes da largada não são consumidas. Um acerto no limite de dez tropas
continua contando como acerto, mas não anuncia uma invocação inexistente.

Validação: testes do motor com atributos, deslocamento, troca de postura,
acesso de terceiros e pausa; teste online com escolha, acerto, tropa no estado
do servidor, polígonos 3D na tela e reconexão. Balanceamento é inicial: ainda
precisa de sessões com jogadores, especialmente para medir predominância da
Guarda em filas congestionadas. Desempenho com 20 tropas em aparelho físico
também permanece uma validação pendente.
