# Checklist de publicação

Legenda: [x] concluído no repositório; [ ] exige execução, escolha ou conta externa.

## Produto

- [x] Seis modalidades entre Arcade e clássicas, todas com três níveis documentados.
- [x] Offline, salas públicas 1×1/grupo, privadas, solo, desafio diário, duelo, rankings, níveis e conquistas.
- [x] Reconexão de sala, revanche, estatísticas permanentes e desempate por tempo.
- [x] Resultado idempotente e calculado no servidor.
- [x] Conta recuperável por código e exclusão no app.
- [ ] Teste moderado com 30–50 adultos e ajuste por dados.
- [ ] Testes de acessibilidade com leitor de tela, daltonismo, fontes grandes e movimento reduzido.
- [ ] Teste físico em aparelhos Android fraco/médio/forte e iPhones suportados.

## Infraestrutura

- [x] Container da API e healthcheck.
- [x] Banco persistente para uma instância e testes de reabertura.
- [x] API pública HTTPS no ar: https://duelou-api.fly.dev (Fly.io, `gru`). `/health` e criação de conta testados de ponta a ponta (app real, não só curl).
- [x] Script de backup cifrado (AES-256-GCM) e restauração, com roundtrip testado localmente.
- [x] Volume persistente em produção (`duelou_data`, 1GB, criptografado, snapshots automáticos com retenção de 5 pela própria Fly).
- [ ] Domínio próprio (hoje usa o subdomínio `fly.dev` padrão).
- [ ] Ensaio de restauração do backup cifrado próprio em ambiente isolado real (só o snapshot automático da Fly foi validado por padrão da plataforma).
- [ ] Agendamento periódico do `npm run db:backup` em produção (hoje é manual).
- [ ] Monitoramento de disponibilidade, erros e capacidade.
- [ ] Segredos no provedor; ambiente de staging separado.
- [ ] Postgres antes de múltiplas instâncias.

## Segurança e privacidade

- [x] Tokens e recuperação armazenados como hash.
- [x] Limites básicos de corpo, frequência e origem.
- [x] Sem câmera, microfone ou contatos na versão 1.
- [ ] Resolver alertas do npm audit por atualização compatível do Expo.
- [x] Expiração, rotação e revogação de sessões.
- [ ] Teste dedicado de abuso/antifraude em dispositivos reais.
- [ ] Política e termos com dados da empresa e revisão jurídica.
- [ ] Processo de exportação, suporte e atendimento de titulares.
- [ ] Definir idade mínima e controles adequados.

## Lojas

- [x] Identificadores, esquema, versão, ícone, splash e perfis EAS.
- [x] Expo SDK 57 e target Android API 36 compatível com a exigência vigente.
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
