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
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CARGO_ID = process.env.CARGO_ID;
const CANAL_ID = '1498452626357096489';

const SERVIDORES_EXTRAS = [];

const MESES = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
];

function fmtData(dt) {
  return `${dt.getDate()} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

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
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=512`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    // Adiciona ao servidor principal com cargo
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

    // Atribui cargo se já era membro
    await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}/roles/${CARGO_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    // Adiciona aos servidores extras
    for (const guildId of SERVIDORES_EXTRAS) {
      await fetch(`https://discord.com/api/guilds/${guildId}/members/${user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: tokenData.access_token,
        }),
      });
    }

    // Calcula dados da conta
    const contaCriada = new Date(user.id / 4194304 + 1420070400000);
    const agora = new Date();
    const idadeDias = Math.floor((agora - contaCriada) / (1000 * 60 * 60 * 24));
    const dataCriacao = fmtData(contaCriada);
    const dataEntrada = fmtData(agora);

    // Envia mensagem com components v2 no canal via bot
    await fetch(`https://discord.com/api/channels/${CANAL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        flags: 1 << 15, // IS_COMPONENTS_V2
        components: [
          {
            type: 17, // Container
            accent_color: 0xFF1493,
            components: [
              {
                type: 12, // MediaGallery
                items: [{ media: { url: avatarURL } }]
              },
              {
                type: 14 // Separator
              },
              {
                type: 10, // TextDisplay
                content: `✨ **NOVO MEMBRO VERIFICADO** ✨\n## ${user.username}`
              },
              {
                type: 14 // Separator
              },
              {
                type: 10,
                content: `🎉 <@${user.id}> foi verificado(a) com sucesso!\nCargo recebido: <@&${CARGO_ID}>`
              },
              {
                type: 14
              },
              {
                type: 10,
                content: `🪪 **ID do Usuário**\n\`${user.id}\`\n\n📅 **Conta Criada**\n${dataCriacao}\n\n📥 **Entrou em**\n${dataEntrada}`
              },
              {
                type: 14
              },
              {
                type: 10,
                content: `🎂 **Idade da Conta**\n\`${idadeDias} dias\``
              },
              {
                type: 14
              },
              {
                type: 10,
                content: `-# WHT COMMUNITY 🍄 • Verificado • ${dataEntrada}`
              }
            ]
          }
        ]
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
    .logo-wrap {
      width: 100px; height: 100px;
      border-radius: 50%;
      border: 3px solid #FF1493;
      margin: 0 auto 16px;
      box-shadow: 0 0 20px rgba(255,20,147,0.5);
      overflow: hidden;
    }
    .logo-wrap img {
      width: 100%; height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }
    .avatar {
      width: 64px; height: 64px;
      border-radius: 50%;
      border: 3px solid #FF1493;
      margin: 0 auto 16px;
      box-shadow: 0 0 15px rgba(255,20,147,0.4);
      display: block;
    }
    .check { font-size: 48px; margin-bottom: 16px; }
    h1 {
      font-size: 26px; font-weight: 700;
      color: #FF1493; margin-bottom: 8px;
      text-shadow: 0 0 20px rgba(255,20,147,0.5);
    }
    .username { font-size: 18px; color: #ffb3d9; margin-bottom: 8px; }
    p { color: #aaa; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
    .badge {
      display: inline-block;
      background: rgba(255,20,147,0.15);
      border: 1px solid rgba(255,20,147,0.4);
      color: #FF1493;
      padding: 6px 16px; border-radius: 20px;
      font-size: 13px; margin-bottom: 20px;
    }
    .countdown { font-size: 13px; color: #FF1493; margin-bottom: 16px; font-weight: 600; }
    .btn-discord {
      display: inline-flex; align-items: center; gap: 8px;
      background: #5865F2; color: white;
      padding: 12px 24px; border-radius: 12px;
      text-decoration: none; font-size: 15px; font-weight: 600;
      box-shadow: 0 0 15px rgba(88,101,242,0.4);
    }
    .btn-discord:hover { opacity: 0.85; }
    .divider { border: none; border-top: 1px solid rgba(255,20,147,0.2); margin: 20px 0; }
    .footer { color: #555; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="card">
    <div class="logo-wrap">
      <img src="https://i.imgur.com/G37BiaD.gif" alt="WHT Logo"/>
    </div>
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
    let t = 3;
    const el = document.getElementById('timer');
    const interval = setInterval(() => {
      t--;
      el.textContent = t;
      if (t <= 0) {
        clearInterval(interval);
        window.location.href = 'https://discord.com/channels/@me';
      }
    }, 1000);
  </script>
</body>
</html>`);

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao processar verificação.');
  }
});

module.exports = app;
