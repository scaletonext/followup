/* ===== Estado ===== */
const S = {
  base: null, demo: true, baseInfo: null, scored: [], byKey: new Map(),
  st: new Map(), // docId -> contato
  cfg: { salao: 'Visual Up', meta: 50, oferta: '' },
  atendente: '', sb: null, user: null, salao: null, papel: '', membroNome: '', view: 'fila', lista: 'fila', rf: { periodo: '7', de: '', ate: '', por: '', setor: '', tipo: '' }, f: { setor: '', tipo: '', prof: '', ticket: '' }, busca: '', listLimit: 100, servicos: [], pick: [], pkIdx: 0, mk: { tab: 'agendou', busca: '', ed: null }, svc: { busca: '', todos: false, lim: 80 },
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
const fmtBRLc = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: (+v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const r2 = v => Math.round((+v || 0) * 100) / 100;
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
    if (s.st === 'mensagem' && dias < 3) return 'oculta';      // espera 3 dias pela resposta
    if (s.st === 'javeio' && dias < 60) return 'oculta';       // some até a planilha mostrar a visita
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
  S.byDoc = new Map(S.scored.map(o => [docId(o.c.k), o]));
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
  const v = { fila: renderFila, lista: renderLista, marcacoes: renderMarcacoes, resultados: renderResultados, ajustes: renderAjustes }[S.view];
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
  if (s && s.st === 'mensagem') { const dd = Math.floor((Date.now() - s.at) / DAY); p.push(['warn', `Mensagem enviada há ${dd} dia${dd === 1 ? '' : 's'}, sem resposta`]); }
  if (s && s.st === 'javeio') p.push(['muted', 'Marcada como "já veio", mas a visita não apareceu na planilha']);
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
const STNOME = { agendou: 'Agendou', mensagem: 'Mensagem enviada', javeio: 'Já veio', sem: 'Sem interesse', naoatendeu: 'Não atendeu', retornar: 'Retornar em', errado: 'Número errado' };
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
        <button class="act info" data-act="mensagem"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>Mensagem enviada</button>
        <button class="act good" data-act="javeio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>Já veio</button>
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
  if (S.open === 'agendou') { const o = S.byKey.get(S.cur); return `<div class="act-form">${pickerHtml(o && o.trig ? o.trig.fam : '')}<div class="field"><label for="fAgDia">Dia agendado (opcional)</label><input class="input" type="date" id="fAgDia"></div><div class="field" style="flex:2 1 200px"><label for="fObs">Observação</label><input class="input" id="fObs" placeholder="Ex.: com a Carol, às 15h"></div><button class="btn primary" data-confirm="agendou">Confirmar agendamento</button></div>`; }
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

/* ===== Serviços: busca incremental para o agendamento ===== */
function prepServicos(lista) {
  S.servicos = lista.map(x => ({ ...x, preco: +x.preco || 0, _n: norm(x.nome + ' ' + (FAMMETA[x.fam] ? FAMMETA[x.fam].nome : '')) }))
    .sort((a, b) => (b.ativo - a.ativo) || (b.vezes - a.vezes) || a.nome.localeCompare(b.nome));
}
function buscaServicos(q) {
  const t = norm(q).split(' ').filter(Boolean); if (!t.length) return [];
  const ja = new Set(S.pick.map(x => norm(x.n)));
  return S.servicos.filter(s => !ja.has(norm(s.nome)) && t.every(w => s._n.includes(w)))
    .sort((a, b) => (b.ativo - a.ativo) || (norm(b.nome).startsWith(t[0]) - norm(a.nome).startsWith(t[0])) || (b.vezes - a.vezes)).slice(0, 8);
}
function vendaDoPicker() {
  const servicos = S.pick.map(x => ({ n: x.n, p: r2(x.p) }));
  return servicos.length ? { servicos, valor: r2(servicos.reduce((s, x) => s + x.p, 0)) } : {};
}
function pickerHtml(famSug) {
  const sug = famSug ? S.servicos.filter(s => s.fam === famSug && s.ativo && !S.pick.some(p => norm(p.n) === norm(s.nome))).slice(0, 4) : [];
  return `<div class="field pk-field"><label for="pkIn">Serviços agendados</label>
    <div class="pk-box"><input class="input" id="pkIn" placeholder="${S.servicos.length ? 'Digite para buscar: escova, pé e mão, luzes…' : 'Digite o nome do serviço'}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="pkList" aria-autocomplete="list"><div class="pk-list" id="pkList" role="listbox" hidden></div></div>
    ${sug.length ? `<div class="pk-sug"><span>Sugestões:</span>${sug.map(s => `<button type="button" class="chip" data-pkadd="${esc(s.nome)}">${esc(s.nome)} <span class="c num">${fmtBRLc(s.preco)}</span></button>`).join('')}</div>` : ''}
    <div class="pk-sel" id="pkSel">${pickSelHtml()}</div></div>`;
}
function pickSelHtml() {
  if (!S.pick.length) return '<span class="pk-vazio">Nenhum serviço escolhido. Sem serviço, o dashboard usa o ticket médio como estimativa.</span>';
  const tot = S.pick.reduce((s, x) => s + (+x.p || 0), 0);
  return S.pick.map((x, i) => `<div class="pk-item"><span>${esc(x.n)}</span><label class="pk-preco">R$<input class="input num" type="number" min="0" step="0.01" inputmode="decimal" data-pkp="${i}" value="${x.p}" aria-label="Preço de ${esc(x.n)}"></label><button type="button" class="pk-x" data-pkx="${i}" aria-label="Tirar ${esc(x.n)}">×</button></div>`).join('')
    + `<div class="pk-tot"><span>Valor da venda</span><b class="num" id="pkTot">${fmtBRLc(tot)}</b></div>`;
}
function bindPicker() {
  const inp = $('#pkIn'), list = $('#pkList'), sel = $('#pkSel'); if (!inp) return;
  let achados = [];
  const add = (n, p) => { S.pick.push({ n, p: r2(p) }); inp.value = ''; fechar(); sel.innerHTML = pickSelHtml(); const sg = document.querySelector(`.pk-sug [data-pkadd="${CSS.escape(n)}"]`); if (sg) sg.remove(); inp.focus(); };
  const fechar = () => { list.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const desenhar = () => {
    const q = inp.value.trim(); achados = buscaServicos(q);
    if (!q) { fechar(); return; }
    S.pkIdx = Math.min(S.pkIdx, achados.length);
    list.innerHTML = achados.map((s, i) => `<div class="pk-op" role="option" data-i="${i}" aria-selected="${i === S.pkIdx}"><div><b>${esc(s.nome)}</b><small>${esc(FAMMETA[s.fam] ? SETORES[FAMMETA[s.fam].g] || 'Outros' : 'Outros')} · ${s.ativo ? s.vezes + ' vendas no último ano' : 'sem venda no último ano'}</small></div><span class="num">${fmtBRLc(s.preco)}</span></div>`).join('')
      + `<div class="pk-op avulso" role="option" data-i="${achados.length}" aria-selected="${S.pkIdx === achados.length}"><div><b>Usar "${esc(q)}"</b><small>serviço fora da lista; digite o preço depois</small></div></div>`;
    list.hidden = false; inp.setAttribute('aria-expanded', 'true');
  };
  const escolher = i => { if (i < achados.length) add(achados[i].nome, achados[i].preco); else if (inp.value.trim()) add(inp.value.trim().slice(0, 80), 0); };
  inp.oninput = () => { S.pkIdx = 0; desenhar(); };
  inp.onfocus = () => { if (inp.value.trim()) desenhar(); };
  inp.onblur = () => setTimeout(fechar, 150);
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); S.pkIdx = Math.min(achados.length, S.pkIdx + 1); desenhar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.pkIdx = Math.max(0, S.pkIdx - 1); desenhar(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!list.hidden) escolher(S.pkIdx); }
    else if (e.key === 'Escape') fechar();
    else if (e.key === 'Backspace' && !inp.value && S.pick.length) { S.pick.pop(); sel.innerHTML = pickSelHtml(); }
  };
  list.onmousedown = e => { e.preventDefault(); const op = e.target.closest('.pk-op'); if (op) escolher(+op.dataset.i); };
  document.querySelectorAll('[data-pkadd]').forEach(b => b.onclick = () => { const s = S.servicos.find(x => x.nome === b.dataset.pkadd); if (s) add(s.nome, s.preco); });
  sel.oninput = e => { const i = e.target.dataset.pkp; if (i == null) return; S.pick[+i].p = r2(e.target.value); $('#pkTot').textContent = fmtBRLc(S.pick.reduce((s, x) => s + (+x.p || 0), 0)); };
  sel.onclick = e => { const b = e.target.closest('[data-pkx]'); if (!b) return; S.pick.splice(+b.dataset.pkx, 1); sel.innerHTML = pickSelHtml(); };
}

/* ===== Marcações: cada lead por situação, com edição individual ===== */
const MK_ORD = ['agendou', 'mensagem', 'errado', 'retornar', 'naoatendeu', 'sem', 'javeio'];
const MK_NOME = { agendou: 'Agendados', mensagem: 'Mensagens enviadas', errado: 'Número errado', retornar: 'Retornar em', naoatendeu: 'Não atendeu', sem: 'Sem interesse', javeio: 'Já veio' };
function linhasMarcacao() {
  const out = [];
  for (const [id, s] of S.st) {
    const o = S.byDoc && S.byDoc.get(id);
    const voltou = o && o.ult > msToDay(s.at) ? o.ult : null;
    out.push({ id, s, o, nome: o ? o.c.nome : 'Cliente fora da base atual', cel: o ? o.c.cel : '', voltou });
  }
  return out;
}
function detalheMarcacao(s) {
  if (s.st === 'agendou') return (s.servicos && s.servicos.length ? `<b>${esc(s.servicos.map(x => x.n).join(' + '))}</b><small class="num">${fmtBRLc(s.valor || 0)}${s.agDia ? ' · dia ' + dayToStr(isoToDay(s.agDia)) : ''}</small>` : `<span class="pill warn">Sem serviço informado</span>${s.agDia ? `<small class="num">dia ${dayToStr(isoToDay(s.agDia))}</small>` : ''}`);
  if (s.st === 'retornar') return `<b class="num">Ligar em ${s.ate ? dayToStr(isoToDay(s.ate)) : '—'}</b>`;
  if (s.st === 'sem') return `<b>${esc(s.motivo || 'Sem motivo')}</b>`;
  if (s.st === 'naoatendeu') return `<b class="num">${s.tent || 1} de 3 tentativas</b>`;
  if (s.st === 'mensagem') { const d = Math.floor((Date.now() - s.at) / DAY); return `<b class="num">há ${d} dia${d === 1 ? '' : 's'}</b><small>${d >= 3 ? 'já voltou para a fila' : 'volta à fila em ' + (3 - d) + ' dia' + (3 - d === 1 ? '' : 's')}</small>`; }
  return '<span style="color:var(--fg3)">—</span>';
}
function edicaoHtml(l) {
  const ed = S.mk.ed, s = l.s, st = ed.st;
  const mudou = st !== s.st;
  const campos = st === 'agendou' ? `${pickerHtml(l.o && l.o.trig ? l.o.trig.fam : '')}<div class="field"><label for="eAgDia">Dia agendado</label><input class="input" type="date" id="eAgDia" value="${esc(ed.agDia || '')}"></div>`
    : st === 'retornar' ? `<div class="field"><label for="eAte">Ligar de novo em</label><input class="input" type="date" id="eAte" value="${esc(ed.ate || dayToIso(S.today + 7))}"></div>`
    : st === 'sem' ? `<div class="field"><label for="eMotivo">Motivo</label><select class="input" id="eMotivo">${MOTIVOS.map(m => `<option ${m === ed.motivo ? 'selected' : ''}>${m}</option>`).join('')}</select></div>` : '';
  return `<tr class="ed-row"><td colspan="6"><div class="act-form ed-form">
    <div class="field"><label for="eSt">Situação</label><select class="input" id="eSt">${MK_ORD.map(k => `<option value="${k}" ${k === st ? 'selected' : ''}>${STNOME[k]}</option>`).join('')}</select></div>
    ${campos}
    <div class="field" style="flex:2 1 220px"><label for="eObs">Observação</label><input class="input" id="eObs" value="${esc(ed.obs || '')}"></div>
    ${mudou ? `<div class="ed-modo" role="radiogroup" aria-label="Tipo de mudança">
      <label><input type="radio" name="eModo" value="novo" ${ed.modo !== 'corrigir' ? 'checked' : ''}> <span><b>Novidade</b> · ela respondeu, remarcou ou mudou de ideia (conta hoje nos resultados)</span></label>
      <label><input type="radio" name="eModo" value="corrigir" ${ed.modo === 'corrigir' ? 'checked' : ''}> <span><b>Correção</b> · a marcação foi feita errada (troca o registro de ${new Date(s.at).toLocaleDateString('pt-BR')})</span></label></div>` : ''}
    <div class="ed-bts"><button class="btn primary" id="eSalvar">Salvar</button><button class="btn ghost" id="eCancelar">Cancelar</button><span class="spacer"></span>${l.o && l.o.trig ? '<button class="btn ghost" id="eFila">Abrir na fila</button>' : ''}<button class="btn ghost danger" id="eRemover">Tirar marcação</button></div>
  </div></td></tr>`;
}
function renderMarcacoes() {
  const todas = linhasMarcacao(); const mk = S.mk;
  const cnt = {}; MK_ORD.forEach(k => cnt[k] = 0); todas.forEach(l => cnt[l.s.st] = (cnt[l.s.st] || 0) + 1);
  const q = norm(mk.busca), qd = mk.busca.replace(/\D/g, '');
  let rows = todas.filter(l => l.s.st === mk.tab && (!q || norm(l.nome).includes(q) || (qd && (l.cel || '').includes(qd))));
  rows.sort((a, b) => mk.tab === 'retornar' ? (isoToDay(a.s.ate) || 0) - (isoToDay(b.s.ate) || 0) : b.s.at - a.s.at);
  const resumo = mk.tab === 'agendou' ? (() => { const com = rows.filter(l => l.s.servicos && l.s.servicos.length); const v = com.reduce((s, l) => s + (+l.s.valor || 0), 0); return `<p class="sub" style="margin:0 0 10px">${rows.length} agendamento${rows.length === 1 ? '' : 's'} · <b>${fmtBRLc(v)}</b> em serviços informados${rows.length - com.length ? ` · ${rows.length - com.length} sem serviço (clique em Editar para completar)` : ''}</p>`; })() : '';
  const head = `<div class="head"><div><div class="eyebrow">Acompanhamento</div><h1>Marcações <em>por situação</em></h1><p class="sub">Todas as clientes já marcadas. Abra uma linha para mudar a situação, completar os serviços do agendamento ou tirar a marcação.</p></div>
    <input class="input" id="mBusca" style="max-width:280px" placeholder="Buscar por nome ou celular" value="${esc(mk.busca)}" aria-label="Buscar marcação"></div>
    <div class="filters" role="tablist" aria-label="Situação">${MK_ORD.map(k => `<button class="chip" role="tab" data-mktab="${k}" aria-pressed="${mk.tab === k}" aria-selected="${mk.tab === k}">${MK_NOME[k]}<span class="c num">${cnt[k] || 0}</span></button>`).join('')}</div>`;
  if (!rows.length) return head + `<div class="card empty"><b>${mk.busca ? 'Ninguém encontrado' : 'Nenhuma cliente em "' + MK_NOME[mk.tab] + '"'}</b>${mk.busca ? 'Confira o nome ou limpe a busca.' : 'Quando a equipe marcar esse resultado na fila, a cliente aparece aqui.'}</div>`;
  return head + resumo + `<div class="table-wrap"><table class="mk"><thead><tr><th>Cliente</th><th>Marcado em</th><th>${mk.tab === 'agendou' ? 'Serviços e valor' : 'Detalhe'}</th><th>Observação</th><th>Quem marcou</th><th></th></tr></thead><tbody>
    ${rows.map(l => { const ult = (l.s.hist || [])[l.s.hist.length - 1] || {}; const aberto = mk.ed && mk.ed.id === l.id;
      return `<tr class="${aberto ? 'aberto' : ''}"><td><b>${esc(l.nome)}</b><small class="num">${l.cel ? esc(fmtPhone(l.cel)) : 'sem celular'}</small>${l.voltou ? `<span class="pill good" style="margin-top:4px;display:inline-block">Voltou ao salão em ${dayToStr(l.voltou).slice(0, 5)}</span>` : ''}</td>
        <td class="num">${new Date(l.s.at).toLocaleDateString('pt-BR')}${ult.ed ? '<small>corrigido</small>' : ''}</td><td>${detalheMarcacao(l.s)}</td><td class="obs">${esc(l.s.obs || '')}</td><td>${esc(ult.por || '—')}</td>
        <td class="r"><button class="btn ${aberto ? 'primary' : ''}" data-mked="${esc(l.id)}" aria-expanded="${aberto}">${aberto ? 'Fechar' : 'Editar'}</button></td></tr>${aberto ? edicaoHtml(l) : ''}`; }).join('')}
  </tbody></table></div>`;
}
function bindMarcacoes() {
  document.querySelectorAll('[data-mktab]').forEach(b => b.onclick = () => { S.mk.tab = b.dataset.mktab; S.mk.ed = null; render(); });
  const mb = $('#mBusca'); if (mb) mb.oninput = () => { S.mk.busca = mb.value; const pos = mb.selectionStart; render(); const n = $('#mBusca'); n.focus(); n.setSelectionRange(pos, pos); };
  document.querySelectorAll('[data-mked]').forEach(b => b.onclick = () => {
    const id = b.dataset.mked;
    if (S.mk.ed && S.mk.ed.id === id) { S.mk.ed = null; render(); return; }
    const s = S.st.get(id); if (!s) return;
    S.mk.ed = { id, st: s.st, obs: s.obs || '', agDia: s.agDia || '', ate: s.ate || '', motivo: s.motivo || '', modo: 'novo' };
    S.pick = (s.servicos || []).map(x => ({ n: x.n, p: x.p })); render();
  });
  const ed = S.mk.ed; if (!ed) return;
  const lerCampos = () => { ed.obs = ($('#eObs') || {}).value || ''; if ($('#eAgDia')) ed.agDia = $('#eAgDia').value; if ($('#eAte')) ed.ate = $('#eAte').value; if ($('#eMotivo')) ed.motivo = $('#eMotivo').value; const m = document.querySelector('[name="eModo"]:checked'); if (m) ed.modo = m.value; };
  const es = $('#eSt'); if (es) es.onchange = () => { lerCampos(); ed.st = es.value; render(); };
  const ec = $('#eCancelar'); if (ec) ec.onclick = () => { S.mk.ed = null; render(); };
  const ef = $('#eFila'); if (ef) ef.onclick = () => { const o = S.byDoc.get(ed.id); S.mk.ed = null; if (o) abrirCliente(o.c.k); };
  const er = $('#eRemover'); if (er) er.onclick = async () => {
    const id = ed.id, prev = S.st.get(id); S.mk.ed = null;
    if (!(await gravar(id, null))) { S.st.set(id, prev); return; }
    rebuildQueue(); render();
    toast('Marcação retirada: a cliente segue o ciclo normal da fila', async () => { await gravar(id, prev); rebuildQueue(); render(); });
  };
  const sv = $('#eSalvar'); if (sv) sv.onclick = async () => {
    lerCampos(); const id = ed.id, s = S.st.get(id), o = S.byDoc.get(id) || null;
    if (ed.st === 'retornar' && !isoToDay(ed.ate)) { toast('Escolha a data para ligar de novo.'); return; }
    const extra = { obs: ed.obs, ...(ed.st === 'agendou' ? { agDia: ed.agDia, ...vendaDoPicker() } : {}), ...(ed.st === 'retornar' ? { ate: ed.ate } : {}), ...(ed.st === 'sem' ? { motivo: ed.motivo } : {}) };
    if (ed.st === 'agendou' && !extra.servicos) extra.servicos = [], extra.valor = 0;
    const modo = ed.st === s.st ? 'corrigir' : ed.modo;
    const { prev, doc } = montarDoc(o, id, ed.st, extra, modo);
    if (ed.st === 'agendou' && !doc.servicos.length) { delete doc.servicos; delete doc.valor; const h = doc.hist[doc.hist.length - 1]; delete h.servicos; delete h.valor; }
    S.mk.ed = null; S.pick = [];
    if (!(await gravar(id, doc))) { S.st.set(id, prev); render(); return; }
    rebuildQueue(); if (ed.st !== S.mk.tab) S.mk.tab = ed.st; render();
    toast((ed.st === s.st ? 'Marcação atualizada' : (modo === 'corrigir' ? 'Corrigido para ' : 'Mudou para ') + STNOME[ed.st]) + (o ? ' · ' + primeiroNome(o.c.nome) : ''), async () => { await gravar(id, prev); rebuildQueue(); render(); });
  };
  bindPicker();
}

/* ===== Catálogo de serviços em "Base e ajustes" ===== */
function catalogoHtml() {
  const adm = S.papel === 'admin', c = S.svc, q = norm(c.busca);
  let rows = S.servicos.filter(s => (c.todos || s.ativo) && (!q || s._n.includes(q)));
  if (q) rows.sort((x, y) => norm(y.nome).includes(q) - norm(x.nome).includes(q));
  const total = rows.length; rows = rows.slice(0, c.lim);
  return `<section class="card"><div class="card-head"><div><h2>Serviços e preços</h2><p class="sub">${S.servicos.length ? `${S.servicos.filter(s => s.ativo).length} serviços vendidos no último ano. Preço sugerido = valor mais comum cobrado nos últimos 12 meses da planilha. ${adm ? 'Ajuste o preço quando precisar: o valor que você digitar não é trocado pelas próximas planilhas.' : 'Só administradores mudam os preços.'}` : 'O catálogo aparece depois que um administrador carregar a planilha.'}</p></div></div>
    <div class="filters" style="margin-top:12px"><input class="input" id="sBusca" style="max-width:280px" placeholder="Buscar serviço" value="${esc(c.busca)}" aria-label="Buscar serviço"><button class="chip" id="sTodos" aria-pressed="${c.todos}">Mostrar também os sem venda no último ano</button></div>
    ${adm ? `<div class="act-form" style="margin-top:10px"><div class="field" style="flex:2 1 220px"><label for="sNovoNome">Novo serviço</label><input class="input" id="sNovoNome" placeholder="Nome do serviço"></div><div class="field"><label for="sNovoPreco">Preço (R$)</label><input class="input num" id="sNovoPreco" type="number" min="0" step="0.01"></div><button class="btn" id="sAdd">Adicionar</button></div>` : ''}
    <div class="svc-wrap" style="margin-top:12px"><table class="svc"><thead><tr><th>Serviço</th><th>Setor · tipo</th><th class="r">Vendas no último ano</th><th class="r">Preço</th>${adm ? '<th>Na busca</th>' : ''}</tr></thead><tbody>
    ${rows.map(s => { const fm = FAMMETA[s.fam]; return `<tr><td><b>${esc(s.nome)}</b>${s.editado ? '<small>preço ajustado à mão</small>' : ''}</td><td>${fm ? esc((SETORES[fm.g] || 'Outros') + ' · ' + fm.nome) : 'Outros'}</td><td class="r num">${s.vezes || '—'}</td>
      <td class="r">${adm ? `<input class="input num preco-in" type="number" min="0" step="0.01" data-spreco="${esc(s.nome)}" value="${s.preco}" aria-label="Preço de ${esc(s.nome)}">` : `<b class="num">${fmtBRLc(s.preco)}</b>`}</td>${adm ? `<td><input type="checkbox" data-sativo="${esc(s.nome)}" ${s.ativo ? 'checked' : ''} aria-label="Mostrar ${esc(s.nome)} na busca do agendamento"></td>` : ''}</tr>`; }).join('')}
    </tbody></table></div>
    ${total > c.lim ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="sMore">Mostrar mais (${total - c.lim} restantes)</button></div>` : ''}
  </section>`;
}
async function salvarServico(nome, campos) {
  const s = S.servicos.find(x => x.nome === nome);
  const linha = { salao_id: S.salao, nome, fam: s ? s.fam : famOf(nome, ''), preco: s ? s.preco : 0, vezes: s ? s.vezes : 0, ativo: s ? s.ativo : true, editado: true, atualizado_em: new Date().toISOString(), ...campos };
  const { error } = await S.sb.from('servicos').upsert(linha);
  if (error) { toast('Não foi possível salvar o serviço: ' + traduzErro(error)); return false; }
  const resto = S.servicos.filter(x => x.nome !== nome); prepServicos([...resto, linha]); return true;
}
function bindCatalogo() {
  const sb = $('#sBusca'); if (sb) sb.oninput = () => { S.svc.busca = sb.value; S.svc.lim = 80; const pos = sb.selectionStart; render(); const n = $('#sBusca'); n.focus(); n.setSelectionRange(pos, pos); };
  const st = $('#sTodos'); if (st) st.onclick = () => { S.svc.todos = !S.svc.todos; render(); };
  const sm = $('#sMore'); if (sm) sm.onclick = () => { S.svc.lim += 200; render(); };
  document.querySelectorAll('[data-spreco]').forEach(i => i.onchange = async () => { const v = r2(i.value); if (v < 0) return; if (await salvarServico(i.dataset.spreco, { preco: v })) toast('Preço salvo: ' + i.dataset.spreco + ' · ' + fmtBRLc(v)); });
  document.querySelectorAll('[data-sativo]').forEach(i => i.onchange = async () => { if (await salvarServico(i.dataset.sativo, { ativo: i.checked })) toast(i.checked ? 'Serviço aparece na busca' : 'Serviço escondido da busca (continua no catálogo)'); });
  const sa = $('#sAdd'); if (sa) sa.onclick = async () => {
    const nome = $('#sNovoNome').value.replace(/\s+/g, ' ').trim().slice(0, 80), preco = r2($('#sNovoPreco').value);
    if (!nome) { toast('Digite o nome do serviço.'); return; }
    if (S.servicos.some(x => norm(x.nome) === norm(nome))) { toast('Esse serviço já está no catálogo.'); return; }
    if (await salvarServico(nome, { preco, ativo: true, vezes: 0 })) { S.svc.busca = nome; render(); toast('Serviço adicionado'); }
  };
}
async function sincronizarCatalogo(lista) {
  const editados = new Set(S.servicos.filter(s => s.editado).map(s => norm(s.nome)));
  const agora = new Date().toISOString();
  const livres = lista.filter(s => !editados.has(norm(s.nome))).map(s => ({ salao_id: S.salao, nome: s.nome, fam: s.fam, preco: s.preco, vezes: s.vezes, ativo: s.ativo, atualizado_em: agora }));
  const fixos = lista.filter(s => editados.has(norm(s.nome))).map(s => ({ salao_id: S.salao, nome: S.servicos.find(x => norm(x.nome) === norm(s.nome)).nome, fam: s.fam, vezes: s.vezes, atualizado_em: agora }));
  for (const grupo of [livres, fixos]) for (let i = 0; i < grupo.length; i += 400) {
    const { error } = await S.sb.from('servicos').upsert(grupo.slice(i, i + 400));
    if (error) throw new Error('Falha ao atualizar o catálogo de serviços: ' + traduzErro(error));
  }
  await carregarServicos();
}
async function carregarServicos() {
  try { prepServicos(await lerTudo('servicos', 'nome,fam,preco,vezes,ativo,editado')); }
  catch (e) { S.servicos = S.servicos || []; }
}

/* ===== Resultados: dashboard por dia ===== */
const ST_ORD = ['agendou', 'javeio', 'retornar', 'mensagem', 'naoatendeu', 'sem', 'errado'];
const ST_COR = { agendou: '#5FAF85', javeio: '#9CCFB2', retornar: '#D98FA3', mensagem: '#8FA7D6', naoatendeu: '#E3B25E', sem: '#D46A5F', errado: '#B9AAAE' };
function eventosContato() {
  const out = [];
  for (const [cid, s] of S.st) for (const h of (s.hist || [])) {
    const o = S.byDoc && S.byDoc.get(cid);
    const fam = h.fam || (o && o.trig ? o.trig.fam : '');
    out.push({ ...h, cid, dia: msToDay(h.at), fam, setor: fam && FAMMETA[fam] ? FAMMETA[fam].g : '', tk: h.tk != null ? h.tk : (o && o.trig ? o.trig.tk : 0), por: h.por || 'Sem nome', o });
  }
  return out;
}
function periodoRF() {
  const t = S.today, f = S.rf;
  if (f.periodo === 'hoje') return [t, t];
  if (f.periodo === '30') return [t - 29, t];
  if (f.periodo === 'mes') { const d = new Date(t * DAY); return [Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY), t]; }
  if (f.periodo === 'tudo') return [null, t];
  if (f.periodo === 'custom') { const a = isoToDay(f.de), b = isoToDay(f.ate); return [a != null ? a : t - 6, b != null ? b : t]; }
  return [t - 6, t];
}
function renderResultados() {
  const todos = eventosContato();
  const f = S.rf; let [de, ate] = periodoRF();
  if (de == null) de = todos.length ? Math.min(...todos.map(e => e.dia)) : S.today;
  const ev = todos.filter(e => e.dia >= de && e.dia <= ate && (!f.por || e.por === f.por) && (!f.setor || e.setor === f.setor) && (!f.tipo || e.fam === f.tipo));
  const pessoas = [...new Set(todos.map(e => e.por))].sort();
  const tipos = f.setor ? Object.entries(FAMMETA).filter(([, m]) => m.g === f.setor && !m.semCiclo) : [];
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  const filtros = `<div class="filters" role="group" aria-label="Filtros dos resultados">
    <select class="select" id="rPer" aria-label="Período">${[['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['tudo', 'Desde o início'], ['custom', 'Escolher datas']].map(([k, l]) => opt(k, l, f.periodo === k)).join('')}</select>
    ${f.periodo === 'custom' ? `<input class="select" type="date" id="rDe" value="${esc(f.de || dayToIso(de))}" aria-label="De"><input class="select" type="date" id="rAte" value="${esc(f.ate || dayToIso(ate))}" aria-label="Até">` : ''}
    <select class="select" id="rPor" aria-label="Quem fez o contato">${opt('', 'Toda a equipe', !f.por)}${pessoas.map(p => opt(p, p, f.por === p)).join('')}</select>
    <select class="select" id="rSetor" aria-label="Setor">${opt('', 'Todos os setores', !f.setor)}${Object.entries(SETORES).map(([k, l]) => opt(k, l, f.setor === k)).join('')}</select>
    <select class="select" id="rTipo" aria-label="Tipo de serviço" ${f.setor ? '' : 'disabled'}>${opt('', f.setor ? 'Todos os serviços' : 'Tipo de serviço (escolha o setor)', !f.tipo)}${tipos.map(([k, m]) => opt(k, m.nome, f.tipo === k)).join('')}</select>
    ${(f.por || f.setor || f.tipo || f.periodo !== '7') ? '<button class="btn ghost" id="rLimpar">Limpar filtros</button>' : ''}
  </div>`;
  const head = `<div class="head"><div><div class="eyebrow">Acompanhamento</div><h1>Resultados <em>por dia</em></h1><p class="sub">${dayToStr(de)} a ${dayToStr(ate)} · tudo o que a equipe registrou na fila.</p></div></div>${demoBanner()}${filtros}`;
  if (!ev.length) return head + `<div class="card empty"><b>${todos.length ? 'Nenhum contato com esses filtros' : 'Nenhum contato registrado ainda'}</b>${todos.length ? 'Mude o período ou limpe os filtros.' : 'Assim que a equipe marcar os resultados na fila, os números aparecem aqui.'}</div>`;

  const conta = arr => { const c = { total: arr.length }; ST_ORD.forEach(k => c[k] = 0); arr.forEach(e => c[e.st] = (c[e.st] || 0) + 1); c.clientes = new Set(arr.map(e => e.cid)).size; c.atendeu = c.total - c.naoatendeu - c.errado - c.mensagem; return c; };
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const T = conta(ev);
  const ags = ev.filter(e => e.st === 'agendou');
  const comValor = ags.filter(e => e.valor != null);
  const vendido = comValor.reduce((sm, e) => sm + (+e.valor || 0), 0);
  const semValor = ags.filter(e => e.valor == null), estimado = semValor.reduce((sm, e) => sm + (e.tk || 0), 0);
  const ticketAg = comValor.length ? vendido / comValor.length : 0;
  const nDias = ate - de + 1, diasAtivos = new Set(ev.map(e => e.dia)).size;
  const media = diasAtivos ? T.total / diasAtivos : 0, meta = +S.cfg.meta || 50;
  let voltaram = 0; const vistos = new Set();
  for (const e of ev) { if (vistos.has(e.cid)) continue; vistos.add(e.cid); if (e.o && e.o.ult > e.dia) voltaram++; }
  const insat = ev.filter(e => e.st === 'sem' && e.motivo === 'Insatisfeita com atendimento').length;

  const kpis = `<div class="kpis kpis6">
    <div class="kpi"><span class="l">Contatos</span><span class="v num">${T.total.toLocaleString('pt-BR')}</span><span class="h">${T.clientes.toLocaleString('pt-BR')} clientes diferentes</span></div>
    <div class="kpi"><span class="l">Agendamentos</span><span class="v num">${T.agendou}</span><span class="h">${pct(T.agendou, T.clientes)} das clientes contatadas</span></div>
    <div class="kpi"><span class="l">Falaram com a gente</span><span class="v num">${pct(T.atendeu, T.total)}</span><span class="h">${T.atendeu} de ${T.total} contatos · ${T.mensagem} mensagens sem resposta</span></div>
    <div class="kpi"><span class="l">Média por dia</span><span class="v num">${media.toFixed(media < 10 ? 1 : 0).replace('.', ',')}<small> / ${meta}</small></span><div class="meter"><i style="width:${Math.min(100, media / meta * 100)}%"></i></div></div>
    <div class="kpi"><span class="l">Vendas agendadas</span><span class="v num">${fmtBRL(vendido)}</span><span class="h">${comValor.length ? `${comValor.length} agendamento${comValor.length > 1 ? 's' : ''} com serviços · ticket ${fmtBRL(ticketAg)}` : 'nenhum agendamento com serviços informados'}${semValor.length ? ` · + ${fmtBRL(estimado)} estimado em ${semValor.length} sem serviço` : ''}</span></div>
    <div class="kpi"><span class="l">Voltaram ao salão</span><span class="v num">${voltaram}</span><span class="h">visita na base após o contato</span></div>
  </div>`;

  // gráfico empilhado por dia
  const ini = Math.max(de, ate - 61);
  const dias = []; for (let d = ini; d <= ate; d++) dias.push(d);
  const porDia = new Map(dias.map(d => [d, conta([])]));
  ev.forEach(e => { const c = porDia.get(e.dia); if (c) { c.total++; c[e.st]++; if (e.st === 'agendou' && e.valor != null) c.vendas = (c.vendas || 0) + (+e.valor || 0); } });
  const mx = Math.max(1, ...[...porDia.values()].map(c => c.total));
  const passo = dias.length > 31 ? 7 : dias.length > 14 ? 2 : 1;
  const grafico = `<section class="card"><div class="card-head"><div><h2>Contatos por dia</h2><p class="sub">${dias.length < nDias ? 'Últimos 62 dias do período' : 'Cada barra é um dia, dividida pelo resultado'}</p></div>
      <div class="legenda">${ST_ORD.map(k => `<span><i style="background:${ST_COR[k]}"></i>${STNOME[k]}</span>`).join('')}</div></div>
    <div class="stk-wrap"><div class="stk" role="img" aria-label="Contatos por dia por resultado">${dias.map((d, i) => { const c = porDia.get(d); const tip = `${dayToStr(d)} · ${c.total} contatos` + ST_ORD.filter(k => c[k]).map(k => `<br>${STNOME[k]}: ${c[k]}`).join(''); return `<div class="stk-col" data-tip="${esc(tip)}"><span class="stk-v num">${c.total || ''}</span><div class="stk-bar" style="height:${c.total / mx * 100}%">${ST_ORD.filter(k => c[k]).map(k => `<i style="flex:${c[k]};background:${ST_COR[k]}"></i>`).join('')}</div><small class="num">${i % passo === 0 || i === dias.length - 1 ? dayToStr(d).slice(0, 5) : ''}</small></div>`; }).join('')}</div></div>
  </section>`;

  // tabela por dia
  const linhasDia = [...porDia.entries()].filter(([, c]) => c.total).sort((a, b) => b[0] - a[0]);
  const tabelaDia = `<section class="card"><h2>Dia a dia</h2><p class="sub">Só os dias com contato</p>
    <div class="svc-wrap" style="margin-top:12px"><table class="svc"><thead><tr><th>Dia</th><th class="r">Contatos</th>${ST_ORD.map(k => `<th class="r">${STNOME[k]}</th>`).join('')}<th class="r">Taxa de agend.</th><th class="r">Vendas</th></tr></thead><tbody>
    ${linhasDia.map(([d, c]) => `<tr><td><b>${DIAS[(d + 4) % 7].slice(0, 3)}, ${dayToStr(d).slice(0, 5)}</b></td><td class="r num">${c.total}</td>${ST_ORD.map(k => `<td class="r num">${c[k] || '—'}</td>`).join('')}<td class="r num">${pct(c.agendou, c.total)}</td><td class="r num">${c.vendas ? fmtBRL(c.vendas) : '—'}</td></tr>`).join('')}
    <tr class="tot"><td><b>Total</b></td><td class="r num"><b>${T.total}</b></td>${ST_ORD.map(k => `<td class="r num"><b>${T[k] || '—'}</b></td>`).join('')}<td class="r num"><b>${pct(T.agendou, T.total)}</b></td><td class="r num"><b>${vendido ? fmtBRL(vendido) : '—'}</b></td></tr>
    </tbody></table></div></section>`;

  // quebras: atendente, setor, faixa de nota, motivos
  const grupo = (chave) => { const m = new Map(); ev.forEach(e => { const k = chave(e); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }); return [...m.entries()].map(([k, arr]) => [k, conta(arr)]); };
  const barras = (linhas, rotulo) => { const m = Math.max(1, ...linhas.map(([, c]) => c.total)); return `<div class="bars">${linhas.map(([k, c]) => `<div class="bar2"><span>${esc(rotulo(k))}</span><div class="track2"><i class="t" style="width:${c.total / m * 100}%"></i><i class="a" style="width:${c.agendou / m * 100}%"></i></div><b class="num">${c.agendou}<small>/${c.total}</small></b><em class="num">${pct(c.agendou, c.total)}</em></div>`).join('')}</div>`; };
  const legBar = `<div class="legenda" style="margin-top:8px"><span><i style="background:var(--rosa200)"></i>Contatos</span><span><i style="background:${ST_COR.agendou}"></i>Agendamentos</span></div>`;
  const porPessoa = grupo(e => e.por).sort((a, b) => b[1].total - a[1].total);
  const porSetor = grupo(e => e.setor || '').sort((a, b) => b[1].total - a[1].total);
  const faixa = e => e.nota == null ? '—' : e.nota >= 80 ? '80 a 100' : e.nota >= 60 ? '60 a 79' : e.nota >= 40 ? '40 a 59' : 'abaixo de 40';
  const ordemF = ['80 a 100', '60 a 79', '40 a 59', 'abaixo de 40', '—'];
  const porNota = grupo(faixa).sort((a, b) => ordemF.indexOf(a[0]) - ordemF.indexOf(b[0]));
  const mot = {}; ev.filter(e => e.st === 'sem').forEach(e => mot[e.motivo || 'Outro'] = (mot[e.motivo || 'Outro'] || 0) + 1);
  const motM = Math.max(1, ...Object.values(mot));
  const quebras = `<div class="grid2">
    <section class="card"><h2>Por pessoa da equipe</h2><p class="sub">Agendamentos sobre contatos</p>${legBar}<div style="margin-top:12px">${barras(porPessoa, k => k)}</div></section>
    <section class="card"><h2>Por setor</h2><p class="sub">Setor do serviço que motivou a ligação</p>${legBar}<div style="margin-top:12px">${barras(porSetor, k => SETORES[k] || 'Sem setor')}</div></section>
    <section class="card"><h2>Por faixa de nota</h2><p class="sub">Confere se a nota acerta: notas altas devem agendar mais</p>${legBar}<div style="margin-top:12px">${barras(porNota, k => 'Nota ' + k)}</div></section>
    <section class="card"><h2>Por que não quiseram</h2><p class="sub">Motivos de "sem interesse"</p><div class="bars" style="margin-top:14px">${Object.keys(mot).length ? MOTIVOS.filter(m => mot[m]).map(m => `<div class="bar"><span>${esc(m)}</span><div class="track"><i style="width:${mot[m] / motM * 100}%"></i></div><b class="num">${mot[m]}</b></div>`).join('') : '<span class="sub">Nenhum registro no período.</span>'}</div></section>
  </div>`;
  const porSvc = new Map(); comValor.forEach(e => (e.servicos || []).forEach(x => { const a = porSvc.get(x.n) || { n: 0, v: 0 }; a.n++; a.v += +x.p || 0; porSvc.set(x.n, a); }));
  const topSvc = [...porSvc.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 10); const mxSvc = Math.max(1, ...topSvc.map(([, a]) => a.v));
  const cardSvc = topSvc.length ? `<section class="card"><h2>Serviços agendados</h2><p class="sub">Valor real somado dos serviços escolhidos no agendamento</p><div class="bars" style="margin-top:14px">${topSvc.map(([n, a]) => `<div class="bar"><span>${esc(n)}</span><div class="track"><i style="width:${a.v / mxSvc * 100}%"></i></div><b class="num">${fmtBRL(a.v)}<small> · ${a.n}×</small></b></div>`).join('')}</div></section>` : '';
  const alerta = insat ? `<div class="banner warn"><b>${insat} cliente${insat > 1 ? 's disseram' : ' disse'} que ficou insatisfeita com o atendimento no período.</b><span>Vale a gestão ligar pessoalmente.</span></div>` : '';
  return head + alerta + kpis + grafico + quebras + cardSvc + tabelaDia + '<div class="tt" id="tt" hidden></div>';
}

function renderAjustes() {
  const bi = S.baseInfo;
  return `<div class="head"><div><div class="eyebrow">Configuração</div><h1>Base e <em>ajustes</em></h1><p class="sub">${S.papel === 'admin' ? 'Suba a exportação do Avec sempre que quiser atualizar a fila.' : 'A base e os ajustes do salão são mantidos pelos administradores.'}</p></div></div>
  <section class="card"><h2>Base de clientes</h2>
    <p class="sub">${S.demo ? 'Nenhuma planilha carregada ainda.' : `Arquivo <b>${esc(bi.nome)}</b>, carregado em ${new Date(bi.at).toLocaleString('pt-BR')}: ${bi.rows.toLocaleString('pt-BR')} serviços, ${S.base.clients.length.toLocaleString('pt-BR')} clientes, atendimentos até ${dayToStr(S.base.maxDay)}.`}</p>
    ${S.papel === 'admin' ? `<div class="drop" id="drop" style="margin-top:14px"><b>Arraste a planilha aqui</b><span class="sub">Relatório de serviços do Avec (.xlsx) com Profissional, Data Comanda, Serviço, Categoria, Cliente, Celular e Total</span><label class="btn primary" for="fFile">Escolher arquivo</label><input type="file" id="fFile" accept=".xlsx,.xls,.csv" hidden></div>
    <p class="note">A planilha é lida no seu navegador e a base processada fica guardada no banco do salão. Toda a equipe passa a ver a nova base na hora.</p>` : ''}
  </section>
  ${catalogoHtml()}
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
      <div><b>Agendou:</b> sai da fila por 60 dias. <b>Mensagem enviada:</b> sai por 3 dias para ela responder; depois volta à fila com a etiqueta "mensagem sem resposta". <b>Já veio:</b> sai da fila até a próxima planilha mostrar a visita (se em 60 dias a visita não aparecer, ela volta). <b>Sem interesse:</b> 90 dias. <b>Não atendeu:</b> volta em 3 dias; depois de 3 tentativas, sai por 60 dias. <b>Retornar em:</b> some até a data e aparece no topo no dia. <b>Número errado:</b> sai de vez.</div>
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
  document.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const a = b.dataset.act; if (a === 'naoatendeu' || a === 'errado' || a === 'mensagem' || a === 'javeio') registrar(a, {}); else { S.open = S.open === a ? null : a; if (a === 'agendou') S.pick = []; render(); } });
  document.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => {
    const a = b.dataset.confirm; const extra = { obs: ($('#fObs') || {}).value || '' };
    if (a === 'agendou') { extra.agDia = $('#fAgDia').value || ''; Object.assign(extra, vendaDoPicker()); }
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
  const setR = (k, v) => { S.rf[k] = v; if (k === 'setor') S.rf.tipo = ''; render(); };
  [['rPer', 'periodo'], ['rDe', 'de'], ['rAte', 'ate'], ['rPor', 'por'], ['rSetor', 'setor'], ['rTipo', 'tipo']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.onchange = () => setR(k, el.value); });
  const rl = $('#rLimpar'); if (rl) rl.onclick = () => { S.rf = { periodo: '7', de: '', ate: '', por: '', setor: '', tipo: '' }; render(); };
  if (S.view === 'marcacoes') bindMarcacoes(); else bindPicker();
  if (S.view === 'ajustes') bindCatalogo();
  const tt = $('#tt');
  if (tt) document.querySelectorAll('.stk-col').forEach(c => {
    c.onmouseenter = () => { tt.innerHTML = c.dataset.tip; tt.hidden = false; };
    c.onmousemove = e => { const w = tt.offsetWidth; tt.style.left = Math.min(window.innerWidth - w - 12, e.clientX + 14) + 'px'; tt.style.top = (e.clientY - 10) + 'px'; };
    c.onmouseleave = () => { tt.hidden = true; };
  });
}
function go(v) { S.view = v; S.open = null; S.mk.ed = null; S.pick = []; render(); window.scrollTo(0, 0); }
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
/* monta e grava uma marcação. modo 'novo' acrescenta ao histórico; 'corrigir' troca o último registro */
function montarDoc(o, id, st, extra, modo) {
  const prev = S.st.get(id) || null; const now = Date.now();
  const ativo = o ? contatoAtivo(o) : prev;
  const tent = st === 'naoatendeu' ? (modo === 'corrigir' && prev && prev.st === 'naoatendeu' ? (prev.tent || 1) : ((ativo && ativo.st === 'naoatendeu' && (ativo.tent || 1) < 3) ? (ativo.tent || 1) + 1 : 1)) : 0;
  const venda = st === 'agendou' && extra.servicos ? { servicos: extra.servicos, valor: r2(extra.valor) } : {};
  const quem = (S.atendente || S.membroNome || '').slice(0, 40);
  const campos = { st, ...(extra.obs ? { obs: extra.obs.slice(0, 300) } : {}), ...(extra.motivo ? { motivo: extra.motivo } : {}), ...(st === 'naoatendeu' ? { tent } : {}), ...(extra.ate ? { ate: extra.ate } : {}), ...(extra.agDia ? { agDia: extra.agDia } : {}), ...venda };
  let hist = [...((prev && prev.hist) || [])], at = now;
  if (modo === 'corrigir' && hist.length) {
    const ult = hist[hist.length - 1];
    const base = { at: ult.at, por: ult.por, uid: ult.uid, nota: ult.nota, fase: ult.fase, fam: ult.fam, tk: ult.tk };
    Object.keys(base).forEach(k => base[k] === undefined && delete base[k]);
    hist[hist.length - 1] = { ...base, ...campos, ed: { em: now, por: quem, de: ult.st } };
    at = prev.at || ult.at;
  } else {
    hist.push({ ...campos, at: now, por: quem, uid: S.user ? S.user.id : '', ...(o ? { nota: o.score, fase: o.fase } : {}), ...(o && o.trig ? { fam: o.trig.fam, tk: Math.round(o.trig.tk) } : {}) });
  }
  const doc = { st, at, first: prev && prev.first ? prev.first : at, tent, ate: extra.ate || '', agDia: extra.agDia || '', motivo: extra.motivo || '', obs: (extra.obs || '').slice(0, 300), ...venda, hist: hist.slice(-20) };
  return { prev, doc, tent };
}
const TXT_ST = (st, extra, tent) => ({ agendou: 'Agendamento registrado' + (extra.valor ? ' · ' + fmtBRLc(extra.valor) : ''), sem: 'Registrado: sem interesse', naoatendeu: `Não atendeu (tentativa ${tent} de 3)`, retornar: 'Retorno marcado para ' + dayToStr(isoToDay(extra.ate)), errado: 'Número marcado como errado', mensagem: 'Mensagem enviada: volta à fila em 3 dias se não responder', javeio: 'Marcada como "já veio"' }[st]);
async function registrar(st, extra) {
  const o = S.byKey.get(S.cur); if (!o) return;
  const id = docId(o.c.k);
  const { prev, doc, tent } = montarDoc(o, id, st, extra, 'novo');
  const i = S.queue.findIndex(x => x.c.k === o.c.k); const nxt = S.queue[i + 1];
  S.open = null; S.pick = [];
  const ok = await gravar(id, doc); if (!ok) { if (prev) S.st.set(id, prev); else S.st.delete(id); return; }
  rebuildQueue(); S.cur = nxt && S.queue.find(x => x.c.k === nxt.c.k) ? nxt.c.k : (S.queue[0] ? S.queue[0].c.k : null);
  render();
  toast(TXT_ST(st, extra, tent) + ' · ' + primeiroNome(o.c.nome), async () => { await gravar(id, prev); rebuildQueue(); S.cur = o.c.k; render(); });
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
      busy('Atualizando o catálogo de serviços…', `${base.servicos.length} serviços`);
      try { await sincronizarCatalogo(base.servicos); } catch (e) { console.warn(e); }
      delete base.servicos;
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'servicos', filter: f }, p => {
      const nome = (p.new && p.new.nome) || (p.old && p.old.nome); if (!nome) return;
      const resto = S.servicos.filter(x => x.nome !== nome);
      prepServicos(p.eventType === 'DELETE' ? resto : [...resto, p.new]);
      if (S.view === 'ajustes' && !digitando()) render();
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
    await carregarServicos();
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
