# Follow-up · retorno de clientes para salões

Sistema que monta a fila de contatos de retorno de um salão a partir da exportação de serviços do **Avec**. Cada cliente recebe uma nota de 0 a 100 (chance de agendar), e a recepção trabalha uma cliente por vez, com mensagem de WhatsApp e roteiro de ligação prontos.

- **Front:** HTML + JavaScript puro, sem framework, hospedado na **Vercel**.
- **Banco e login:** **Supabase** (Postgres, Auth e Realtime).
- **Multi-salão:** cada salão vê só os próprios dados (Row Level Security).

---

## Colocar no ar (cerca de 15 minutos)

### 1. Supabase: criar o banco

1. Entre em [supabase.com](https://supabase.com) → **New project**. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
2. Abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Pode rodar mais de uma vez sem problema.
3. Em **Authentication → Sign In / Providers → Email**, **desligue "Allow new users to sign up"**. Assim só entra quem o administrador cadastrar.
4. Em **Authentication → Users → Add user → Create new user**, crie o usuário de cada pessoa (e-mail e senha) e marque **Auto Confirm User**.
5. Abra [`supabase/primeiro-acesso.sql`](supabase/primeiro-acesso.sql), troque os e-mails e nomes de exemplo pelos reais, cole no **SQL Editor** e rode. Isso cria o salão "Visual Up" e dá acesso às pessoas:
   - `admin`: carrega a planilha e muda os ajustes do salão.
   - `recepcao`: trabalha a fila e registra contatos.
6. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**. Você vai usar as duas na Vercel.

### 2. Vercel: publicar o site

1. Entre em [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório **scaletonext/followup** do GitHub.
2. Ligue as chaves. O jeito mais fácil é pelo Supabase, em **Project Settings → Integrations → Vercel → Install Vercel integration**: escolha "Link Existing Supabase Account" e dê acesso só ao projeto followup. A integração cria sozinha `SUPABASE_URL` e `SUPABASE_ANON_KEY` na Vercel. Se preferir fazer à mão, crie essas duas variáveis com a Project URL e a chave anon public do passo 1.6.
3. Clique em **Deploy**, ou em **Redeploy** se o projeto já existia. O `vercel.json` já define o build (`node scripts/build.mjs`) e a pasta de saída (`dist`).
4. Copie o endereço gerado (por exemplo, `followup-xxx.vercel.app`) e cole no Supabase em **Authentication → URL Configuration → Site URL**.

### 3. Primeiro uso

1. Entre com o usuário **admin**.
2. Vá em **Base e ajustes** e suba a exportação de serviços do Avec (.xlsx). A planilha é lida no navegador e a base processada vai para o banco.
3. Pronto: toda a equipe já vê a mesma fila. As marcações aparecem em tempo real em todos os computadores.

Para atualizar a base, o admin sobe uma planilha nova. Os navegadores abertos recarregam sozinhos.

---

## Como funciona

| Pasta / arquivo | O que faz |
|---|---|
| `src/engine.js` | Lê a planilha, classifica os 379 serviços em setor e tipo, calcula o ritmo de cada cliente por serviço e a nota |
| `src/messages.js` | Mensagem de WhatsApp e roteiro de ligação por serviço e situação |
| `src/app.js` | Telas (fila, lista, resultados, ajustes), login, leitura e gravação no Supabase, tempo real |
| `src/index.html` | Estrutura e visual (design system rosa pastel) |
| `supabase/schema.sql` | Tabelas, regras de acesso e tempo real |
| `scripts/build.mjs` | Gera `dist/` e o `config.js` com as chaves públicas |

### Tabelas

- `saloes` e `membros`: quem acessa qual salão e com qual papel.
- `base_clientes`: uma linha por cliente, com o histórico compacto (datas, serviços, valores, profissional).
- `base_meta`: dados da última planilha carregada.
- `contatos`: o resultado de cada contato e o histórico de tentativas.
- `config`: o nome do salão nas mensagens, a meta diária e a oferta.

### A nota (0 a 100)

| Critério | Pontos |
|---|---|
| Momento do ciclo: atraso no serviço em relação ao ritmo dela | até 35 |
| Fidelidade: número de visitas | até 25 |
| Tempo sumida: última visita por qualquer serviço | até 15 |
| Valor: gasto por ano | até 15 |
| Regularidade no serviço da ligação | até 10 |
| Bônus de química ou manutenção vencida | +5 |

Um serviço só conta como vencido depois do ritmo da cliente mais uma folga de 7 dias ou 20%, o que for maior. Um serviço que ela parou de fazer aqui, mesmo continuando a vir ao salão, não vira motivo de ligação.

---

## No ar

- Site: https://followup-eta-pied.vercel.app
- Banco: projeto Supabase **followup**

## Rodar localmente

```bash
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=xxxx node scripts/build.mjs
npx serve dist
```

## Segurança e LGPD

- A chave `anon` é pública por natureza. O que protege os dados são as regras de acesso do banco (RLS), já configuradas no `schema.sql`.
- **Nunca** coloque a chave `service_role` no front nem no repositório.
- Não suba planilhas para o repositório (o `.gitignore` já bloqueia `.xlsx` e `.csv`).
- O salão é o controlador dos dados das clientes. A Scale to Next opera o sistema. Mantenha isso previsto em contrato.

## Próximos passos

- Integração com a API do Avec, quando liberada, para atualizar a base automaticamente.
- Ler a agenda futura, para não ligar para quem já tem horário marcado.
