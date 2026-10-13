import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getProductSalesDetail, resolveDateRange, sanitizePeriod } from "@/lib/sales-data";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const family = searchParams.get("family") || "";
  if (!family) {
    return NextResponse.json({ error: "Parâmetro 'family' é obrigatório" }, { status: 400 });
  }

  const period = sanitizePeriod({
    range: searchParams.get("range"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  const { from, to } = resolveDateRange(period.range, period.from, period.to);

  try {
    const { sales, total } = await getProductSalesDetail(family, from, to, 50);
    return NextResponse.json({ sales, total });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? "Erro ao buscar vendas da família" },
      { status: 500 },
    );
  }
}
