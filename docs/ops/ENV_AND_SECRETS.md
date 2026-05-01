# Variáveis de ambiente e segredos

## Setup local (frontend)

1. Copie o modelo: `cp .env.example .env` (Windows: `copy .env.example .env`).
2. Preencha no Dashboard do Supabase: **Project Settings → API**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable / legado “anon”)

O arquivo `.env` está no `.gitignore` e **não deve ser commitado**.

## Se credenciais vazaram no Git

- **Publishable key**: pode ser rotacionada no mesmo painel de API do projeto (menos crítica que a service role, mas ainda troque se houve exposição).
- **Service role / secrets de Edge Functions**: só existem no Supabase Dashboard / secrets das funções — nunca no `.env` do Vite.

Se um `.env` com valores reais chegou a ser commitado, as revisões antigas do Git **podem ainda conter o arquivo**. Além de rotacionar chaves, avalie limpar o histórico (ex.: `git filter-repo`) e um `git push --force` coordenado com o time — operações destrutivas; só faça com backup e alinhamento.
