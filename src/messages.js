/* ===== Mensagens e roteiros ===== */
const SETORES = { unhas: 'Unhas', cabelos: 'Cabelos', estetica: 'Estética', sobcil: 'Sobrancelhas e cílios' };
const FAMMETA = {
  mani:  { nome: 'Manicure / pé e mão', sv: 'as unhas', ss: 'suas unhas', ideal: 'a cada 1 a 2 semanas', g: 'unhas' },
  pedi:  { nome: 'Pedicure / pés', sv: 'a pedicure', ss: 'sua pedicure', ideal: 'a cada 3 a 4 semanas', g: 'unhas' },
  along: { nome: 'Alongamento de unha', sv: 'a manutenção do alongamento', ss: 'a manutenção do seu alongamento', ideal: 'a cada 2 a 3 semanas, para não descolar nem quebrar', g: 'unhas' },
  gel:   { nome: 'Esmaltação em gel', sv: 'a esmaltação em gel', ss: 'sua esmaltação em gel', ideal: 'a cada 3 semanas', g: 'unhas' },
  unhas_out: { nome: 'Outros de unhas (retirada, formato)', g: 'unhas', semCiclo: true },
  cor:   { nome: 'Coloração / raiz', sv: 'o retoque da cor', ss: 'seu retoque da cor', ideal: 'a cada 4 a 6 semanas, antes da raiz aparecer', g: 'cabelos' },
  luzes: { nome: 'Luzes / mechas', sv: 'as luzes', ss: 'suas luzes', ideal: 'a cada 3 a 4 meses, para o loiro não amarelar e a raiz não marcar', g: 'cabelos' },
  alisa: { nome: 'Progressiva / redutora', sv: 'a progressiva', ss: 'sua progressiva', ideal: 'a cada 3 a 4 meses, quando a raiz começa a crescer', g: 'cabelos' },
  cortef:{ nome: 'Corte feminino', sv: 'o corte', ss: 'seu corte', ideal: 'a cada 2 a 3 meses, para manter o formato', g: 'cabelos' },
  cortem:{ nome: 'Corte masculino / barba', sv: 'o corte', ss: 'seu corte', ideal: 'a cada 3 a 4 semanas', g: 'cabelos' },
  escova:{ nome: 'Escova / finalização', sv: 'a escova', ss: 'sua escova', ideal: '', g: 'cabelos' },
  hidra: { nome: 'Hidratação / tratamento', sv: 'a hidratação', ss: 'sua hidratação', ideal: 'a cada 15 a 30 dias, no cronograma capilar', g: 'cabelos' },
  mega:  { nome: 'Mega hair', sv: 'a manutenção do mega hair', ss: 'a manutenção do seu mega hair', ideal: 'a cada 1 a 3 meses, para não embaraçar na raiz', g: 'cabelos' },
  pente: { nome: 'Penteado', g: 'cabelos', semCiclo: true },
  cab_out: { nome: 'Outros de cabelo (tranças)', g: 'cabelos', semCiclo: true },
  sobr:  { nome: 'Design de sobrancelha / henna', sv: 'a sobrancelha', ss: 'sua sobrancelha', ideal: 'a cada 3 a 4 semanas', g: 'sobcil' },
  cilios:{ nome: 'Extensão de cílios', sv: 'a manutenção dos cílios', ss: 'a manutenção dos seus cílios', ideal: 'a cada 2 a 4 semanas', g: 'sobcil' },
  lash:  { nome: 'Lash lifting', sv: 'o lash lifting', ss: 'seu lash lifting', ideal: 'a cada 1 a 2 meses', g: 'sobcil' },
  dermo: { nome: 'Dermopigmentação', sv: 'a dermopigmentação', ss: 'o retoque da sua dermopigmentação', ideal: 'com retoque a cada 1 ano, mais ou menos, para manter a cor', g: 'sobcil' },
  depil: { nome: 'Depilação', sv: 'a depilação', ss: 'sua depilação', ideal: 'a cada 4 a 6 semanas', g: 'estetica' },
  limpeza:{ nome: 'Limpeza de pele', sv: 'a limpeza de pele', ss: 'sua limpeza de pele', ideal: 'a cada 30 a 45 dias', g: 'estetica' },
  massagem:{ nome: 'Massagem / drenagem', sv: 'a massagem', ss: 'sua massagem', ideal: 'com regularidade, uma vez por semana ou a cada 15 dias, para manter o resultado', g: 'estetica' },
  corporal:{ nome: 'Tratamento corporal', sv: 'o tratamento corporal', ss: 'seu tratamento corporal', ideal: 'em sessões seguidas, sem pausas longas, para não perder o resultado', g: 'estetica' },
  facial:{ nome: 'Tratamento facial', sv: 'o tratamento facial', ss: 'seu tratamento facial', ideal: '', g: 'estetica' },
  make:  { nome: 'Maquiagem', g: 'estetica', semCiclo: true },
  estet_out:{ nome: 'Outros de estética (avaliação, piercing)', g: 'estetica', semCiclo: true },
  nao:   { nome: 'Produtos e taxas', g: '', semCiclo: true },
};
const TICKETS = [['a', 'Até R$ 60', 0, 60], ['b', 'R$ 60 a 120', 60, 120], ['c', 'R$ 120 a 200', 120, 200], ['d', 'R$ 200 a 350', 200, 350], ['e', 'Acima de R$ 350', 350, Infinity]];
const FASES = {
  vencendo: { nome: 'Vencendo', tom: 'info' }, venceu: { nome: 'Venceu', tom: 'good' }, atrasada: { nome: 'Atrasada', tom: 'warn' },
  risco: { nome: 'Em risco', tom: 'bad' }, sumida: { nome: 'Sumida há mais de 1 ano', tom: 'bad' }, nova: { nome: 'Veio só 1 vez', tom: 'info' },
  emdia: { nome: 'Em dia', tom: 'muted' }, semciclo: { nome: 'Sem serviço com ciclo', tom: 'muted' }, umavez: { nome: 'Serviços feitos 1 vez só', tom: 'muted' }, arquivo: { nome: 'Sumida há mais de 3 anos', tom: 'muted' },
};

function tempo(d) {
  d = Math.max(0, Math.round(d));
  if (d < 14) return d === 1 ? '1 dia' : d + ' dias';
  if (d < 60) { const s = Math.round(d / 7); return s + ' semanas'; }
  if (d < 365) { const m = Math.round(d / 30.4); return m === 1 ? '1 mês' : m + ' meses'; }
  const a = Math.floor(d / 365), m = Math.round((d - a * 365) / 30.4);
  const as = a === 1 ? '1 ano' : a + ' anos';
  return m >= 1 && m < 12 ? as + ' e ' + (m === 1 ? '1 mês' : m + ' meses') : as;
}
function primeiroNome(n) {
  const p = String(n || '').trim().split(/[\s\/]+/)[0] || '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

// como cada serviço aparece na fala ("você sempre costumava ___ mais ou menos nesse tempo")
const VERBO = {
  mani: 'fazer as unhas', pedi: 'fazer os pés', along: 'fazer a manutenção do alongamento', gel: 'refazer a esmaltação em gel',
  cor: 'retocar a cor', luzes: 'refazer as luzes', alisa: 'refazer a progressiva', cortef: 'cortar o cabelo', cortem: 'cortar o cabelo',
  escova: 'fazer escova', hidra: 'fazer hidratação', mega: 'fazer a manutenção do mega hair',
  sobr: 'fazer a sobrancelha', cilios: 'fazer a manutenção dos cílios', lash: 'refazer o lash lifting', dermo: 'retocar a dermopigmentação',
  depil: 'fazer a depilação', limpeza: 'fazer limpeza de pele', massagem: 'fazer massagem', corporal: 'fazer o tratamento corporal', facial: 'fazer o tratamento facial',
};
const DIA_FRASE = ['nesse domingo', 'nessa segunda', 'nessa terça', 'nessa quarta', 'nessa quinta', 'nessa sexta', 'nesse sábado'];
const comArtigo = n => (/[oO]$/.test(n) && !/^(Cl[eé]o)$/i.test(n) ? 'o ' : 'a ') + n;

function montarMensagem(o, cfg) {
  const fm = FAMMETA[o.trig.fam];
  const nome = primeiroNome(o.c.nome);
  const salao = cfg.salao || 'o salão';
  const eu = cfg.atendente || '[seu nome]';
  const t = tempo(o.today - o.trig.ultFam);
  const verbo = VERBO[o.trig.fam] || ('fazer ' + (fm.sv || 'seu serviço'));
  const prof = o.prof ? primeiroNome(o.prof) : '';
  const quando = o.diaPref && o.diaPref.pct >= .3 ? DIA_FRASE[o.diaPref.dia] : 'essa semana';
  const comQuem = prof && !o.profSaiu ? ' com ' + comArtigo(prof) : '';
  const saiu = prof && o.profSaiu ? ` ${prof} não atende mais aqui, mas a nossa equipe vai te receber com o mesmo cuidado.` : '';
  const extra = (o.vencidos || []).filter(f => FAMMETA[f.fam].sv).slice(0, 2);
  const extraTxt = extra.map(f => FAMMETA[f.fam].sv).join(' e ');
  const combo = extra.length ? ` Se quiser, dá pra aproveitar e fazer ${extraTxt} no mesmo dia.` : '';
  const oferta = cfg.oferta && ['atrasada', 'risco', 'sumida'].includes(o.fase) ? ` E pra essa volta, ${cfg.oferta.replace(/\.$/, '')}.` : '';
  const ritmoTxt = o.trig.proprio ? 'mais ou menos nesse tempo' : 'por volta dessa época';

  // o motivo: perguntar da experiência, lembrar do costume dela
  let motivoFala, motivoMsg;
  if (o.fase === 'nova') {
    motivoFala = `Tô ligando só pra saber como foi a sua experiência aqui. Você veio ${verbo} com a gente há ${t}, e eu queria saber: gostou do resultado? Tá tudo certo?`;
    motivoMsg = `Passando só pra saber como foi a sua experiência com a gente! Você veio ${verbo} há ${t}. Gostou do resultado?`;
  } else if (o.fase === 'sumida' || o.fase === 'risco' || (o.today - o.trig.ultFam) > 365) {
    const naoVem = o.ult === o.trig.ultFam ? ' que você não vem' : ' desde a última vez';
    motivoFala = `Tô ligando só pra saber como foi a sua última experiência aqui. Ligando só pra saber mesmo! É que você sempre costumava ${verbo} com a gente, e já faz ${t}${naoVem}. Tá tudo certo?`;
    motivoMsg = `Passando só pra saber como foi a sua última experiência com a gente. É que você sempre costumava ${verbo} aqui, e já faz ${t}. Tá tudo certo?`;
  } else {
    motivoFala = `Tô ligando só pra saber como foi a sua última experiência aqui. Ligando só pra saber mesmo! É que você sempre costumava ${verbo} ${ritmoTxt}, e já faz ${t}. Tá tudo certo?`;
    motivoMsg = `Passando só pra saber como foi a sua última experiência com a gente. É que você sempre costumava ${verbo} ${ritmoTxt} (já faz ${t}). Tá tudo certo?`;
  }
  const convite = `Inclusive, temos um horário ${quando}${comQuem}. O que acha de vir?`;

  const whats = `Oi, ${nome}! Aqui é ${cfg.atendente ? 'a ' + cfg.atendente : 'a equipe'}, do ${salao} 😊 ${motivoMsg} ${convite}${combo}${oferta}${saiu}`;

  const roteiro = [
    { t: 'Abertura', f: `Oi, ${nome}! Aqui é a ${eu}, do ${salao}. Tudo bem?` },
    { t: 'Motivo da ligação', f: motivoFala + ' (Escute com atenção. Se ela contar algum problema, vá para "Se ela disser…".)' },
    { t: 'Convite', f: convite + combo + oferta + saiu },
    { t: 'Fechamento', f: `Perfeito! Então fica ${quando === 'essa semana' ? '[dia]' : quando.replace(/^ness[ae] /, '')} às [hora]${comQuem}. Vou te mandar a confirmação no WhatsApp, tá bom? Beijo!` },
  ];
  const objecoes = [
    { q: '"Foi tudo ótimo, só estou sem tempo"', a: `Que bom! Quer que eu te ligue outro dia pra gente ver um horário com calma? Qual dia fica melhor? (marque "Retornar em")` },
    { q: '"Não gostei do último atendimento"', a: 'Poxa, sinto muito. Me conta o que aconteceu? Quero muito resolver isso. Se preferir, a gente agenda com outra profissional. (motivo: insatisfeita)' },
    { q: '"Estou indo em outro lugar"', a: 'Entendi! Posso perguntar o que fez você mudar? Isso ajuda muito a gente a melhorar. E a porta fica aberta, tá? (registre o motivo)' },
    { q: '"Tá caro" ou "tô apertada"', a: cfg.oferta ? `Entendo. Pra essa volta, ${cfg.oferta.replace(/\.$/, '')}. Quer aproveitar?` : 'Entendo. Posso te sugerir uma opção mais simples, que cabe melhor agora?' },
  ];
  return { whats, roteiro, objecoes };
}

if (typeof module !== 'undefined') module.exports = { montarMensagem, tempo, primeiroNome, FAMMETA, SETORES };
