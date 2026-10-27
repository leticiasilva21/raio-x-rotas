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
const pct = (x) => Math.round(x * 100) + "%";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MES_NOME = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

const CLASSE = {
  remover: { nome: "Remover", cor: "#C2402A", ordem: 0 },
  renegociar: { nome: "Renegociar", cor: "#E07B24", ordem: 1 },
  atencao: { nome: "Atenção", cor: "#C9A206", ordem: 2 },
  maturando: { nome: "Maturando", cor: "#3A68B8", ordem: 3 },
  manter: { nome: "Manter", cor: "#2F8A57", ordem: 4 },
};

let P = null;          // payload
let U = [];            // unidades
let OP = [];           // unidades operacionais (com rota, coordenada e anúncio)
let END = new Map();   // endereço (parada) -> resumo
const params = { cons: 10, hora: 25, tr: 1.3, par: 10, ch: 0, lim: 100, lav: false, fuel: {} };

/* ---------------- parâmetros ---------------- */
function loadParams() {
  params.fuel = { ...P.combustivel };
  try { const s = JSON.parse(localStorage.getItem("raiox-params-v4") || "{}"); Object.assign(params, s, { fuel: { ...P.combustivel, ...(s.fuel || {}) } }); } catch (e) {}
  const save = () => { try { localStorage.setItem("raiox-params-v4", JSON.stringify(params)); } catch (e) {} };
  const map = { pCons: "cons", pHora: "hora", pTr: "tr", pPar: "par", pCh: "ch", pLim: "lim" };
  for (const [id, k] of Object.entries(map)) {
    const el = document.getElementById(id);
    el.value = params[k];
    el.addEventListener("input", () => { params[k] = parseFloat(el.value) || 0; save(); recompute(); });
  }
  const lav = $("#pLav"); lav.checked = params.lav;
  lav.addEventListener("change", () => { params.lav = lav.checked; save(); recompute(); });
  const ufs = Object.keys(P.combustivel);
  $("#fuelInputs").innerHTML = ufs.map((uf) => `<label for="fuel_${uf}">${uf === "_BR" ? "Outros" : uf}<input id="fuel_${uf}" type="number" step="0.01" min="0" value="${params.fuel[uf]}"></label>`).join("");
  ufs.forEach((uf) => $("#fuel_" + uf).addEventListener("input", (e) => { params.fuel[uf] = parseFloat(e.target.value) || 0; save(); recompute(); }));
}
const precoGas = (uf) => params.fuel[uf] ?? params.fuel._BR;
const custoKm = (uf) => precoGas(uf) / Math.max(1, params.cons);
// dias com ao menos uma visita no mês: visitas no mesmo dia viram uma viagem só
const viagens = (visitas) => 30 * (1 - Math.exp(-visitas / 30));

/* ---------------- cálculo ---------------- */
function recompute() {
  for (const u of U) {
    u.op = !NAO_OPERACIONAIS.has(u.rota) && u.lat != null && u.parada != null && !u.sem_stays;
    u.receitaCD = u.adm_mes + u.limp_mes;
    u.custoLimpUn = (u.custo_limp || 0) + (params.lav ? u.custo_lav || 0 : 0);
    u.custoLimp = u.custoLimpUn * u.res_mes;
    u.custoCh = (u.ch_liq_mes || 0) + u.ch_mes * params.ch;
    u.margemDireta = u.receitaCD - u.custoLimp - u.custoCh;
    u.visitas = u.res_mes + u.ch_mes;
  }
  OP = U.filter((u) => u.op);
  const chP90 = [...OP.map((u) => u.ch_mes)].sort((a, b) => a - b)[Math.floor(OP.length * 0.9)] || 99;
  // endereços
  END = new Map();
  for (const u of OP) {
    if (!END.has(u.parada)) END.set(u.parada, { id: u.parada, us: [], rota: u.rota, uf: u.uf, km: u.desvio_km || 0, min: u.desvio_min || 0, base: !!u.base });
    END.get(u.parada).us.push(u);
  }
  for (const e of END.values()) {
    e.n = e.us.length;
    e.visitas = sum(e.us, (u) => u.visitas);
    e.viagens = viagens(e.visitas);
    e.custoViagemKm = e.km * custoKm(e.uf);
    e.minViagem = e.base ? 0 : e.min * params.tr + params.par;
    e.custoViagemTempo = (e.minViagem / 60) * params.hora;
    e.custoViagem = e.custoViagemKm + e.custoViagemTempo;
    e.custoIda = e.viagens * e.custoViagem;
    e.margem = sum(e.us, (u) => u.margemDireta);
    e.resultado = e.margem - e.custoIda;
    e.bruta = sum(e.us, (u) => u.bruta_mes);
    e.cd = sum(e.us, (u) => u.receitaCD);
    e.top = e.us.reduce((a, u) => (u.margemDireta > a.margemDireta ? u : a), e.us[0]);
    e.semTop = e.n > 1 ? sum(e.us.filter((u) => u !== e.top), (u) => u.margemDireta) - viagens(e.visitas - e.top.visitas) * e.custoViagem : null;
    e.temNovo = e.us.some((u) => u.novo);
    e.nome = stopName(e.us);
    // custo/hora da equipe a partir do qual o endereço deixa de pagar a ida
    e.horaVirada = e.margem <= 0 ? 0 : (e.base || e.minViagem <= 0 || e.viagens <= 0) ? null : Math.max(0, (e.margem / e.viagens - e.custoViagemKm) * 60 / e.minViagem);
  }
  for (const u of OP) classify(u, END.get(u.parada), chP90);
  renderAll();
}

function classify(u, e, chP90) {
  const m = [];   // motivos: [tipo, texto]
  u.rateio = e.visitas ? e.custoIda * (u.visitas / e.visitas) : 0;
  u.custoSozinho = viagens(u.visitas) * e.custoViagem;
  u.sozinhoPaga = u.margemDireta - u.custoSozinho >= 0;
  const outros = e.n - 1;
  const endTxt = e.n > 1 ? `O endereço (${e.n} imóveis)` : "O imóvel";
  let classe = "manter";
  if (e.resultado < 0) {
    if (e.temNovo && !u.novo) {
      classe = "atencao";
      m.push(["atencao", `${endTxt} não se paga hoje (${brl.format(e.resultado)}/mês), mas tem unidade em maturação. Reavaliar quando ela completar 6 meses.`]);
    } else {
      classe = "remover";
      m.push(["remover", `${endTxt} custa mais do que rende: deixa ${brl.format(e.margem)}/mês depois de limpeza e chamados, e a ida até lá custa ${brl.format(e.custoIda)}/mês.`]);
    }
  } else if (u.margemDireta < 0) {
    classe = "renegociar";
    m.push(["renegociar", `Dá prejuízo mesmo sem contar o deslocamento: entram ${brl.format(u.receitaCD)}/mês e saem ${brl.format(u.custoLimp + u.custoCh)} de limpeza${u.custoCh ? " e chamados" : ""}.`]);
    if (u.custoLimpUn > 0 && u.res_mes > 0 && u.limp_mes / u.res_mes < u.custoLimpUn)
      m.push(["info", `Cada limpeza custa ${brl.format(u.custoLimpUn)} e a taxa recolhida é ${brl.format(u.limp_mes / u.res_mes)} por estadia${u.recolhe ? "" : " (taxa repassada ao dono)"}.`]);
    if (outros > 0) m.push(["info", `Tirar só esta unidade não muda a rota: as outras ${outros} continuam no endereço. A economia é o prejuízo dela (${brl.format(-u.margemDireta)}/mês).`]);
  } else if (e.resultado < params.lim) {
    classe = "atencao";
    m.push(["atencao", `${endTxt} mal se paga: sobra ${brl.format(e.resultado)}/mês depois da ida, que custa ${brl.format(e.custoIda)}/mês.`]);
  }
  if (u.ch_mes >= chP90 && u.ch_mes > 0) {
    if (classe === "manter") classe = "atencao";
    m.push(["atencao", `Muitos chamados: ${n1.format(u.ch_mes)} por mês, entre os 10% mais altos da base.`]);
  }
  if (classe === "manter") {
    if (e.n > 1 && !u.sozinhoPaga) m.push(["manter", `Sozinho não pagaria a ida (${brl.format(u.custoSozinho)}/mês), mas o endereço já é visitado por causa dos outros ${outros} imóveis. Fica.`]);
    else m.push(["manter", `Paga a própria conta: sobra ${brl.format(u.margemDireta - u.rateio)}/mês depois de limpeza, chamados e da sua parte na ida.`]);
  }
  if (e.n > 1 && e.semTop != null && e.semTop < 0 && e.resultado >= 0 && u !== e.top)
    m.push(["info", `O endereço só se paga por causa de ${e.top.publico || e.top.nome} (${brl.format(e.top.margemDireta)}/mês).`]);
  if (e.n > 1 && e.top === u && e.semTop != null && e.semTop < 0 && e.resultado >= 0)
    m.push(["info", `É ela que sustenta o endereço: sem ela, as outras ${outros} não pagariam a ida.`]);
  if (u.outra_rota && u.viz_km > 1 && u.outra_km < u.viz_km * 0.5)
    m.push(["info", `Fica a ${n1.format(u.outra_km)} km de uma parada da ${u.outra_rota} e a ${n1.format(u.viz_km)} km da parada mais próxima da própria rota. Vale avaliar a troca.`]);
  if (u.novo) {
    const regra = classe;
    classe = "maturando";
    m.unshift(["maturando", `Cadastrado na Stays em ${fmtData(u.criado)}, ainda em maturação (menos de 6 meses).${regra === "remover" ? " A localização prejudica a operação: o endereço hoje não paga a ida." : ""}`]);
    u.regraSeMaduro = regra;
  }
  u.classe = classe;
  u.motivos = m;
  u.motivoCurto = (m.find((x) => x[0] === classe) || m[0] || ["", ""])[1];
  u.locRuim = u.novo && u.regraSeMaduro === "remover";
  u.endResultado = e.resultado;
  u.endCusto = e.custoIda;
}

/* ---------------- helpers visuais ---------------- */
const pill = (c) => `<span class="pill ${c}">${CLASSE[c].nome}</span>`;
const fmtData = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) : "—");
const rotasOp = () => [...new Set(OP.map((u) => u.rota))].sort((a, b) => a.localeCompare(b, "pt-BR"));
function fillRotaSelect(sel, todas) {
  const cur = sel.value;
  sel.innerHTML = (todas ? `<option value="">${todas}</option>` : "") + rotasOp().map((r) => `<option>${esc(r)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}
function stopName(us) {
  if (!us.length) return "—";
  if (us.length > 1 && us[0].empreend) return `${us[0].empreend.replace(/^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,3}[.-]/, "").replace(/\/.*$/, "")} (${us.length} imóveis)`;
  return us[0].publico || us[0].nome;
}

/* ---------------- aba Decisão ---------------- */
let sortKey = "classe", sortAsc = true;
const COLS = [
  ["nome", "Imóvel"], ["rota", "Rota"], ["classe", "Decisão"], ["motivoCurto", "Motivo"],
  ["bruta_mes", "Bruta/mês", "r"], ["receitaCD", "Fica p/ Carpediem", "r"], ["margemDireta", "Sobra após limpeza e chamados", "r"],
  ["rateio", "Parte na ida ao endereço", "r"], ["endResultado", "Resultado do endereço", "r"], ["ch_mes", "Chamados/mês", "r"], ["na_parada", "No endereço", "r"],
];
function renderKpis() {
  const by = (c) => OP.filter((u) => u.classe === c);
  const rem = by("remover"), ren = by("renegociar"), at = by("atencao"), mat = by("maturando");
  const endRem = [...new Set(rem.map((u) => u.parada))].map((id) => END.get(id));
  const ends = [...END.values()];
  const custoTotal = sum(ends, (e) => e.custoIda);
  $("#kpis").innerHTML = `
    <div class="kpi"><span class="k">Imóveis analisados</span><span class="v">${OP.length}</span><span class="s">em ${END.size} endereços · ${U.length - OP.length} de fora (sem rota operacional, sem coordenada ou sem anúncio na Stays)</span></div>
    <div class="kpi bad"><span class="k">Remover</span><span class="v">${rem.length}</span><span class="s">${endRem.length ? `${endRem.length} endereços que não pagam a ida. Tirar economiza ${brl.format(-sum(endRem, (e) => e.resultado))}/mês` : "Nenhum endereço deixa de pagar a própria ida com os parâmetros atuais"}</span></div>
    <div class="kpi bad"><span class="k">Renegociar</span><span class="v">${ren.length}</span><span class="s">${ren.length ? `Prejuízo direto somado: ${brl.format(-sum(ren, (u) => u.margemDireta))}/mês` : "Nenhum imóvel dá prejuízo depois de limpeza e chamados"}</span></div>
    <div class="kpi warn"><span class="k">Atenção</span><span class="v">${at.length}</span><span class="s">Endereço mal se paga ou chamados acima do normal</span></div>
    <div class="kpi new"><span class="k">Maturando</span><span class="v">${mat.length}</span><span class="s">${mat.filter((u) => u.locRuim).length} em endereço que hoje não paga a ida</span></div>
    <div class="kpi"><span class="k">Custo de deslocamento</span><span class="v">${brl.format(custoTotal)}</span><span class="s">por mês, em todos os endereços: ${pct(custoTotal / (sum(OP, (u) => u.receitaCD) || 1))} do que fica para a Carpediem</span></div>`;
}
function renderTable() {
  const rota = $("#fRota").value, classe = $("#fClasse").value, q = $("#fBusca").value.trim().toLowerCase(), outra = $("#fOutra").checked;
  let rows = OP.filter((u) => (!rota || u.rota === rota) && (!classe || u.classe === classe) && (!outra || u.motivos.some((m) => m[1].includes("Vale avaliar a troca")))
    && (!q || [u.nome, u.publico, u.empreend, u.bairro, u.endereco].some((s) => (s || "").toLowerCase().includes(q))));
  rows.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "classe") { const d = CLASSE[x].ordem - CLASSE[y].ordem; return (sortAsc ? 1 : -1) * (d || a.endResultado - b.endResultado); }
    if (typeof x === "string" || typeof y === "string") return (sortAsc ? 1 : -1) * String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
    return (sortAsc ? 1 : -1) * ((x ?? -1e12) - (y ?? -1e12));
  });
  $("#fCount").textContent = `${rows.length} imóveis`;
  const head = "<thead><tr>" + COLS.map(([k, t, c]) => `<th data-k="${k}" class="${c || ""} ${k === sortKey ? "sorted" + (sortAsc ? " asc" : "") : ""}">${t}</th>`).join("") + "</tr></thead>";
  const body = rows.slice(0, 700).map((u) => `<tr data-id="${u.id}">
    <td class="nome"><b>${esc(u.publico || u.nome)}</b><span>${esc(u.nome)}</span></td>
    <td>${esc(u.rota)}</td><td>${pill(u.classe)}</td><td class="motivo">${esc(u.motivoCurto)}</td>
    <td class="r">${brl.format(u.bruta_mes)}</td><td class="r">${brl.format(u.receitaCD)}</td>
    <td class="r ${u.margemDireta < 0 ? "neg" : ""}">${brl.format(u.margemDireta)}</td><td class="r">${brl.format(u.rateio)}</td>
    <td class="r ${u.endResultado < 0 ? "neg" : ""}">${brl.format(u.endResultado)}</td><td class="r">${n2.format(u.ch_mes)}</td><td class="r">${u.na_parada}</td></tr>`).join("");
  $("#tbl").innerHTML = head + "<tbody>" + body + "</tbody>";
}

/* ---------------- gaveta de detalhe ---------------- */
function openUnit(id) {
  const u = U.find((x) => String(x.id) === String(id));
  if (!u) return;
  const e = END.get(u.parada);
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
  const why = u.op ? `<div class="why ${u.classe}"><b>Por que ${CLASSE[u.classe].nome.toLowerCase()}</b><ul>${u.motivos.map((m) => `<li>${esc(m[1])}</li>`).join("")}</ul></div>` : '<p class="muted">Fora das rotas operacionais: não entra na decisão.</p>';
  const ida = e ? `
    <h3>A ida ao endereço${e.n > 1 ? ` (dividida entre ${e.n} imóveis)` : ""}</h3>
    <table class="calc">
      ${e.base ? `<tr><td colspan="2">É a base da ${esc(u.rota)} (endereço com mais visitas, de onde a equipe sai): não tem custo de ida.</td></tr>` : ""}
      <tr><td>Km a mais por viagem<span class="sub">média dos dias simulados em que este endereço entra na rota do dia (saindo da base: ${esc(P.rotas[u.rota]?.base || "—")})</span></td><td>${n2.format(e.km)} km</td></tr>
      <tr><td>Combustível por viagem<span class="sub">${n2.format(e.km)} km ÷ ${n1.format(params.cons)} km/l × ${brl2.format(precoGas(e.uf))}/l (gasolina ${esc(e.uf in params.fuel ? e.uf : "média Brasil")})</span></td><td>${brl2.format(e.custoViagemKm)}</td></tr>
      <tr><td>Tempo a mais por viagem<span class="sub">${e.base ? "base da rota" : `${n1.format(e.min)} min de rua × ${n1.format(params.tr)} de trânsito + ${params.par} min parado = ${n1.format(e.minViagem)} min`} × ${brl.format(params.hora)}/h da equipe</span></td><td>${brl2.format(e.custoViagemTempo)}</td></tr>
      <tr><td>Viagens por mês<span class="sub">${n1.format(e.visitas)} visitas (limpezas + chamados); no mesmo dia contam uma só</span></td><td>${n1.format(e.viagens)}</td></tr>
      <tr class="tot"><td>Custo da ida ao endereço por mês</td><td>${brl.format(e.custoIda)}</td></tr>
    </table>
    ${e.horaVirada != null && e.horaVirada > 0 ? `<p class="small muted">Ponto de virada: o endereço só deixaria de pagar a ida se a hora da equipe passasse de <b>${brl.format(e.horaVirada)}</b> (hoje ${brl.format(params.hora)}).</p>` : ""}` : "";
  $("#drawerBody").innerHTML = `
    <h2>${esc(u.publico || u.nome)}</h2>
    <p class="muted small">${esc(u.nomes.join(" · "))}${u.dup ? " · anúncios duplicados unificados" : ""}</p>
    <p>${u.op ? pill(u.classe) : ""}</p>
    ${why}
    <h3>A conta do imóvel (média por mês, ${u.meses} meses)</h3>
    <table class="calc">
      <tr><td>Receita bruta<span class="sub">total pago pelos hóspedes</span></td><td>${brl.format(u.bruta_mes)}</td></tr>
      <tr><td>Taxa de administração<span class="sub">${pct(u.taxa)} das diárias</span></td><td>${brl.format(u.adm_mes)}</td></tr>
      <tr><td>Taxa de limpeza ${u.recolhe ? "recolhida" : "(repassada ao dono)"}</td><td>${brl.format(u.limp_mes)}</td></tr>
      <tr><td>Custo de limpeza<span class="sub">${n2.format(u.res_mes)} limpezas × ${brl.format(u.custoLimpUn)} (limpeza ${brl.format(u.custo_limp)}${params.lav ? ` + lavanderia ${brl.format(u.custo_lav)}` : ""})</span></td><td>−${brl.format(u.custoLimp)}</td></tr>
      <tr><td>Chamados<span class="sub">${n2.format(u.ch_mes)}/mês · o que não foi cobrado do proprietário${params.ch ? ` + ${brl.format(params.ch)} por chamado` : ""}</span></td><td>−${brl.format(u.custoCh)}</td></tr>
      <tr class="tot"><td>Sobra após limpeza e chamados</td><td class="${u.margemDireta < 0 ? "neg" : ""}">${brl.format(u.margemDireta)}</td></tr>
      ${e ? `<tr><td>Parte dele na ida ao endereço<span class="sub">proporcional às visitas</span></td><td>−${brl.format(u.rateio)}</td></tr>
      <tr class="tot"><td>Resultado do imóvel</td><td class="${u.margemDireta - u.rateio < 0 ? "neg" : ""}">${brl.format(u.margemDireta - u.rateio)}</td></tr>
      ${e.n > 1 ? `<tr class="tot"><td>Resultado do endereço inteiro (${e.n} imóveis)</td><td class="${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)}</td></tr>` : ""}` : ""}
    </table>
    ${ida}
    <h3>Receita mês a mês</h3>
    <svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita mensal">${bars}</svg>
    <p class="small muted"><span style="color:#8fb3ae">■</span> bruta &nbsp; <span style="color:#0E6B6B">■</span> fica para a Carpediem</p>
    <h3>Chamados de manutenção (12 meses): ${u.ch}</h3>
    ${tipos.length ? `<div class="dgrid">${tipos.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div>
      <p class="small muted">${Object.entries(u.ch_nat || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}<br>Origem: ${Object.entries(u.ch_origem || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}<br>
      Lançado no Jestor: custo ${brl.format(u.ch_custo || 0)} · cobrado do proprietário ${brl.format(u.ch_cobrado || 0)}</p>` : '<p class="muted small">Nenhum chamado no período.</p>'}
    <h3>Cadastro e localização</h3>
    <p class="small muted">${esc(u.rota || "—")} · líder ${esc(u.lider || "—")} · ${esc(u.endereco || "")}<br>Cadastro na Stays em ${fmtData(u.criado)} · Stays ${esc(u.stays.join(", "))}</p>`;
  $("#drawer").hidden = false;
}

/* ---------------- mapa base ---------------- */
function baseMap(el) {
  const m = L.map(el, { zoomControl: true, preferCanvas: true }).setView([-8.06, -34.9], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap", className: "tiles-soft" }).addTo(m);
  return m;
}
function tipHtml(u) {
  return `<h4>${esc(u.publico || u.nome)}</h4>${pill(u.classe)}
  <p style="max-width:260px;white-space:normal;margin:6px 0">${esc(u.motivoCurto)}</p>
  <table><tr><td>Bruta/mês</td><td>${brl.format(u.bruta_mes)}</td></tr>
  <tr><td>Sobra após limpeza e chamados</td><td>${brl.format(u.margemDireta)}</td></tr>
  <tr><td>Resultado do endereço</td><td>${brl.format(u.endResultado)}</td></tr>
  <tr><td>Ida ao endereço/mês</td><td>${brl.format(u.endCusto)}</td></tr>
  <tr><td>No endereço</td><td>${u.na_parada} imóveis</td></tr></table>`;
}
const radius = (u) => 4 + Math.min(12, Math.sqrt(Math.max(0, u.bruta_mes)) / 9);
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
  const rota = $("#mRota").value;
  const us = OP.filter((u) => !rota || u.rota === rota);
  mLayer.clearLayers();
  if (rota && P.rotas[rota]) {
    const ord = P.rotas[rota].ordem;
    L.polyline([...ord, ord[0]], { color: "#17232F", weight: 1.5, opacity: 0.45, dashArray: "4 5" }).addTo(mLayer);
  }
  for (const [u, la, ln] of spread(us)) {
    L.circleMarker([la, ln], { radius: radius(u), color: "#fff", weight: 1.2, fillColor: CLASSE[u.classe].cor, fillOpacity: 0.9 })
      .bindTooltip(tipHtml(u), { className: "tip", direction: "top", sticky: true })
      .on("click", () => openUnit(u.id)).addTo(mLayer);
  }
  if (us.length) mapa.fitBounds(L.latLngBounds(us.map((u) => [u.lat, u.lng])).pad(0.08));
  setTimeout(() => mapa.invalidateSize(), 50);
  $("#mLegend").innerHTML = Object.entries(CLASSE).map(([k, c]) => `<div class="row"><span class="dot" style="background:${c.cor}"></span>${c.nome} <span class="muted">(${us.filter((u) => u.classe === k).length})</span></div>`).join("")
    + '<p class="small muted">Tamanho do círculo = receita bruta por mês. Passe o mouse para ver o motivo, clique para a conta completa.</p>';
  const ends = [...new Set(us.map((u) => u.parada))].map((id) => END.get(id));
  $("#mResumo").innerHTML = `
    <div class="stat"><span>Imóveis / endereços</span><b>${us.length} / ${ends.length}</b></div>
    <div class="stat"><span>Receita bruta/mês</span><b>${brl.format(sum(us, (u) => u.bruta_mes))}</b></div>
    <div class="stat"><span>Fica p/ Carpediem/mês</span><b>${brl.format(sum(us, (u) => u.receitaCD))}</b></div>
    <div class="stat"><span>Custo de deslocamento/mês</span><b>${brl.format(sum(ends, (e) => e.custoIda))}</b></div>
    ${rota && P.rotas[rota] ? `<div class="stat"><span>Base (de onde a equipe sai)</span><b style="font-family:var(--font);text-align:right">${esc(String(P.rotas[rota].base).replace(/^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,3}[.-]/, "").replace(/\/.*$/, ""))}</b></div><div class="stat"><span>Circuito por todos os endereços</span><b>${n1.format(P.rotas[rota].km)} km · ${P.rotas[rota].min} min</b></div>` : ""}`;
  if (rota && P.rotas[rota]) {
    const R = P.rotas[rota];
    const endRem = ends.filter((e) => e.us.every((u) => u.classe === "remover"));
    const remIdx = new Set(endRem.map((e) => +e.id.split("#").pop()));
    const keep = R.pts.map((_, i) => i).filter((i) => !remIdx.has(i));
    let novoKm = R.km;
    if (R.D && keep.length > 1 && remIdx.size) { const D = keep.map((i) => keep.map((j) => R.D[i][j])); novoKm = pathLen(solveTsp(D, 0, true), D, true); }
    $("#mSim").innerHTML = endRem.length ? `<div class="callout bad"><b>Sem os ${endRem.length} endereços marcados "Remover"</b><br>
      O circuito cai de ${n1.format(R.km)} km para <b>${n1.format(novoKm)} km</b>. A Carpediem deixa de receber ${brl.format(sum(endRem, (e) => e.cd))}/mês e economiza ${brl.format(sum(endRem, (e) => e.custoIda))}/mês de deslocamento: o resultado melhora ${brl.format(-sum(endRem, (e) => e.resultado))}/mês.</div>`
      : '<div class="callout">Nenhum endereço desta rota deixa de pagar a própria ida com os parâmetros atuais.</div>';
  } else $("#mSim").innerHTML = '<p class="small muted">Escolha uma rota para ver o circuito e simular a saída dos endereços marcados.</p>';
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
  }).filter((s) => s.us.length && (!$("#rSemRem").checked || !s.us.every((u) => u.classe === "remover")));
}
function drawRouteStops() {
  rLayer.clearLayers();
  const st = routeStops();
  for (const s of st) {
    const worst = s.us.reduce((a, u) => (CLASSE[u.classe].ordem < CLASSE[a.classe].ordem ? u : a), s.us[0]);
    const e = END.get(s.us[0].parada);
    L.circleMarker([s.lat, s.lng], { radius: 5 + Math.min(10, s.us.length), color: "#fff", weight: 1.2, fillColor: CLASSE[worst.classe].cor, fillOpacity: 0.9 })
      .bindTooltip(`<h4>${esc(s.nome)}</h4>${s.us.length} imóveis · ${CLASSE[worst.classe].nome}<br>Resultado do endereço ${brl.format(e.resultado)}/mês`, { className: "tip", sticky: true }).addTo(rLayer);
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

/* ---------------- aba Prédios ---------------- */
function renderPredios() {
  if ($("#tab-predios").hidden) return;
  fillRotaSelect($("#pRota"), "Todas as rotas");
  const rota = $("#pRota").value, min = +$("#pMin").value;
  const rows = [...END.values()].filter((e) => (!rota || e.rota === rota) && e.n >= min).sort((a, b) => (b.bruta > 0) - (a.bruta > 0) || a.resultado - b.resultado);
  const cnt = (e, c) => e.us.filter((u) => u.classe === c).length;
  $("#ptbl").innerHTML = `<thead><tr><th>Endereço / prédio</th><th>Rota</th><th class="r">Imóveis</th><th class="r">Bruta/mês</th><th class="r">Sobra após limpeza e chamados</th><th class="r">Ida ao endereço/mês</th><th class="r">Resultado do endereço</th><th class="r">Deixa de se pagar se a hora da equipe passar de</th><th>Quem sustenta</th><th class="r">Renegociar</th><th class="r">Remover</th></tr></thead><tbody>` +
    rows.map((e, i) => `<tr data-p="${i}"><td class="nome"><b>${esc(e.nome)}</b><span>${esc(e.us[0].endereco || "")}</span></td><td>${esc(e.rota)}</td><td class="r">${e.n}</td>
      <td class="r">${brl.format(e.bruta)}</td><td class="r ${e.margem < 0 ? "neg" : ""}">${brl.format(e.margem)}</td><td class="r">${brl.format(e.custoIda)}</td>
      <td class="r ${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)}</td>
      <td class="r">${e.horaVirada == null ? (e.base ? "base da rota" : "—") : e.horaVirada === 0 ? '<span class="neg">já não se paga</span>' : brl.format(e.horaVirada) + "/h"}</td>
      <td class="motivo">${e.n > 1 && e.semTop != null && e.semTop < 0 && e.resultado >= 0 ? `Só ${esc(e.top.publico || e.top.nome)}` : e.n > 1 ? "Vários imóveis" : "—"}</td>
      <td class="r">${cnt(e, "renegociar") || 0}</td><td class="r">${cnt(e, "remover") ? `<span class="neg">${cnt(e, "remover")}</span>` : 0}</td></tr>`).join("") + "</tbody>";
  $$("#ptbl tbody tr").forEach((tr) => tr.addEventListener("click", () => openStop(rows[+tr.dataset.p])));
}
function openStop(e) {
  $("#drawerBody").innerHTML = `<h2>${esc(e.nome)}</h2><p class="muted small">${esc(e.us[0].endereco || "")} · ${esc(e.rota)}</p>
    <table class="calc">
      <tr><td>Sobra dos ${e.n} imóveis após limpeza e chamados</td><td>${brl.format(e.margem)}</td></tr>
      <tr><td>Ida ao endereço<span class="sub">${n1.format(e.viagens)} viagens × (${n2.format(e.km)} km a mais · ${n1.format(e.min)} min) = ${brl2.format(e.custoViagem)} por viagem</span></td><td>−${brl.format(e.custoIda)}</td></tr>
      <tr class="tot"><td>Resultado do endereço</td><td class="${e.resultado < 0 ? "neg" : ""}">${brl.format(e.resultado)}</td></tr>
      ${e.n > 1 ? `<tr><td>Sem ${esc(e.top.publico || e.top.nome)} (o que mais sobra)</td><td class="${e.semTop < 0 ? "neg" : ""}">${brl.format(e.semTop)}</td></tr>` : ""}
    </table>
    <h3>Imóveis</h3><div class="table-wrap"><table class="tbl"><tbody>${[...e.us].sort((a, b) => a.margemDireta - b.margemDireta).map((u) => `<tr data-id="${u.id}"><td class="nome"><b>${esc(u.publico || u.nome)}</b></td><td>${pill(u.classe)}</td><td class="r">${brl.format(u.bruta_mes)}</td><td class="r ${u.margemDireta < 0 ? "neg" : ""}">${brl.format(u.margemDireta)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("#drawerBody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
  $("#drawer").hidden = false;
}

/* ---------------- aba Como calculamos ---------------- */
function renderMetodo() {
  const meses = P.meses;
  const fuel = Object.entries(params.fuel).map(([k, v]) => `${k === "_BR" ? "demais estados" : k} ${brl2.format(v)}`).join(" · ");
  $("#tab-metodo").innerHTML = `
  <h2>A decisão é pelo endereço</h2>
  <p>A equipe vai a um endereço, não a um apartamento. Por isso o custo de deslocamento é do endereço inteiro e só desaparece se todos os imóveis dali saírem. Tirar um studio de um prédio que continua na rota não economiza nenhum km.</p>
  <p>Para cada endereço somamos o que todos os imóveis deixam para a Carpediem depois de limpeza e chamados, e tiramos o custo de ir até lá. Se um imóvel fatura bem, ele ajuda a pagar a ida dos outros do mesmo endereço.</p>
  <h2>As regras, nesta ordem</h2>
  <ol>
    <li><b>Remover:</b> o resultado do endereço é negativo, ou seja, tudo o que os imóveis dali deixam não cobre a ida. Todos os imóveis do endereço recebem a mesma decisão. Se houver ali um imóvel em maturação, os demais ficam em Atenção até ele completar 6 meses.</li>
    <li><b>Renegociar:</b> o endereço se paga, mas este imóvel dá prejuízo mesmo sem contar deslocamento (limpeza e chamados custam mais do que ele deixa). Tirar só ele economiza o prejuízo dele, não a rota.</li>
    <li><b>Atenção:</b> o endereço sobra menos de ${brl.format(params.lim)}/mês depois da ida, ou o imóvel tem chamados entre os 10% mais altos da base.</li>
    <li><b>Manter:</b> todo o resto. O detalhe diz se ele paga a própria ida ou se fica porque o endereço já é visitado.</li>
    <li><b>Maturando:</b> menos de 6 meses de cadastro na Stays. Nunca é apontado para sair, mas avisamos quando a localização prejudica (o endereço não pagaria a ida).</li>
  </ol>
  <h2>O que fica para a Carpediem</h2>
  <ul>
    <li><b>Taxa de administração</b> = % de comissão da Mastertable × valor das diárias.</li>
    <li><b>Taxa de limpeza</b> conta como receita quando o formato é "Recolhe".</li>
    <li><b>Custo de limpeza</b> = número de reservas × custo de limpeza da Mastertable. A lavanderia fica fora por padrão, porque o custo varia por rota; dá para incluir em Parâmetros.</li>
    <li><b>Chamados:</b> só a parte do custo lançado no Jestor (material + mão de obra + terceirizada) que não foi cobrada do proprietário. Hoje 83% dos chamados com valor têm custo líquido zero para a Carpediem.</li>
  </ul>
  <h2>O custo de ir até o endereço</h2>
  <ul>
    <li><b>Km e minutos a mais:</b> a equipe não passa todo dia em todos os endereços, só nos que têm limpeza ou chamado. Por isso simulamos 400 dias de cada rota. Em cada dia, cada endereço entra com a chance real de ter visita (pelas limpezas e chamados dele). A equipe sai do endereço com mais visitas da rota (a base) e fazemos a rota mais curta do dia, por ruas reais (OpenStreetMap), com vizinho mais próximo, 2-opt e Or-opt. O custo de um endereço é quantos km e minutos aquela rota do dia encurtaria sem ele, na média dos dias em que ele aparece. Endereço no caminho de outros custa quase nada; endereço isolado custa a ida e a volta.</li>
    <li><b>Combustível:</b> km a mais ÷ ${n1.format(params.cons)} km/l × preço da gasolina no estado (ANP, out/2026: ${fuel}).</li>
    <li><b>Tempo:</b> (minutos a mais pelo mapa × ${n1.format(params.tr)} de trânsito + ${params.par} min parado para estacionar e acessar) × ${brl.format(params.hora)}/h da equipe. A base da rota não tem custo de ida.</li>
    <li><b>Viagens por mês:</b> cada limpeza e cada chamado é uma visita. Visitas no mesmo endereço no mesmo dia contam uma viagem só; estimamos os dias com visita a partir do total de visitas do endereço.</li>
  </ul>
  <h2>Fontes</h2>
  <ul>
    <li>Imóveis e rotas: Mastertable do Jestor (status Ativo). "Proprietário" e "Terceirizada" ficam fora.</li>
    <li>Receita: reservas da Stays com check-in de ${MES_NOME[+meses[0].slice(5) - 1]}/${meses[0].slice(0, 4)} a ${MES_NOME[+meses.at(-1).slice(5) - 1]}/${meses.at(-1).slice(0, 4)}, sem canceladas e sem uso do proprietário. Em prédios (grupos-clone) a receita do grupo é dividida igualmente entre as unidades.</li>
    <li>Duplicados: anúncios individual + prédio (planilha de/para) viram um imóvel só.</li>
    <li>Chamados: tabela de manutenções do Jestor no mesmo período. ${P.chamados_sem_vinculo} ficaram de fora por não terem imóvel ativo vinculado.</li>
  </ul>
  <p class="small muted">Snapshot gerado em ${fmtData(P.gerado)}.</p>`;
}

/* ---------------- navegação ---------------- */
function renderAll() {
  fillRotaSelect($("#fRota"), "Todas as rotas");
  renderKpis(); renderTable(); renderMapa(); renderRoteiro(); renderPredios(); renderMetodo();
}
function wire() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === b));
    $$(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + b.dataset.tab));
    try { history.replaceState(null, "", "#" + b.dataset.tab); } catch (e) {}
    renderAll();
  }));
  $("#btnParams").addEventListener("click", () => ($("#paramsPanel").hidden = !$("#paramsPanel").hidden));
  ["#fRota", "#fClasse", "#fOutra"].forEach((s) => $(s).addEventListener("change", renderTable));
  $("#fBusca").addEventListener("input", renderTable);
  $("#tbl").addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (th) { const k = th.dataset.k; if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = ["nome", "rota", "classe", "motivoCurto"].includes(k); } return renderTable(); }
    const tr = e.target.closest("tr[data-id]"); if (tr) openUnit(tr.dataset.id);
  });
  $("#drawerClose").addEventListener("click", () => ($("#drawer").hidden = true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drawer").hidden = true; });
  $("#mRota").addEventListener("change", renderMapa);
  $("#rRota").addEventListener("change", () => { drawRouteStops(); $("#rOut").innerHTML = ""; });
  $("#rSemRem").addEventListener("change", drawRouteStops);
  $("#rBusca").addEventListener("click", geocode);
  $("#rEnd").addEventListener("keydown", (e) => { if (e.key === "Enter") geocode(); });
  $("#rCalc").addEventListener("click", calcRoute);
  $$("#rModo button").forEach((b) => b.addEventListener("click", () => { rModo = b.dataset.v; $$("#rModo button").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#pRota").addEventListener("change", renderPredios);
  $("#pMin").addEventListener("change", renderPredios);
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
