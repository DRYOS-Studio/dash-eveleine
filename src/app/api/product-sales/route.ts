import { NextRequest, NextResponse } from "next/server";
import { getProductSalesDetail } from "@/lib/sales-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || "";

  if (!name) {
    return NextResponse.json({ error: "Parâmetro 'name' é obrigatório" }, { status: 400 });
  }

  try {
    const sales = await getProductSalesDetail(name, 50);
    return NextResponse.json({ sales });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao buscar vendas do produto" },
      { status: 500 },
    );
  }
}
