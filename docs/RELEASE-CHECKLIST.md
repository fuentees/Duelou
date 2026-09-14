# Checklist de publicação

Atualização local: 13/09/2026. Consulte [PILOTO-E-DISPOSITIVOS.md](PILOTO-E-DISPOSITIVOS.md) para o roteiro de validação externa.

Legenda: [x] concluído no repositório; [ ] exige execução, escolha ou conta externa.

## Produto

- [x] Apresentação de batalha, prontidão entre provas MD3, destaque do vencedor e personagem cosmético salvo na conta.

- [x] Nove jogos, campanha de 30 fases, seis capítulos, treino livre e metas por modalidade.
- [x] Campanha com sincronização opcional, desafio diário solo, salas casuais, convites e fila competitiva 1×1 MD3.
- [x] Reconexão, continuação, revanche e histórico permanente. Pontuação igual é empate.
- [x] Resultado idempotente e calculado no servidor.
- [x] Conta recuperável por código e exclusão no app.
- [ ] Teste moderado com 30–50 adultos e ajuste por dados.
- [x] Testes web de 320 px, texto 200%, foco/teclado, alvos de toque e movimento reduzido.
- [ ] Validação humana com leitores de tela nativos, daltonismo e fontes do sistema.
- [ ] Teste físico em aparelhos Android fraco/médio/forte e iPhones suportados.

## Infraestrutura

- [x] Dockerfile com módulos atuais e healthcheck que consulta o banco.
- [ ] Executar a imagem real; Docker não disponível na máquina de validação.
- [x] Banco persistente para uma instância e testes de reabertura.
- Registro de entrega anterior: API em `duelou-api.fly.dev`. Disponibilidade e versão em produção não foram revalidadas nesta revisão.
- [x] Script de backup cifrado (AES-256-GCM) e restauração, com roundtrip testado localmente.
- Configuração existente: volume `duelou_data`, montado em `/data`. Capacidade, criptografia e snapshots do provedor precisam de verificação operacional atual.
- [ ] Domínio próprio (hoje usa o subdomínio `fly.dev` padrão).
- [ ] Ensaio de restauração do backup cifrado próprio em ambiente isolado real (só o snapshot automático da Fly foi validado por padrão da plataforma).
- [x] Backup periódico em worker, retenção, restauração sem sobrescrita e recuperação de falha testados localmente.
- [ ] Ativar com chave no ambiente de produção, cópia externa e política para suspensão da máquina.
- [x] Contadores agregados da API e probe de disponibilidade/idade do backup.
- [ ] Conectar probe e eventos a monitor externo e canal operacional real.
- [ ] Segredos no provedor; ambiente de staging separado.
- [ ] Postgres antes de múltiplas instâncias.

## Segurança e privacidade

- [x] Tokens e recuperação armazenados como hash.
- [x] Limites por conta autenticada; cotas anônimas separadas e Retry-After.
- [x] Sem câmera, microfone ou contatos na versão 1.
- [ ] Resolver alertas do npm audit por atualização compatível do Expo.
- [x] Expiração, rotação e revogação de sessões.
- [ ] Teste dedicado de abuso/antifraude em dispositivos reais.
- [ ] Política e termos com dados da empresa e revisão jurídica.
- [ ] Processo de exportação, suporte e atendimento de titulares.
- [ ] Definir idade mínima e controles adequados.

## Lojas

- [x] Identificadores, esquema, versão, ícone, splash e perfis EAS.
- [x] Projeto configurado com Expo SDK 57 e Android API 36.
- [ ] Confirmar requisitos vigentes das lojas na data de submissão.
- [x] Texto inicial de listagem e plano de capturas.
- [ ] Reservar nome e confirmar direitos sobre “Duelou”.
- [ ] Substituir usuário Expo, projectId, URL da API e contatos.
- [ ] Criar contas Apple Developer e Google Play Console.
- [ ] Assinar e testar APK/AAB/TestFlight.
- [ ] Preencher privacidade, segurança de dados e classificação etária.
- [ ] Publicar URLs de privacidade e suporte.
- [ ] Enviar para revisão e responder exigências.

## Go/no-go

Liberar para beta somente quando HTTPS, recuperação, backup, alertas, teste físico e documentos finais estiverem prontos.
Liberar publicamente somente com métricas do piloto, suporte operacional e revisão das lojas concluídos.
