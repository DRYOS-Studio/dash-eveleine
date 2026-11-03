// Identidade de nome entre fontes. A mesma pessoa chega grafada de jeitos
// diferentes — "Thaís Santos" no banco de vendas, "Thais Santos" no Calendly,
// "thais cardozo" em minúsculas — e sem uma chave comum o cruzamento
// venda × anfitrião da Agenda não fecha.
//
// A chave só ignora o que é GRAFIA: acento, caixa, pontuação e espaço repetido.
// De propósito NÃO há similaridade (Levenshtein, prefixo, primeiro nome):
// "Thaise Vianna" e "Thais Santos" são pessoas diferentes e um fuzzy as juntaria.
// Se duas grafias não colapsam aqui, são tratadas como pessoas distintas.

export const chaveNome = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Mais acentos e iniciais maiúsculas = grafia mais completa ("Thaís Santos" > "thais santos"). */
const qualidade = (v: string) =>
  (v.normalize("NFD").match(/\p{M}/gu)?.length ?? 0) + (v.match(/(^|\s)\p{Lu}/gu)?.length ?? 0);

/** Calendly junta anfitriões de round-robin com ", ". */
const partes = (s: string) => s.split(/,\s*/).filter(Boolean);

/**
 * Dado o conjunto de nomes de TODAS as fontes que vão ser cruzadas, devolve uma
 * função que leva qualquer grafia ao rótulo canônico: a de maior `qualidade`,
 * empate pela mais frequente e depois pela ordem alfabética (determinístico).
 * O rótulo é calculado sobre a união das fontes que o chamador passa: a Vendas
 * passa closer + anfitrião e mostra "Thais Cardozo"; a Agenda sozinha só vê as
 * grafias do Calendly e mantém "thais cardozo". Nome fora da base volta como veio.
 */
export function canonizar(nomes: Iterable<string>): (nome: string) => string {
  const variantes = new Map<string, Map<string, number>>();
  for (const n of nomes) {
    for (const p of partes(n)) {
      const k = chaveNome(p);
      if (!k) continue;
      const m = variantes.get(k) ?? new Map<string, number>();
      m.set(p, (m.get(p) ?? 0) + 1);
      variantes.set(k, m);
    }
  }

  const rotulo = new Map<string, string>();
  for (const [k, m] of variantes) {
    const [melhor] = [...m].sort(
      (a, b) => qualidade(b[0]) - qualidade(a[0]) || b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    rotulo.set(k, melhor[0]);
  }

  return (nome) => {
    const ps = partes(nome);
    if (ps.length === 0) return nome;
    return ps.map((p) => rotulo.get(chaveNome(p)) ?? p).join(", ");
  };
}
