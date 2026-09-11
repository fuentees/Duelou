# Validação da release candidate 1.2.0

Data: 10/09/2026.

## Resultado técnico

- `npm run test:api`: 5 testes aprovados. Cobertura de regras clássicas, nove combinações Arcade, progressão 8/10/12 rodadas, pareamento 1×1, restauração e saída de sala, rankings, autorização, recuperação, duelos, idempotência, exclusão e persistência.
- `npm run typecheck`: aprovado com TypeScript 6.
- `npm run build:web`: bundle de produção gerado com Expo SDK 57.
- `npm run test:ui`: aprovado em viewport mobile; percorre cadastro, guarda código, cronômetro, memória, reflexo com três rodadas, persistência, ranking, recuperação e exclusão sem erros de página.
- `npm run test:arcade`: aprovado com três navegadores e API real; cobre Mestre offline, grupo, largada, placar, revanche, recarga/reconexão, ranking Arcade e sala pública 1×1 com início automático.
- `/health` e `/v1/health`: respostas públicas aprovadas.
- `expo-doctor`: 17 verificações locais aprovadas; a verificação remota do schema não completou por certificado autoassinado na rede desta máquina.
- `npm audit --omit=dev`: 10 alertas moderados transitivos em `uuid/xcode` dentro do toolchain Expo. `npm audit fix --force` propõe Expo 46 e não deve ser usado.

## Compatibilidade de loja verificada

O Google Play exige target Android API 36 para novos apps desde 31/08/2026. Expo SDK 57 usa target API 36; por isso a release foi atualizada do SDK 54 para o 57. Fontes: [requisito do Google Play](https://support.google.com/googleplay/android-developer/answer/11926878) e [matriz de versões do Expo](https://docs.expo.dev/versions/latest/).

Apple e Google exigem exclusão dentro do app para produtos que criam contas; o fluxo está implementado no Perfil e remove o jogador e os dados associados. A política pública, seus dados jurídicos e a URL de suporte ainda precisam ser fornecidos. Fontes: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple — Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) e [Google Play — Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).

## O que o repositório não pode concluir sozinho

Antes do beta externo: atualizar a máquina para Node 22.13+, definir domínio HTTPS e `EXPO_PUBLIC_API_URL`, provisionar volume/backup/monitoramento, substituir dados jurídicos, criar URLs públicas, vincular projeto/conta Expo, gerar builds assinados e testar em aparelhos reais. Antes da loja pública: contas Apple/Google, classificação etária, formulários de privacidade, capturas nativas finais e revisão jurídica.

Não classificar como “publicado” enquanto esses itens externos não forem concluídos.
