import test from "node:test";
import assert from "node:assert/strict";
import { parseSck, SEM_RASTREIO } from "./sck.ts";

test("sem rastreio", () => {
  for (const v of [null, undefined, "", "  ", "null-null-null-null-null", "undefined|undefined|undefined|undefined|undefined"]) {
    assert.equal(parseSck(v).canal, SEM_RASTREIO, String(v));
    assert.equal(parseSck(v).origem, null);
  }
});

test("origens simples", () => {
  assert.equal(parseSck("direct").canal, "Direto");
  assert.equal(parseSck("HOTMART_PRODUCT_PAGE").canal, "Página do produto (Hotmart)");
  assert.equal(parseSck("HOTMART_SALES_AGENT").canal, "Agente de vendas (Hotmart)");
  assert.equal(parseSck("HOTMART_CLUB_PRODUCT_PAGE_OCB").canal, "Área de membros (Hotmart)");
  assert.equal(parseSck("manychat").canal, "manychat");
});

test("metaads: placement|campanha|anúncio|conjunto; macros não resolvidas são vazias", () => {
  const r = parseSck("metaads|Instagram_Feed|[VENDAS] [IMERSÃO] [ABO] [Q] 19,90 29.01|AD02 -  OPA|00 - [VISITOU PAGINA] [M]");
  assert.equal(r.canal, "Meta Ads");
  assert.equal(r.posicionamento, "Instagram_Feed");
  assert.equal(r.campanha, "[VENDAS] [IMERSÃO] [ABO] [Q] 19,90 29.01");
  assert.equal(r.anuncio, "AD02 -  OPA");
  assert.equal(r.conjunto, "00 - [VISITOU PAGINA] [M]");
  const m = parseSck("metaads|{{placement}}|{{campaign.name}}|{{ad.name}}|{{adset.name}}");
  assert.equal(m.canal, "Meta Ads");
  assert.deepEqual([m.campanha, m.anuncio, m.conjunto, m.posicionamento], [null, null, null, null]);
});

test("Facebook-Ads / Meta-ads: strings reais, com ' | ' dentro dos nomes", () => {
  const r = parseSck("Facebook-Ads|AUTO - Aberto - 18a65 - BR - Advantage | AD16|DCI | E2-CAP | P3-FRIO | CONV | CBO | VB | 2026-08-13 | Teste de Criativos 3|AD16_V_ST_Captação_DCI|DCI05");
  assert.equal(r.canal, "Meta Ads");
  assert.equal(r.conjunto, "AUTO - Aberto - 18a65 - BR - Advantage | AD16");
  assert.equal(r.campanha, "DCI | E2-CAP | P3-FRIO | CONV | CBO | VB | 2026-08-13 | Teste de Criativos 3");
  assert.equal(r.anuncio, "AD16_V_ST_Captação_DCI");
  assert.equal(r.posicionamento, null); // "DCI05" não é posicionamento

  const n = parseSck("Meta-ads|AUTO | ALL | 18 a 65 | BR | All in one | AD 04|W-13S | E4-VEN | P1-QUENTE | VND | ABO | 2026-10-09 | Teste de ads|AD04|Instagram_Stories");
  assert.equal(n.canal, "Meta Ads");
  assert.equal(n.campanha, "W-13S | E4-VEN | P1-QUENTE | VND | ABO | 2026-10-09 | Teste de ads");
  assert.equal(n.anuncio, "AD04");
  assert.equal(n.posicionamento, "Instagram_Stories");
});

test("Facebook-Ads com 4, 3 e 2 partes", () => {
  // 4 partes: conjunto e campanha colados (separados por ' |', que não divide)
  const q4 = parseSck("Facebook-Ads|AUTO - Aberto - 18a65 - BR - Advantage |DCI | E2-CAP | P3-FRIO | CONV | CBO | 2026-07-20 | All In One|AD06_E_Feed_Captação_DCI|Instagram_Feed");
  assert.equal(q4.canal, "Meta Ads");
  assert.equal(q4.conjunto, "AUTO - Aberto - 18a65 - BR - Advantage |DCI | E2-CAP | P3-FRIO | CONV | CBO | 2026-07-20 | All In One");
  assert.equal(q4.campanha, null);
  assert.equal(q4.anuncio, "AD06_E_Feed_Captação_DCI");
  assert.equal(q4.posicionamento, "Instagram_Feed");
  const q3 = parseSck("Facebook-Ads|00 | MIX QUENTES|PARTIU EMPREENDER | VENDAS | WORKSHOP PAIS");
  assert.equal(q3.conjunto, "00 | MIX QUENTES");
  assert.equal(q3.campanha, "PARTIU EMPREENDER | VENDAS | WORKSHOP PAIS");
  const q2 = parseSck("Facebook-Ads|Auto - H");
  assert.equal(q2.conjunto, "Auto - H");
  assert.equal(q2.campanha, null);
});

test("trafego e formato utm (5 partes)", () => {
  const t5 = parseSck("trafego|paid|seguidores|ad6|120229586604180361");
  assert.deepEqual([t5.canal, t5.campanha, t5.anuncio], ["trafego", "seguidores", "ad6"]);
  const t3 = parseSck("trafego|lal|ad4");
  assert.deepEqual([t3.campanha, t3.anuncio], ["lal", "ad4"]);
  const ig = parseSck("instagram|linkbio|imersaofevereiro|undefined|undefined");
  assert.deepEqual([ig.canal, ig.campanha, ig.anuncio], ["instagram", "imersaofevereiro", null]);
  const g = parseSck("grp-new|undefined|undefined|undefined|undefined");
  assert.deepEqual([g.canal, g.campanha], ["grp-new", null]);
});

test("só nome de campanha, sem origem", () => {
  const r = parseSck("PARTIU EMPREENDER | VENDAS | WORKSHOP PAIS | A");
  assert.equal(r.canal, "Só nome de campanha");
  assert.equal(r.campanha, "PARTIU EMPREENDER | VENDAS | WORKSHOP PAIS | A");
});
