## Objetivo

Ocultar o header/menu admin (com tabs "Visão / Sandbox / Usuários / Flags / Fraude") apenas na rota `/admin/sandbox`, deixando a tela de jogo limpa, igual ao demo. Nas demais rotas admin, o menu continua visível.

## Mudança

### `src/pages/admin/AdminPage.tsx`

- Detectar a rota atual com o `useLocation` (já importado).
- Adicionar uma flag `hideHeader = location.pathname.startsWith("/admin/sandbox")`.
- Renderizar o `<header>` condicionalmente: `{!hideHeader && <header>...</header>}`.
- O `<Outlet />` continua sempre renderizado.

Resultado: ao navegar para `/admin/sandbox`, a barra superior do layout admin não aparece — o usuário vê só o `RoundSetupScreen` (com botão voltar e "X online"), idêntico ao demo. Para sair, usa o botão voltar do próprio `RoundSetupScreen` (que faz `window.history.back()`).