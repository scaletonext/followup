/* ===== Motor da nota de retorno ===== */
const DAY = 86400000;
/* Classificação: cada serviço vira um TIPO (com ciclo de retorno ou não), e cada tipo pertence a um SETOR */
const NOCYCLE = new Set(['nao', 'unhas_out', 'cab_out', 'pente', 'make', 'estet_out']);
const QUIM = new Set(['cor', 'luzes', 'alisa', 'mega', 'cilios', 'along', 'lash']);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function famOf(serv, cat) {
  const s = norm(serv), c = norm(cat), t = re => re.test(s);
  // não são serviços
  if (c === 'outros' || t(/taxa de deslocamento|^produto|^kit|recarga celular|victoria/)) return 'nao';
  // sobrancelhas e cílios (aparecem em várias categorias)
  if (t(/lash/)) return 'lash';
  if (t(/cilios|volume brasileiro|volume russo|fio a fio|alongamento classico/)) return 'cilios';
  if (t(/sobrancelha|sombrancelha|sobrncelha|^sob\/|henna|brow lamination|sobranc/)) return 'sobr';
  if (t(/dermopigmenta/)) return 'dermo';
  // unhas
  if (c === 'manicure e pedicure') {
    if (t(/esmaltacao em gel/)) return 'gel';
    if (t(/acrigel|banho de gel|fibra|molde f1|gel moldado|postic|reposicao unha|blindagem|encapsulamento|alongamento|meia manutencao/)) return 'along';
    if (t(/retirada unha|mudanca de formato|unha borrada/)) return 'unhas_out';
    if (t(/pe e mao|pedicure e manicure|manicure e pedicure|esmaltacao pe e mao|pacote mensal|combo unha|pacote unhas|unha procional/)) return 'mani';
    if (t(/pedicure|esfoliacao|plastica dos pes|spa para os pes/)) return 'pedi';
    return 'mani';
  }
  // cabelos
  if (c === 'cabelo' || (c === 'maquiagem' && t(/escova/)) || t(/^barba$/)) {
    if (t(/progressiva|redutora|plastica dos fios|platica dos fios|relaxamento|reducao de volume|portier|exoplastia|bioplastia|selagem|swing dos fios|alisamento|hollyood/)) return 'alisa';
    if (t(/mega/)) return 'mega';
    if (t(/luzes|mecha|ombre|balayage|morena iluminada/)) return 'luzes';
    if (t(/tintura|raiz|colora|^color|tonaliz|gloss|matizacao/)) return 'cor';
    if (t(/escova|lavagem e secagem|babyl|piastra|prancha/)) return 'escova';
    if (t(/corte masculino|barba/)) return 'cortem';
    if (t(/corte|contorno|combo cabelo|combo janeiro/)) return 'cortef';
    if (t(/hidrat|reconstru|nutri|cauteriza|tratamento|spa|vacina|hialuronico|tamarilize|wella|loreal|cronograma|chantilly|robson|oil/)) return 'hidra';
    if (t(/penteado/)) return 'pente';
    if (t(/make/)) return 'make';
    return 'cab_out';
  }
  // estética (inclui depilação e maquiagem)
  if (c === 'depilacao' || t(/depilacao|^queixo$|^mento|^buco|^axil|virilha|perna/)) return 'depil';
  if (t(/limpeza de pele/)) return 'limpeza';
  if (t(/massag|drenagem|relaxante/)) return 'massagem';
  if (t(/criolipolise|lipolase|lipolaser|endolaser|enzimas|radiofrequencia|flacidez|celulite|pacote c\/ 12|pacote estetica/)) return 'corporal';
  if (t(/peeling|microagulhamento|dermaplaning|botox|bio estimulador|hialuronico|jato de plasma|fibroina|hidragloss|linhas de expressao|pacote facial/)) return 'facial';
  if (c === 'maquiagem' || t(/make|dia da noiva/)) return 'make';
  return 'estet_out';
}
function parseDate(v) {
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number') return Math.round((v - 25569) * DAY); // serial Excel
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
}
function cleanPhone(v) {
  if (v == null || v === '') return '';
  let s = typeof v === 'number' ? Math.round(v).toString() : String(v);
  return s.replace(/\D/g, '');
}
const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* linhas (objetos com os cabeçalhos da exportação) -> base compacta por cliente */
function buildBase(rows) {
  const H = k => Object.keys(rows[0] || {}).find(h => norm(h) === norm(k));
  const col = { prof: H('Profissional'), data: H('Data Comanda'), serv: H('Serviço'), cat: H('Categoria'), cli: H('Cliente'), cel: H('Celular'), tel: H('Telefone'), tot: H('Total') };
  const need = ['data', 'serv', 'cli', 'tot'].filter(k => !col[k]);
  if (need.length) throw new Error('A planilha não tem as colunas esperadas da exportação do Avec (faltando: ' + need.join(', ') + ').');
  const map = new Map(); let maxDate = 0; const profMax = {};
  for (const r of rows) {
    const d = parseDate(r[col.data]); if (d == null) continue;
    const nome = String(r[col.cli] || '').trim(); if (!nome) continue;
    const cel = cleanPhone(r[col.cel]) || cleanPhone(r[col.tel]);
    const key = cel || 'n:' + norm(nome);
    let c = map.get(key);
    if (!c) { c = { k: key, nome, cel, v: {}, f: {}, p: {} }; map.set(key, c); }
    const tot = +r[col.tot] || 0;
    c.v[d] = (c.v[d] || 0) + tot;
    const fam = famOf(r[col.serv], r[col.cat]);
    const fd = (c.f[fam] = c.f[fam] || {});
    fd[d] = (fd[d] || 0) + tot;
    const prof = String(r[col.prof] || '').trim();
    if (prof) { profMax[prof] = Math.max(profMax[prof] || 0, d); const pk = fam + '|' + prof; c.p[pk] = Math.max(c.p[pk] || 0, d); c.p['*|' + prof] = (c.p['*|' + prof] || 0) + 1; }
    if (d > maxDate) maxDate = d;
  }
  // formato compacto: datas em dias desde 1970
  const clients = [];
  for (const c of map.values()) {
    const days = o => Object.entries(o).map(([d, t]) => [Math.round(+d / DAY), Math.round(t * 100) / 100]).sort((a, b) => a[0] - b[0]);
    const f = {}; for (const k in c.f) f[k] = days(c.f[k]);
    const last = {}; const cnt = {};
    for (const pk in c.p) { const [fam, prof] = pk.split('|'); if (fam === '*') cnt[prof] = c.p[pk]; else if (!last[fam] || c.p[pk] > last[fam][1]) last[fam] = [prof, c.p[pk]]; }
    const pf = {}; for (const k in last) pf[k] = last[k][0];
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    clients.push({ k: c.k, nome: c.nome, cel: c.cel, v: days(c.v), f, pf, pt: top ? top[0] : '' });
  }
  const profs = {}; for (const p in profMax) profs[p] = Math.round(profMax[p] / DAY);
  return { clients, profs, maxDay: Math.round(maxDate / DAY), rows: rows.length };
}

/* base + data de hoje -> clientes pontuados */
function scoreBase(base, todayDay) {
  const cl = base.clients;
  // ritmo do salão por família e profissionais ativas (atenderam nos últimos 90 dias da base)
  const famGaps = {};
  const profLast = base.profs || {};
  for (const c of cl) {
    for (const k in c.f) { const a = c.f[k]; for (let i = 1; i < a.length; i++) (famGaps[k] = famGaps[k] || []).push(a[i][0] - a[i - 1][0]); }
  }
  const sal = {}; for (const k in famGaps) sal[k] = median(famGaps[k]);
  // valor anual
  const out = cl.map(c => {
    const n = c.v.length, pri = c.v[0][0], ult = c.v[n - 1][0];
    const fat = c.v.reduce((s, x) => s + x[1], 0);
    const anual = fat / Math.max(1, (ult - pri) / 365);
    const ticket = fat / n;
    const rec = todayDay - ult;
    // dia da semana preferido (últimos 2 anos de visitas)
    const wd = [0, 0, 0, 0, 0, 0, 0]; let nw = 0;
    for (const [d] of c.v) if (ult - d <= 730) { wd[(d + 4) % 7]++; nw++; }
    const wTop = wd.indexOf(Math.max(...wd));
    const diaPref = nw >= 3 ? { dia: wTop, pct: wd[wTop] / nw } : null;
    // cada tipo de serviço tem a sua própria linha do tempo
    let trig = null; const fams = [];
    for (const fam in c.f) {
      if (NOCYCLE.has(fam) || !sal[fam]) continue;
      const a = c.f[fam]; const g = []; for (let i = 1; i < a.length; i++) g.push(a[i][0] - a[i - 1][0]);
      const pm = median(g), ng = g.length;
      const prazo = Math.max(1, ng >= 3 ? pm : ng >= 1 ? (pm + sal[fam]) / 2 : sal[fam]);
      let cvF = null;
      if (ng >= 3) { const m = g.reduce((s, x) => s + x, 0) / ng; const sd = Math.sqrt(g.reduce((s, x) => s + (x - m) ** 2, 0) / (ng - 1)); cvF = m > 0 ? sd / m : null; }
      const fu = a[a.length - 1][0];
      const dias = todayDay - fu;
      const ratio = dias / prazo;
      const tol = Math.max(7, 0.2 * prazo);            // folga mínima antes de considerar vencido
      const tk = a.reduce((s, x) => s + x[1], 0) / a.length;
      const conf = cvF == null ? 0.5 : cvF <= .4 ? 1 : cvF <= .7 ? .8 : cvF <= 1 ? .6 : .4;
      const habito = a.length >= 2 || n <= 2;           // feito 1 vez só só conta para cliente nova
      const abandonado = habito && a.length >= 2 && rec <= 90 && fu < ult && (ratio > 4 || dias > 365); // segue vindo, mas parou de fazer este aqui
      const status = !habito ? 'pontual' : abandonado ? 'abandonado' : dias >= prazo + tol ? 'vencido' : 'noprazo';
      const item = { fam, prazo: Math.round(prazo), ratio, tk, vezes: a.length, ultFam: fu, dias, atraso: Math.round(dias - prazo), proprio: ng >= 3, cv: cvF, conf, status, prof: c.pf[fam] || '' };
      fams.push(item);
      // gatilho: entre os vencidos, o de maior ticket x confiabilidade do ritmo
      if (status === 'vencido' && (!trig || tk * conf > trig.tk * trig.conf)) trig = item;
    }
    const ordem = { vencido: 0, noprazo: 1, abandonado: 2, pontual: 3 };
    fams.sort((x, y) => (x === trig ? -1 : y === trig ? 1 : 0) || ordem[x.status] - ordem[y.status] || (y.atraso - x.atraso));
    const vencidos = fams.filter(f => f.status === 'vencido' && f !== trig);
    const abandonados = fams.filter(f => f.status === 'abandonado');
    return { c, n, pri, ult, fat, anual, ticket, rec, trig, fams, vencidos, abandonados, diaPref };
  });
  // percentil do valor anual (rank médio, como pandas)
  const idx = out.map((o, i) => [o.anual, i]).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const r = (i + j) / 2 + 1; for (let t = i; t <= j; t++) out[idx[t][1]].q = r / idx.length; i = j + 1; }
  for (const o of out) {
    const r = o.trig ? o.trig.ratio : 0;
    const p = {};
    p.momento = !o.trig ? 0 : r < 1.5 ? 35 : r < 2 ? 30 : r < 3 ? 20 : r < 5 ? 10 : 3;
    p.fidelidade = o.n === 1 ? 5 : o.n === 2 ? 10 : o.n <= 4 ? 15 : o.n <= 9 ? 20 : 25;
    p.sumida = o.rec <= 60 ? 15 : o.rec <= 120 ? 12 : o.rec <= 180 ? 9 : o.rec <= 365 ? 5 : o.rec <= 730 ? 2 : 0;
    const cvT = o.trig ? o.trig.cv : null; // regularidade medida só no serviço gatilho
    p.regularidade = cvT == null ? 3 : cvT <= .4 ? 10 : cvT <= .7 ? 7 : cvT <= 1 ? 4 : 2;
    p.valor = Math.ceil(o.q * 5) * 3;
    p.bonus = o.trig && QUIM.has(o.trig.fam) && r < 3 ? 5 : 0;
    o.pts = p; o.today = todayDay;
    o.score = o.trig ? Math.min(100, p.momento + p.fidelidade + p.sumida + p.regularidade + p.valor + p.bonus) : null;
    o.top10 = o.q >= 0.9;
    // situação
    // motivo de quem fica fora da fila
    let fora = null;
    if (o.rec > 1095) fora = 'arquivo';
    else if (!o.trig) { const hab = o.fams.filter(f => f.status === 'noprazo' || f.status === 'abandonado'); fora = !o.fams.length ? 'semciclo' : hab.length ? 'emdia' : 'umavez'; }
    o.fora = fora;
    o.fase = fora ? fora : (o.n === 1 && o.rec <= 120) ? 'nova' : o.rec > 365 ? 'sumida' : r < 1.5 ? 'venceu' : r < 3 ? 'atrasada' : 'risco';
    o.faixa = o.score == null || o.fase === 'arquivo' ? 'fora' : o.score >= 60 ? 'prioritaria' : o.score >= 40 ? 'normal' : 'baixa';
    const prof = o.trig ? (o.c.pf[o.trig.fam] || o.c.pt) : o.c.pt;
    o.prof = prof || '';
    o.profSaiu = !!prof && (base.maxDay - (profLast[prof] || 0)) > 90;
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { buildBase, scoreBase, famOf, parseDate, DAY, NOCYCLE };
