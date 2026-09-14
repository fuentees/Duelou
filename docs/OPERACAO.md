# Executar e operar o Duelou

Estado do repositório em 13/09/2026. Esta revisão não publicou alterações nem verificou o estado atual do servidor externo.

## Desenvolvimento

Node 22.13+ e npm. Execute `npm ci`, `npm run api` e, em outro terminal, `npm run web:8083`. API local: http://127.0.0.1:3001. Web: http://localhost:8083. Banco padrão: `data/duelou.sqlite`.

`HOST=0.0.0.0` permite acesso pela LAN; o cliente precisa de `EXPO_PUBLIC_API_URL` com o endereço alcançável. `ALLOWED_ORIGINS` aceita origens web exatas, separadas por vírgulas. Não coloque segredos em variáveis EXPO_PUBLIC.

## API e persistência

- POST /v1/guests cria conta e código de recuperação; POST /v1/sessions/recover troca a sessão.
- GET /v1/me fornece perfil; DELETE /v1/session sai; DELETE /v1/me exclui a conta.
- POST /v1/avatar salva opções cosméticas validadas; o perfil e os membros da sala retornam o personagem.
- POST /v1/rooms/:code/ready confirma prontidão no intervalo do MD3 com o gameIndex atual.
- GET /v1/history retorna 30 provas detalhadas; `?before=cursor` busca a página anterior. O histórico individual permanece após a limpeza de salas, enquanto a conta existir.
- GET/POST /v1/campaign/:mode consulta/une progresso solo da conta autenticada. A sincronização é opcional e não concede XP, moedas ou classificação.
- /v1/rooms contém salas casuais, continuação, revanche, fila competitiva, rodadas, presença e classificação. Competitivo e casual têm regras separadas.
- GET /health consulta o banco e retorna disponibilidade e estado resumido do backup; falha de banco retorna 503. Não expõe caminhos, chaves, nomes nem respostas.

SQLite opera em uma instância. Configurações do Docker copiam os módulos de servidor e regras compartilhadas. Não há Docker disponível neste ambiente de validação; testar a imagem antes de publicar. A migração preserva campanhas e histórico. Não recrie o banco para atualizar versões.

## Limites e diagnóstico

Cada conta autenticada dispõe de 240 requisições por minuto. Contas na mesma rede não dividem essa cota. Criação/recuperação têm 15 solicitações por rota/IP/minuto; requisições anônimas têm 60 e healthcheck 120. Respostas 429 incluem Retry-After. A chave da conta é obtida por autenticação, não pelo texto do token. Cabeçalhos Forwarded/X-Forwarded-For são ignorados; nunca habilite confiança irrestrita nesses cabeçalhos.

Os limites ficam na memória, com número máximo de chaves. São adequados à instância única atual; antes de escalar horizontalmente, mover limites e persistência para serviços compartilhados. Tentativas anônimas atrás de um proxy ainda compartilham sua cota; mapear proxies confiáveis antes de uma abertura pública de grande escala.

A API emite `api_window` a cada minuto com contagens agregadas de solicitações, erros 5xx, limites 429 e respostas acima de 1 segundo. Erros inesperados emitem `request_failed`, sem imprimir a requisição. Não registrar tokens, recuperação, nomes ou respostas em logs.

## Backup automático e restauração

Configure `BACKUP_ENCRYPTION_KEY` no gerenciador de segredos do ambiente: 32 bytes em hexadecimal, guardados fora do banco e fora do repositório. Sem a chave, backups automáticos ficam explicitamente desativados. Se houver configuração parcial inválida, a API não inicia silenciosamente sem backup.

Com a chave configurada, a API executa um backup ao iniciar e a cada 360 minutos. `BACKUP_INTERVAL_MINUTES` aceita 5 a 10080. `BACKUP_KEEP` é 14 por padrão (1 a 365 cópias). `BACKUP_DIR` é `backups/` localmente e `/data/backups` no container. Ajustar capacidade do volume e retenção para o tamanho real da base.

O worker separado evita bloquear as requisições enquanto faz VACUUM INTO, verificação SQLite e cifra AES-256-GCM. Não inicia outro backup enquanto um estiver em curso. Emite `backup_ok` ou `backup_failed`; novas execuções tentam recuperar falhas. A API continua disponível quando só o backup falha. O healthcheck inclui lastSuccess, lastAttempt, intervalo e estado do backup.

`npm run db:backup` executa uma cópia manual com as mesmas regras. `npm run db:restore -- arquivo.sqlite.enc destino-novo.sqlite` autentica a cifra, recusa sobrescrever arquivos existentes e verifica a integridade SQLite. Testes locais cobrem WAL ativo, chave errada, corrupção, retenção e destino existente. Os snapshots temporários têm permissões restritas e são removidos no encerramento normal, inclusive após erro; uma interrupção forçada do processo pode deixar um snapshot, que deve ser removido durante recuperação operacional.

O diretório de backup no mesmo volume protege contra erros lógicos, mas não contra perda do volume. Antes de produção, configurar cópia cifrada para armazenamento independente, guardar a chave com recuperação controlada e ensaiar restauração nesse ambiente. Esta revisão não acessou nem configurou contas de armazenamento externas.

O temporizador só executa enquanto a máquina estiver ligada. O fly.toml atual permite suspensão por ociosidade; para horários garantidos, usar máquina sempre ativa ou agendador externo. Não foi alterada essa política de custo ou disponibilidade.

## Monitoramento

`npm run ops:check` consulta a API local. Configure `HEALTH_URL` para o ambiente desejado e `REQUIRE_BACKUP=true` para também exigir uma cópia recente (intervalo configurado + 5 minutos). Retorna JSON, código 0 em sucesso e código 1 em falha, timeout ou backup atrasado. Pode ser chamado a cada minuto por um monitor externo.

Conectar código 1 e eventos backup_failed/request_failed ao canal operacional escolhido. Nenhuma mensagem, integração de alerta ou assinatura externa foi criada nesta revisão. O monitor deve funcionar fora da máquina da API para detectar perda total do host.

## Métricas e piloto

`npm run metrics -- caminho/banco.sqlite` abre a base somente para leitura. Agrega sete dias de notas, empates, provas perfeitas, duração observada no servidor, fila, respostas e estados de término. `time_limit` não prova desistência: pode incluir rede ou dificuldade. `npm run integrity:report -- caminho/banco.sqlite` lista sinais para revisão humana, sem sanção automática.

Eventos, observações e sinais têm retenção operacional de 90 dias. O histórico da conta é permanente enquanto ela existir. Não há telemetria de campanha offline nem evidência de retenção de jogadores reais nesta entrega. Protocolo e formulário: [PILOTO-E-DISPOSITIVOS.md](PILOTO-E-DISPOSITIVOS.md).

## Validação antes da publicação

Executar `npm run typecheck`, `npm run test:api`, `npm run test:ui`, `npm run test:a11y`, `npm run test:resilience`, `npm run test:sync`, `npm run test:account`, `npm run test:md3`, `npm run test:container`, `npm run build:web` e `npm run check:bundle`.

Depois: validar o container, rodar em Android/iOS físicos, ativar backup/monitoramento com segredos e destinos reais, testar restauração externa e publicar em staging antes da atualização de produção. Nenhum desses resultados externos é presumido a partir dos testes locais.
