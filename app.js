import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseDre, abasDoXlsx, mesesUsados, mediasDre, normRota } from "./dre.js?v=3";

const SUPABASE_URL = "https://ucavfotyciwnqwurzjny.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYXZmb3R5Y2l3bnF3dXJ6am55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzUzNjYsImV4cCI6MjA3MzU1MTM2Nn0.nE_W8wZZvJfzlvhP83ge1J0ooS3EcFVSlQYK28eTGU0";
const ALLOWED_DOMAIN = "@carpediemhomes.com.br";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const OSRM = "https://router.project-osrm.org";
const NAO_OPERACIONAIS = new Set(["Proprietário", "Terceirizada", null, undefined, ""]);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pct = (x) => (isFinite(x) ? Math.round(x * 100) + "%" : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MES_NOME = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

const CLASSE = {
  remover: { nome: "Remover", cor: "#C2402A", ordem: 0 },
  abaixo: { nome: "Abaixo da meta", cor: "#E07B24", ordem: 1 },
  atencao: { nome: "Atenção", cor: "#C9A206", ordem: 2 },
  maturando: { nome: "Maturando", cor: "#3A68B8", ordem: 3 },
  manter: { nome: "Manter", cor: "#2F8A57", ordem: 4 },
};
const END_CLASSE = {
  sair: { nome: "Sair do endereço", css: "remover" },
  rever: { nome: "Rever endereço", css: "abaixo" },
  manter: { nome: "Manter endereço", css: "manter" },
  novo: { nome: "Endereço novo", css: "maturando" },
};

let P = null;          // payload
let U = [];            // unidades
let OP = [];           // unidades operacionais (com rota, coordenada e anúncio)
let END = new Map();   // endereço (parada) -> resumo
let ROT = new Map();   // rota -> resumo
let D = null;          // médias da DRE no período usado
let USADOS = [];       // meses do período: {mes, col, estimado}
const params = { meta: 10, rateio: "igual", pkm: 50, sal: null, cons: 10, tr: 1.3 };
const PONTO_EMPRESA = new Set(["cidade sol"]);   // ponto de apoio de Natal (Living Tirol) atende a empresa inteira: vai para a estrutura
const salario = () => params.sal || D?.salarioCampo || 2500;
const precoGas = (uf) => (P.combustivel || {})[uf] ?? (P.combustivel || {})._BR ?? 6.6;

/* ---------------- parâmetros ---------------- */
function loadParams() {
  try { Object.assign(params, JSON.parse(localStorage.getItem("raiox-params-v9") || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem("raiox-params-v9", JSON.stringify(params)); } catch (e) {} };
  const bind = (id, k, num) => {
    const el = document.getElementById(id);
    el.value = params[k];
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { params[k] = num ? parseFloat(el.value) || 0 : el.value; save(); recompute(); });
  };
  bind("pMeta", "meta", true); bind("pRateio", "rateio", false); bind("pKm", "pkm", true); { const el = $("#pSal"); el.value = params.sal ?? ""; el.addEventListener("input", () => { params.sal = parseFloat(el.value) || null; try { localStorage.setItem("raiox-params-v9", JSON.stringify(params)); } catch (e) {} recompute(); }); } bind("pCons", "cons", true); bind("pTr", "tr", true);
}
// dias com ao menos uma visita no mês: visitas no mesmo dia viram uma viagem só
const viagens = (visitas) => 30 * (1 - Math.exp(-visitas / 30));

/* ---------------- cálculo ---------------- */
function periodo() {
  USADOS = mesesUsados(P.dre, P.meses);
  D = mediasDre(P.dre, USADOS);
  return USADOS.map((x) => P.meses.indexOf(x.mes));
}
const dreRota = (rota) => D.rotas[normRota(rota)];
const mesTxt = (m) => MES_NOME[+m.slice(5) - 1] + "/" + m.slice(2, 4);
function periodoTxt() {
  if (!USADOS.length) return "—";
  const est = USADOS.filter((x) => x.estimado);
  const ultReal = P.dre.meses[P.dre.real.lastIndexOf(true)];
  return `${mesTxt(USADOS[0].mes)} a ${mesTxt(USADOS.at(-1).mes)}` + (est.length ? ` (${est.map((x) => mesTxt(x.mes)).join(", ")} repetem ${mesTxt(ultReal)})` : "");
}
function recompute() {
  const idx = periodo();
  for (const u of U) {
    const ini = (u.inicio || u.criado || "2000-01").slice(0, 7);
    const ativos = idx.filter((i) => P.meses[i] >= ini);
    const n = ativos.length || 0;
    const avg = (k) => (n ? sum(ativos, (i) => u.serie[i][k]) / n : 0);
    u.mesesP = n;
    u.brutaP = avg(0); u.admP = avg(1); u.limpP = avg(2); u.resP = avg(3);
    u.receitaCD = u.admP + u.limpP;
    u.visitas = u.resP + u.ch_mes;
    u.op = !NAO_OPERACIONAIS.has(u.rota) && u.lat != null && u.parada != null && !u.sem_stays;
    u.temRotaDre = !!dreRota(u.rota);
  }
  OP = U.filter((u) => u.op);
  // endereços (para km e quem paga o transporte)
  END = new Map();
  for (const u of OP) {
    if (!END.has(u.parada)) END.set(u.parada, { id: u.parada, us: [], rota: u.rota, km: u.desvio_km || 0, min: u.desvio_min || 0, base: !!u.base });
    END.get(u.parada).us.push(u);
  }
  for (const e of END.values()) {
    e.n = e.us.length;
    e.visitas = sum(e.us, (u) => u.visitas);
    e.viagens = viagens(e.visitas);
    e.kmMes = e.viagens * e.km;
    e.nome = stopName(e.us);
  }
  // rateio do custo direto de cada rota (DRE), MÊS A MÊS: o custo do mês é dividido pelas visitas de todos os imóveis
  // que estavam na rota naquele mês (inclusive os que já saíram); cada imóvel paga só os meses em que estava ativo
  ROT = new Map();
  let apoioEmpresa = 0;
  const visU = (u, i) => (u.serie[i][3] || 0) + ((u.ch_serie || [])[i] || 0);
  for (const rota of new Set(U.map((u) => u.rota).filter((r) => dreRota(r)))) {
    const key = normRota(rota), dr = P.dre.rotas[key], Lr = (P.dre.limpeza || {})[key], rm = (P.rota_mes || {})[rota] || {};
    const us = U.filter((u) => u.rota === rota && !u.sem_stays);
    const ponto = P.rotas[rota]?.ponto;
    const apoioDaEmpresa = PONTO_EMPRESA.has(key);
    const acc = new Map(us.map((u) => [u, { pess: 0, apoio: 0, transp: 0, imov: 0, lEq: 0, lTe: 0, comb: 0, tempo: 0, idas: 0 }]));
    let somaCusto = 0, somaV = 0, somaZ = 0, somaLimp = 0, somaF = 0, somaT = 0;
    for (const { mes, col } of USADOS) {
      const i = P.meses.indexOf(mes);
      const act = us.filter((u) => mes >= (u.inicio || u.criado || "2000-01").slice(0, 7));
      const [resR, chR] = rm[mes] || [0, 0];
      const Vr = Math.max(resR + chR, sum(act, (u) => visU(u, i))) || 1;
      const Zr = Math.max(resR, sum(act, (u) => u.serie[i][3] || 0)) || 1;
      const Cr = Math.max(chR, sum(act, (u) => (u.ch_serie || [])[i] || 0));
      const pess = dr.pessoal?.[col] || 0, tra = dr.transporte?.[col] || 0, imo = dr.imoveis?.[col] || 0;
      let apo = dr.ponto_apoio?.[col] || 0;
      if (apoioDaEmpresa) { apoioEmpresa += apo; apo = 0; }
      const eq = Lr?.equipe?.[col] || 0, te = Lr?.terceirizada?.[col] || 0;
      // deslocamento do mês: idas do ponto operacional até cada endereço
      let F = 0, Tm = 0;
      if (ponto) {
        const eV = new Map();
        for (const u of act) eV.set(u.parada, (eV.get(u.parada) || 0) + visU(u, i));
        for (const u of act) {
          const v = visU(u, i), ev = eV.get(u.parada);
          if (u.ida_km == null || !v || !ev) continue;
          const idas = viagens(ev) * (v / ev);
          const comb = idas * (u.ida_km / Math.max(1, params.cons)) * precoGas(u.uf);
          const tempo = idas * (u.ida_min * params.tr / 60) * (salario() / 220);
          const a2 = acc.get(u); a2.comb += comb; a2.tempo += tempo; a2.idas += idas; F += comb; Tm += tempo;
        }
      }
      const pessR = Math.max(0, pess - Tm), traR = Math.max(0, tra - F);
      for (const u of act) {
        const v = visU(u, i), z = u.serie[i][3] || 0, c = (u.ch_serie || [])[i] || 0, a2 = acc.get(u);
        a2.pess += pessR * (v / Vr); a2.apoio += apo * (v / Vr); a2.transp += traR * (v / Vr);
        a2.imov += imo * (Cr > 0 ? c / Cr : v / Vr);
        a2.lEq += eq * (z / Zr); a2.lTe += te * (z / Zr);
      }
      somaCusto += pess + apo + tra + imo; somaV += Vr; somaZ += Zr; somaLimp += eq + te; somaF += F; somaT += Tm;
    }
    for (const u of us) {
      const a2 = acc.get(u), n = u.mesesP || 1;
      u.cPessoal = a2.pess / n; u.cApoio = a2.apoio / n; u.cTranspVis = a2.transp / n; u.cTranspKm = 0; u.cImoveis = a2.imov / n;
      u.cLimpEquipe = a2.lEq / n; u.cLimpTerc = a2.lTe / n;
      u.cDescComb = a2.comb / n; u.cDescTempo = a2.tempo / n; u.viagensU = a2.idas / n; u.kmU = 0;
    }
    const nm = USADOS.length || 1;
    ROT.set(rota, { rota, d: D.rotas[key], us, V: somaV / nm, Z: somaZ / nm, Lp: D.limpeza[key], ponto, apoioDaEmpresa,
      F: somaF / nm, Tm: somaT / nm, custoVisita: somaCusto / (somaV || 1), custoLimpeza: somaLimp / (somaZ || 1) });
  }
  D.apoioEmpresa = apoioEmpresa / (USADOS.length || 1);
  D.estruturaTotal = D.estrutura + D.apoioEmpresa;
  // estrutura
  const nImoveis = U.filter((u) => !u.sem_stays).length;
  const recTot = sum(U.filter((u) => !u.sem_stays), (u) => u.receitaCD) || 1;
  for (const u of U) {
    if (!u.temRotaDre || u.sem_stays) { u.cPessoal = u.cApoio = u.cTranspVis = u.cTranspKm = u.cImoveis = u.kmU = u.cLimpEquipe = u.cLimpTerc = u.cDescComb = u.cDescTempo = 0; }
    u.custoRota = u.cPessoal + u.cApoio + u.cTranspVis + u.cTranspKm + u.cImoveis + u.cLimpEquipe + u.cLimpTerc + (u.cDescComb || 0) + (u.cDescTempo || 0);
    u.impostos = D.aliquota * Math.max(0, u.receitaCD - u.cLimpEquipe - u.cLimpTerc);
    u.estrutura = u.sem_stays ? 0 : params.rateio === "igual" ? D.estruturaTotal / nImoveis : D.estruturaTotal * (u.receitaCD / recTot);
    u.lucro = u.receitaCD - u.custoRota - u.impostos - u.estrutura;
    u.margem = u.receitaCD > 0 ? u.lucro / u.receitaCD : -Infinity;
    u.contribuicao = u.receitaCD - u.custoRota - u.impostos;
  }
  const chP90 = [...OP.map((u) => u.ch_mes)].sort((a, b) => a - b)[Math.floor(OP.length * 0.9)] || 99;
  for (const e of END.values()) {
    e.receita = sum(e.us, (u) => u.receitaCD);
    e.custoRota = sum(e.us, (u) => u.custoRota);
    e.estrutura = sum(e.us, (u) => u.estrutura);
    e.impostos = sum(e.us, (u) => u.impostos);
    e.resultado = sum(e.us, (u) => u.lucro);
    e.margem = e.receita > 0 ? e.resultado / e.receita : -Infinity;
    e.bruta = sum(e.us, (u) => u.brutaP);
    e.positivos = e.us.filter((u) => u.lucro > 0);
    e.todosNovos = e.us.every((u) => u.novo);
    e.classe = e.todosNovos ? "novo" : e.resultado < 0 ? "sair" : e.margem < params.meta / 100 ? "rever" : "manter";
    e.semTop = null;
    if (e.n > 1) {
      e.top = e.us.reduce((a, u) => (u.lucro > a.lucro ? u : a), e.us[0]);
      e.semTop = e.resultado - e.top.lucro;
    }
  }
  for (const u of OP) classify(u, END.get(u.parada), chP90);
  for (const u of U) if (!u.op) { u.classe = null; u.motivos = []; }
  renderAll();
}

function classify(u, e, chP90) {
  const m = [];
  const meta = params.meta / 100;
  let classe = "manter";
  if (!u.novo && u.receitaCD <= 0) {
    classe = "atencao";
    m.push(["atencao", "Nenhuma reserva no período neste cadastro. Confira se as reservas estão caindo em outro anúncio na Stays antes de decidir."]);
  } else if (u.lucro < 0) {
    classe = "remover";
    m.push(["remover", `Dá prejuízo com os custos rateados: entram ${brl.format(u.receitaCD)}/mês e saem ${brl.format(u.custoRota)} da rota + ${brl.format(u.estrutura)} de estrutura (${brl.format(u.lucro)}/mês).`]);
  } else if (u.margem < meta) {
    classe = "abaixo";
    m.push(["abaixo", `Lucra ${brl.format(u.lucro)}/mês, margem de ${pct(u.margem)}, abaixo da meta de ${params.meta}%. Os recursos dele renderiam mais num imóvel novo com margem maior.`]);
  }
  if (u.ch_mes >= chP90 && u.ch_mes > 0) {
    if (classe === "manter") classe = "atencao";
    m.push(["atencao", `Muitos chamados: ${n1.format(u.ch_mes)} por mês, entre os 10% mais altos da base.`]);
  }
  if (classe === "manter") m.push(["manter", `Margem de ${pct(u.margem)} (${brl.format(u.lucro)}/mês) depois de pagar a parte dele na rota e na estrutura.`]);
  // endereço
  if (e.n > 1) {
    const ec = END_CLASSE[e.classe].nome.toLowerCase();
    m.push(["info", `Endereço ${e.nome}: ${e.n} imóveis, resultado ${brl.format(e.resultado)}/mês (margem ${pct(e.margem)}): ${ec}.`]);
    if (e.semTop != null && e.resultado >= 0 && e.semTop < 0 && e.top === u) m.push(["info", "É este imóvel que sustenta o endereço: sem ele, o endereço daria prejuízo."]);
    if (e.semTop != null && e.resultado >= 0 && e.semTop < 0 && e.top !== u) m.push(["info", `O endereço só fica positivo por causa de ${e.top.publico || e.top.nome} (${brl.format(e.top.lucro)}/mês).`]);
  }
  // troca de rota
  if (u.outra_rota && u.viz_km > 1 && u.outra_km < u.viz_km * 0.5) {
    const a = ROT.get(u.rota), b = ROT.get(u.outra_rota);
    const comp = a && b ? ` A visita custa ${brl.format(a.custoVisita)} na ${u.rota} e ${brl.format(b.custoVisita)} na ${u.outra_rota}.` : "";
    m.push(["troca", `Fica a ${n1.format(u.outra_km)} km de uma parada da ${u.outra_rota} e a ${n1.format(u.viz_km)} km da parada mais próxima da própria rota. Vale avaliar a troca.${comp}`]);
  }
  if (u.kmU > 0 && e.n === 1 && u.cTranspKm > u.receitaCD * 0.1) m.push(["info", `Fora do caminho: o km a mais até ele custa ${brl.format(u.cTranspKm)}/mês de transporte.`]);
  if (u.novo) {
    const regra = classe;
    classe = "maturando";
    m.unshift(["maturando", `${u.reativado ? `Reativado em ${fmtData(u.inicio)} (${u.inicio_motivo})` : `Começou em ${fmtData(u.inicio)} (${u.inicio_motivo})`}, ainda em maturação (menos de 6 meses).${regra === "remover" ? " Pelo resultado de hoje estaria em Remover." : regra === "abaixo" ? " Pelo resultado de hoje estaria abaixo da meta." : ""}`]);
    u.regraSeMaduro = regra;
  }
  u.classe = classe;
  u.motivos = m;
  u.motivoCurto = (m.find((x) => x[0] === classe) || m[0] || ["", ""])[1];
  u.locRuim = u.novo && (u.regraSeMaduro === "remover");
  u.endClasse = e.classe;
  u.endNome = e.nome;
  u.endResultado = e.resultado;
  u.trocaRota = m.some((x) => x[0] === "troca");
}

/* ---------------- helpers visuais ---------------- */
const pill = (c) => (c ? `<span class="pill ${c}">${CLASSE[c].nome}</span>` : "");
const pillEnd = (c) => `<span class="pill ${END_CLASSE[c].css}">${END_CLASSE[c].nome}</span>`;
const fmtData = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) : "—");
const rotasOp = () => [...new Set(OP.map((u) => u.rota))].sort((a, b) => a.localeCompare(b, "pt-BR"));
function fillRotaSelect(sel, todas) {
  const cur = sel.value;
  sel.innerHTML = (todas ? `<option value="">${todas}</option>` : "") + rotasOp().map((r) => `<option>${esc(r)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
const limpaEmp = (s) => String(s || "").replace(/^\[IN\]\./, "").replace(/^[A-Za-z]{2,4}(-[A-Za-z]{2,4}){1,3}[.-]/, "").replace(/\/.*$/, "")
  .replace(/[._]/g, " ").replace(/([a-zà-ú])([A-Z0-9])/g, "$1 $2").replace(/\s+/g, " ").trim();
function stopName(us) {
  if (!us.length) return "—";
  const emp = us.find((u) => u.empreend)?.empreend;
  if (emp) return limpaEmp(emp);
  if (us.length > 1) return (us[0].endereco || "").split(" - ")[0] || limpaEmp(us[0].nome);
  return us[0].publico || limpaEmp(us[0].nome);
}

/* ---------------- aba Decisão ---------------- */
let sortKey = "classe", sortAsc = true;
const COLS = [
  ["nome", "Imóvel"], ["endNome", "Empreendimento / endereço"], ["rota", "Rota"], ["classe", "Imóvel"], ["endClasse", "Endereço"], ["motivoCurto", "Motivo"],
  ["receitaCD", "Fica p/ Carpediem", "r"], ["custoRota", "Custo da rota", "r"], ["estrutura", "Estrutura", "r"], ["lucro", "Lucro/mês", "r"], ["margem", "Margem", "r"], ["ch_mes", "Chamados/mês", "r"],
];
function renderKpis() {
  const by = (c) => OP.filter((u) => u.classe === c);
  const rem = by("remover"), ab = by("abaixo"), at = by("atencao"), mat = by("maturando");
  const ends = [...END.values()];
  const eSair = ends.filter((e) => e.classe === "sair"), eRever = ends.filter((e) => e.classe === "rever");
  const rec = sum(U, (u) => u.receitaCD), luc = sum(U, (u) => u.lucro);
  $("#kpis").innerHTML = `
    <div class="kpi"><span class="k">Resultado da operação</span><span class="v">${brl.format(luc)}</span><span class="s">por mês: ${brl.format(rec)} ficam para a Carpediem − ${brl.format(sum(U, (u) => u.custoRota))} de rotas (operação, limpeza e lavanderia) − ${brl.format(sum(U, (u) => u.impostos))} de impostos − ${brl.format(D.estruturaTotal)} de estrutura. Margem ${pct(luc / rec)}. Período ${periodoTxt()}</span></div>
    <div class="kpi bad"><span class="k">Remover</span><span class="v">${rem.length}</span><span class="s">Dão prejuízo com custos rateados: ${brl.format(sum(rem, (u) => u.lucro))}/mês somados</span></div>
    <div class="kpi warn"><span class="k">Abaixo da meta (${params.meta}%)</span><span class="v">${ab.length}</span><span class="s">Lucram, mas pouco: ${brl.format(sum(ab, (u) => u.lucro))}/mês somados</span></div>
    <div class="kpi bad"><span class="k">Endereços</span><span class="v">${eSair.length} / ${eRever.length}</span><span class="s">${eSair.length} dão prejuízo no todo · ${eRever.length} abaixo da meta, de ${ends.length} endereços</span></div>
    <div class="kpi new"><span class="k">Maturando</span><span class="v">${mat.length}</span><span class="s">${mat.filter((u) => u.locRuim).length} hoje dariam prejuízo</span></div>
    <div class="kpi"><span class="k">Podem trocar de rota</span><span class="v">${OP.filter((u) => u.trocaRota).length}</span><span class="s">Mais perto de outra rota do que da própria · ${at.length} em Atenção por chamados</span></div>`;
}
function renderTable() {
  const rota = $("#fRota").value, classe = $("#fClasse").value, q = $("#fBusca").value.trim().toLowerCase(), outra = $("#fOutra").checked, ec = $("#fEnd").value;
  let rows = OP.filter((u) => (!rota || u.rota === rota) && (!classe || u.classe === classe) && (!ec || u.endClasse === ec) && (!outra || u.trocaRota)
    && (!q || [u.nome, u.publico, u.empreend, u.endNome, u.bairro, u.endereco].some((s) => (s || "").toLowerCase().includes(q))));
  const ord = { sair: 0, rever: 1, novo: 2, manter: 3 };
  rows.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "classe") { const d = CLASSE[x].ordem - CLASSE[y].ordem; return (sortAsc ? 1 : -1) * (d || a.lucro - b.lucro); }
    if (sortKey === "endClasse") { const d = ord[x] - ord[y]; return (sortAsc ? 1 : -1) * (d || a.endResultado - b.endResultado); }
    if (typeof x === "string" || typeof y === "string") return (sortAsc ? 1 : -1) * String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
    return (sortAsc ? 1 : -1) * ((x ?? -1e12) - (y ?? -1e12));
  });
  $("#fCount").textContent = `${rows.length} imóveis`;
  const head = "<thead><tr>" + COLS.map(([k, t, c]) => `<th data-k="${k}" class="${c || ""} ${k === sortKey ? "sorted" + (sortAsc ? " asc" : "") : ""}">${t}</th>`).join("") + "</tr></thead>";
  const body = rows.slice(0, 800).map((u) => `<tr data-id="${u.id}">
    <td class="nome"><b>${esc(u.publico || u.nome)}</b><span>${esc(u.nome)}</span></td>
    <td class="nome"><b>${esc(u.endNome)}</b><span>${u.na_parada > 1 ? u.na_parada + " imóveis no endereço" : "imóvel único"}</span></td>
    <td>${esc(u.rota)}</td><td>${pill(u.classe)}</td><td>${u.na_parada > 1 ? pillEnd(u.endClasse) : '<span class="muted small">—</span>'}</td><td class="motivo">${esc(u.motivoCurto)}</td>
    <td class="r">${brl.format(u.receitaCD)}</td><td class="r">${brl.format(u.custoRota)}</td><td class="r">${brl.format(u.estrutura)}</td>
    <td class="r ${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)}</td><td class="r ${u.margem < 0 ? "neg" : ""}">${pct(u.margem)}</td><td class="r">${n2.format(u.ch_mes)}</td></tr>`).join("");
  $("#tbl").innerHTML = head + "<tbody>" + body + "</tbody>";
}

/* ---------------- gaveta de detalhe ---------------- */
function openUnit(id) {
  const u = U.find((x) => String(x.id) === String(id));
  if (!u) return;
  const e = END.get(u.parada);
  const R = ROT.get(u.rota);
  const maxV = Math.max(1, ...u.serie.map((s) => s[0]));
  const W = 470, H = 150, bw = W / u.serie.length;
  const bars = u.serie.map((s, i) => {
    const h1 = (s[0] / maxV) * (H - 24), h2 = ((s[1] + s[2]) / maxV) * (H - 24);
    const m = P.meses[i];
    return `<g><title>${MES_NOME[+m.slice(5) - 1]}/${m.slice(2, 4)}: bruta ${brl.format(s[0])} · Carpediem ${brl.format(s[1] + s[2])} · ${n1.format(s[3])} reservas</title>
      <rect x="${i * bw + 4}" y="${H - 18 - h1}" width="${bw - 8}" height="${h1}" fill="#C9DCD9" rx="2"></rect>
      <rect x="${i * bw + 4}" y="${H - 18 - h2}" width="${bw - 8}" height="${h2}" fill="#0E6B6B" rx="2"></rect>
      <text x="${i * bw + bw / 2}" y="${H - 4}" font-size="10" text-anchor="middle" fill="#7D8A96">${MES_NOME[+m.slice(5) - 1]}</text></g>`;
  }).join("");
  const tipos = Object.entries(u.ch_tipos || {}).sort((a, b) => b[1] - a[1]);
  const why = u.op ? `<div class="why ${u.classe}"><b>Por que ${CLASSE[u.classe].nome.toLowerCase()}</b><ul>${u.motivos.map((m) => `<li>${esc(m[1])}</li>`).join("")}</ul></div>` : '<p class="muted">Fora das rotas operacionais: só a estrutura entra na conta.</p>';
  const share = R ? `${pct(u.visitas / R.V)} das visitas da rota` : "";
  const evitavel = u.cPessoal + u.cApoio + u.cTranspVis + u.cImoveis + (e && e.n === 1 ? u.cTranspKm : 0);
  $("#drawerBody").innerHTML = `
    <h2>${esc(u.publico || u.nome)}</h2>
    <p class="muted small">${esc(u.nomes.join(" · "))}${u.dup ? " · anúncios duplicados unificados" : ""}</p>
    <p>${u.op ? pill(u.classe) : ""} ${e && e.n > 1 ? pillEnd(e.classe) : ""}</p>
    <p class="small"><b>${esc(u.endNome || stopName([u]))}</b> · ${esc(u.endereco || "")}</p>
    ${why}
    <h3>A conta do imóvel (média por mês, ${periodoTxt()}${u.mesesP < USADOS.length ? `, ${u.mesesP} meses ativos` : ""})</h3>
    <table class="calc">
      <tr><td>Receita bruta<span class="sub">total pago pelos hóspedes</span></td><td>${brl.format(u.brutaP)}</td></tr>
      <tr><td>Taxa de administração<span class="sub">${pct(u.taxa)} sobre o líquido da reserva (total − comissão do portal − taxa de limpeza)</span></td><td>${brl.format(u.admP)}</td></tr>
      <tr><td>Taxa de limpeza ${u.recolhe ? "recolhida" : "(repassada ao dono)"}</td><td>${brl.format(u.limpP)}</td></tr>
      <tr class="tot"><td>Fica para a Carpediem</td><td>${brl.format(u.receitaCD)}</td></tr>
      <tr><td>Pessoal da operação da rota${R && R.ponto ? " (sem o tempo de deslocamento)" : ""}<span class="sub">${share} (${n1.format(u.visitas)} visitas/mês: limpezas + chamados)</span></td><td>−${brl.format(u.cPessoal)}</td></tr>
      <tr><td>Ponto de apoio da rota<span class="sub">pelas visitas</span></td><td>−${brl.format(u.cApoio)}</td></tr>
      ${R && R.ponto ? `
      <tr><td>Deslocamento: combustível<span class="sub">${n1.format(u.viagensU)} idas/mês × ${n1.format(u.ida_km)} km ida e volta do ponto operacional ÷ ${n1.format(params.cons)} km/l × ${brl2.format(precoGas(u.uf))}/l</span></td><td>−${brl.format(u.cDescComb)}</td></tr>
      <tr><td>Deslocamento: tempo da equipe<span class="sub">${n1.format(u.viagensU)} idas/mês × ${n1.format(u.ida_min * params.tr)} min ida e volta (com trânsito) × ${brl2.format(salario() / 220)}/h (custo médio por pessoa da equipe de campo, ${brl.format(salario())} ÷ 220 h)</span></td><td>−${brl.format(u.cDescTempo)}</td></tr>
      <tr><td>Resto do transporte da rota<span class="sub">veículos, combustível e outros da DRE que sobram depois do deslocamento acima, pelas visitas</span></td><td>−${brl.format(u.cTranspVis)}</td></tr>` : `
      <tr><td>Transporte da rota<span class="sub">transporte da rota no mês × fatia de visitas (rota sem ponto operacional informado)</span></td><td>−${brl.format(u.cTranspVis)}</td></tr>
      `}
      <tr><td>Custo com imóveis da rota<span class="sub">pelos chamados (${n2.format(u.ch_mes)}/mês)</span></td><td>${u.cImoveis < 0 ? "+" + brl.format(-u.cImoveis) : "−" + brl.format(u.cImoveis)}</td></tr>
      <tr><td>Equipe de limpeza da rota<span class="sub">pelas limpezas: ${n2.format(u.resP)} de ${R ? n1.format(R.Z) : "—"} por mês na rota</span></td><td>−${brl.format(u.cLimpEquipe)}</td></tr>
      <tr><td>Lavanderia, material e limpeza terceirizados<span class="sub">pelas limpezas (custo da rota${R && R.Lp ? `: ${brl.format(R.Lp.terceirizada)}/mês` : ""})</span></td><td>−${brl.format(u.cLimpTerc)}</td></tr>
      <tr><td>Impostos sobre vendas<span class="sub">${n1.format(D.aliquota * 100)}% (alíquota efetiva da DRE) sobre o que fica, já sem a limpeza</span></td><td>−${brl.format(u.impostos)}</td></tr>
      <tr class="tot"><td>Contribuição (depois da rota e dos impostos)</td><td class="${u.contribuicao < 0 ? "neg" : ""}">${brl.format(u.contribuicao)}</td></tr>
      <tr><td>Estrutura da empresa<span class="sub">${params.rateio === "igual" ? `${brl.format(D.estruturaTotal)}/mês ÷ ${U.filter((x) => !x.sem_stays).length} imóveis${D.apoioEmpresa ? ` (inclui ${brl.format(D.apoioEmpresa)} do ponto de apoio de Natal)` : ""}` : "proporcional ao que fica para a Carpediem"}</span></td><td>−${brl.format(u.estrutura)}</td></tr>
      <tr class="tot"><td>Lucro do imóvel</td><td class="${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)} · ${pct(u.margem)}</td></tr>
      ${e && e.n > 1 ? `<tr class="tot"><td>Endereço inteiro (${e.n} imóveis)</td><td class="${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)} · ${pct(e.margem)}</td></tr>` : ""}
    </table>
    ${u.op ? `<p class="small muted">Se sair só este imóvel: deixam de entrar ${brl.format(u.receitaCD)}/mês e deixam de sair cerca de ${brl.format(evitavel)}/mês da rota${e && e.n > 1 ? " (o km até o endereço continua, porque os outros imóveis ficam)" : ""}. A parte da estrutura (${brl.format(u.estrutura)}) só vira economia se for cortada ou ocupada por um imóvel novo.</p>` : ""}
    <h3>Receita mês a mês</h3>
    <svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita mensal">${bars}</svg>
    <p class="small muted"><span style="color:#8fb3ae">■</span> bruta &nbsp; <span style="color:#0E6B6B">■</span> fica para a Carpediem</p>
    <h3>Chamados de manutenção (12 meses): ${u.ch}</h3>
    ${tipos.length ? `<div class="dgrid">${tipos.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div>
      <p class="small muted">${Object.entries(u.ch_nat || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}<br>Origem: ${Object.entries(u.ch_origem || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</p>` : '<p class="muted small">Nenhum chamado no período.</p>'}
    <h3>Rota e cadastro</h3>
    <p class="small muted">${esc(u.rota || "—")} · líder ${esc(u.lider || "—")}${R ? ` · custo da rota por visita ${brl.format(R.custoVisita)}` : ""}<br>Cadastro na Stays em ${fmtData(u.criado)}${u.reativado ? ` · reativado em ${fmtData(u.inicio)} (${esc(u.inicio_motivo)})` : ""} · anúncios ${esc(u.stays.join(", "))}${u.ids_inativos ? ` + ${u.ids_inativos} já desativado(s), com as reservas do período somadas` : ""}</p>`;
  $("#drawer").hidden = false;
}

/* ---------------- mapa base ---------------- */
function baseMap(el) {
  const m = L.map(el, { zoomControl: true, preferCanvas: true }).setView([-8.06, -34.9], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap", className: "tiles-soft" }).addTo(m);
  return m;
}
function tipHtml(u) {
  const e = END.get(u.parada);
  return `<div class="tip-emp">${esc(u.endNome)}${e && e.n > 1 ? ` · ${e.n} imóveis` : ""}</div><h4>${esc(u.publico || u.nome)}</h4>${pill(u.classe)} ${e && e.n > 1 ? pillEnd(e.classe) : ""}
  <p style="max-width:280px;white-space:normal;margin:6px 0">${esc(u.motivoCurto)}</p>
  <table><tr><td>Fica p/ Carpediem</td><td>${brl.format(u.receitaCD)}</td></tr>
  <tr><td>Custo da rota</td><td>${brl.format(u.custoRota)}</td></tr>
  <tr><td>Impostos</td><td>${brl.format(u.impostos)}</td></tr>
  <tr><td>Estrutura</td><td>${brl.format(u.estrutura)}</td></tr>
  <tr><td>Lucro/mês</td><td>${brl.format(u.lucro)} (${pct(u.margem)})</td></tr>
  ${e && e.n > 1 ? `<tr><td>Endereço inteiro</td><td>${brl.format(e.resultado)} (${pct(e.margem)})</td></tr>` : ""}</table>`;
}
const radius = (u) => 4 + Math.min(12, Math.sqrt(Math.max(0, u.brutaP)) / 9);
function spread(us) {
  const by = {};
  us.forEach((u) => (by[u.parada] = by[u.parada] || []).push(u));
  const out = [];
  for (const g of Object.values(by)) {
    g.forEach((u, i) => {
      if (g.length === 1) return out.push([u, u.lat, u.lng]);
      const a = (2 * Math.PI * i) / g.length, r = 0.00012 * Math.min(4, 1 + g.length / 8);
      out.push([u, u.lat + r * Math.cos(a), u.lng + r * Math.sin(a) * 1.01]);
    });
  }
  return out;
}

/* ---------------- aba Mapa ---------------- */
let mapa = null, mLayer = null;
function renderMapa() {
  if ($("#tab-mapa").hidden) return;
  if (!mapa) { mapa = baseMap("map"); mLayer = L.layerGroup().addTo(mapa); }
  fillRotaSelect($("#mRota"), "Todas as rotas");
  const rota = $("#mRota").value, porEnd = $("#mPorEnd").checked, nomes = $("#mNomes").checked;
  const us = OP.filter((u) => !rota || u.rota === rota);
  const ends = [...new Set(us.map((u) => u.parada))].map((id) => END.get(id));
  mLayer.clearLayers();
  if (rota && P.rotas[rota]) {
    const ord = P.rotas[rota].ordem;
    L.polyline([...ord, ord[0]], { color: "#17232F", weight: 1.5, opacity: 0.45, dashArray: "4 5" }).addTo(mLayer);
  }
  const pto = rota && P.rotas[rota]?.ponto;
  if (pto) L.marker([pto.lat, pto.lng], { icon: L.divIcon({ className: "start-pin", iconSize: [18, 18] }) })
    .bindTooltip(`<div class="tip-emp">Ponto operacional</div><h4>${esc(rota)}</h4>${esc(pto.endereco || "")}`, { className: "tip", direction: "top" }).addTo(mLayer);
  if (porEnd) {
    for (const e of ends) {
      const c = e.us[0];
      L.circleMarker([c.lat, c.lng], { radius: 6 + Math.min(14, Math.sqrt(e.n) * 3), color: "#fff", weight: 1.5, fillColor: { sair: "#C2402A", rever: "#E07B24", manter: "#2F8A57", novo: "#3A68B8" }[e.classe], fillOpacity: 0.9 })
        .bindTooltip(`<div class="tip-emp">${esc(e.nome)}</div><h4>${e.n} imóveis · ${END_CLASSE[e.classe].nome}</h4><table><tr><td>Fica p/ Carpediem</td><td>${brl.format(e.receita)}</td></tr><tr><td>Custo da rota</td><td>${brl.format(e.custoRota)}</td></tr><tr><td>Impostos</td><td>${brl.format(e.impostos)}</td></tr><tr><td>Estrutura</td><td>${brl.format(e.estrutura)}</td></tr><tr><td>Resultado</td><td>${brl.format(e.resultado)} (${pct(e.margem)})</td></tr><tr><td>Imóveis no lucro</td><td>${e.positivos.length} de ${e.n}</td></tr></table>`, { className: "tip", direction: "top", sticky: true })
        .on("click", () => openStop(e)).addTo(mLayer);
    }
  } else {
    for (const [u, la, ln] of spread(us)) {
      L.circleMarker([la, ln], { radius: radius(u), color: "#fff", weight: 1.2, fillColor: CLASSE[u.classe].cor, fillOpacity: 0.9 })
        .bindTooltip(tipHtml(u), { className: "tip", direction: "top", sticky: true })
        .on("click", () => openUnit(u.id)).addTo(mLayer);
    }
  }
  if (nomes) for (const e of ends) {
    const c = e.us[0];
    L.tooltip({ permanent: true, direction: "right", className: "stop-label", offset: [8, 0] }).setLatLng([c.lat, c.lng]).setContent(`${esc(e.nome)}${e.n > 1 ? ` (${e.n})` : ""}`).addTo(mLayer);
  }
  if (us.length) mapa.fitBounds(L.latLngBounds(us.map((u) => [u.lat, u.lng])).pad(0.08));
  setTimeout(() => mapa.invalidateSize(), 50);
  $("#mLegend").innerHTML = porEnd
    ? Object.entries(END_CLASSE).map(([k, c]) => `<div class="row"><span class="dot" style="background:${{ sair: "#C2402A", rever: "#E07B24", manter: "#2F8A57", novo: "#3A68B8" }[k]}"></span>${c.nome} <span class="muted">(${ends.filter((e) => e.classe === k).length})</span></div>`).join("") + '<p class="small muted">Tamanho = número de imóveis no endereço. Clique para ver os imóveis.</p>'
    : Object.entries(CLASSE).map(([k, c]) => `<div class="row"><span class="dot" style="background:${c.cor}"></span>${c.nome} <span class="muted">(${us.filter((u) => u.classe === k).length})</span></div>`).join("") + '<p class="small muted">Tamanho = receita bruta por mês. Passe o mouse para ver o motivo, clique para a conta completa.</p>';
  const R = rota ? ROT.get(rota) : null;
  $("#mResumo").innerHTML = `
    <div class="stat"><span>Imóveis / endereços</span><b>${us.length} / ${ends.length}</b></div>
    <div class="stat"><span>Fica p/ Carpediem/mês</span><b>${brl.format(sum(us, (u) => u.receitaCD))}</b></div>
    <div class="stat"><span>Custo direto da rota/mês</span><b>${brl.format(sum(us, (u) => u.custoRota))}</b></div>
    <div class="stat"><span>Impostos/mês</span><b>${brl.format(sum(us, (u) => u.impostos))}</b></div>
    <div class="stat"><span>Estrutura rateada/mês</span><b>${brl.format(sum(us, (u) => u.estrutura))}</b></div>
    <div class="stat"><span>Lucro/mês</span><b>${brl.format(sum(us, (u) => u.lucro))}</b></div>
    ${R ? `<div class="stat"><span>Custo da rota por visita</span><b>${brl.format(R.custoVisita)}</b></div>` : ""}`;
  if (rota && P.rotas[rota]) {
    const Rr = P.rotas[rota];
    const eSair = ends.filter((e) => e.classe === "sair");
    const remIdx = new Set(eSair.map((e) => +e.id.split("#").pop()));
    const keep = Rr.pts.map((_, i) => i).filter((i) => !remIdx.has(i));
    let novoKm = Rr.km;
    if (Rr.D && keep.length > 1 && remIdx.size) { const D = keep.map((i) => keep.map((j) => Rr.D[i][j])); novoKm = pathLen(solveTsp(D, 0, true), D, true); }
    $("#mSim").innerHTML = eSair.length ? `<div class="callout bad"><b>Sem os ${eSair.length} endereços que dão prejuízo</b><br>
      O circuito cai de ${n1.format(Rr.km)} km para <b>${n1.format(novoKm)} km</b>. Saem ${sum(eSair, (e) => e.n)} imóveis, que deixam ${brl.format(sum(eSair, (e) => e.receita))}/mês e custam ${brl.format(sum(eSair, (e) => e.custoRota + e.estrutura))}/mês: o resultado melhora ${brl.format(-sum(eSair, (e) => e.resultado))}/mês.</div>`
      : '<div class="callout">Nenhum endereço desta rota dá prejuízo no todo com os parâmetros atuais.</div>';
  } else $("#mSim").innerHTML = '<p class="small muted">Escolha uma rota para ver o circuito e simular a saída dos endereços que dão prejuízo.</p>';
}

/* ---------------- TSP (vizinho mais próximo + 2-opt + Or-opt) ---------------- */
function pathLen(t, D, closed) {
  let s = 0;
  for (let i = 0; i + 1 < t.length; i++) s += D[t[i]][t[i + 1]];
  if (closed && t.length > 1) s += D[t[t.length - 1]][t[0]];
  return s;
}
function solveTsp(D, start = 0, closed = true) {
  const n = D.length;
  if (n <= 2) return [...Array(n).keys()];
  const left = new Set([...Array(n).keys()]); left.delete(start);
  let t = [start];
  while (left.size) {
    const c = t[t.length - 1]; let best = null, bd = Infinity;
    for (const j of left) if (D[c][j] < bd) { bd = D[c][j]; best = j; }
    t.push(best); left.delete(best);
  }
  let cur = pathLen(t, D, closed), improved = true, guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = t[i - 1], b = t[i], c = t[k], d = k + 1 < n ? t[k + 1] : (closed ? t[0] : null);
        const before = D[a][b] + (d != null ? D[c][d] : 0);
        const after = D[a][c] + (d != null ? D[b][d] : 0);
        if (after < before - 1e-9) {
          const seg = t.slice(i, k + 1).reverse();
          t.splice(i, seg.length, ...seg); cur -= before - after; improved = true;
        }
      }
    }
    for (let seg = 1; seg <= 3 && !improved; seg++) {
      for (let i = 1; i + seg <= n && !improved; i++) {
        const s = t.slice(i, i + seg);
        const rest = t.slice(0, i).concat(t.slice(i + seg));
        const base = pathLen(rest, D, closed);
        let best = null;
        for (let j = 0; j < rest.length; j++) {
          for (const sq of [s, [...s].reverse()]) {
            const cand = rest.slice(0, j + 1).concat(sq, rest.slice(j + 1));
            const L = base + (D[rest[j]][sq[0]] + (j + 1 < rest.length ? D[sq[sq.length - 1]][rest[j + 1]] - D[rest[j]][rest[j + 1]] : (closed ? D[sq[sq.length - 1]][rest[0]] - D[rest[j]][rest[0]] : 0))) + pathLen(sq, D, false);
            if (L < cur - 1e-9 && (!best || L < best[0])) best = [L, cand];
          }
        }
        if (best) { t = best[1]; cur = best[0]; improved = true; }
      }
    }
  }
  return t;
}

/* ---------------- aba Roteirizador ---------------- */
let rmapa = null, rLayer = null, rStart = null, rStartMarker = null, rModo = "volta";
function renderRoteiro() {
  if ($("#tab-roteiro").hidden) return;
  if (!rmapa) {
    rmapa = baseMap("rmap"); rLayer = L.layerGroup().addTo(rmapa);
    rmapa.on("click", (e) => setStart(e.latlng.lat, e.latlng.lng, "Ponto marcado no mapa"));
  }
  fillRotaSelect($("#rRota"));
  if (!rStart) usarPontoOperacional();
  drawRouteStops();
  setTimeout(() => rmapa.invalidateSize(), 50);
}
function routeStops() {
  const rota = $("#rRota").value, R = P.rotas[rota];
  if (!R) return [];
  return R.pts.map((p, i) => {
    const us = OP.filter((u) => u.parada === `${rota}#${i}`);
    return { i, lat: p[0], lng: p[1], us, nome: stopName(us) };
  }).filter((s) => s.us.length && (!$("#rSemRem").checked || END.get(s.us[0].parada)?.classe !== "sair"));
}
function usarPontoOperacional() {
  const p = P.rotas[$("#rRota").value]?.ponto;
  if (p) { rStart = { lat: p.lat, lng: p.lng, label: "Ponto operacional · " + (p.endereco || "") }; $("#rEnd").value = p.endereco || ""; }
}
function drawRouteStops() {
  rLayer.clearLayers();
  const st = routeStops();
  for (const s of st) {
    const worst = s.us.reduce((a, u) => (CLASSE[u.classe].ordem < CLASSE[a.classe].ordem ? u : a), s.us[0]);
    const e = END.get(s.us[0].parada);
    L.circleMarker([s.lat, s.lng], { radius: 5 + Math.min(10, s.us.length), color: "#fff", weight: 1.2, fillColor: CLASSE[worst.classe].cor, fillOpacity: 0.9 })
      .bindTooltip(`<h4>${esc(s.nome)}</h4>${s.us.length} imóveis · ${END_CLASSE[e.classe].nome}<br>Resultado do endereço ${brl.format(e.resultado)}/mês (${pct(e.margem)})`, { className: "tip", sticky: true }).addTo(rLayer);
  }
  if (rStart) drawStart();
  if (st.length) rmapa.fitBounds(L.latLngBounds(st.map((s) => [s.lat, s.lng]).concat(rStart ? [[rStart.lat, rStart.lng]] : [])).pad(0.08));
  $("#rCalc").disabled = !rStart || !st.length;
}
function drawStart() {
  if (rStartMarker) rStartMarker.remove();
  rStartMarker = L.marker([rStart.lat, rStart.lng], { icon: L.divIcon({ className: "start-pin", iconSize: [16, 16] }) })
    .bindTooltip("Partida: " + esc(rStart.label), { className: "tip" }).addTo(rmapa);
}
function setStart(lat, lng, label) {
  rStart = { lat, lng, label };
  drawStart();
  $("#rCalc").disabled = !routeStops().length;
  $("#rOut").innerHTML = `<p class="small muted">Partida: ${esc(label)}. Clique em "Calcular rota ótima".</p>`;
}
async function geocode() {
  const q = $("#rEnd").value.trim();
  if (!q) return;
  $("#rOut").innerHTML = '<p class="small muted">Procurando o endereço…</p>';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "pt-BR" } });
    const d = await r.json();
    if (!d.length) { $("#rOut").innerHTML = '<p class="small neg">Não achei esse endereço. Tente incluir número, bairro e cidade, ou clique no mapa.</p>'; return; }
    setStart(+d[0].lat, +d[0].lon, d[0].display_name.split(",").slice(0, 3).join(","));
    rmapa.setView([+d[0].lat, +d[0].lon], 13);
  } catch (e) {
    $("#rOut").innerHTML = '<p class="small neg">A busca de endereço não respondeu. Clique no mapa para marcar a partida.</p>';
  }
}
async function osrmTable(pts) {
  const coords = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const r = await fetch(`${OSRM}/table/v1/driving/${coords}?annotations=distance`);
  const d = await r.json();
  if (d.code !== "Ok") throw new Error("osrm");
  return d.distances.map((row) => row.map((x) => (x ?? 0) / 1000));
}
function hav(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dl = (b.lat - a.lat) * toR, dg = (b.lng - a.lng) * toR;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function calcRoute() {
  const st = routeStops();
  if (!rStart || !st.length) return;
  $("#rCalc").disabled = true; $("#rCalc").textContent = "Calculando…";
  const nodes = [{ lat: rStart.lat, lng: rStart.lng }, ...st];
  let D, fonte = "ruas (OSRM)";
  try {
    if (nodes.length > 100) throw new Error("grande");
    D = await osrmTable(nodes);
    D = D.map((row, i) => row.map((x, j) => (x + D[j][i]) / 2));
  } catch (e) {
    fonte = "linha reta × 1,35";
    D = nodes.map((a) => nodes.map((b) => hav(a, b) * 1.35));
  }
  const closed = rModo === "volta";
  const t = solveTsp(D, 0, closed);
  const total = pathLen(t, D, closed);
  // custo marginal de cada parada nesta rota
  const marg = t.map((k, i) => {
    if (i === 0) return 0;
    const a = t[i - 1], b = i + 1 < t.length ? t[i + 1] : (closed ? t[0] : null);
    return b == null ? D[a][k] : D[a][k] + D[k][b] - D[a][b];
  });
  const sortedM = marg.slice(1).sort((a, b) => b - a);
  const hotCut = sortedM[Math.max(0, Math.floor(sortedM.length * 0.1) - 1)] ?? Infinity;
  // curva de cobertura
  const totU = st.reduce((s, x) => s + x.us.length, 0);
  let km = 0, cov = 0; const curve = [[0, 0]];
  t.forEach((k, i) => { if (i === 0) return; km += D[t[i - 1]][k]; cov += nodes[k].us.length; curve.push([km, cov]); });
  let knee = 1, bestGap = -1;
  curve.forEach(([x, y], i) => { const g = y / totU - x / (km || 1); if (i > 0 && g > bestGap) { bestGap = g; knee = i; } });
  const kneeStop = nodes[t[knee]];
  const kneeKm = curve[knee][0], kneeCov = curve[knee][1];
  // desenho
  drawRouteStops();
  const seqNum = new Map(t.map((k, i) => [k, i]));
  st.forEach((s, idx) => {
    const k = idx + 1, i = seqNum.get(k);
    L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "stop-num", html: String(i), iconSize: [20, 18] }), interactive: false }).addTo(rLayer);
  });
  const ordered = t.map((k) => nodes[k]).concat(closed ? [nodes[0]] : []);
  drawRoadGeometry(ordered).catch(() => L.polyline(ordered.map((p) => [p.lat, p.lng]), { color: "#0E6B6B", weight: 3, opacity: 0.8 }).addTo(rLayer));
  // saída
  const W = 300, H = 140;
  const sx = (x) => 28 + (x / (km || 1)) * (W - 36), sy = (y) => H - 20 - (y / totU) * (H - 30);
  const path = curve.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  $("#rOut").innerHTML = `
    <div class="stat"><span>Distância total</span><b>${n1.format(total)} km</b></div>
    <div class="stat"><span>Paradas / imóveis</span><b>${st.length} / ${totU}</b></div>
    <div class="stat"><span>Distâncias por</span><b style="font-family:var(--font)">${fonte}</b></div>
    <div class="callout"><b>Onde vale encerrar a rota</b><br>Até a parada ${knee} (${esc(kneeStop.nome)}) você cobre <b>${pct(kneeCov / totU)}</b> dos imóveis com <b>${pct(kneeKm / (km || 1))}</b> dos km da ida. ${t.length - 1 - knee === 1 ? "A última parada soma" : `As ${t.length - 1 - knee} paradas seguintes somam`} ${n1.format(km - kneeKm)} km para ${totU - kneeCov} ${totU - kneeCov === 1 ? "imóvel" : "imóveis"}.</div>
    <svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de cobertura">
      <line x1="28" y1="${H - 20}" x2="${W - 8}" y2="${H - 20}" stroke="#E2E4DD"></line><line x1="28" y1="10" x2="28" y2="${H - 20}" stroke="#E2E4DD"></line>
      <path d="${path}" fill="none" stroke="#0E6B6B" stroke-width="2"></path>
      <circle cx="${sx(kneeKm)}" cy="${sy(kneeCov)}" r="4" fill="#C2402A"></circle>
      <text x="30" y="12" font-size="10" fill="#7D8A96">% imóveis</text><text x="${W - 8}" y="${H - 6}" font-size="10" fill="#7D8A96" text-anchor="end">km acumulados</text>
    </svg>
    <p class="small muted">Em vermelho, as paradas que mais aumentam a rota (10% maiores desvios).</p>
    <ol class="seq">${t.slice(1).map((k, j) => {
      const i = j + 1, s = nodes[k], hot = marg[i] >= hotCut && marg[i] > 0.3;
      return `<li data-lat="${s.lat}" data-lng="${s.lng}"><span class="n">${i}</span><span class="${hot ? "hot" : ""}">${esc(s.nome)}</span><span class="km ${hot ? "hot" : ""}">+${n1.format(marg[i])} km</span></li>`;
    }).join("")}</ol>`;
  $$("#rOut .seq li").forEach((li) => li.addEventListener("click", () => rmapa.setView([+li.dataset.lat, +li.dataset.lng], 16)));
  $("#rCalc").disabled = false; $("#rCalc").textContent = "Calcular rota ótima";
}
async function drawRoadGeometry(pts) {
  const chunks = [];
  for (let i = 0; i < pts.length - 1; i += 49) chunks.push(pts.slice(i, i + 50));
  for (const c of chunks) {
    if (c.length < 2) continue;
    const coords = c.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const r = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    const d = await r.json();
    if (d.code !== "Ok") throw new Error("rota");
    L.geoJSON(d.routes[0].geometry, { style: { color: "#0E6B6B", weight: 3.5, opacity: 0.85 } }).addTo(rLayer);
  }
}

/* ---------------- aba Rotas ---------------- */
function renderRotas() {
  if ($("#tab-rotas").hidden) return;
  const rows = [...ROT.values()].map((R) => {
    const us = R.us;
    const rec = sum(us, (u) => u.receitaCD), est = sum(us, (u) => u.estrutura), luc = sum(us, (u) => u.lucro);
    return { R, n: us.length, rec, dir: R.d.total + (R.Lp ? R.Lp.equipe + R.Lp.terceirizada : 0), est, luc, mg: rec > 0 ? luc / rec : -Infinity, rem: us.filter((u) => u.classe === "remover").length, ab: us.filter((u) => u.classe === "abaixo").length };
  }).sort((a, b) => a.mg - b.mg);
  $("#rtbl").innerHTML = `<thead><tr><th>Rota</th><th class="r">Imóveis</th><th class="r">Fica p/ Carpediem</th><th class="r">Custo direto (operação + limpeza)</th><th class="r">Custo por visita</th><th class="r">Estrutura rateada</th><th class="r">Lucro/mês</th><th class="r">Margem</th><th class="r">Remover</th><th class="r">Abaixo da meta</th></tr></thead><tbody>` +
    rows.map((r) => `<tr data-r="${esc(r.R.rota)}"><td class="nome"><b>${esc(r.R.rota)}</b><span>${esc(r.R.d.nome_dre)}</span></td><td class="r">${r.n}</td><td class="r">${brl.format(r.rec)}</td><td class="r">${brl.format(r.dir)}</td><td class="r">${brl.format(r.R.custoVisita)}</td><td class="r">${brl.format(r.est)}</td>
      <td class="r ${r.luc < 0 ? "neg" : ""}">${brl.format(r.luc)}</td><td class="r ${r.mg < params.meta / 100 ? "neg" : ""}">${pct(r.mg)}</td><td class="r">${r.rem}</td><td class="r">${r.ab}</td></tr>`).join("") + "</tbody>";
  $$("#rtbl tbody tr").forEach((tr) => tr.addEventListener("click", () => { $("#fRota").value = tr.dataset.r; document.querySelector('.tab[data-tab="decisao"]').click(); }));
}

/* ---------------- aba Endereços ---------------- */
function renderPredios() {
  if ($("#tab-predios").hidden) return;
  fillRotaSelect($("#pRota"), "Todas as rotas");
  const rota = $("#pRota").value, min = +$("#pMin").value;
  const ord = { sair: 0, rever: 1, novo: 2, manter: 3 };
  const rows = [...END.values()].filter((e) => (!rota || e.rota === rota) && e.n >= min).sort((a, b) => ord[a.classe] - ord[b.classe] || a.margem - b.margem);
  const cnt = (e, c) => e.us.filter((u) => u.classe === c).length;
  $("#ptbl").innerHTML = `<thead><tr><th>Empreendimento / endereço</th><th>Rota</th><th>Decisão do endereço</th><th class="r">Imóveis</th><th class="r">No lucro</th><th class="r">Fica p/ Carpediem</th><th class="r">Custo da rota</th><th class="r">Estrutura</th><th class="r">Resultado</th><th class="r">Margem</th><th>Quem sustenta</th><th class="r">Remover</th><th class="r">Abaixo</th></tr></thead><tbody>` +
    rows.map((e, i) => `<tr data-p="${i}"><td class="nome"><b>${esc(e.nome)}</b><span>${esc(e.us[0].endereco || "")}</span></td><td>${esc(e.rota)}</td><td>${pillEnd(e.classe)}</td><td class="r">${e.n}</td><td class="r">${e.positivos.length}</td>
      <td class="r">${brl.format(e.receita)}</td><td class="r">${brl.format(e.custoRota)}</td><td class="r">${brl.format(e.estrutura)}</td>
      <td class="r ${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)}</td><td class="r ${e.margem < params.meta / 100 ? "neg" : ""}">${pct(e.margem)}</td>
      <td class="motivo">${e.n > 1 && e.semTop != null && e.semTop < 0 && e.resultado >= 0 ? `Só ${esc(e.top.publico || e.top.nome)}` : e.n > 1 ? `${e.positivos.length} imóveis no lucro` : "—"}</td>
      <td class="r">${cnt(e, "remover") ? `<span class="neg">${cnt(e, "remover")}</span>` : 0}</td><td class="r">${cnt(e, "abaixo")}</td></tr>`).join("") + "</tbody>";
  $$("#ptbl tbody tr").forEach((tr) => tr.addEventListener("click", () => openStop(rows[+tr.dataset.p])));
}
function openStop(e) {
  const motivo = e.classe === "sair" ? `Somando todos os ${e.n} imóveis, o endereço dá prejuízo de ${brl.format(e.resultado)}/mês com os custos rateados.${e.positivos.length ? ` ${e.positivos.length} imóveis lucram, mas não cobrem os outros.` : ""}`
    : e.classe === "rever" ? `O endereço lucra ${brl.format(e.resultado)}/mês, margem de ${pct(e.margem)}, abaixo da meta de ${params.meta}%.`
    : e.classe === "novo" ? "Todos os imóveis do endereço estão em maturação." : `O endereço lucra ${brl.format(e.resultado)}/mês, margem de ${pct(e.margem)}.`;
  $("#drawerBody").innerHTML = `<h2>${esc(e.nome)}</h2><p class="muted small">${esc(e.us[0].endereco || "")} · ${esc(e.rota)}${e.base ? " · base da rota" : ""}</p>
    <p>${pillEnd(e.classe)}</p>
    <div class="why ${END_CLASSE[e.classe].css}"><b>${END_CLASSE[e.classe].nome}</b><ul><li>${esc(motivo)}</li>
      ${e.n > 1 && e.semTop != null && e.semTop < 0 && e.resultado >= 0 ? `<li>Só fica positivo por causa de ${esc(e.top.publico || e.top.nome)} (${brl.format(e.top.lucro)}/mês). Sem ele: ${brl.format(e.semTop)}/mês.</li>` : ""}</ul></div>
    <table class="calc">
      <tr><td>Fica para a Carpediem (${e.n} imóveis)</td><td>${brl.format(e.receita)}</td></tr>
      <tr><td>Custo da rota rateado<span class="sub">${n1.format(e.visitas)} visitas/mês · ${n2.format(e.km)} km a mais por viagem</span></td><td>−${brl.format(e.custoRota)}</td></tr>
      <tr><td>Impostos sobre vendas</td><td>−${brl.format(e.impostos)}</td></tr>
      <tr><td>Estrutura rateada</td><td>−${brl.format(e.estrutura)}</td></tr>
      <tr class="tot"><td>Resultado do endereço</td><td class="${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)} · ${pct(e.margem)}</td></tr>
    </table>
    <h3>Imóveis</h3><div class="table-wrap"><table class="tbl"><tbody>${[...e.us].sort((a, b) => a.lucro - b.lucro).map((u) => `<tr data-id="${u.id}"><td class="nome"><b>${esc(u.publico || u.nome)}</b></td><td>${pill(u.classe)}</td><td class="r">${brl.format(u.receitaCD)}</td><td class="r ${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)}</td><td class="r">${pct(u.margem)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("#drawerBody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
  $("#drawer").hidden = false;
}

/* ---------------- aba Sem rota ---------------- */
function renderSemRota() {
  if ($("#tab-semrota").hidden) return;
  const tipo = $("#sTipo").value;
  const all = P.sem_rota;
  const tipos = [...new Set(all.map((s) => s.tipo))];
  if ($("#sTipo").options.length <= 1) $("#sTipo").innerHTML = `<option value="">Todos (${all.length})</option>` + tipos.map((t) => `<option value="${esc(t)}">${esc(t)} (${all.filter((s) => s.tipo === t).length})</option>`).join("");
  const rows = all.filter((s) => !tipo || s.tipo === tipo);
  $("#stbl").innerHTML = `<thead><tr><th>Imóvel</th><th>Situação</th><th>Cidade</th><th>Líder</th><th>Stays</th><th>Na Mastertable</th><th>Observação</th><th class="r">Bruta/mês</th></tr></thead><tbody>` +
    rows.map((s) => `<tr ${s.id ? `data-id="${s.id}"` : ""}><td class="nome"><b>${esc(s.publico || s.nome)}</b><span>${esc(s.nome)}</span></td><td class="motivo">${esc(s.tipo)}</td><td>${esc(s.cidade || "—")}</td><td>${esc(s.lider || "—")}</td>
      <td>${esc((s.stays || []).join(", "))}</td><td>${esc(s.status_mt || "—")}</td>
      <td class="motivo">${s.possivel_duplicado_de ? `Parece segundo anúncio de ${esc(s.possivel_duplicado_de)}` : s.mestre_categoria ? "Anúncio-mestre de categoria (prédio)" : ""}</td>
      <td class="r">${s.bruta_mes != null ? brl.format(s.bruta_mes) : "—"}</td></tr>`).join("") + "</tbody>";
}

/* ---------------- aba Como calculamos ---------------- */
function renderMetodo() {
  const g = D.grupos;
  const lim = Object.values(D.limpeza || {}).reduce((s, v) => s + v.equipe + v.terceirizada, 0);
  const ext = g.ext;
  const linha = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const bloco = (titulo, linhas) => `<h2>${titulo}</h2><table class="calc">${linhas.join("")}</table>`;
  $("#tab-metodo").innerHTML = `
  <p class="small muted">Médias por mês · período ${esc(periodoTxt())} · DRE: ${esc(P.dre.arquivo || "—")}</p>
  ${bloco("1. Lucro do imóvel", [
    linha("<b>Lucro</b>", "Receita Carpediem − Rota − Impostos − Estrutura"),
    linha("<b>Margem</b>", "Lucro ÷ Receita Carpediem"),
  ])}
  ${bloco("2. Receita Carpediem (reservas da Stays)", [
    linha("Taxa de administração", "% da Mastertable × (total da reserva − comissão do portal − taxa de limpeza)"),
    linha("Taxa de limpeza", "valor cobrado do hóspede, quando o formato é \"Recolhe\""),
    linha("Fora da conta", "canceladas e uso do proprietário"),
    linha("Prédios (grupo na Stays)", "receita do grupo ÷ unidades distintas"),
    linha("Média mensal", "só meses desde o início do imóvel (cadastro, ativação ou reativação)"),
  ])}
  ${bloco("3. Custo da rota (DRE, dividido entre os imóveis da rota)", [
    linha("Deslocamento: combustível", `idas × km ida e volta do ponto operacional ÷ ${n1.format(params.cons)} km/l × gasolina do estado`),
    linha("Deslocamento: tempo", `idas × minutos ida e volta × ${n1.format(params.tr)} (trânsito) × ${brl2.format(salario() / 220)}/h`),
    linha("Idas por mês", "dias com limpeza ou chamado no endereço"),
    linha("Rateio", "mês a mês: custo da rota no mês ÷ visitas de todos os imóveis da rota naquele mês (inclusive os que já saíram); cada imóvel paga só os meses em que estava ativo"),
    linha("Pessoal da operação", "(pessoal da rota − tempo de deslocamento) × fatia de visitas"),
    linha("Ponto de apoio", "ponto de apoio da rota × fatia de visitas (o de Natal, no Living Tirol, vai para a estrutura)"),
    linha("Resto do transporte", "(transporte da rota − combustível) × fatia de visitas"),
    linha("Custo com imóveis", "custo com imóveis da rota × fatia de chamados"),
    linha("Equipe de limpeza", "equipe de limpeza da rota × fatia de limpezas"),
    linha("Lavanderia e terceirizados", "lavanderia + material + limpeza terceirizada da rota × fatia de limpezas"),
    linha("Visita", "1 limpeza (reserva) ou 1 chamado do Jestor"),
  ])}
  ${bloco("4. Impostos e estrutura", [
    linha("Impostos", `${n1.format(D.aliquota * 100)}% × (Receita Carpediem − limpeza da rota)`),
    linha("Estrutura", `${brl.format(D.estruturaTotal)}/mês ÷ ${U.filter((x) => !x.sem_stays).length} imóveis${D.apoioEmpresa ? ` (inclui ${brl.format(D.apoioEmpresa)} do ponto de apoio de Natal)` : ""} = ${brl.format(D.estrutura / (U.filter((x) => !x.sem_stays).length || 1))} por imóvel`),
    linha("O que é estrutura", "operações internas, administrativo, comercial/marketing, financeiro e pessoas (backoffice)"),
  ])}
  ${bloco("5. Valores do período", [
    linha("Operações externas das rotas", `${brl.format(ext)}/mês`),
    linha("Limpeza e lavanderia das rotas", `${brl.format(lim)}/mês`),
    linha("Estrutura", `${brl.format(D.estruturaTotal)}/mês${D.apoioEmpresa ? ` (com ${brl.format(D.apoioEmpresa)} do ponto de apoio de Natal, que atende a empresa inteira)` : ""}`),
    linha("Alíquota de impostos", `${n1.format(D.aliquota * 100)}% (ISS + PGDAS + PIS/COFINS ÷ receita bruta)`),
    linha("Custo por pessoa da equipe de campo", `${brl.format(salario())}/mês (folha + ajuda + premiação + encargos) ÷ 220 h`),
    linha("Gasolina", Object.entries(P.combustivel || {}).map(([k, v]) => `${k === "_BR" ? "outros" : k} ${brl2.format(v)}`).join(" · ")),
  ])}
  ${bloco("6. Decisão", [
    linha(pill("remover"), "lucro &lt; 0"),
    linha(pill("abaixo"), `margem entre 0 e ${params.meta}%`),
    linha(pill("atencao"), "chamados no top 10% da base, ou sem reservas no período"),
    linha(pill("manter"), `margem ≥ ${params.meta}%`),
    linha(pill("maturando"), "menos de 6 meses desde o início; não é indicado para sair"),
    linha(pillEnd("sair") + " " + pillEnd("rever"), "mesma regra, somando todos os imóveis do endereço"),
    linha("Troca de rota", "parada de outra rota a menos da metade da distância da própria"),
  ])}
  ${bloco("7. Fontes", [
    linha("Imóveis e rotas", "Mastertable do Jestor, status Ativo"),
    linha("Reservas", "Stays"),
    linha("Chamados", `Jestor (manutenções); ${P.chamados_sem_vinculo} sem imóvel ativo ficam fora`),
    linha("Custos", "DRE: abas Despesas, Resultado - Taxa de Limpeza e Resumo mensal"),
    linha("Duplicados", "de/para prédio × individual + mesmo condomínio e apê a menos de 500 m"),
    linha("Meses sem DRE fechada", "repetem o último mês fechado"),
  ])}
  <p class="small muted">Snapshot gerado em ${fmtData(P.gerado)}.</p>`;
}

/* ---------------- atualizar DRE ---------------- */
let dreNova = null;
function previewDre(dre) {
  const usados = mesesUsados(dre, P.meses);
  const usadoSet = new Map(usados.map((x) => [x.mes, x]));
  const rotasMt = [...new Set(U.map((u) => u.rota).filter((r) => r && !NAO_OPERACIONAIS.has(r)))];
  const semDre = rotasMt.filter((r) => !dre.rotas[normRota(r)]);
  const semMt = Object.entries(dre.rotas).filter(([k]) => !rotasMt.some((r) => normRota(r) === k)).map(([, v]) => v.nome_dre);
  const m = mediasDre(dre, usados);
  $("#drePreview").innerHTML = `
    <div class="mes-grid">${dre.meses.map((mes, j) => {
      const u = usadoSet.get(mes);
      const semRes = !P.meses.includes(mes);
      const cls = dre.real[j] && !semRes ? "" : u ? "est" : "proj";
      const t = dre.real[j] ? (semRes ? "fechado, entra quando as reservas forem atualizadas" : `fechado · ${brl.format(dre.total[j])}`) : u ? `repete ${mesTxt(dre.meses[u.col])}` : "projeção, fora";
      return `<span class="mes-chip ${cls}" title="${t}">${mesTxt(mes)} · ${t}</span>`;
    }).join("")}</div>
    <p class="dre-msg">Arquivo ${esc(dre.arquivo)}: ${Object.keys(dre.rotas).length} rotas. No período usado, dispêndios de ${brl.format(m.total)}/mês (rotas ${brl.format(m.grupos.ext)}, estrutura ${brl.format(m.estrutura)})${dre.limpeza ? `; limpeza e lavanderia ${brl.format(Object.values(m.limpeza).reduce((s, v) => s + v.equipe + v.terceirizada, 0))}/mês em ${Object.keys(dre.limpeza).length} rotas` : ""}${dre.impostos ? `; impostos ${n1.format(m.aliquota * 100)}% da receita bruta` : ""}.</p>
    ${dre.avisos.length ? `<p class="dre-msg err">${dre.avisos.map(esc).join("<br>")}</p>` : '<p class="dre-msg">As somas batem: rotas = Operações externas e grupos = Dispêndios totais em todos os meses fechados.</p>'}
    ${semDre.length ? `<p class="dre-msg err">Rotas da Mastertable sem linha na DRE (ficam só com estrutura): ${semDre.map(esc).join(", ")}.</p>` : ""}
    ${semMt.length ? `<p class="dre-msg err">Rotas da DRE sem imóveis na Mastertable: ${semMt.map(esc).join(", ")}.</p>` : ""}
    <div class="dre-row"><span class="muted small">Confira os meses acima antes de salvar. A versão anterior fica guardada no histórico.</span>
    <button id="dreSalvar" class="btn primary" type="button">Salvar e recalcular</button></div>`;
  $("#dreSalvar").addEventListener("click", salvarDre);
}
function lerDre(file) {
  const xlsx = /\.xlsx?$/i.test(file.name);
  const r = new FileReader();
  r.onload = () => {
    try {
      const entrada = xlsx ? abasDoXlsx(XLSX.read(new Uint8Array(r.result), { type: "array", cellDates: true }), XLSX) : r.result;
      dreNova = parseDre(entrada, file.name); previewDre(dreNova);
    } catch (err) { dreNova = null; $("#drePreview").innerHTML = `<p class="dre-msg err">${esc(err.message)}</p>`; }
  };
  if (xlsx) r.readAsArrayBuffer(file); else r.readAsText(file, "ISO-8859-1");
}
async function salvarDre() {
  if (!dreNova) return;
  const b = $("#dreSalvar"); b.disabled = true; b.textContent = "Salvando…";
  const nova = { ...dreNova, enviado_em: new Date().toISOString() };
  if (!LOCAL) {
    const { data, error } = await supabase.rpc("pricing_raio_x_rotas_set_dre", { p_dre: nova });
    if (error) {
      b.disabled = false; b.textContent = "Salvar e recalcular";
      $("#drePreview").insertAdjacentHTML("beforeend", `<p class="dre-msg err">${error.code === "42501" ? "Seu e-mail não tem permissão para atualizar a DRE. Peça a liberação para a Leticia." : "Não foi possível salvar agora. Tente de novo em instantes."}</p>`);
      return;
    }
    nova.enviado_por = data?.enviado_por || null;
  }
  P.dre = nova; dreNova = null;
  recompute();
  $("#drePreview").innerHTML = `<p class="dre-msg">DRE salva e tudo recalculado. Período agora: ${esc(periodoTxt())}.</p>`;
}

/* ---------------- navegação ---------------- */
function renderAll() {
  fillRotaSelect($("#fRota"), "Todas as rotas");
  renderKpis(); renderTable(); renderMapa(); renderRoteiro(); renderRotas(); renderPredios(); renderSemRota(); renderMetodo();
}
function wire() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === b));
    $$(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + b.dataset.tab));
    try { history.replaceState(null, "", "#" + b.dataset.tab); } catch (e) {}
    renderAll();
  }));
  $("#btnParams").addEventListener("click", () => { $("#paramsPanel").hidden = !$("#paramsPanel").hidden; $("#drePanel").hidden = true; });
  $("#btnDre").addEventListener("click", () => { $("#drePanel").hidden = !$("#drePanel").hidden; $("#paramsPanel").hidden = true; });
  $("#dreFile").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) lerDre(f); e.target.value = ""; });
  ["#fRota", "#fClasse", "#fOutra", "#fEnd"].forEach((s) => $(s).addEventListener("change", renderTable));
  $("#fBusca").addEventListener("input", renderTable);
  $("#tbl").addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (th) { const k = th.dataset.k; if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = ["nome", "rota", "classe", "endClasse", "endNome", "motivoCurto", "lucro", "margem"].includes(k); } return renderTable(); }
    const tr = e.target.closest("tr[data-id]"); if (tr) openUnit(tr.dataset.id);
  });
  $("#stbl").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) openUnit(tr.dataset.id); });
  $("#drawerClose").addEventListener("click", () => ($("#drawer").hidden = true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drawer").hidden = true; });
  ["#mRota", "#mPorEnd", "#mNomes"].forEach((s) => $(s).addEventListener("change", renderMapa));
  $("#rRota").addEventListener("change", () => { usarPontoOperacional(); drawRouteStops(); $("#rOut").innerHTML = ""; });
  $("#rSemRem").addEventListener("change", drawRouteStops);
  $("#rBusca").addEventListener("click", geocode);
  $("#rEnd").addEventListener("keydown", (e) => { if (e.key === "Enter") geocode(); });
  $("#rCalc").addEventListener("click", calcRoute);
  $$("#rModo button").forEach((b) => b.addEventListener("click", () => { rModo = b.dataset.v; $$("#rModo button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#pRota").addEventListener("change", renderPredios);
  $("#pMin").addEventListener("change", renderPredios);
  $("#sTipo").addEventListener("change", renderSemRota);
}

async function start(payload) {
  P = payload; U = P.unidades.map((u) => ({ ...u }));
  $("#loading").hidden = true;
  wire(); loadParams(); recompute();
  $("#pSal").placeholder = D.salarioCampo ? `DRE: ${brl.format(D.salarioCampo)}` : "2.500";
  if (LOCAL) window.__raiox = { U: () => U, OP: () => OP, END: () => END };
  const h = location.hash.slice(1);
  if (h) document.querySelector(`.tab[data-tab="${h}"]`)?.click();
}
async function loadData() {
  if (LOCAL) { const r = await fetch("../data/payload.json"); return start(await r.json()); }
  const { data, error } = await supabase.rpc("pricing_raio_x_rotas_get");
  if (error || !data) { $("#loading").textContent = "Não foi possível carregar os dados agora. Recarregue a página em instantes."; console.error(error); return; }
  start(data);
}

/* ---------------- login ---------------- */
const isAllowed = (email) => !!email && email.toLowerCase().endsWith(ALLOWED_DOMAIN);
function showApp(email) { $("#loginGate").hidden = true; $("#appRoot").hidden = false; $("#userEmailLabel").textContent = email; loadData(); }
function showGate(msg) { $("#appRoot").hidden = true; $("#loginGate").hidden = false; if (msg) { $("#loginError").textContent = msg; $("#loginError").classList.add("show"); } }
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim(), password = $("#loginPassword").value;
  $("#loginError").classList.remove("show"); $("#btnLogin").disabled = true; $("#btnLogin").textContent = "Entrando…";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showGate("E-mail ou senha incorretos.");
  else if (!isAllowed(data.user.email)) { await supabase.auth.signOut(); showGate("Acesso restrito a e-mails " + ALLOWED_DOMAIN + "."); }
  else showApp(data.user.email);
  $("#btnLogin").disabled = false; $("#btnLogin").textContent = "Entrar";
});
$("#btnForgot").addEventListener("click", async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) return showGate("Digite seu e-mail acima antes de clicar em esqueci minha senha.");
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  showGate("Se esse e-mail tiver conta, enviamos um link de redefinição de senha.");
});
$("#btnLogout").addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });

(async () => {
  if (LOCAL) return showApp("modo local");
  const { data: { session } } = await supabase.auth.getSession();
  if (session && isAllowed(session.user.email)) showApp(session.user.email);
  else { if (session) await supabase.auth.signOut(); showGate(); }
})();
