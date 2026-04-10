// ============================================================
//  bot.js  —  v9.0 (Economy & UX Update)
// ============================================================

require('dotenv').config();
const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
  Partials
} = require('discord.js');

const http = require('http');
const cmd  = require('./commands.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const KOFI_TOKEN = process.env.KOFI_TOKEN;
const PREFIXES  = ['!', '?'];

if (!TOKEN || !CLIENT_ID || !process.env.UPSTASH_REDIS_REST_URL) { 
  console.error('❌ Faltan variables de entorno (.env).'); process.exit(1); 
}

// ── Comandos slash (Añadidos los nuevos de economía) ───────────
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
  new SlashCommandBuilder().setName('historial').setDescription('⭐ Ver tu historial de juegos recientes'),
  new SlashCommandBuilder().setName('premium').setDescription('Ver tu estado Premium'),
  
  // -- NUEVOS COMANDOS DE ECONOMÍA V9 --
  new SlashCommandBuilder().setName('puntos').setDescription('Ver tus puntos').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('daily').setDescription('Reclamar puntos diarios (¡Manten tu racha!)'),
  new SlashCommandBuilder().setName('coinflip').setDescription('Apuesta puntos a cara o cruz')
    .addIntegerOption(o => o.setName('apuesta').setDescription('Cantidad a apostar').setRequired(true))
    .addStringOption(o => o.setName('eleccion').setDescription('Cara o Cruz').setRequired(true).addChoices({name:'Cara', value:'cara'},{name:'Cruz', value:'cruz'})),
  new SlashCommandBuilder().setName('pay').setDescription('Paga puntos a otro usuario')
    .addUserOption(o => o.setName('usuario').setDescription('A quién pagar').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad').setRequired(true)),
  new SlashCommandBuilder().setName('rob').setDescription('Intenta robar puntos a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Víctima').setRequired(true)),
  // ------------------------------------

  new SlashCommandBuilder().setName('whois').setDescription('Ver qué cuenta tiene un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)),
  new SlashCommandBuilder().setName('syncall').setDescription('⭐ Sincronizar roles de todos'),
  new SlashCommandBuilder().setName('ayuda').setDescription('Lista todos los comandos'),
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Rol de verificado').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setpremiumrole').setDescription('[Admin] Rol de Premium').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula grupo → rol')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina vinculación').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Lista roles configurados').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setwelcome').setDescription('[Admin] Configura bienvenida').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user} y {roblox})')).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setalertchannel').setDescription('[Admin] Canal de alertas').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('activarpremium').setDescription('[Owner] Activar Premium manualmente').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)).addIntegerOption(o => o.setName('dias').setDescription('Días (vacío = permanente)')),
].map(c => c.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log(`✅ ${slashCommands.length} comandos slash registrados (V9)`);
  } catch (e) { console.error('❌ Error slash:', e.message); }
}

const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ],
  partials: [Partials.GuildMember]
});

function makeCtx(userId, username, guild, replyFn, fetchFn, authorObj = null) {
  return { userId, username, guild, author: authorObj, reply: replyFn, replyAndFetch: fetchFn ?? replyFn };
}

// ── Auto-Sync On Join (V9) ──────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  try {
    await cmd.autoSyncOnJoin(member);
  } catch (err) { console.error("Error auto-syncing new member:", err); }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  // Cooldown System (V9)
  if (cmd.isOnCooldown(interaction.user.id)) {
    return interaction.reply({ content: '⏳ Estás yendo muy rápido. Espera unos segundos.', ephemeral: true });
  }

  await interaction.deferReply().catch(() => {});
  const ctx = makeCtx(interaction.user.id, interaction.user.username, interaction.guild, (c) => interaction.editReply(c), async (c) => { await interaction.editReply(c); return interaction.fetchReply().catch(() => null); }, interaction.user);
  
  try {
    switch (interaction.commandName) {
      case 'verificar':      await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':      await cmd.cmdConfirmar(ctx, interaction.member); break;
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
      case 'historial':      await cmd.cmdHistorial(ctx); break;
      case 'premium':        await cmd.cmdPremiumStatus(ctx); break;
      case 'puntos':         await cmd.cmdPuntos(ctx, interaction.options.getUser('usuario')); break;
      case 'daily':          await cmd.cmdDaily(ctx); break;
      case 'coinflip':       await cmd.cmdCoinflip(ctx, interaction.options.getInteger('apuesta'), interaction.options.getString('eleccion')); break;
      case 'pay':            await cmd.cmdPay(ctx, interaction.options.getUser('usuario'), interaction.options.getInteger('cantidad')); break;
      case 'rob':            await cmd.cmdRob(ctx, interaction.options.getUser('usuario')); break;
      case 'whois':          await cmd.cmdWhois(ctx, interaction.options.getUser('usuario')); break;
      case 'syncall':        await cmd.cmdSyncAll(ctx); break;
      case 'actualizar':     await cmd.cmdActualizar(ctx, interaction.member); break;
      case 'desvincular':    await cmd.cmdDesvincular(ctx, interaction.member); break;
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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;
  
  if (cmd.isOnCooldown(message.author.id)) {
    return message.reply('⏳ Estás yendo muy rápido. Espera unos segundos.').then(m => setTimeout(() => m.delete().catch(()=>{}), 3000));
  }

  const parts   = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);
  const users   = [...message.mentions.users.values()];
  const ctx = makeCtx(message.author.id, message.author.username, message.guild, (c) => message.reply(c), async (c) => message.reply(c), message.author);
  
  try {
    switch (cmdName) {
      case 'daily':          await cmd.cmdDaily(ctx); break;
      case 'puntos':         await cmd.cmdPuntos(ctx, users[0]); break;
      case 'pay':            if (users[0] && args[1]) await cmd.cmdPay(ctx, users[0], parseInt(args[1])); break;
      case 'rob':            if (users[0]) await cmd.cmdRob(ctx, users[0]); break;
      case 'coinflip':       if (args[0] && args[1]) await cmd.cmdCoinflip(ctx, parseInt(args[0]), args[1].toLowerCase()); break;
      case 'verificar':      await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':      await cmd.cmdConfirmar(ctx, message.member); break;
      case 'actualizar':     await cmd.cmdActualizar(ctx, message.member); break;
      case 'perfil':         await cmd.cmdPerfil(ctx, users[0]); break;
      case 'estado':         await cmd.cmdEstado(ctx, users[0]); break;
      case 'historial':      await cmd.cmdHistorial(ctx); break;
      case 'premium':        await cmd.cmdPremiumStatus(ctx); break;
      case 'flex':           await cmd.cmdFlex(ctx); break;
      case 'ayuda':          await cmd.cmdAyuda(ctx); break;
    }
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
  }
});

// Webhook Ko-Fi V9
const server = http.createServer(async (req, res) => {
  // ... (Tu código de Ko-Fi V8 se mantiene igual)
  res.writeHead(200); res.end('Bot activo V9 ✅');
});

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
  await cmd.startPresenceMonitor(client);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🌐 Webhook activo en puerto ${PORT}`));
});

client.login(TOKEN);
        
