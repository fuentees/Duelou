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

- Nove jogos com campanha solo de 30 fases, seis capítulos, estrelas, recordes e exemplos. Progresso local com sincronização opcional, independente da classificação.
- Treino livre em qualquer nível e treino durante a busca competitiva.
- Fila competitiva 1×1 MD3, rotação entre três jogos de raciocínio, classificação Elo e patente; atualização por série, sem desempate pela conexão.
- Respostas competitivas validadas por etapa no servidor, com combo, retomada e proteção contra repetição de resultados.
- Salas casuais públicas e privadas para 2, 4 e 6 pessoas nos nove jogos, convite direto e revanche. Não alteram classificação competitiva.
- Após a partida, Continuar avança um nível nas salas casuais (até 30) e permite ao grupo aceitar o mesmo convite; Revanche mantém o nível. No PvP competitivo, Continuar retorna à fila oficial sem precisar sair para o menu.
- Desafio diário solo, recorde local por dia e objetivos semanais opcionais.
- Conta convidada, recuperação, sessão persistente, exclusão, XP, conquistas e estatísticas online.
- Métricas internas agregadas, com eventos sem nomes/segredos/respostas e retenção de 90 dias.

As regras atuais estão em [Evolução competitiva](docs/EVOLUCAO-COMPETITIVA.md). A versão local precisa ser implantada junto com sua API para disponibilizar as novas funcionalidades fora desta máquina.

## Verificar

`npm run test:api` e `npm run typecheck`.
Com API e web em execução: `npm run test:ui`, `npm run test:arcade` `npm run test:md3` e `npm run test:competitive` (Microsoft Edge instalado).
`npm run test:account` verifica Menu, cadastro, recuperação e exclusão de conta pelo navegador usando um banco temporário em memória. Requer a prévia web em execução.
`npm run test:a11y` verifica layout e controles acessíveis na web; `npm run test:resilience` simula CPU lenta, latência e perda de resposta.
`npm run build:web` gera o build de prévia; `npm run check:bundle` evita regressão de tamanho e fontes.
`npm run ops:check` verifica disponibilidade e, opcionalmente, backup recente.

## Estado da entrega

Testes de API, tipos, bundle web e jornada de interface realizados localmente. Não publicado nas lojas nem testado em aparelho físico.
Uma entrega anterior registrou API em `duelou-api.fly.dev`; o ambiente externo não foi revalidado nem atualizado nesta revisão. Sem monetização, câmera ou push. Domínio próprio, dados jurídicos, contas de loja, build assinado e testes físicos continuam sendo etapas externas obrigatórias. O SDK 57 mira Android API 36; o audit mantém 10 alertas moderados transitivos no toolchain Expo sem correção compatível automática.

[Plano de produto, níveis e evolução](docs/PLANO-PRODUTO.md) · [Operação, API e pendências](docs/OPERACAO.md).

---

Desenvolvido por Roctiv Tecnologia Ltda · © 2026 ROCTIV
