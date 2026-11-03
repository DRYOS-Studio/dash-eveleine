import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLeads, RANGE_KEYS, resolvePeriod } from "@/lib/data";
import { AGENDA_KEYS, getAgenda, getPresenca, resolveAgendaPeriod } from "@/lib/agenda";
import { getPresencaClosers, getVendas } from "@/lib/vendas";

// Aquece o Data Cache dos filtros predefinidos das 3 telas. As chaves do cache incluem a
// data (a janela "30 dias" de hoje não é a de ontem), então à 00:00 de São Paulo todas
// viram chaves novas e a 1ª visita de cada filtro esperava a leitura inteira (medido em
// produção: Captação "Tudo" 7,1 s frio × 0,56 s quente). O cron do vercel.json chama
// isto logo depois da virada. Chama AS MESMAS funções cacheadas que as páginas — é isso
// que faz a página achar a entrada pronta.
//
// Sequencial de propósito: paginar a view em paralelo já se mostrou mais lento.

export const dynamic = "force-dynamic";
// Fluid Compute ligado no projeto → teto 300 s; o warm frio levou 64 s local.
export const maxDuration = 300;

/** Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`. Sem a env, ninguém passa. */
function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Item = { tela: string; filtro: string; ok: boolean; ms: number; erro?: string };

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const itens: Item[] = [];
  const medir = async (tela: string, filtro: string, fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      itens.push({ tela, filtro, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`warm ${tela}/${filtro}: ${erro}`);
      itens.push({ tela, filtro, ok: false, ms: Date.now() - t0, erro: erro.slice(0, 200) });
    }
  };

  // "hoje" de Captação e Vendas fica de fora: aquecido à 00:05, a 1ª visita da manhã veria
  // ~0 leads/vendas (servido do cache enquanto renova). Frio ele custa < 1 s.
  const SEM_HOJE = RANGE_KEYS.filter((k) => k !== "hoje");

  for (const k of SEM_HOJE) {
    await medir("captacao", k, () => getLeads(resolvePeriod({ range: k })));
  }
  for (const k of AGENDA_KEYS) {
    const p = resolveAgendaPeriod({ range: k });
    await medir("agenda", k, async () => {
      await getAgenda(p);
      // aquece o cache de fetch dos convidados (por evento); falha por evento é tolerada
      // na página, mas aqui conta: senão "ok" esconderia um warm parcial
      const { falhas } = await getPresenca(p);
      if (falhas) throw new Error(`${falhas} evento(s) sem resposta do Calendly`);
    });
  }
  for (const k of SEM_HOJE) {
    await medir("vendas", k, async () => {
      const v = await getVendas(resolvePeriod({ range: k }));
      // a tabela de closers da página faz esta mesma chamada (vendas/page.tsx)
      if (v.janelaPresenca) {
        // getPresencaClosers engole o erro do Calendly (a página segue sem a coluna)
        const { indisponivel } = await getPresencaClosers(v.janelaPresenca, v.byCloser);
        if (indisponivel) throw new Error("presença por anfitrião indisponível (Calendly)");
      }
    });
  }

  const ok = itens.every((i) => i.ok);
  return NextResponse.json({ ok, itens }, { status: ok ? 200 : 500 });
}
