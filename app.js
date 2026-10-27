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
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const n2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pct = (x) => Math.round(x * 100) + "%";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MES_NOME = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CLASSE = {
  remover: { nome: "Remover ou renegociar", cor: "#C2402A" },
  atencao: { nome: "Atenção", cor: "#C98A06" },
  saudavel: { nome: "Saudável", cor: "#2F8A57" },
  maturando: { nome: "Maturando", cor: "#3A68B8" },
};

let P = null;          // payload
let U = [];            // unidades calculadas
let OP = [];           // unidades operacionais (com rota e coordenada)
const params = { km: 1.2, hora: 40, vel: 20, ch: 80, corte: 70, wM: 45, wD: 25, wC: 15, wI: 15 };
const custoKm = () => params.km + params.hora / Math.max(5, params.vel || 20);

/* ---------------- parâmetros ---------------- */
function loadParams() {
  try { Object.assign(params, JSON.parse(localStorage.getItem("raiox-params-v2") || "{}")); } catch (e) {}
  const map = { pKm: "km", pHora: "hora", pVel: "vel", pCh: "ch", pCorte: "corte", wM: "wM", wD: "wD", wC: "wC", wI: "wI" };
  for (const [id, k] of Object.entries(map)) {
    const el = document.getElementById(id);
    el.value = params[k];
    el.addEventListener("input", () => {
      params[k] = parseFloat(el.value) || 0;
      try { localStorage.setItem("raiox-params-v2", JSON.stringify(params)); } catch (e) {}
      showPv(); recompute();
    });
  }
  showPv();
}
function showPv() {
  const t = params.wM + params.wD + params.wC + params.wI || 1;
  $$(".pv").forEach((s) => { s.textContent = Math.round((params[s.dataset.for] / t) * 100) + "%"; });
}

/* ---------------- cálculo ---------------- */
function percentileRanks(vals) {
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(vals.length);
  const n = vals.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
    const p = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5;
    for (let k = i; k <= j; k++) r[idx[k][1]] = p;
    i = j + 1;
  }
  return r;
}

function recompute() {
  for (const u of U) {
    u.op = !NAO_OPERACIONAIS.has(u.rota) && u.lat != null && u.parada != null && !u.sem_stays;
    u.receitaCD = u.adm_mes + u.limp_mes;
    u.custoLimp = (u.custo_limp || 0) * u.res_mes;
    u.visitas = u.res_mes + u.ch_mes;
    u.kmMes = u.op ? u.visitas * (u.desvio_unid || 0) : 0;
    u.custoLog = u.kmMes * custoKm();
    u.custoCh = u.ch_mes * params.ch;
    u.margem = u.receitaCD - u.custoLimp - u.custoLog - u.custoCh;
  }
  OP = U.filter((u) => u.op);
  const ref = OP.filter((u) => !u.novo);
  const rk = (f) => { const r = percentileRanks(ref.map(f)); const m = new Map(); ref.forEach((u, i) => m.set(u, r[i])); return m; };
  const sorted = (f) => ref.map(f).sort((a, b) => a - b);
  const rM = rk((u) => -u.margem), rD = rk((u) => u.desvio_unid), rC = rk((u) => u.ch_mes), rI = rk((u) => u.viz_km);
  const sM = sorted((u) => -u.margem), sD = sorted((u) => u.desvio_unid), sC = sorted((u) => u.ch_mes), sI = sorted((u) => u.viz_km);
  const posIn = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return arr.length > 1 ? lo / (arr.length - 1) : 0.5; };
  const W = params.wM + params.wD + params.wC + params.wI || 1;
  const desvioP90 = sD[Math.floor(sD.length * 0.9)] ?? 0;
  for (const u of OP) {
    const g = (map, arr, v) => (map.has(u) ? map.get(u) : Math.min(1, posIn(arr, v)));
    u.pM = g(rM, sM, -u.margem); u.pD = g(rD, sD, u.desvio_unid); u.pC = g(rC, sC, u.ch_mes); u.pI = g(rI, sI, u.viz_km);
    u.score = Math.round(100 * (params.wM * u.pM + params.wD * u.pD + params.wC * u.pC + params.wI * u.pI) / W);
    u.locRuim = u.desvio_unid >= desvioP90 && u.desvio_unid > 0;
    u.maisPertoOutra = !!u.outra_rota && u.viz_km > 1 && u.outra_km < u.viz_km * 0.5;
    if (u.novo) u.classe = "maturando";
    else if (u.score >= params.corte && u.pM >= 0.6) u.classe = "remover";
    else if (u.score >= params.corte) u.classe = "atencao";
    else if (u.score >= params.corte - 15) u.classe = "atencao";
    else u.classe = "saudavel";
  }
  renderAll();
}

/* ---------------- helpers visuais ---------------- */
function scoreColor(s) {
  // verde -> amarelo -> vermelho
  const stops = [[0, [47, 138, 87]], [50, [229, 193, 42]], [100, [194, 64, 42]]];
  let a = stops[0], b = stops[2];
  if (s <= 50) b = stops[1]; else a = stops[1];
  const t = (s - a[0]) / (b[0] - a[0] || 1);
  const c = a[1].map((x, i) => Math.round(x + (b[1][i] - x) * t));
  return `rgb(${c.join(",")})`;
}
const pill = (c) => `<span class="pill ${c}">${CLASSE[c].nome}</span>`;
function flags(u) {
  const f = [];
  if (u.margem < 0) f.push('<span class="flag b">Margem negativa</span>');
  if (u.maisPertoOutra) f.push(`<span class="flag b">Mais perto da ${esc(u.outra_rota)}</span>`);
  if (u.novo && u.locRuim) f.push('<span class="flag b">Localização prejudica a rota</span>');
  if (u.dist_centro > 40) f.push('<span class="flag b">Longe do centro da rota</span>');
  if (u.na_parada >= 3) f.push(`<span class="flag">Prédio com ${u.na_parada} imóveis</span>`);
  if (u.dup) f.push('<span class="flag">Anúncio duplicado unificado</span>');
  return f.join("");
}
const scorebar = (s) => `<span class="scorebar"><i><b style="width:${s}%;background:${scoreColor(s)}"></b></i><span class="num">${s}</span></span>`;
const rotasOp = () => [...new Set(OP.map((u) => u.rota))].sort((a, b) => a.localeCompare(b, "pt-BR"));
function fillRotaSelect(sel, todas) {
  const cur = sel.value;
  sel.innerHTML = (todas ? `<option value="">${todas}</option>` : "") + rotasOp().map((r) => `<option>${esc(r)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

/* ---------------- aba Decisão ---------------- */
let sortKey = "score", sortAsc = false;
const COLS = [
  ["nome", "Imóvel"], ["rota", "Rota"], ["classe", "Classificação"], ["score", "Índice", "r"],
  ["bruta_mes", "Bruta/mês", "r"], ["receitaCD", "Fica p/ Carpediem", "r"], ["margem", "Margem/mês", "r"],
  ["ch_mes", "Chamados/mês", "r"], ["desvio_unid", "Desvio km/visita", "r"], ["na_parada", "No endereço", "r"], ["criado", "Cadastro Stays", "r"],
];
function renderKpis() {
  const rem = OP.filter((u) => u.classe === "remover");
  const at = OP.filter((u) => u.classe === "atencao");
  const mat = OP.filter((u) => u.classe === "maturando");
  const matRuim = mat.filter((u) => u.locRuim);
  const outra = OP.filter((u) => u.maisPertoOutra);
  const sum = (a, f) => a.reduce((s, u) => s + f(u), 0);
  $("#kpis").innerHTML = `
    <div class="kpi"><span class="k">Imóveis analisados</span><span class="v">${OP.length}</span><span class="s">${U.length - OP.length} ficaram de fora: sem rota operacional, sem coordenada ou sem anúncio na Stays (${U.filter((u) => u.sem_stays).length})</span></div>
    <div class="kpi bad"><span class="k">Remover ou renegociar</span><span class="v">${rem.length}</span><span class="s">Deixam ${brl.format(sum(rem, (u) => u.receitaCD))}/mês para a Carpediem · margem ${brl.format(sum(rem, (u) => u.margem))}</span></div>
    <div class="kpi bad"><span class="k">Km/mês que deixam de rodar</span><span class="v">${n1.format(sum(rem, (u) => u.kmMes))}</span><span class="s">Sem os marcados para remover · ${brl.format(sum(rem, (u) => u.custoLog))}/mês</span></div>
    <div class="kpi warn"><span class="k">Atenção</span><span class="v">${at.length}</span><span class="s">Índice entre ${params.corte - 15} e ${params.corte - 1}, ou alto com margem boa</span></div>
    <div class="kpi new"><span class="k">Maturando</span><span class="v">${mat.length}</span><span class="s">${matRuim.length} com localização que prejudica a rota</span></div>
    <div class="kpi"><span class="k">Mais perto de outra rota</span><span class="v">${outra.length}</span><span class="s">Candidatos a trocar de rota em vez de sair</span></div>`;
}
function renderTable() {
  const rota = $("#fRota").value, classe = $("#fClasse").value, q = $("#fBusca").value.trim().toLowerCase(), outra = $("#fOutra").checked;
  let rows = OP.filter((u) => (!rota || u.rota === rota) && (!classe || u.classe === classe) && (!outra || u.maisPertoOutra)
    && (!q || [u.nome, u.publico, u.empreend, u.bairro, u.endereco].some((s) => (s || "").toLowerCase().includes(q))));
  const order = { remover: 0, atencao: 1, maturando: 2, saudavel: 3 };
  rows.sort((a, b) => {
    let x = a[sortKey], y = b[sortKey];
    if (sortKey === "classe") { x = order[x]; y = order[y]; }
    if (typeof x === "string" || typeof y === "string") return (sortAsc ? 1 : -1) * String(x ?? "").localeCompare(String(y ?? ""), "pt-BR");
    return (sortAsc ? 1 : -1) * ((x ?? -1e12) - (y ?? -1e12));
  });
  $("#fCount").textContent = `${rows.length} imóveis`;
  const head = "<thead><tr>" + COLS.map(([k, t, c]) => `<th data-k="${k}" class="${c || ""} ${k === sortKey ? "sorted" + (sortAsc ? " asc" : "") : ""}">${t}</th>`).join("") + "</tr></thead>";
  const body = rows.slice(0, 600).map((u) => `<tr data-id="${u.id}">
    <td class="nome"><b>${esc(u.publico || u.nome)}</b><span>${esc(u.nome)}</span><div>${flags(u)}</div></td>
    <td>${esc(u.rota)}</td><td>${pill(u.classe)}</td><td class="r">${scorebar(u.score)}</td>
    <td class="r">${brl.format(u.bruta_mes)}</td><td class="r">${brl.format(u.receitaCD)}</td>
    <td class="r ${u.margem < 0 ? "neg" : ""}">${brl.format(u.margem)}</td><td class="r">${n2.format(u.ch_mes)}</td>
    <td class="r">${n2.format(u.desvio_unid)}</td><td class="r">${u.na_parada}</td><td class="r">${fmtData(u.criado)}</td></tr>`).join("");
  $("#tbl").innerHTML = head + "<tbody>" + body + "</tbody>";
}
const fmtData = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) : "—");

/* ---------------- gaveta de detalhe ---------------- */
function openUnit(id) {
  const u = U.find((x) => String(x.id) === String(id));
  if (!u) return;
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
  const nat = Object.entries(u.ch_nat || {}).sort((a, b) => b[1] - a[1]);
  $("#drawerBody").innerHTML = `
    <h2>${esc(u.publico || u.nome)}</h2>
    <p class="muted small">${esc(u.nomes.join(" · "))}</p>
    <p>${u.op ? pill(u.classe) + " " + scorebar(u.score) : '<span class="muted">Fora das rotas operacionais</span>'}</p>
    <div>${flags(u)}</div>
    <h3>Dinheiro (média por mês ativo, ${u.meses} meses)</h3>
    <div class="dgrid">
      <div><span>Receita bruta</span><b>${brl.format(u.bruta_mes)}</b></div>
      <div><span>Taxa adm (${pct(u.taxa)} das diárias)</span><b>${brl.format(u.adm_mes)}</b></div>
      <div><span>Taxa de limpeza ${u.recolhe ? "recolhida" : "(repassada)"}</span><b>${brl.format(u.limp_mes)}</b></div>
      <div><span>Custo de limpeza (${brl.format(u.custo_limp)} × ${n2.format(u.res_mes)})</span><b>−${brl.format(u.custoLimp)}</b></div>
      <div><span>Deslocamento (${n1.format(u.kmMes)} km)</span><b>−${brl.format(u.custoLog)}</b></div>
      <div><span>Chamados (${n2.format(u.ch_mes)} × ${brl.format(params.ch)})</span><b>−${brl.format(u.custoCh)}</b></div>
      <div><span>Margem estimada</span><b class="${u.margem < 0 ? "neg" : ""}">${brl.format(u.margem)}</b></div>
      <div><span>Receita bruta 12 meses</span><b>${brl.format(u.bruta)}</b></div>
    </div>
    <h3>Receita mês a mês</h3>
    <svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita mensal">${bars}</svg>
    <p class="small muted"><span style="color:#8fb3ae">■</span> bruta &nbsp; <span style="color:#0E6B6B">■</span> fica para a Carpediem</p>
    <h3>Rota e localização</h3>
    <div class="dgrid">
      <div><span>Rota</span><b style="font-family:var(--font)">${esc(u.rota || "—")}</b></div>
      <div><span>Líder</span><b style="font-family:var(--font)">${esc(u.lider || "—")}</b></div>
      <div><span>Desvio no circuito (endereço)</span><b>${n2.format(u.desvio_km ?? 0)} km</b></div>
      <div><span>Desvio por imóvel do endereço</span><b>${n2.format(u.desvio_unid ?? 0)} km</b></div>
      <div><span>Vizinho mais próximo na rota</span><b>${n2.format(u.viz_km ?? 0)} km</b></div>
      <div><span>Parada mais perto de outra rota</span><b>${u.outra_rota ? n2.format(u.outra_km) + " km" : "—"}</b></div>
      <div><span>Visitas por mês (limpezas + chamados)</span><b>${n2.format(u.visitas)}</b></div>
      <div><span>Imóveis no mesmo endereço</span><b>${u.na_parada ?? 1}</b></div>
    </div>
    <p class="small muted">${esc(u.endereco || "")}${u.outra_rota ? ` · parada mais próxima de outra rota: ${esc(u.outra_rota)}` : ""}</p>
    <h3>Chamados de manutenção (12 meses): ${u.ch}</h3>
    ${tipos.length ? `<div class="dgrid">${tipos.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v}</b></div>`).join("")}</div>
      <p class="small muted">${nat.map(([k, v]) => `${esc(k)}: ${v}`).join(" · ")}<br>Origem: ${Object.entries(u.ch_origem || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}${u.ch_custo ? ` · custo lançado no Jestor: ${brl.format(u.ch_custo)}` : ""}</p>` : '<p class="muted small">Nenhum chamado no período.</p>'}
    <h3>Cadastro</h3>
    <p class="small muted">Cadastro na Stays em ${fmtData(u.criado)}${u.novo ? " (menos de 6 meses: maturando)" : ""} · Stays ${esc(u.stays.join(", "))} · ${esc(u.empreend || "")}</p>`;
  $("#drawer").hidden = false;
}

/* ---------------- mapa base ---------------- */
function baseMap(el) {
  const m = L.map(el, { zoomControl: true, preferCanvas: true }).setView([-8.06, -34.9], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap", className: "tiles-soft",
  }).addTo(m);
  return m;
}
function tipHtml(u) {
  return `<h4>${esc(u.publico || u.nome)}</h4>${u.op ? pill(u.classe) : ""}
  <table><tr><td>Índice</td><td>${u.score ?? "—"}</td></tr>
  <tr><td>Bruta/mês</td><td>${brl.format(u.bruta_mes)}</td></tr>
  <tr><td>Fica p/ Carpediem</td><td>${brl.format(u.receitaCD)}</td></tr>
  <tr><td>Margem/mês</td><td>${brl.format(u.margem)}</td></tr>
  <tr><td>Chamados/mês</td><td>${n2.format(u.ch_mes)}</td></tr>
  <tr><td>Desvio por visita</td><td>${n2.format(u.desvio_unid ?? 0)} km</td></tr>
  <tr><td>No endereço</td><td>${u.na_parada ?? 1} imóveis</td></tr></table>`;
}
let corModo = "classe";
const unitColor = (u) => (corModo === "classe" ? CLASSE[u.classe].cor : scoreColor(u.score));
const radius = (u) => 4 + Math.min(12, Math.sqrt(Math.max(0, u.bruta_mes)) / 9);
function spread(us) {
  // espalha imóveis do mesmo endereço num pequeno círculo para todos ficarem visíveis
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
    L.circleMarker([la, ln], { radius: radius(u), color: "#fff", weight: 1.2, fillColor: unitColor(u), fillOpacity: 0.9 })
      .bindTooltip(tipHtml(u), { className: "tip", direction: "top", sticky: true })
      .on("click", () => openUnit(u.id)).addTo(mLayer);
  }
  if (us.length) mapa.fitBounds(L.latLngBounds(us.map((u) => [u.lat, u.lng])).pad(0.08));
  setTimeout(() => mapa.invalidateSize(), 50);
  // legenda
  $("#mLegend").innerHTML = corModo === "classe"
    ? Object.entries(CLASSE).map(([k, c]) => `<div class="row"><span class="dot" style="background:${c.cor}"></span>${c.nome} <span class="muted">(${us.filter((u) => u.classe === k).length})</span></div>`).join("") + '<p class="small muted">Tamanho do círculo = receita bruta por mês. Passe o mouse para ver os números, clique para o detalhe.</p>'
    : '<div class="grad"></div><div class="ticks"><span>0 · melhor</span><span>50</span><span>100 · pior</span></div><p class="small muted">Tamanho do círculo = receita bruta por mês.</p>';
  // resumo e simulação
  const sum = (a, f) => a.reduce((s, u) => s + f(u), 0);
  const rem = us.filter((u) => u.classe === "remover");
  $("#mResumo").innerHTML = `
    <div class="stat"><span>Imóveis</span><b>${us.length}</b></div>
    <div class="stat"><span>Receita bruta/mês</span><b>${brl.format(sum(us, (u) => u.bruta_mes))}</b></div>
    <div class="stat"><span>Fica p/ Carpediem/mês</span><b>${brl.format(sum(us, (u) => u.receitaCD))}</b></div>
    <div class="stat"><span>Chamados/mês</span><b>${n1.format(sum(us, (u) => u.ch_mes))}</b></div>
    ${rota && P.rotas[rota] ? `<div class="stat"><span>Circuito por todos os endereços</span><b>${n1.format(P.rotas[rota].km)} km</b></div><div class="stat"><span>Endereços (paradas)</span><b>${P.rotas[rota].paradas}</b></div>` : ""}`;
  if (rota && P.rotas[rota]) {
    const R = P.rotas[rota];
    const stopsAll = R.pts.map((_, i) => i);
    const removeStop = new Set(stopsAll.filter((i) => { const g = us.filter((u) => u.parada === `${rota}#${i}`); return g.length && g.every((u) => u.classe === "remover"); }));
    const keep = stopsAll.filter((i) => !removeStop.has(i));
    let novoKm = R.km;
    if (R.D && keep.length > 1 && removeStop.size) {
      const D = keep.map((i) => keep.map((j) => R.D[i][j]));
      novoKm = pathLen(solveTsp(D, 0, true), D, true);
    }
    $("#mSim").innerHTML = rem.length ? `<div class="callout bad"><b>Simulação sem os ${rem.length} imóveis "Remover"</b><br>
      Somem ${removeStop.size} endereços do circuito: ${n1.format(R.km)} km → <b>${n1.format(novoKm)} km</b> (−${pct((R.km - novoKm) / R.km || 0)}).<br>
      A Carpediem deixa de receber ${brl.format(sum(rem, (u) => u.receitaCD))}/mês; ${(() => { const m = sum(rem, (u) => u.margem); return m >= 0 ? `a margem estimada cai ${brl.format(m)}/mês` : `a margem estimada melhora ${brl.format(-m)}/mês`; })()}.</div>`
      : '<div class="callout">Nenhum imóvel desta rota está marcado para remover com os parâmetros atuais.</div>';
  } else $("#mSim").innerHTML = '<p class="small muted">Escolha uma rota para ver o circuito e simular a saída dos imóveis marcados.</p>';
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
function stopName(us) {
  if (!us.length) return "—";
  if (us.length > 1 && us[0].empreend) return `${us[0].empreend.replace(/^[A-Z]{2}-[A-Z]{2,4}-[A-Z]{2,3}[.-]/, "").replace(/\/.*$/, "")} (${us.length} imóveis)`;
  return us[0].publico || us[0].nome;
}
function drawRouteStops() {
  rLayer.clearLayers();
  const st = routeStops();
  for (const s of st) {
    const worst = s.us.reduce((a, u) => (u.score > a.score ? u : a), s.us[0]);
    L.circleMarker([s.lat, s.lng], { radius: 5 + Math.min(10, s.us.length), color: "#fff", weight: 1.2, fillColor: CLASSE[worst.classe].cor, fillOpacity: 0.9 })
      .bindTooltip(`<h4>${esc(s.nome)}</h4>${s.us.length} imóveis · pior índice ${worst.score}`, { className: "tip", sticky: true }).addTo(rLayer);
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
  const by = {};
  OP.filter((u) => !rota || u.rota === rota).forEach((u) => (by[u.parada] = by[u.parada] || []).push(u));
  const rows = Object.values(by).filter((g) => g.length >= min).map((g) => {
    const s = (f) => g.reduce((a, u) => a + f(u), 0);
    return { g, nome: stopName(g), rota: g[0].rota, n: g.length, bruta: s((u) => u.bruta_mes), cd: s((u) => u.receitaCD), margem: s((u) => u.margem),
      ch: s((u) => u.ch_mes), desvio: g[0].desvio_km || 0, porU: g[0].desvio_unid || 0, rem: g.filter((u) => u.classe === "remover").length,
      fracos: g.filter((u) => u.bruta_mes < median(OP.map((x) => x.bruta_mes))).length };
  }).sort((a, b) => b.n - a.n || b.cd - a.cd);
  $("#ptbl").innerHTML = `<thead><tr><th>Endereço / prédio</th><th>Rota</th><th class="r">Imóveis</th><th class="r">Bruta/mês</th><th class="r">Fica p/ Carpediem</th><th class="r">Margem/mês</th><th class="r">Chamados/mês</th><th class="r">Desvio do endereço</th><th class="r">Desvio por imóvel</th><th class="r">Abaixo da mediana</th><th class="r">Remover</th></tr></thead><tbody>` +
    rows.map((r, i) => `<tr data-p="${i}"><td class="nome"><b>${esc(r.nome)}</b><span>${esc(r.g[0].endereco || "")}</span></td><td>${esc(r.rota)}</td><td class="r">${r.n}</td>
      <td class="r">${brl.format(r.bruta)}</td><td class="r">${brl.format(r.cd)}</td><td class="r ${r.margem < 0 ? "neg" : ""}">${brl.format(r.margem)}</td><td class="r">${n1.format(r.ch)}</td>
      <td class="r">${n2.format(r.desvio)} km</td><td class="r">${n2.format(r.porU)} km</td><td class="r">${r.fracos}</td><td class="r">${r.rem ? `<span class="neg">${r.rem}</span>` : 0}</td></tr>`).join("") + "</tbody>";
  $$("#ptbl tbody tr").forEach((tr) => tr.addEventListener("click", () => openStop(rows[+tr.dataset.p])));
}
let _med = null;
function median(a) { if (_med != null) return _med; const s = [...a].sort((x, y) => x - y); _med = s[Math.floor(s.length / 2)] || 0; return _med; }
function openStop(r) {
  $("#drawerBody").innerHTML = `<h2>${esc(r.nome)}</h2><p class="muted small">${esc(r.g[0].endereco || "")} · ${esc(r.rota)}</p>
    <div class="dgrid"><div><span>Imóveis no endereço</span><b>${r.n}</b></div><div><span>Desvio do endereço no circuito</span><b>${n2.format(r.desvio)} km</b></div>
    <div><span>Desvio dividido por imóvel</span><b>${n2.format(r.porU)} km</b></div><div><span>Fica p/ Carpediem/mês</span><b>${brl.format(r.cd)}</b></div></div>
    <h3>Imóveis</h3><div class="table-wrap"><table class="tbl"><tbody>${r.g.sort((a, b) => b.score - a.score).map((u) => `<tr data-id="${u.id}"><td class="nome"><b>${esc(u.publico || u.nome)}</b></td><td>${pill(u.classe)}</td><td class="r">${brl.format(u.bruta_mes)}</td><td class="r">${brl.format(u.margem)}</td></tr>`).join("")}</tbody></table></div>`;
  $$("#drawerBody tr[data-id]").forEach((tr) => tr.addEventListener("click", () => openUnit(tr.dataset.id)));
  $("#drawer").hidden = false;
}

/* ---------------- aba Método ---------------- */
function renderMetodo() {
  const meses = P.meses;
  $("#tab-metodo").innerHTML = `
  <h2>De onde vêm os dados</h2>
  <ul>
    <li><b>Imóveis e rotas:</b> Mastertable do Jestor, só status <code>Ativo</code>. A rota é o campo "Unidades de negócio nomeadas". "Proprietário" e "Terceirizada" ficam fora da roteirização.</li>
    <li><b>Localização:</b> coordenadas do anúncio na Stays (e da Mastertable quando a Stays não tem).</li>
    <li><b>Receita:</b> reservas da Stays com check-in de ${MES_NOME[+meses[0].slice(5) - 1]}/${meses[0].slice(0, 4)} a ${MES_NOME[+meses.at(-1).slice(5) - 1]}/${meses.at(-1).slice(0, 4)}, sem canceladas e sem uso do proprietário. Bruta = total pago pelo hóspede.</li>
    <li><b>Prédios (grupos-clone):</b> a Stays grava a reserva no anúncio-mestre da categoria. A receita do grupo é dividida igualmente entre as unidades físicas dele.</li>
    <li><b>Duplicados:</b> os ${P.unidades.filter((u) => u.dup).length} imóveis com anúncio individual e de prédio (planilha de/para) viram um imóvel só, somando receita e chamados.</li>
    <li><b>Chamados:</b> tabela de manutenções do Jestor, criados no mesmo período, por tipo. ${P.chamados_sem_vinculo} chamados ficaram de fora por não terem imóvel preenchido ou serem de imóveis inativos.</li>
    <li><b>Cadastro:</b> data em que o anúncio foi criado na Stays. Menos de 6 meses = <b>Maturando</b>: não é apontado para remoção, só sinalizado se a localização prejudica a rota.</li>
  </ul>
  <h2>O que fica para a Carpediem</h2>
  <p>Taxa de administração = % de comissão da Mastertable × valor das diárias. Taxa de limpeza conta como receita quando o formato é "Recolhe". Custo de limpeza = custo da Mastertable × número de reservas.</p>
  <h2>Custo de rota (pesquisa operacional)</h2>
  <p>Para cada rota, os imóveis a menos de 60 m um do outro (ou do mesmo empreendimento) viram uma parada. Montamos a matriz de distâncias por rua (OSRM, sobre o mapa do OpenStreetMap) e resolvemos o problema do caixeiro-viajante: um circuito que passa uma vez por cada parada, construído pelo vizinho mais próximo e melhorado com 2-opt e Or-opt até não haver troca que encurte a rota.</p>
  <p><b>Desvio</b> de uma parada = quantos km o circuito encurta se ela sair (economia de remoção). O desvio é dividido entre os imóveis do endereço. É assim que a verticalização entra: num prédio com 10 unidades, cada uma carrega 1/10 do desvio.</p>
  <p><b>Custo de deslocamento/mês</b> = (limpezas + chamados por mês) × desvio por imóvel × custo por km. O custo por km soma combustível e desgaste com o tempo da equipe (custo/hora ÷ velocidade média): hoje ${brl.format(custoKm())}/km com os parâmetros atuais. <b>Margem</b> = o que fica para a Carpediem − limpeza − deslocamento − chamados × custo médio.</p>
  <h2>Índice e classificação</h2>
  <p>Cada imóvel recebe um percentil (0 a 1, quanto maior pior) em quatro critérios: margem, desvio por imóvel, chamados por mês e isolamento (distância até o vizinho mais próximo na rota). O índice é a média ponderada × 100 (pesos em Parâmetros). Índice ≥ ${params.corte} <i>e</i> margem entre os 40% piores: <b>Remover ou renegociar</b>. Índice alto com margem boa, ou de ${params.corte - 15} a ${params.corte - 1}: <b>Atenção</b> (custa à operação, mas paga a conta: renegociar taxa ou trocar de rota antes de tirar). Abaixo: <b>Saudável</b>.</p>
  <p>"Mais perto de outra rota" marca quem tem uma parada de outra rota a menos da metade da distância do vizinho mais próximo na própria rota. Nesses casos, trocar de rota pode ser melhor que tirar o imóvel.</p>
  <h2>Roteirizador</h2>
  <p>Você escolhe a rota e o ponto de partida. A rota ótima sai do mesmo algoritmo, com distâncias por rua calculadas na hora. A curva de cobertura mostra a parada a partir da qual cada km extra atende poucos imóveis: é o ponto sugerido para encerrar a rota.</p>
  <p class="small muted">Snapshot gerado em ${fmtData(P.gerado)}.</p>`;
}

/* ---------------- navegação ---------------- */
function renderAll() {
  fillRotaSelect($("#fRota"), "Todas as rotas");
  renderKpis(); renderTable(); renderMapa(); renderRoteiro(); renderPredios();
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
    if (th) { const k = th.dataset.k; if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = ["nome", "rota", "classe"].includes(k); } return renderTable(); }
    const tr = e.target.closest("tr[data-id]"); if (tr) openUnit(tr.dataset.id);
  });
  $("#drawerClose").addEventListener("click", () => ($("#drawer").hidden = true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#drawer").hidden = true; });
  $("#mRota").addEventListener("change", renderMapa);
  $$("#mCor button").forEach((b) => b.addEventListener("click", () => { corModo = b.dataset.v; $$("#mCor button").forEach((x) => x.classList.toggle("on", x === b)); renderMapa(); }));
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
  wire(); loadParams(); renderMetodo(); recompute();
  const h = location.hash.slice(1);
  if (h) document.querySelector(`.tab[data-tab="${h}"]`)?.click();
}
async function loadData() {
  if (LOCAL) {
    const r = await fetch("../data/payload.json"); return start(await r.json());
  }
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
