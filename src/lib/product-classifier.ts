/**
 * Normaliza e categoriza nomes de produtos da Hotmart em famílias e edições canônicas,
 * reproduzindo os agrupamentos do relatório executivo da operação.
 */

export type ProductClassification = {
  family: string;
  edition: string;
  category: "curso" | "workshop" | "imersao" | "gravacao" | "mentoria" | "pack" | "combo" | "outro";
};

export function classifyProduct(rawName: string): ProductClassification {
  const name = (rawName || "").trim();
  const lower = name.toLowerCase();

  // 1. Detectar Edição
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

  // 2. Detectar Família e Categoria
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

  // Fallback: usa o próprio nome
  return {
    family: name || "Outro Produto",
    edition,
    category: "outro",
  };
}
