/**
 * Recalcula, a partir de `transactions` (APPROVED), tudo que é derivado do histórico do cliente:
 *   - transactions: purchase_sequence, is_recompra, days_since_first_purchase, days_since_prev_purchase
 *   - customers: total_purchases, total_spent_*, first_purchase_at, first_product_*, name (se for e-mail)
 *   - nomes de produto: entidades HTML (&amp;) e caracteres invisíveis
 *
 * Regra de recompra: a transação é a PRIMEIRA compra daquele produto pelo cliente
 * E o cliente já tinha comprado OUTRO produto. Parcelas e repetições do mesmo
 * produto nunca são recompra.
 *
 * Uso:
 *   node --env-file=.env.local scripts/recalc-customer-history.js           # dry-run (não grava)
 *   node --env-file=.env.local scripts/recalc-customer-history.js --apply   # grava
 */

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");

if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cleanName(s) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[​-‍⁠﻿]/g, "")
    .trim();
}

async function fetchAll(table, columns, order) {
  const rows = [];
  const PAGE = 1000;
  for (let page = 0; ; page++) {
    let q = supabase.from(table).select(columns).range(page * PAGE, (page + 1) * PAGE - 1);
    for (const o of order) q = q.order(o, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const r2 = (n) => Math.round(n * 100) / 100;

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function run() {
  console.log(APPLY ? "MODO: APPLY (grava no banco)" : "MODO: DRY-RUN (não grava)");

  const tx = await fetchAll(
    "transactions",
    "transaction_code, status, customer_email, customer_name, product_id, product_name, approved_at, bruto, liquido, purchase_sequence, is_recompra, days_since_first_purchase, days_since_prev_purchase",
    ["approved_at", "transaction_code"],
  );
  const customers = await fetchAll(
    "customers",
    "email, name, first_purchase_at, first_product_id, first_product_name, total_purchases, total_spent_bruto, total_spent_liquido",
    ["email"],
  );
  const products = await fetchAll("products", "id, name, family", ["id"]);
  console.log(`transactions: ${tx.length} · customers: ${customers.length} · products: ${products.length}`);

  const approved = tx.filter((t) => t.status === "APPROVED");
  const byCust = new Map();
  for (const t of approved) {
    if (!byCust.has(t.customer_email)) byCust.set(t.customer_email, []);
    byCust.get(t.customer_email).push(t);
  }

  const txUpdates = [];
  const custTarget = new Map();

  for (const [email, rows] of byCust) {
    // Compras no mesmo instante (ex.: checkout com mais de um produto) não são recompra entre si:
    // a regra olha só para produtos comprados em instante estritamente anterior.
    const seenBefore = new Set();
    const first = rows[0];
    const firstIds = new Set(
      rows.filter((t) => t.approved_at === first.approved_at).map((t) => String(t.product_id)),
    );
    let bruto = 0;
    let liquido = 0;
    let i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j].approved_at === rows[i].approved_at) j++;
      for (let k = i; k < j; k++) {
        const t = rows[k];
        const pid = String(t.product_id);
        const patch = {
          // posição válida = qualquer uma dentro do grupo de mesmo instante (desempate é arbitrário)
          purchase_sequence: t.purchase_sequence >= i + 1 && t.purchase_sequence <= j ? t.purchase_sequence : k + 1,
          is_recompra: seenBefore.size > 0 && !seenBefore.has(pid),
          days_since_first_purchase: days(first.approved_at, t.approved_at),
          days_since_prev_purchase: i === 0 ? 0 : days(rows[i - 1].approved_at, t.approved_at),
        };
        const changed = Object.keys(patch).filter((key) => patch[key] !== t[key]);
        if (changed.length) txUpdates.push({ code: t.transaction_code, patch, changed });
        bruto += Number(t.bruto) || 0;
        liquido += Number(t.liquido) || 0;
      }
      for (let k = i; k < j; k++) seenBefore.add(String(rows[k].product_id));
      i = j;
    }
    custTarget.set(email, {
      total_purchases: rows.length,
      total_spent_bruto: r2(bruto),
      total_spent_liquido: r2(liquido),
      first_purchase_at: first.approved_at,
      firstIds,
      firstProduct: { id: String(first.product_id), name: cleanName(first.product_name) },
      anyName: rows.map((t) => t.customer_name).find((n) => n && !n.includes("@")) || null,
    });
  }

  const custUpdates = [];
  for (const c of customers) {
    const target = custTarget.get(c.email);
    if (!target) continue;
    const patch = {};
    const total = {
      total_purchases: target.total_purchases,
      total_spent_bruto: target.total_spent_bruto,
      total_spent_liquido: target.total_spent_liquido,
    };
    for (const k of Object.keys(total)) {
      const same = k.startsWith("total_spent")
        ? Math.abs(Number(c[k]) - total[k]) < 0.005
        : Number(c[k]) === total[k];
      if (!same) patch[k] = total[k];
    }
    if (new Date(c.first_purchase_at).getTime() !== new Date(target.first_purchase_at).getTime()) {
      patch.first_purchase_at = target.first_purchase_at;
    }
    // first_product só muda se o gravado não está entre os comprados no 1º instante
    if (!target.firstIds.has(String(c.first_product_id))) {
      patch.first_product_id = target.firstProduct.id;
      patch.first_product_name = target.firstProduct.name;
    }
    if ((c.name || "").includes("@")) patch.name = target.anyName;
    if (Object.keys(patch).length) custUpdates.push({ email: c.email, patch });
  }

  const prodUpdates = products
    .map((p) => ({ id: p.id, patch: { name: cleanName(p.name), family: cleanName(p.family) } }))
    .filter((u, i) => u.patch.name !== products[i].name || u.patch.family !== products[i].family);
  const txNameUpdates = [...new Set(tx.map((t) => t.product_name))]
    .filter((n) => cleanName(n) !== n)
    .map((n) => ({ from: n, to: cleanName(n) }));

  const count = (k, v) => txUpdates.filter((u) => u.patch[k] === v && u.changed.includes(k)).length;
  console.log("\n--- transactions ---");
  console.log(`linhas a alterar: ${txUpdates.length}`);
  console.log(`  is_recompra -> false: ${count("is_recompra", false)} · -> true: ${count("is_recompra", true)}`);
  console.log(`  purchase_sequence: ${txUpdates.filter((u) => u.changed.includes("purchase_sequence")).length}`);
  console.log(`  days_since_*: ${txUpdates.filter((u) => u.changed.some((k) => k.startsWith("days"))).length}`);
  const flips = (v) => txUpdates.filter((u) => u.changed.includes("is_recompra") && u.patch.is_recompra === v).length;
  const antes = approved.filter((t) => t.is_recompra).length;
  console.log(`  total is_recompra: antes ${antes} -> depois ${antes - flips(false) + flips(true)}`);
  console.log("\n--- customers ---");
  console.log(`linhas a alterar: ${custUpdates.length}`);
  for (const u of custUpdates.slice(0, 10)) console.log("  ", Object.keys(u.patch).join(","));
  console.log("\n--- nomes ---");
  console.log(`products: ${prodUpdates.length} ${JSON.stringify(prodUpdates.map((u) => u.patch.name))}`);
  console.log(`transactions.product_name distintos: ${txNameUpdates.length} ${JSON.stringify(txNameUpdates.map((u) => u.to))}`);

  if (!APPLY) {
    console.log("\nDry-run concluído. Rode com --apply para gravar.");
    return;
  }

  console.log("\nGravando...");
  const fail = [];
  const check = (label) => ({ error }) => { if (error) fail.push(`${label}: ${error.message}`); };
  await inBatches(txUpdates, 10, (u) =>
    supabase.from("transactions").update(u.patch).eq("transaction_code", u.code).then(check(u.code)));
  await inBatches(custUpdates, 10, (u) =>
    supabase.from("customers").update(u.patch).eq("email", u.email).then(check(u.email)));
  await inBatches(prodUpdates, 10, (u) =>
    supabase.from("products").update(u.patch).eq("id", u.id).then(check(`product ${u.id}`)));
  await inBatches(txNameUpdates, 10, (u) =>
    supabase.from("transactions").update({ product_name: u.to }).eq("product_name", u.from).then(check(u.from)));

  console.log(fail.length ? `ERROS (${fail.length}):\n${fail.join("\n")}` : "Concluído sem erros.");
  if (fail.length) process.exit(1);
}

run().catch((err) => {
  console.error("Erro na execução:", err);
  process.exit(1);
});
