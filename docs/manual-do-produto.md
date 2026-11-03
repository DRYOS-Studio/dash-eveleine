# Manual do produto — o que cada indicador mede

Definição de cada número das três telas: o que entra na conta, o que fica de fora e onde
ele pode enganar. Escrito para quem **lê** a dash, não para quem a mantém — a parte
técnica está no [README](../README.md).

As contas descritas aqui saem de `src/lib/data.ts` (Captação), `src/lib/agenda.ts`
(Agenda) e `src/lib/vendas.ts` (Vendas). Se uma delas mudar, este arquivo mente até ser
corrigido junto.

---

## Como ler

As três telas contam coisas diferentes, e a diferença está em **qual data elas usam para
decidir o que entra no período**.

| | Captação | Agenda | Vendas |
| --- | --- | --- | --- |
| Conta | Respostas de formulário | Reuniões do Calendly | Vendas do board comercial |
| Data que filtra | Quando a pessoa **respondeu** o formulário | Quando a reunião **acontece** | Data da **compra** |
| Janelas | Hoje, Ontem, 7, 30, 90 dias, Tudo | Hoje, Amanhã, Próx. 7 dias, Últ. 7 dias, Este mês | Hoje, Ontem, 7, 30, 90 dias, Tudo |
| Olha para | Só para trás | Para trás **e para frente** | Só para trás |

Por isso a Agenda tem "Amanhã" e "Próximos 7 dias" e a Captação não: uma reunião pode estar
marcada para depois de hoje, uma resposta de formulário não pode ter sido enviada no futuro.

> **Um lead e a reunião dele podem cair em períodos diferentes.** Quem preencheu o
> formulário na segunda e marcou para a sexta aparece na Captação da segunda e na Agenda da
> sexta. Somar as telas para conferir não funciona. Vale também para a venda: ela cai no
> dia da compra, que pode ser semanas depois da resposta e da reunião (mediana de 6 a 7
> dias entre o primeiro contato e a compra em 2026-11-03).

As três usam horário de São Paulo, fixado em UTC−3 no código, sem horário de verão. Todas
aceitam intervalo personalizado (campos *De* e *até*), e em todas o dia final entra
inteiro.

**Os números podem estar atrasados.** Leads, vendas e no-shows lidos do banco ficam em cache:
passados 60 s, a dash mostra o último valor guardado e o atualiza em segundo plano. Quem abre
a tela depois de um tempo parada pode ver, na primeira vez, números de antes; recarregar
alguns segundos depois traz o atual. As reuniões do Calendly têm cache próprio — a listagem,
5 minutos —, então um agendamento muito recente também pode demorar a aparecer.

**Cada tela diz de quando são os números:** "Atualizado em 03/11 às 10:49 (há 2 min)". A hora é
a do momento em que o dado foi lido, não a de quando você abriu a tela. Quando o dado passou
do prazo da fonte, a linha acrescenta "recarregue para ver o mais recente". Na Agenda a hora é
a do dado **mais antigo** que entrou na conta (a listagem do Calendly ou a ligação reunião →
formulário); o no-show do CRM segue o cache de 60 s, mas não entra nessa hora.

---

## Captação — os quatro números do topo

O funil tem três estágios **mutuamente exclusivos**: cada resposta de formulário está em um
e só um deles.

| Indicador | O que conta | Conta exata |
| --- | --- | --- |
| Iniciaram o formulário | Toda resposta registrada, inclusive quem desistiu no meio | Total de linhas |
| Terminaram | Quem chegou ao fim, tendo agendado ou não | Total − abandonos |
| Agendaram call | Quem terminou **e** marcou a reunião | Status `scheduled` |
| Taxa de agendamento | Que fatia de quem entrou chegou a marcar | Agendaram ÷ **Iniciaram** |

Dois pontos que mudam a leitura:

1. **"Iniciaram" inclui quem abandonou.** Um formulário começado e largado no meio conta
   ali. É de propósito — sem isso o abandono some da conta e o funil parece mais saudável
   do que é.
2. **A taxa de agendamento usa "Iniciaram" como denominador, não "Terminaram".** Ela
   responde "de cada 100 pessoas que começaram, quantas marcaram?" — não "de cada 100 que
   terminaram". A segunda pergunta daria um número mais alto e mais lisonjeiro; a primeira
   é a que mede o funil inteiro.

Cada um dos quatro traz embaixo a variação contra o **período anterior de mesmo tamanho** —
7 dias comparam com os 7 anteriores. Na taxa a variação vem em pontos percentuais, não em
porcentagem de porcentagem.

---

## Agenda — volume e cancelamento

A primeira faixa de quatro números é sobre **o que foi marcado**, independente de ter
acontecido.

| Indicador | O que conta |
| --- | --- |
| Reuniões marcadas | Tudo que existe na janela, canceladas inclusive |
| De pé | As que não foram canceladas |
| Canceladas | As canceladas, com a divisão de quem cancelou logo abaixo |
| Taxa de cancelamento | Canceladas ÷ Reuniões marcadas |

Os três primeiros fecham entre si: **De pé + Canceladas = Marcadas**.

O detalhe útil está embaixo de "Canceladas": a separação entre **cancelada por quem marcou**
e **por quem atende**. São dois problemas diferentes. Cancelamento pelo lead é sinal de
qualificação ou de expectativa errada na origem; cancelamento pelo anfitrião é problema de
agenda interna. A mesma taxa de 30% significa coisas opostas conforme o lado que predomina.

Remarcação **não** conta como cancelamento: no Calendly ela cria um evento novo, então
aparece como mais uma reunião marcada.

---

## Agenda — qualificação por score

A segunda faixa de dois números detalha o volume de reuniões qualificadas por perfil financeiro, cruzando o identificador do Calendly com a resposta do formulário no Supabase. Leads com Score 0 não são exibidos pois não qualificam para agendamento.

| Indicador | O que conta | Perfil do Lead |
| --- | --- | --- |
| Score 10 | Reuniões marcadas por leads com Score 10 | **Alta renda**: renda individual ≥ R$ 5.000 ou familiar ≥ R$ 8.000 |
| Score 3 | Reuniões marcadas por leads com Score 3 | **Renda média**: individual de R$ 2.500 a R$ 6.000 ou familiar até R$ 5.000 |

Cada card exibe a fatia percentual que o grupo representa sobre o volume total de reuniões marcadas da janela.

---

## Agenda — presença e no-show

A segunda faixa é sobre **o que já aconteceu**. O denominador de tudo aqui é *Já
aconteceram*, não o total de marcadas.

| Indicador | O que conta |
| --- | --- |
| Já aconteceram | Reuniões não canceladas cujo horário de término já passou |
| Compareceram | Dessas, aquelas que não constam como falta |
| No-show | Dessas, aquelas marcadas como falta (ver *De onde vem a falta*) |
| Taxa de no-show | No-show ÷ Já aconteceram |
| No-show · Score 10 / Score 3 | Mesma conta, só das reuniões de leads com Score 10 (ou 3). Taxa = faltas ÷ já aconteceram **do mesmo score** |

Uma reunião **cancelada nunca entra** nesta faixa. Cancelar antes não é faltar, e misturar
as duas coisas inflaria a taxa de falta com gente que avisou.

### De onde vem a falta

A falta vem da tabela **`lead_no_shows`** do Supabase (deals do CRM), **não** do Calendly. Conta
só `deal_stage = 'No-show'`; `Follow-Up` fica de fora. O campo `no_show` do Calendly deixou de
ser lido: ele só existe se o anfitrião marcar à mão, e numa verificação de 2026-09-18 veio nulo
em **30 de 30** reuniões concluídas.

A tabela não diz **qual** reunião foi a falta. Cada deal é ligado ao lead por **e-mail ou
telefone** (telefone com ≥ 10 dígitos) e vira **uma** reunião: a última já concluída e não
cancelada daquele lead, dentro da janela da tela. Dois deals da mesma pessoa contam uma vez.

### Por que aparece um travessão no lugar do número

Quando os indicadores de presença mostram `—` e a tela traz o aviso *"Presença não
rastreada"*, nenhum deal "No-show" casa com as reuniões concluídas da janela. A tabela só tem
deals de **22/10/2026 em diante**, então janelas anteriores a essa data ficam em `—`.

Zero faltas casadas não distingue "ninguém faltou" de "período sem cobertura". Exibir
"0 no-show" afirmaria uma presença que nunca foi medida. O travessão admite que a informação
não existe.

O sinal é `Presenca.rastreado` (`src/lib/agenda.ts`), definido como `faltaram > 0` na janela
selecionada. Consequência conhecida: numa janela em que a tabela cobre o período mas ninguém
faltou de verdade, a tela dirá "não rastreada" em vez de "0 faltas". O erro é para o lado seguro.

**Janelas que cruzam 22/10 têm taxa subestimada:** as reuniões anteriores entram no
denominador, mas a tabela não tem as faltas delas.

---

## Vendas — receita, origem e time comercial

A fonte é a tabela `vendas_versalhes`, o espelho do board comercial. A tela mostra só
agregados — nenhum nome de comprador, documento ou endereço sai do banco para a página.

| Indicador | O que conta |
| --- | --- |
| Vendas | Todas as linhas da janela, com ou sem valor de contrato |
| Faturamento | Soma do valor do contrato das vendas com valor ≥ R$ 100 |
| Caixa recebido | Soma do que já entrou nessas mesmas vendas, e a fatia que isso é do faturamento |
| A receber | Faturamento − caixa, venda a venda; uma venda com caixa acima do contrato não gera "a receber" negativo |
| Ticket médio | Faturamento ÷ vendas com valor. Ao lado, a **mediana** (a venda do meio) |
| Maior venda | Maior valor de contrato e quanto ele pesa no faturamento |
| Ciclo de venda | Mediana de dias entre a resposta de formulário mais antiga do mesmo e-mail e a compra |
| Internacional | Vendas com valor cujo país não é Brasil |

**Faturamento e caixa são uma leitura nossa do board:** faturamento = valor do contrato,
caixa = quanto já entrou. Se o board usar os campos de outro jeito, "a receber" e "% recebido"
deixam de valer.

**Vendas sem valor de contrato válido.** Linha com valor abaixo de R$ 100 (em 2026-11-01:
7 vendas que somavam R$ 69 de contrato e já tinham R$ 2.136 de caixa) conta como venda, mas fica fora de
faturamento, ticket e rankings, e a tela avisa quantas são. Ficar de fora não significa
"venda inválida": o mais provável é que o valor ainda não foi preenchido.

**Origem.** A venda é ligada ao lead **pelo e-mail**; o formulário, a UTM e o score vêm da
resposta **mais recente** daquele e-mail. Venda sem lead aparece como `(sem lead)`. O
telefone não é usado: varrê-lo custaria 22 mil linhas por visita e, medido, só acrescentaria
2 das 33 vendas.

**Time comercial.** O closer da venda é ligado ao anfitrião de mesmo nome na Agenda, e a
tela mostra as reuniões concluídas e o no-show dele **do dia da primeira venda da janela até
agora**. Atenção: são as reuniões que o closer fez nesse intervalo, não necessariamente as que
geraram aquelas vendas.

**Nomes: só grafia, nunca parecido.** "Thaís Santos", "Thais Santos" e "thais santos" são a
mesma pessoa — a ligação ignora acento, caixa, pontuação e espaço repetido (`src/lib/nomes.ts`).
Não existe similaridade: "Thaise Vianna" e "Thais Santos" continuam pessoas distintas. Se um
nome aparece grafado de modo que não coincide nem assim (por exemplo, só o primeiro nome), a
tela o trata como outra pessoa e o no-show dele fica `—`.

**Contrato assinado** é mostrado como vem do board, com faturamento e caixa ao lado. Compare as
colunas antes de usar a assinatura como sinal de venda confirmada.

---

## As quebras

Abaixo dos números grandes, as telas repartem o mesmo total por dimensão. Cada quebra é
uma leitura do **mesmo** conjunto — elas não se somam entre si.

- **Captação:** por funil (cada formulário é um funil separado), por país, por região e
  pelos cinco UTMs — origem, conteúdo, mídia, campanha e termo.
- **Agenda:** por tipo de agenda, por anfitrião, pelo formulário de origem e por `utm_source`.
- **Vendas:** por origem (UTM), funil, score do lead, quem agendou, closer, forma de
  pagamento, produto e situação do contrato — ordenadas por faturamento e **sem corte em 10**,
  porque são poucos grupos.

Três convenções valem na Captação e na Agenda (a Vendas só usa o asterisco, no no-show do closer):

1. **Só as 10 maiores aparecem.** O resto é somado numa linha `(outros)`. O subtítulo do
   card diz quantos grupos distintos existem no total, então dá para saber se a cauda é
   longa.
2. **O asterisco marca amostra baixa.** Uma taxa calculada sobre menos de 10 reuniões
   concluídas vem com `*`. Ela aparece, mas é ruído: com 2 reuniões e 1 falta, "50%" não
   descreve desempenho nenhum. Numa janela de um dia quase toda linha cai nesse caso — é
   justamente onde o número mais enganaria.
3. **Sem UTM também é um grupo.** Quem chegou sem parâmetro de campanha não some da conta;
   aparece como grupo próprio. Se ele for grande, o problema está na marcação dos links, não
   no relatório.

---

## O que estes números não dizem

Cinco limites conhecidos, para ninguém tomar decisão em cima de coisa que a dash não mede.

1. **Presença depende de a `lead_no_shows` ser alimentada.** Sem deal "No-show" no CRM, não há
   dado de presença. A ligação entre deal e reunião é por e-mail/telefone e **aproximada**:
   ~5% dos deals não casam com nenhum lead (166 de 174 em 2026-11-01), e quem faltou numa
   reunião e remarcou pode ter a falta marcada na reunião errada.
2. **Remarcação quebra o elo entre o lead e a reunião.** Quando alguém remarca, o Calendly
   cria um evento novo, mas o registro do formulário continua apontando para o evento
   antigo. Nesses casos a reunião aparece na Agenda sem origem identificada — cai no grupo
   "sem lead". Não é falha de preenchimento; é como as duas ferramentas conversam.
3. **As telas têm fontes separadas.** A Captação e a Vendas leem o Supabase; a Agenda lê a API do
   Calendly. O banco guarda apenas três campos de Calendly por resposta (`calendly_url`,
   `calendly_event_id`, `calendly_invitee_id`) — nenhum horário, status ou anfitrião. Por
   isso "agendou" na Captação e "reunião marcada" na Agenda podem divergir.
4. **Só a tela de Vendas mede dinheiro, e ela não mede conversão.** Captação e Agenda vão até
   a reunião acontecer. A Vendas mostra o que foi vendido, mas **não** divide venda por
   reunião ou por lead: nenhuma taxa de conversão entra na dash. Uma taxa de agendamento alta
   com poucas vendas depois continua invisível, a não ser que alguém compare as telas à mão.
5. **A base de Vendas é curta e depende de preenchimento humano.** A tabela só tem vendas de
   27/10/2026 em diante (2026-11-03: 33 linhas em 5 dias), então qualquer ranking é ordem de
   grandeza, não tendência. E o valor do contrato é preenchido no board por quem vende: 9 das
   33 vendas estavam sem valor válido.

---

## Referência rápida

| Tela | Indicador | Conta |
| --- | --- | --- |
| Captação | Iniciaram o formulário | Todas as respostas, inclusive abandonos |
| Captação | Terminaram | Total − abandonos |
| Captação | Agendaram call | Terminaram e marcaram |
| Captação | Taxa de agendamento | Agendaram ÷ Iniciaram |
| Agenda | Reuniões marcadas | Tudo na janela, canceladas inclusive |
| Agenda | De pé | Marcadas − canceladas |
| Agenda | Canceladas | Separadas por quem cancelou |
| Agenda | Taxa de cancelamento | Canceladas ÷ Marcadas |
| Agenda | Score 10 | Reuniões vinculadas a lead com score 10 (alta renda) |
| Agenda | Score 3 | Reuniões vinculadas a lead com score 3 (renda média) |
| Agenda | Já aconteceram | Não canceladas que já terminaram |
| Agenda | Compareceram | Já aconteceram − no-show |
| Agenda | No-show | Deal "No-show" da `lead_no_shows`, ligado à reunião por e-mail/telefone |
| Agenda | Taxa de no-show | No-show ÷ Já aconteceram |
| Agenda | No-show · Score 10 / 3 | No-show só de leads com esse score; taxa sobre as que já aconteceram do mesmo score |
| Vendas | Vendas | Todas as linhas do board na janela, com ou sem valor de contrato |
| Vendas | Faturamento | Soma do valor do contrato das vendas com valor ≥ R$ 100 |
| Vendas | Caixa recebido | Soma do que já entrou nessas mesmas vendas |
| Vendas | A receber | Faturamento − caixa, venda a venda, sem deixar negativo |
| Vendas | Ticket médio / mediana | Faturamento ÷ vendas com valor; a mediana é a venda do meio |
| Vendas | Ciclo de venda | Mediana de dias do primeiro contato (resposta mais antiga do e-mail) à compra |
| Vendas | No-show do closer | Faltas ÷ reuniões concluídas do anfitrião de mesmo nome na Agenda |

Travessão no lugar do número significa **não medido**, nunca zero. Asterisco na taxa
significa **menos de 10 reuniões** no denominador.

---

## Em caso de dúvida

Se um número parecer errado, o teste mais rápido é conferir **qual data o período está
filtrando** — a maior parte das divergências entre as telas é isso, e não erro de
cálculo.
