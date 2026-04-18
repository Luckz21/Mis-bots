// ============================================================
//  bot.js  —  v10.8 (MODULAR - ESTRUCTURA REFACTORIZADA)
//  + Sirve archivos estáticos desde /public
//  + Webhook PayPal funcional
//  + Endpoint /api/stats para la página web
//  + Contadores de usuarios verificados y comandos ejecutados
// ============================================================

const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const http = require('http');
const fs = require('fs');
const path = require('path');

// Importar desde la nueva estructura modular
const cmd = require('./commands');

const TOKEN      = process.env.DISCORD_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const DEFAULT_PREFIXES = ['!', '?'];

if (!TOKEN)     { console.error('❌ Falta DISCORD_TOKEN');  process.exit(1); }
if (!CLIENT_ID) { console.error('❌ Falta CLIENT_ID');      process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL) { console.error('❌ Falta Upstash'); process.exit(1); }

// Funciones Redis para usar en el webhook y la API (se mantienen aquí por simplicidad)
async function redisGet(key) {
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, { 
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } 
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) { console.error('redisGet:', e.message); return null; }
}
async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encoded}`, { 
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } 
    });
  } catch (e) { console.error('redisSet:', e.message); }
}
async function redisDel(key) {
  try {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${encodeURIComponent(key)}`, { 
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } 
    });
  } catch (e) { console.error('redisDel:', e.message); }
}

const guildPrefixCache = new Map();

async function getGuildPrefix(guildId) {
  if (guildPrefixCache.has(guildId)) return guildPrefixCache.get(guildId);
  try {
    const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/guild:${guildId}`, { 
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } 
    });
    const data = await res.json();
    const config = data.result ? JSON.parse(data.result) : {};
    const prefix = config.prefix ?? null;
    guildPrefixCache.set(guildId, prefix);
    setTimeout(() => guildPrefixCache.delete(guildId), 5 * 60 * 1000);
    return prefix;
  } catch { return null; }
}

// ── Slash commands ────────────────────────────────────────────
const slashCommands = [
  // Verificación
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox con Discord').addStringOption(o => o.setName('usuario').setDescription('Tu nombre de usuario en Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación después de poner el código en tu descripción de Roblox'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles de Discord con tu cuenta de Roblox'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta de Roblox de este Discord'),
  new SlashCommandBuilder().setName('captcha').setDescription('Completa la verificación anti-bot antes de usar /verificar'),
  // Perfil
  new SlashCommandBuilder().setName('perfil').setDescription('Muestra el perfil completo de Roblox con estadísticas').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Muestra el avatar de Roblox en tamaño grande').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Muestra si está conectado, jugando o desconectado en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Lista los grupos de Roblox con rol y rango').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('amigos').setDescription('Lista los amigos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('insignias').setDescription('Muestra las últimas insignias ganadas en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('historial-nombres').setDescription('Muestra los nombres anteriores de la cuenta de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca información pública de cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Nombre de usuario en Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('outfit').setDescription('Muestra la ropa que lleva puesta actualmente un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('rap').setDescription('Estima el valor RAP de los limiteds del usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  // Roblox
  new SlashCommandBuilder().setName('catalogo').setDescription('Busca items en el catálogo de Roblox').addStringOption(o => o.setName('item').setDescription('Nombre del item a buscar').setRequired(true)),
  new SlashCommandBuilder().setName('murogrupo').setDescription('Ve las últimas publicaciones del muro de un grupo de Roblox').addStringOption(o => o.setName('grupo_id').setDescription('ID numérico del grupo').setRequired(true)),
  new SlashCommandBuilder().setName('robloxstatus').setDescription('Consulta el estado actual de los servidores de Roblox'),
  new SlashCommandBuilder().setName('sugerencia').setDescription('Envía una sugerencia al canal de sugerencias del servidor').addStringOption(o => o.setName('texto').setDescription('Tu sugerencia').setRequired(true)),
  // Premium
  new SlashCommandBuilder().setName('premium').setDescription('Ver tu estado Premium y cómo activarlo'),
  new SlashCommandBuilder().setName('flex').setDescription('Genera tu tarjeta de perfil exclusiva'),
  new SlashCommandBuilder().setName('historial').setDescription('Ver tu historial de juegos recientes en Roblox (Premium)'),
  new SlashCommandBuilder().setName('comparar').setDescription('Compara dos cuentas de Roblox lado a lado (Premium)')
    .addUserOption(o => o.setName('usuario1').setDescription('Primer usuario').setRequired(true))
    .addUserOption(o => o.setName('usuario2').setDescription('Segundo usuario').setRequired(true)),
  new SlashCommandBuilder().setName('mistats').setDescription('Ver tus estadísticas de juego (Premium)'),
  new SlashCommandBuilder().setName('addalt').setDescription('Añadir una cuenta alt a tu perfil (Premium)')
    .addStringOption(o => o.setName('usuario').setDescription('Nombre de usuario en Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('alts').setDescription('Ver tus cuentas alt vinculadas (Premium)'),
  new SlashCommandBuilder().setName('setflexbg').setDescription('Establecer una imagen de fondo para /flex (Premium)')
    .addStringOption(o => o.setName('url').setDescription('URL de la imagen (jpg, png, gif)').setRequired(true)),
  // Economía
  new SlashCommandBuilder().setName('fianza').setDescription('Pagar la fianza de un usuario encarcelado (Admin/Owner)')
  .addUserOption(o => o.setName('usuario').setDescription('Usuario a liberar').setRequired(true)),
  new SlashCommandBuilder().setName('puntos').setDescription('Ver tus puntos y rango de economía').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('daily').setDescription('Reclamar tu recompensa diaria de puntos'),
  new SlashCommandBuilder().setName('logros').setDescription('Ver logros desbloqueados').addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  new SlashCommandBuilder().setName('toplocal').setDescription('Ver el top 10 de puntos en este servidor'),
  new SlashCommandBuilder().setName('topglobal').setDescription('Ver el top 10 de puntos global del bot'),
  new SlashCommandBuilder().setName('tienda').setDescription('Ver la tienda de puntos (30+ colores)'),
  new SlashCommandBuilder().setName('comprar').setDescription('Comprar un item de la tienda')
    .addStringOption(o => o.setName('id').setDescription('ID del item (usa /tienda para ver)').setRequired(true)),
  new SlashCommandBuilder().setName('rob').setDescription('Intentar robar puntos a otro usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Víctima').setRequired(true)),
  // Trivia
  new SlashCommandBuilder().setName('trivia').setDescription('Responde una pregunta y gana puntos')
    .addStringOption(o => o.setName('categoria').setDescription('Categoría (opcional)').addChoices(
      { name: '🎮 Roblox', value: 'Roblox' },
      { name: '🔢 Matemáticas', value: 'Matemáticas' },
      { name: '🔬 Ciencias', value: 'Ciencias' },
      { name: '📜 Historia', value: 'Historia' },
      { name: '🌍 Geografía', value: 'Geografía' },
      { name: '💻 Tecnología', value: 'Tecnología' },
      { name: '🎯 General', value: 'General' },
    )),
  new SlashCommandBuilder().setName('triviacustom').setDescription('Trivia con preguntas personalizadas')
    .addSubcommand(sub => sub.setName('add').setDescription('[Owner] Añadir pregunta').addStringOption(o => o.setName('pregunta').setDescription('Pregunta | Respuesta').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Ver preguntas personalizadas'))
    .addSubcommand(sub => sub.setName('play').setDescription('Jugar trivia personalizada (5-15 preguntas/día)')),
  // Moderación
  new SlashCommandBuilder().setName('whois').setDescription('Ver qué cuenta de Roblox tiene un usuario de Discord').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord').setRequired(true)),
  new SlashCommandBuilder().setName('syncall').setDescription('[Admin] Sincronizar roles de todos los miembros verificados'),
  // DMs
  new SlashCommandBuilder().setName('dms').setDescription('Activar/desactivar mensajes directos del bot')
    .addBooleanOption(o => o.setName('activar').setDescription('True para activar, False para desactivar').setRequired(false)),
  // Ayuda
  new SlashCommandBuilder().setName('ayuda').setDescription('Ver todos los comandos disponibles con descripciones'),
  // Admin
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Rol que se asigna al verificarse').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setpremiumrole').setDescription('[Admin] Rol que se asigna a usuarios Premium').addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula un grupo de Roblox a un rol de Discord')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo de Roblox').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo requerido (0 = cualquier miembro)').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol de Discord a asignar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina la vinculación de un grupo de Roblox').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Muestra toda la configuración de roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('setwelcome').setDescription('[Admin] Configura el mensaje de bienvenida al verificarse')
    .addChannelOption(o => o.setName('canal').setDescription('Canal donde se envía').setRequired(true))
    .addStringOption(o => o.setName('mensaje').setDescription('Mensaje ({user} = mención, {roblox} = nombre Roblox)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setalertchannel').setDescription('[Admin] Canal donde llegan las alertas de presencia').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setsuggestions').setDescription('[Admin] Canal de sugerencias').addChannelOption(o => o.setName('canal').setDescription('Canal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setnickname').setDescription('[Admin] Formato de auto-nickname al verificarse').addStringOption(o => o.setName('formato').setDescription('{roblox}, {display}, {rank}')).setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  new SlashCommandBuilder().setName('setlang').setDescription('[Admin] Idioma del bot para este servidor')
    .addStringOption(o => o.setName('idioma').setDescription('Idioma').setRequired(true)
      .addChoices({ name: '🇪🇸 Español', value: 'es' }, { name: '🇺🇸 English', value: 'en' }, { name: '🇧🇷 Português', value: 'pt' }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setprefix').setDescription('[Admin] Cambiar el prefijo para comandos de texto').addStringOption(o => o.setName('prefijo').setDescription('Nuevo prefijo (ej: $)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setvoicecategory').setDescription('[Admin] Configurar categoría para canales de voz automáticos').addChannelOption(o => o.setName('categoria').setDescription('Categoría de voz').setRequired(true).addChannelTypes(ChannelType.GuildCategory)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  // Owner exclusivos
  new SlashCommandBuilder().setName('activarpremium').setDescription('[Owner] Activar Premium manualmente')
    .addStringOption(o => o.setName('usuario_id').setDescription('ID de Discord del usuario').setRequired(true))
    .addIntegerOption(o => o.setName('dias').setDescription('Días (vacío = permanente)')),
  new SlashCommandBuilder().setName('desactivarpremium').setDescription('[Owner] Desactivar Premium de un usuario')
    .addStringOption(o => o.setName('usuario_id').setDescription('ID de Discord del usuario').setRequired(true)),
  new SlashCommandBuilder().setName('encarcelar').setDescription('[Owner] Encarcela a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a encarcelar').setRequired(true))
    .addIntegerOption(o => o.setName('horas').setDescription('Duración en horas (defecto 1)')),
  new SlashCommandBuilder().setName('setpuntos').setDescription('[Owner] Establece los puntos de un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad de puntos').setRequired(true)),
  new SlashCommandBuilder().setName('addpuntos').setDescription('[Owner] Añade puntos a un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad a añadir').setRequired(true)),
  new SlashCommandBuilder().setName('ownercolor').setDescription('[Owner] Cambia el color del perfil del owner')
    .addStringOption(o => o.setName('color').setDescription('Código HEX (#RRGGBB)').setRequired(true)),
  new SlashCommandBuilder().setName('cambiarcolor').setDescription('[Owner] Cambia tu color de perfil usando ID de tienda')
    .addStringOption(o => o.setName('id').setDescription('ID del color (ej: color_red)').setRequired(true)),
  new SlashCommandBuilder().setName('senddm').setDescription('[Owner] Enviar DM a un usuario')
  .addStringOption(o => o.setName('usuario_id').setDescription('ID de Discord del usuario').setRequired(true))
  .addStringOption(o => o.setName('mensaje').setDescription('Mensaje a enviar').setRequired(true)),
  // Compra Premium (PayPal)
  new SlashCommandBuilder().setName('buy').setDescription('Comprar Premium con PayPal (7 o 30 días)'),
].map(c => c.toJSON());
new SlashCommandBuilder().setName('playtime').setDescription('Muestra el tiempo jugado en los últimos 7 días')
  .addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log(`✅ ${slashCommands.length} comandos slash registrados`);
  } catch (e) { console.error('❌ Error slash:', e.message); }
}

// ── Cliente ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function makeCtx(userId, username, guild, replyFn, fetchFn, channelId) {
  return { userId, username, guild, channelId, reply: replyFn, replyAndFetch: fetchFn ?? (async (c) => replyFn(c)) };
}

// ── Slash commands handler ────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const remaining = cmd.cooldowns.check(interaction.user.id, interaction.commandName);
  if (remaining !== null) {
    const msg = remaining === -1 ? '⛔ Bloqueado temporalmente por spam. Intenta en 5 minutos.' : `⏳ Espera **${cmd.CooldownManager?.formatTime?.(remaining) || Math.ceil(remaining/1000) + 's'}** antes de usar este comando de nuevo.`;
    return interaction.reply({ content: msg, ephemeral: true });
  }

  await interaction.deferReply().catch(() => {});
  const ctx = {
    ...makeCtx(
      interaction.user.id, interaction.user.username, interaction.guild,
      (c) => interaction.editReply(c),
      async (c) => { await interaction.editReply(c); return interaction.fetchReply().catch(() => null); },
      interaction.channelId,
    ),
    channel: interaction.channel,
    clientUserId: client.user?.id,
    isSlash: true,
  };

  try {
    switch (interaction.commandName) {
      case 'verificar':        await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':        await cmd.cmdConfirmar(ctx); break;
      case 'captcha':          await cmd.cmdCaptcha(ctx); break;
      case 'perfil':           await cmd.cmdPerfil(ctx, interaction.options.getUser('usuario')); break;
      case 'avatar':           await cmd.cmdAvatar(ctx, interaction.options.getUser('usuario')); break;
      case 'estado':           await cmd.cmdEstado(ctx, interaction.options.getUser('usuario')); break;
      case 'grupos':           await cmd.cmdGrupos(ctx, interaction.options.getUser('usuario')); break;
      case 'amigos':           await cmd.cmdAmigos(ctx, interaction.options.getUser('usuario')); break;
      case 'insignias':        await cmd.cmdInsignias(ctx, interaction.options.getUser('usuario')); break;
      case 'historial-nombres':await cmd.cmdHistorialNombres(ctx, interaction.options.getUser('usuario')); break;
      case 'buscar':           await cmd.cmdBuscar(ctx, interaction.options.getString('usuario')); break;
      case 'outfit':           await cmd.cmdOutfit(ctx, interaction.options.getUser('usuario')); break;
      case 'rap':              await cmd.cmdRAP(ctx, interaction.options.getUser('usuario')); break;
      case 'catalogo':         await cmd.cmdCatalogo(ctx, interaction.options.getString('item')); break;
      case 'murogrupo':        await cmd.cmdMuroGrupo(ctx, interaction.options.getString('grupo_id')); break;
      case 'robloxstatus':     await cmd.cmdRobloxStatus(ctx); break;
      case 'sugerencia':       await cmd.cmdSugerencia(ctx, interaction.options.getString('texto')); break;
      case 'premium':          await cmd.cmdPremiumStatus(ctx); break;
      case 'flex':             await cmd.cmdFlex(ctx); break;
      case 'historial':        await cmd.cmdHistorial(ctx); break;
      case 'comparar':         await cmd.cmdComparar(ctx, interaction.options.getUser('usuario1'), interaction.options.getUser('usuario2')); break;
      case 'mistats':          await cmd.cmdMiStats(ctx); break;
      case 'addalt':           await cmd.cmdAddAlt(ctx, interaction.options.getString('usuario')); break;
      case 'alts':             await cmd.cmdAlts(ctx); break;
      case 'setflexbg':        await cmd.cmdSetFlexBg(ctx, interaction.options.getString('url')); break;
      case 'puntos':           await cmd.cmdPuntos(ctx, interaction.options.getUser('usuario')); break;
      case 'daily':            await cmd.cmdDaily(ctx); break;
      case 'logros':           await cmd.cmdLogros(ctx, interaction.options.getUser('usuario')); break;
      case 'toplocal':         await cmd.cmdTopLocal(ctx); break;
      case 'topglobal':        await cmd.cmdTopGlobal(ctx); break;
      case 'tienda':           await cmd.cmdTienda(ctx); break;
      case 'comprar':          await cmd.cmdComprar(ctx, interaction.options.getString('id')); break;
      case 'rob':              await cmd.cmdRob(ctx, interaction.options.getUser('usuario')); break;
      case 'trivia':           await cmd.cmdTrivia(ctx, interaction.options.getString('categoria')); break;
      case 'triviacustom': {
        const sub = interaction.options.getSubcommand();
        if (sub === 'add') await cmd.cmdTriviaCustom(ctx, 'add', interaction.options.getString('pregunta'));
        else if (sub === 'list') await cmd.cmdTriviaCustom(ctx, 'list');
        else if (sub === 'play') await cmd.cmdTriviaCustom(ctx, 'play');
        break;
      }
      case 'whois':            await cmd.cmdWhois(ctx, interaction.options.getUser('usuario')); break;
      case 'syncall':          await cmd.cmdSyncAll(ctx); break;
      case 'dms':              await cmd.cmdDMs(ctx, interaction.options.getBoolean('activar')); break;
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
      case 'setsuggestions':   await cmd.cmdSetSuggestions(ctx, interaction.options.getChannel('canal').id); break;
      case 'setnickname':      await cmd.cmdSetNickname(ctx, interaction.options.getString('formato')); break;
      case 'setlang':          await cmd.cmdSetLang(ctx, interaction.options.getString('idioma')); break;
      case 'setprefix':        await cmd.cmdSetPrefix(ctx, interaction.options.getString('prefijo')); break;
      case 'setvoicecategory': await cmd.cmdSetVoiceCategory(ctx, interaction.options.getChannel('categoria').id); break;
      case 'activarpremium':    await cmd.cmdActivarPremium(ctx, interaction.options.getString('usuario_id'), interaction.options.getInteger('dias')); break;
      case 'desactivarpremium': await cmd.cmdDesactivarPremium(ctx, interaction.options.getString('usuario_id')); break;
      case 'encarcelar':       await cmd.cmdEncarcelar(ctx, interaction.options.getUser('usuario'), interaction.options.getInteger('horas') ?? 1); break;
      case 'setpuntos':        await cmd.cmdSetPuntos(ctx, interaction.options.getUser('usuario'), interaction.options.getInteger('cantidad')); break;
      case 'addpuntos':        await cmd.cmdAddPuntos(ctx, interaction.options.getUser('usuario'), interaction.options.getInteger('cantidad')); break;
      case 'ownercolor':       await cmd.cmdOwnerColor(ctx, interaction.options.getString('color')); break;
      case 'cambiarcolor':     await cmd.cmdCambiarColor(ctx, interaction.options.getString('id')); break;
      case 'buy':              await cmd.cmdBuyPremium(ctx); break;
      case 'fianza':           await cmd.cmdFianza(ctx, interaction.options.getUser('usuario')); break;
      case 'senddm':           await cmd.cmdSendDM(ctx, interaction.options.getString('usuario_id'), interaction.options.getString('mensaje')); break;
      case 'playtime':         await cmd.cmdPlaytime(ctx, interaction.options.getUser('usuario')); break;
    }
    // Incrementar contador global de comandos
    const totalCmds = parseInt(await redisGet('total_commands_executed') || '0');
    await redisSet('total_commands_executed', totalCmds + 1);
  } catch (e) {
    console.error(`Error en /${interaction.commandName}:`, e);
    ctx.reply('❌ Error inesperado. Intenta de nuevo.').catch(() => {});
  }
});

// ── Comandos de texto ─────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const customPrefix = await getGuildPrefix(message.guild.id);
  const prefixes     = customPrefix ? [customPrefix, ...DEFAULT_PREFIXES] : DEFAULT_PREFIXES;
  const prefix       = prefixes.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const parts   = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);
  const users   = [...message.mentions.users.values()];

  const remaining = cmd.cooldowns.check(message.author.id, cmdName);
  if (remaining !== null) {
    const msg = remaining === -1 ? '⛔ Bloqueado temporalmente.' : `⏳ Espera **${cmd.CooldownManager?.formatTime?.(remaining) || Math.ceil(remaining/1000) + 's'}**.`;
    return message.reply(msg);
  }

  const ctx = {
    ...makeCtx(
      message.author.id, message.author.username, message.guild,
      (c) => message.reply(c), async (c) => message.reply(c),
      message.channelId,
    ),
    channel: message.channel,
    clientUserId: client.user.id,
    isSlash: false,
  };

  try {
    switch (cmdName) {
      case 'verificar':          await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':          await cmd.cmdConfirmar(ctx); break;
      case 'captcha':            await cmd.cmdCaptcha(ctx); break;
      case 'perfil':             await cmd.cmdPerfil(ctx, users[0]); break;
      case 'avatar':             await cmd.cmdAvatar(ctx, users[0]); break;
      case 'estado':             await cmd.cmdEstado(ctx, users[0]); break;
      case 'grupos':             await cmd.cmdGrupos(ctx, users[0]); break;
      case 'amigos':             await cmd.cmdAmigos(ctx, users[0]); break;
      case 'insignias':          await cmd.cmdInsignias(ctx, users[0]); break;
      case 'historial-nombres':  await cmd.cmdHistorialNombres(ctx, users[0]); break;
      case 'buscar':             await cmd.cmdBuscar(ctx, args[0]); break;
      case 'whoislox':           await cmd.cmdWhoisRoblox(ctx, args[0]); break;
      case 'outfit':             await cmd.cmdOutfit(ctx, users[0]); break;
      case 'rap':                await cmd.cmdRAP(ctx, users[0]); break;
      case 'catalogo':           await cmd.cmdCatalogo(ctx, args.join(' ')); break;
      case 'murogrupo':          await cmd.cmdMuroGrupo(ctx, args[0]); break;
      case 'robloxstatus':       await cmd.cmdRobloxStatus(ctx); break;
      case 'sugerencia':         await cmd.cmdSugerencia(ctx, args.join(' ')); break;
      case 'lfg':                await cmd.cmdLFG(ctx, args.slice(0, -1).join(' ') || args.join(' '), args[args.length - 1]); break;
      case 'premium':            await cmd.cmdPremiumStatus(ctx); break;
      case 'flex':               await cmd.cmdFlex(ctx); break;
      case 'historial':          await cmd.cmdHistorial(ctx); break;
      case 'comparar':           await cmd.cmdComparar(ctx, users[0], users[1]); break;
      case 'mistats':            await cmd.cmdMiStats(ctx); break;
      case 'addalt':             await cmd.cmdAddAlt(ctx, args[0]); break;
      case 'alts':               await cmd.cmdAlts(ctx); break;
      case 'setflexbg':          await cmd.cmdSetFlexBg(ctx, args[0]); break;
      case 'puntos':             await cmd.cmdPuntos(ctx, users[0]); break;
      case 'daily':              await cmd.cmdDaily(ctx); break;
      case 'logros':             await cmd.cmdLogros(ctx, users[0]); break;
      case 'coinflip':           await cmd.cmdCoinFlip(ctx, args[0]); break;
      case 'pay':                await cmd.cmdPay(ctx, users[0], args[1]); break;
      case 'toplocal':           await cmd.cmdTopLocal(ctx); break;
      case 'topglobal':          await cmd.cmdTopGlobal(ctx); break;
      case 'tienda':             await cmd.cmdTienda(ctx); break;
      case 'comprar':            await cmd.cmdComprar(ctx, args[0]); break;
      case 'rob':                await cmd.cmdRob(ctx, users[0]); break;
      case 'trivia':             await cmd.cmdTrivia(ctx, args[0]); break;
      case 'whois':              await cmd.cmdWhois(ctx, users[0]); break;
      case 'syncall':            await cmd.cmdSyncAll(ctx); break;
      case 'dms':                await cmd.cmdDMs(ctx, args[0]?.toLowerCase() === 'true' ? true : (args[0]?.toLowerCase() === 'false' ? false : undefined)); break;
      case 'actualizar':         await cmd.cmdActualizar(ctx); break;
      case 'desvincular':        await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':              await cmd.cmdAyuda(ctx); break;
      case 'permitir':           await cmd.cmdPermitir(ctx, args[0]?.toLowerCase()); break;
      case 'bloquear':           await cmd.cmdBloquear(ctx, args[0]?.toLowerCase()); break;
      case 'alertas':            await cmd.cmdAlertas(ctx, args[0]?.toLowerCase(), users[0]); break;
      case 'setverifiedrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol. Ej: `!setverifiedrole @Verificado`');
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
        if (!args[0] || !args[1] || !role) return message.reply('❌ Uso: `!bindrole <id_grupo> <rango_min> @rol`');
        await cmd.cmdBindRole(ctx, args[0], args[1], role); break;
      }
      case 'unbindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas Gestionar Roles.');
        if (!args[0]) return message.reply('❌ Uso: `!unbindrole <id_grupo>`');
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
      case 'setsuggestions': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Necesitas Administrar Servidor.');
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply('❌ Menciona un canal. Ej: `!setsuggestions #sugerencias`');
        await cmd.cmdSetSuggestions(ctx, ch.id); break;
      }
      case 'setprefix': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return message.reply('❌ Necesitas Administrar Servidor.');
        await cmd.cmdSetPrefix(ctx, args[0]); break;
      }
      case 'setvoicecategory': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Necesitas Gestionar Canales.');
        const cat = message.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes(args.join(' ').toLowerCase()));
        if (!cat) return message.reply('❌ Categoría no encontrada.');
        await cmd.cmdSetVoiceCategory(ctx, cat.id); break;
      }
      case 'activarpremium':      await cmd.cmdActivarPremium(ctx, args[0], parseInt(args[1])); break;
      case 'desactivarpremium':   await cmd.cmdDesactivarPremium(ctx, args[0]); break;
      case 'encarcelar':          await cmd.cmdEncarcelar(ctx, users[0], parseInt(args[1]) || 1); break;
      case 'setpuntos':           await cmd.cmdSetPuntos(ctx, users[0], parseInt(args[1])); break;
      case 'addpuntos':           await cmd.cmdAddPuntos(ctx, users[0], parseInt(args[1])); break;
      case 'buy':                 await cmd.cmdBuyPremium(ctx); break;
      case 'fianza':              await cmd.cmdFianza(ctx, users[0]); break;
      case 'senddm':              await cmd.cmdSendDM(ctx, args[0], args.slice(1).join(' ')); break;
      case 'playtime':            await cmd.cmdPlaytime(ctx, users[0]); break;
    }
    const totalCmds = parseInt(await redisGet('total_commands_executed') || '0');
    await redisSet('total_commands_executed', totalCmds + 1);
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
    message.reply('❌ Error inesperado. Intenta de nuevo.');
  }
});

// ── Eventos ───────────────────────────────────────────────────
client.on('guildMemberAdd', (member) => cmd.onMemberJoin(member).catch(console.error));
client.on('guildCreate',    (guild)  => cmd.onGuildAdd(guild).catch(console.error));

// ── Servidor HTTP (Página web + API + Webhook PayPal + Health Check) ─
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Servir archivos estáticos desde /public
  if (req.method === 'GET') {
    let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const contentType = {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        }[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    } catch (e) {}
  }

  // Endpoint de estadísticas para la página web
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    try {
      const premiumList = await redisGet('premium_users_list') || [];
      const totalUsers = parseInt(await redisGet('total_verified_users') || '0');
      const totalCommands = parseInt(await redisGet('total_commands_executed') || '0');
      const serverCount = client.guilds.cache.size;

      const stats = {
        servers: serverCount,
        users: totalUsers,
        commands: totalCommands,
        premium: premiumList.length
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    } catch (e) {
      console.error('Error en /api/stats:', e);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Error interno' }));
      return;
    }
  }

  // Health check para Railway
  if (req.method === 'GET' && (url.pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // Webhook de PayPal (IPN)
  if (req.method === 'POST' && url.pathname === '/paypal-webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = new URLSearchParams(body);
        const paymentStatus = params.get('payment_status');
        const itemName = params.get('item_name') || '';
        const mcGross = parseFloat(params.get('mc_gross') || '0');
        const custom = params.get('custom');
        const txnId = params.get('txn_id');

        if (paymentStatus !== 'Completed') {
          console.log(`⚠️ Pago no completado: ${paymentStatus}`);
          res.writeHead(200); res.end(); return;
        }

        if (!custom) {
          console.log('⚠️ Webhook sin ID de Discord (custom)');
          res.writeHead(200); res.end(); return;
        }

        let days;
        if (itemName.includes('30') || mcGross >= 4.99) days = 30;
        else if (itemName.includes('7') || mcGross >= 1.99) days = 7;
        else {
          console.log(`⚠️ No se pudo determinar el plan: ${itemName} / $${mcGross}`);
          res.writeHead(200); res.end(); return;
        }

        const expDate = new Date(Date.now() + days * 86400000).toISOString();
        await redisSet(`premium:${custom}`, {
          activatedAt: new Date().toISOString(),
          expiresAt: expDate,
          source: 'paypal',
          amount: mcGross,
          durationDays: days,
          txnId
        });

        const pList = await redisGet('premium_users_list') || [];
        if (!pList.includes(custom)) {
          pList.push(custom);
          await redisSet('premium_users_list', pList);
        }

        console.log(`✅ PayPal: Premium ${days} días activado para ${custom} ($${mcGross})`);

        try {
          const user = await client.users.fetch(custom);
          await user.send(`✅ **¡Pago recibido!** Tu Premium de **${days} días** ha sido activado.\nUsa \`/premium\` para verificarlo.`);
        } catch {}

        res.writeHead(200); res.end();
      } catch (e) {
        console.error('Error en webhook PayPal:', e);
        res.writeHead(500); res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── Arranque ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
  await cmd.startPresenceMonitor(client);
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => console.log(`🌐 Servidor web activo en puerto ${PORT}`));
});

client.login(TOKEN);
