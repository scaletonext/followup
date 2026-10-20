-- =====================================================================
-- Primeiro acesso: cria o salão e dá acesso às pessoas da equipe.
-- Antes de rodar, crie os usuários em Authentication > Users > Add user
-- (com e-mail e senha) e troque os e-mails abaixo pelos reais.
-- =====================================================================

with novo as (
  insert into public.saloes (nome) values ('Visual Up') returning id
), cfg as (
  insert into public.config (salao_id, salao_nome, meta, oferta)
  select id, 'Visual Up', 50, '' from novo
)
insert into public.membros (user_id, salao_id, nome, papel)
select u.id, novo.id, x.nome, x.papel
from novo
join (values
  ('pablo@exemplo.com',   'Pablo',   'admin'),
  ('larissa@exemplo.com', 'Larissa', 'recepcao')
) as x(email, nome, papel) on true
join auth.users u on lower(u.email) = lower(x.email);

-- Para adicionar alguém depois (troque e-mail, nome e papel):
-- insert into public.membros (user_id, salao_id, nome, papel)
-- select u.id, s.id, 'Nome', 'recepcao'
-- from auth.users u, public.saloes s
-- where lower(u.email) = 'pessoa@exemplo.com' and s.nome = 'Visual Up';
