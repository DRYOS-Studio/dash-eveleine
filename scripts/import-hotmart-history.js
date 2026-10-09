/**
 * Script de importação e processamento da base histórica de vendas Hotmart.
 * Suporta arquivo individual ou diretório contendo múltiplos arquivos .csv/.xlsx.
 * 
 * Uso:
 *   node --env-file=.env.local scripts/import-hotmart-history.js "/Users/rafael/Downloads/sales_history_20261007183201_A199E413_2024_TO_2026_17184781998672375099"
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Normalizador de produtos para famílias e edições
function classifyProduct(rawName) {
  const name = (rawName || "").trim();
  const lower = name.toLowerCase();

  let edition = "EVERGREEN";
  if (lower.includes("2026 #1") || lower.includes("2026.1") || lower.includes("2026#1")) {
    edition = "2026 #1";
  } else if (lower.includes("2026 #2") || lower.includes("2026.2") || lower.includes("2026#2")) {
    edition = "2026 #2";
  } else if (lower.includes("2026")) {
    edition = "2026";
  } else if (lower.includes("2025")) {
    edition = "2025";
  } else if (lower.includes("2024")) {
    edition = "2024";
  }

  if (lower.includes("tábua") || lower.includes("tabua") || lower.includes("empreenda com tábuas")) {
    return { family: "Curso Empreenda com Tábuas", edition, category: "curso" };
  }
  if (lower.includes("natal")) {
    return { family: "Workshop Natal", edition, category: "workshop" };
  }
  if (lower.includes("mãe") || lower.includes("mae") || lower.includes("mães") || lower.includes("maes")) {
    return { family: "Workshop Mães", edition, category: "workshop" };
  }
  if (lower.includes("namorado")) {
    return { family: "Workshop Namorados", edition, category: "workshop" };
  }
  if (lower.includes("criança") || lower.includes("crianca") || lower.includes("professor")) {
    return { family: "Workshop Crianças e Professores", edition, category: "workshop" };
  }
  if (lower.includes("lucro certo")) {
    return { family: "Lucro Certo", edition, category: "curso" };
  }
  if (lower.includes("gravação") || lower.includes("gravacao")) {
    return { family: "Gravação Imersão", edition, category: "gravacao" };
  }
  if (lower.includes("imersão") || lower.includes("imersao") || lower.includes("zero ao lucro")) {
    return { family: "Imersão Do Zero ao Lucro", edition, category: "imersao" };
  }
  if (lower.includes("black friday")) {
    return { family: "Combo Black Friday", edition, category: "combo" };
  }
  if (lower.includes("pais") || lower.includes("dia dos pais")) {
    return { family: "Workshop Dia dos Pais", edition, category: "workshop" };
  }
  if (lower.includes("mentora") || lower.includes("mai")) {
    return { family: "Mai - Mentora IA", edition, category: "mentoria" };
  }
  if (lower.includes("café") || lower.includes("cafe")) {
    return { family: "Café da Manhã Lucrativo", edition, category: "workshop" };
  }
  if (lower.includes("polvo")) {
    return { family: "Polvo sem Complicação", edition, category: "workshop" };
  }
  if (lower.includes("avó") || lower.includes("avo") || lower.includes("avós") || lower.includes("avos")) {
    return { family: "Coleção Dia dos Avós", edition, category: "workshop" };
  }
  if (lower.includes("focaccia")) {
    return { family: "Focaccia em 3 Passos", edition, category: "workshop" };
  }
  if (lower.includes("páscoa") || lower.includes("pascoa")) {
    return { family: "Fature com a Páscoa", edition, category: "workshop" };
  }
  if (lower.includes("anti-caos") || lower.includes("anticaos")) {
    return { family: "Pack Anti-Caos", edition, category: "pack" };
  }
  if (lower.includes("spc") || lower.includes("pack spc")) {
    return { family: "Pack SPC", edition, category: "pack" };
  }
  if (lower.includes("instagram")) {
    return { family: "Turbine Seu Instagram", edition, category: "curso" };
  }

  return { family: name || "Outro Produto", edition, category: "outro" };
}

function parseCurrency(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  let str = String(val).trim().replace(/R\$\s?/g, "").replace(/\s/g, "");
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseDate(val) {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  const str = String(val).trim();
  // Formato brasileiro: DD/MM/YYYY HH:mm:ss ou DD/MM/YYYY
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (brMatch) {
    const [_, d, m, y, h, min, s] = brMatch;
    const dateObj = new Date(
      Date.UTC(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        parseInt(h || "0", 10) + 3, // ajustando fuso horário de SP (UTC-3)
        parseInt(min || "0", 10),
        parseInt(s || "0", 10)
      )
    );
    return dateObj.toISOString();
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function parseCsv(content) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes(";") ? ";" : ",";

  function parseLine(line) {
    const res = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        res.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    res.push(cur.trim());
    return res;
  }

  const rawHeaders = parseLine(lines[0]).map((h) =>
    h.replace(/^\uFEFF/, "").replace(/^"|"$/g, "").trim()
  );
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const row = {};
    for (let j = 0; j < rawHeaders.length; j++) {
      row[rawHeaders[j]] = (cols[j] || "").replace(/^"|"$/g, "").trim();
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.error("Especifique o arquivo ou diretório a ser importado.");
    process.exit(1);
  }

  if (!fs.existsSync(targetPath)) {
    console.error(`Caminho não encontrado: ${targetPath}`);
    process.exit(1);
  }

  const filePaths = [];
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath);
    for (const e of entries) {
      if (e.endsWith(".csv") || e.endsWith(".xlsx") || e.endsWith(".xls")) {
        filePaths.push(path.join(targetPath, e));
      }
    }
  } else {
    filePaths.push(targetPath);
  }

  console.log(`Arquivos encontrados para importação (${filePaths.length}):`);
  filePaths.forEach((f) => console.log(` - ${path.basename(f)}`));

  const allRawRows = [];
  for (const fp of filePaths) {
    console.log(`Lendo ${path.basename(fp)}...`);
    if (fp.endsWith(".csv")) {
      const content = fs.readFileSync(fp, "utf-8");
      const rows = parseCsv(content);
      allRawRows.push(...rows);
    } else {
      const wb = XLSX.readFile(fp, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      allRawRows.push(...rows);
    }
  }

  console.log(`Total de linhas carregadas de todos os arquivos: ${allRawRows.length}`);

  // Normalização e filtro de transações aprovadas
  const transactionsMap = new Map(); // deduplicação por código de transação

  for (const r of allRawRows) {
    const transaction = (r["Transação"] || r["Código"] || r["transaction"] || "").trim();
    const email = (r["Email"] || r["E-mail"] || r["E-mail do comprador"] || "").toLowerCase().trim();
    if (!transaction || !email) continue;

    const rawStatus = (r["Status"] || "Aprovado").toUpperCase();
    const isApproved =
      rawStatus.includes("APROV") ||
      rawStatus.includes("COMPLE") ||
      rawStatus.includes("APPROVED") ||
      rawStatus.includes("COMPLETE");

    if (!isApproved) continue;

    const productName = (r["Nome do Produto"] || r["Produto"] || "Produto")
      .replace(/&amp;/g, "&")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim();
    const productId = (r["Código do Produto"] || r["ID do Produto"] || productName.toLowerCase().replace(/[^a-z0-9]/g, "_")).trim();
    const customerName = (r["Nome"] || r["Comprador"] || "").trim() || null;
    const phone = (r["Telefone"] || r["Celular"] || "").trim() || null;
    const approvedAt = parseDate(r["Data de Confirmação"] || r["Data de Venda"] || r["Data de criação"]);

    const bruto = parseCurrency(r["Preço Total"] || r["Preço do Produto"] || r["Preço"]);
    let liquido = parseCurrency(r["Faturamento líquido"] || r["Valor que você recebeu convertido"] || r["Preço da Oferta"]);
    if (!liquido && bruto) {
      // Sem líquido real não gravamos estimativa: a linha é pulada e listada.
      console.warn(`Pulada (sem líquido real): ${r["Código da transação"] || "?"}`);
      continue;
    }
    const taxa = Math.max(0, Math.round((bruto - liquido) * 100) / 100);

    const paymentType = (r["Tipo de Pagamento"] || r["Meio de Pagamento"] || "Outro").trim();
    const installments = parseInt(r["Número da Parcela"] || r["Parcelas"] || "1", 10) || 1;
    const origin = (r["Origem de Checkout"] || r["Origem"] || r["Origem da venda"] || "").trim() || null;

    transactionsMap.set(transaction, {
      transaction_code: transaction,
      product_id: productId,
      product_name: productName,
      customer_email: email,
      customer_name: customerName,
      phone,
      status: "APPROVED",
      approved_at: approvedAt,
      bruto,
      liquido,
      taxa_hotmart: taxa,
      payment_type: paymentType,
      installments,
      tracking_source: origin,
      utm_source: r["utm_source"] || null,
      utm_campaign: r["utm_campaign"] || null,
    });
  }

  const records = Array.from(transactionsMap.values());
  console.log(`Transações únicas e aprovadas identificadas: ${records.length}`);

  // Ordenar cronologicamente para calcular recompra de cada cliente
  records.sort((a, b) => new Date(a.approved_at).getTime() - new Date(b.approved_at).getTime());

  const customersMap = new Map();
  const productsMap = new Map();

  for (const r of records) {
    // Produtos
    if (!productsMap.has(r.product_id)) {
      const cls = classifyProduct(r.product_name);
      productsMap.set(r.product_id, {
        id: r.product_id,
        name: r.product_name,
        family: cls.family,
        edition: cls.edition,
        category: cls.category,
      });
    }

    // Clientes e Sequência de Compras
    let cust = customersMap.get(r.customer_email);
    if (!cust) {
      cust = {
        email: r.customer_email,
        name: r.customer_name,
        phone: r.phone,
        first_purchase_at: r.approved_at,
        first_product_id: r.product_id,
        first_product_name: r.product_name,
        purchases: [],
        total_spent_bruto: 0,
        total_spent_liquido: 0,
      };
      customersMap.set(r.customer_email, cust);
    }

    const prevCount = cust.purchases.length;
    r.purchase_sequence = prevCount + 1;
    // Recompra = 1ª compra deste produto por quem já comprou OUTRO produto em instante anterior.
    const earlier = cust.purchases.filter((p) => p.approved_at < r.approved_at);
    r.is_recompra =
      earlier.some((p) => p.product_id !== r.product_id) &&
      !earlier.some((p) => p.product_id === r.product_id);

    if (prevCount === 0) {
      r.days_since_first_purchase = 0;
      r.days_since_prev_purchase = 0;
    } else {
      const firstDate = new Date(cust.first_purchase_at);
      const prevDate = new Date(cust.purchases[prevCount - 1].approved_at);
      const curDate = new Date(r.approved_at);
      r.days_since_first_purchase = Math.max(0, Math.round((curDate - firstDate) / 86400000));
      r.days_since_prev_purchase = Math.max(0, Math.round((curDate - prevDate) / 86400000));
    }

    cust.purchases.push(r);
    cust.total_spent_bruto += r.bruto;
    cust.total_spent_liquido += r.liquido;
    if (r.customer_name && !cust.name) cust.name = r.customer_name;
    if (r.phone && !cust.phone) cust.phone = r.phone;
  }

  console.log(`Famílias e Produtos mapeados: ${productsMap.size}`);
  console.log(`Clientes únicos: ${customersMap.size}`);

  // Inserir Produtos no Supabase em lotes
  console.log("\nSalvando produtos no Supabase...");
  const productBatches = Array.from(productsMap.values());
  for (let i = 0; i < productBatches.length; i += 100) {
    const chunk = productBatches.slice(i, i + 100);
    const { error } = await supabase.from("products").upsert(chunk);
    if (error) console.error("Erro ao salvar produtos:", error.message);
  }

  // Inserir Clientes no Supabase em lotes
  console.log("Salvando clientes no Supabase...");
  const customerBatches = Array.from(customersMap.values()).map((c) => ({
    email: c.email,
    name: c.name,
    phone: c.phone,
    first_purchase_at: c.first_purchase_at,
    first_product_id: c.first_product_id,
    first_product_name: c.first_product_name,
    total_purchases: c.purchases.length,
    total_spent_bruto: Math.round(c.total_spent_bruto * 100) / 100,
    total_spent_liquido: Math.round(c.total_spent_liquido * 100) / 100,
  }));

  for (let i = 0; i < customerBatches.length; i += 200) {
    const chunk = customerBatches.slice(i, i + 200);
    const { error } = await supabase.from("customers").upsert(chunk, { onConflict: "email" });
    if (error) console.error("Erro ao salvar clientes:", error.message);
  }

  // Inserir Transações no Supabase em lotes
  console.log("Salvando transações analíticas no Supabase...");
  const transactionRows = records.map((r) => ({
    transaction_code: r.transaction_code,
    product_id: r.product_id,
    product_name: r.product_name,
    customer_email: r.customer_email,
    customer_name: r.customer_name,
    status: r.status,
    approved_at: r.approved_at,
    bruto: r.bruto,
    liquido: r.liquido,
    taxa_hotmart: r.taxa_hotmart,
    payment_type: r.payment_type,
    installments: r.installments,
    purchase_sequence: r.purchase_sequence,
    is_recompra: r.is_recompra,
    days_since_first_purchase: r.days_since_first_purchase,
    days_since_prev_purchase: r.days_since_prev_purchase,
    tracking_source: r.tracking_source,
    utm_source: r.utm_source,
    utm_campaign: r.utm_campaign,
  }));

  let insertedCount = 0;
  for (let i = 0; i < transactionRows.length; i += 200) {
    const chunk = transactionRows.slice(i, i + 200);
    const { error } = await supabase.from("transactions").upsert(chunk, { onConflict: "transaction_code" });
    if (error) {
      console.error(`Erro ao salvar lote ${i}-${i + chunk.length}:`, error.message);
    } else {
      insertedCount += chunk.length;
      process.stdout.write(`Progresso: ${insertedCount}/${transactionRows.length} transações salvas...\r`);
    }
  }

  console.log("\n\n=======================================================");
  console.log(" 🎉 IMPORTAÇÃO HISTÓRICA CONCLUÍDA COM SUCESSO!");
  console.log("=======================================================");
  console.log(`Transações salvas no banco: ${insertedCount}`);
  console.log(`Clientes cadastrados:        ${customersMap.size}`);
  console.log(`Produtos cadastrados:        ${productsMap.size}`);
  console.log("=======================================================\n");
}

main().catch(console.error);
