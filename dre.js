// Leitura da DRE por rota (CSV exportado da planilha, separado por ";") e médias mensais usadas no rateio.
// Guarda só totais por rota e por grupo de despesa: nomes e salários individuais nunca saem do arquivo.

const MES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const ROTA_CAMPOS = {
  "(-) Custo com pessoal": "pessoal", "(-) Custo com ponto de apoio": "ponto_apoio", "(-) Custo com transporte": "transporte",
  "(-) Custo com imóveis": "imoveis", "(=) Resultado da operação": "resultado_operacao",
};
const GRUPOS = [["ext", "CUSTO | OPERAÇÕES EXTERNAS"], ["int", "CUSTO | OPERAÇÕES INTERNAS"], ["adm", "DESPESAS | ADMINISTRATIVAS"],
  ["com", "DESPESAS | COMERCIAIS"], ["fin", "DESPESAS | FINANCEIRAS"], ["pes", "DESPESAS | PESSOAS"]];

export function normRota(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/^.*?rota/, "rota").replace("ciade", "cidade").replace(/\b(da|do|dos|das|de)\b/g, " ").replace(/\s+/g, " ").trim();
}
function valor(s) {
  s = String(s || "").replace("R$", "").replace(/\s/g, "");
  if (!s || s === "-" || s === "-,00") return 0;
  const neg = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/[-()]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(s);
  return isFinite(v) ? (neg ? -v : v) : 0;
}
function linhas(texto) {
  // CSV simples com ";" e aspas
  const out = [];
  for (const raw of texto.split(/\r?\n/)) {
    const row = []; let cur = "", q = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') { if (q && raw[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ";" && !q) { row.push(cur); cur = ""; }
      else cur += c;
    }
    row.push(cur); out.push(row);
  }
  return out;
}

/** Lê o texto do CSV e devolve a DRE mensal (ou lança erro com a explicação). */
export function parseDre(texto, arquivo) {
  const rows = linhas(texto);
  const lab = (r) => (r[1] || "").trim();
  const head = rows.find((r) => lab(r).toLowerCase() === "em");
  if (!head) throw new Error("Não achei a linha dos meses (a que começa com \"em\" e traz jan 2026, fev 2026…).");
  const cols = [];
  head.forEach((c, i) => {
    const m = String(c).trim().toLowerCase().match(/^([a-zç]{3})\w*\s+(\d{4})$/);
    if (m && MES[m[1]]) cols.push({ i, mes: `${m[2]}-${String(MES[m[1]]).padStart(2, "0")}` });
  });
  if (!cols.length) throw new Error("A linha dos meses não tem nenhum mês no formato \"jan 2026\".");
  const serie = (r) => cols.map((c) => valor(r[c.i]));
  const start = rows.findIndex((r, i) => i > 50 && lab(r).startsWith("CUSTO | OPERA") && lab(r).includes("EXTERNAS"));
  const end = rows.findIndex((r, i) => i > start && lab(r).startsWith("CUSTO | OPERA") && lab(r).includes("INTERNAS"));
  if (start < 0 || end < 0) throw new Error("Não achei o bloco \"CUSTO | OPERAÇÕES EXTERNAS\" com as rotas, no fim da planilha.");
  const rotas = {};
  let cur = null;
  for (const r of rows.slice(start + 1, end)) {
    const l = lab(r);
    if (/\bRota\b/.test(l) && !l.startsWith("(")) { cur = normRota(l); rotas[cur] = { nome_dre: l, total: serie(r) }; continue; }
    if (cur && ROTA_CAMPOS[l]) rotas[cur][ROTA_CAMPOS[l]] = serie(r);
  }
  if (!Object.keys(rotas).length) throw new Error("O bloco de operações externas não tem nenhuma linha de rota.");
  const grupos = {};
  let total = null;
  for (const r of rows.slice(0, 30)) {
    const l = lab(r);
    if (l.startsWith("DISPÊNDIOS TOTAIS") || l.startsWith("DISPENDIOS TOTAIS")) total = serie(r);
    for (const [k, p] of GRUPOS) if (l.startsWith(p) && !grupos[k]) grupos[k] = serie(r);
  }
  for (const [k] of GRUPOS) if (!grupos[k]) throw new Error(`Não achei a linha do grupo ${GRUPOS.find((g) => g[0] === k)[1]} no topo da planilha.`);
  const meses = cols.map((c) => c.mes);
  const somaRotas = meses.map((_, j) => Object.values(rotas).reduce((s, v) => s + (v.total[j] || 0), 0));
  const somaGrupos = meses.map((_, j) => GRUPOS.reduce((s, [k]) => s + grupos[k][j], 0));
  if (!total) total = somaGrupos;
  // mês fechado = rotas com transporte e ponto de apoio lançados (projeções vêm sem eles)
  const real = meses.map((_, j) => Object.values(rotas).reduce((s, v) => s + (v.transporte?.[j] || 0), 0) > 0
    && Object.values(rotas).reduce((s, v) => s + (v.ponto_apoio?.[j] || 0), 0) > 0);
  const avisos = [];
  meses.forEach((m, j) => {
    if (!real[j]) return;
    if (Math.abs(somaRotas[j] - grupos.ext[j]) > 1) avisos.push(`${m}: a soma das rotas (${somaRotas[j].toFixed(2)}) não bate com Operações externas (${grupos.ext[j].toFixed(2)}).`);
    if (Math.abs(somaGrupos[j] - total[j]) > 1) avisos.push(`${m}: a soma dos grupos não bate com Dispêndios totais.`);
  });
  if (!real.some(Boolean)) throw new Error("Nenhum mês tem custos de rota lançados (transporte e ponto de apoio).");
  return { arquivo: arquivo || null, meses, real, rotas, grupos, total, avisos };
}

/** Meses usados: os fechados + os seguintes até o mês atual, repetindo o último mês fechado; só os que têm receita. */
export function mesesUsados(dre, mesesReceita, hoje = new Date()) {
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const ultimoReal = dre.real.lastIndexOf(true);
  const out = [];
  dre.meses.forEach((m, j) => {
    if (!mesesReceita.includes(m)) return;
    if (dre.real[j]) out.push({ mes: m, col: j, estimado: false });
    else if (j > ultimoReal && m <= atual) out.push({ mes: m, col: ultimoReal, estimado: true });
  });
  return out;
}

/** Médias mensais no período usado. */
export function mediasDre(dre, usados) {
  const n = usados.length || 1;
  const avg = (arr) => (arr ? usados.reduce((s, u) => s + (arr[u.col] || 0), 0) / n : 0);
  const rotas = {};
  for (const [k, v] of Object.entries(dre.rotas))
    rotas[k] = { nome_dre: v.nome_dre, total: avg(v.total), pessoal: avg(v.pessoal), ponto_apoio: avg(v.ponto_apoio), transporte: avg(v.transporte), imoveis: avg(v.imoveis) };
  const grupos = Object.fromEntries(Object.entries(dre.grupos).map(([k, v]) => [k, avg(v)]));
  const estrutura = Object.entries(grupos).filter(([k]) => k !== "ext").reduce((s, [, v]) => s + v, 0);
  return { rotas, grupos, estrutura, total: avg(dre.total) };
}
