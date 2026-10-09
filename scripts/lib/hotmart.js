/** Helpers compartilhados pelos scripts da Hotmart (CSV exportado e API de pagamentos). */

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

const API = "https://developers.hotmart.com/payments/api/v1/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if (res.status === 429 && attempt < 5) {
    await sleep(5000 * (attempt + 1));
    return getJson(url, options, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function token(basic) {
  const d = await getJson(
    "https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials",
    { method: "POST", headers: { Authorization: `Basic ${basic}` } },
  );
  return d.access_token;
}

async function pages(path, params, tk) {
  const out = [];
  let pageToken = null;
  do {
    const q = new URLSearchParams({ ...params, max_results: "500" });
    if (pageToken) q.set("page_token", pageToken);
    const d = await getJson(`${API}${path}?${q}`, { headers: { Authorization: `Bearer ${tk}` } });
    out.push(...d.items);
    pageToken = d.page_info?.next_page_token || null;
  } while (pageToken);
  return out;
}

// A API recusa janelas longas: usa semestres.
function windows() {
  const out = [];
  const end = Date.now();
  for (let y = 2024; y <= new Date().getUTCFullYear(); y++) {
    for (const [m1, m2] of [[0, 6], [6, 12]]) {
      const a = Date.UTC(y, m1, 1);
      if (a > end) continue;
      out.push([a, Math.min(Date.UTC(y, m2, 1) - 1, end)]);
    }
  }
  return out;
}

module.exports = { parseCsv, token, pages, windows };
