// Paleta categórica do design system Altis (Cortex) — sem roxo.
export const CHART_COLORS = [
  "hsl(18, 55%, 43%)", // terracota (accent)
  "hsl(160, 60%, 39%)", // esmeralda
  "hsl(197, 40%, 40%)", // teal
  "hsl(38, 80%, 52%)", // dourado
  "hsl(24, 80%, 58%)", // laranja
  "hsl(210, 42%, 52%)", // azul sóbrio
];

export function colorAt(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}
