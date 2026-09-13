# Duelou — produto, regras e evolução

> Registro histórico: regras de progressão, ranking, jogos e desempate deste documento foram substituídas em 12/09/2026. Consulte [Evolução competitiva](EVOLUCAO-COMPETITIVA.md) para o funcionamento atual.

Data: 09/09/2026. Documento de trabalho; hipóteses precisam de teste com jogadores.
Estado: release candidate local para beta. Não é binário assinado nem serviço público.

## Objetivo e público de teste

Desafios rápidos entre amigos, sem câmera obrigatória. Primeiro piloto fechado com adultos convidados. Valor central: jogar, comparar e pedir revanche. A câmera só entra quando melhorar diversão e retenção em teste; não é requisito para o núcleo funcionar.

## O que está implementado

- Jogador convidado com apelido; token aleatório, hash no banco e SecureStore no app nativo.
- Código de recuperação exibido uma vez, rotação de sessão, expiração em 180 dias e revogação ao sair.
- Três jogos, três dificuldades, configuração versionada gerada pelo servidor.
- Histórico, XP, moedas, nível e sequência calculados a partir das partidas persistidas.
- Duelo privado por código compartilhável, duas vagas, 24h de validade, uma conclusão por jogador.
- Ranking dos últimos sete dias pela soma dos melhores resultados por jogo/dificuldade.
- Exclusão de conta e de duelos criados por ela; erros e repetição de envio sem duplicar recompensa.
- API local, SQLite, consultas parametrizadas, limite de corpo e de frequência de requisições.
- Interromper partida ao app ir para segundo plano; bloqueio de duplo envio no cliente.
- Desafio diário determinístico com uma tentativa por dia e seis conquistas derivadas, sem dados fictícios.

## Regras V1

Pontuação de cada modalidade: 0 a 1000. Não comparar tempo bruto entre dificuldades.

| Jogo       | Iniciante                                  | Desafio                             | Mestre                             |
| ---------- | ------------------------------------------ | ----------------------------------- | ---------------------------------- |
| Cronômetro | relógio sempre visível; tolerância 2000 ms | some em 3000 ms; tolerância 1200 ms | some em 1000 ms; tolerância 700 ms |
| Reflexo    | 1 rodada                                   | 3 rodadas; mediana                  | 5 rodadas; mediana                 |
| Memória    | 4 blocos; 550 ms por flash                 | 5 blocos; 400 ms                    | 6 blocos; 280 ms                   |

Cronômetro: alvo 5000 ms; pontos = máximo entre 0 e arredondar(1000 × (1 − erro absoluto / tolerância)). Medida pelo relógio monotônico do aparelho no toque final, não pelo último frame mostrado.

Reflexo: espera aleatória de 1800–4300 ms por rodada; largada antecipada encerra com zero. Reação inferior a 100 ms é rejeitada como inválida; de 100 a 5000 ms é aceita. Pontos = limitar entre 0 e 1000 o arredondamento de 1000 × (1000 − mediana das reações) / 850. Dificuldades exigem consistência em 1, 3 ou 5 rodadas. Próxima versão: sinais falsos no avançado e calibração da fórmula com dados reais.

Memória: pausa de 250 ms entre flashes; blocos numerados para não depender só de cor; acertos consecutivos até o primeiro erro / tamanho da sequência × 1000. O servidor escolhe a sequência. Em duelo ela é igual para ambos. Novas tentativas solo recebem outra sequência.

Partida expira cinco minutos após criação. Uma tentativa iniciada pode ser retomada até o prazo; uma tentativa concluída em duelo não pode ser repetida. Isso é aceitável para alpha casual, mas permite ensaiar uma sequência após abandonar: para competição, persistir eventos de início e invalidar abandono sem reenviar sequência.

## Progressão e economia

- Todos começam no nível 1 com zero XP e moedas. Não há vitórias ou conquistas inventadas.
- Passar do nível L para L+1 custa 100 × L XP. Nível 2: 100 XP acumulados; 3: 300; 4: 600; 5: 1000.
- Nas primeiras 30 conclusões do dia UTC: se pontos > 0, XP = 10 + piso(pontos/100) + 5 × (dificuldade−1). Moedas = piso(XP/5).
- Pontuação zero não recompensa. Depois de 30 partidas, treino e ranking continuam; XP/moedas não.
- Contagem diária e sequência usam UTC de forma consistente. Evolução: data local definida pelo servidor, sem permitir trocar fuso para ganhar duas recompensas.
- Moedas não são dinheiro; não há saque, compra, prêmio nem loja.
- Reenvio retorna o resultado original. Saldo deriva do histórico; futuro comércio exige livro de transações separado, com estorno e idempotência.
- Limite diário é hipótese contra farming, não um número validado.

## Duelo e ranking

Criado → compartilhado → segundo jogador entra → cada um conclui → comparação, vitória ou empate.
A lista é atualizada manualmente. Notificações e atualização em tempo real ainda não existem.
Prazo encerra entrada/início; partida já iniciada tem seu próprio prazo de cinco minutos.
Desempate do ranking: cadastro mais antigo. Empate em duelo é empate; nada de critério oculto.
Ranking não é só volume de partidas: conta o melhor resultado em cada uma das nove combinações.
Melhoria prevista: ranking semanal fixo por temporada, filtros por dificuldade, percentis somente com amostra real.
Excluir anfitrião remove o duelo e as partidas desse duelo, inclusive a do convidado. Antes de produção: anonimizar autoria e preservar histórico esportivo do adversário mediante política definida.

## Conteúdo: plano sem fábrica infinita de fases

1. Estabilizar os três modos: feedback, tutorial contextual, áudio opcional e animações.
2. Criar 20 configurações testadas por modalidade; quantidade só sobe se houver diferença de experiência.
3. Desafio diário com configuração fixa por data e uma tentativa: implementado. Ranking diário próprio fica para uma iteração orientada por uso.
4. Missões sem obrigação de compartilhar: concluir dois modos; melhorar recorde; jogar uma revanche.
5. Conquistas derivadas: primeira conclusão; primeiro duelo concluído; sete dias; 1000 pontos.
6. Temporada experimental de 28 dias com cosméticos. Sem vantagem comprável.
7. Novo modo apenas quando jogadores voltarem aos existentes.

Cada novo modo precisa definir entradas, duração, regra de vitória, fórmula, acessibilidade, abandono, fraude, regra de duelo, testes e telemetria antes de entrar no catálogo.

## Câmera: proposta futura

Não Pisca deve ser experimento separado, com opt-in, calibração, duração limitada e detecção local.
Não guardar vídeo por padrão; nenhuma inferência de identidade ou diagnóstico.
Testar óculos, iluminação, posicionamento e aparelhos fracos. Se detecção incerta, invalidar sem punir.
Evitar incentivo a desconforto físico, flashes intensos e desafios perigosos.
Não Ri depende de uma definição observável de expressão, não de prometer detectar emoção.
Ranking de toque e câmera deve ser separado; alternativa acessível não é a mesma prova.

## Crescimento e receita — hipóteses

Primeiro canal: convites manuais de grupos pequenos, códigos por compartilhamento nativo.
Depois: links universais verificados, cartões de resultado, criadores com códigos de atribuição.
Não fingir usuários online, notificações ou percentis. Não ler contatos.
Receita a testar após retenção: cosméticos avulsos e salas de evento. Passe só se houver conteúdo e retorno suficientes.
Anúncio voluntário não deve dar vantagem em duelo ranqueado. Patrocínio é venda comercial, não receita garantida.
Não implementar marketplace, premiação ou assinatura antes de validar compra e suporte.

Modelo financeiro para preencher com dados:
Receita = compradores × tíquete líquido + patrocínios contratados.
Margem = receita − taxas − impostos − hospedagem − suporte − conteúdo − aquisição.
Custo por jogador adquirido deve ficar abaixo da margem observada por coorte; não projetar LTV infinito.
Os cenários financeiros anteriores da conversa não são previsão nem orçamento aprovado.

## Medição e critérios de decisão

Ainda falta coleta de eventos de produto. Adicionar: onboarding_completed, match_started, match_finished, match_failed, duel_created, share_opened, duel_joined, duel_completed.
Abrir compartilhamento não prova envio; join é a conversão verificável. Evitar token, nome e payload facial na telemetria.
Métrica principal: duelos com dois resultados por semana. Apoio: primeira partida concluída, segunda sessão, D1/D7, conversão convite→entrada→conclusão, falhas por aparelho.
Piloto: 30–50 adultos; depois 200 jogadores por pelo menos duas semanas.
Metas internas iniciais, não benchmarks: ≥60% concluem primeira partida; ≥20% voltam no dia seguinte; ≥10% voltam no dia 7; ≥20% dos criadores conseguem um duelo completo.
Investigar por coorte/canal; amostra pequena não justifica expansão. Se ninguém convida sem lembrete, revisar o valor social.

## Arquitetura e evolução

App → API /v1 → regras versionadas → banco.
SQLite com WAL serve ao alpha de uma instância. Antes de várias instâncias: Postgres, migrations formais e transações equivalentes.
Separar autenticação, partidas, duelos, ranking e economia conforme crescerem. Não começar com microsserviços.
Toda partida conserva configuração V1. Mudança de regra exige nova versão; nunca reinterpretar resultado histórico.
Autenticação atual: conta por código secreto recuperável, um token ativo por jogador, rotação, revogação e expiração em 180 dias. Evolução opcional: login por e-mail/Apple/Google e múltiplas sessões gerenciáveis.
Transações protegem conclusão/recompensa; futuro worker processa notificações idempotentemente.
Fila de mídia e moderação apenas se conteúdo enviado por usuários for aprovado como produto.

## Critérios para chamar de pronto

Alpha local: testes de API + tipos + build + teste de navegação e partida. Conferir dois clientes reais.
Beta fechado: HTTPS público, contas recuperáveis, backup/restauração, alertas, erros monitorados, build Android/iOS assinado, revisão de dependências.
Release: teste em aparelhos físicos, acessibilidade, política de privacidade/termos/retenção aprovados, classificação etária, exclusão/exportação, suporte, requisitos das lojas e rollback.
Produção com dinheiro: antifraude proporcional, pagamentos e webhooks idempotentes, estornos e conciliação.
Nada disso é marcado concluído apenas porque existe uma tela ou documentação.

## Pendências ordenadas

P0: acesso pelo celular/HTTPS, atualizar Node local para 22.13+, acompanhar alertas transitivos do toolchain, teste físico Android/iOS, backup/restauração, monitoramento e revisão jurídica/privacidade.
P1: notificações opcionais, link que abre duelo, atualização automática, acessibilidade validada e retomada robusta.
P2: ranking diário, conteúdo adicional, missões e cosméticos.
P3: câmera, temporadas pagas, criadores e patrocínios, sempre condicionados aos testes.

## Referências técnicas consultadas

- Expo SDK: https://docs.expo.dev/versions/latest/ — SDK 57 usa React Native 0.86 e target Android API 36.
- Upgrade Expo: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ — dependências alinhadas com `expo install --fix`.
- Google Play target API: https://support.google.com/googleplay/android-developer/answer/11926878 — novos apps precisam mirar API 36 desde 31/08/2026.
- SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/ — sessão local nativa; não garante recuperação após reinstalação.
- Node 22.12 SQLite: https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html — API experimental usada no alpha.
