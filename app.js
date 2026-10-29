import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const params = { meta: 20, rateio: "igual", pkm: 50 };

/* ---------------- parâmetros ---------------- */
function loadParams() {
  try { Object.assign(params, JSON.parse(localStorage.getItem("raiox-params-v5") || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem("raiox-params-v5", JSON.stringify(params)); } catch (e) {} };
  const bind = (id, k, num) => {
    const el = document.getElementById(id);
    el.value = params[k];
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { params[k] = num ? parseFloat(el.value) || 0 : el.value; save(); recompute(); });
  };
  bind("pMeta", "meta", true); bind("pRateio", "rateio", false); bind("pKm", "pkm", true);
}
// dias com ao menos uma visita no mês: visitas no mesmo dia viram uma viagem só
const viagens = (visitas) => 30 * (1 - Math.exp(-visitas / 30));

/* ---------------- cálculo ---------------- */
function periodo() {
  const idx = P.dre.meses.map((m) => P.meses.indexOf(m)).filter((i) => i >= 0);
  return idx;
}
function recompute() {
  const idx = periodo();
  for (const u of U) {
    const ini = (u.criado || "2000-01").slice(0, 7);
    const ativos = idx.filter((i) => P.meses[i] >= ini);
    const n = ativos.length || 0;
    const avg = (k) => (n ? sum(ativos, (i) => u.serie[i][k]) / n : 0);
    u.mesesP = n;
    u.brutaP = avg(0); u.admP = avg(1); u.limpP = avg(2); u.resP = avg(3);
    u.receitaCD = u.admP + u.limpP;
    u.visitas = u.resP + u.ch_mes;
    u.op = !NAO_OPERACIONAIS.has(u.rota) && u.lat != null && u.parada != null && !u.sem_stays;
    u.temRotaDre = !!P.dre.rotas[u.rota];
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
  // rateio do custo direto de cada rota (DRE)
  ROT = new Map();
  for (const [rota, d] of Object.entries(P.dre.rotas)) {
    const us = U.filter((u) => u.rota === rota && !u.sem_stays);
    const ops = us.filter((u) => u.op);
    const V = sum(us, (u) => u.visitas) || 1, C = sum(us, (u) => u.ch_mes);
    const ends = [...new Set(ops.map((u) => u.parada))].map((id) => END.get(id));
    const K = sum(ends, (e) => e.kmMes);
    const fk = K > 0 ? params.pkm / 100 : 0;
    for (const u of us) {
      const e = END.get(u.parada);
      const kmU = e && e.visitas ? e.kmMes * (u.visitas / e.visitas) : 0;
      u.cPessoal = d.pessoal * (u.visitas / V);
      u.cApoio = d.ponto_apoio * (u.visitas / V);
      u.cTranspVis = d.transporte * (1 - fk) * (u.visitas / V);
      u.cTranspKm = K > 0 ? d.transporte * fk * (kmU / K) : 0;
      u.cImoveis = d.imoveis * (C > 0 ? u.ch_mes / C : u.visitas / V);
      u.kmU = kmU;
    }
    ROT.set(rota, { rota, d, us, V, custoVisita: d.total / V });
  }
  // estrutura
  const nImoveis = U.filter((u) => !u.sem_stays).length;
  const recTot = sum(U.filter((u) => !u.sem_stays), (u) => u.receitaCD) || 1;
  for (const u of U) {
    if (!u.temRotaDre || u.sem_stays) { u.cPessoal = u.cApoio = u.cTranspVis = u.cTranspKm = u.cImoveis = u.kmU = 0; }
    u.custoRota = u.cPessoal + u.cApoio + u.cTranspVis + u.cTranspKm + u.cImoveis;
    u.estrutura = u.sem_stays ? 0 : params.rateio === "igual" ? P.dre.estrutura / nImoveis : P.dre.estrutura * (u.receitaCD / recTot);
    u.lucro = u.receitaCD - u.custoRota - u.estrutura;
    u.margem = u.receitaCD > 0 ? u.lucro / u.receitaCD : -Infinity;
    u.contribuicao = u.receitaCD - u.custoRota;
  }
  const chP90 = [...OP.map((u) => u.ch_mes)].sort((a, b) => a - b)[Math.floor(OP.length * 0.9)] || 99;
  for (const e of END.values()) {
    e.receita = sum(e.us, (u) => u.receitaCD);
    e.custoRota = sum(e.us, (u) => u.custoRota);
    e.estrutura = sum(e.us, (u) => u.estrutura);
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
    m.push(["atencao", "Nenhuma reserva em jan–ago/2026 neste cadastro. Confira se as reservas estão caindo em outro anúncio na Stays antes de decidir."]);
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
    m.unshift(["maturando", `Cadastrado na Stays em ${fmtData(u.criado)}, ainda em maturação (menos de 6 meses).${regra === "remover" ? " Pelo resultado de hoje estaria em Remover." : regra === "abaixo" ? " Pelo resultado de hoje estaria abaixo da meta." : ""}`]);
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
    <div class="kpi"><span class="k">Resultado da operação (jan–ago/26)</span><span class="v">${brl.format(luc)}</span><span class="s">por mês: ${brl.format(rec)} ficam para a Carpediem − ${brl.format(P.dre.total)} de dispêndios. Margem ${pct(luc / rec)}</span></div>
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
    <h3>A conta do imóvel (média por mês, jan–ago/2026${u.mesesP < 8 ? `, ${u.mesesP} meses ativos` : ""})</h3>
    <table class="calc">
      <tr><td>Receita bruta<span class="sub">total pago pelos hóspedes</span></td><td>${brl.format(u.brutaP)}</td></tr>
      <tr><td>Taxa de administração<span class="sub">${pct(u.taxa)} das diárias</span></td><td>${brl.format(u.admP)}</td></tr>
      <tr><td>Taxa de limpeza ${u.recolhe ? "recolhida" : "(repassada ao dono)"}</td><td>${brl.format(u.limpP)}</td></tr>
      <tr class="tot"><td>Fica para a Carpediem</td><td>${brl.format(u.receitaCD)}</td></tr>
      <tr><td>Pessoal da operação da rota<span class="sub">${share} (${n1.format(u.visitas)} visitas/mês: limpezas + chamados)</span></td><td>−${brl.format(u.cPessoal)}</td></tr>
      <tr><td>Ponto de apoio da rota<span class="sub">pelas visitas</span></td><td>−${brl.format(u.cApoio)}</td></tr>
      <tr><td>Transporte da rota, parte pelas visitas<span class="sub">${100 - params.pkm}% do transporte da rota</span></td><td>−${brl.format(u.cTranspVis)}</td></tr>
      <tr><td>Transporte da rota, parte pelos km<span class="sub">${params.pkm}% do transporte, pelo km a mais que o endereço exige (${n1.format(u.kmU)} km/mês dele)</span></td><td>−${brl.format(u.cTranspKm)}</td></tr>
      <tr><td>Custo com imóveis da rota<span class="sub">pelos chamados (${n2.format(u.ch_mes)}/mês)</span></td><td>−${brl.format(u.cImoveis)}</td></tr>
      <tr class="tot"><td>Contribuição (depois da rota)</td><td class="${u.contribuicao < 0 ? "neg" : ""}">${brl.format(u.contribuicao)}</td></tr>
      <tr><td>Estrutura da empresa<span class="sub">${params.rateio === "igual" ? `${brl.format(P.dre.estrutura)}/mês ÷ ${U.filter((x) => !x.sem_stays).length} imóveis` : "proporcional ao que fica para a Carpediem"}</span></td><td>−${brl.format(u.estrutura)}</td></tr>
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
    <p class="small muted">${esc(u.rota || "—")} · líder ${esc(u.lider || "—")}${R ? ` · custo da rota por visita ${brl.format(R.custoVisita)}` : ""}<br>Cadastro na Stays em ${fmtData(u.criado)} · Stays ${esc(u.stays.join(", "))}</p>`;
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
  if (porEnd) {
    for (const e of ends) {
      const c = e.us[0];
      L.circleMarker([c.lat, c.lng], { radius: 6 + Math.min(14, Math.sqrt(e.n) * 3), color: "#fff", weight: 1.5, fillColor: { sair: "#C2402A", rever: "#E07B24", manter: "#2F8A57", novo: "#3A68B8" }[e.classe], fillOpacity: 0.9 })
        .bindTooltip(`<div class="tip-emp">${esc(e.nome)}</div><h4>${e.n} imóveis · ${END_CLASSE[e.classe].nome}</h4><table><tr><td>Fica p/ Carpediem</td><td>${brl.format(e.receita)}</td></tr><tr><td>Custo da rota</td><td>${brl.format(e.custoRota)}</td></tr><tr><td>Estrutura</td><td>${brl.format(e.estrutura)}</td></tr><tr><td>Resultado</td><td>${brl.format(e.resultado)} (${pct(e.margem)})</td></tr><tr><td>Imóveis no lucro</td><td>${e.positivos.length} de ${e.n}</td></tr></table>`, { className: "tip", direction: "top", sticky: true })
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
    return { R, n: us.length, rec, dir: R.d.total, est, luc, mg: rec > 0 ? luc / rec : -Infinity, rem: us.filter((u) => u.classe === "remover").length, ab: us.filter((u) => u.classe === "abaixo").length };
  }).sort((a, b) => a.mg - b.mg);
  $("#rtbl").innerHTML = `<thead><tr><th>Rota</th><th class="r">Imóveis</th><th class="r">Fica p/ Carpediem</th><th class="r">Custo direto (DRE)</th><th class="r">Custo por visita</th><th class="r">Estrutura rateada</th><th class="r">Lucro/mês</th><th class="r">Margem</th><th class="r">Remover</th><th class="r">Abaixo da meta</th></tr></thead><tbody>` +
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
  const g = P.dre.grupos;
  $("#tab-metodo").innerHTML = `
  <h2>A conta de cada imóvel</h2>
  <p><b>Lucro = o que fica para a Carpediem − custo direto da rota − estrutura da empresa.</b> Tudo em média por mês de jan a ago/2026, os meses fechados da DRE. Imóvel cadastrado no meio do período usa só os meses em que estava ativo.</p>
  <ul>
    <li><b>Fica para a Carpediem:</b> taxa de administração (% de comissão da Mastertable × diárias) + taxa de limpeza recolhida, das reservas da Stays.</li>
    <li><b>Custo direto da rota:</b> o bloco "Operações externas" da DRE de cada rota (pessoal da operação, ponto de apoio, transporte e custo com imóveis), ${brl.format(g.ext)}/mês no total. Pessoal e ponto de apoio são divididos pelas visitas de cada imóvel (limpezas + chamados). O transporte é dividido ${100 - params.pkm}% pelas visitas e ${params.pkm}% pelos km a mais que cada endereço exige da rota. O custo com imóveis é dividido pelos chamados.</li>
    <li><b>Estrutura:</b> todo o resto dos dispêndios (operações internas ${brl.format(g.int)}, administrativo ${brl.format(g.adm)}, comercial/marketing ${brl.format(g.com)}, financeiro ${brl.format(g.fin)} e pessoas ${brl.format(g.pes)}), ${brl.format(P.dre.estrutura)}/mês. ${params.rateio === "igual" ? "Dividida igualmente entre os imóveis: cada imóvel consome atendimento, sistemas, financeiro e suporte, fature pouco ou muito." : "Dividida proporcionalmente ao que cada imóvel deixa para a Carpediem."}</li>
  </ul>
  <h2>Decisão do imóvel</h2>
  <ol>
    <li><b>Remover:</b> lucro negativo depois de pagar a parte dele na rota e na estrutura.</li>
    <li><b>Abaixo da meta:</b> lucra, mas com margem abaixo de ${params.meta}%. A ideia não é ter imóveis que só se pagam: esses recursos renderiam mais num imóvel ou empreendimento novo com margem maior.</li>
    <li><b>Atenção:</b> está na meta, mas tem chamados entre os 10% mais altos da base.</li>
    <li><b>Manter:</b> margem na meta ou acima.</li>
    <li><b>Maturando:</b> menos de 6 meses de cadastro na Stays. Não é apontado para sair; o detalhe mostra o que a regra diria se ele já estivesse maduro.</li>
  </ol>
  <h2>Decisão do endereço</h2>
  <p>Somamos todos os imóveis do mesmo empreendimento ou endereço. <b>Sair do endereço:</b> o endereço inteiro dá prejuízo. <b>Rever endereço:</b> lucra, mas abaixo da meta. <b>Manter endereço:</b> na meta. Um endereço pode ter imóveis bons e mesmo assim não compensar no todo; e um imóvel fraco num endereço forte pode ficar se o endereço como um todo compensa.</p>
  <p>Tirar um imóvel sozinho de um endereço que continua na rota não economiza o km até lá. O detalhe de cada imóvel mostra quanto de custo realmente some se só ele sair.</p>
  <h2>Troca de rota</h2>
  <p>Marcamos quem tem uma parada de outra rota a menos da metade da distância da parada mais próxima da própria rota, e comparamos o custo por visita das duas rotas (custo direto da DRE ÷ visitas da rota).</p>
  <h2>Km a mais por endereço</h2>
  <p>Simulamos 400 dias de cada rota: cada endereço entra no dia com a chance real de ter visita, a equipe sai do endereço com mais visitas e fazemos a rota mais curta do dia por ruas reais (vizinho mais próximo, 2-opt e Or-opt). O km a mais de um endereço é quanto aquela rota encurtaria sem ele, na média dos dias em que ele aparece.</p>
  <h2>Fontes</h2>
  <ul>
    <li>DRE por rota (jan–ago/2026, dispêndios ${brl.format(P.dre.total)}/mês). Set–dez são projeção e ficam de fora.</li>
    <li>Imóveis e rotas: Mastertable do Jestor (status Ativo). Proprietário, Terceirizada e imóveis sem rota não têm custo de rota, só estrutura; estão listados na aba Sem rota.</li>
    <li>Reservas da Stays sem canceladas e sem uso do proprietário. Em prédios (grupos-clone) a receita do grupo é dividida igualmente entre as unidades. Anúncios duplicados (individual + prédio) viram um imóvel só.</li>
    <li>Chamados: manutenções do Jestor de out/2025 a set/2026, por mês.</li>
  </ul>
  <p class="small muted">Snapshot gerado em ${fmtData(P.gerado)}.</p>`;
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
  $("#btnParams").addEventListener("click", () => ($("#paramsPanel").hidden = !$("#paramsPanel").hidden));
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
  $("#rRota").addEventListener("change", () => { drawRouteStops(); $("#rOut").innerHTML = ""; });
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
