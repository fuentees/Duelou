# Duelou

Release candidate de aplicativo mobile Expo/React Native com API Node e banco SQLite persistente.

## Executar localmente

1. Extraia o projeto em uma pasta com nome válido no Windows, como duelou-app (evite con).
2. Com Node 22.13+, execute `npm ci`.
3. Execute `npm run api`.
4. Em outro terminal, execute `npm run web:8083`.
5. Abra http://localhost:8083.

Para celular: veja [operação e rede](docs/OPERACAO.md). Expo e API precisam estar acessíveis pelo aparelho; publicar um túnel Expo sozinho não publica o backend.

## Implementado

- Salas públicas, pareamento automático por jogo/nível e salas privadas de 2, 4 ou 6 jogadores, no formato melhor de 1 ou melhor de 3 provas.
- Cinco jogos Arcade (incluindo Sequência lógica e Cor certa) com progressão de 1 a 20 níveis (extensível), que sobe sozinha ao concluir a fase atual com boa pontuação — sem escolha manual de dificuldade. Também jogáveis offline sem conta, com progresso salvo no aparelho.
- Largada e placar de grupo sincronizados pelo servidor, reconexão automática, desempate por tempo, revanche, ranking Arcade e estatísticas pessoais permanentes. [Detalhes dos níveis e salas](docs/SALAS-E-NIVEIS.md).

- Jogador convidado e sessão salva no aparelho.
- Cronômetro, reflexo e memória com três dificuldades.
- Pontos calculados no servidor, XP, nível, moedas, sequência e histórico persistidos.
- Duelo por código compartilhável com dois jogadores.
- Desafio diário determinístico, uma tentativa por conta e oito conquistas derivadas do histórico, incluindo duas ligadas ao desempenho no Arcade.
- Aparência renovada: gradientes, cores por jogo, patente (Bronze a Lendário) por nível e animações de placar/progresso.
- Recuperação por código, rotação/expiração de sessão e saída com revogação do token.
- Ranking real dos melhores resultados dos últimos sete dias.
- Exclusão de conta, limites de requisição e resultados idempotentes.

## Verificar

`npm run test:api` e `npm run typecheck`.
Com API e web em execução: `npm run test:ui`, `npm run test:arcade` e `npm run test:md3` (Microsoft Edge instalado).
`npm run build:web` gera o build de prévia.

## Estado da entrega

Testes de API, tipos, bundle web e jornada de interface realizados localmente. Não publicado nas lojas nem testado em aparelho físico.
API pública no ar em https://duelou-api.fly.dev (Fly.io, volume persistente, testada de ponta a ponta com o app real). Sem monetização, câmera ou push. Domínio próprio, dados jurídicos, contas de loja, build assinado e testes físicos continuam sendo etapas externas obrigatórias. O SDK 57 mira Android API 36; o audit mantém 10 alertas moderados transitivos no toolchain Expo sem correção compatível automática.

[Plano de produto, níveis e evolução](docs/PLANO-PRODUTO.md) · [Operação, API e pendências](docs/OPERACAO.md).
