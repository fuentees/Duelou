# Personagens tridimensionais

Robô, gato e alien usam malhas com vértices XYZ, projeção em perspectiva,
eliminação de faces traseiras, ordenação por profundidade e iluminação direcional.
Não são imagens pré-renderizadas nem um desenho que apenas gira no plano.

O renderizador é por software: projeta polígonos em `react-native-svg`, compatível
com a camada Expo usada pelo projeto. Não usa WebGL, modelos GLB externos ou
animação esquelética. A ordenação por profundidade é adequada a estes retratos
simples; não substitui um depth buffer para cenários complexos com interseções.

O componente compartilhado atende login, início, perfil, editor, ranking e
apresentações de batalha. As tropas em combate mantêm seu renderizador próprio.
No editor, as setas giram 45 graus e Frente restaura a vista inicial. A câmera
não faz parte do avatar salvo. Cores, acessórios e molduras continuam compatíveis
com as 108 combinações e com contas existentes.

Retratos pequenos usam menos polígonos. Geometria e projeção são memorizadas;
não há loop de animação nem atualização quando o retrato está estático.

Dependência instalada com `npx expo install react-native-svg`, conforme
[documentação Expo](https://docs.expo.dev/versions/latest/sdk/svg/).
O JavaScript passou de aproximadamente 808 KB para 871 KB. O orçamento passou
de 850 para 900 KB para acomodar o renderizador; o limite total permanece 2,5 MB
e apenas uma fonte. Não há texturas adicionais.

Validação: `npm run test:character-mesh` cobre 108 combinações, oito ângulos,
coordenadas finitas, profundidade e faces. `npm run test:character` verifica
rotação real, restauração da câmera, seleção, falha e recuperação de salvamento.
Capturas em `work/personagem-3d-frente.png` e `work/personagem-3d-costas.png`.
Validação nativa em aparelho Android/iOS físico ainda não executada.
