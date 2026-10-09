/**
 * Preenche a decomposição exata de taxas em `transactions` a partir da API da Hotmart
 * (Sales History + Commissions) e reconcilia status (reembolso, chargeback, contestação).
 *
 * Só grava quando a identidade fecha (±R$ 0,05) e a venda é em BRL:
 *   bruto = (bruto − preco_oferta, juros do comprador) + taxa_hotmart_exata + outras_comissoes + liquido
 * Vendas em outra moeda recebem só `moeda`. Vendas ausentes da API são puladas e listadas.
 *
 * Requer HOTMART_BASIC no ambiente. Migration: docs/migrations/2026-10-09-taxas-exatas.sql
 *
 * Uso:
 *   node --env-file=.env.local scripts/backfill-hotmart-fees.js           # dry-run
 *   node --env-file=.env.local scripts/backfill-hotmart-fees.js --apply   # grava
 */

const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOTMART_BASIC } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HOTMART_BASIC) {
  console.error("Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e/ou HOTMART_BASIC.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { token, pages, windows } = require("./lib/hotmart");

const r2 = (n) => Math.round(n * 100) / 100;

async function fetchDb() {
  const rows = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("transaction_code, status, bruto, liquido, moeda, preco_oferta, taxa_hotmart_exata, outras_comissoes, fonte_taxa")
      .order("transaction_code")
      .range(i, i + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  console.log(APPLY ? "MODO: APPLY" : "MODO: DRY-RUN (não grava)");
  const tk = await token(HOTMART_BASIC);
  const hist = new Map();
  const comm = new Map();
  for (const status of ["APPROVED", "COMPLETE", "REFUNDED", "CHARGEBACK", "PARTIALLY_REFUNDED", "PROTESTED"]) {
    for (const [a, b] of windows()) {
      const p = { start_date: String(a), end_date: String(b), transaction_status: status };
      for (const x of await pages("sales/history", p, tk)) hist.set(x.purchase.transaction, x);
      if (status === "APPROVED" || status === "COMPLETE") {
        for (const x of await pages("sales/commissions", p, tk)) comm.set(x.transaction, x);
      }
    }
    console.log(`API ${status}: acumulado ${hist.size}`);
  }

  const db = await fetchDb();
  const updates = [];
  const notInApi = [];
  const identityFail = [];
  const statusFix = [];
  const t = { n: 0, juros: 0, taxa: 0, outras: 0, liq: 0, oferta: 0 };
  let foreign = 0;

  for (const row of db) {
    const h = hist.get(row.transaction_code);
    if (!h) { notInApi.push(row.transaction_code); continue; }
    const p = h.purchase;
    if (["REFUNDED", "CHARGEBACK", "PARTIALLY_REFUNDED", "PROTESTED"].includes(p.status) && row.status === "APPROVED") {
      statusFix.push({ code: row.transaction_code, status: p.status });
    }
    const moeda = p.price.currency_code;
    if (moeda !== "BRL") {
      foreign++;
      if (row.moeda !== moeda) updates.push({ code: row.transaction_code, patch: { moeda } });
      continue;
    }
    const c = comm.get(row.transaction_code);
    if (!c) { notInApi.push(row.transaction_code); continue; }
    const all = c.commissions.reduce((s, x) => s + x.commission.value, 0);
    const mine = c.commissions
      .filter((x) => x.source === p.commission_as)
      .reduce((s, x) => s + x.commission.value, 0);
    const base = p.hotmart_fee.base;
    const fee = p.hotmart_fee.total;
    const juros = r2(p.price.value - base);
    const outras = r2(all - mine);
    const gap = Number(row.bruto) - (juros + fee + outras + Number(row.liquido));
    if (Math.abs(gap) > 0.05 || Math.abs(Number(row.bruto) - p.price.value) > 0.011) {
      identityFail.push({ code: row.transaction_code, gap: r2(gap) });
      continue;
    }
    const patch = {
      moeda, preco_oferta: r2(base),
      taxa_hotmart_exata: r2(fee), outras_comissoes: outras, fonte_taxa: "api",
    };
    const same =
      row.moeda === moeda && row.fonte_taxa === "api" &&
      Math.abs(Number(row.preco_oferta) - patch.preco_oferta) < 0.005 &&
      Math.abs(Number(row.taxa_hotmart_exata) - patch.taxa_hotmart_exata) < 0.005 &&
      Math.abs(Number(row.outras_comissoes) - patch.outras_comissoes) < 0.005;
    if (!same) updates.push({ code: row.transaction_code, patch });
    t.n++; t.juros += juros; t.taxa += fee; t.outras += outras; t.liq += Number(row.liquido); t.oferta += base;
  }

  console.log(`\nvendas no banco: ${db.length} · decompostas (BRL, identidade ok): ${t.n} · outra moeda: ${foreign}`);
  console.log(`identidade falhou: ${identityFail.length} ${JSON.stringify(identityFail.slice(0, 5))}`);
  console.log(`ausentes da API: ${notInApi.length} ${JSON.stringify(notInApi.slice(0, 8))}`);
  console.log(`status a reconciliar (reembolso/chargeback/contestação na API): ${statusFix.length}`);
  console.log(`totais decompostos → oferta ${r2(t.oferta)} · juros ${r2(t.juros)} · taxa Hotmart ${r2(t.taxa)} · outras ${r2(t.outras)} · líquido ${r2(t.liq)}`);
  console.log(`linhas a atualizar: ${updates.length}`);
  if (!APPLY) return console.log("\nDry-run concluído. Rode com --apply para gravar.");

  console.log("\nGravando...");
  const fail = [];
  const run = async (list, fn) => {
    for (let i = 0; i < list.length; i += 10) await Promise.all(list.slice(i, i + 10).map(fn));
  };
  await run(updates, async (u) => {
    const { error } = await supabase.from("transactions").update(u.patch).eq("transaction_code", u.code);
    if (error) fail.push(`${u.code}: ${error.message}`);
  });
  await run(statusFix, async (u) => {
    const { error } = await supabase.from("transactions").update({ status: u.status }).eq("transaction_code", u.code);
    if (error) fail.push(`${u.code}: ${error.message}`);
  });
  console.log(fail.length ? `ERROS (${fail.length}):\n${fail.slice(0, 10).join("\n")}` : "Concluído sem erros.");
  if (fail.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
