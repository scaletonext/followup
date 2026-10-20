/* ===== Estado ===== */
const S = {
  base: null, demo: true, baseInfo: null, scored: [], byKey: new Map(),
  st: new Map(), // docId -> contato
  cfg: { salao: 'Visual Up', meta: 50, oferta: '' },
  atendente: '', sb: null, user: null, salao: null, papel: '', membroNome: '', view: 'fila', lista: 'fila', f: { setor: '', tipo: '', prof: '', ticket: '' }, busca: '', listLimit: 100,
  queue: [], cur: null, skipped: new Set(), tab: 'whats', open: null, lastUndo: null, today: 0,
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
function todayDay() { const n = new Date(); return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY); }
function dayToStr(d) { const x = new Date(d * DAY); return String(x.getUTCDate()).padStart(2, '0') + '/' + String(x.getUTCMonth() + 1).padStart(2, '0') + '/' + x.getUTCFullYear(); }
function isoToDay(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null; }
function dayToIso(d) { return new Date(d * DAY).toISOString().slice(0, 10); }
function msToDay(ms) { const x = new Date(ms); return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / DAY); }
function cyrb53(str) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'); }
const docId = key => 'c' + cyrb53(key);
const fmtBRL = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
function fmtPhone(c) { if (!c) return ''; const d = c.length > 11 && c.startsWith('55') ? c.slice(2) : c; if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return c; }
function waNumber(c) { if (!c) return ''; return c.length >= 12 && c.startsWith('55') ? c : '55' + c; }

/* ===== Cache local da base (IndexedDB), para não baixar tudo a cada abertura ===== */
function idb() { return new Promise((res, rej) => { try { const r = indexedDB.open('followup-salao', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); }
async function idbGet(k) { try { const d = await idb(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise(res => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }

/* ===== Regras da fila ===== */
function contatoAtivo(o) {
  const s = S.st.get(docId(o.c.k));
  if (!s) return null;
  // se ela voltou ao salão depois do último contato, o contato já cumpriu seu papel
  if (o.ult * DAY >= msToDay(s.at) * DAY && o.ult > msToDay(s.at)) return null;
  return s;
}
function estadoFila(o) {
  const s = contatoAtivo(o); const now = Date.now(); const d = S.today;
  if (s) {
    const dias = (now - s.at) / DAY;
    if (s.st === 'retornar') { const ate = isoToDay(s.ate); return ate != null && d >= ate ? 'pin' : 'oculta'; }
    if (s.st === 'errado') return 'oculta';
    if (s.st === 'agendou' && dias < 60) return 'oculta';
    if (s.st === 'sem' && dias < 90) return 'oculta';
    if (s.st === 'naoatendeu') { if ((s.tent || 1) >= 3 ? dias < 60 : dias < 3) return 'oculta'; }
  }
  return o.faixa === 'fora' ? 'fora' : o.faixa;
}
function rebuildQueue() {
  const pins = [], rest = [];
  for (const o of S.scored) {
    const e = estadoFila(o); o.estado = e;
    if (e === 'pin') { pins.push(o); continue; }
    if (e === 'oculta' || e === 'fora') continue;
    if (!matchF(o)) continue;
    rest.push(o);
  }
  pins.sort((a, b) => (isoToDay(S.st.get(docId(a.c.k)).ate) || 0) - (isoToDay(S.st.get(docId(b.c.k)).ate) || 0));
  rest.sort((a, b) => (b.score - a.score) || (b.anual - a.anual));
  const skipped = rest.filter(o => S.skipped.has(o.c.k)), main = rest.filter(o => !S.skipped.has(o.c.k));
  S.queue = [...pins, ...main, ...skipped];
  S.pins = pins.length;
  if (!S.cur || !S.queue.find(o => o.c.k === S.cur)) S.cur = S.queue[0] ? S.queue[0].c.k : null;
  $('#navFila').textContent = S.queue.length.toLocaleString('pt-BR');
}
function matchF(o) {
  const f = S.f; const fams = o.trig ? [o.trig.fam] : Object.keys(o.c.f);
  if (f.setor && !fams.some(k => FAMMETA[k] && FAMMETA[k].g === f.setor)) return false;
  if (f.tipo && !fams.includes(f.tipo)) return false;
  if (f.prof && o.prof !== f.prof) return false;
  if (f.ticket) { const b = TICKETS.find(t => t[0] === f.ticket); if (!(o.ticket >= b[2] && o.ticket < b[3])) return false; }
  return true;
}
const temFiltro = () => !!(S.f.setor || S.f.tipo || S.f.prof || S.f.ticket);
function recompute() {
  S.today = todayDay();
  S.scored = scoreBase(S.base, S.today);
  S.byKey = new Map(S.scored.map(o => [o.c.k, o]));
  const cnt = {}; S.scored.forEach(o => { if (o.prof) cnt[o.prof] = (cnt[o.prof] || 0) + 1; });
  S.profs = Object.entries(cnt).map(([p, n]) => ({ p, n, ativa: (S.base.maxDay - ((S.base.profs || {})[p] || 0)) <= 90 })).sort((a, b) => b.n - a.n);
  rebuildQueue();
}

/* ===== Contagens do dia ===== */
function hojeStats() {
  let contatos = 0, agend = 0; const d0 = S.today;
  for (const s of S.st.values()) for (const h of (s.hist || [])) { if (msToDay(h.at) === d0) { contatos++; if (h.st === 'agendou') agend++; } }
  return { contatos, agend };
}

/* ===== Render ===== */
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.setAttribute('aria-current', b.dataset.view === S.view ? 'page' : 'false'));
  $('#salaoSide').textContent = S.cfg.salao || 'Salão';
  $('#baseTxt').textContent = S.demo ? 'Nenhuma base carregada' : `Base até ${dayToStr(S.base.maxDay)}`;
  $('#userTxt').textContent = S.atendente || S.membroNome || '';
  const v = { fila: renderFila, lista: renderLista, resultados: renderResultados, ajustes: renderAjustes }[S.view];
  $('#main').innerHTML = v();
  bindView();
}
function demoBanner() {
  if (!S.demo) return '';
  return S.papel === 'admin'
    ? `<div class="banner warn"><b>Nenhuma base carregada ainda.</b><span>Suba a exportação de serviços do Avec para montar a fila.</span><span class="spacer"></span><button class="btn primary" data-go="ajustes">Carregar planilha</button></div>`
    : `<div class="banner warn"><b>Nenhuma base carregada ainda.</b><span>Peça a um administrador para subir a planilha do Avec.</span></div>`;
}
function filtrosHtml() {
  const f = S.f; const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  const tipos = f.setor ? Object.entries(FAMMETA).filter(([, m]) => m.g === f.setor && !m.semCiclo) : [];
  const ativas = (S.profs || []).filter(x => x.ativa), inativas = (S.profs || []).filter(x => !x.ativa);
  return `<div class="filters" role="group" aria-label="Filtros">
    <select class="select" id="fSetor" aria-label="Setor">${opt('', 'Todos os setores', !f.setor)}${Object.entries(SETORES).map(([k, l]) => opt(k, l, f.setor === k)).join('')}</select>
    <select class="select" id="fTipo" aria-label="Tipo de serviço" ${f.setor ? '' : 'disabled title="Escolha um setor primeiro"'}>${opt('', f.setor ? 'Todos os serviços' : 'Tipo de serviço (escolha o setor)', !f.tipo)}${tipos.map(([k, m]) => opt(k, m.nome, f.tipo === k)).join('')}</select>
    <select class="select" id="fProf" aria-label="Profissional">${opt('', 'Todas as profissionais', !f.prof)}${ativas.map(x => opt(x.p, x.p, f.prof === x.p)).join('')}${inativas.length ? `<optgroup label="Não atendem mais">${inativas.map(x => opt(x.p, x.p, f.prof === x.p)).join('')}</optgroup>` : ''}</select>
    <select class="select" id="fTicket" aria-label="Ticket médio">${opt('', 'Qualquer ticket', !f.ticket)}${TICKETS.map(t => opt(t[0], 'Ticket ' + t[1].toLowerCase().replace('r$', 'R$'), f.ticket === t[0])).join('')}</select>
    ${temFiltro() ? '<button class="btn ghost" id="bLimpar">Limpar filtros</button>' : ''}
  </div>`;
}
function modosLista() {
  const nFila = S.scored.filter(o => o.estado !== 'oculta' && o.estado !== 'fora' && matchF(o)).length;
  const nFora = S.scored.filter(o => (o.estado === 'fora' || o.estado === 'oculta') && matchF(o)).length;
  const nTodas = S.scored.filter(matchF).length;
  const opts = [['fila', 'Na fila', nFila], ['fora', 'Fora da fila', nFora], ['todas', 'Base inteira', nTodas]];
  return `<div class="filters" role="group" aria-label="Quais clientes mostrar">${opts.map(([k, l, n]) => `<button class="chip" data-lista="${k}" aria-pressed="${S.lista === k}">${l}<span class="c num">${n.toLocaleString('pt-BR')}</span></button>`).join('')}</div>`;
}
function ringSvg(score) {
  const r = 36, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, score)) / 100;
  return `<div class="ring" aria-label="Nota ${score} de 100"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#F1E4E7" stroke-width="7"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="url(#rg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * p} ${c}"/><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D98FA3"/><stop offset="1" stop-color="#B56C82"/></linearGradient></defs></svg><div class="rv"><div><b class="num">${score}</b><small>NOTA</small></div></div></div>`;
}
function motivosLead(o, s, pinned) {
  const p = []; const r = o.trig.ratio; const dF = S.today - o.trig.ultFam;
  if (pinned) p.push(['pin', 'Pediu retorno para ' + dayToStr(isoToDay(s.ate))]);
  const pr = { prioritaria: ['pin', 'Prioridade alta'], normal: ['info', 'Prioridade média'], baixa: ['muted', 'Prioridade baixa'] }[o.faixa];
  if (pr && !pinned) p.push(pr);
  const fz = FASES[o.fase]; p.push([fz.tom, fz.nome]);
  p.push([r < 1.5 ? 'good' : r < 3 ? 'warn' : 'bad', o.trig.atraso + ' dias de atraso']);
  if (o.vencidos.length) p.push(['warn', 'Também vencido: ' + o.vencidos.slice(0, 3).map(f => FAMMETA[f.fam].nome.split(' /')[0].toLowerCase()).join(', ')]);
  o.abandonados.slice(0, 2).forEach(f => p.push(['muted', 'Parou de fazer ' + FAMMETA[f.fam].nome.split(' /')[0].toLowerCase() + ' aqui']));
  if (o.n >= 10) p.push(['good', 'Cliente fiel']);
  if (o.top10) p.push(['good', 'Top 10% em gasto']);
  if (o.pts.regularidade >= 7) p.push(['info', 'Ritmo regular nesse serviço']);
  if (o.pts.bonus) p.push(['warn', 'Química ou manutenção vencida']);
  if (o.profSaiu) p.push(['muted', 'Profissional não atende mais']);
  if (!o.c.cel) p.push(['bad', 'Sem celular cadastrado']);
  return p.map(([t, l]) => `<span class="pill ${t}">${esc(l)}</span>`).join('');
}
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function servicosDela(o) {
  const st = f => f === o.trig ? ['pin', 'Motivo'] : { vencido: ['warn', 'Vencido'], noprazo: ['good', 'No prazo'], abandonado: ['muted', 'Parou'], pontual: ['muted', '1 vez só'] }[f.status];
  const atr = f => f.status === 'noprazo' ? `faltam ${Math.max(0, f.prazo + Math.round(Math.max(7, .2 * f.prazo)) - f.dias)} d` : f.status === 'pontual' ? '—' : `+${f.atraso} d`;
  const dt = d => dayToStr(d).slice(0, 6) + dayToStr(d).slice(8);
  const rows = o.fams.slice(0, 12).map(f => { const [t, l] = st(f); return `<tr><td><b>${esc(FAMMETA[f.fam].nome)}</b><small>${f.vezes}× · ${fmtBRL(f.tk)}</small></td><td class="r num">${f.status === 'pontual' ? '—' : f.prazo + ' d' + (f.proprio ? '' : '*')}</td><td class="r num">${dt(f.ultFam)}</td><td class="r num">${atr(f)}</td><td>${esc(f.prof ? primeiroNome(f.prof) : '—')}</td><td><span class="pill ${t}">${l}</span></td></tr>`; }).join('');
  return `<div class="svc-wrap"><table class="svc"><thead><tr><th>Serviço</th><th class="r">Ritmo</th><th class="r">Última</th><th class="r">Atraso</th><th>Quem</th><th>Situação</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note"><b>Motivo</b>: serviço da ligação. <b>Parou</b>: ela segue vindo, mas não faz esse serviço aqui há muito tempo. * Ritmo do salão, por pouco histórico dela. Um serviço só vence depois do ritmo mais uma folga de 7 dias ou 20%, o que for maior.</p>`;
}
function historico(o) {
  const days = o.c.v.slice(-6).reverse();
  return days.map(([d, tot]) => {
    const fams = Object.entries(o.c.f).filter(([, a]) => a.some(x => x[0] === d)).map(([k]) => FAMMETA[k] ? FAMMETA[k].nome : 'Outros');
    return `<div class="hist-row"><span class="num">${dayToStr(d)}</span><div>${esc(fams.join(', '))}</div><b class="num">${fmtBRL(tot)}</b></div>`;
  }).join('');
}
const WHY = [['momento', 'Momento do ciclo', 35], ['fidelidade', 'Fidelidade', 25], ['sumida', 'Tempo sumida', 15], ['valor', 'Valor por ano', 15], ['regularidade', 'Regularidade', 10], ['bonus', 'Bônus química', 5]];
const STNOME = { agendou: 'Agendou', sem: 'Sem interesse', naoatendeu: 'Não atendeu', retornar: 'Retornar em', errado: 'Número errado' };
const MOTIVOS = ['Mudou de salão', 'Preço', 'Mudou de cidade', 'Insatisfeita com atendimento', 'Sem tempo / agenda', 'Outro'];

function renderFila() {
  const hs = hojeStats(); const meta = +S.cfg.meta || 50;
  const head = `<div class="head"><div><div class="eyebrow">Retorno de clientes</div><h1>Fila de <em>hoje</em></h1><p class="sub">Uma cliente por vez, das mais prováveis de agendar para as menos.</p></div></div>
  ${demoBanner()}
  <div class="kpis">
    <div class="kpi"><span class="l">Contatos hoje</span><span class="v num">${hs.contatos}<small> / ${meta}</small></span><div class="meter"><i style="width:${Math.min(100, hs.contatos / meta * 100)}%"></i></div></div>
    <div class="kpi"><span class="l">Agendamentos hoje</span><span class="v num">${hs.agend}</span><span class="h">${hs.contatos ? Math.round(hs.agend / hs.contatos * 100) + '% dos contatos' : 'nenhum contato ainda'}</span></div>
    <div class="kpi"><span class="l">Retornos para hoje</span><span class="v num">${S.pins || 0}</span><span class="h">clientes que pediram para ligar hoje</span></div>
    <div class="kpi"><span class="l">Na fila</span><span class="v num">${S.queue.length.toLocaleString('pt-BR')}</span><span class="h">${temFiltro() ? 'com os filtros escolhidos' : 'fila completa, por nota'}</span></div>
  </div>
  ${filtrosHtml()}`;
  const o = S.byKey.get(S.cur);
  if (!o) return head + `<div class="card empty"><b>${temFiltro() ? 'Nenhuma cliente com esses filtros' : 'Fila vazia'}</b>${temFiltro() ? 'Mude ou limpe os filtros acima.' : 'Suba uma exportação mais recente do Avec em "Base e ajustes".'}</div>`;
  const pos = S.queue.findIndex(x => x.c.k === o.c.k);
  const s = contatoAtivo(o); const pinned = o.estado === 'pin';
  const cfg = { ...S.cfg, atendente: S.atendente || S.membroNome };
  const m = montarMensagem(o, cfg);
  const wa = o.c.cel ? `https://wa.me/${waNumber(o.c.cel)}?text=${encodeURIComponent(m.whats)}` : '';
  const prev = s && s.hist && s.hist.length ? `<div class="prev">Último contato: <b>${esc(STNOME[s.hist[s.hist.length - 1].st])}</b> em ${new Date(s.hist[s.hist.length - 1].at).toLocaleDateString('pt-BR')}${s.st === 'naoatendeu' ? ` · ${s.tent || 1} de 3 tentativas` : ''}${s.hist[s.hist.length - 1].obs ? ` · "${esc(s.hist[s.hist.length - 1].obs)}"` : ''}</div>` : '';
  const fm = FAMMETA[o.trig.fam];
  const lead = `<section class="card" aria-label="Cliente atual">
    <div class="lead-top">${ringSvg(o.score)}
      <div class="lead-id"><div class="lead-pos num">${pinned ? 'Retorno combinado' : 'Posição ' + (pos + 1) + ' de ' + S.queue.length.toLocaleString('pt-BR')}</div>
        <div class="lead-name">${esc(o.c.nome)}</div>
        <div class="phone">${o.c.cel ? `<code>${esc(fmtPhone(o.c.cel))}</code><button class="btn ghost" data-copy="${esc(o.c.cel)}" style="padding:4px 10px">Copiar</button>` : '<span class="pill bad">Sem celular</span>'}</div>
      </div></div>
    <div class="pills">${motivosLead(o, s, pinned)}</div>
    <div class="facts">
      <div class="fact"><div class="l">Serviço a chamar</div><div class="v">${esc(fm.nome)}</div><div class="h num">${o.trig.vezes}× feito · ${fmtBRL(o.trig.tk)} em média</div></div>
      <div class="fact"><div class="l">Atraso</div><div class="v num">${o.trig.atraso} dias</div><div class="h num">última vez ${dayToStr(o.trig.ultFam)} (há ${o.trig.dias} dias)</div></div>
      <div class="fact"><div class="l">Ritmo ${o.trig.proprio ? 'dela' : 'do salão'} nesse serviço</div><div class="v num">a cada ${o.trig.prazo} dias</div><div class="h">${o.trig.proprio ? (o.trig.cv <= .4 ? 'bem regular' : o.trig.cv <= .7 ? 'regular' : 'irregular') + ', média das voltas dela' : 'pouco histórico dela'}</div></div>
      <div class="fact"><div class="l">Quem atendeu</div><div class="v">${esc(o.prof ? primeiroNome(o.prof) : '—')}</div><div class="h">${o.profSaiu ? 'não atende mais' : 'na última vez desse serviço'}${o.c.pt && o.c.pt !== o.prof ? ` · mais frequente: ${esc(primeiroNome(o.c.pt))}` : ''}</div></div>
      <div class="fact"><div class="l">Última visita ao salão</div><div class="v num">há ${o.rec} dias</div><div class="h num">${dayToStr(o.ult)}${o.ult !== o.trig.ultFam ? ' · outro serviço' : ''}</div></div>
      <div class="fact"><div class="l">Dia preferido</div><div class="v">${o.diaPref ? DIAS[o.diaPref.dia] : '—'}</div><div class="h num">${o.diaPref ? Math.round(o.diaPref.pct * 100) + '% das visitas' : 'poucas visitas'}</div></div>
      <div class="fact"><div class="l">Visitas</div><div class="v num">${o.n}</div><div class="h num">cliente desde ${dayToStr(o.pri).slice(3)}</div></div>
      <div class="fact"><div class="l">Ticket médio</div><div class="v num">${fmtBRL(o.ticket)}</div><div class="h">por visita</div></div>
      <div class="fact"><div class="l">Gasto por ano</div><div class="v num">${fmtBRL(o.anual)}</div><div class="h num">${fmtBRL(o.fat)} no total</div></div>
    </div>
    ${prev}
    <div class="actions">
      <div class="sect-t"><span>Resultado do contato</span></div>
      <div class="act-grid">
        <button class="act good" data-act="agendou" aria-expanded="${S.open === 'agendou'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>Agendou</button>
        <button class="act bad" data-act="sem" aria-expanded="${S.open === 'sem'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>Sem interesse</button>
        <button class="act warn" data-act="naoatendeu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Não atendeu</button>
        <button class="act info" data-act="retornar" aria-expanded="${S.open === 'retornar'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Retornar em</button>
        <button class="act" data-act="errado"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Número errado</button>
      </div>
      ${actForm()}
      <div class="navrow"><button class="btn ghost" id="bPrev" ${pos <= 0 ? 'disabled' : ''}>← Anterior</button><button class="btn" id="bSkip">Pular por agora →</button></div>
    </div>
    <div class="sect"><div class="sect-t"><span>Por que essa nota</span><span class="num">${o.score} de 100</span></div>
      <div class="why">${WHY.map(([k, l, mx]) => `<div class="why-row"><span>${l}</span><div class="meter"><i style="width:${o.pts[k] / mx * 100}%"></i></div><b class="num">${o.pts[k]}<small>/${mx}</small></b></div>`).join('')}</div></div>
    <div class="sect"><div class="sect-t"><span>Últimas visitas</span></div><div class="hist">${historico(o)}</div></div>
  </section>`;
  const panel = `<section class="card" aria-label="Mensagem e roteiro">
    <div class="tabs" role="tablist"><button class="tab" role="tab" data-tab="whats" aria-selected="${S.tab === 'whats'}">Mensagem WhatsApp</button><button class="tab" role="tab" data-tab="lig" aria-selected="${S.tab === 'lig'}">Roteiro de ligação</button></div>
    <div style="margin-top:16px" ${S.tab === 'whats' ? '' : 'hidden'}>
      <label class="sect-t" for="msgTxt"><span>Sugestão para ${esc(FASES[o.fase].nome.toLowerCase())} · ${esc(fm.nome.toLowerCase())}</span></label>
      <textarea class="input" id="msgTxt" rows="8">${esc(m.whats)}</textarea>
      <div class="msg-actions">${wa ? `<a class="btn primary" id="bWa" href="${esc(wa)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg>Abrir no WhatsApp</a>` : ''}<button class="btn" id="bCopyMsg">Copiar mensagem</button></div>
      <p class="note">Você pode editar o texto antes de enviar. O botão abre a conversa com a mensagem pronta; se não abrir, copie e cole.</p>
    </div>
    <div style="margin-top:16px" ${S.tab === 'lig' ? '' : 'hidden'}>
      <div class="script">${m.roteiro.map((x, i) => `<div class="step"><i>${i + 1}</i><div><b>${esc(x.t)}</b><p>${esc(x.f)}</p></div></div>`).join('')}</div>
      <div class="sect"><div class="sect-t"><span>Se ela disser…</span></div><div class="obj">${m.objecoes.map(x => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</div></div>
    </div>
  </section>`;
  const svc = `<section class="card" aria-label="Serviços da cliente"><div class="sect-t" style="margin-bottom:12px"><span>Serviços de ${esc(primeiroNome(o.c.nome))}</span><span>cada serviço com o seu próprio ritmo</span></div>${servicosDela(o)}</section>`;
  return head + `<div class="work">${lead}<div class="col-r">${panel}</div></div>${svc}`;
}
function actForm() {
  if (S.open === 'agendou') return `<div class="act-form"><div class="field"><label for="fAgDia">Dia agendado (opcional)</label><input class="input" type="date" id="fAgDia"></div><div class="field" style="flex:2 1 200px"><label for="fObs">Observação</label><input class="input" id="fObs" placeholder="Ex.: retoque + escova com a Carol"></div><button class="btn primary" data-confirm="agendou">Confirmar agendamento</button></div>`;
  if (S.open === 'sem') return `<div class="act-form"><div class="field"><label for="fMotivo">Motivo</label><select class="input" id="fMotivo">${MOTIVOS.map(m => `<option>${m}</option>`).join('')}</select></div><div class="field" style="flex:2 1 200px"><label for="fObs">Observação</label><input class="input" id="fObs" placeholder="O que ela contou"></div><button class="btn primary" data-confirm="sem">Registrar</button></div>`;
  if (S.open === 'retornar') return `<div class="act-form"><div class="field"><label for="fAte">Ligar de novo em</label><input class="input" type="date" id="fAte" min="${dayToIso(S.today + 1)}" value="${dayToIso(S.today + 7)}"></div><div class="field" style="flex:2 1 200px"><label for="fObs">Observação</label><input class="input" id="fObs" placeholder="Ex.: pediu para ligar depois do dia 20"></div><button class="btn primary" data-confirm="retornar">Agendar retorno</button></div>`;
  return '';
}

function renderLista() {
  const q = S.busca.trim().toLowerCase();
  let rows;
  if (q) rows = S.scored.filter(o => o.c.nome.toLowerCase().includes(q) || (o.c.cel || '').includes(q.replace(/\D/g, '') || '§'));
  else {
    rows = S.lista === 'fila' ? S.scored.filter(o => o.estado !== 'oculta' && o.estado !== 'fora') : S.lista === 'fora' ? S.scored.filter(o => o.estado === 'fora' || o.estado === 'oculta') : S.scored.slice();
    rows = rows.filter(matchF);
  }
  rows.sort((a, b) => (b.estado === 'pin') - (a.estado === 'pin') || ((a.faixa === 'fora') - (b.faixa === 'fora')) || ((b.faixa === 'fora' ? -1 : b.score) - (a.faixa === 'fora' ? -1 : a.score)) || (a.rec - b.rec));
  const total = rows.length; rows = rows.slice(0, S.listLimit);
  const stCell = o => { const s = contatoAtivo(o); if (o.estado === 'pin') return '<span class="pill pin">Retornar hoje</span>'; if (!s) return '<span style="color:var(--fg3)">—</span>'; return `<span class="pill muted">${esc(STNOME[s.st])}${s.st === 'retornar' ? ' ' + dayToStr(isoToDay(s.ate)).slice(0, 5) : ''}</span>`; };
  return `<div class="head"><div><div class="eyebrow">Visão geral</div><h1>Lista <em>completa</em></h1><p class="sub">"Na fila" segue a mesma ordem da fila. "Fora da fila" mostra quem não recebe contato agora e por quê. Clique numa linha para abrir a ficha.</p></div>
    <input class="input" id="fBusca" style="max-width:280px" placeholder="Buscar por nome ou celular" value="${esc(S.busca)}" aria-label="Buscar cliente"></div>
  ${demoBanner()}${modosLista()}${filtrosHtml()}
  <div class="table-wrap"><table><thead><tr><th class="r">#</th><th>Cliente</th><th class="r">Nota</th><th>Serviço a chamar</th><th class="r">Atraso</th><th>Situação</th><th class="r">Sumida há</th><th class="r">Visitas</th><th>Profissional</th><th class="r">Ticket médio</th><th>Contato</th></tr></thead><tbody>
  ${rows.map((o, i) => `<tr data-open="${esc(o.c.k)}"><td class="r num" style="color:var(--fg3)">${i + 1}</td><td><b>${esc(o.c.nome)}</b></td><td class="r">${o.faixa === 'fora' ? '<span style="color:var(--fg3)">fora</span>' : `<span class="score-chip num ${o.score >= 60 ? 'hi' : ''}">${o.score}</span>`}</td><td>${o.trig ? esc(FAMMETA[o.trig.fam].nome) : '<span style="color:var(--fg3)">—</span>'}</td><td class="r num">${o.trig ? '+' + o.trig.atraso + ' d' : '—'}</td><td>${esc(FASES[o.fase].nome)}</td><td class="r num">${tempo(o.rec)}</td><td class="r num">${o.n}</td><td>${o.prof ? esc(primeiroNome(o.prof)) : '—'}</td><td class="r num">${fmtBRL(o.ticket)}</td><td>${stCell(o)}</td></tr>`).join('')}
  </tbody></table></div>
  ${total > S.listLimit ? `<div style="text-align:center"><button class="btn" id="bMore">Mostrar mais (${(total - S.listLimit).toLocaleString('pt-BR')} restantes)</button></div>` : ''}`;
}

function renderResultados() {
  const all = [...S.st.values()]; const hist = all.flatMap(s => s.hist || []);
  const contatadas = all.length;
  const agend = all.filter(s => (s.hist || []).some(h => h.st === 'agendou')).length;
  let voltaram = 0; for (const o of S.scored) { const s = S.st.get(docId(o.c.k)); if (s && s.first && o.ult > msToDay(s.first)) voltaram++; }
  const porSt = {}; hist.forEach(h => porSt[h.st] = (porSt[h.st] || 0) + 1);
  const mot = {}; hist.filter(h => h.st === 'sem').forEach(h => mot[h.motivo || 'Outro'] = (mot[h.motivo || 'Outro'] || 0) + 1);
  const dias = []; for (let i = 13; i >= 0; i--) dias.push(S.today - i);
  const porDia = dias.map(d => hist.filter(h => msToDay(h.at) === d).length);
  const mx = Math.max(1, ...porDia);
  const bars = (obj, order) => { const ent = (order || Object.keys(obj)).map(k => [k, obj[k] || 0]); const m = Math.max(1, ...ent.map(e => e[1])); return ent.map(([k, v]) => `<div class="bar"><span>${esc(STNOME[k] || k)}</span><div class="track"><i style="width:${v / m * 100}%"></i></div><b class="num">${v}</b></div>`).join(''); };
  const insat = mot['Insatisfeita com atendimento'] || 0;
  return `<div class="head"><div><div class="eyebrow">Acompanhamento</div><h1>Resultados <em>dos contatos</em></h1><p class="sub">Tudo o que a equipe marcou na fila. Esses dados também servem para recalibrar a nota depois.</p></div></div>
  ${demoBanner()}
  ${insat ? `<div class="banner warn"><b>${insat} cliente${insat > 1 ? 's disseram' : ' disse'} que ficou insatisfeita com o atendimento.</b><span>Vale a gestão ligar pessoalmente.</span></div>` : ''}
  <div class="kpis">
    <div class="kpi"><span class="l">Clientes contatadas</span><span class="v num">${contatadas}</span><span class="h">${hist.length} contatos no total</span></div>
    <div class="kpi"><span class="l">Agendaram</span><span class="v num">${agend}</span><span class="h">${contatadas ? Math.round(agend / contatadas * 100) + '% das contatadas' : '—'}</span></div>
    <div class="kpi"><span class="l">Voltaram ao salão</span><span class="v num">${voltaram}</span><span class="h">visita registrada na base após o contato</span></div>
    <div class="kpi"><span class="l">Retornos combinados</span><span class="v num">${all.filter(s => s.st === 'retornar').length}</span><span class="h">aguardando a data</span></div>
  </div>
  ${hist.length ? `<div class="grid2">
    <section class="card"><h2>Contatos por dia</h2><p class="sub">Últimos 14 dias</p><div class="cols" role="img" aria-label="Contatos por dia nos últimos 14 dias">${dias.map((d, i) => `<div class="col"><span class="tip num">${porDia[i]}</span><i style="height:${porDia[i] / mx * 100}%" title="${dayToStr(d)}: ${porDia[i]} contatos"></i><small class="num">${dayToStr(d).slice(0, 2)}</small></div>`).join('')}</div></section>
    <section class="card"><h2>Resultado dos contatos</h2><p class="sub">Todas as marcações</p><div class="bars" style="margin-top:14px">${bars(porSt, ['agendou', 'naoatendeu', 'retornar', 'sem', 'errado'])}</div></section>
    <section class="card"><h2>Por que não quiseram</h2><p class="sub">Motivos de "sem interesse"</p><div class="bars" style="margin-top:14px">${Object.keys(mot).length ? bars(mot, MOTIVOS.filter(m => mot[m])) : '<span class="sub">Nenhum registro ainda.</span>'}</div></section>
  </div>` : `<div class="card empty"><b>Nenhum contato registrado ainda</b>Assim que a equipe marcar os resultados na fila, os números aparecem aqui.</div>`}`;
}

function renderAjustes() {
  const bi = S.baseInfo;
  return `<div class="head"><div><div class="eyebrow">Configuração</div><h1>Base e <em>ajustes</em></h1><p class="sub">${S.papel === 'admin' ? 'Suba a exportação do Avec sempre que quiser atualizar a fila.' : 'A base e os ajustes do salão são mantidos pelos administradores.'}</p></div></div>
  <section class="card"><h2>Base de clientes</h2>
    <p class="sub">${S.demo ? 'Nenhuma planilha carregada ainda.' : `Arquivo <b>${esc(bi.nome)}</b>, carregado em ${new Date(bi.at).toLocaleString('pt-BR')}: ${bi.rows.toLocaleString('pt-BR')} serviços, ${S.base.clients.length.toLocaleString('pt-BR')} clientes, atendimentos até ${dayToStr(S.base.maxDay)}.`}</p>
    ${S.papel === 'admin' ? `<div class="drop" id="drop" style="margin-top:14px"><b>Arraste a planilha aqui</b><span class="sub">Relatório de serviços do Avec (.xlsx) com Profissional, Data Comanda, Serviço, Categoria, Cliente, Celular e Total</span><label class="btn primary" for="fFile">Escolher arquivo</label><input type="file" id="fFile" accept=".xlsx,.xls,.csv" hidden></div>
    <p class="note">A planilha é lida no seu navegador e a base processada fica guardada no banco do salão. Toda a equipe passa a ver a nova base na hora.</p>` : ''}
  </section>
  <section class="card"><h2>Ajustes da equipe</h2>
    <div class="form-grid" style="margin-top:14px">
      <div class="field"><label for="cSalao">Nome do salão (usado nas mensagens)</label><input class="input" id="cSalao" value="${esc(S.cfg.salao)}" ${S.papel === 'admin' ? '' : 'disabled'}></div>
      <div class="field"><label for="cAtend">Seu nome nas mensagens</label><input class="input" id="cAtend" value="${esc(S.atendente || S.membroNome)}" placeholder="Ex.: Larissa"></div>
      <div class="field"><label for="cMeta">Meta de contatos por dia</label><input class="input" type="number" min="1" id="cMeta" value="${esc(S.cfg.meta)}" ${S.papel === 'admin' ? '' : 'disabled'}></div>
      <div class="field"><label for="cOferta">Oferta para clientes atrasadas ou sumidas (opcional)</label><input class="input" id="cOferta" value="${esc(S.cfg.oferta)}" placeholder="Ex.: a hidratação sai por nossa conta" ${S.papel === 'admin' ? '' : 'disabled'}></div>
    </div>
    <div style="margin-top:14px"><button class="btn primary" id="bSaveCfg">Salvar ajustes</button></div>
  </section>
  <section class="card"><h2>Como a fila funciona</h2>
    <div class="legend" style="margin-top:12px">
      <div><b>Nota de 0 a 100:</b> momento do ciclo (até 35), fidelidade (25), tempo sumida (15), valor por ano (15), regularidade (10) e bônus de química vencida (5).</div>
      <div><b>Uma fila só:</b> todas as clientes com serviço vencido entram, ordenadas pela nota (prioridade alta 60+, média 40 a 59, baixa abaixo de 40). Retornos combinados para o dia ficam sempre no topo. Os filtros de setor, tipo de serviço, profissional e ticket só recortam essa fila.</div>
      <div><b>Quem entra:</b> clientes com algum serviço habitual (feito 2 vezes ou mais, ou cliente nova) vencido ou perto de vencer. Ficam de fora: quem está em dia, quem sumiu há mais de 3 anos, quem só fez serviços sem ciclo (maquiagem, penteado) e quem só fez serviços uma única vez. Todas aparecem em "Lista completa › Base inteira".</div>
      <div><b>Agendou:</b> sai da fila por 60 dias. <b>Sem interesse:</b> 90 dias. <b>Não atendeu:</b> volta em 3 dias; depois de 3 tentativas, sai por 60 dias. <b>Retornar em:</b> some até a data e aparece no topo no dia. <b>Número errado:</b> sai de vez.</div>
      <div><b>Se a cliente voltar ao salão</b> depois do contato (aparece na próxima planilha), a marcação é encerrada e ela segue o ciclo normal.</div>
    </div>
  </section>`;
}

/* ===== Eventos ===== */
function bindView() {
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  document.querySelectorAll('[data-lista]').forEach(b => b.onclick = () => { S.lista = b.dataset.lista; S.listLimit = 100; render(); });
  const setF = (k, v) => { S.f[k] = v; if (k === 'setor') S.f.tipo = ''; S.cur = null; S.listLimit = 100; rebuildQueue(); render(); };
  [['fSetor', 'setor'], ['fTipo', 'tipo'], ['fProf', 'prof'], ['fTicket', 'ticket']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.onchange = () => setF(k, el.value); });
  const bl = $('#bLimpar'); if (bl) bl.onclick = () => { S.f = { setor: '', tipo: '', prof: '', ticket: '' }; S.cur = null; rebuildQueue(); render(); };
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; render(); });
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const a = b.dataset.act; if (a === 'naoatendeu' || a === 'errado') registrar(a, {}); else { S.open = S.open === a ? null : a; render(); } });
  document.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => {
    const a = b.dataset.confirm; const extra = { obs: ($('#fObs') || {}).value || '' };
    if (a === 'agendou') extra.agDia = $('#fAgDia').value || '';
    if (a === 'sem') extra.motivo = $('#fMotivo').value;
    if (a === 'retornar') { extra.ate = $('#fAte').value; if (!isoToDay(extra.ate)) { toast('Escolha a data para ligar de novo.'); return; } }
    registrar(a, extra);
  });
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copiar(b.dataset.copy, 'Número copiado'));
  const cm = $('#bCopyMsg'); if (cm) cm.onclick = () => copiar($('#msgTxt').value, 'Mensagem copiada');
  const mt = $('#msgTxt'), wa = $('#bWa');
  if (mt && wa) mt.oninput = () => { const o = S.byKey.get(S.cur); wa.href = `https://wa.me/${waNumber(o.c.cel)}?text=${encodeURIComponent(mt.value)}`; };
  const bs = $('#bSkip'); if (bs) bs.onclick = () => { S.skipped.add(S.cur); const i = S.queue.findIndex(o => o.c.k === S.cur); const nxt = S.queue[i + 1]; rebuildQueue(); S.cur = nxt ? nxt.c.k : (S.queue[0] || {}).c?.k; S.open = null; render(); };
  const bp = $('#bPrev'); if (bp) bp.onclick = () => { const i = S.queue.findIndex(o => o.c.k === S.cur); if (i > 0) { S.cur = S.queue[i - 1].c.k; S.open = null; render(); } };
  document.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { abrirCliente(r.dataset.open); });
  const fb = $('#fBusca'); if (fb) { fb.oninput = () => { S.busca = fb.value; const pos = fb.selectionStart; render(); const n = $('#fBusca'); n.focus(); n.setSelectionRange(pos, pos); }; }
  const bm = $('#bMore'); if (bm) bm.onclick = () => { S.listLimit += 200; render(); };
  const ff = $('#fFile'); if (ff) ff.onchange = () => ff.files[0] && carregarArquivo(ff.files[0]);
  const dr = $('#drop'); if (dr) { dr.ondragover = e => { e.preventDefault(); dr.classList.add('over'); }; dr.ondragleave = () => dr.classList.remove('over'); dr.ondrop = e => { e.preventDefault(); dr.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) carregarArquivo(f); }; }
  const sc = $('#bSaveCfg'); if (sc) sc.onclick = salvarCfg;
}
function go(v) { S.view = v; S.open = null; render(); window.scrollTo(0, 0); }
function abrirCliente(k) {
  const o = S.byKey.get(k); if (!o) return;
  if (!o.trig) { toast(primeiroNome(o.c.nome) + ' está fora da fila: ' + FASES[o.fase].nome.toLowerCase() + '.'); return; }
  if (!S.queue.find(x => x.c.k === k)) { S.f = { setor: '', tipo: '', prof: '', ticket: '' }; rebuildQueue(); if (!S.queue.find(x => x.c.k === k)) S.queue.unshift(o); }
  S.cur = k; S.open = null; go('fila');
}
async function copiar(txt, ok) {
  try { await navigator.clipboard.writeText(txt); toast(ok); }
  catch (e) { const t = $('#msgTxt'); if (t && txt === t.value) { t.focus(); t.select(); } toast('Não deu para copiar automaticamente. Selecione o texto e copie.'); }
}
let toastTimer;
function toast(msg, undo) {
  clearTimeout(toastTimer);
  $('#toastHost').innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? '<button class="btn" id="bUndo" style="padding:6px 12px">Desfazer</button>' : ''}</div>`;
  if (undo) $('#bUndo').onclick = () => { undo(); $('#toastHost').innerHTML = ''; };
  toastTimer = setTimeout(() => $('#toastHost').innerHTML = '', undo ? 7000 : 3000);
}

/* ===== Gravação das marcações (Supabase) ===== */
async function gravar(id, data) {
  if (data) S.st.set(id, data); else S.st.delete(id);
  if (S.demo || !S.sb) return true;
  const q = data
    ? S.sb.from('contatos').upsert({ salao_id: S.salao, cliente_id: id, st: data.st, dados: data, atualizado_em: new Date().toISOString(), atualizado_por: S.user.id })
    : S.sb.from('contatos').delete().eq('salao_id', S.salao).eq('cliente_id', id);
  const { error } = await q;
  if (error) { toast('Não foi possível salvar: ' + traduzErro(error)); return false; }
  return true;
}
function traduzErro(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/row-level security|permission/i.test(m)) return 'você não tem permissão para isso.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'sem conexão com a internet.';
  if (/Invalid login credentials/i.test(m)) return 'e-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'o e-mail ainda não foi confirmado.';
  return m || 'erro desconhecido.';
}
async function registrar(st, extra) {
  const o = S.byKey.get(S.cur); if (!o) return;
  const id = docId(o.c.k); const prev = S.st.get(id) || null; const now = Date.now();
  const ativo = contatoAtivo(o);
  const tent = st === 'naoatendeu' ? ((ativo && ativo.st === 'naoatendeu' && (ativo.tent || 1) < 3) ? (ativo.tent || 1) + 1 : 1) : 0;
  const h = { st, at: now, ...(extra.obs ? { obs: extra.obs.slice(0, 300) } : {}), ...(extra.motivo ? { motivo: extra.motivo } : {}), ...(st === 'naoatendeu' ? { tent } : {}), ...(S.atendente ? { por: S.atendente.slice(0, 40) } : {}), nota: o.score, fase: o.fase };
  const doc = { st, at: now, first: prev && prev.first ? prev.first : now, tent, ate: extra.ate || '', agDia: extra.agDia || '', motivo: extra.motivo || '', obs: (extra.obs || '').slice(0, 300), hist: [...((prev && prev.hist) || []), h].slice(-20) };
  const i = S.queue.findIndex(x => x.c.k === o.c.k); const nxt = S.queue[i + 1];
  S.open = null;
  const ok = await gravar(id, doc); if (!ok) { if (prev) S.st.set(id, prev); else S.st.delete(id); return; }
  rebuildQueue(); S.cur = nxt && S.queue.find(x => x.c.k === nxt.c.k) ? nxt.c.k : (S.queue[0] ? S.queue[0].c.k : null);
  render();
  const txt = { agendou: 'Agendamento registrado', sem: 'Registrado: sem interesse', naoatendeu: `Não atendeu (tentativa ${tent} de 3)`, retornar: 'Retorno marcado para ' + dayToStr(isoToDay(extra.ate)), errado: 'Número marcado como errado' }[st];
  toast(txt + ' · ' + primeiroNome(o.c.nome), async () => { await gravar(id, prev); rebuildQueue(); S.cur = o.c.k; render(); });
}

/* ===== Planilha (só administradores) ===== */
function busy(txt, sub) { $('#toastHost').innerHTML = `<div class="busy"><div><b>${esc(txt)}</b><p class="sub">${esc(sub || '')}</p></div></div>`; }
function carregarArquivo(file) {
  if (S.papel !== 'admin') { toast('Só administradores podem carregar a planilha.'); return; }
  if (typeof XLSX === 'undefined') { toast('O leitor de planilhas não carregou. Recarregue a página.'); return; }
  busy('Lendo a planilha…', 'Isso leva alguns segundos.');
  const rd = new FileReader();
  rd.onload = () => setTimeout(async () => {
    try {
      const wb = XLSX.read(new Uint8Array(rd.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' });
      if (!rows.length) throw new Error('A planilha está vazia.');
      const base = buildBase(rows);
      if (!base.clients.length) throw new Error('Não encontrei clientes com data de comanda na planilha.');
      const versao = Date.now();
      // grava em lotes; linhas antigas só são apagadas depois que a nova carga terminou
      const LOTE = 400;
      for (let i = 0; i < base.clients.length; i += LOTE) {
        busy('Enviando a base para o banco…', `${Math.min(i + LOTE, base.clients.length).toLocaleString('pt-BR')} de ${base.clients.length.toLocaleString('pt-BR')} clientes`);
        const lote = base.clients.slice(i, i + LOTE).map(c => ({ salao_id: S.salao, chave: c.k, dados: c, versao }));
        const { error } = await S.sb.from('base_clientes').upsert(lote);
        if (error) throw new Error('Falha ao enviar a base: ' + traduzErro(error));
      }
      const { error: e2 } = await S.sb.from('base_clientes').delete().eq('salao_id', S.salao).neq('versao', versao);
      if (e2) throw new Error('Falha ao limpar a base antiga: ' + traduzErro(e2));
      const meta = { salao_id: S.salao, arquivo: file.name, linhas: rows.length, clientes: base.clients.length, max_day: base.maxDay, profs: base.profs, versao, carregado_em: new Date().toISOString(), carregado_por: S.user.id };
      const { error: e3 } = await S.sb.from('base_meta').upsert(meta);
      if (e3) throw new Error('Falha ao registrar a carga: ' + traduzErro(e3));
      S.versaoBase = versao;
      usarBase(base, { nome: file.name, at: Date.now(), rows: rows.length });
      await idbSet('base:' + S.salao, { versao, base, info: S.baseInfo });
      S.view = 'fila'; $('#toastHost').innerHTML = ''; render();
      toast(`Base carregada: ${base.clients.length.toLocaleString('pt-BR')} clientes, ${S.queue.length.toLocaleString('pt-BR')} na fila.`);
    } catch (e) { $('#toastHost').innerHTML = ''; toast(e.message || 'Não consegui ler esse arquivo. Confira se é a exportação do Avec em .xlsx.'); }
  }, 30);
  rd.onerror = () => { $('#toastHost').innerHTML = ''; toast('Não consegui abrir o arquivo.'); };
  rd.readAsArrayBuffer(file);
}
function usarBase(base, info) {
  S.base = base; S.baseInfo = info; S.demo = !base.clients.length;
  S.skipped.clear(); S.cur = null; recompute();
}
async function salvarCfg() {
  S.atendente = $('#cAtend').value.trim(); ls.set('atendente:' + S.user.id, S.atendente);
  if (S.papel === 'admin') {
    const cfg = { salao: $('#cSalao').value.trim() || 'o salão', meta: Math.max(1, parseInt($('#cMeta').value, 10) || 50), oferta: $('#cOferta').value.trim() };
    const { error } = await S.sb.from('config').upsert({ salao_id: S.salao, salao_nome: cfg.salao, meta: cfg.meta, oferta: cfg.oferta });
    if (error) { toast('Não foi possível salvar: ' + traduzErro(error)); return; }
    S.cfg = cfg;
  }
  toast('Ajustes salvos'); render();
}

/* ===== Supabase: leitura, tempo real e login ===== */
async function lerTudo(tabela, colunas) {
  const out = []; const PAG = 1000;
  for (let de = 0; ; de += PAG) {
    const { data, error } = await S.sb.from(tabela).select(colunas).eq('salao_id', S.salao).range(de, de + PAG - 1);
    if (error) throw error;
    out.push(...data); if (data.length < PAG) break;
  }
  return out;
}
async function carregarBase() {
  const { data: meta, error } = await S.sb.from('base_meta').select('*').eq('salao_id', S.salao).maybeSingle();
  if (error) throw error;
  if (!meta) { S.versaoBase = 0; usarBase({ clients: [], profs: {}, maxDay: todayDay(), rows: 0 }, null); return; }
  if (meta.versao === S.versaoBase) return;
  const cache = await idbGet('base:' + S.salao);
  if (cache && cache.versao === meta.versao) { S.versaoBase = meta.versao; usarBase(cache.base, cache.info); return; }
  busy('Baixando a base de clientes…', `${(meta.clientes || 0).toLocaleString('pt-BR')} clientes`);
  const linhas = await lerTudo('base_clientes', 'dados');
  const base = { clients: linhas.map(l => l.dados), profs: meta.profs || {}, maxDay: meta.max_day, rows: meta.linhas };
  const info = { nome: meta.arquivo, at: Date.parse(meta.carregado_em), rows: meta.linhas };
  S.versaoBase = meta.versao; usarBase(base, info);
  await idbSet('base:' + S.salao, { versao: meta.versao, base, info });
  $('#toastHost').innerHTML = '';
}
async function carregarContatos() {
  const linhas = await lerTudo('contatos', 'cliente_id,st,dados');
  S.st = new Map(linhas.map(l => [l.cliente_id, { ...l.dados, st: l.st }]));
}
async function carregarConfig() {
  const { data } = await S.sb.from('config').select('*').eq('salao_id', S.salao).maybeSingle();
  if (data) S.cfg = { salao: data.salao_nome || S.salaoNome || 'o salão', meta: data.meta || 50, oferta: data.oferta || '' };
  else S.cfg = { salao: S.salaoNome || 'o salão', meta: 50, oferta: '' };
}
function digitando() { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName); }
function assinarTempoReal() {
  const f = `salao_id=eq.${S.salao}`;
  S.canal = S.sb.channel('salao-' + S.salao)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contatos', filter: f }, p => {
      if (p.eventType === 'DELETE') { const id = p.old && p.old.cliente_id; if (id) S.st.delete(id); }
      else S.st.set(p.new.cliente_id, { ...p.new.dados, st: p.new.st });
      rebuildQueue(); if (!digitando()) render();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'base_meta', filter: f }, async p => {
      if (p.new && p.new.versao && p.new.versao !== S.versaoBase) { toast('Uma nova base foi carregada. Atualizando…'); try { await carregarBase(); render(); } catch (e) { toast('Não consegui baixar a nova base: ' + traduzErro(e)); } }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config', filter: f }, p => {
      if (p.new) { S.cfg = { salao: p.new.salao_nome, meta: p.new.meta, oferta: p.new.oferta }; if (S.view !== 'ajustes') render(); }
    })
    .subscribe(status => {
      const ok = status === 'SUBSCRIBED';
      $('#syncDot').className = 'dot' + (ok ? ' on' : '');
      $('#syncTxt').textContent = ok ? 'Conectado, em tempo real' : 'Reconectando…';
    });
}
const comPrazo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('A conexão demorou demais. Recarregue a página e tente de novo.')), ms))]);
function telaLogin(msg, semAcesso) {
  $('#app').hidden = true; $('#login').hidden = false;
  $('#loginMsg').textContent = msg || ''; $('#loginMsg').hidden = !msg;
  // logado, mas sem salão: em vez do formulário, oferece tentar de novo ou sair
  $('#loginForm').hidden = !!semAcesso;
  $('#semAcesso').hidden = !semAcesso;
}
async function entrarNoSistema(session) {
  S.user = session.user;
  const { data: mb, error } = await S.sb.from('membros').select('salao_id,nome,papel,saloes(nome)').eq('user_id', S.user.id);
  if (error) { telaLogin('Não consegui verificar seu acesso: ' + traduzErro(error)); return; }
  if (!mb || !mb.length) { telaLogin('Seu usuário (' + (S.user.email || '') + ') ainda não tem acesso a nenhum salão. Peça a um administrador para liberar e clique em "Tentar de novo".', true); return; }
  const m = mb[0];
  S.salao = m.salao_id; S.papel = m.papel; S.membroNome = m.nome || ''; S.salaoNome = (m.saloes && m.saloes.nome) || '';
  S.atendente = ls.get('atendente:' + S.user.id, '');
  $('#login').hidden = true; $('#app').hidden = false;
  try {
    await carregarConfig();
    await carregarContatos();
    await carregarBase();
  } catch (e) { $('#toastHost').innerHTML = ''; toast('Erro ao carregar os dados: ' + traduzErro(e)); }
  render();
  if (!S.canal) assinarTempoReal();
}

/* ===== Início ===== */
(async function boot() {
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
  const cfgOk = window.FOLLOWUP_CONFIG && window.FOLLOWUP_CONFIG.supabaseUrl && window.FOLLOWUP_CONFIG.supabaseAnonKey;
  if (!cfgOk || !window.supabase) { telaLogin('O sistema ainda não foi configurado: faltam as chaves do Supabase (veja o README).'); $('#loginForm').hidden = true; return; }
  S.sb = window.supabase.createClient(window.FOLLOWUP_CONFIG.supabaseUrl, window.FOLLOWUP_CONFIG.supabaseAnonKey);
  S.base = { clients: [], profs: {}, maxDay: todayDay(), rows: 0 }; S.demo = true; recompute();
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Entrando…';
    let res;
    try { res = await comPrazo(S.sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value }), 20000); }
    catch (err) { res = { error: err }; }
    btn.disabled = false; btn.textContent = 'Entrar';
    if (res.error) { $('#loginMsg').textContent = 'Não foi possível entrar: ' + traduzErro(res.error); $('#loginMsg').hidden = false; return; }
    entrarNoSistema(res.data.session);
  };
  const sair = async () => { try { await comPrazo(S.sb.auth.signOut(), 8000); } catch (e) {} location.reload(); };
  $('#bSair').onclick = sair; $('#bSair2').onclick = sair;
  $('#bTentar').onclick = () => location.reload();
  let data = {};
  try { ({ data } = await comPrazo(S.sb.auth.getSession(), 15000)); } catch (e) { telaLogin(e.message); return; }
  if (data.session) entrarNoSistema(data.session); else telaLogin();
})();
