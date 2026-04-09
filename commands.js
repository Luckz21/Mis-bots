// ============================================================
//  commands.js  —  Lógica de todos los comandos
// ============================================================

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// ── Database (Upstash Redis via HTTP) ────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

async function redisDel(key) {
  await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

const db = {
  getUser:       (id)       => redisGet(`user:${id}`),
  saveUser:      (id, data) => redisSet(`user:${id}`, { discordId: id, ...data }),
  deleteUser:    (id)       => redisDel(`user:${id}`),
  getGuildConf:  (id)       => redisGet(`guild:${id}`),
  saveGuildConf: (id, data) => redisSet(`guild:${id}`, data),
};

// ── Roblox API ────────────────────────────────────────────────
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

async function robloxFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (ROBLOX_COOKIE) headers['Cookie'] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    console.error('robloxFetch error:', url, e.message);
    return null;
  }
}

const roblox = {
  getUserByName: async (username) => {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    return data?.data?.[0] ?? null;
  },
  getProfile: (id) => robloxFetch(`https://users.roblox.com/v1/users/${id}`),
  getAvatar: async (id) => {
    const data = await robloxFetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`
    );
    return data?.data?.[0]?.imageUrl ?? null;
  },
  getFriendCount:    async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0,
  getFollowerCount:  async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0,
  getFollowingCount: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0,
  getGroups: async (id) => {
    const data = await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`);
    return data?.data ?? [];
  },
  getPresence: async (id) => {
    const data = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      body: JSON.stringify({ userIds: [id] }),
    });
    return data?.userPresences?.[0] ?? null;
  },
  getGameName: async (universeId) => {
    if (!universeId) return null;
    const data = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
    return data?.data?.[0]?.name ?? null;
  },
  formatPresence: (type) => ({
    0: { label: '⚫ Desconectado',           color: 0x99AAB5 },
    1: { label: '🟢 Conectado (web o app)',   color: 0x57F287 },
    2: { label: '🎮 Jugando en este momento', color: 0x00B0F4 },
    3: { label: '🛠️ En Roblox Studio',        color: 0xFEE75C },
  }[type] ?? { label: '❓ Desconocido', color: 0x99AAB5 }),
};

// ── Helpers ───────────────────────────────────────────────────
const pendingVerifications = {};

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

async function syncRoles(guild, discordId, robloxId) {
  const config = await db.getGuildConf(guild.id);
  if (!config) return;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;
  const rolesToAdd = [];
  if (config.verifiedRoleId) rolesToAdd.push(config.verifiedRoleId);
  if (config.bindings?.length > 0) {
    const groups = await roblox.getGroups(robloxId);
    for (const binding of config.bindings) {
      const membership = groups.find(g => String(g.group.id) === String(binding.groupId));
      if (membership && membership.role.rank >= binding.minRank)
        rolesToAdd.push(binding.roleId);
    }
  }
  for (const roleId of rolesToAdd)
    await member.roles.add(roleId).catch(e => console.error(`Rol ${roleId}:`, e.message));
}

// ── Comandos ──────────────────────────────────────────────────

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername)
    return ctx.reply('❌ Debes proporcionar tu usuario de Roblox.\nEjemplo: `/verificar MiUsuario`');

  // Bloquear si ya está verificado
  const existing = await db.getUser(ctx.userId);
  if (existing) {
    return ctx.reply(
      `✅ Ya tienes una cuenta vinculada: **${existing.robloxUsername}**\n\n` +
      `Si quieres cambiar de cuenta, usa \`/desvincular\` primero y luego vuelve a verificarte.`
    );
  }

  const robloxUser = await roblox.getUserByName(robloxUsername);
  if (!robloxUser)
    return ctx.reply('❌ No encontré ese usuario en Roblox. Revisa que el nombre sea exacto.');

  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };

  const embed = new EmbedBuilder()
    .setTitle('🔐 Verificación de cuenta Roblox')
    .setColor(0xFFAA00)
    .setDescription(
      `**Paso 1:** Abre Roblox y ve a tu perfil\n` +
      `**Paso 2:** Edita tu **descripción** y agrega este código:\n\n` +
      `\`\`\`${code}\`\`\`\n` +
      `**Paso 3:** Vuelve aquí y usa \`/confirmar\` o \`!confirmar\`\n\n` +
      `⏱️ Tienes **10 minutos**. Puedes borrar el código después.`
    )
    .addFields({ name: '👤 Cuenta detectada', value: `**${robloxUser.name}** · ID: \`${robloxUser.id}\`` });

  ctx.reply({ embeds: [embed] });
  setTimeout(() => {
    if (pendingVerifications[ctx.userId]?.code === code)
      delete pendingVerifications[ctx.userId];
  }, 10 * 60 * 1000);
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending)
    return ctx.reply('❌ No tienes verificación pendiente. Usa `/verificar <usuario>` primero.');

  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile)
    return ctx.reply('❌ No pude acceder al perfil de Roblox. Intenta en unos segundos.');

  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(
      `❌ No encontré el código \`${pending.code}\` en la descripción de **${pending.robloxUsername}**.\n` +
      `Espera unos segundos y vuelve a intentar.`
    );

  await db.saveUser(ctx.userId, {
    robloxId:        pending.robloxId,
    robloxUsername:  pending.robloxUsername,
    verifiedAt:      new Date().toISOString(),
    privacyPresence: false,
    privacyProfile:  true,
  });
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  const embed = new EmbedBuilder()
    .setTitle('✅ ¡Cuenta verificada exitosamente!')
    .setColor(0x57F287)
    .setDescription(
      `Tu Discord quedó vinculado a **${pending.robloxUsername}**.\n\n` +
      `• Tu perfil es **visible** para otros ✅\n` +
      `• Tu presencia en juegos es **privada** 🔒\n\n` +
      `Usa \`!permitir presencia\` si quieres que otros vean en qué juegas.`
    );
  ctx.reply({ embeds: [embed] });
}

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) {
    const who = target.id === ctx.userId ? 'No tienes' : `**${target.username}** no tiene`;
    return ctx.reply(`❌ ${who} una cuenta de Roblox vinculada.`);
  }
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    roblox.getProfile(entry.robloxId),
    roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId),
    roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId),
    roblox.getGroups(entry.robloxId),
  ]);

  if (!profile) return ctx.reply('❌ No pude obtener el perfil de Roblox. Intenta de nuevo.');

  const createdAt  = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const groupList  = groups.length
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

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta de Roblox vinculada.`);

  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence)
    return ctx.reply(
      `🔒 **${target.username}** no ha permitido que otros vean su presencia.\n` +
      `Puede usar \`!permitir presencia\` para habilitarlo.`
    );

  if (!ROBLOX_COOKIE) return ctx.reply('❌ La cookie de Roblox no está configurada en el bot.');

  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply('❌ No pude obtener la presencia. Intenta de nuevo.');

  const { label, color } = roblox.formatPresence(presence.userPresenceType);

  const embed = new EmbedBuilder()
    .setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);

  if (presence.userPresenceType === 2 && presence.universeId) {
    const gameName = await roblox.getGameName(presence.universeId);
    if (gameName)
      embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  }

  if (presence.lastOnline) {
    const lastOnline = new Date(presence.lastOnline).toLocaleString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    embed.addFields({ name: '🕐 Última vez en línea', value: lastOnline });
  }

  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();
  ctx.reply({ embeds: [embed] });
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no pertenece a ningún grupo público.`);

  const embed = new EmbedBuilder()
    .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setDescription(
      groups.slice(0, 10).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: ${g.role.name} · Rango: ${g.role.rank}`
      ).join('\n\n')
    )
    .setFooter({ text: `${groups.length} grupos en total · Mostrando hasta 10` });

  ctx.reply({ embeds: [embed] });
}

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

  if (!profile) return ctx.reply('❌ No pude obtener el perfil. Intenta de nuevo.');

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${robloxUser.id}/profile`)
    .setColor(0xEB459E)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID',          value: `\`${robloxUser.id}\``, inline: true },
      { name: '📅 Creado',      value: createdAt,               inline: true },
      { name: '👥 Amigos',      value: `${friends}`,            inline: true },
      { name: '👣 Seguidores',  value: `${followers}`,          inline: true },
      { name: '➡️ Siguiendo',   value: `${following}`,          inline: true },
      { name: '🏰 Grupos',      value: `${groups.length}`,      inline: true },
      { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
    )
    .setFooter({ text: 'Búsqueda pública · No requiere vinculación' });

  ctx.reply({ embeds: [embed] });
}

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada. Usa `/verificar` primero.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Tus roles han sido actualizados según tu cuenta de Roblox.');
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes ninguna cuenta vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada correctamente.`);
}

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

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado configurado: ${role}`);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
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
  const verifiedRole = config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_';
  const bindingsText = config?.bindings?.length
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

async function cmdAyuda(ctx) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Comandos disponibles')
    .setColor(0x5865F2)
    .setDescription('Todos los comandos funcionan con `/` (slash) y también con `!` o `?`.')
    .addFields(
      { name: '🔐 Verificación',
        value: '`/verificar <usuario>` — Vincula tu cuenta de Roblox\n`/confirmar` — Confirma con el código en tu descripción\n`/actualizar` — Re-sincroniza tus roles\n`/desvincular` — Desvincula tu cuenta' },
      { name: '👤 Perfil y datos',
        value: '`/perfil [@usuario]` — Perfil completo con estadísticas\n`/avatar [@usuario]` — Avatar de Roblox\n`/grupos [@usuario]` — Grupos con rol y rango\n`/estado [@usuario]` — Conectado / Jugando / Desconectado\n`/buscar <usuario>` — Busca cualquier usuario de Roblox' },
      { name: '🔒 Privacidad',
        value: '`!permitir presencia` — Dejar que otros vean tu juego\n`!permitir perfil` — Dejar que otros vean tu perfil\n`!bloquear presencia` — Ocultar en qué juegas\n`!bloquear perfil` — Ocultar tu perfil' },
      { name: '⚙️ Administración (requiere Gestionar Roles)',
        value: '`/setverifiedrole <rol>` — Define el rol de verificado\n`/bindrole <grupoId> <rangoMin> <rol>` — Vincula grupo → rol\n`/unbindrole <grupoId>` — Elimina una vinculación\n`/listroles` — Lista las vinculaciones' },
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
