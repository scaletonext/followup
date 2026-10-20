// Monta a pasta dist/ para a Vercel e gera dist/config.js com as chaves públicas do Supabase.
// Na Vercel, defina as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.
// Localmente: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/build.mjs
import { mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) console.warn('Aviso: SUPABASE_URL ou SUPABASE_ANON_KEY não definidas. O site vai abrir pedindo configuração.');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('src', 'dist', { recursive: true });
writeFileSync('dist/config.js',
  `window.FOLLOWUP_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })};\n`);
console.log('Build pronto em dist/');
