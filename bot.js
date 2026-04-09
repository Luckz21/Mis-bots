// ============================================================
//  bot.js  —  Punto de entrada principal
//
//  Este archivo se encarga SOLO de:
//    1. Crear el cliente de Discord
//    2. Registrar los comandos slash (/) con Discord
//    3. Escuchar eventos (slash commands e interacciones)
//    4. Escuchar mensajes de texto (!comando / ?comando)
//    5. Llamar a la función correcta en commands.js
//
//  La lógica de los comandos está en commands.js
//  Las llamadas a Roblox están en roblox.js
//  El almacenamiento está en database.js
// ============================================================

const {
  Client, GatewayIntentBits,
  REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
} = require('discord.js');

const cmd = require('./commands.js');

// ── Configuración ─────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIXES  = ['!', '?'];

// Validar variables obligatorias antes de arrancar
if (!TOKEN)     { console.error('❌ Falta DISCORD_TOKEN en las variables de entorno');  process.exit(1); }
if (!CLIENT_ID) { console.error('❌ Falta CLIENT_ID en las variables de entorno');      process.exit(1); }
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('❌ Faltan UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

// ── Definición de comandos slash ──────────────────────────────
// Solo se define la estructura (nombre, descripción, opciones).
// La lógica real de cada uno está en commands.js.

const slashCommands = [
  // Verificación
  new SlashCommandBuilder().setName('verificar').setDescription('Vincula tu cuenta de Roblox con Discord').addStringOption(o => o.setName('usuario').setDescription('Tu usuario de Roblox').setRequired(true)),
  new SlashCommandBuilder().setName('confirmar').setDescription('Confirma tu verificación después de poner el código en tu perfil'),
  new SlashCommandBuilder().setName('actualizar').setDescription('Re-sincroniza tus roles de Discord con tu cuenta de Roblox'),
  new SlashCommandBuilder().setName('desvincular').setDescription('Desvincula tu cuenta de Roblox de este Discord'),

  // Información
  new SlashCommandBuilder().setName('perfil').setDescription('Muestra el perfil completo de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('avatar').setDescription('Muestra el avatar de Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('estado').setDescription('Muestra si el usuario está conectado, jugando o desconectado en Roblox').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('grupos').setDescription('Muestra los grupos de Roblox con rol y rango').addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord (opcional)')),
  new SlashCommandBuilder().setName('buscar').setDescription('Busca información pública de cualquier usuario de Roblox').addStringOption(o => o.setName('usuario').setDescription('Nombre de usuario en Roblox').setRequired(true)),

  // Ayuda
  new SlashCommandBuilder().setName('ayuda').setDescription('Muestra todos los comandos disponibles'),

  // Administración (solo para quienes tienen el permiso Gestionar Roles)
  new SlashCommandBuilder().setName('setverifiedrole')
    .setDescription('[Admin] Define el rol que se asigna automáticamente al verificarse')
    .addRoleOption(o => o.setName('rol').setDescription('El rol a asignar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder().setName('bindrole')
    .setDescription('[Admin] Vincula un grupo de Roblox a un rol de Discord')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID numérico del grupo de Roblox').setRequired(true))
    .addIntegerOption(o => o.setName('rango_minimo').setDescription('Rango mínimo requerido (0 = cualquier miembro)').setRequired(true))
    .addRoleOption(o => o.setName('rol').setDescription('Rol de Discord a asignar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder().setName('unbindrole')
    .setDescription('[Admin] Elimina la vinculación de un grupo de Roblox')
    .addStringOption(o => o.setName('grupo_id').setDescription('ID del grupo a desvincular').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder().setName('listroles')
    .setDescription('[Admin] Lista todas las vinculaciones de roles configuradas')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

].map(c => c.toJSON());

// ── Registro de comandos slash ────────────────────────────────
// Los comandos se registran globalmente (en todos los servidores).
// Puede tardar hasta 1 hora en aparecer en servidores nuevos,
// pero en servidores donde el bot ya está suelen aparecer de inmediato.

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: slashCommands });
    console.log(`✅ ${slashCommands.length} comandos slash registrados globalmente`);
  } catch (e) {
    console.error('❌ Error registrando comandos slash:', e.message);
  }
}

// ── Cliente de Discord ────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,    // para ver estado de Discord
    GatewayIntentBits.GuildMembers,      // para asignar roles
    GatewayIntentBits.GuildMessages,     // para leer mensajes con !/?
    GatewayIntentBits.MessageContent,    // para leer el contenido del mensaje
  ],
});

// ── Manejador de comandos slash (/) ──────────────────────────
// Cuando alguien usa /comando, Discord envía una "interaction".
// Diferimos la respuesta (".deferReply") porque algunas operaciones
// tardan más de 3 segundos y Discord cancelaría la interacción.

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply().catch(() => {});

  // Objeto ctx unificado: permite que las funciones de commands.js
  // no necesiten saber si fue un slash o un prefijo
  const ctx = {
    userId:   interaction.user.id,
    username: interaction.user.username,
    guild:    interaction.guild,
    reply:    (content) => interaction.editReply(content),
  };

  try {
    switch (interaction.commandName) {
      case 'verificar':       await cmd.cmdVerificar(ctx, interaction.options.getString('usuario')); break;
      case 'confirmar':       await cmd.cmdConfirmar(ctx); break;
      case 'perfil':          await cmd.cmdPerfil(ctx, interaction.options.getUser('usuario')); break;
      case 'avatar':          await cmd.cmdAvatar(ctx, interaction.options.getUser('usuario')); break;
      case 'estado':          await cmd.cmdEstado(ctx, interaction.options.getUser('usuario')); break;
      case 'grupos':          await cmd.cmdGrupos(ctx, interaction.options.getUser('usuario')); break;
      case 'buscar':          await cmd.cmdBuscar(ctx, interaction.options.getString('usuario')); break;
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
    ctx.reply('❌ Ocurrió un error inesperado. Intenta de nuevo.').catch(() => {});
  }
});

// ── Manejador de comandos de texto (! / ?) ────────────────────
// Cuando alguien escribe !comando o ?comando en un canal de texto.

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = PREFIXES.find(p => message.content.startsWith(p));
  if (!prefix) return;

  const parts = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args    = parts.slice(1);

  const ctx = {
    userId:   message.author.id,
    username: message.author.username,
    guild:    message.guild,
    reply:    (content) => message.reply(content),
  };

  // Para comandos que mencionan a otro usuario (@alguien)
  const targetUser = message.mentions.users.first() ?? null;

  try {
    switch (cmdName) {
      case 'verificar':   await cmd.cmdVerificar(ctx, args[0]); break;
      case 'confirmar':   await cmd.cmdConfirmar(ctx); break;
      case 'perfil':      await cmd.cmdPerfil(ctx, targetUser); break;
      case 'avatar':      await cmd.cmdAvatar(ctx, targetUser); break;
      case 'estado':      await cmd.cmdEstado(ctx, targetUser); break;
      case 'grupos':      await cmd.cmdGrupos(ctx, targetUser); break;
      case 'buscar':      await cmd.cmdBuscar(ctx, args[0]); break;
      case 'actualizar':  await cmd.cmdActualizar(ctx); break;
      case 'desvincular': await cmd.cmdDesvincular(ctx); break;
      case 'ayuda':       await cmd.cmdAyuda(ctx); break;

      // Privacidad (solo disponible con prefijo por ser comandos de dos palabras)
      case 'permitir':    await cmd.cmdPermitir(ctx, args[0]?.toLowerCase()); break;
      case 'bloquear':    await cmd.cmdBloquear(ctx, args[0]?.toLowerCase()); break;

      // Comandos de administración con prefijo
      case 'setverifiedrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return message.reply('❌ Necesitas el permiso **Gestionar Roles** para usar este comando.');
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Menciona un rol. Ejemplo: `!setverifiedrole @Verificado`');
        await cmd.cmdSetVerifiedRole(ctx, role);
        break;
      }
      case 'bindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return message.reply('❌ Necesitas el permiso **Gestionar Roles**.');
        const role = message.mentions.roles.first();
        if (!args[0] || !args[1] || !role)
          return message.reply('❌ Uso: `!bindrole <groupId> <rangoMin> @rol`\nEjemplo: `!bindrole 123456 5 @Miembro`');
        await cmd.cmdBindRole(ctx, args[0], args[1], role);
        break;
      }
      case 'unbindrole': {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
          return message.reply('❌ Necesitas el permiso **Gestionar Roles**.');
        if (!args[0]) return message.reply('❌ Uso: `!unbindrole <groupId>`');
        await cmd.cmdUnbindRole(ctx, args[0]);
        break;
      }
      case 'listroles': await cmd.cmdListRoles(ctx); break;
    }
  } catch (e) {
    console.error(`Error en ${prefix}${cmdName}:`, e);
    message.reply('❌ Ocurrió un error inesperado. Intenta de nuevo.');
  }
});

// ── Arranque ──────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  await registerSlashCommands();
});

client.login(TOKEN);
