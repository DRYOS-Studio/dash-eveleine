# Manual do produto — o que cada indicador mede

Definição de cada número das duas telas: o que entra na conta, o que fica de fora e onde
ele pode enganar. Escrito para quem **lê** a dash, não para quem a mantém — a parte
técnica está no [README](../README.md).

As contas descritas aqui saem de `src/lib/data.ts` (Captação) e `src/lib/agenda.ts`
(Agenda). Se uma delas mudar, este arquivo mente até ser corrigido junto.

---

## Como ler

As duas telas contam coisas diferentes, e a diferença está em **qual data elas usam para
decidir o que entra no período**.

| | Captação | Agenda |
| --- | --- | --- |
| Conta | Respostas de formulário | Reuniões do Calendly |
| Data que filtra | Quando a pessoa **respondeu** o formulário | Quando a reunião **acontece** |
| Janelas | Hoje, Ontem, 7, 30, 90 dias, Tudo | Hoje, Amanhã, Próx. 7 dias, Últ. 7 dias, Este mês |
| Olha para | Só para trás | Para trás **e para frente** |

Por isso a Agenda tem "Amanhã" e "Próximos 7 dias" e a Captação não: uma reunião pode estar
marcada para depois de hoje, uma resposta de formulário não pode ter sido enviada no futuro.

> **Um lead e a reunião dele podem cair em períodos diferentes.** Quem preencheu o
> formulário na segunda e marcou para a sexta aparece na Captação da segunda e na Agenda da
> sexta. Somar as duas telas para conferir não funciona.

As duas usam horário de São Paulo, fixado em UTC−3 no código, sem horário de verão. Ambas
aceitam intervalo personalizado (campos *De* e *até*), e nos dois casos o dia final entra
inteiro.

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

## As quebras

Abaixo dos números grandes, as duas telas repartem o mesmo total por dimensão. Cada quebra é
uma leitura do **mesmo** conjunto — elas não se somam entre si.

- **Captação:** por funil (cada formulário é um funil separado), por país, por região e
  pelos cinco UTMs — origem, conteúdo, mídia, campanha e termo.
- **Agenda:** por tipo de agenda, por anfitrião, pelo formulário de origem e por `utm_source`.

Três convenções valem em todas elas:

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

Quatro limites conhecidos, para ninguém tomar decisão em cima de coisa que a dash não mede.

1. **Presença depende de a `lead_no_shows` ser alimentada.** Sem deal "No-show" no CRM, não há
   dado de presença. A ligação entre deal e reunião é por e-mail/telefone e **aproximada**:
   ~5% dos deals não casam com nenhum lead (166 de 174 em 2026-11-01), e quem faltou numa
   reunião e remarcou pode ter a falta marcada na reunião errada.
2. **Remarcação quebra o elo entre o lead e a reunião.** Quando alguém remarca, o Calendly
   cria um evento novo, mas o registro do formulário continua apontando para o evento
   antigo. Nesses casos a reunião aparece na Agenda sem origem identificada — cai no grupo
   "sem lead". Não é falha de preenchimento; é como as duas ferramentas conversam.
3. **As duas telas têm fontes separadas.** A Captação lê o Supabase; a Agenda lê a API do
   Calendly. O banco guarda apenas três campos de Calendly por resposta (`calendly_url`,
   `calendly_event_id`, `calendly_invitee_id`) — nenhum horário, status ou anfitrião. Por
   isso "agendou" na Captação e "reunião marcada" na Agenda podem divergir.
4. **Nenhum número aqui é receita.** A dash vai até a reunião acontecer. O que sai dela —
   proposta, matrícula, valor — não entra em nenhum indicador. Uma taxa de agendamento alta
   com conversão baixa depois é invisível nesta tela.

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

Travessão no lugar do número significa **não medido**, nunca zero. Asterisco na taxa
significa **menos de 10 reuniões** no denominador.

---

## Em caso de dúvida

Se um número parecer errado, o teste mais rápido é conferir **qual data o período está
filtrando** — a maior parte das divergências entre as duas telas é isso, e não erro de
cálculo.
