// ============================================================
//  commands.js
//  Toda la lógica de los comandos del bot.
//
//  Cada función recibe un objeto "ctx" (contexto) que tiene:
//    ctx.userId   → ID de Discord del autor
//    ctx.username → nombre del autor
//    ctx.guild    → servidor donde se ejecutó
//    ctx.reply()  → función para responder
//
//  Esto permite que la misma función sirva para comandos slash (/)
//  y comandos de texto (!), ya que ambos producen el mismo ctx.
// ============================================================

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db     = require('./database.js');
const roblox = require('./roblox.js');

// Verificaciones pendientes (en memoria, expiran en 10 minutos)
// Se guardan aquí y no en Redis porque son temporales
const pendingVerifications = {};

// Genera un código único para verificación, ej: RBX-AB3X9K
function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// ── Asignación de roles ──────────────────────────────────────
// Esta función se llama al verificarse (/confirmar) y al actualizar (/actualizar).
// Asigna dos tipos de roles:
//   1. El rol genérico de "Verificado" configurado con /setverifiedrole
//   2. Los roles basados en grupos de Roblox configurados con /bindrole

async function syncRoles(guild, discordId, robloxId) {
  const config = await db.getGuildConf(guild.id);
  if (!config) return; // El servidor no tiene ningún rol configurado aún

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  // Construir la lista de roles a asignar
  const rolesToAdd = [];

  if (config.verifiedRoleId) {
    rolesToAdd.push(config.verifiedRoleId);
  }

  if (config.bindings?.length > 0) {
    const groups = await roblox.getGroups(robloxId);
    for (const binding of config.bindings) {
      // Buscar si el usuario pertenece a este grupo con el rango mínimo requerido
      const membership = groups.find(g => String(g.group.id) === String(binding.groupId));
      if (membership && membership.role.rank >= binding.minRank) {
        rolesToAdd.push(binding.roleId);
      }
    }
  }

  for (const roleId of rolesToAdd) {
    await member.roles.add(roleId).catch(e =>
      console.error(`No pude asignar rol ${roleId} a ${discordId}:`, e.message)
    );
  }
}

// ── Verificación ─────────────────────────────────────────────

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername)
    return ctx.reply('❌ Debes proporcionar tu nombre de usuario de Roblox.\nEjemplo: `/verificar MiUsuario`');

  const robloxUser = await roblox.getUserByName(robloxUsername);
  if (!robloxUser)
    return ctx.reply('❌ No encontré ese usuario en Roblox. Asegúrate de escribir el nombre exacto.');

  const code = generateCode();
  pendingVerifications[ctx.userId] = {
    robloxId: robloxUser.id,
    robloxUsername: robloxUser.name,
    code,
  };

  const embed = new EmbedBuilder()
    .setTitle('🔐 Verificación de cuenta Roblox')
    .setColor(0xFFAA00)
    .setDescription(
      `**Paso 1:** Abre Roblox y ve a tu perfil\n` +
      `**Paso 2:** Edita tu **descripción** y agrega exactamente este código:\n\n` +
      `\`\`\`${code}\`\`\`\n` +
      `**Paso 3:** Vuelve aquí y usa \`/confirmar\` o \`!confirmar\`\n\n` +
      `⏱️ Tienes **10 minutos**. Puedes borrar el código después de confirmar.`
    )
    .addFields({ name: '👤 Cuenta detectada', value: `**${robloxUser.name}** · ID: \`${robloxUser.id}\`` });

  ctx.reply({ embeds: [embed] });

  // Limpiar la verificación pendiente después de 10 minutos
  setTimeout(() => {
    if (pendingVerifications[ctx.userId]?.code === code)
      delete pendingVerifications[ctx.userId];
  }, 10 * 60 * 1000);
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending)
    return ctx.reply('❌ No tienes ninguna verificación pendiente. Usa `/verificar <tu_usuario>` primero.');

  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile)
    return ctx.reply('❌ No pude acceder al perfil de Roblox. Intenta de nuevo en unos segundos.');

  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(
      `❌ No encontré el código \`${pending.code}\` en la descripción de **${pending.robloxUsername}**.\n` +
      `Asegúrate de haberlo guardado. A veces Roblox tarda unos segundos en actualizar.`
    );

  // Guardar al usuario en la base de datos
  await db.saveUser(ctx.userId, {
    robloxId:        pending.robloxId,
    robloxUsername:  pending.robloxUsername,
    verifiedAt:      new Date().toISOString(),
    privacyPresence: false, // por defecto, nadie puede ver tu juego
    privacyProfile:  true,  // por defecto, tu perfil sí es visible
  });
  delete pendingVerifications[ctx.userId];

  // Asignar roles automáticamente
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  const embed = new EmbedBuilder()
    .setTitle('✅ ¡Cuenta verificada exitosamente!')
    .setColor(0x57F287)
    .setDescription(
      `Tu Discord quedó vinculado a **${pending.robloxUsername}** en Roblox.\n\n` +
      `**Privacidad por defecto:**\n` +
      `• Tu perfil es **visible** para otros ✅\n` +
      `• Tu presencia en juegos es **privada** 🔒\n\n` +
      `Usa \`!permitir presencia\` si quieres que otros vean en qué juegas.`
    );

  ctx.reply({ embeds: [embed] });
}

// ── Perfil completo ──────────────────────────────────────────

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) {
    const who = target.id === ctx.userId ? 'No tienes' : `**${target.username}** no tiene`;
    return ctx.reply(`❌ ${who} una cuenta de Roblox vinculada.`);
  }
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil configurado como privado.`);

  // Hacer todas las llamadas a Roblox en paralelo para ser más rápidos
  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    roblox.getProfile(entry.robloxId),
    roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId),
    roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId),
    roblox.getGroups(entry.robloxId),
  ]);

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const groupList = groups.length
    ? groups.slice(0, 5).map(g => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join('\n')
    : '_Sin grupos públicos_';

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID de Roblox',  value: `\`${entry.robloxId}\``, inline: true },
      { name: '📅 Cuenta creada', value: createdAt,                inline: true },
      { name: '👥 Amigos',        value: `${friends}`,             inline: true },
      { name: '👣 Seguidores',    value: `${followers}`,           inline: true },
      { name: '➡️ Siguiendo',     value: `${following}`,           inline: true },
      { name: '🏰 Grupos',        value: `${groups.length}`,       inline: true },
      { name: '📝 Descripción',   value: profile.description?.slice(0, 300) || '_Sin descripción_' },
      { name: `🏰 Grupos (${Math.min(groups.length, 5)} de ${groups.length})`, value: groupList },
    )
    .setFooter({ text: `Vinculado por ${target.username}` })
    .setTimestamp();

  ctx.reply({ embeds: [embed] });
}

// ── Avatar ───────────────────────────────────────────────────

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const avatarUrl = await roblox.getAvatar(entry.robloxId);
  if (!avatarUrl) return ctx.reply('❌ No pude cargar el avatar. Intenta de nuevo.');

  const embed = new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setImage(avatarUrl)
    .setFooter({ text: `Solicitado por ${ctx.username}` });

  ctx.reply({ embeds: [embed] });
}

// ── Estado / Presencia en Roblox ─────────────────────────────

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry)
    return ctx.reply(`❌ **${target.username}** no tiene cuenta de Roblox vinculada.`);

  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence)
    return ctx.reply(
      `🔒 **${target.username}** no ha permitido que otros vean su presencia.\n` +
      `Puede usar \`!permitir presencia\` para habilitarlo.`
    );

  if (!process.env.ROBLOX_COOKIE)
    return ctx.reply('❌ La cookie de Roblox no está configurada en el bot.');

  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply('❌ No pude obtener la presencia. Intenta de nuevo.');

  const { label, color } = roblox.formatPresence(presence.userPresenceType);

  const embed = new EmbedBuilder()
    .setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);

  // Si está jugando, mostrar el nombre del juego con link directo
  if (presence.userPresenceType === 2 && presence.universeId) {
    const gameName = await roblox.getGameName(presence.universeId);
    if (gameName) {
      embed.addFields({
        name: '🕹️ Jugando',
        value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})`,
      });
    }
  }

  // Última vez en línea: siempre útil incluso si están offline
  if (presence.lastOnline) {
    const lastOnline = new Date(presence.lastOnline).toLocaleString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    embed.addFields({ name: '🕐 Última vez en línea', value: lastOnline });
  }

  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();
  ctx.reply({ embeds: [embed] });
}

// ── Grupos ───────────────────────────────────────────────────

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length)
    return ctx.reply(`**${entry.robloxUsername}** no pertenece a ningún grupo público.`);

  const embed = new EmbedBuilder()
    .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setDescription(
      groups.slice(0, 10).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n` +
        `› Rol: ${g.role.name} · Rango: ${g.role.rank}`
      ).join('\n\n')
    )
    .setFooter({ text: `${groups.length} grupos en total · Mostrando hasta 10` });

  ctx.reply({ embeds: [embed] });
}

// ── Búsqueda pública (sin vinculación requerida) ─────────────

async function cmdBuscar(ctx, robloxUsername) {
  if (!robloxUsername)
    return ctx.reply('❌ Proporciona un nombre de usuario. Ejemplo: `/buscar MiUsuario`');

  const robloxUser = await roblox.getUserByName(robloxUsername);
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox.');

  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    roblox.getProfile(robloxUser.id),
    roblox.getAvatar(robloxUser.id),
    roblox.getFriendCount(robloxUser.id),
    roblox.getFollowerCount(robloxUser.id),
    roblox.getFollowingCount(robloxUser.id),
    roblox.getGroups(robloxUser.id),
  ]);

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
    .setColor(0xEB459E)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID',           value: `\`${robloxUser.id}\``, inline: true },
      { name: '📅 Creado',       value: createdAt,               inline: true },
      { name: '👥 Amigos',       value: `${friends}`,            inline: true },
      { name: '👣 Seguidores',   value: `${followers}`,          inline: true },
      { name: '➡️ Siguiendo',    value: `${following}`,          inline: true },
      { name: '🏰 Grupos',       value: `${groups.length}`,      inline: true },
      { name: '📝 Descripción',  value: profile.description?.slice(0, 300) || '_Sin descripción_' },
    )
    .setFooter({ text: 'Búsqueda pública · No requiere vinculación' });

  ctx.reply({ embeds: [embed] });
}

// ── Actualizar roles ─────────────────────────────────────────

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada. Usa `/verificar` primero.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Tus roles han sido actualizados según tu cuenta de Roblox.');
}

// ── Desvincular ──────────────────────────────────────────────

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes ninguna cuenta vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada correctamente.`);
}

// ── Privacidad ───────────────────────────────────────────────

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo))
    return ctx.reply('❌ Uso: `!permitir presencia` o `!permitir perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const field = tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile';
  await db.saveUser(ctx.userId, { ...entry, [field]: true });
  ctx.reply(`✅ Ahora otros pueden ver tu **${tipo === 'presencia' ? 'presencia en juegos' : 'perfil público'}**.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo))
    return ctx.reply('❌ Uso: `!bloquear presencia` o `!bloquear perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const field = tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile';
  await db.saveUser(ctx.userId, { ...entry, [field]: false });
  ctx.reply(`🔒 Tu **${tipo === 'presencia' ? 'presencia en juegos' : 'perfil público'}** ahora es privada.`);
}

// ── Comandos de administración ───────────────────────────────

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado configurado: ${role}`);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  // Si ya había un binding para este grupo, lo reemplazamos
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculado: Grupo \`${groupId}\` con rango ≥ **${minRank}** → ${role}`);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return ctx.reply('❌ No hay vinculaciones configuradas.');
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación del grupo \`${groupId}\` eliminada.`);
}

async function cmdListRoles(ctx) {
  const config = await db.getGuildConf(ctx.guild.id);
  const verifiedRole  = config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_';
  const bindingsText  = config?.bindings?.length
    ? config.bindings.map(b => `• Grupo \`${b.groupId}\` · Rango ≥ **${b.minRank}** → <@&${b.roleId}>`).join('\n')
    : '_Sin vinculaciones_';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configuración de roles de este servidor')
    .setColor(0x5865F2)
    .addFields(
      { name: '✅ Rol de verificado',              value: verifiedRole },
      { name: '🏰 Vinculaciones de grupos Roblox', value: bindingsText },
    );

  ctx.reply({ embeds: [embed] });
}

// ── Ayuda ────────────────────────────────────────────────────

async function cmdAyuda(ctx) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Comandos disponibles')
    .setColor(0x5865F2)
    .setDescription('Todos los comandos funcionan con `/` (slash) y también con `!` o `?`.')
    .addFields(
      { name: '🔐 Verificación',
        value: '`/verificar <usuario>` — Vincula tu cuenta de Roblox\n`/confirmar` — Confirma poniendo el código en tu descripción\n`/actualizar` — Re-sincroniza tus roles\n`/desvincular` — Desvincula tu cuenta' },
      { name: '👤 Perfil y datos',
        value: '`/perfil [@usuario]` — Perfil completo con estadísticas\n`/avatar [@usuario]` — Avatar de Roblox\n`/grupos [@usuario]` — Grupos con rol y rango\n`/estado [@usuario]` — Conectado / Jugando / Desconectado\n`/buscar <usuario>` — Busca cualquier usuario de Roblox' },
      { name: '🔒 Privacidad (solo con ! o ?)',
        value: '`!permitir presencia` — Dejar que otros vean tu juego\n`!permitir perfil` — Dejar que otros vean tu perfil\n`!bloquear presencia` — Ocultar en qué juegas\n`!bloquear perfil` — Ocultar tu perfil' },
      { name: '⚙️ Administración (requiere permiso Gestionar Roles)',
        value: '`/setverifiedrole <rol>` — Define el rol de verificado\n`/bindrole <grupoId> <rangoMin> <rol>` — Vincula grupo → rol\n`/unbindrole <grupoId>` — Elimina una vinculación\n`/listroles` — Lista las vinculaciones actuales' },
    )
    .setFooter({ text: 'Bot de verificación Roblox v5.0' });

  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdBuscar, cmdActualizar, cmdDesvincular,
  cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdAyuda,
};
      
