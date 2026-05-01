const express = require('express');
const FormData = require('form-data');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const WEBHOOK = process.env.WEBHOOK;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CARGO_ID = process.env.CARGO_ID;

app.get('/', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send('OAuth2 Backend WHT - Online ✅');
  }

  try {
    let form = new FormData();
    form.append('client_id', CLIENT_ID);
    form.append('client_secret', CLIENT_SECRET);
    form.append('grant_type', 'authorization_code');
    form.append('redirect_uri', REDIRECT_URI);
    form.append('scope', 'identify guilds.join');
    form.append('code', code);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: form,
    });
    const tokenData = await tokenRes.json();

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });

    const user = userRes.data;
    const avatarURL = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    // Adiciona ao servidor e atribui cargo
    await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        roles: [CARGO_ID],
      }),
    });

    // Tenta atribuir cargo se já era membro
    await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}/roles/${CARGO_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    // Webhook
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          color: 0xFF1493,
          title: `✅ Novo verificado — ${user.username}`,
          thumbnail: { url: avatarURL },
          description: `\`\`\`diff\n+ New User\n\n+ Username: ${user.username}\n\n+ ID: ${user.id}\`\`\``,
          footer: { text: 'WHT Community • OAuth2' }
        }]
      })
    });

    // Página de sucesso
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WHT Community — Verificado</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0f;
      color: white;
      font-family: 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .bg-glow {
      position: fixed;
      width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(255,20,147,0.15) 0%, transparent 70%);
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,20,147,0.3);
      border-radius: 20px;
      padding: 48px 40px;
      text-align: center;
      max-width: 440px;
      width: 90%;
      box-shadow: 0 0 40px rgba(255,20,147,0.15);
      position: relative;
      z-index: 1;
    }
    .logo {
      width: 100px; height: 100px;
      border-radius: 50%;
      border: 3px solid #FF1493;
      margin: 0 auto 24px;
      box-shadow: 0 0 20px rgba(255,20,147,0.5);
    }
    .avatar {
      width: 72px; height: 72px;
      border-radius: 50%;
      border: 3px solid #FF1493;
      margin: 0 auto 16px;
      box-shadow: 0 0 15px rgba(255,20,147,0.4);
    }
    .check {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #FF1493;
      margin-bottom: 8px;
      text-shadow: 0 0 20px rgba(255,20,147,0.5);
    }
    .username {
      font-size: 18px;
      color: #ffb3d9;
      margin-bottom: 8px;
    }
    p {
      color: #aaa;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      background: rgba(255,20,147,0.15);
      border: 1px solid rgba(255,20,147,0.4);
      color: #FF1493;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .footer {
      color: #555;
      font-size: 12px;
      margin-top: 24px;
    }
    .divider {
      border: none;
      border-top: 1px solid rgba(255,20,147,0.2);
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="card">
    <img class="logo" src="https://i.imgur.com/BPB8AM1.png" alt="WHT Logo" onerror="this.style.display='none'"/>
    <img class="avatar" src="${avatarURL}" alt="Avatar"/>
    <div class="check">✅</div>
    <h1>Verificado com sucesso!</h1>
    <div class="username">Olá, ${user.username}!</div>
    <hr class="divider"/>
    <div class="badge">🐺 WHT Community</div>
    <p>Sua conta foi verificada e o cargo foi atribuído automaticamente.<br/>Você já pode fechar essa página e voltar ao servidor!</p>
    <div class="footer">WHT Community • Sistema OAuth2</div>
  </div>
</body>
</html>`);

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao processar verificação.');
  }
});

module.exports = app;
