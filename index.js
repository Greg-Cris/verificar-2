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

app.get('/', (req, res) => {
  res.send('OAuth2 Backend WHT - Online ✅');
});

app.post('/', async (req, res) => {
  try {
    let form = new FormData();
    form.append('client_id', CLIENT_ID);
    form.append('client_secret', CLIENT_SECRET);
    form.append('grant_type', 'authorization_code');
    form.append('redirect_uri', REDIRECT_URI);
    form.append('scope', 'identify guilds.join');
    form.append('code', req.body);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: form,
    });
    const tokenData = await tokenRes.json();

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { authorization: `${tokenData.token_type} ${tokenData.access_token}` }
    });

    const user = userRes.data;
    const avatarURL = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=4096`;

    // Envia webhook
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          color: 3092790,
          title: `${user.username}#${user.discriminator} - ${user.id}`,
          thumbnail: { url: avatarURL },
          description: `\`\`\`diff\n- New User\n\n- Pseudo: ${user.username}#${user.discriminator}\n\n- ID: ${user.id}\`\`\``
        }]
      })
    });

    res.json({
      success: true,
      userID: user.id,
      username: `${user.username}#${user.discriminator}`,
      avatarURL,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = app;
