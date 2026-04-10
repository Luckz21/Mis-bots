// ============================================================
//  bot.js  —  Punto de entrada v6.0
// ============================================================
const fetch = require('node-fetch');

process.on("uncaughtException", (err) => {
  console.error("💥 uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 unhandledRejection:", err);
});
const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');

const cmd = require('./commands.js');

const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIXES  = ['!', '?'];

if (!TOKEN)     { console.error('❌ Falta DISCORD_TOKEN');  process.exit(1); }
if (!CLIENT_ID) { console.error('❌ Falta CLIENT_ID');      process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('❌ Faltan variables de Upstash'); process.exit(1);
}

// ── Comandos slash ────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox').addStringOption(o => o.setName('usuario').setDescription('Tu usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta de Roblox'),
  new SlashCommandBuilder().setName('perfil').setDescription('Perfil completo de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Avatar de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Estado de presencia en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Grupos de Roblox con paginación').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('amigos').setDescription('Lista de amigos de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('insignias').setDescription('Insignias recientes de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('inventario').setDescription('Inventario de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('comparar').setDescription('Compara dos cuentas de Roblox')
    .addUserOption(o => o.setName('usuario1').setDescription('Primer usuario').setRequired(true))
    .addUserOption(o => o.setName('usuario2').setDescription('Segundo usuario').setRequired(true)),
  new SlashCommandBuilder().setName('ayuda').setDescription('Lista todos los comandos'),
  new SlashCommandBuilder().setName('setverifiedrole').setDescription('[Admin] Rol que se da al verificarse').addRoleOption(o => o.setName('rol').setDescription('El rol').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('bindrole').setDescription('[Admin] Vincula grupo Roblox → rol Discord')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo de Roblox').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo (0=cualquiera)').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol a asignar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('unbindrole').setDescription('[Admin] Elimina vinculación de grupo').addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder().setName('listroles').setDescription('[Admin] Lista vinculaciones de roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map(c => c.toJSON());

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log(`✅ ${slashCommands.length} comandos slash registrados`);
  } catch (e) {
    console.error('❌ Error registrando slash commands:', e.message);
  }
}

// ── Cliente ───────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Función para que commands.js pueda hacer reply y también devolver el mensaje
// (necesario para los botones interactivos)
function makeCtx(userId, username, guild, replyFn, fetchFn) {
  return {
    userId, username, guild,
    reply: replyFn,
    replyAndFetch: fetchFn,
  };
}

// ── Slash commands ────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply().catch(() => {});

  const ctx = makeCtx(
    interaction.user.id,
    interaction.user.username,
    interaction.guild,
    (content) => interaction.editReply(content),
    async (content) => {
      await interaction.editReply(content);
      return interaction.fetchReply().catch(() => null);
    }
  );

  try {
    switch (interaction.commandName) {
      case 'verificar':       await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':       await cmd.cmdConfirmar(ctx); break;
      case 'perfil':          await cmd.cmdPerfil(ctx, interaction.options.getUser('usuario')); break;
      case 'avatar':          await cmd.cmdAvatar(ctx, interaction.options.getUser('usuario')); break;
      case 'estado':          await cmd.cmdEstado(ctx, interaction.options.getUser('usuario')); break;
      case 'grupos':          await cmd.cmdGrupos(ctx, interaction.options.getUser('usuario')); break;
      case 'amigos':          await cmd.cmdAmigos(ctx, interaction.options.getUser('usuario')); break;
      case 'insignias':       await cmd.cmdInsignias(ctx, interaction.options.getUser('usuario')); break;
      case 'inventario':      await cmd.cmdInventario(ctx, interaction.options.getUser('usuario')); break;
      case 'buscar':          await cmd.cmdBuscar(ctx, interaction.options.getString('usuario')); break;
      case 'comparar':        await cmd.cmdComparar(ctx, interaction.options.getUser('usuario1'), interaction.options.getUser('usuario2')); break;
      case 'actualizar':      await cmd.cmdActualizar(ctx); break;
      case 'desvincular':     await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':           await cmd.cmdAyuda(ctx); break;
      case 'setverifiedrole': await cmd.cmdSetVerifiedRole(ctx, interaction.options.getRole('rol')); break;
      case 'bindrole':        await cmd.cmdBindRole(ctx, interaction.options.getString('grupo_id'), interaction.options.getInteger('rango_minimo'), interaction.options.getRole('rol')); break;
      case 'unbindrole':      await cmd.cmdUnbindRole(ctx, interaction.options.getString('grupo_id')); break;
      case 'listroles':       await cmd.cmdListRoles(ctx); break;
    }
  } catch (e) {
    console.error(`Error en /${interaction.commandName}:`, e);
    ctx.reply('❌ Error inesperado. Intenta de nuevo.').catch(() => {});
  }
});

// ── Comandos de texto (!comando / ?comando) ───────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const parts   = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);
  const targetUser  = message.mentions.users.first() ?? null;
  const targetUser2 = message.mentions.users.size > 1 ? [...message.mentions.users.values()][1] : null;

  const ctx = makeCtx(
    message.author.id,
    message.author.username,
    message.guild,
    (content) => message.reply(content),
    async (content) => message.reply(content)
  );

  try {
    switch (cmdName) {
      case 'verificar':   await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':   await cmd.cmdConfirmar(ctx); break;
      case 'perfil':      await cmd.cmdPerfil(ctx, targetUser); break;
      case 'avatar':      await cmd.cmdAvatar(ctx, targetUser); break;
      case 'estado':      await cmd.cmdEstado(ctx, targetUser); break;
      case 'grupos':      await cmd.cmdGrupos(ctx, targetUser); break;
      case 'amigos':      await cmd.cmdAmigos(ctx, targetUser); break;
      case 'insignias':   await cmd.cmdInsignias(ctx, targetUser); break;
      case 'inventario':  await cmd.cmdInventario(ctx, targetUser); break;
      case 'buscar':      await cmd.cmdBuscar(ctx, args[0]); break;
      case 'comparar':    await cmd.cmdComparar(ctx, targetUser, targetUser2); break;
      case 'actualizar':  await cmd.cmdActualizar(ctx); break;
      case 'desvincular': await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':       await cmd.cmdAyuda(ctx); break;
      case 'permitir':    await cmd.cmdPermitir(ctx, args[0]?.toLowerCase()); break;
      case 'bloquear':    await cmd.cmdBloquear(ctx, args[0]?.toLowerCase()); break;
      case 'alertas':     await cmd.cmdAlertas(ctx, args[0]?.toLowerCase(), targetUser); break;
      case 'setverifiedrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas **Gestionar Roles**.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol. Ej: `!setverifiedrole @Verificado`');
        await cmd.cmdSetVerifiedRole(ctx, role); break;
      }
      case 'bindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas **Gestionar Roles**.');
        const role = message.mentions.roles.first();
        if (!args[0] || !args[1] || !role) return message.reply('❌ Uso: `!bindrole <groupId> <rangoMin> @rol`');
        await cmd.cmdBindRole(ctx, args[0], args[1], role); break;
      }
      case 'unbindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return message.reply('❌ Necesitas **Gestionar Roles**.');
        if (!args[0]) return message.reply('❌ Uso: `!unbindrole <groupId>`');
        await cmd.cmdUnbindRole(ctx, args[0]); break;
      }
      case 'listroles': await cmd.cmdListRoles(ctx); break;
    }
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
    message.reply('❌ Error inesperado. Intenta de nuevo.');
  }
});

// ── Arranque ──────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
  await cmd.startPresenceMonitor(client);
});

client.login(TOKEN);
