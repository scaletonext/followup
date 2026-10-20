-- =====================================================================
-- Follow-up Salão · banco de dados (Supabase / Postgres)
-- Rode este arquivo inteiro uma vez no SQL Editor do Supabase.
-- Cada salão vê apenas os próprios dados (Row Level Security).
-- =====================================================================

create extension if not exists pgcrypto;

-- Salões atendidos pelo sistema
create table if not exists public.saloes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  criado_em   timestamptz not null default now()
);

-- Quem pode entrar em cada salão (ligado aos usuários do Supabase Auth)
create table if not exists public.membros (
  user_id     uuid not null references auth.users(id) on delete cascade,
  salao_id    uuid not null references public.saloes(id) on delete cascade,
  nome        text not null default '',
  papel       text not null default 'recepcao' check (papel in ('admin', 'recepcao')),
  criado_em   timestamptz not null default now(),
  primary key (user_id, salao_id)
);

-- Base de clientes já processada a partir da planilha do Avec (uma linha por cliente)
create table if not exists public.base_clientes (
  salao_id    uuid not null references public.saloes(id) on delete cascade,
  chave       text not null,              -- celular, ou "n:nome" quando não há celular
  dados       jsonb not null,             -- visitas, serviços e profissionais em formato compacto
  versao      bigint not null default 0,  -- carga da planilha que gravou esta linha
  primary key (salao_id, chave)
);
alter table public.base_clientes add column if not exists versao bigint not null default 0;

-- Informações da última planilha carregada
create table if not exists public.base_meta (
  salao_id      uuid primary key references public.saloes(id) on delete cascade,
  arquivo       text not null default '',
  linhas        integer not null default 0,
  clientes      integer not null default 0,
  max_day       integer not null default 0,  -- último dia com atendimento (dias desde 1970)
  profs         jsonb not null default '{}'::jsonb, -- profissional -> último dia em que atendeu
  versao        bigint not null default 0,   -- muda a cada carga, para os navegadores saberem que precisam recarregar
  carregado_em  timestamptz not null default now(),
  carregado_por uuid references auth.users(id) on delete set null
);

-- Resultado dos contatos (uma linha por cliente contatada, com histórico)
create table if not exists public.contatos (
  salao_id       uuid not null references public.saloes(id) on delete cascade,
  cliente_id     text not null,           -- código da cliente (hash do celular)
  st             text not null check (st in ('agendou', 'sem', 'naoatendeu', 'retornar', 'errado')),
  dados          jsonb not null,          -- tentativas, data de retorno, motivo, observação, histórico
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  primary key (salao_id, cliente_id)
);

-- Ajustes do salão (nome usado nas mensagens, meta diária, oferta)
create table if not exists public.config (
  salao_id    uuid primary key references public.saloes(id) on delete cascade,
  salao_nome  text not null default '',
  meta        integer not null default 50 check (meta > 0),
  oferta      text not null default ''
);

-- ---------------------------------------------------------------------
-- Funções de apoio às regras de acesso
-- ---------------------------------------------------------------------
create or replace function public.e_membro(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid() and salao_id = s);
$$;

create or replace function public.e_admin(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid() and salao_id = s and papel = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.saloes        enable row level security;
alter table public.membros       enable row level security;
alter table public.base_clientes enable row level security;
alter table public.base_meta     enable row level security;
alter table public.contatos      enable row level security;
alter table public.config        enable row level security;

drop policy if exists saloes_ler on public.saloes;
create policy saloes_ler on public.saloes for select to authenticated using (public.e_membro(id));

drop policy if exists membros_ler on public.membros;
create policy membros_ler on public.membros for select to authenticated
  using (user_id = auth.uid() or public.e_admin(salao_id));

-- base: toda a equipe lê; só admin carrega planilha
drop policy if exists base_ler on public.base_clientes;
create policy base_ler on public.base_clientes for select to authenticated using (public.e_membro(salao_id));
drop policy if exists base_gravar on public.base_clientes;
create policy base_gravar on public.base_clientes for all to authenticated
  using (public.e_admin(salao_id)) with check (public.e_admin(salao_id));

drop policy if exists meta_ler on public.base_meta;
create policy meta_ler on public.base_meta for select to authenticated using (public.e_membro(salao_id));
drop policy if exists meta_gravar on public.base_meta;
create policy meta_gravar on public.base_meta for all to authenticated
  using (public.e_admin(salao_id)) with check (public.e_admin(salao_id));

-- contatos: toda a equipe lê e registra
drop policy if exists contatos_ler on public.contatos;
create policy contatos_ler on public.contatos for select to authenticated using (public.e_membro(salao_id));
drop policy if exists contatos_gravar on public.contatos;
create policy contatos_gravar on public.contatos for all to authenticated
  using (public.e_membro(salao_id)) with check (public.e_membro(salao_id));

-- ajustes: toda a equipe lê; só admin muda
drop policy if exists config_ler on public.config;
create policy config_ler on public.config for select to authenticated using (public.e_membro(salao_id));
drop policy if exists config_gravar on public.config;
create policy config_gravar on public.config for all to authenticated
  using (public.e_admin(salao_id)) with check (public.e_admin(salao_id));

-- permissões básicas (o Supabase já costuma dar; repetir não faz mal)
grant select, insert, update, delete on public.saloes, public.membros, public.base_clientes, public.base_meta, public.contatos, public.config to authenticated;
grant execute on function public.e_membro(uuid), public.e_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Tempo real: marcações e cargas de base aparecem na hora para toda a equipe
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.contatos; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.base_meta; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.config;    exception when duplicate_object then null; end;
  end if;
end $$;
