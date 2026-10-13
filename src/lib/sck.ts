/**
 * Leitura do `sck` da Hotmart (parâmetro de rastreio da venda) — fonte única para o webhook e para /performance.
 *
 * O `sck` chega em formatos diferentes por origem, separados por "|" (nomes de campanha usam " | " com espaços,
 * que não separa). A posição de cada campo muda conforme o template do link:
 *   metaads|placement|campanha|anúncio|conjunto
 *   Facebook-Ads / Meta-ads|conjunto|campanha|anúncio|placement   (4 partes: conjunto e campanha vêm colados em `conjunto`)
 *   trafego|paid|campanha|anúncio|id                              (3 partes: campanha|anúncio)
 *   demais com 5 partes: origem|mídia|campanha|conteúdo|termo     (ex.: instagram, ig, grp-new)
 *   origem sozinha: direct, HOTMART_PRODUCT_PAGE, manychat, ...
 * "undefined", "null" e macros não resolvidas ({{placement}}) valem como vazio.
 */

export type ParsedSck = {
  /** Primeiro token em minúsculas (ex.: "metaads"); null quando não há rastreio. */
  origem: string | null;
  /** Nome de exibição agrupando templates equivalentes (metaads, Facebook-Ads e Meta-ads = Meta Ads). */
  canal: string;
  campanha: string | null;
  conjunto: string | null;
  anuncio: string | null;
  posicionamento: string | null;
};

export const SEM_RASTREIO = "Sem rastreio";

const SEP = /(?<!\s)\|(?!\s)/;

function limpo(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t || /^(undefined|null)$/i.test(t) || /^\{\{.*\}\}$/.test(t)) return null;
  return t;
}

// Só aceita como posicionamento valores com cara de posicionamento (a última parte também carrega códigos como "DCI05").
function posic(v: string | undefined): string | null {
  const t = limpo(v);
  return t && /^(instagram|facebook|messenger|audience|threads)/i.test(t) ? t : null;
}

const CANAIS: Record<string, string> = {
  metaads: "Meta Ads",
  "facebook-ads": "Meta Ads",
  "meta-ads": "Meta Ads",
  direct: "Direto",
  hotmart_product_page: "Página do produto (Hotmart)",
  hotmart_sales_agent: "Agente de vendas (Hotmart)",
};

function canalDe(origem: string): string {
  if (CANAIS[origem]) return CANAIS[origem];
  if (origem.startsWith("hotmart_club")) return "Área de membros (Hotmart)";
  return origem;
}

const VAZIO: ParsedSck = { origem: null, canal: SEM_RASTREIO, campanha: null, conjunto: null, anuncio: null, posicionamento: null };

export function parseSck(raw: string | null | undefined): ParsedSck {
  const t = (raw ?? "").trim();
  if (!t || /^null(-null)*$/i.test(t)) return VAZIO;

  const p = t.split(SEP).map((x) => x.trim());
  if (p.every((x) => limpo(x) === null)) return VAZIO;

  const origem = limpo(p[0])?.toLowerCase() ?? null;
  const campos = { campanha: null as string | null, conjunto: null as string | null, anuncio: null as string | null, posicionamento: null as string | null };
  const n = p.length;

  if (n === 1) {
    // Só um nome de campanha, sem origem (ex.: "PARTIU EMPREENDER | VENDAS | ...").
    if (/\s\|\s/.test(t)) return { ...VAZIO, canal: "Só nome de campanha", campanha: t };
  } else if (origem === "metaads") {
    campos.posicionamento = posic(p[1]);
    campos.campanha = limpo(p[2]);
    campos.anuncio = limpo(p[3]);
    campos.conjunto = limpo(p[4]);
  } else if (origem === "facebook-ads" || origem === "meta-ads") {
    if (n >= 5) {
      campos.conjunto = limpo(p[1]);
      campos.campanha = limpo(p[2]);
      campos.anuncio = limpo(p[3]);
      campos.posicionamento = posic(p[4]);
    } else if (n === 4) {
      campos.conjunto = limpo(p[1]);
      campos.anuncio = limpo(p[2]);
      campos.posicionamento = posic(p[3]);
    } else if (n === 3) {
      campos.conjunto = limpo(p[1]);
      campos.campanha = limpo(p[2]);
    } else {
      campos.conjunto = limpo(p[1]);
    }
  } else if (origem === "trafego") {
    if (n >= 4) {
      campos.campanha = limpo(p[2]);
      campos.anuncio = limpo(p[3]);
    } else {
      campos.campanha = limpo(p[1]);
      campos.anuncio = limpo(p[2]);
    }
  } else if (n >= 5) {
    // origem|mídia|campanha|conteúdo|termo
    campos.campanha = limpo(p[2]);
    campos.anuncio = limpo(p[3]);
  }

  return { origem, canal: origem ? canalDe(origem) : SEM_RASTREIO, ...campos };
}
