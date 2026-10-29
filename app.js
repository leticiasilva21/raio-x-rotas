import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseDre, abasDoXlsx, mesesUsados, mediasDre, normRota } from "./dre.js?v=5";

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
  remover: { nome: "Tirar", cor: "#C2402A", ordem: 0 },
  substituir: { nome: "Substituir", cor: "#E07B24", ordem: 1 },
  abaixo: { nome: "—", cor: "#E07B24", ordem: 1 },
  atencao: { nome: "Atenção", cor: "#C9A206", ordem: 2 },
  maturando: { nome: "Maturando", cor: "#3A68B8", ordem: 3 },
  manter: { nome: "Manter", cor: "#2F8A57", ordem: 4 },
};
const END_CLASSE = {
  sair: { nome: "Sair do endereço", css: "remover" },
  rever: { nome: "Sai em parte", css: "abaixo" },
  substituir: { nome: "Substituir o endereço", css: "substituir" },
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
let REG = new Map();   // rota -> região (rotas vizinhas que podem dividir equipe)
let CAPTAR = new Map(); // região -> condomínios prioritários para entrada
const params = { equipeProp: "prop", meta: 35, sub: -30, gap: "contar", rateio: "igual", pkm: 50, sal: null, cons: 10, tr: 1.3, hLimp: 2, hQuarto: 0.5, hCh: 1 };
const PONTO_EMPRESA = new Set(["cidade sol"]);   // ponto de apoio de Natal (Living Tirol) atende a empresa inteira: vai para a estrutura
const salario = () => params.sal || D?.salarioCampo || 2500;
const precoGas = (uf) => (P.combustivel || {})[uf] ?? (P.combustivel || {})._BR ?? 6.6;

/* ---------------- parâmetros ---------------- */
function loadParams() {
  try { Object.assign(params, JSON.parse(localStorage.getItem("raiox-params-v11") || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem("raiox-params-v11", JSON.stringify(params)); } catch (e) {} };
  const bind = (id, k, num) => {
    const el = document.getElementById(id);
    el.value = params[k];
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { params[k] = num ? parseFloat(el.value) || 0 : el.value; save(); recompute(); });
  };
  bind("pMeta", "meta", true); bind("pSub", "sub", true); bind("pGap", "gap", false); bind("pEquipe", "equipeProp", false); bind("pRateio", "rateio", false); bind("pKm", "pkm", true); { const el = $("#pSal"); el.value = params.sal ?? ""; el.addEventListener("input", () => { params.sal = parseFloat(el.value) || null; try { localStorage.setItem("raiox-params-v11", JSON.stringify(params)); } catch (e) {} recompute(); }); } bind("pCons", "cons", true); bind("pTr", "tr", true);
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
    // peso de cada mês = fração do mês em que o imóvel estava na base (Inativo no Jestor fica fora;
    // meses zerados antes da retomada saem só se o parâmetro mandar)
    u.peso = P.meses.map((m, i) => {
      if (m < (u.inicio || u.criado || "2000-01").slice(0, 7)) return 0;
      if (params.gap === "tirar" && u.gap && m >= u.gap[0] && m <= u.gap[1]) return 0;
      return u.base_mes ? u.base_mes[i] : 1;
    });
    const ativos = idx.filter((i) => u.peso[i] > 0);
    const n = sum(ativos, (i) => u.peso[i]);
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
      const act = us.filter((u) => u.peso[i] > 0);
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
  // estrutura e a escada de conta de cada imóvel (a mesma em imóvel, endereço e rota)
  const nImoveis = U.filter((u) => !u.sem_stays).length;
  const recTot = sum(U.filter((u) => !u.sem_stays), (u) => u.receitaCD) || 1;
  for (const u of U) {
    if (!u.temRotaDre || u.sem_stays) { u.cPessoal = u.cApoio = u.cTranspVis = u.cTranspKm = u.cImoveis = u.kmU = u.cLimpEquipe = u.cLimpTerc = u.cDescComb = u.cDescTempo = 0; }
    u.impostos = D.aliquota * Math.max(0, u.receitaCD - u.cLimpEquipe - u.cLimpTerc);
    u.cSai = u.impostos + u.cLimpTerc + (u.cDescComb || 0) + u.cImoveis;              // 2. custos que saem com o imóvel
    u.cEquipe = u.cLimpEquipe + u.cPessoal + (u.cDescTempo || 0);                    // 3. equipe da rota usada por ele
    u.mc = u.receitaCD - u.cSai - u.cEquipe;                                         // 4. margem de contribuição
    u.mcPct = u.receitaCD > 0 ? u.mc / u.receitaCD : -Infinity;
    u.cFixos = u.cApoio + u.cTranspVis + u.cTranspKm;                                // 5a. fixos da rota (ponto de apoio, veículos/transporte)
    u.estrutura = u.sem_stays ? 0 : params.rateio === "igual" ? D.estruturaTotal / nImoveis : D.estruturaTotal * (u.receitaCD / recTot);  // 5b
    u.lucro = u.mc - u.cFixos - u.estrutura;                                         // 6. lucro
    u.margem = u.receitaCD > 0 ? u.lucro / u.receitaCD : -Infinity;
    u.horas = u.cEquipe / (salario() / 220);                                         // horas de equipe (custo da equipe ÷ R$/h)
    u.mcHora = u.horas > 0 ? u.mc / u.horas : null;
    // nomes antigos usados em outras telas
    u.custoRota = u.cSai - u.impostos + u.cEquipe + u.cFixos;
    u.cVar = u.cSai; u.contribVar = u.receitaCD - u.cSai;
  }
  for (const R of ROT.values()) {
    const us = R.us.filter((u) => !u.sem_stays);
    R.contrib = sum(us, (u) => u.contribVar);
    R.fixos = sum(us, (u) => u.cEquipe + u.cFixos);    // equipe + fixos da rota (o que some só fechando a rota)
  }
  const chP90 = [...OP.map((u) => u.ch_mes)].sort((a, b) => a - b)[Math.floor(OP.length * 0.9)] || 99;
  for (const e of END.values()) {
    const s = (f) => sum(e.us, f);
    e.receita = s((u) => u.receitaCD); e.cSai = s((u) => u.cSai); e.cEquipe = s((u) => u.cEquipe); e.mc = s((u) => u.mc);
    e.cFixos = s((u) => u.cFixos); e.estrutura = s((u) => u.estrutura); e.lucro = s((u) => u.lucro);
    e.mcPct = e.receita > 0 ? e.mc / e.receita : -Infinity;
    e.lucroPct = e.receita > 0 ? e.lucro / e.receita : -Infinity;
    e.custoRota = s((u) => u.custoRota); e.impostos = s((u) => u.impostos); e.contribVar = s((u) => u.contribVar);
    e.resultado = e.lucro; e.margem = e.lucroPct;                // usados no mapa e no roteirizador
    e.bruta = s((u) => u.brutaP);
    e.positivos = e.us.filter((u) => u.mc > 0);
    e.todosNovos = e.us.every((u) => u.novo);
    e.semTop = null;
    if (e.n > 1) { e.top = e.us.reduce((a, u) => (u.mc > a.mc ? u : a), e.us[0]); e.semTop = e.mc - e.top.mc; }
  }
  decidirRotas();
  for (const u of OP) classify(u, END.get(u.parada), chP90);
  for (const e of END.values()) {
    const maduros = e.us.filter((u) => !u.novo);
    e.classe = !maduros.length ? "novo" : maduros.every((u) => u.classe === "remover") ? "sair" : maduros.some((u) => u.classe === "remover") ? "rever"
      : maduros.every((u) => u.classe === "substituir" || u.classe === "atencao") && maduros.some((u) => u.classe === "substituir") ? "substituir" : "manter";
    for (const u of e.us) u.endClasse = e.classe;
  }
  for (const u of U) if (!u.op) { u.classe = null; u.motivos = []; }
  montarCaptacao();
  for (const u of OP) if (u.classe === "substituir") { const t = trocas([u])[0]; if (t) u.motivos.push(["info", `Melhor troca de mesmo perfil (${perfilTxt(u)}): uma entrada em ${t.e.nome} (${t.e.rota}) traria ${brl.format(t.dRec)}/mês a mais de receita e ${brl.format(t.dLucro)}/mês a mais de lucro (${brl.format(t.dLucro * 12)}/ano).`]); }
  renderAll();
}

// Margem de contribuição de cada rota (só receitas e despesas da rota) e cenário depois da estrutura geral.
// Abaixo da meta: tira imóveis, do de menor margem para o de maior, até a rota bater a meta (cortando pessoas inteiras quando o volume permite).
function decidirRotas() {
  const meta = params.meta / 100;
  for (const R of ROT.values()) {
    const key = normRota(R.rota);
    const eq = D.equipe?.[key] || { limpeza: 0, vistoria: 0 };
    const us = R.us.filter((u) => !u.sem_stays);
    R.eq = eq;
    R.capLimp = eq.limpeza > 0 ? R.Z / eq.limpeza : null;
    R.capVist = eq.vistoria > 0 ? us.length / eq.vistoria : null;
    R.custoFax = eq.limpeza > 0 ? (R.Lp?.equipe || 0) / eq.limpeza : 0;
    R.custoVist = salario();
    R.receita = sum(us, (u) => u.receitaCD);
    R.mcImoveis = sum(us, (u) => u.mc); R.fixosRota = sum(us, (u) => u.cFixos);
    R.mc = R.mcImoveis - R.fixosRota;   // margem de contribuição da rota = soma das margens dos imóveis − fixos da rota
    R.mcPct = R.receita > 0 ? R.mc / R.receita : -Infinity;
    R.estr = sum(us, (u) => u.estrutura);
    R.posPct = R.receita > 0 ? (R.mc - R.estr) / R.receita : -Infinity;
    const prop = params.equipeProp !== "inteiras";
    const equipeU = (u) => u.cLimpEquipe + u.cPessoal + (u.cDescTempo || 0);   // parte do imóvel nas pessoas da rota
    // margem do imóvel considerando só o que sai junto com ele (variáveis + equipe, se a equipe acompanha o volume)
    const mcU = (u) => (u.receitaCD > 0 ? (prop ? u.mc : u.contribVar) / u.receitaCD : -Infinity);
    const cand = us.filter((u) => u.op && !u.novo && u.receitaCD > 0).sort((x, y) => mcU(x) - mcU(y));
    R.plano = null; R.tirar = new Set(); R.decisao = "ok";
    if (R.mcPct < meta) {
      let accC = 0, accL = 0, accR = 0, accE = 0, melhor = null;
      for (let k = 1; k <= cand.length; k++) {
        const u = cand[k - 1];
        accC += u.contribVar; accL += u.resP; accR += u.receitaCD;
        accE += equipeU(u);
        const l = prop ? accL / (R.capLimp || Infinity) : R.capLimp ? Math.min(Math.floor(eq.limpeza + 1e-9), Math.floor(accL / R.capLimp + 1e-9)) : 0;
        const v = prop ? k / (R.capVist || Infinity) : R.capVist ? Math.min(Math.floor(eq.vistoria + 1e-9), Math.floor(k / R.capVist + 1e-9)) : 0;
        const cortes = prop ? accE : l * R.custoFax + v * R.custoVist;
        const rec2 = R.receita - accR, mc2 = R.mc - accC + cortes;
        const pct2 = rec2 > 0 ? mc2 / rec2 : -Infinity;
        const passo = { k, l, v, cortes, rec2, mc2, pct2, us: cand.slice(0, k), ganho: mc2 - R.mc };
        if (!melhor || pct2 > melhor.pct2) melhor = passo;
        if (pct2 >= meta && k < cand.length) { R.plano = passo; break; }
      }
      if (R.plano) { R.decisao = "tirar"; R.plano.us.forEach((u) => R.tirar.add(u)); }
      else {
        R.decisao = "nao_chega"; R.melhor = melhor;
        // tira só os que dão prejuízo dentro da rota (melhoram a margem e o resultado em reais)
        const neg = cand.filter((u) => (prop ? u.mc : u.contribVar) < 0);
        if (neg.length) {
          const sC = sum(neg, (u) => u.contribVar), sR = sum(neg, (u) => u.receitaCD), sE = prop ? sum(neg, (u) => equipeU(u)) : 0;
          const parcial = { us: neg, k: neg.length, pct2: (R.mc - sC + sE) / Math.max(1, R.receita - sR), ganho: -sC + sE };
          if (parcial.pct2 > R.mcPct && parcial.ganho > 0) { R.parcial = parcial; neg.forEach((u) => R.tirar.add(u)); }
        }
      }
    }
    for (const u of us) if (u.op && !u.novo && u.receitaCD > 0 && u.contribVar < 0) R.tirar.add(u);
    R.pessoasMenos = R.plano ? R.plano.l + R.plano.v : 0;
    if (!R.plano && R.parcial && prop) R.pessoasMenos = sum(R.parcial.us, (u) => u.resP) / (R.capLimp || Infinity) + R.parcial.k / (R.capVist || Infinity);
    R.ganhoFechar = R.fixos - R.contrib;
  }
}

function classify(u, e, chP90) {
  const m = [];
  const R = ROT.get(u.rota);
  let classe = "manter";
  if (!u.novo && u.receitaCD <= 0) {
    classe = "atencao";
    m.push(["atencao", "Nenhuma reserva no período neste cadastro. Confira se as reservas estão caindo em outro anúncio na Stays antes de decidir."]);
  } else if (R && R.tirar.has(u)) {
    classe = "remover";
    if (R.plano && R.plano.us.includes(u)) { const x = R.plano; m.push(["remover", `A ${u.rota} tem margem de contribuição de ${pct(R.mcPct)}, abaixo da meta de ${params.meta}%. Tirando ${x.k} imóveis de menor margem${x.l + x.v >= 0.05 ? ` e ${n1.format(x.l + x.v)} pessoa(s) da equipe` : ""}, ela vai para ${pct(x.pct2)}. Este imóvel tem margem de contribuição de ${pct(u.mcPct)} (${brl.format(u.mc)}/mês), uma das menores da rota.`]); }
    else if (R.parcial && R.parcial.us.includes(u)) m.push(["remover", `Margem de contribuição negativa: traz ${brl.format(u.receitaCD)}/mês e custa ${brl.format(u.cSai + u.cEquipe)} entre custos que saem com ele (${brl.format(u.cSai)}) e equipe da rota que usa (${brl.format(u.cEquipe)}), ou seja, ${brl.format(u.mc)}/mês. Tirando os ${R.parcial.k} imóveis com margem negativa, a ${u.rota} sobe de ${pct(R.mcPct)} para ${pct(R.parcial.pct2)} e ganha ${brl.format(R.parcial.ganho)}/mês (ainda abaixo da meta de ${params.meta}%).`]);
    else m.push(["remover", `Tira dinheiro mesmo sem contar equipe e estrutura: entram ${brl.format(u.receitaCD)}/mês e saem ${brl.format(u.cVar)} de impostos, lavanderia/material, combustível e manutenção.`]);
  }
  if (classe === "manter" && !u.novo && u.receitaCD > 0 && u.mc > 0 && u.margem < params.sub / 100) {
    classe = "substituir";
    const hEmpate = u.horas > 0 ? (u.mc - u.lucro) / u.horas : 0;
    m.push(["substituir", `Paga o que consome (margem de contribuição de ${brl.format(u.mc)}/mês), mas fica longe de pagar a parte dele nos fixos da rota e na estrutura: lucro de ${brl.format(u.lucro)}/mês (${pct(u.margem)}, abaixo do corte de ${params.sub}%). Usa ${n1.format(u.horas)} h/mês de equipe e deixa ${brl.format(u.mcHora)} por hora; para empatar, cada hora precisaria deixar ${brl.format(hEmpate)}. Tirar sem repor piora o resultado em ${brl.format(u.mc)}/mês, porque fixos e estrutura passam para os outros. A saída é trocar: liberar essa equipe para uma entrada num condomínio que dá lucro.`]);
    if (u.resP > 0.2) m.push(["info", `Renegociar: para empatar, precisaria de ${brl.format(-u.lucro)}/mês a mais, cerca de ${brl.format(-u.lucro / u.resP)} a mais por limpeza (${n1.format(u.resP)} limpezas/mês${u.recolhe && u.resP ? `; hoje recolhe ${brl.format(u.limpP / u.resP)} por limpeza` : ""}).`]);
  }
  if (classe === "manter" && !u.novo && u.receitaCD > 0) m.push(["manter", R && R.decisao === "nao_chega" ? `A ${u.rota} está abaixo da meta (${pct(R.mcPct)}) e tirar imóveis não a leva até ${params.meta}%: o problema está nos custos fixos da rota.${R.ganhoFechar > 0 ? ` Fechar a rota inteira melhoraria o resultado em ${brl.format(R.ganhoFechar)}/mês.` : ""}` : `Margem de contribuição de ${pct(u.mcPct)} (${brl.format(u.mc)}/mês): ${u.mc >= 0 ? "paga o que consome e ajuda a rota" : "negativa"}. A ${u.rota} ${R && R.mcPct >= params.meta / 100 ? "está na meta" : R && R.plano ? "chega à meta com os imóveis indicados" : "está abaixo da meta"}.${u.mc > 0 && u.lucro < 0 ? ` O lucro dele é negativo (${brl.format(u.lucro)}, ${pct(u.margem)}) só por carregar ${brl.format(u.cFixos)} de fixos da rota e ${brl.format(u.estrutura)} de estrutura, que não somem se ele sair; está acima do corte de ${params.sub}% para substituir.` : ""}`]);
  if (u.ch_mes >= chP90 && u.ch_mes > 0) {
    if (classe === "manter") classe = "atencao";   // Substituir continua Substituir
    m.push(["atencao", `Muitos chamados: ${n1.format(u.ch_mes)} por mês, entre os 10% mais altos da base.`]);
  }
  if (e.n > 1) { const sai = e.us.filter((x) => x.classe === "remover" || (R && R.tirar.has(x))).length; m.push(["info", `Endereço ${e.nome}: ${e.n} imóveis, margem de contribuição ${brl.format(e.mc)}/mês (${pct(e.mcPct)})${sai ? `. Saem só os ${sai} com margem mais baixa; os outros pagam o que consomem e ficam, então o endereço continua na rota e o deslocamento até ele não muda` : ""}.`]); }
  if (u.outra_rota && u.viz_km > 1 && u.outra_km < u.viz_km * 0.5) {
    m.push(["troca", `Fica a ${n1.format(u.outra_km)} km de uma parada da ${u.outra_rota} e a ${n1.format(u.viz_km)} km da parada mais próxima da própria rota. Vale avaliar a troca.`]);
  }
  if (u.fora?.length) m.push(["info", `Fora da base (Inativo na Mastertable): ${u.fora.map(([a, b]) => a <= P.meses[0] + "-01" ? `já estava fora em ${mesTxt(P.meses[0])} e voltou em ${b ? fmtData(b) : "—"}` : `${fmtData(a)} a ${b ? fmtData(b) : "hoje"}`).join(", ")}. Esses dias não entram na média.`]);
  if (u.gap) m.push(["info", `Sem nenhuma reserva de ${mesTxt(u.gap[0])} a ${mesTxt(u.gap[1])} e depois voltou a vender, sem inativação registrada na Mastertable. ${params.gap === "tirar" ? "Esses meses estão fora da média (Parâmetros)." : "Esses meses contam na média como zero. Se ele estava fora da base, marque Inativo na Mastertable ou mude em Parâmetros."}`]);
  if (u.novo) {
    const regra = classe;
    classe = "maturando";
    m.unshift(["maturando", `${u.reativado ? `Reativado em ${fmtData(u.inicio)} (${u.inicio_motivo})` : `Começou em ${fmtData(u.inicio)} (${u.inicio_motivo})`}, ainda em maturação (menos de 3 meses).${u.contribVar < 0 ? " Hoje ele tira dinheiro mesmo só nos custos variáveis." : ""}${R && R.decisao === "nao_chega" ? ` A ${u.rota} está abaixo da meta.` : ""}`]);
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

// Regiões: rotas do mesmo estado com centro a até 10 km uma da outra dividem equipe (ex.: Corais e Paredão).
// Condomínios prioritários: condomínios e prédios com imóveis maduros que dão lucro.
// A troca só compara perfis parecidos: mesmo número de quartos (ou studio) e capacidade com até 1 hóspede de diferença.
const VIZ_KM = 10;
const perfil = (u) => (u.studio ? "Studio" : u.quartos >= 3 ? "3+ quartos" : u.quartos === 2 ? "2 quartos" : "1 quarto");
const perfilTxt = (u) => perfil(u) + (u.hospedes ? ` · ${u.hospedes} hósp.` : "");
const parecido = (a, b) => perfil(a) === perfil(b) && (a.hospedes == null || b.hospedes == null || Math.abs(a.hospedes - b.hospedes) <= 1);
function media(m) {
  const k = m.length, s = (f) => sum(m, f) / k;
  return k ? { k, rec: s((u) => u.receitaCD), mc: s((u) => u.mc), lucro: s((u) => u.lucro), horas: s((u) => u.horas) } : null;
}
function montarCaptacao() {
  const cen = new Map();
  for (const r of ROT.keys()) {
    const us = OP.filter((u) => u.rota === r);
    if (us.length) cen.set(r, { lat: sum(us, (u) => u.lat) / us.length, lng: sum(us, (u) => u.lng) / us.length, uf: us[0].uf });
  }
  const rotas = [...cen.keys()], grupo = new Map(rotas.map((r) => [r, r]));
  const raiz = (r) => (grupo.get(r) === r ? r : raiz(grupo.get(r)));
  for (const a of rotas) for (const b of rotas) if (a < b && cen.get(a).uf === cen.get(b).uf && hav(cen.get(a), cen.get(b)) <= VIZ_KM) grupo.set(raiz(a), raiz(b));
  const comp = new Map();
  for (const r of rotas) { const k = raiz(r); if (!comp.has(k)) comp.set(k, []); comp.get(k).push(r); }
  REG = new Map(); CAPTAR = new Map();
  for (const rs of comp.values()) {
    rs.sort((a, b) => a.localeCompare(b, "pt-BR"));
    const reg = { nome: rs.map((r) => r.replace("Rota ", "")).join(" + "), rotas: rs, uf: cen.get(rs[0]).uf };
    rs.forEach((r) => REG.set(r, reg));
    const conds = [...END.values()].filter((e) => rs.includes(e.rota)).map((e) => {
      const m = e.us.filter((u) => !u.novo && u.receitaCD > 0);
      // só condomínios e prédios: casa avulsa (tipo "Casa" na Mastertable) não é alvo de captação; 1 imóvel só conta se tiver empreendimento
      if (!m.length || m.every((u) => u.tipo === "Casa") || (m.length === 1 && !m[0].empreend)) return null;
      const c = { e, m, ...media(m) };
      c.lucroPct = c.rec > 0 ? c.lucro / c.rec : -Infinity;
      c.mcHora = c.horas > 0 ? c.mc / c.horas : null;
      const pf = new Map(); m.forEach((u) => pf.set(perfil(u), (pf.get(perfil(u)) || 0) + 1));
      c.perfis = [...pf].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} (${n})`).join(", ");
      return c.lucro > 0 ? c : null;
    }).filter(Boolean).sort((a, b) => b.lucro - a.lucro);
    reg.conds = conds;
    reg.top = conds.filter((c) => c.k >= 2).slice(0, 5);   // cenário só com condomínios de 2+ imóveis (média mais confiável)
    reg.vagas = OP.filter((u) => rs.includes(u.rota) && u.classe === "substituir");
  CAPTAR.set(reg.nome, reg);
  }
}
// O que entraria no lugar de u num condomínio: média dos imóveis de lá com perfil parecido (null se não houver).
const parLa = (c, u) => { const s = media(c.m.filter((x) => parecido(x, u))); return s && s.lucro > 0 ? s : null; };
// Cenário da região para u: média dos imóveis de perfil parecido nos 5 melhores condomínios (2+ imóveis).
const alvoU = (u) => media((REG.get(u.rota)?.top || []).flatMap((c) => c.m.filter((x) => parecido(x, u))));
// Trocar os imóveis `us` por entradas de perfil parecido em cada condomínio da região: o que muda por mês para a empresa.
// Fixos da rota e estrutura não mudam com a troca, então o lucro a mais é a diferença de margem de contribuição.
function trocas(us) {
  const reg = REG.get(us[0]?.rota);
  if (!reg) return [];
  const paradas = new Set(us.map((u) => u.parada));
  return reg.conds.filter((c) => !paradas.has(c.e.id)).map((c) => {
    const pares = us.map((u) => [u, parLa(c, u)]).filter((p) => p[1]);
    if (!pares.length) return null;
    return { ...c, n: pares.length, de: us.length, kPar: Math.max(...pares.map((p) => p[1].k)), lucroLa: sum(pares, (p) => p[1].lucro) / pares.length,
      dRec: sum(pares, ([u, s]) => s.rec - u.receitaCD), dLucro: sum(pares, ([u, s]) => s.mc - u.mc), dH: sum(pares, ([u, s]) => s.horas - u.horas) };
  }).filter((t) => t && t.dLucro > 0).sort((a, b) => b.dLucro - a.dLucro);
}
function tabelaTrocas(us, max = 6) {
  const ts = trocas(us).slice(0, max);
  const pf = [...new Set(us.map(perfilTxt))].join(", ");
  if (!ts.length) return `<p class="small muted">Nenhum condomínio da região tem imóvel de perfil parecido (${esc(pf)}) dando mais lucro.</p>`;
  const reg = REG.get(us[0].rota), sg = (v) => (v >= 0 ? "+" : "−") + brl.format(Math.abs(v));
  return `<p class="small muted">Região ${esc(reg.nome)}. Só condomínios com imóvel de perfil parecido (${esc(pf)}: mesmo número de quartos e até 1 hóspede de diferença). Troca 1 por 1, pela média desses imóveis lá. Fixos da rota e estrutura não mudam com a troca.</p>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Entrar em</th><th class="r">Lucro por imóvel parecido lá</th><th class="r">Receita a mais/mês</th><th class="r">Lucro a mais/mês</th><th class="r">Lucro a mais/ano</th><th class="r">Horas de equipe</th></tr></thead><tbody>
    ${ts.map((t) => `<tr><td class="nome"><b>${esc(t.e.nome)}</b><span>${esc(t.e.rota)} · ${t.kPar === 1 ? "1 imóvel parecido (amostra pequena)" : t.kPar + " imóveis parecidos"}${t.n < t.de ? ` · troca ${t.n} de ${t.de}` : ""}</span></td><td class="r">${brl.format(t.lucroLa)}</td><td class="r">${sg(t.dRec)}</td><td class="r"><b>${sg(t.dLucro)}</b></td><td class="r">${sg(t.dLucro * 12)}</td><td class="r">${t.dH >= 0 ? "+" : "−"}${n1.format(Math.abs(t.dH))} h</td></tr>`).join("")}
    </tbody></table></div>`;
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
  ["nome", "Imóvel"], ["endNome", "Empreendimento / endereço"], ["rota", "Rota"], ["classe", "Decisão"], ["motivoCurto", "Motivo"],
  ["receitaCD", "1. Receita Carpediem", "r"], ["cSai", "2. Custos que saem com ele", "r"], ["cEquipe", "3. Equipe da rota usada", "r"],
  ["mc", "4. Margem de contribuição", "r"], ["mcPct", "%", "r"], ["cFixos", "5a. Fixos da rota", "r"], ["estrutura", "5b. Estrutura CDH", "r"], ["lucro", "6. Lucro", "r"], ["margem", "%", "r"],
];
function renderKpis() {
  const rem = OP.filter((u) => u.classe === "remover"), mat = OP.filter((u) => u.classe === "maturando"), sub = OP.filter((u) => u.classe === "substituir");
  const rotas = [...ROT.values()].filter((R) => R.us.length);
  const rec = sum(rotas, (R) => R.receita), mc = sum(rotas, (R) => R.mc), estr = sum(rotas, (R) => R.estr);
  const abaixo = rotas.filter((R) => R.mcPct < params.meta / 100);
  const comPlano = abaixo.filter((R) => R.plano), semPlano = abaixo.filter((R) => !R.plano);
  const nBase = U.filter((u) => !u.sem_stays).length;
  $("#kpis").innerHTML = `
    <div class="kpi"><span class="k">Margem de contribuição das rotas</span><span class="v">${pct(mc / rec)}</span><span class="s">${brl.format(mc)}/mês de ${brl.format(rec)} que ficam para a Carpediem, só com receitas e despesas das rotas. Período ${periodoTxt()}</span></div>
    <div class="kpi"><span class="k">Depois da estrutura CDH</span><span class="v">${pct((mc - estr) / rec)}</span><span class="s">${brl.format(mc - estr)}/mês, descontando ${brl.format(D.estruturaTotal)} de estrutura (${brl.format(D.estruturaTotal / nBase)} por imóvel)</span></div>
    <div class="kpi bad"><span class="k">Rotas abaixo da meta (${params.meta}%)</span><span class="v">${abaixo.length}</span><span class="s">${abaixo.map((R) => `${esc(R.rota.replace("Rota ", ""))} ${pct(R.mcPct)}`).join(" · ") || "nenhuma"}</span></div>
    <div class="kpi bad"><span class="k">Tirar</span><span class="v">${rem.length}</span><span class="s">imóveis: ${sum(comPlano, (R) => R.plano.k)} para ${comPlano.length} rota(s) chegarem à meta e ${sum(semPlano, (R) => R.parcial ? R.parcial.k : 0)} que dão prejuízo nas rotas que não chegam${sum(comPlano, (R) => R.pessoasMenos) ? `, com ${n1.format(sum(comPlano, (R) => R.pessoasMenos))} pessoa(s) a menos na equipe` : ""}</span></div>
    <div class="kpi warn"><span class="k">Substituir</span><span class="v">${sub.length}</span><span class="s">imóveis que pagam o que consomem mas não pagam fixos e estrutura (${n1.format(sum(sub, (u) => u.horas))} h/mês de equipe). Trocando cada um por um imóvel de perfil parecido nos 5 melhores condomínios (2+ imóveis) da região: ${brl.format(sum(sub, (u) => { const a = alvoU(u); return a ? a.mc - u.mc : 0; }))}/mês a mais de lucro (aba Onde captar)</span></div>
    <div class="kpi warn"><span class="k">Não chegam à meta tirando imóveis</span><span class="v">${semPlano.length}</span><span class="s">${semPlano.map((R) => `${esc(R.rota.replace("Rota ", ""))}${R.parcial ? ` (tirando ${R.parcial.k}: ${pct(R.parcial.pct2)})` : ""}${R.ganhoFechar > 0 ? ` (fechar: +${brl.format(R.ganhoFechar)}/mês)` : ""}`).join(" · ") || "nenhuma"}</span></div>
    <div class="kpi new"><span class="k">Maturando</span><span class="v">${mat.length}</span><span class="s">menos de 3 meses: não entram na decisão. ${OP.filter((u) => u.trocaRota).length} podem trocar de rota</span></div>`;
}
function renderTable() {
  const rota = $("#fRota").value, classe = $("#fClasse").value, q = $("#fBusca").value.trim().toLowerCase(), outra = $("#fOutra").checked, ec = $("#fEnd").value, volta = $("#fVolta").checked;
  let rows = OP.filter((u) => (!rota || u.rota === rota) && (!classe || u.classe === classe) && (!ec || u.endClasse === ec) && (!outra || u.trocaRota) && (!volta || u.fora?.length || u.gap)
    && (!q || [u.nome, u.publico, u.empreend, u.endNome, u.bairro, u.endereco].some((s) => (s || "").toLowerCase().includes(q))));
  const ord = { sair: 0, rever: 1, substituir: 2, novo: 3, manter: 4 };
  rows.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "classe") { const d = CLASSE[x].ordem - CLASSE[y].ordem; return (sortAsc ? 1 : -1) * (d || a.mc - b.mc); }
    if (sortKey === "endClasse") { const d = ord[x] - ord[y]; return (sortAsc ? 1 : -1) * (d || a.endResultado - b.endResultado); }
    if (typeof x === "string" || typeof y === "string") return (sortAsc ? 1 : -1) * String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
    return (sortAsc ? 1 : -1) * ((x ?? -1e12) - (y ?? -1e12));
  });
  $("#fCount").textContent = `${rows.length} imóveis`;
  const head = "<thead><tr>" + COLS.map(([k, t, c]) => `<th data-k="${k}" class="${c || ""} ${k === sortKey ? "sorted" + (sortAsc ? " asc" : "") : ""}">${t}</th>`).join("") + "</tr></thead>";
  const body = rows.slice(0, 800).map((u) => `<tr data-id="${u.id}">
    <td class="nome"><b>${esc(u.publico || u.nome)}</b><span>${esc(u.nome)}${u.fora?.length ? " · saiu e voltou" : u.gap ? " · saiu e voltou?" : ""}</span></td>
    <td class="nome"><b>${esc(u.endNome)}</b><span>${u.na_parada > 1 ? u.na_parada + " imóveis no endereço" : "imóvel único"}</span></td>
    <td>${esc(u.rota)}</td><td>${pill(u.classe)}</td><td class="motivo">${esc(u.motivoCurto)}</td>
    <td class="r">${brl.format(u.receitaCD)}</td><td class="r">${brl.format(u.cSai)}</td><td class="r">${brl.format(u.cEquipe)}</td>
    <td class="r ${u.mc < 0 ? "neg" : ""}">${brl.format(u.mc)}</td><td class="r ${u.mc < 0 ? "neg" : ""}">${pct(u.mcPct)}</td>
    <td class="r">${brl.format(u.cFixos)}</td><td class="r">${brl.format(u.estrutura)}</td>
    <td class="r ${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)}</td><td class="r ${u.lucro < 0 ? "neg" : ""}">${pct(u.margem)}</td></tr>`).join("");
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
    const fora = u.peso && u.peso[i] < 1 && m >= (u.inicio || u.criado || "2000-01").slice(0, 7);
    return `<g ${fora && u.peso[i] === 0 ? 'opacity="0.35"' : ""}><title>${mesTxt(m)}: bruta ${brl.format(s[0])} · Carpediem ${brl.format(s[1] + s[2])} · ${n1.format(s[3])} reservas${fora ? ` · na base ${pct(u.peso[i])} do mês` : ""}</title>
      ${fora ? `<rect x="${i * bw + 2}" y="0" width="${bw - 4}" height="${H - 18}" fill="#EDE7DC" rx="2"></rect>` : ""}
      <rect x="${i * bw + 4}" y="${H - 18 - h1}" width="${bw - 8}" height="${h1}" fill="#C9DCD9" rx="2"></rect>
      <rect x="${i * bw + 4}" y="${H - 18 - h2}" width="${bw - 8}" height="${h2}" fill="#0E6B6B" rx="2"></rect>
      <text x="${i * bw + bw / 2}" y="${H - 4}" font-size="9" text-anchor="middle" fill="#7D8A96">${mesTxt(m)}</text></g>`;
  }).join("");
  const tipos = Object.entries(u.ch_tipos || {}).sort((a, b) => b[1] - a[1]);
  const why = u.op ? `<div class="why ${u.classe}"><b>Decisão: ${CLASSE[u.classe].nome}</b><ul>${u.motivos.map((m) => `<li>${esc(m[1])}</li>`).join("")}</ul></div>` : '<p class="muted">Fora das rotas operacionais.</p>';
  const lin = (t, sub, v, cls = "") => `<tr class="${cls}"><td>${t}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td>${v}</td></tr>`;
  const neg = (v) => (v < 0 ? "+" + brl.format(-v) : "−" + brl.format(v));
  const shareV = R ? pct(u.visitas / (R.V || 1)) : "—";
  const conta = `
    <h3>Memória de cálculo (média por mês · ${esc(periodoTxt())}${u.mesesP < USADOS.length - 0.05 ? ` · ${n1.format(u.mesesP)} meses na base` : ""})</h3>
    <table class="calc">
      ${lin("<b>1. Receita Carpediem</b>", "", `<b>${brl.format(u.receitaCD)}</b>`)}
      ${lin("Taxa de administração", `${pct(u.taxa)} × (total da reserva − comissão do portal − taxa de limpeza) · receita bruta ${brl.format(u.brutaP)}`, brl.format(u.admP))}
      ${lin(`Taxa de limpeza ${u.recolhe ? "recolhida" : "(repassada ao dono)"}`, `${n2.format(u.resP)} reservas/mês`, brl.format(u.limpP))}
      ${lin("<b>2. Custos que saem com o imóvel</b>", "somem se ele sair", `<b>−${brl.format(u.cSai)}</b>`)}
      ${lin("Impostos sobre vendas", `${n1.format(D.aliquota * 100)}% × (receita − limpeza e lavanderia da rota usadas por ele)`, "−" + brl.format(u.impostos))}
      ${lin("Lavanderia, material e limpeza terceirizada", `${n2.format(u.resP)} limpezas × ${R ? brl.format((R.Lp?.terceirizada || 0) / (R.Z || 1)) : "—"} por limpeza na rota (custo do mês ÷ limpezas da rota no mês)`, "−" + brl.format(u.cLimpTerc))}
      ${lin("Combustível", `${n1.format(u.viagensU || 0)} idas/mês × ${n1.format(u.ida_km || 0)} km ida e volta do ponto operacional ÷ ${n1.format(params.cons)} km/l × ${brl2.format(precoGas(u.uf))}`, "−" + brl.format(u.cDescComb || 0))}
      ${lin("Manutenção não reembolsada", `custo com imóveis da rota × ${n2.format(u.ch_mes)} chamados dele ÷ chamados da rota`, neg(u.cImoveis))}
      ${lin("<b>3. Equipe da rota usada por ele</b>", "proporcional ao trabalho que ele dá", `<b>−${brl.format(u.cEquipe)}</b>`)}
      ${lin("Equipe de limpeza", `custo da equipe de limpeza da rota no mês × ${n2.format(u.resP)} limpezas dele ÷ limpezas da rota no mês`, "−" + brl.format(u.cLimpEquipe))}
      ${lin("Vistoria e gestão da operação", `pessoal da rota × ${shareV} das visitas (${n1.format(u.visitas)} limpezas + chamados/mês)`, "−" + brl.format(u.cPessoal))}
      ${lin("Tempo de deslocamento", `${n1.format(u.viagensU || 0)} idas × ${n1.format((u.ida_min || 0) * params.tr)} min × ${brl2.format(salario() / 220)}/h`, "−" + brl.format(u.cDescTempo || 0))}
      ${lin("<b>4. Margem de contribuição</b>", "1 − 2 − 3: o que ele deixa considerando tudo que sairia junto", `<b class="${u.mc < 0 ? "neg" : ""}">${brl.format(u.mc)} · ${pct(u.mcPct)}</b>`, "tot")}
      ${lin("<b>5a. Fixos da rota</b>", `ponto de apoio + veículos e resto do transporte, pela fatia de visitas (${shareV}); não somem se ele sair`, `<b>−${brl.format(u.cFixos)}</b>`)}
      ${lin("<b>5b. Estrutura CDH</b>", `${brl.format(D.estruturaTotal)}/mês ÷ ${U.filter((x) => !x.sem_stays).length} imóveis; não some se ele sair`, `<b>−${brl.format(u.estrutura)}</b>`)}
      ${lin("<b>6. Lucro</b>", "4 − 5a − 5b", `<b class="${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)} · ${pct(u.margem)}</b>`, "tot")}
    </table>`;
  const cond = e && e.n > 1 ? `
    <h3>Endereço ${esc(e.nome)}: ${e.n} imóveis</h3>
    <table class="calc">
      ${lin("Receita Carpediem", "", brl.format(e.receita))}
      ${lin("Margem de contribuição", "soma dos imóveis", `<span class="${e.mc < 0 ? "neg" : ""}">${brl.format(e.mc)} · ${pct(e.mcPct)}</span>`)}
      ${lin("Lucro", "soma dos imóveis (depois de fixos da rota e estrutura)", `<span class="${e.lucro < 0 ? "neg" : ""}">${brl.format(e.lucro)} · ${pct(e.lucroPct)}</span>`)}
    </table>
    <div class="table-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Imóvel</th><th>Decisão</th><th class="r">Receita</th><th class="r">Margem de contribuição</th><th class="r">%</th><th class="r">Lucro</th></tr></thead><tbody>
      ${[...e.us].sort((x, y) => x.mcPct - y.mcPct).map((x) => `<tr data-id="${x.id}" ${x === u ? 'style="background:var(--accent-soft)"' : ""}><td class="nome"><b>${esc(x.publico || x.nome)}</b></td><td>${pill(x.classe)}</td><td class="r">${brl.format(x.receitaCD)}</td><td class="r ${x.mc < 0 ? "neg" : ""}">${brl.format(x.mc)}</td><td class="r">${pct(x.mcPct)}</td><td class="r ${x.lucro < 0 ? "neg" : ""}">${brl.format(x.lucro)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="small muted">Dentro do mesmo endereço, sai quem está na lista da rota (margem mais baixa) ou tem margem de contribuição negativa. Os que ficam pagam o que consomem; com eles o endereço continua na rota e os fixos e o deslocamento até lá não mudam.</p>` : "";
  $("#drawerBody").innerHTML = `
    <h2>${esc(u.publico || u.nome)}</h2>
    <p class="muted small">${esc(u.nomes.join(" · "))}${u.dup ? " · anúncios duplicados unificados" : ""}</p>
    <p class="small"><b>${esc(u.endNome || stopName([u]))}</b> · ${esc(u.endereco || "")} · ${esc(u.rota || "—")} · ${esc(perfilTxt(u))}</p>
    ${why}
    ${u.classe === "substituir" ? `<h3>Trocar por uma entrada em</h3>${tabelaTrocas([u])}` : ""}
    ${conta}
    ${cond}
    <h3>Receita mês a mês</h3>
    <svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita mensal">${bars}</svg>
    <p class="small muted"><span style="color:#8fb3ae">■</span> bruta &nbsp; <span style="color:#0E6B6B">■</span> fica para a Carpediem${u.peso?.some((p, i) => p < 1 && P.meses[i] >= (u.inicio || u.criado || "2000-01").slice(0, 7)) ? ' &nbsp; <span style="color:#d9cfbf">■</span> fora da base (todo ou parte do mês)' : ""}</p>
    <h3>Chamados de manutenção (12 meses): ${u.ch}</h3>
    ${tipos.length ? `<div class="dgrid">${tipos.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div>
      <p class="small muted">${Object.entries(u.ch_nat || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}<br>Origem: ${Object.entries(u.ch_origem || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}</p>` : '<p class="muted small">Nenhum chamado no período.</p>'}
    <h3>Cadastro</h3>
    <p class="small muted">Cadastro na Stays em ${fmtData(u.criado)}${u.reativado ? ` · reativado em ${fmtData(u.inicio)} (${esc(u.inicio_motivo)})` : ""} · líder ${esc(u.lider || "—")} · anúncios ${esc(u.stays.join(", "))}${u.ids_inativos ? ` + ${u.ids_inativos} já desativado(s), com as reservas do período somadas` : ""}</p>`;
  $$("#drawerBody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
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
  return `<div class="tip-emp">${esc(u.endNome)}${e && e.n > 1 ? ` · ${e.n} imóveis` : ""}</div><h4>${esc(u.publico || u.nome)}</h4>${pill(u.classe)}
  <p style="max-width:280px;white-space:normal;margin:6px 0">${esc(u.motivoCurto)}</p>
  <table><tr><td>Receita Carpediem</td><td>${brl.format(u.receitaCD)}</td></tr>
  <tr><td>Margem de contribuição</td><td>${brl.format(u.mc)} (${pct(u.mcPct)})</td></tr>
  <tr><td>Lucro</td><td>${brl.format(u.lucro)} (${pct(u.margem)})</td></tr>
  ${e && e.n > 1 ? `<tr><td>Endereço: margem / lucro</td><td>${pct(e.mcPct)} / ${brl.format(e.lucro)}</td></tr>` : ""}</table>`;
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
const mOff = { u: new Set(), e: new Set() };   // status desmarcados no filtro do mapa (imóvel / endereço)
const COR_END = { sair: "#C2402A", rever: "#E07B24", substituir: "#F0A35E", manter: "#2F8A57", novo: "#3A68B8" };
function renderMapa() {
  if ($("#tab-mapa").hidden) return;
  if (!mapa) { mapa = baseMap("map"); mLayer = L.layerGroup().addTo(mapa); }
  fillRotaSelect($("#mRota"), "Todas as rotas");
  const rota = $("#mRota").value, porEnd = $("#mPorEnd").checked, nomes = $("#mNomes").checked;
  const usRota = OP.filter((u) => !rota || u.rota === rota);
  const endsRota = [...new Set(usRota.map((u) => u.parada))].map((id) => END.get(id));
  const ends = endsRota.filter((e) => !porEnd || !mOff.e.has(e.classe));
  const us = porEnd ? usRota.filter((u) => ends.includes(END.get(u.parada))) : usRota.filter((u) => !mOff.u.has(u.classe));
  const endsVis = porEnd ? ends : [...new Set(us.map((u) => u.parada))].map((id) => END.get(id));
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
      L.circleMarker([c.lat, c.lng], { radius: 6 + Math.min(14, Math.sqrt(e.n) * 3), color: "#fff", weight: 1.5, fillColor: COR_END[e.classe], fillOpacity: 0.9 })
        .bindTooltip(`<div class="tip-emp">${esc(e.nome)}</div><h4>${e.n} imóveis · ${END_CLASSE[e.classe].nome}</h4><table><tr><td>Receita Carpediem</td><td>${brl.format(e.receita)}</td></tr><tr><td>Margem de contribuição</td><td>${brl.format(e.mc)} (${pct(e.mcPct)})</td></tr><tr><td>Lucro</td><td>${brl.format(e.lucro)} (${pct(e.lucroPct)})</td></tr><tr><td>Saem</td><td>${e.us.filter((u) => u.classe === "remover").length} de ${e.n}</td></tr></table>`, { className: "tip", direction: "top", sticky: true })
        .on("click", () => openStop(e)).addTo(mLayer);
    }
  } else {
    for (const [u, la, ln] of spread(us)) {
      L.circleMarker([la, ln], { radius: radius(u), color: "#fff", weight: 1.2, fillColor: CLASSE[u.classe].cor, fillOpacity: 0.9 })
        .bindTooltip(tipHtml(u), { className: "tip", direction: "top", sticky: true })
        .on("click", () => openUnit(u.id)).addTo(mLayer);
    }
  }
  if (nomes) for (const e of endsVis) {
    const c = e.us[0];
    L.tooltip({ permanent: true, direction: "right", className: "stop-label", offset: [8, 0] }).setLatLng([c.lat, c.lng]).setContent(`${esc(e.nome)}${e.n > 1 ? ` (${e.n})` : ""}`).addTo(mLayer);
  }
  if (us.length) mapa.fitBounds(L.latLngBounds(us.map((u) => [u.lat, u.lng])).pad(0.08));
  setTimeout(() => mapa.invalidateSize(), 50);
  const chk = (modo, k, cor, nome, n) => `<label class="row chk-status"><input type="checkbox" data-m="${modo}" data-k="${k}" ${mOff[modo].has(k) ? "" : "checked"}><span class="dot" style="background:${cor}"></span>${nome} <span class="muted">(${n})</span></label>`;
  $("#mLegend").innerHTML = '<div class="small muted" style="margin-bottom:4px">Filtrar por status</div>' + (porEnd
    ? Object.entries(END_CLASSE).map(([k, c]) => chk("e", k, COR_END[k], c.nome, endsRota.filter((e) => e.classe === k).length)).join("") + '<p class="small muted">Tamanho = número de imóveis no endereço. Clique para ver os imóveis.</p>'
    : Object.entries(CLASSE).filter(([k]) => k !== "abaixo").map(([k, c]) => chk("u", k, c.cor, c.nome, usRota.filter((u) => u.classe === k).length)).join("") + '<p class="small muted">Tamanho = receita bruta por mês. Passe o mouse para ver o motivo, clique para a conta completa.</p>');
  const R = rota ? ROT.get(rota) : null;
  $("#mResumo").innerHTML = `
    <div class="stat"><span>Imóveis / endereços</span><b>${us.length} / ${endsVis.length}</b></div>
    <div class="stat"><span>Fica p/ Carpediem/mês</span><b>${brl.format(sum(us, (u) => u.receitaCD))}</b></div>
    <div class="stat"><span>Custo direto da rota/mês</span><b>${brl.format(sum(us, (u) => u.custoRota))}</b></div>
    <div class="stat"><span>Impostos/mês</span><b>${brl.format(sum(us, (u) => u.impostos))}</b></div>
    <div class="stat"><span>Estrutura rateada/mês</span><b>${brl.format(sum(us, (u) => u.estrutura))}</b></div>
    <div class="stat"><span>Lucro/mês</span><b>${brl.format(sum(us, (u) => u.lucro))}</b></div>
    ${R ? `<div class="stat"><span>Custo da rota por visita</span><b>${brl.format(R.custoVisita)}</b></div>` : ""}`;
  if (rota && P.rotas[rota]) {
    const Rr = P.rotas[rota];
    const eSair = endsRota.filter((e) => e.classe === "sair");
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
  const meta = params.meta / 100;
  const rows = [...ROT.values()].filter((R) => R.us.length).sort((a, b) => a.mcPct - b.mcPct);
  const dec = (R) => R.mcPct >= meta ? '<span class="pill manter">Na meta</span>' : R.plano ? '<span class="pill remover">Tirar imóveis</span>' : R.parcial ? '<span class="pill abaixo">Tirar os que dão prejuízo · não chega à meta</span>' : '<span class="pill abaixo">Não chega à meta</span>';
  $("#rtbl").innerHTML = `<thead><tr><th>Rota</th><th>Decisão</th><th class="r">Imóveis</th><th class="r">Receita Carpediem</th><th class="r">Custos da rota + impostos</th><th class="r">Margem de contribuição</th><th class="r">%</th><th class="r">Estrutura CDH</th><th class="r">% depois da estrutura</th><th class="r">Imóveis a tirar</th><th class="r">Pessoas a menos</th><th class="r">% depois de tirar</th></tr></thead><tbody>` +
    rows.map((R) => `<tr data-r="${esc(R.rota)}"><td class="nome"><b>${esc(R.rota)}</b><span>equipe: ${n1.format(R.eq.limpeza)} limpeza + ${n1.format(R.eq.vistoria)} vistoria</span></td><td>${dec(R)}</td><td class="r">${R.us.length}</td>
      <td class="r">${brl.format(R.receita)}</td><td class="r">${brl.format(R.receita - R.mc)}</td><td class="r ${R.mc < 0 ? "neg" : ""}">${brl.format(R.mc)}</td>
      <td class="r ${R.mcPct < meta ? "neg" : ""}">${pct(R.mcPct)}</td><td class="r">${brl.format(R.estr)}</td><td class="r ${R.posPct < 0 ? "neg" : ""}">${pct(R.posPct)}</td>
      <td class="r">${R.tirar.size || "—"}</td><td class="r">${R.pessoasMenos ? n1.format(R.pessoasMenos) : "—"}</td><td class="r">${R.plano ? pct(R.plano.pct2) : R.parcial ? `${pct(R.parcial.pct2)} (abaixo da meta)` : "—"}</td></tr>`).join("") + "</tbody>";
  $$("#rtbl tbody tr").forEach((tr) => tr.addEventListener("click", () => { $("#fRota").value = tr.dataset.r; document.querySelector('.tab[data-tab="decisao"]').click(); }));
}

/* ---------------- aba Endereços ---------------- */
function renderPredios() {
  if ($("#tab-predios").hidden) return;
  fillRotaSelect($("#pRota"), "Todas as rotas");
  const rota = $("#pRota").value, min = +$("#pMin").value;
  const ord = { sair: 0, rever: 1, substituir: 2, novo: 3, manter: 4 };
  const rows = [...END.values()].filter((e) => (!rota || e.rota === rota) && e.n >= min).sort((a, b) => ord[a.classe] - ord[b.classe] || a.mcPct - b.mcPct);
  const cnt = (e, c) => e.us.filter((u) => u.classe === c).length;
  $("#ptbl").innerHTML = `<thead><tr><th>Empreendimento / endereço</th><th>Rota</th><th>Decisão</th><th class="r">Imóveis</th><th class="r">Saem</th><th class="r">1. Receita Carpediem</th><th class="r">4. Margem de contribuição</th><th class="r">%</th><th class="r">6. Lucro</th><th class="r">%</th></tr></thead><tbody>` +
    rows.map((e, i) => `<tr data-p="${i}"><td class="nome"><b>${esc(e.nome)}</b><span>${esc(e.us[0].endereco || "")}</span></td><td>${esc(e.rota)}</td><td>${pillEnd(e.classe)}</td><td class="r">${e.n}</td>
      <td class="r">${cnt(e, "remover") ? `<span class="neg">${cnt(e, "remover")}</span>` : 0}</td><td class="r">${brl.format(e.receita)}</td>
      <td class="r ${e.mc < 0 ? "neg" : ""}">${brl.format(e.mc)}</td><td class="r ${e.mc < 0 ? "neg" : ""}">${pct(e.mcPct)}</td>
      <td class="r ${e.lucro < 0 ? "neg" : ""}">${brl.format(e.lucro)}</td><td class="r ${e.lucro < 0 ? "neg" : ""}">${pct(e.lucroPct)}</td></tr>`).join("") + "</tbody>";
  $$("#ptbl tbody tr").forEach((tr) => tr.addEventListener("click", () => openStop(rows[+tr.dataset.p])));
}
function openStop(e) {
  const lin = (t, sub, v, cls = "") => `<tr class="${cls}"><td>${t}${sub ? `<span class="sub">${sub}</span>` : ""}</td><td>${v}</td></tr>`;
  const sai = e.us.filter((u) => u.classe === "remover");
  $("#drawerBody").innerHTML = `<h2>${esc(e.nome)}</h2><p class="muted small">${esc(e.us[0].endereco || "")} · ${esc(e.rota)}</p>
    <p>${pillEnd(e.classe)}</p>
    <h3>Conta do endereço (soma dos ${e.n} imóveis, média por mês)</h3>
    <table class="calc">
      ${lin("1. Receita Carpediem", "", brl.format(e.receita))}
      ${lin("2. Custos que saem com os imóveis", "impostos, lavanderia/material/terceirizados, combustível, manutenção", "−" + brl.format(e.cSai))}
      ${lin("3. Equipe da rota usada", "limpeza, vistoria e tempo de deslocamento", "−" + brl.format(e.cEquipe))}
      ${lin("<b>4. Margem de contribuição</b>", "1 − 2 − 3", `<b class="${e.mc < 0 ? "neg" : ""}">${brl.format(e.mc)} · ${pct(e.mcPct)}</b>`, "tot")}
      ${lin("5a. Fixos da rota", "ponto de apoio, veículos e transporte", "−" + brl.format(e.cFixos))}
      ${lin("5b. Estrutura CDH", "", "−" + brl.format(e.estrutura))}
      ${lin("<b>6. Lucro</b>", "4 − 5a − 5b", `<b class="${e.lucro < 0 ? "neg" : ""}">${brl.format(e.lucro)} · ${pct(e.lucroPct)}</b>`, "tot")}
    </table>
    ${e.us.some((u) => u.classe === "substituir") ? `<h3>Trocar os ${e.us.filter((u) => u.classe === "substituir").length} imóveis a substituir por entradas em</h3>${tabelaTrocas(e.us.filter((u) => u.classe === "substituir"))}` : ""}
    ${sai.length && sai.length < e.us.length ? `<p class="small muted">Saem ${sai.length} de ${e.n}: os de margem mais baixa. Os outros pagam o que consomem, então o endereço continua na rota e o deslocamento até ele não muda.</p>` : ""}
    <h3>Imóveis (da menor para a maior margem)</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Imóvel</th><th>Decisão</th><th class="r">Receita</th><th class="r">Margem de contribuição</th><th class="r">%</th><th class="r">Lucro</th></tr></thead><tbody>${[...e.us].sort((a, b) => a.mcPct - b.mcPct).map((u) => `<tr data-id="${u.id}"><td class="nome"><b>${esc(u.publico || u.nome)}</b></td><td>${pill(u.classe)}</td><td class="r">${brl.format(u.receitaCD)}</td><td class="r ${u.mc < 0 ? "neg" : ""}">${brl.format(u.mc)}</td><td class="r">${pct(u.mcPct)}</td><td class="r ${u.lucro < 0 ? "neg" : ""}">${brl.format(u.lucro)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("#drawerBody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
  $("#drawer").hidden = false;
}

/* ---------------- aba Onde captar ---------------- */
function renderCaptar() {
  if ($("#tab-captar").hidden) return;
  const sel = $("#cReg"), cur = sel.value;
  const regs = [...CAPTAR.values()].filter((r) => r.conds.length || r.vagas.length).sort((a, b) => b.vagas.length - a.vagas.length || a.nome.localeCompare(b.nome, "pt-BR"));
  sel.innerHTML = regs.map((r) => `<option value="${esc(r.nome)}">${esc(r.uf)} · ${esc(r.nome)} (${r.vagas.length} a substituir)</option>`).join("");
  if (regs.some((r) => r.nome === cur)) sel.value = cur;
  const reg = CAPTAR.get(sel.value);
  if (!reg) { $("#cOut").innerHTML = ""; return; }
  const v = reg.vagas, n = v.length, rec = sum(v, (u) => u.receitaCD), mc = sum(v, (u) => u.mc), h = sum(v, (u) => u.horas), luc = sum(v, (u) => u.lucro);
  const sg = (x) => (x >= 0 ? "+" : "−") + brl.format(Math.abs(x));
  // cenário: cada vaga vira a média dos imóveis de perfil parecido nos 5 melhores condomínios
  const comAlvo = v.map((u) => [u, alvoU(u)]).filter((p) => p[1]);
  const cen = comAlvo.length ? { n: comAlvo.length, rec: sum(comAlvo, ([u, s]) => s.rec - u.receitaCD), luc: sum(comAlvo, ([u, s]) => s.mc - u.mc) } : null;
  const vagasHtml = n ? `<div class="table-wrap"><table class="tbl" id="cVagas"><thead><tr><th>Imóvel a substituir</th><th>Perfil</th><th>Rota</th><th class="r">Receita</th><th class="r">Margem de contribuição</th><th class="r">Lucro</th><th class="r">Horas de equipe</th><th class="r">R$ por hora</th><th>Melhor troca de mesmo perfil</th></tr></thead><tbody>
    ${[...v].sort((a, b) => a.lucro - b.lucro).map((u) => { const t = trocas([u])[0]; return `<tr data-id="${u.id}"><td class="nome"><b>${esc(u.publico || u.nome)}</b><span>${esc(u.endNome)}</span></td><td>${esc(perfilTxt(u))}</td><td>${esc(u.rota)}</td><td class="r">${brl.format(u.receitaCD)}</td><td class="r">${brl.format(u.mc)}</td><td class="r neg">${brl.format(u.lucro)}</td><td class="r">${n1.format(u.horas)} h</td><td class="r">${brl.format(u.mcHora)}</td><td class="nome">${t ? `<b>${esc(t.e.nome)}</b><span>${sg(t.dLucro)}/mês de lucro</span>` : '<span>sem condomínio de perfil parecido</span>'}</td></tr>`; }).join("")}
    </tbody></table></div>` : '<p class="muted small">Nenhum imóvel a substituir nesta região.</p>';
  // por condomínio: troca só as vagas de perfil parecido com algum imóvel de lá
  const conds = reg.conds.map((c) => {
    const pares = v.filter((u) => u.parada !== c.e.id).map((u) => [u, parLa(c, u)]).filter((p) => p[1]);
    const q = pares.length || 1;   // por troca: média das vagas compatíveis
    return { ...c, nV: pares.length, dRec: sum(pares, ([u, s]) => s.rec - u.receitaCD) / q, dLucro: sum(pares, ([u, s]) => s.mc - u.mc) / q };
  });
  $("#cOut").innerHTML = `
    <div class="kpis">
      <div class="kpi warn"><span class="k">Imóveis a substituir</span><span class="v">${n}</span><span class="s">${brl.format(rec)}/mês de receita, ${brl.format(mc)} de margem de contribuição e ${brl.format(luc)} de lucro</span></div>
      <div class="kpi"><span class="k">Equipe que eles ocupam</span><span class="v">${n1.format(h)} h/mês</span><span class="s">${brl.format(h ? mc / h : 0)} de margem por hora de equipe</span></div>
      <div class="kpi ok"><span class="k">Cenário: trocar ${cen ? cen.n : 0} de ${n}</span><span class="v">${cen ? sg(cen.luc) : "—"}</span><span class="s">${cen ? `de lucro por mês (${sg(cen.luc * 12)}/ano) e ${sg(cen.rec)} de receita por mês (${sg(cen.rec * 12)}/ano), se cada um virar um imóvel de perfil parecido na média dos ${reg.top.length} melhores condomínios com 2+ imóveis${cen.n < n ? `. ${n - cen.n} não têm perfil parecido nesses condomínios` : ""}` : "sem condomínio prioritário com perfil parecido"}</span></div>
    </div>
    <h3>Condomínios prioritários para entrada (por lucro médio por imóvel)</h3>
    <p class="small muted">Rotas da região: ${esc(reg.rotas.join(", "))}. Vagas de perfil parecido = imóveis a substituir da região com o mesmo número de quartos (ou studio) e até 1 hóspede de diferença de algum imóvel de lá que dá lucro. "Por troca" = média do que muda, por mês, quando uma dessas vagas vira um imóvel parecido de lá. O total da região está no cenário acima. Fixos da rota e estrutura não mudam com a troca, então o lucro a mais é a diferença de margem de contribuição. Clique no condomínio para ver os imóveis.</p>
    <div class="table-wrap"><table class="tbl" id="cConds"><thead><tr><th>#</th><th>Condomínio</th><th>Rota</th><th class="r">Imóveis</th><th>Perfis lá</th><th class="r">Receita por imóvel</th><th class="r">Lucro por imóvel</th><th class="r">Margem de lucro</th><th class="r">R$ por hora de equipe</th><th class="r">Vagas de perfil parecido</th><th class="r">Receita a mais por troca/mês</th><th class="r">/ano</th><th class="r">Lucro a mais por troca/mês</th><th class="r">/ano</th></tr></thead><tbody>
    ${conds.map((c, i) => `<tr data-p="${i}"><td>${i + 1}</td><td class="nome"><b>${esc(c.e.nome)}</b><span>${esc(c.e.us[0].endereco || "")}</span></td><td>${esc(c.e.rota)}</td><td class="r">${c.k}${c.k === 1 ? '<span class="sub">amostra pequena</span>' : ""}</td><td class="small">${esc(c.perfis)}</td><td class="r">${brl.format(c.rec)}</td><td class="r">${brl.format(c.lucro)}</td><td class="r">${pct(c.lucroPct)}</td><td class="r">${brl.format(c.mcHora)}</td>
      <td class="r">${c.nV || "—"}</td>${c.nV ? `<td class="r">${sg(c.dRec)}</td><td class="r">${sg(c.dRec * 12)}</td><td class="r ${c.dLucro < 0 ? "neg" : ""}"><b>${sg(c.dLucro)}</b></td><td class="r ${c.dLucro < 0 ? "neg" : ""}">${sg(c.dLucro * 12)}</td>` : '<td class="r">—</td><td class="r">—</td><td class="r">—</td><td class="r">—</td>'}</tr>`).join("") || '<tr><td colspan="14" class="muted">Nenhum condomínio com imóveis maduros dando lucro.</td></tr>'}
    </tbody></table></div>
    <h3>Imóveis a substituir na região</h3>
    ${vagasHtml}`;
  $$("#cConds tbody tr[data-p]").forEach((tr) => tr.addEventListener("click", () => openStop(conds[+tr.dataset.p].e)));
  $$("#cVagas tbody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
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
  ${bloco("1. A conta (igual para imóvel, endereço e rota)", [
    linha("1. Receita Carpediem", "taxa de administração + taxa de limpeza"),
    linha("2. Custos que saem com o imóvel", "impostos + lavanderia/material/limpeza terceirizada + combustível + manutenção não reembolsada"),
    linha("3. Equipe da rota usada por ele", "equipe de limpeza (pelas limpezas) + vistoria e gestão (pelas visitas) + tempo de deslocamento"),
    linha("4. Margem de contribuição", "1 − 2 − 3: o que o imóvel deixa considerando tudo que sairia junto com ele"),
    linha("5a. Fixos da rota", "ponto de apoio + veículos e resto do transporte (só somem fechando a rota)"),
    linha("5b. Estrutura CDH", "estrutura ÷ imóveis (não some se imóveis saírem)"),
    linha("6. Lucro", "4 − 5a − 5b"),
    linha("Endereço e rota", "soma dos imóveis; a margem da rota = (soma das margens dos imóveis − fixos da rota) ÷ receita"),
    linha("Por que o custo varia entre imóveis da mesma rota", "cada um usa a equipe e os insumos na proporção das limpezas, chamados e idas que gera"),
  ])}
  ${bloco("2. Receita Carpediem (reservas da Stays)", [
    linha("Taxa de administração", "% da Mastertable × (total da reserva − comissão do portal − taxa de limpeza)"),
    linha("Taxa de limpeza", "valor cobrado do hóspede, quando o formato é \"Recolhe\""),
    linha("Fora da conta", "canceladas e uso do proprietário"),
    linha("Prédios (grupo na Stays)", "receita do grupo ÷ unidades distintas"),
    linha("Média mensal", "receita ÷ meses na base, desde o início do imóvel (cadastro na Stays ou ativação na Mastertable)"),
    linha("Meses na base", "histórico de status da Mastertable (Jestor): dias como Inativo não contam; mês parcial conta pela fração de dias"),
    linha("Saiu e voltou?", `3+ meses seguidos sem nenhuma reserva e depois voltou a vender, sem Inativo registrado: ${params.gap === "tirar" ? "esses meses saem da média" : "contam como zero (pode ser imóvel ruim); mude em Parâmetros"}`),
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
    linha("Margem de contribuição da rota", "(receita Carpediem − custos da rota − impostos) ÷ receita, só com receitas e despesas da rota"),
    linha("Depois da estrutura CDH", "mesma conta descontando a estrutura rateada por imóvel"),
    linha("Meta", `${params.meta}% de margem de contribuição, igual para todas as rotas (Parâmetros)`),
    linha("Rota abaixo da meta", "tira imóveis do de menor margem para o de maior até a rota chegar à meta"),
    linha("Equipe ao tirar imóveis", params.equipeProp !== "inteiras" ? "médio prazo: a equipe acompanha o volume; cada imóvel que sai leva a parte dele na equipe de limpeza, vistoria e tempo de deslocamento (ponto de apoio, veículos e resto do transporte ficam)" : "curto prazo: só corta pessoas inteiras quando as limpezas que saem somam o que uma pessoa faz (limpezas da rota ÷ pessoas de limpeza)"),
    linha("Não chega à meta", "mesmo tirando imóveis a margem não sobe o bastante: o problema está nos custos fixos da rota; mostra quanto fechar a rota mudaria"),
    linha(pill("remover"), "está na lista da rota para chegar à meta, ou tira dinheiro mesmo só nos custos variáveis"),
    linha(pill("substituir"), `margem de contribuição positiva, mas margem de lucro abaixo de ${params.sub}% (Parâmetros): paga o que consome e fica longe de pagar fixos da rota e estrutura. Tirar sem repor piora o resultado; troca por uma entrada num condomínio prioritário`),
    linha("Horas de equipe", `custo da equipe usada pelo imóvel (3) ÷ ${brl2.format(salario() / 220)}/h`),
    linha("Região", `rotas do mesmo estado com centro a até ${VIZ_KM} km uma da outra; podem dividir e redimensionar equipe`),
    linha("Condomínio prioritário", "condomínio ou prédio com imóveis maduros e lucro positivo, ordenado pelo lucro médio por imóvel; casas avulsas ficam fora; com 1 imóvel só, marcado como amostra pequena"),
    linha("Troca", "1 imóvel a substituir por 1 entrada de perfil parecido no condomínio (mesmo número de quartos ou studio, até 1 hóspede de diferença; capacidade e quartos da Stays), pela média desses imóveis lá; lucro a mais = margem de contribuição de lá − a do imóvel que sai (fixos e estrutura não mudam)"),
    linha("Cenário da região", "cada imóvel a substituir vira a média dos imóveis de perfil parecido nos 5 melhores condomínios da região com 2+ imóveis"),
    linha(pill("manter"), "fica"),
    linha(pill("maturando"), "menos de 3 meses desde o início; não entra na decisão"),
    linha(pill("atencao"), "sem reservas no período: conferir o anúncio"),
    linha("Fora da estrutura", "despesas pagas a definir, enxoval em estoque, impostos de DP, férias e rescisões"),
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
  renderKpis(); renderTable(); renderMapa(); renderRoteiro(); renderRotas(); renderPredios(); renderCaptar(); renderSemRota(); renderMetodo();
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
  ["#fRota", "#fClasse", "#fOutra", "#fEnd", "#fVolta"].forEach((s) => $(s).addEventListener("change", renderTable));
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
  $("#mLegend").addEventListener("change", (ev) => { const c = ev.target.closest("input[data-k]"); if (!c) return; mOff[c.dataset.m][c.checked ? "delete" : "add"](c.dataset.k); renderMapa(); });
  $("#rRota").addEventListener("change", () => { usarPontoOperacional(); drawRouteStops(); $("#rOut").innerHTML = ""; });
  $("#rSemRem").addEventListener("change", drawRouteStops);
  $("#rBusca").addEventListener("click", geocode);
  $("#rEnd").addEventListener("keydown", (e) => { if (e.key === "Enter") geocode(); });
  $("#rCalc").addEventListener("click", calcRoute);
  $$("#rModo button").forEach((b) => b.addEventListener("click", () => { rModo = b.dataset.v; $$("#rModo button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#pRota").addEventListener("change", renderPredios);
  $("#pMin").addEventListener("change", renderPredios);
  $("#cReg").addEventListener("change", renderCaptar);
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
