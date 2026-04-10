// ============================================================
//  bot.js  —  v9.0
//  + Cooldowns integrados, on-join sync, guild-add guide,
//    prefix personalizable, nuevos comandos
// ============================================================

const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');

const http = require('http');
const cmd  = require('./commands.js');
const { cooldowns } = require('./security.js');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const KOFI_TOKEN = process.env.KOFI_TOKEN;
const DEFAULT_PREFIXES = ['!', '?'];

if (!TOKEN)     { console.error('❌ Falta DISCORD_TOKEN');  process.exit(1); }
if (!CLIENT_ID) { console.error('❌ Falta CLIENT_ID');      process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL) { console.error('❌ Falta Upstash'); process.exit(1); }

// Caché de prefijos por servidor (para no consultar Redis en cada mensaje)
const guildPrefixCache = new Map();

async function getGuildPrefix(guildId) {
  if (guildPrefixCache.has(guildId)) return guildPrefixCache.get(guildId);
  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    const res  = await fetch(`${REDIS_URL}/get/guild:${guildId}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    const config = data.result ? JSON.parse(data.result) : {};
    const prefix = config.prefix ?? null;
    guildPrefixCache.set(guildId, prefix);
    setTimeout(() => guildPrefixCache.delete(guildId), 5 * 60 * 1000); // limpiar caché cada 5 min
    return prefix;
  } catch { return null; }
}

// ── Comandos slash ────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox').addStringOption(o => o.setName('usuario').setDescription('Tu usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta'),
  new SlashCommandBuilder().setName('perfil').setDescription('Perfil completo').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Avatar de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Presencia en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Grupos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('amigos').setDescription('Amigos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('insignias').setDescription('Insignias recientes').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('historial-nombres').setDescription('Historial de nombres de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('juego').setDescription('Busca un juego de Roblox').addStringOption(o => o.setName('nombre').setDescription('Nombre del juego').setRequired(true)),
  new SlashCommandBuilder().setName('comparar').setDescription('⭐ Compara dos cuentas')
    .addUserOption(o => o.setName('usuario1').setDescription('Primer usuario').setRequired(true))
    .addUserOption(o => o.setName('usuario2').setDescription('Segundo usuario').setRequired(true)),
  new SlashCommandBuilder().setName('flex').setDescription('⭐ Tarjeta de perfil exclusiva'),
  new SlashCommandBuilder().setName('historial').setDescription('⭐ Historial de juegos'),
  new SlashCommandBuilder().setName('premium').setDescription('Ver tu estado Premium'),
  new SlashCommandBuilder().setName('puntos').setDescription('Ver tus puntos').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('daily').setDescription('Reclamar puntos diarios'),
  new SlashCommandBuilder().setName('logros').setDescription('Ver logros').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('whois').setDescription('Ver cuenta de Roblox de un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('syncall').setDescription('⭐ Sincronizar roles de todos'),
  new SlashCommandBuilder().setName('ayuda').setDescription('Lista todos los comandos'),
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Rol de verificado').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setpremiumrole').setDescription('[Admin] Rol Premium').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula grupo → rol')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina vinculación').addStringOption(o => o.setName('grupo_id').setDescription('ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Lista roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setwelcome').setDescription('[Admin] Configura bienvenida')
    .addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user} y {roblox})'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setalertchannel').setDescription('[Admin] Canal de alertas').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setnickname').setDescription('[Admin] Formato de auto-nickname').addStringOption(o => o.setName('formato').setDescription('{roblox}, {display}, {rank}')).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder().setName('setlang').setDescription('[Admin] Idioma del bot').addStringOption(o => o.setName('idioma').setDescription('es, en, pt').setRequired(true).addChoices({ name: '🇪🇸 Español', value: 'es' }, { name: '🇺🇸 English', value: 'en' }, { name: '🇧🇷 Português', value: 'pt' })).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('activarpremium').setDescription('[Owner] Activar Premium')
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
  return { userId, username, guild, reply: replyFn, replyAndFetch: fetchFn ?? (async (c) => replyFn(c)) };
}

// Función centralizada para manejar cooldowns
function checkCooldown(userId, cmdName, replyFn, lang = 'es') {
  const remaining = cooldowns.check(userId, cmdName);
  if (remaining === null) return true; // puede ejecutar
  if (remaining === -1) {
    replyFn('⛔ Fuiste bloqueado temporalmente por spam. Intenta en 5 minutos.');
    return false;
  }
  const { CooldownManager } = require('./security.js');
  replyFn(`⏳ Espera **${CooldownManager.formatTime(remaining)}** antes de usar este comando de nuevo.`);
  return false;
}

// ── Slash commands ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmdName = interaction.commandName.replace('-', '_');
  // Verificar cooldown (ephemeral para no ensuciar el chat)
  const remaining = cooldowns.check(interaction.user.id, interaction.commandName);
  if (remaining !== null) {
    const { CooldownManager } = require('./security.js');
    const msg = remaining === -1 ? '⛔ Bloqueado temporalmente.' : `⏳ Espera **${CooldownManager.formatTime(remaining)}**.`;
    return interaction.reply({ content: msg, ephemeral: true });
  }

  await interaction.deferReply().catch(() => {});
  const ctx = makeCtx(
    interaction.user.id, interaction.user.username, interaction.guild,
    (c) => interaction.editReply(c),
    async (c) => { await interaction.editReply(c); return interaction.fetchReply().catch(() => null); }
  );

  try {
    switch (interaction.commandName) {
      case 'verificar':        await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':        await cmd.cmdConfirmar(ctx); break;
      case 'perfil':           await cmd.cmdPerfil(ctx, interaction.options.getUser('usuario')); break;
      case 'avatar':           await cmd.cmdAvatar(ctx, interaction.options.getUser('usuario')); break;
      case 'estado':           await cmd.cmdEstado(ctx, interaction.options.getUser('usuario')); break;
      case 'grupos':           await cmd.cmdGrupos(ctx, interaction.options.getUser('usuario')); break;
      case 'amigos':           await cmd.cmdAmigos(ctx, interaction.options.getUser('usuario')); break;
      case 'insignias':        await cmd.cmdInsignias(ctx, interaction.options.getUser('usuario')); break;
      case 'historial-nombres':await cmd.cmdHistorialNombres(ctx, interaction.options.getUser('usuario')); break;
      case 'buscar':           await cmd.cmdBuscar(ctx, interaction.options.getString('usuario')); break;
      case 'juego':            await cmd.cmdJuego(ctx, interaction.options.getString('nombre')); break;
      case 'comparar':         await cmd.cmdComparar(ctx, interaction.options.getUser('usuario1'), interaction.options.getUser('usuario2')); break;
      case 'flex':             await cmd.cmdFlex(ctx); break;
      case 'historial':        await cmd.cmdHistorial(ctx); break;
      case 'premium':          await cmd.cmdPremiumStatus(ctx); break;
      case 'puntos':           await cmd.cmdPuntos(ctx, interaction.options.getUser('usuario')); break;
      case 'daily':            await cmd.cmdDaily(ctx); break;
      case 'logros':           await cmd.cmdLogros(ctx, interaction.options.getUser('usuario')); break;
      case 'whois':            await cmd.cmdWhois(ctx, interaction.options.getUser('usuario')); break;
      case 'syncall':          await cmd.cmdSyncAll(ctx); break;
      case 'actualizar':       await cmd.cmdActualizar(ctx); break;
      case 'desvincular':      await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':            await cmd.cmdAyuda(ctx); break;
      case 'setverifiedrole':  await cmd.cmdSetVerifiedRole(ctx, interaction.options.getRole('rol')); break;
      case 'setpremiumrole':   await cmd.cmdSetPremiumRole(ctx, interaction.options.getRole('rol')); break;
      case 'bindrole':         await cmd.cmdBindRole(ctx, interaction.options.getString('grupo_id'), interaction.options.getInteger('rango_minimo'), interaction.options.getRole('rol')); break;
      case 'unbindrole':       await cmd.cmdUnbindRole(ctx, interaction.options.getString('grupo_id')); break;
      case 'listroles':        await cmd.cmdListRoles(ctx); break;
      case 'setwelcome':       await cmd.cmdSetWelcome(ctx, interaction.options.getChannel('canal').id, interaction.options.getString('mensaje')); break;
      case 'setalertchannel':  await cmd.cmdSetAlertChannel(ctx, interaction.options.getChannel('canal').id); break;
      case 'setnickname':      await cmd.cmdSetNickname(ctx, interaction.options.getString('formato')); break;
      case 'setlang':          await cmd.cmdSetLang(ctx, interaction.options.getString('idioma')); break;
      case 'activarpremium':   await cmd.cmdActivarPremium(ctx, interaction.options.getUser('usuario').id, interaction.options.getInteger('dias')); break;
    }
  } catch (e) {
    console.error(`Error en /${interaction.commandName}:`, e);
    ctx.reply('❌ Error inesperado.').catch(() => {});
  }
});

// ── Comandos de texto ─────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // Obtener prefix del servidor (o usar los por defecto)
  const customPrefix = await getGuildPrefix(message.guild.id);
  const prefixes = customPrefix ? [customPrefix, ...DEFAULT_PREFIXES] : DEFAULT_PREFIXES;
  const prefix = prefixes.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const parts   = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);
  const users   = [...message.mentions.users.values()];

  // Verificar cooldown
  const remaining = cooldowns.check(message.author.id, cmdName);
  if (remaining !== null) {
    const { CooldownManager } = require('./security.js');
    const msg = remaining === -1 ? '⛔ Bloqueado temporalmente.' : `⏳ Espera **${CooldownManager.formatTime(remaining)}**.`;
    return message.reply(msg);
  }

  const ctx = makeCtx(
    message.author.id, message.author.username, message.guild,
    (c) => message.reply(c), async (c) => message.reply(c)
  );

  try {
    switch (cmdName) {
      case 'verificar':          await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':          await cmd.cmdConfirmar(ctx); break;
      case 'perfil':             await cmd.cmdPerfil(ctx, users[0]); break;
      case 'avatar':             await cmd.cmdAvatar(ctx, users[0]); break;
      case 'estado':             await cmd.cmdEstado(ctx, users[0]); break;
      case 'grupos':             await cmd.cmdGrupos(ctx, users[0]); break;
      case 'amigos':             await cmd.cmdAmigos(ctx, users[0]); break;
      case 'insignias':          await cmd.cmdInsignias(ctx, users[0]); break;
      case 'historial-nombres':  await cmd.cmdHistorialNombres(ctx, users[0]); break;
      case 'buscar':             await cmd.cmdBuscar(ctx, args[0]); break;
      case 'juego':              await cmd.cmdJuego(ctx, args.join(' ')); break;
      case 'comparar':           await cmd.cmdComparar(ctx, users[0], users[1]); break;
      case 'flex':               await cmd.cmdFlex(ctx); break;
      case 'historial':          await cmd.cmdHistorial(ctx); break;
      case 'premium':            await cmd.cmdPremiumStatus(ctx); break;
      case 'puntos':             await cmd.cmdPuntos(ctx, users[0]); break;
      case 'daily':              await cmd.cmdDaily(ctx); break;
      case 'logros':             await cmd.cmdLogros(ctx, users[0]); break;
      case 'coinflip':           await cmd.cmdCoinFlip(ctx, args[0]); break;
      case 'pay':                await cmd.cmdPay(ctx, users[0], args[1]); break;
      case 'whois':              await cmd.cmdWhois(ctx, users[0]); break;
      case 'syncall':            await cmd.cmdSyncAll(ctx); break;
      case 'actualizar':         await cmd.cmdActualizar(ctx); break;
      case 'desvincular':        await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':              await cmd.cmdAyuda(ctx); break;
      case 'permitir':           await cmd.cmdPermitir(ctx, args[0]?.toLowerCase()); break;
      case 'bloquear':           await cmd.cmdBloquear(ctx, args[0]?.toLowerCase()); break;
      case 'alertas':            await cmd.cmdAlertas(ctx, args[0]?.toLowerCase(), users[0]); break;
      case 'top':                await cmd.cmdTop(ctx); break;
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
        if (!args[0] || !args[1] || !role) return message.reply('❌ `!bindrole <id> <rango> @rol`');
        await cmd.cmdBindRole(ctx, args[0], args[1], role); break;
      }
      case 'unbindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        await cmd.cmdUnbindRole(ctx, args[0]); break;
      }
      case 'listroles':          await cmd.cmdListRoles(ctx); break;
      case 'setlang': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Necesitas Administrar Servidor.');
        await cmd.cmdSetLang(ctx, args[0]); break;
      }
      case 'setnickname': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return message.reply('❌ Necesitas Gestionar Apodos.');
        await cmd.cmdSetNickname(ctx, args.join(' ') || null); break;
      }
      case 'activarpremium':     await cmd.cmdActivarPremium(ctx, args[0], parseInt(args[1])); break;
    }
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
    message.reply('❌ Error inesperado.');
  }
});

// ── Eventos de servidor ───────────────────────────────────────
client.on('guildMemberAdd', (member) => cmd.onMemberJoin(member).catch(console.error));
client.on('guildCreate',    (guild)  => cmd.onGuildAdd(guild).catch(console.error));

// ── Webhook Ko-fi ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/kofi') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params  = new URLSearchParams(body);
        const payload = JSON.parse(params.get('data') || '{}');
        if (KOFI_TOKEN && payload.verification_token !== KOFI_TOKEN) { res.writeHead(401); return res.end(); }
        const message = payload.message || '';
        const match   = message.match(/\b(\d{17,19})\b/);
        if (match) {
          const discordId = match[1];
          const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
          const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
          const expDate = new Date(Date.now() + 30 * 86400000).toISOString();
          const encoded = encodeURIComponent(JSON.stringify({ activatedAt: new Date().toISOString(), expiresAt: expDate, kofiName: payload.from_name }));
          await fetch(`${REDIS_URL}/set/premium:${discordId}/${encoded}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
          console.log(`⭐ Premium activado: ${discordId} (${payload.from_name})`);
          try {
            const user = await client.users.fetch(discordId);
            await user.send(`⭐ ¡Gracias **${payload.from_name}**! Premium activado por 30 días. Usa \`/premium\` para verificarlo.`);
          } catch { console.log('DM fallido'); }
        }
        res.writeHead(200); res.end('OK');
      } catch (e) { console.error('Webhook error:', e.message); res.writeHead(500); res.end(); }
    });
  } else {
    res.writeHead(200); res.end('🤖 Bot activo v9.0');
  }
});

// ── Arranque ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
  await cmd.startPresenceMonitor(client);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🌐 Servidor activo en puerto ${PORT}`));
});

client.login(TOKEN);
