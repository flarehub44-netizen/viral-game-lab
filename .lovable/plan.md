# Corrigir página /admin não aparecendo na Vercel

## Causa

O projeto é uma SPA (React Router com `BrowserRouter`). Quando você acessa diretamente `https://seu-dominio.vercel.app/admin` (ou recarrega a página estando nela), a Vercel procura um arquivo físico em `/admin` no build. Como esse arquivo não existe — a rota `/admin` só existe dentro do JavaScript do React Router — a Vercel devolve **404**.

No Lovable isso funciona porque a infraestrutura tem fallback SPA automático. A Vercel **não** tem esse fallback por padrão; precisa de um arquivo de configuração.

> Observação: hoje o projeto não tem `vercel.json` na raiz (acabei de verificar), por isso o sintoma.

## O que fazer

Criar um arquivo `vercel.json` na raiz do projeto com uma regra de rewrite que faz qualquer rota servir o `index.html`. O React Router então assume e renderiza a página correta (incluindo `/admin`, `/admin/overview`, `/admin/users`, etc.).

### Conteúdo do arquivo `vercel.json`

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Isso resolve **todas** as rotas profundas no deploy da Vercel, não só `/admin`.

## Depois de aplicar

1. Faça um novo deploy na Vercel (basta um novo commit ou clicar em "Redeploy").
2. Acesse `https://seu-dominio.vercel.app/admin` — agora carregará o app.
3. Faça login com a conta admin: o redirecionamento automático para `/admin` (que já implementamos) também passará a funcionar no domínio Vercel.

## Lembrete importante sobre a conta admin

A página `/admin` só renderiza se o usuário tiver a role `admin` na tabela `user_roles` do backend. Se após o fix de roteamento a página ainda mostrar "Não encontrado", é porque o usuário logado não tem a role atribuída — isso é independente do problema da Vercel.

## Arquivo a ser criado

- `vercel.json` (raiz do projeto)
