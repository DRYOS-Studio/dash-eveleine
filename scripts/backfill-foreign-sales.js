/**
 * Converte para BRL as vendas em moeda estrangeira de `transactions`, usando:
 *   - API da Hotmart: preço da oferta, taxa Hotmart e cotação da compra (real_conversion_rate)
 *   - CSV de vendas exportado da Hotmart: "Valor que você recebeu convertido" (o que o
 *     vendedor recebeu em reais, já que a Hotmart paga em USD e converte)
 *
 * Valores gravados (todos em BRL; a moeda original continua em `moeda`):
 *   bruto            = preço pago ÷ cotação da compra
 *   preco_oferta     = oferta (hotmart_fee.base) ÷ cotação
 *   taxa_hotmart_exata = hotmart_fee.total ÷ cotação
 *   liquido          = valor recebido convertido (CSV)
 *   outras_comissoes = preco_oferta − taxa − liquido (co-produtor, add-on e diferença cambial)
 *   fonte_taxa       = 'api_fx'
 * Vendas sem linha no CSV (valor recebido em reais ainda desconhecido) ficam de fora e são listadas.
 *
 * Uso:
 *   node --env-file=.env.local scripts/backfill-foreign-sales.js <pasta-ou-arquivo-csv>           # dry-run
 *   node --env-file=.env.local scripts/backfill-foreign-sales.js <pasta-ou-arquivo-csv> --apply   # grava
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { parseCsv, token, pages, windows } = require("./lib/hotmart");

const APPLY = process.argv.includes("--apply");
const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HOTMART_BASIC } = process.env;
if (!target || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HOTMART_BASIC) {
  console.error("Uso: ... backfill-foreign-sales.js <pasta-ou-csv> [--apply] (e SUPABASE_*/HOTMART_BASIC no ambiente).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2 = (n) => Math.round(n * 100) / 100;
const num = (s) => {
  const v = String(s ?? "").trim();
  if (!v) return 0;
  const n = parseFloat(v.includes(",") && !v.includes(".") ? v.replace(",", ".") : v.replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
};

function readCsv(t) {
  const files = fs.statSync(t).isDirectory()
    ? fs.readdirSync(t).filter((f) => f.endsWith(".csv")).map((f) => path.join(t, f))
    : [t];
  const byCode = new Map();
  for (const f of files) {
    for (const r of parseCsv(fs.readFileSync(f, "utf-8"))) {
      const code = (r["Transação"] || "").trim();
      if (code) byCode.set(code, r);
    }
  }
  return byCode;
}

async function main() {
  console.log(APPLY ? "MODO: APPLY" : "MODO: DRY-RUN (não grava)");
  const csv = readCsv(target);
  console.log(`linhas no CSV: ${csv.size}`);

  const { data: db, error } = await supabase
    .from("transactions")
    .select("transaction_code, moeda, status, fonte_taxa")
    .neq("moeda", "BRL")
    .eq("status", "APPROVED");
  if (error) throw error;
  const wanted = new Set(db.map((r) => r.transaction_code));
  console.log(`vendas em moeda estrangeira no banco: ${wanted.size}`);

  const tk = await token(HOTMART_BASIC);
  const hist = new Map();
  const comm = new Map();
  const price = new Map();
  for (const status of ["APPROVED", "COMPLETE"]) {
    for (const [a, b] of windows()) {
      const p = { start_date: String(a), end_date: String(b), transaction_status: status };
      for (const x of await pages("sales/history", p, tk)) if (wanted.has(x.purchase.transaction)) hist.set(x.purchase.transaction, x);
      for (const x of await pages("sales/price/details", p, tk)) if (wanted.has(x.transaction)) price.set(x.transaction, x);
    }
  }

  const updates = [];
  const missing = [];
  const bad = [];
  const t = { n: 0, bruto: 0, oferta: 0, taxa: 0, outras: 0, liq: 0 };
  for (const code of wanted) {
    const row = csv.get(code);
    const h = hist.get(code)?.purchase;
    const pd = price.get(code);
    if (!row || !h || !pd) { missing.push(code); continue; }
    const rate = pd.real_conversion_rate;
    const rateCsv = num(row["Taxa de Câmbio"]);
    const received = num(row["Valor que você recebeu convertido"]);
    if (!rate || !received || Math.abs(rateCsv - rate) / rate > 0.001) { bad.push({ code, rate, rateCsv, received }); continue; }

    const bruto = r2(h.price.value / rate);
    const oferta = r2(h.hotmart_fee.base / rate);
    const taxa = r2(h.hotmart_fee.total / rate);
    const outras = r2(oferta - taxa - received);
    // tolerância de centavos por arredondamento de cotação; abaixo disso é inconsistência real
    if (outras < -0.5) { bad.push({ code, outras }); continue; }

    updates.push({
      code,
      patch: {
        bruto, liquido: r2(received), preco_oferta: oferta, taxa_hotmart_exata: taxa,
        outras_comissoes: Math.max(0, outras), fonte_taxa: "api_fx",
        taxa_hotmart: Math.max(0, r2(bruto - received)),
      },
    });
    t.n++; t.bruto += bruto; t.oferta += oferta; t.taxa += taxa; t.outras += outras; t.liq += received;
  }

  console.log(`\nconvertíveis: ${t.n} · sem CSV/API (ficam de fora): ${missing.length} ${JSON.stringify(missing)} · inconsistentes: ${bad.length} ${JSON.stringify(bad.slice(0, 5))}`);
  console.log(`totais em BRL → pago ${r2(t.bruto)} · oferta ${r2(t.oferta)} · taxa Hotmart ${r2(t.taxa)} · outras (inclui câmbio) ${r2(t.outras)} · líquido recebido ${r2(t.liq)}`);
  if (!APPLY) return console.log("\nDry-run concluído. Rode com --apply para gravar.");

  const fail = [];
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(updates.slice(i, i + 10).map(async (u) => {
      const { error: e } = await supabase.from("transactions").update(u.patch).eq("transaction_code", u.code);
      if (e) fail.push(`${u.code}: ${e.message}`);
    }));
  }
  console.log(fail.length ? `ERROS (${fail.length}):\n${fail.slice(0, 10).join("\n")}` : "Concluído sem erros.");
  if (fail.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
