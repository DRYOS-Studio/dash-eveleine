/**
 * Atualiza is_recompra na tabela transactions para considerar apenas compras
 * onde o cliente possui ao menos uma compra prévia de um PRODUTO DIFERENTE.
 * Elimina boletos recorrentes do mesmo produto (Parcelado Hotmart) e compras
 * repetidas do mesmo produto exato da taxa de recompra.
 */
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  console.log("Buscando todas as transações aprovadas para recálculo de recompra...");
  let allRows = [];
  const PAGE_SIZE = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("transactions")
      .select("transaction_code, customer_email, product_id, product_name, approved_at, is_recompra")
      .eq("status", "APPROVED")
      .order("approved_at", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;
    if (data && data.length > 0) allRows.push(...data);
    if (!data || data.length < PAGE_SIZE) break;
  }

  console.log(`Carregadas ${allRows.length} transações aprovadas.`);

  // Agrupa por cliente ordenado cronologicamente
  const byCust = new Map();
  for (const r of allRows) {
    if (!byCust.has(r.customer_email)) byCust.set(r.customer_email, []);
    byCust.get(r.customer_email).push(r);
  }

  const toFlipFalse = [];
  const toFlipTrue = [];

  for (const [email, custRows] of byCust.entries()) {
    for (let i = 0; i < custRows.length; i++) {
      const r = custRows[i];
      const hasPriorDifferentProduct = custRows.slice(0, i).some((p) => p.product_id !== r.product_id);

      if (hasPriorDifferentProduct && !r.is_recompra) {
        toFlipTrue.push(r.transaction_code);
      } else if (!hasPriorDifferentProduct && r.is_recompra) {
        toFlipFalse.push(r.transaction_code);
      }
    }
  }

  console.log(`Transações para alterar is_recompra -> FALSE: ${toFlipFalse.length}`);
  console.log(`Transações para alterar is_recompra -> TRUE: ${toFlipTrue.length}`);

  // Atualização em lotes para FALSE
  if (toFlipFalse.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < toFlipFalse.length; i += BATCH_SIZE) {
      const batch = toFlipFalse.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("transactions")
        .update({ is_recompra: false })
        .in("transaction_code", batch);
      if (error) {
        console.error("Erro ao atualizar lote false:", error);
      }
    }
    console.log(`Atualizadas ${toFlipFalse.length} transações para is_recompra = false.`);
  }

  // Se houver alguma para TRUE
  if (toFlipTrue.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < toFlipTrue.length; i += BATCH_SIZE) {
      const batch = toFlipTrue.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("transactions")
        .update({ is_recompra: true })
        .in("transaction_code", batch);
      if (error) {
        console.error("Erro ao atualizar lote true:", error);
      }
    }
    console.log(`Atualizadas ${toFlipTrue.length} transações para is_recompra = true.`);
  }

  console.log("Recálculo concluído com sucesso!");
}

run().catch((err) => {
  console.error("Erro na execução:", err);
  process.exit(1);
});
