/**
 * Importa o relatório "Detalhado - minhas-vendas" da Eduzz (CSV, separador ";") para o banco,
 * com transactions.plataforma = 'eduzz'. Dry-run por padrão.
 *
 * Mapeamento (colunas Eduzz -> transactions):
 *   Fatura                        -> transaction_code = "EDZ" + fatura
 *   ID do Produto / Produto       -> product_id = "eduzz-<id>" / product_name  (prefixo evita colisão com ids da Hotmart)
 *   Cliente / E-mail, / Nome      -> customer_email (minúsculo) / customer_name
 *   Status Paga | Reembolsado     -> APPROVED | REFUNDED (outro valor aborta)
 *   Data de Pagamento (SP)        -> approved_at (UTC)
 *   Valor Total da Venda          -> bruto  (valor PAGO, com juros — mesma definição da Hotmart)
 *   Valor Inicial da Venda        -> preco_oferta (oferta sem juros)
 *   Ganho Liquido                 -> liquido (parte da conta que exportou; já descontada a co-produção)
 *   Moeda, Nº Parcelas, UTM_*     -> moeda, installments, utm_*
 *   linha inteira (sem documento/endereço) -> raw_payload
 * Não preenchidos para Eduzz: taxa_hotmart_exata e outras_comissoes (a Eduzz não decompõe a taxa como a Hotmart).
 * taxa_hotmart (legado, NOT NULL) = bruto − líquido, igual à convenção do import da Hotmart; não é exibida.
 * fonte_taxa = 'eduzz_csv'.
 *
 * Campos derivados (purchase_sequence, is_recompra, days_since_*) são calculados só entre as vendas
 * da Eduzz (regra da recompra por product_id, como na Hotmart). Não tocam nas linhas da Hotmart.
 *
 * customers: cria quem ainda não existe (transactions.customer_email tem FK para customers.email); em quem já
 * existe só preenche nome/telefone vazios. Quem só tem venda reembolsada entra com total_purchases = 0 e sem 1ª compra.
 *
 * Uso:
 *   node --env-file=.env.local scripts/import-eduzz-sales.js "<arquivo.csv>"           # dry-run
 *   node --env-file=.env.local scripts/import-eduzz-sales.js "<arquivo.csv>" --apply   # grava
 */

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { parseCsv } = require("./lib/hotmart");

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || file.startsWith("--") || !fs.existsSync(file)) {
  console.error('Uso: node --env-file=.env.local scripts/import-eduzz-sales.js "<arquivo.csv>" [--apply]');
  process.exit(1);
}
if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const r2 = (n) => Math.round(n * 100) / 100;
const fail = (msg) => {
  console.error("ABORTADO: " + msg);
  process.exit(1);
};

function money(v, label) {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) fail(`valor inválido em ${label}: "${v}"`);
  return n;
}

// "dd/mm/aaaa hh:mm:ss" em horário de São Paulo (UTC−3) -> ISO UTC
function dateSP(v, label) {
  const m = String(v || "").match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) fail(`data inválida em ${label}: "${v}"`);
  const [, d, mo, y, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi, s)).toISOString();
}

const STATUS = { Paga: "APPROVED", Reembolsado: "REFUNDED" };
const PAGAMENTO = { Credito: "Cartão de Crédito", Pix: "Pix", Boleto: "Boleto", eWallet: "PayPal" };
const PII = [
  "Cliente / Tipo Documento", "Cliente / Documento", "Endereço", "Numero", "Complemento",
  "Bairro", "CEP", "Cidade", "IBGE", "UF", "URL Boleto",
];

// Só produtos conhecidos: nome novo aborta em vez de cair em "Outro".
function classify(name) {
  const lower = name.toLowerCase();
  if (lower.includes("tábua") || lower.includes("tabua")) {
    const ano = ["2026", "2025", "2024"].find((a) => lower.includes(a));
    return { family: "Curso Empreenda com Tábuas", edition: ano || "EVERGREEN", category: "curso" };
  }
  return null;
}

async function fetchAll(table, columns) {
  const rows = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order("email").range(i, i + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  console.log(APPLY ? "MODO: APPLY (grava no banco)" : "MODO: DRY-RUN (não grava)");
  const raw = parseCsv(fs.readFileSync(file, "utf-8"));
  console.log(`linhas no CSV: ${raw.length}`);

  const tx = [];
  const products = new Map();
  const nomes = new Map(); // id -> nome -> nº de vendas (o mesmo id aparece com nomes de variação)
  const phones = new Map();
  for (const r of raw) {
    const fatura = (r["Fatura"] || "").trim();
    const email = (r["Cliente / E-mail"] || "").trim().toLowerCase();
    if (!/^\d+$/.test(fatura)) fail(`Fatura inválida: "${fatura}"`);
    if (!email.includes("@")) fail(`e-mail inválido na fatura ${fatura}: "${email}"`);
    const status = STATUS[r["Status"]];
    if (!status) fail(`status desconhecido na fatura ${fatura}: "${r["Status"]}"`);
    const pagamento = PAGAMENTO[r["Método de Pagamento"]];
    if (!pagamento) fail(`método de pagamento desconhecido na fatura ${fatura}: "${r["Método de Pagamento"]}"`);
    const idProduto = (r["ID do Produto"] || "").trim();
    const nomeProduto = (r["Produto"] || "").replace(/\s+/g, " ").trim();
    const cls = classify(nomeProduto);
    if (!idProduto || !cls) fail(`produto desconhecido na fatura ${fatura}: "${idProduto}" "${nomeProduto}"`);

    const bruto = money(r["Valor Total da Venda"], `bruto ${fatura}`);
    const liquido = money(r["Ganho Liquido"], `liquido ${fatura}`);
    const productId = `eduzz-${idProduto}`;
    const nome = (r["Cliente / Nome"] || "").trim() || null;
    const fone = (r["Cliente / Fones"] || "").replace(/\D/g, "") || null;
    const payload = Object.fromEntries(Object.entries(r).filter(([k]) => !PII.includes(k)));

    if (!nomes.has(productId)) nomes.set(productId, new Map());
    nomes.get(productId).set(nomeProduto, (nomes.get(productId).get(nomeProduto) || 0) + 1);
    products.set(productId, { id: productId, name: nomeProduto, ...cls });
    tx.push({
      transaction_code: `EDZ${fatura}`,
      plataforma: "eduzz",
      product_id: productId,
      product_name: nomeProduto,
      customer_email: email,
      customer_name: nome,
      status,
      approved_at: dateSP(r["Data de Pagamento"], `pagamento ${fatura}`),
      bruto,
      liquido,
      taxa_hotmart: Math.max(0, r2(bruto - liquido)),
      payment_type: pagamento,
      installments: parseInt(r["Nº Parcelas"], 10) || 1,
      moeda: (r["Moeda"] || "").trim() || null,
      preco_oferta: money(r["Valor Inicial da Venda"], `oferta ${fatura}`),
      taxa_hotmart_exata: null,
      outras_comissoes: null,
      fonte_taxa: "eduzz_csv",
      utm_source: (r["UTM Source"] || "").trim() || null,
      utm_medium: (r["UTM Medium"] || "").trim() || null,
      utm_campaign: (r["UTM Campaign"] || "").trim() || null,
      utm_content: (r["UTM Content"] || "").trim() || null,
      utm_term: (r["UTM Term"] || "").trim() || null,
      raw_payload: payload,
      // preenchidos abaixo (só APPROVED)
      purchase_sequence: 1,
      is_recompra: false,
      days_since_first_purchase: 0,
      days_since_prev_purchase: 0,
    });
    if (fone && !phones.has(email)) phones.set(email, fone);
  }
  if (new Set(tx.map((t) => t.transaction_code)).size !== tx.length) fail("Fatura repetida no CSV");

  // products.name = nome mais frequente do id (as variações de oferta ficam em transactions.product_name)
  for (const [id, contagem] of nomes) products.get(id).name = [...contagem].sort((x, y) => y[1] - x[1])[0][0];

  // Derivados dentro da Eduzz, por cliente, só vendas pagas.
  const byCust = new Map();
  for (const t of tx.filter((t) => t.status === "APPROVED")) {
    if (!byCust.has(t.customer_email)) byCust.set(t.customer_email, []);
    byCust.get(t.customer_email).push(t);
  }
  const customers = [];
  for (const [email, rows] of byCust) {
    rows.sort((a, b) => a.approved_at.localeCompare(b.approved_at) || a.transaction_code.localeCompare(b.transaction_code));
    const first = rows[0];
    rows.forEach((t, i) => {
      const earlier = rows.filter((p) => p.approved_at < t.approved_at);
      t.purchase_sequence = i + 1;
      t.is_recompra =
        earlier.some((p) => p.product_id !== t.product_id) && !earlier.some((p) => p.product_id === t.product_id);
      t.days_since_first_purchase = Math.max(0, Math.round((new Date(t.approved_at) - new Date(first.approved_at)) / 86400000));
      t.days_since_prev_purchase = i === 0 ? 0 : Math.max(0, Math.round((new Date(t.approved_at) - new Date(rows[i - 1].approved_at)) / 86400000));
    });
    customers.push({
      email,
      name: rows.map((t) => t.customer_name).find(Boolean) || null,
      phone: phones.get(email) || null,
      first_purchase_at: first.approved_at,
      first_product_id: first.product_id,
      first_product_name: first.product_name,
      total_purchases: rows.length,
      total_spent_bruto: r2(rows.reduce((a, t) => a + t.bruto, 0)),
      total_spent_liquido: r2(rows.reduce((a, t) => a + t.liquido, 0)),
    });
  }

  // Quem só tem venda reembolsada também precisa existir em customers (FK), sem compras contadas.
  const nomeFone = new Map();
  for (const t of tx) {
    if (!nomeFone.has(t.customer_email)) nomeFone.set(t.customer_email, { name: null, phone: phones.get(t.customer_email) || null });
    if (t.customer_name && !nomeFone.get(t.customer_email).name) nomeFone.get(t.customer_email).name = t.customer_name;
  }
  for (const [email, d] of nomeFone) {
    if (byCust.has(email)) continue;
    customers.push({
      email, name: d.name, phone: d.phone, first_purchase_at: null, first_product_id: null, first_product_name: null,
      total_purchases: 0, total_spent_bruto: 0, total_spent_liquido: 0,
    });
  }

  // Estado atual do banco
  const existentes = new Map((await fetchAll("customers", "email, name, phone")).map((c) => [c.email, c]));
  const { data: jaTem, error: eTx } = await supabase
    .from("transactions").select("transaction_code").in("transaction_code", tx.map((t) => t.transaction_code));
  if (eTx) throw eTx;
  const novos = customers.filter((c) => !existentes.has(c.email));
  const emBanco = customers.filter((c) => existentes.has(c.email));
  const preencher = emBanco
    .map((c) => {
      const e = existentes.get(c.email);
      const patch = {};
      if (!e.name && c.name) patch.name = c.name;
      if (!e.phone && c.phone) patch.phone = c.phone;
      return { email: c.email, patch };
    })
    .filter((u) => Object.keys(u.patch).length);

  const pagas = tx.filter((t) => t.status === "APPROVED");
  const datas = tx.map((t) => t.approved_at).sort();
  const so_reembolso = customers.length - byCust.size;
  console.log("\n--- transactions ---");
  console.log(`linhas: ${tx.length} (APPROVED ${pagas.length} · REFUNDED ${tx.length - pagas.length}) · já existem no banco: ${jaTem.length}`);
  console.log(`período: ${datas[0].slice(0, 10)} a ${datas[datas.length - 1].slice(0, 10)}`);
  console.log(`soma APPROVED: bruto ${r2(pagas.reduce((a, t) => a + t.bruto, 0))} · oferta ${r2(pagas.reduce((a, t) => a + t.preco_oferta, 0))} · líquido ${r2(pagas.reduce((a, t) => a + t.liquido, 0))}`);
  console.log(`is_recompra=true (regra por product_id, só entre vendas Eduzz): ${pagas.filter((t) => t.is_recompra).length}`);
  console.log("\n--- products ---");
  for (const p of products.values()) console.log(`  ${p.id} | ${p.name} | ${p.family} | ${p.edition}`);
  console.log("\n--- customers ---");
  console.log(`clientes: ${customers.length} (com venda paga ${byCust.size} · só reembolso ${so_reembolso}) · novos: ${novos.length} · já existiam: ${emBanco.length} (preencher nome/telefone vazio: ${preencher.length})`);

  if (!APPLY) {
    console.log("\nDry-run concluído. Rode com --apply para gravar.");
    return;
  }

  console.log("\nGravando...");
  const erros = [];
  const lote = async (label, tabela, linhas, opts) => {
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + 200), opts);
      if (error) erros.push(`${label} ${i}: ${error.message}`);
    }
  };
  await lote("products", "products", [...products.values()], { onConflict: "id" });
  await lote("customers", "customers", novos, { onConflict: "email", ignoreDuplicates: true });
  if (erros.length) fail("erro ao gravar clientes; transactions não gravadas:\n" + erros.join("\n"));
  await lote("transactions", "transactions", tx, { onConflict: "transaction_code" });
  for (const u of preencher) {
    const { error } = await supabase.from("customers").update(u.patch).eq("email", u.email);
    if (error) erros.push(`customers ${u.email}: ${error.message}`);
  }
  console.log(erros.length ? `ERROS (${erros.length}):\n${erros.join("\n")}` : "Concluído sem erros.");
  if (erros.length) process.exit(1);
}

main().catch((e) => {
  console.error("Erro na execução:", e);
  process.exit(1);
});
