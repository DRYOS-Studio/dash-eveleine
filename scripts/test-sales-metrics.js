const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const r2 = (n) => Math.round(n * 100) / 100;

async function verifyRange(label, gteDate) {
  console.log(`\n=== Verificando Período: ${label} ===`);

  // 1. Get subsequent installment map
  const { data: parcData } = await supabase
    .from("transactions")
    .select("transaction_code, customer_email, product_id, product_name, approved_at, is_recompra")
    .eq("plataforma", "hotmart")
    .eq("status", "APPROVED")
    .or("payment_type.ilike.%parcelado%,payment_type.ilike.%installments%")
    .order("approved_at", { ascending: true })
    .order("transaction_code", { ascending: true });

  const planFirst = new Map();
  const subMap = new Map();
  for (const r of parcData || []) {
    const email = (r.customer_email || "").toLowerCase().trim();
    const prodKey = String(r.product_id || r.product_name);
    const k = `${email}|${prodKey}`;
    if (!planFirst.has(k)) {
      planFirst.set(k, { is_recompra: Boolean(r.is_recompra) });
      subMap.set(r.transaction_code, { isSubsequent: false, isRecompraOrigin: Boolean(r.is_recompra) });
    } else {
      const first = planFirst.get(k);
      subMap.set(r.transaction_code, { isSubsequent: true, isRecompraOrigin: first.is_recompra });
    }
  }

  // 2. Fetch rows in period
  let q = supabase
    .from("transactions")
    .select("transaction_code, customer_email, product_id, product_name, approved_at, payment_type, is_recompra, bruto, liquido, taxa_hotmart, outras_comissoes, preco_oferta, taxa_hotmart_exata")
    .eq("plataforma", "hotmart")
    .eq("status", "APPROVED");

  if (gteDate) {
    q = q.gte("approved_at", gteDate);
  }

  const { data: rows, error } = await q;
  if (error) throw error;

  let totalBruto = 0;
  let totalLiquido = 0;
  let contratosBrutos = [];
  let parcelasSubseqCount = 0;
  let parcelasSubseqBruto = 0;

  let unicasContratos = [];
  let unicasBruto = 0;
  let unicasLiquido = 0;
  let unicasSubseqCount = 0;
  let unicasSubseqBruto = 0;

  let recomprasContratos = [];
  let recomprasBruto = 0;
  let recomprasLiquido = 0;
  let recomprasSubseqCount = 0;
  let recomprasSubseqBruto = 0;

  for (const r of rows) {
    const bruto = Number(r.bruto) || 0;
    const liquido = Number(r.liquido) || 0;
    totalBruto += bruto;
    totalLiquido += liquido;

    const subInfo = subMap.get(r.transaction_code);
    const isSub = subInfo?.isSubsequent ?? false;

    if (isSub) {
      parcelasSubseqCount++;
      parcelasSubseqBruto += bruto;
      if (subInfo.isRecompraOrigin) {
        recomprasBruto += bruto;
        recomprasLiquido += liquido;
        recomprasSubseqCount++;
        recomprasSubseqBruto += bruto;
      } else {
        unicasBruto += bruto;
        unicasLiquido += liquido;
        unicasSubseqCount++;
        unicasSubseqBruto += bruto;
      }
    } else {
      contratosBrutos.push(bruto);
      if (r.is_recompra) {
        recomprasContratos.push(bruto);
        recomprasBruto += bruto;
        recomprasLiquido += liquido;
      } else {
        unicasContratos.push(bruto);
        unicasBruto += bruto;
        unicasLiquido += liquido;
      }
    }
  }

  totalBruto = r2(totalBruto);
  totalLiquido = r2(totalLiquido);
  unicasBruto = r2(unicasBruto);
  recomprasBruto = r2(recomprasBruto);
  const diffReceita = Math.abs(r2(unicasBruto + recomprasBruto) - totalBruto);

  console.log(`Transações Totais: ${rows.length}`);
  console.log(`  - Contratos novos: ${contratosBrutos.length}`);
  console.log(`  - Parcelas subsequentes: ${parcelasSubseqCount} (R$ ${r2(parcelasSubseqBruto).toFixed(2)})`);
  console.log(`Faturamento Total: R$ ${totalBruto.toFixed(2)}`);
  console.log(`  - Cenário A (Únicas): ${unicasContratos.length} contratos (+${unicasSubseqCount} parcelas) | R$ ${unicasBruto.toFixed(2)} | Ticket: R$ ${r2(unicasContratos.reduce((a,b)=>a+b,0)/unicasContratos.length).toFixed(2)} | Mediana: R$ ${r2(median(unicasContratos)).toFixed(2)}`);
  console.log(`  - Cenário B (Recompras): ${recomprasContratos.length} contratos (+${recomprasSubseqCount} parcelas) | R$ ${recomprasBruto.toFixed(2)} | Ticket: R$ ${r2(recomprasContratos.reduce((a,b)=>a+b,0)/recomprasContratos.length).toFixed(2)} | Mediana: R$ ${r2(median(recomprasContratos)).toFixed(2)}`);
  console.log(`Invariante de Receita: ${unicasBruto.toFixed(2)} + ${recomprasBruto.toFixed(2)} = ${(unicasBruto + recomprasBruto).toFixed(2)} (diff: ${diffReceita}) -> ${diffReceita < 0.05 ? "OK (100% batendo)" : "ERRO"}`);
  console.log(`Invariante de Volume: ${contratosBrutos.length} + ${parcelasSubseqCount} = ${contratosBrutos.length + parcelasSubseqCount} === ${rows.length} -> ${contratosBrutos.length + parcelasSubseqCount === rows.length ? "OK" : "ERRO"}`);
}

async function run() {
  await verifyRange("Novembro 2026", "2026-11-01T00:00:00Z");
  await verifyRange("Todo o Histórico (ALL)", null);
}

run();
