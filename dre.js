// Leitura da DRE (planilha .xlsx completa ou CSV da aba Despesas) e médias mensais usadas no rateio.
// Guarda só totais por rota e por grupo: nomes e salários individuais nunca saem do arquivo.

const MES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const ROTA_CAMPOS = {
  "(-) Custo com pessoal": "pessoal", "(-) Custo com ponto de apoio": "ponto_apoio", "(-) Custo com transporte": "transporte",
  "(-) Custo com imóveis": "imoveis", "(=) Resultado da operação": "resultado_operacao",
};
const GRUPOS = [["ext", "CUSTO | OPERAÇÕES EXTERNAS"], ["int", "CUSTO | OPERAÇÕES INTERNAS"], ["adm", "DESPESAS | ADMINISTRATIVAS"],
  ["com", "DESPESAS | COMERCIAIS"], ["fin", "DESPESAS | FINANCEIRAS"], ["pes", "DESPESAS | PESSOAS"]];
// linhas que ficam fora da estrutura geral (decisão da Leticia, 29/10/2026)
const FORA_ESTRUTURA = [["a_definir", /^\(-\)\s*Despesas Pagas A DEFINIR/i], ["enxoval_estoque", /^\(-\)\s*Env\w*vais estoque/i],
  ["impostos_dp", /^\(-\)\s*Impostos de DP/i], ["ferias", /^\(-\)\s*Férias/i], ["rescisoes", /^\(-\)\s*Rescisões/i]];
const ABA_DESPESAS = "Despesas", ABA_LIMPEZA = "Resultado - Taxa de Limpeza", ABA_RESUMO = "Resumo mensal";

/** Chave de rota que casa Mastertable ("Rota da Cidade do Sol") e DRE ("RN - Rota Ciade do Sol", "RN - Cidade do Sol"). */
export function normRota(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/^\s*[a-z]{2}\s*-\s*([a-z]{2,4}\s*-\s*)?/, "").replace(/\brota\b/g, " ").replace("ciade", "cidade")
    .replace(/\b(da|do|dos|das|de)\b/g, " ").replace(/\s+/g, " ").trim();
}
function valor(s) {
  if (typeof s === "number") return isFinite(s) ? s : 0;
  s = String(s ?? "").replace("R$", "").replace(/\s/g, "");
  if (!s || s === "-" || s === "-,00") return 0;
  const neg = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/[-()]/g, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(s);
  return isFinite(v) ? (neg ? -v : v) : 0;
}
function mesDe(c) {
  if (c instanceof Date) { const d = new Date(c.getTime() + 12 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }
  const m = String(c ?? "").trim().toLowerCase().match(/^([a-zç]{3})\w*\s+(\d{4})$/);
  return m && MES[m[1]] ? `${m[2]}-${String(MES[m[1]]).padStart(2, "0")}` : null;
}
function csvLinhas(texto) {
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
const txt = (v) => String(v ?? "").trim();

/** Aba Despesas (ou o CSV dela): grupos, rotas (operações externas) e dispêndios totais. */
function lerDespesas(rows) {
  const lab = (r) => txt(r[1]);
  const head = rows.find((r) => lab(r).toLowerCase() === "em");
  if (!head) throw new Error("Não achei a linha dos meses (a que começa com \"em\") na aba Despesas.");
  const cols = [];
  head.forEach((c, i) => { const m = i >= 2 && mesDe(c); if (m) cols.push({ i, mes: m }); });
  if (!cols.length) throw new Error("A linha dos meses da aba Despesas não tem nenhum mês reconhecível.");
  const serie = (r) => cols.map((c) => valor(r[c.i]));
  const start = rows.findIndex((r, i) => i > 50 && lab(r).startsWith("CUSTO | OPERA") && lab(r).includes("EXTERNAS"));
  const end = rows.findIndex((r, i) => i > start && lab(r).startsWith("CUSTO | OPERA") && lab(r).includes("INTERNAS"));
  if (start < 0 || end < 0) throw new Error("Não achei o bloco \"CUSTO | OPERAÇÕES EXTERNAS\" com as rotas, no fim da aba Despesas.");
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
  for (const [k, p] of GRUPOS) if (!grupos[k]) throw new Error(`Não achei a linha ${p} no topo da aba Despesas.`);
  // custo médio por pessoa da equipe de campo (linhas "OP - nome" da Operação em folha, ajuda de custo e premiação) + encargos
  const ehCampo = (l) => /^(OP|Op|0P)\b[\s.\-]*-?\s*[A-ZÁÉÍÓÚ][a-zá-ú]/.test(l) && !/Limpeza|Vistoria|Novato|Lavanderia/.test(l);
  const secoes = rows.map((r, i) => [i, lab(r)]).filter(([, l]) => ["FOLHA SALARIAL", "AJUDA DE CUSTO", "PREMIAÇÃO"].includes(l));
  const porSecao = {};
  secoes.forEach(([i, nome], k) => {
    const fim = k + 1 < secoes.length ? secoes[k + 1][0] : rows.length;
    const op = rows.findIndex((r, j) => j >= i && j < fim && lab(r).startsWith("OPERAÇÃO"));
    if (op < 0) return;
    const pessoas = rows.slice(op, fim).filter((r) => ehCampo(lab(r)));
    porSecao[nome] = cols.map((c) => ({ total: pessoas.reduce((s, r) => s + valor(r[c.i]), 0), n: pessoas.filter((r) => valor(r[c.i]) > 0).length }));
  });
  const folhaTot = rows.find((r) => lab(r) === "FOLHA SALARIAL");
  const impDP = rows.find((r) => lab(r).startsWith("(-) Impostos de DP"));
  const campo = porSecao["FOLHA SALARIAL"] ? cols.map((c, j) => {
    const f = porSecao["FOLHA SALARIAL"][j];
    if (!f.n) return null;
    const enc = folhaTot && impDP && valor(folhaTot[c.i]) > 0 ? valor(impDP[c.i]) / valor(folhaTot[c.i]) : 0;
    const extra = ["AJUDA DE CUSTO", "PREMIAÇÃO"].reduce((s, k) => s + (porSecao[k]?.[j].total || 0), 0);
    return (f.total * (1 + enc) + extra) / f.n;
  }) : null;
  // equipe de campo por rota e mês (só a contagem): pessoas com folha > 0 nas subseções "Agente de Vistoria" e "Limpeza" de cada rota
  const equipe = {};
  const fs = rows.findIndex((r) => lab(r) === "FOLHA SALARIAL");
  const fa = rows.findIndex((r, i) => i > fs && lab(r) === "AJUDA DE CUSTO");
  const opi = rows.findIndex((r, i) => i > fs && i < fa && lab(r).startsWith("OPERAÇÃO"));
  if (opi > 0) {
    let cur = null, sub = null;
    for (const r of rows.slice(opi + 1, fa)) {
      const l = lab(r);
      if (/\bRota\b/.test(l) && / - /.test(l.slice(0, 9))) { cur = normRota(l); sub = null; equipe[cur] = { vistoria: cols.map(() => 0), limpeza: cols.map(() => 0) }; continue; }
      if (/Lavanderia/i.test(l) && /rateio/i.test(l)) { cur = null; continue; }
      if (!cur) continue;
      if (/^(OP|Op)\.?\s*Agente/i.test(l)) { sub = "vistoria"; continue; }
      if (/^(OP|Op)\.?\s*-?\s*Limpeza$/i.test(l)) { sub = "limpeza"; continue; }
      if (!sub || l === "RATEIO" || !l || /Novato/i.test(l)) continue;
      cols.forEach((c, j) => { if (valor(r[c.i]) > 0) equipe[cur][sub][j] += 1; });
    }
  }
  const fora = {};
  for (const [k, re] of FORA_ESTRUTURA) { const r = rows.find((x) => re.test(lab(x))); if (r) fora[k] = serie(r); }
  return { meses: cols.map((c) => c.mes), rotas, grupos, total, campo, equipe, fora };
}

/** Aba "Resultado - Taxa de Limpeza": faturamento, equipe de limpeza e terceirizados (lavanderia, material, limpeza) por rota. */
function lerLimpeza(rows, meses) {
  const hi = rows.findIndex((r) => txt(r[0]).toLowerCase() === "rota" && txt(r[1]).toLowerCase() === "linha");
  if (hi < 0) return null;
  const ano = meses[0].slice(0, 4);
  const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const cols = [];
  rows[hi].forEach((c, i) => {
    const k = NOMES.indexOf(txt(c).toLowerCase());
    if (k >= 0) { const j = meses.indexOf(`${ano}-${String(k + 1).padStart(2, "0")}`); if (j >= 0) cols.push({ i, j }); }
  });
  const serie = (r) => { const s = meses.map(() => 0); cols.forEach(({ i, j }) => (s[j] = valor(r[i]))); return s; };
  const out = {};
  let cur = null;
  for (const r of rows.slice(hi + 1)) {
    const a = txt(r[0]), b = txt(r[1]);
    if (a && !b) { cur = { nome: a }; out[normRota(a)] = cur; continue; }
    if (!cur || !b) continue;
    if (b.startsWith("(+) Faturamento")) cur.faturamento = serie(r);
    else if (b.startsWith("(-) Custo da equipe")) cur.equipe = serie(r);
    else if (b.startsWith("(-) Custo da operação")) cur.terceirizada = serie(r);
  }
  return out;
}

/** Aba "Resumo mensal": receita bruta e impostos sobre vendas, para a alíquota efetiva. */
function lerImpostos(rows) {
  const head = rows.find((r) => txt(r[1]).toLowerCase() === "em");
  if (!head) return null;
  const cols = [];
  head.forEach((c, i) => { const m = i >= 2 && mesDe(c); if (m) cols.push({ i, mes: m }); });
  const serie = (r) => cols.map((c) => valor(r[c.i]));
  let receita = null; const imp = cols.map(() => 0);
  for (const r of rows) {
    const l = txt(r[1]);
    if (l === "RECEITA BRUTA" && !receita) receita = serie(r);
    if (/^ISS\b|^Imposto sobre vendas/i.test(l)) serie(r).forEach((v, j) => (imp[j] += v));
  }
  return receita ? { meses: cols.map((c) => c.mes), receita_bruta: receita, impostos: imp } : null;
}

/**
 * Lê a DRE. `entrada` pode ser o texto de um CSV (aba Despesas) ou um objeto {abas: {nome: linhas[][]}} vindo do .xlsx.
 * Devolve a DRE mensal (ou lança erro com a explicação).
 */
export function parseDre(entrada, arquivo) {
  const abas = typeof entrada === "string" ? { [ABA_DESPESAS]: csvLinhas(entrada) } : entrada.abas;
  if (!abas[ABA_DESPESAS]) throw new Error(`A planilha não tem a aba "${ABA_DESPESAS}".`);
  const { meses, rotas, grupos, total, campo, equipe, fora } = lerDespesas(abas[ABA_DESPESAS]);
  const limpeza = abas[ABA_LIMPEZA] ? lerLimpeza(abas[ABA_LIMPEZA], meses) : null;
  const impostos = abas[ABA_RESUMO] ? lerImpostos(abas[ABA_RESUMO]) : null;
  const somaRotas = meses.map((_, j) => Object.values(rotas).reduce((s, v) => s + (v.total[j] || 0), 0));
  const somaGrupos = meses.map((_, j) => GRUPOS.reduce((s, [k]) => s + grupos[k][j], 0));
  const tot = total || somaGrupos;
  // mês fechado = rotas com transporte e ponto de apoio lançados (projeções vêm sem eles)
  const real = meses.map((_, j) => Object.values(rotas).reduce((s, v) => s + (v.transporte?.[j] || 0), 0) > 0
    && Object.values(rotas).reduce((s, v) => s + (v.ponto_apoio?.[j] || 0), 0) > 0);
  const avisos = [];
  meses.forEach((m, j) => {
    if (!real[j]) return;
    if (Math.abs(somaRotas[j] - grupos.ext[j]) > 1) avisos.push(`${m}: a soma das rotas (${somaRotas[j].toFixed(2)}) não bate com Operações externas (${grupos.ext[j].toFixed(2)}).`);
    if (Math.abs(somaGrupos[j] - tot[j]) > 1) avisos.push(`${m}: a soma dos grupos não bate com Dispêndios totais.`);
  });
  if (!real.some(Boolean)) throw new Error("Nenhum mês tem custos de rota lançados (transporte e ponto de apoio).");
  if (!limpeza) avisos.push(`Sem a aba "${ABA_LIMPEZA}": os custos de equipe de limpeza e terceirizados (lavanderia, material, limpeza) ficam de fora. Envie a planilha .xlsx completa.`);
  if (!impostos) avisos.push(`Sem a aba "${ABA_RESUMO}": os impostos sobre vendas ficam de fora.`);
  return { arquivo: arquivo || null, meses, real, rotas, grupos, total: tot, limpeza, impostos, custo_pessoa_campo: campo, equipe, fora_estrutura: fora, avisos };
}

/** Converte um workbook do SheetJS no formato que parseDre espera (só as abas usadas). */
export function abasDoXlsx(wb, XLSX) {
  const abas = {};
  for (const nome of [ABA_DESPESAS, ABA_LIMPEZA, ABA_RESUMO])
    if (wb.Sheets[nome]) abas[nome] = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
  return { abas };
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
  const limpeza = {};
  for (const [k, v] of Object.entries(dre.limpeza || {}))
    limpeza[k] = { nome: v.nome, faturamento: avg(v.faturamento), equipe: avg(v.equipe), terceirizada: avg(v.terceirizada) };
  const grupos = Object.fromEntries(Object.entries(dre.grupos).map(([k, v]) => [k, avg(v)]));
  const estruturaBruta = Object.entries(grupos).filter(([k]) => k !== "ext").reduce((s, [, v]) => s + v, 0);
  const fora = Object.fromEntries(Object.entries(dre.fora_estrutura || {}).map(([k, v]) => [k, avg(v)]));
  const estrutura = estruturaBruta - Object.values(fora).reduce((s, v) => s + v, 0);
  let aliquota = 0;
  if (dre.impostos) {
    const cols = usados.map((u) => dre.impostos.meses.indexOf(dre.meses[u.col])).filter((i) => i >= 0);
    const rec = cols.reduce((s, i) => s + dre.impostos.receita_bruta[i], 0), imp = cols.reduce((s, i) => s + dre.impostos.impostos[i], 0);
    aliquota = rec > 0 ? imp / rec : 0;
  }
  const cp = (dre.custo_pessoa_campo || []);
  const cpUsados = usados.map((u) => cp[u.col]).filter((v) => v > 0);
  const salarioCampo = cpUsados.length ? cpUsados.reduce((s, v) => s + v, 0) / cpUsados.length : null;
  const equipe = {};
  for (const [k, v] of Object.entries(dre.equipe || {})) equipe[k] = { limpeza: avg(v.limpeza), vistoria: avg(v.vistoria) };
  return { rotas, limpeza, grupos, estrutura, estruturaBruta, fora, total: avg(dre.total), aliquota, salarioCampo, equipe };
}
