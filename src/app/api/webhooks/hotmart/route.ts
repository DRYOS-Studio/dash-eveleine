import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { classifyProduct, cleanProductName } from "@/lib/product-classifier";

type HotmartCommission = {
  value?: number;
  source?: string; // 'PRODUCER', 'MARKETPLACE', 'AFFILIATE'
  currency_value?: string;
};

type HotmartWebhookPayload = {
  id?: string;
  creation_date?: number;
  event?: string;
  version?: string;
  data?: {
    product?: {
      id?: string | number;
      name?: string;
      ucode?: string;
    };
    buyer?: {
      email?: string;
      name?: string;
      checkout_phone?: string;
    };
    purchase?: {
      transaction?: string;
      status?: string;
      approved_date?: number | string;
      order_date?: number | string;
      price?: {
        value?: number;
        currency_value?: string;
        currency_code?: string;
      };
      full_price?: {
        value?: number;
        currency_value?: string;
      };
      payment?: {
        type?: string;
        installments_number?: number;
      };
      tracking?: {
        source?: string;
      };
    };
    commissions?: HotmartCommission[];
    origin?: {
      sck?: string;
      src?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
    };
  };
};

export async function POST(req: NextRequest) {
  try {
    // 1. Validação de Segurança por Token HOTTOK
    const hottok = req.headers.get("x-hotmart-hottok");
    const configuredHottok = process.env.HOTMART_HOTTOK;

    if (
      configuredHottok &&
      configuredHottok !== "troque-pelo-seu-hottok" &&
      hottok !== configuredHottok
    ) {
      console.warn("[Hotmart Webhook] Rejeitado: HOTTOK inválido");
      return NextResponse.json({ error: "Invalid HOTTOK" }, { status: 401 });
    }

    const body = (await req.json()) as HotmartWebhookPayload;
    const eventId = body.id || `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const eventType = body.event || "UNKNOWN";

    // 2. Registro de Auditoria & Idempotência em webhook_events
    const { error: eventError } = await supabaseAdmin.from("webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      hottok: hottok || null,
      payload: body,
      processed: false,
    });

    if (eventError && eventError.code === "23505") {
      // Evento duplicado já processado
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    const data = body.data;
    if (!data || !data.purchase || !data.product) {
      return NextResponse.json({ received: true, skipped: "payload incompleto" });
    }

    const transactionCode = data.purchase.transaction;
    if (!transactionCode) {
      return NextResponse.json({ received: true, skipped: "sem transaction code" });
    }

    // 3. Processamento de Vendas Aprovadas
    const isApprovedSale =
      eventType === "PURCHASE_APPROVED" ||
      eventType === "PURCHASE_COMPLETE" ||
      data.purchase.status === "APPROVED" ||
      data.purchase.status === "COMPLETE";

    // Processamento de Reembolsos e Cancelamentos
    const isRefund =
      eventType === "PURCHASE_REFUNDED" ||
      eventType === "PURCHASE_CHARGEBACK" ||
      eventType === "PURCHASE_DISPUTE" ||
      data.purchase.status === "REFUNDED" ||
      data.purchase.status === "CHARGEBACK";

    if (isRefund) {
      await supabaseAdmin
        .from("transactions")
        .update({ status: data.purchase.status || "REFUNDED" })
        .eq("transaction_code", transactionCode);

      await supabaseAdmin
        .from("webhook_events")
        .update({ processed: true })
        .eq("event_id", eventId);

      return NextResponse.json({ received: true, refunded: transactionCode });
    }

    if (!isApprovedSale) {
      // Outros eventos (ex: abandono de carrinho, boleto impresso, etc.)
      await supabaseAdmin
        .from("webhook_events")
        .update({ processed: true, error: "Evento ignorado (não aprovado)" })
        .eq("event_id", eventId);

      return NextResponse.json({ received: true, status: eventType });
    }

    // Extração de dados da venda
    const rawProductId = String(data.product.id || "0");
    const rawProductName = cleanProductName(data.product.name || "Produto Sem Nome");
    const buyerEmail = (data.buyer?.email || "").toLowerCase().trim();
    const buyerName = data.buyer?.name || null;
    const buyerPhone = data.buyer?.checkout_phone || null;

    if (!buyerEmail) {
      return NextResponse.json({ received: true, skipped: "sem email de comprador" });
    }

    // Cálculo financeiro (Bruto, Líquido, Taxa)
    const bruto = Number(
      data.purchase.full_price?.value ?? data.purchase.price?.value ?? 0,
    );

    // Líquido = comissão do produtor informada pela Hotmart. Sem ela não há valor real:
    // não gravamos estimativa — o evento fica com erro para revisão e a Hotmart reenvia.
    const producerComm = data.commissions?.find((c) => c.source === "PRODUCER");
    if (!producerComm || typeof producerComm.value !== "number") {
      await supabaseAdmin
        .from("webhook_events")
        .update({ error: "Sem comissão PRODUCER: líquido desconhecido, venda não gravada" })
        .eq("event_id", eventId);
      return NextResponse.json({ error: "Comissão PRODUCER ausente" }, { status: 422 });
    }
    const liquido = producerComm.value;

    const taxaHotmart = Math.max(0, Math.round((bruto - liquido) * 100) / 100); // legado: bruto − líquido

    // Decomposição exata. bruto (valor pago) = juros do comprador + taxa Hotmart + outras comissões + líquido.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const moeda = data.purchase.price?.currency_code || data.purchase.price?.currency_value || null;
    const precoOferta = data.purchase.price?.value;
    const marketplace = data.commissions?.find((c) => c.source === "MARKETPLACE");
    const outras = (data.commissions ?? [])
      .filter((c) => c.source !== "MARKETPLACE" && c.source !== "PRODUCER")
      .reduce((acc, c) => acc + (c.value || 0), 0);
    const decomposed =
      moeda === "BRL" &&
      typeof precoOferta === "number" &&
      typeof marketplace?.value === "number" &&
      Math.abs(precoOferta - (marketplace.value + outras + liquido)) <= 0.05;


    // Data de aprovação
    let approvedAt = new Date().toISOString();
    if (data.purchase.approved_date) {
      const d =
        typeof data.purchase.approved_date === "number"
          ? new Date(data.purchase.approved_date)
          : new Date(data.purchase.approved_date);
      if (!isNaN(d.getTime())) approvedAt = d.toISOString();
    } else if (body.creation_date) {
      const d = new Date(body.creation_date);
      if (!isNaN(d.getTime())) approvedAt = d.toISOString();
    }

    // Classificação da família
    const classification = classifyProduct(rawProductName);

    // Upsert do Produto
    await supabaseAdmin.from("products").upsert({
      id: rawProductId,
      name: rawProductName,
      family: classification.family,
      edition: classification.edition,
      category: classification.category,
      updated_at: new Date().toISOString(),
    });

    // Análise de Histórico do Cliente & Inteligência de Recompra
    const { data: customerData } = await supabaseAdmin
      .from("customers")
      .select("id, email, first_purchase_at, total_purchases, total_spent_bruto, total_spent_liquido")
      .eq("email", buyerEmail)
      .maybeSingle();

    let purchaseSequence = 1;
    let isRecompra = false;
    let daysSinceFirst = 0;
    let daysSincePrev = 0;

    if (customerData) {
      // Cliente já existe: buscar compras anteriores dele
      const { data: prevPurchases } = await supabaseAdmin
        .from("transactions")
        .select("approved_at, product_id")
        .eq("customer_email", buyerEmail)
        .eq("status", "APPROVED")
        .neq("transaction_code", transactionCode)
        .order("approved_at", { ascending: false });

      const prevCount = prevPurchases?.length ?? 0;
      if (prevCount > 0) {
        purchaseSequence = prevCount + 1;
        // Recompra = 1ª compra deste produto por quem já comprou OUTRO produto em instante anterior.
        // Parcelas e repetições do mesmo produto não contam.
        const earlier = prevPurchases!.filter((p) => new Date(p.approved_at) < new Date(approvedAt));
        isRecompra =
          earlier.some((p) => String(p.product_id) !== rawProductId) &&
          !earlier.some((p) => String(p.product_id) === rawProductId);

        const firstDate = new Date(customerData.first_purchase_at || prevPurchases![prevCount - 1].approved_at);
        const lastDate = new Date(prevPurchases![0].approved_at);
        const currentDate = new Date(approvedAt);

        daysSinceFirst = Math.max(0, Math.round((currentDate.getTime() - firstDate.getTime()) / 86400000));
        daysSincePrev = Math.max(0, Math.round((currentDate.getTime() - lastDate.getTime()) / 86400000));
      }
    } else {
      // Primeiro registro do cliente
      await supabaseAdmin.from("customers").insert({
        email: buyerEmail,
        name: buyerName,
        phone: buyerPhone,
        first_purchase_at: approvedAt,
        first_product_id: rawProductId,
        first_product_name: rawProductName,
        total_purchases: 0,
        total_spent_bruto: 0,
        total_spent_liquido: 0,
      });
    }

    // Inserção da Transação
    await supabaseAdmin.from("transactions").upsert({
      transaction_code: transactionCode,
      product_id: rawProductId,
      product_name: rawProductName,
      customer_email: buyerEmail,
      customer_name: buyerName,
      status: "APPROVED",
      approved_at: approvedAt,
      bruto,
      liquido,
      taxa_hotmart: taxaHotmart,
      payment_type: data.purchase.payment?.type || "outro",
      installments: data.purchase.payment?.installments_number || 1,
      purchase_sequence: purchaseSequence,
      is_recompra: isRecompra,
      days_since_first_purchase: daysSinceFirst,
      days_since_prev_purchase: daysSincePrev,
      moeda,
      preco_oferta: decomposed ? r2(precoOferta!) : null,
      taxa_hotmart_exata: decomposed ? r2(marketplace!.value!) : null,
      outras_comissoes: decomposed ? r2(outras) : null,
      fonte_taxa: decomposed ? "webhook" : null,
      tracking_source: data.origin?.sck || data.origin?.src || data.purchase.tracking?.source || null,
      utm_source: data.origin?.utm_source || null,
      utm_medium: data.origin?.utm_medium || null,
      utm_campaign: data.origin?.utm_campaign || null,
      utm_content: data.origin?.utm_content || null,
      utm_term: data.origin?.utm_term || null,
      raw_payload: body,
    });

    // Acumulados do cliente recalculados a partir das transações (idempotente em reentregas)
    const { data: custTx } = await supabaseAdmin
      .from("transactions")
      .select("bruto, liquido")
      .eq("customer_email", buyerEmail)
      .eq("status", "APPROVED");
    const totalPurchases = custTx?.length ?? 0;
    const totalBruto = (custTx ?? []).reduce((acc, t) => acc + (Number(t.bruto) || 0), 0);
    const totalLiquido = (custTx ?? []).reduce((acc, t) => acc + (Number(t.liquido) || 0), 0);

    await supabaseAdmin
      .from("customers")
      .update({
        ...(buyerName ? { name: buyerName } : {}),
        ...(buyerPhone ? { phone: buyerPhone } : {}),
        total_purchases: totalPurchases,
        total_spent_bruto: Math.round(totalBruto * 100) / 100,
        total_spent_liquido: Math.round(totalLiquido * 100) / 100,
        updated_at: new Date().toISOString(),
      })
      .eq("email", buyerEmail);

    // Marca evento como concluído com sucesso
    await supabaseAdmin
      .from("webhook_events")
      .update({ processed: true })
      .eq("event_id", eventId);

    return NextResponse.json({
      received: true,
      transaction: transactionCode,
      is_recompra: isRecompra,
      sequence: purchaseSequence,
    });
  } catch (err: unknown) {
    console.error("[Hotmart Webhook Error]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
