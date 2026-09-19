import "server-only";
import { getLeadsByCalendlyEvent } from "./data";
import type { CalendlyEvent, CalendlyInvitee } from "./calendly";

// ─────────────────────────────────────────────────────────────────────────────
// DADOS FALSOS para olhar a tela antes de existir CALENDLY_TOKEN.
//
// Ativo só com CALENDLY_FIXTURE=1 e fora de produção (ver `agenda.ts`). Este
// arquivo é descartável: apagá-lo e remover as duas linhas de `agenda.ts`
// devolve o app ao estado de produção.
//
// O que é real aqui: os UUIDs. São lidos da view `leads_consolidados`, então o
// cruzamento lead↔reunião resolve de verdade e as quebras por formulário e por
// utm_source mostram os rótulos reais do banco. O que é inventado: horário,
// status, agenda, anfitrião, no-show e nome do convidado.

const AGENDAS = [
  "Diagnóstico Versalhes — 45 min",
  "Aplicação Direta — 30 min",
  "Onboarding Versalhes",
  "Consultoria Individual",
];

// nomes de fachada; nada aqui corresponde a pessoa real
const HOSTS = ["Consultora A (demo)", "Consultora B (demo)", "Consultora C (demo)"];
const PRIMEIROS = ["Ana", "Beatriz", "Carolina", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Ferreira", "Gonçalves", "Moreira"];
const MOTIVOS = ["Imprevisto de agenda", "Vou remarcar", "Não consigo neste horário", null];

/** PRNG determinístico por semente: a mesma tela renderiza igual a cada F5. */
function rng(semente: string) {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

const pega = <T,>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length];

/** UUID sintético estável, pra simular reunião marcada fora do funil. */
const uuidFalso = (n: number) =>
  `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`;

export async function fixtureEventos(
  from: string,
  to: string,
): Promise<CalendlyEvent[]> {
  // UUIDs reais, pra as quebras por formulário/UTM terem rótulos de verdade
  const reais = [...(await getLeadsByCalendlyEvent()).keys()];

  const eventos: CalendlyEvent[] = [];
  const ini = Date.parse(from);
  const fim = Date.parse(to);
  let i = 0;

  for (let t = ini; t < fim; t += 86_400_000) {
    const dia = new Date(t);
    const semana = new Date(t - 3 * 3600_000).getUTCDay(); // dia da semana em SP
    const r = rng(dia.toISOString().slice(0, 10));
    const quantos = semana === 0 || semana === 6 ? Math.floor(r() * 3) : 8 + Math.floor(r() * 12);

    for (let k = 0; k < quantos; k++) {
      // 1 em 6 não tem lead no banco — simula link direto e remarcação
      const uuid = i % 6 === 5 ? uuidFalso(i) : reais[(i * 7) % reais.length] ?? uuidFalso(i);
      i++;
      const s = rng(uuid + k);

      const hora = 9 + Math.floor(s() * 9); // 09h–17h em SP
      const minuto = s() < 0.5 ? 0 : 30;
      const inicio = Date.parse(
        `${dia.toISOString().slice(0, 10)}T${String(hora + 3).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00Z`,
      );
      const cancelada = s() < 0.12;

      eventos.push({
        uri: `https://api.calendly.com/scheduled_events/${uuid}`,
        name: pega(AGENDAS, s()),
        status: cancelada ? "canceled" : "active",
        start_time: new Date(inicio).toISOString(),
        end_time: new Date(inicio + 45 * 60_000).toISOString(),
        event_type: `https://api.calendly.com/event_types/demo-${Math.floor(s() * 4)}`,
        event_memberships: [{ user: "demo", user_name: pega(HOSTS, s()) }],
        ...(cancelada && {
          cancellation: {
            canceled_by: "demo",
            reason: pega(MOTIVOS, s()),
            canceler_type: s() < 0.3 ? ("host" as const) : ("invitee" as const),
            created_at: new Date(inicio - 3600_000).toISOString(),
          },
        }),
      });
    }
  }

  return eventos.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

export async function fixtureInvitees(
  eventos: CalendlyEvent[],
): Promise<Map<string, CalendlyInvitee[]>> {
  const mapa = new Map<string, CalendlyInvitee[]>();

  for (const e of eventos) {
    const uuid = e.uri.split("/").pop()!;
    const s = rng("inv" + uuid + e.start_time);
    const passou = Date.parse(e.end_time) <= Date.now();
    // ~22% de falta entre as que já aconteceram
    const faltou = passou && e.status === "active" && s() < 0.22;

    mapa.set(uuid, [
      {
        uri: `https://api.calendly.com/scheduled_events/${uuid}/invitees/demo`,
        name: `${pega(PRIMEIROS, s())} ${pega(SOBRENOMES, s())}`,
        email: "demo@exemplo.invalid",
        status: e.status === "canceled" ? "canceled" : "active",
        no_show: faltou ? { uri: "demo", created_at: e.end_time } : null,
        rescheduled: false,
        new_invitee: null,
      },
    ]);
  }

  return mapa;
}
