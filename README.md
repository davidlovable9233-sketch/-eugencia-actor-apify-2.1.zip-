# Eugência — Actor Luna + Manus 2.1

Adaptação do pacote 2.0 para a Apify. Este diretório é o código-fonte de um Actor; não é um Actor já criado na sua conta. Precisa fazer build e testar na nuvem. A versão 2.0 anterior continua preservada.

## O que contém

- .actor/actor.json, Dockerfile e input_schema.json: definição e formulário com duas caixas de segredo (isSecret).
- src/main.js: entrada da Apify, descriptografia do input pelo SDK, saída em OUTPUT.
- src/core.js: GPT-5.6 Luna (gpt-5.6-luna) prepara o código; Manus Lite executa; admissão por orçamento e fila.
- src/cloud.js: estado em Key-Value Store nomeado por Actor e exclusão mútua via uma Request Queue nomeada por Actor.
- examples/eugencia-backend.js: ponte server-side para iniciar execução e ler resultado por API Apify.
- examples/*.json: exemplos do fluxo e teste de simulação.
- src/*.test.js: testes offline sem consumo dos provedores.

## Criar na sua conta (computador / terminal)

1. Extraia o ZIP, incluindo a pasta .actor, e abra um terminal no diretório em que estão package.json e .actor.
2. Com Node.js 22+ instalado: `npx apify-cli login`.
3. Execute `npx apify-cli push`. O CLI cria ou atualiza eugencia-manus-orchestrator e inicia o build. Confira se esse nome já existe antes de publicar, para evitar atualizar outro projeto.
4. Mantenha o Actor privado; não é necessário publicar na loja. Após build bem-sucedido, copie o ID do Actor para a Eugência.
5. Configure timeout de execução do Actor em 240 segundos e memória de 256 MB inicialmente; ajuste somente se necessário. Não ative execução periódica nem ressurreição/reinício automático. Cada run faz uma operação e termina.
6. Em Input, há campos secretos OpenAI e Manus. Para integração usando apenas o token Apify, prefira configurar OPENAI_API_KEY e MANUS_API_KEY como variáveis secretas do Actor (ambiente Runtime). Assim o backend da Eugência envia apenas o pedido. Os campos de Input servem como alternativa por chamada e são processados pelo SDK.
7. Execute action=status primeiro, sem chaves. Deve produzir OUTPUT com fila vazia e modelo gpt-5.6-luna.

Também é possível criar um Actor com fonte Git repository, usando estes mesmos arquivos na raiz do repositório, e iniciar o Build no Console. ZIP é o pacote de transporte do código; o CLI pode enviar arquivos individualmente ao IDE da Apify.

## Integrar ao menu Construtor de Sites

Configure APIFY_API_TOKEN e EUGENCIA_ORCHESTRATOR_ACTOR_ID no backend da Eugência. O segundo deve ser o ID real, não nome de exibição. Use examples/eugencia-backend.js como ponto de integração. Requer adaptar ao backend real e às sessões já existentes; esse repositório não foi modificado nesta tarefa.
O navegador chama seu backend autenticado, que valida administrador e só então chama a Apify. Não exponha token Apify nem chaves dos provedores ao navegador. Registre os runIds por usuário/administrador no banco existente e valide essa associação antes de ler resultados. Este Actor usa uma fila administrativa global por Actor, não isolamento multiempresa.
As caixas com indicação de segredo ficam disponíveis no formulário Input da Apify. As caixas da tela da Eugência precisam ser integradas ao gerenciador de segredos usado pelo backend; este pacote não simula esse cadastro com localStorage nem envia segredos em texto público. Não é necessário instalar o servidor FastAPI da versão anterior para usar este Actor.
Skills adicionais podem ser enviadas em knowledge como texto já extraído pelo backend da Eugência. Não há upload/descompactação de ZIP em runtime no Actor; o ZIP instala o código-fonte na publicação. O upload de skills dentro da Eugência é uma funcionalidade do painel, não uma instalação automática de Actor.

## Fluxo

- generate + requestId único + prompt (+ knowledge opcional): chama Luna e coloca pacote na fila. Não inicia Manus. Essa ação pode gerar custo OpenAI.
- enqueue + requestId único + execution: coloca código previamente preparado na fila sem chamar Luna.
- status: retorna a fila e os pacotes para revisão.
- dispatch + cycle + dailyAvailable + cycleAvailable: simula por padrão; live=true inicia uma tarefa Manus. Revise o pacote antes de usar live=true.
- sync: consulta tarefa ativa e atualiza crédito/estado; execute novamente quando necessário. Não espera em loop.
A geração e o envio são chamadas separadas, para revisão e economia. Não há envio automático em segundo plano, agenda ou processo de polling ativo criado por este pacote.

## Histórico e concorrência

Key-Value Store: eugencia-IDDOACTOR-state; Request Queue: eugencia-IDDOACTOR-mutex. Não os apague nem edite durante o uso. Não adicione outras requisições à fila mutex. Duplicar o Actor cria histórico independente; use sempre o mesmo Actor para o orçamento da mesma conta.
Cada run tenta adquirir a única requisição da fila por 300s; se ocupada, retorna busy. Mutações encerram antes de 210s; chamadas externas têm timeout de 120s e chamadas de armazenamento 15s. O estado sending/generating é persistido antes da chamada paga. Falha/timeout deixa estado unknown, sending ou generating, bloqueando novos envios. Não há retry automático de chamadas de geração/criação.
Para reconciliar um envio incerto, verifique o painel Manus e ajuste administrativamente o registro STATE na Apify com o taskId real e state=active, mantendo execution, day e cycle; então rode sync. Geração incerta exige conferir OpenAI e repor o pacote ou marcar a ocorrência revisada. Não simplesmente exclua o histórico ou troque requestId para ignorar bloqueio.
Histórico limitado a 1000 pedidos. Arquivamento requer intervenção administrativa preservando totais. Sem endpoints públicos de limpeza.

## Orçamento e limites

30 créditos é meta, com reserva de admissão de outros 30. 300 por dia UTC e 1500 por ciclo são limites operacionais para admissão de novas tarefas, não um teto rígido de gasto por tarefa. O saldo real é informado pelo operador, incluindo uso fora do Actor. O ciclo é o mostrado pela conta Manus, não mês civil presumido. Tarefas que atravessam meia-noite são registradas no dia do início; confira saldo novamente antes do próximo envio.
Não há cancelamento de tarefa Manus implementado. O custo pode superar meta/reserva antes de ser contabilizado. Ausência de custo confirmado ou trabalhos em background mantêm o bloqueio. A elegibilidade dos créditos gratuitos da conta Manus ainda deve ser verificada no uso real. Uso da Apify e da OpenAI tem cobrança própria; não foi ativada nenhuma execução ou assinatura.
Resultados de arquivos são entregues pelo Manus na tarefa; este Actor retorna o link/ID e não baixa arquivos automaticamente.

## Verificação e estado de entrega

`npm test` roda testes offline. Código preparado para build; não houve instalação de dependências/build Docker nem execução na nuvem nesta sessão. Testes não comprovam integração ao vivo. Não há chaves reais no pacote. Publicação e integração à Eugência continuam pendentes porque as ferramentas disponíveis nesta sessão não oferecem criação/upload de Actor.

Documentação consultada em 17/10/2026:
https://docs.apify.com/actors/development/deployment
https://docs.apify.com/api/client/js/reference/class/RequestQueueClient
https://docs.apify.com/actors/development/actor-definition/input-schema/specification/v1
https://developers.openai.com/api/docs/models/gpt-5.6-luna
https://open.manus.im/docs/v2/task.create
https://open.manus.im/docs/v2/task.detail
