// ═══════════════════════════════════════════════════════════════
//  config.js — WHT OAuth2 System
//  Todas as variáveis são lidas do ambiente (Vercel Environment Variables)
//  NÃO coloque valores reais aqui — configure no painel do Vercel!
// ═══════════════════════════════════════════════════════════════

module.exports = {

  // ─── REDIS (Upstash) ──────────────────────────────────────
  // Vá em: upstash.com → seu banco → REST API
  KV_REST_API_URL:   process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,

  // ─── DISCORD OAuth2 ──────────────────────────────────────
  // Vá em: discord.com/developers/applications → seu app → OAuth2
  CLIENT_ID:     process.env.CLIENT_ID,      // ID do aplicativo Discord
  CLIENT_SECRET: process.env.CLIENT_SECRET,  // Secret do aplicativo Discord
  REDIRECT_URI:  process.env.REDIRECT_URI,   // Ex: https://seusite.vercel.app/

  // ─── BOT DISCORD ─────────────────────────────────────────
  // Vá em: discord.com/developers/applications → seu app → Bot → Reset Token
  BOT_TOKEN: process.env.BOT_TOKEN,  // Token do bot (começa com "Bot ..." na API)

  // ─── IDs DO SERVIDOR ─────────────────────────────────────
  // Ative Modo Desenvolvedor no Discord: Configurações → Avançado → Modo Desenvolvedor
  // Depois clique com botão direito no servidor/cargo para copiar o ID
  GUILD_ID:  process.env.GUILD_ID,   // ID do servidor principal
  CARGO_ID:  process.env.CARGO_ID,   // ID do cargo a ser atribuído após verificação

  // ─── SEGURANÇA DAS APIS ───────────────────────────────────
  // Senha usada pelos bots externos para chamar /api/logs, /api/mover, etc.
  API_SECRET: process.env.API_SECRET || 'wht-secret-2025',

  // Senha para acessar o painel admin em /admin?pass=SUASENHA
  // IMPORTANTE: Defina uma senha forte no Vercel!
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin-wht-2025',

  // ─── CANAL DE LOGS NO DISCORD ────────────────────────────
  // ID do canal onde o bot envia notificação de cada novo membro verificado
  // Clique com botão direito no canal → Copiar ID do canal
  CANAL_ID: '1498452626357096489', // ← Altere se necessário

};

// ═══════════════════════════════════════════════════════════════
//  COMO CONFIGURAR NO VERCEL:
//
//  1. Acesse: vercel.com → seu projeto → Settings → Environment Variables
//
//  2. Adicione cada variável abaixo:
//
//     KV_REST_API_URL     = https://xxxx.upstash.io
//     KV_REST_API_TOKEN   = AXxx...
//     CLIENT_ID           = 123456789012345678
//     CLIENT_SECRET       = AbCdEfGhIjKlMnOpQrStUvWxYz123456
//     REDIRECT_URI        = https://seusite.vercel.app/
//     BOT_TOKEN           = MTIz...abc
//     GUILD_ID            = 987654321098765432
//     CARGO_ID            = 111222333444555666
//     API_SECRET          = minha-senha-secreta-2025
//     ADMIN_PASSWORD      = senha-forte-do-painel
//
//  3. Clique em Save e faça Redeploy do projeto
//
//  4. Acesse o painel em:
//     https://seusite.vercel.app/admin?pass=senha-forte-do-painel
//
// ═══════════════════════════════════════════════════════════════
