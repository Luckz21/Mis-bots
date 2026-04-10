// ============================================================
//  bot.js  —  v7.0
// ============================================================

const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');

const http = require('http');
const cmd  = require('./commands.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const KOFI_TOKEN = process.env.KOFI_TOKEN;
const PREFIXES  = ['!', '?'];

if (!TOKEN)     { console.error('❌ Falta DISCORD_TOKEN');  process.exit(1); }
if (!CLIENT_ID) { console.error('❌ Falta CLIENT_ID');      process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL) { console.error('❌ Falta Upstash'); process.exit(1); }

// ── Comandos slash ────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox').addStringOption(o => o.setName('usuario').setDescription('Tu usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta'),
  new SlashCommandBuilder().setName('perfil').setDescription('Perfil completo de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Avatar de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Presencia en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Grupos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('amigos').setDescription('Amigos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('insignias').setDescription('Insignias recientes').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('juego').setDescription('Busca un juego de Roblox').addStringOption(o => o.setName('nombre').setDescription('Nombre del juego').setRequired(true)),
  new SlashCommandBuilder().setName('comparar').setDescription('⭐ Compara dos cuentas de Roblox')
    .addUserOption(o => o.setName('usuario1').setDescription('Primer usuario').setRequired(true))
    .addUserOption(o => o.setName('usuario2').setDescription('Segundo usuario').setRequired(true)),
  new SlashCommandBuilder().setName('flex').setDescription('⭐ Tarjeta de perfil llamativa'),
  new SlashCommandBuilder().setName('premium').setDescription('Ver tu estado Premium'),
  new SlashCommandBuilder().setName('puntos').setDescription('Ver tus puntos').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('daily').setDescription('Reclamar puntos diarios'),
  new SlashCommandBuilder().setName('whois').setDescription('Ver qué cuenta tiene un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('syncall').setDescription('⭐ Sincronizar roles de todos'),
  new SlashCommandBuilder().setName('ayuda').setDescription('Lista todos los comandos'),
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Rol de verificado').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setpremiumrole').setDescription('[Admin] Rol de Premium').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula grupo → rol')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina vinculación').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Lista roles configurados').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setwelcome').setDescription('[Admin] Configura bienvenida')
    .addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user} y {roblox})'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setalertchannel').setDescription('[Admin] Canal de alertas').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('activarpremium').setDescription('[Owner] Activar Premium manualmente')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(o => o.setName('dias').setDescription('Días (vacío = permanente)')),
].map(c => c.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log(`✅ ${slashCommands.length} comandos slash registrados`);
  } catch (e) { console.error('❌ Error slash:', e.message); }
}

// ── Cliente Discord ───────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function makeCtx(userId, username, guild, replyFn, fetchFn) {
  return { userId, username, guild, reply: replyFn, replyAndFetch: fetchFn ?? replyFn };
}

// ── Slash commands ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply().catch(() => {});
  const ctx = makeCtx(
    interaction.user.id, interaction.user.username, interaction.guild,
    (c) => interaction.editReply(c),
    async (c) => { await interaction.editReply(c); return interaction.fetchReply().catch(() => null); }
  );
  try {
    switch (interaction.commandName) {
      case 'verificar':      await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':      await cmd.cmdConfirmar(ctx); break;
      case 'perfil':         await cmd.cmdPerfil(ctx, interaction.options.getUser('usuario')); break;
      case 'avatar':         await cmd.cmdAvatar(ctx, interaction.options.getUser('usuario')); break;
      case 'estado':         await cmd.cmdEstado(ctx, interaction.options.getUser('usuario')); break;
      case 'grupos':         await cmd.cmdGrupos(ctx, interaction.options.getUser('usuario')); break;
      case 'amigos':         await cmd.cmdAmigos(ctx, interaction.options.getUser('usuario')); break;
      case 'insignias':      await cmd.cmdInsignias(ctx, interaction.options.getUser('usuario')); break;
      case 'buscar':         await cmd.cmdBuscar(ctx, interaction.options.getString('usuario')); break;
      case 'juego':          await cmd.cmdJuego(ctx, interaction.options.getString('nombre')); break;
      case 'comparar':       await cmd.cmdComparar(ctx, interaction.options.getUser('usuario1'), interaction.options.getUser('usuario2')); break;
      case 'flex':           await cmd.cmdFlex(ctx); break;
      case 'premium':        await cmd.cmdPremiumStatus(ctx); break;
      case 'puntos':         await cmd.cmdPuntos(ctx, interaction.options.getUser('usuario')); break;
      case 'daily':          await cmd.cmdDaily(ctx); break;
      case 'whois':          await cmd.cmdWhois(ctx, interaction.options.getUser('usuario')); break;
      case 'syncall':        await cmd.cmdSyncAll(ctx); break;
      case 'actualizar':     await cmd.cmdActualizar(ctx); break;
      case 'desvincular':    await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':          await cmd.cmdAyuda(ctx); break;
      case 'setverifiedrole':await cmd.cmdSetVerifiedRole(ctx, interaction.options.getRole('rol')); break;
      case 'setpremiumrole': await cmd.cmdSetPremiumRole(ctx, interaction.options.getRole('rol')); break;
      case 'bindrole':       await cmd.cmdBindRole(ctx, interaction.options.getString('grupo_id'), interaction.options.getInteger('rango_minimo'), interaction.options.getRole('rol')); break;
      case 'unbindrole':     await cmd.cmdUnbindRole(ctx, interaction.options.getString('grupo_id')); break;
      case 'listroles':      await cmd.cmdListRoles(ctx); break;
      case 'setwelcome':     await cmd.cmdSetWelcome(ctx, interaction.options.getChannel('canal').id, interaction.options.getString('mensaje')); break;
      case 'setalertchannel':await cmd.cmdSetAlertChannel(ctx, interaction.options.getChannel('canal').id); break;
      case 'activarpremium': await cmd.cmdActivarPremium(ctx, interaction.options.getUser('usuario').id, interaction.options.getInteger('dias')); break;
    }
  } catch (e) {
    console.error(`Error en /${interaction.commandName}:`, e);
    ctx.reply('❌ Error inesperado.').catch(() => {});
  }
});

// ── Comandos de texto ─────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;
  const parts   = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);
  const users   = [...message.mentions.users.values()];
  const ctx = makeCtx(
    message.author.id, message.author.username, message.guild,
    (c) => message.reply(c), async (c) => message.reply(c)
  );
  try {
    switch (cmdName) {
      case 'verificar':      await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':      await cmd.cmdConfirmar(ctx); break;
      case 'perfil':         await cmd.cmdPerfil(ctx, users[0]); break;
      case 'avatar':         await cmd.cmdAvatar(ctx, users[0]); break;
      case 'estado':         await cmd.cmdEstado(ctx, users[0]); break;
      case 'grupos':         await cmd.cmdGrupos(ctx, users[0]); break;
      case 'amigos':         await cmd.cmdAmigos(ctx, users[0]); break;
      case 'insignias':      await cmd.cmdInsignias(ctx, users[0]); break;
      case 'buscar':         await cmd.cmdBuscar(ctx, args[0]); break;
      case 'juego':          await cmd.cmdJuego(ctx, args.join(' ')); break;
      case 'comparar':       await cmd.cmdComparar(ctx, users[0], users[1]); break;
      case 'flex':           await cmd.cmdFlex(ctx); break;
      case 'premium':        await cmd.cmdPremiumStatus(ctx); break;
      case 'puntos':         await cmd.cmdPuntos(ctx, users[0]); break;
      case 'daily':          await cmd.cmdDaily(ctx); break;
      case 'whois':          await cmd.cmdWhois(ctx, users[0]); break;
      case 'syncall':        await cmd.cmdSyncAll(ctx); break;
      case 'actualizar':     await cmd.cmdActualizar(ctx); break;
      case 'desvincular':    await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':          await cmd.cmdAyuda(ctx); break;
      case 'permitir':       await cmd.cmdPermitir(ctx, args[0]?.toLowerCase()); break;
      case 'bloquear':       await cmd.cmdBloquear(ctx, args[0]?.toLowerCase()); break;
      case 'alertas':        await cmd.cmdAlertas(ctx, args[0]?.toLowerCase(), users[0]); break;
      case 'setverifiedrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol.');
        await cmd.cmdSetVerifiedRole(ctx, role); break;
      }
      case 'setpremiumrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol.');
        await cmd.cmdSetPremiumRole(ctx, role); break;
      }
      case 'bindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        const role = message.mentions.roles.first();
        if (!args[0] || !args[1] || !role) return message.reply('❌ Uso: `!bindrole <groupId> <rango> @rol`');
        await cmd.cmdBindRole(ctx, args[0], args[1], role); break;
      }
      case 'unbindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        await cmd.cmdUnbindRole(ctx, args[0]); break;
      }
      case 'listroles':      await cmd.cmdListRoles(ctx); break;
      case 'activarpremium': await cmd.cmdActivarPremium(ctx, args[0], parseInt(args[1])); break;
    }
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
    message.reply('❌ Error inesperado.');
  }
});

// ── Webhook de Ko-fi ──────────────────────────────────────────
// Ko-fi envía un POST a tu URL cuando alguien dona.
// Configura la URL en Ko-fi: Settings → API → Webhook URL
// La URL será: https://TU-PROYECTO.railway.app/kofi

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/kofi') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = new URLSearchParams(body);
        const payload = JSON.parse(params.get('data') || '{}');
        if (KOFI_TOKEN && payload.verification_token !== KOFI_TOKEN) {
          res.writeHead(401); return res.end();
        }
        const message = payload.message || '';
        // Buscar Discord ID en el mensaje (17-19 dígitos)
        const discordIdMatch = message.match(/\b(\d{17,19})\b/);
        if (discordIdMatch) {
          const discordId = discordIdMatch[1];
          const dias = payload.type === 'Subscription' ? 30 : 30;
          const expDate = new Date(Date.now() + dias * 86400000).toISOString();
          // Guardar premium en Redis directamente
          const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
          const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
          const encoded = encodeURIComponent(JSON.stringify({ activatedAt: new Date().toISOString(), expiresAt: expDate, kofiName: payload.from_name }));
          await fetch(`${REDIS_URL}/set/premium:${discordId}/${encoded}`, {
            headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
          });
          console.log(`⭐ Premium activado para Discord ID: ${discordId} por donación de ${payload.from_name}`);
          // Intentar notificar al usuario por DM
          try {
            const user = await client.users.fetch(discordId);
            await user.send(`⭐ ¡Gracias por tu donación **${payload.from_name}**! Tu Premium ha sido activado por 30 días. Usa \`/premium\` para verificarlo.`);
          } catch (e) { console.log('No pude enviar DM al usuario.'); }
        }
        res.writeHead(200); res.end('OK');
      } catch (e) {
        console.error('Webhook error:', e.message);
        res.writeHead(500); res.end();
      }
    });
  } else {
    res.writeHead(200); res.end('Bot activo ✅');
  }
});

// ── Arranque ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
  await cmd.startPresenceMonitor(client);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🌐 Webhook activo en puerto ${PORT}`));
});

client.login(TOKEN);
