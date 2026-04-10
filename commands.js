// ============================================================
//  commands.js  —  Lógica de todos los comandos v6.0
//  Nuevas funciones: insignias, inventario, comparar,
//  alertas de presencia, amigos, botones interactivos,
//  menús desplegables y paginación
// ============================================================
const fetch = require('node-fetch');

process.on("uncaughtException", (err) => {
  console.error("💥 uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 unhandledRejection:", err);
});
const {
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ComponentType,
} = require('discord.js');

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
  getAlerts:     (id)       => redisGet(`alerts:${id}`),
  saveAlerts:    (id, data) => redisSet(`alerts:${id}`, data),
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
    const data = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`);
    return data?.data?.[0]?.imageUrl ?? null;
  },
  getAvatarFull: async (id) => {
    const data = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=720x720&format=Png`);
    return data?.data?.[0]?.imageUrl ?? null;
  },
  getFriendCount:    async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0,
  getFollowerCount:  async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0,
  getFollowingCount: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0,
  getFriends: async (id) => {
    const data = await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends?userSort=Alphabetical`);
    return data?.data ?? [];
  },
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
  getBadges: async (id) => {
    const data = await robloxFetch(`https://badges.roblox.com/v1/users/${id}/badges?limit=10&sortOrder=Desc`);
    return data?.data ?? [];
  },
  getInventory: async (id) => {
    const data = await robloxFetch(`https://inventory.roblox.com/v2/users/${id}/inventory?assetTypes=8,41,42,43,44,45,46,47&limit=10&sortOrder=Desc`);
    return data?.data ?? [];
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

// Paginación con botones
async function paginate(ctx, pages, title) {
  if (!pages.length) return;
  let current = 0;

  const getRow = (i) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
    new ButtonBuilder().setCustomId('page').setLabel(`${i + 1} / ${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('next').setLabel('Siguiente ▶').setStyle(ButtonStyle.Secondary).setDisabled(i === pages.length - 1),
  );

  const msg = await ctx.replyAndFetch({ embeds: [pages[0]], components: [getRow(0)] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando puede navegar.', ephemeral: true });
    if (i.customId === 'prev') current--;
    if (i.customId === 'next') current++;
    await i.update({ embeds: [pages[current]], components: [getRow(current)] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
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

// ── Sistema de alertas de presencia ──────────────────────────
// Guarda qué usuarios quieren recibir alertas de quién
// alerts:{discordId} = [{ watchedRobloxId, channelId, guildId }]

const presenceCache = {}; // { robloxId: lastPresenceType }

async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      // Obtener todos los usuarios registrados que tienen alertas activas
      // Para simplicidad, monitoreamos usuarios que tienen alertas configuradas
      const alertKeys = await redisGet('alert_users') ?? [];
      for (const discordId of alertKeys) {
        const alerts = await db.getAlerts(discordId);
        if (!alerts?.length) continue;
        for (const alert of alerts) {
          const presence = await roblox.getPresence(alert.watchedRobloxId);
          if (!presence) continue;
          const prev = presenceCache[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            // El estado cambió, enviar alerta
            const channel = await client.channels.fetch(alert.channelId).catch(() => null);
            if (!channel) continue;
            const { label } = roblox.formatPresence(curr);
            let desc = `**${alert.watchedUsername}** cambió su estado a: ${label}`;
            if (curr === 2 && presence.universeId) {
              const gameName = await roblox.getGameName(presence.universeId);
              if (gameName) desc += `\n🕹️ Jugando: **${gameName}**`;
            }
            const embed = new EmbedBuilder()
              .setTitle('🔔 Alerta de presencia')
              .setDescription(desc)
              .setColor(roblox.formatPresence(curr).color)
              .setTimestamp();
            channel.send({ embeds: [embed] }).catch(() => {});
          }
          presenceCache[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) {
      console.error('Monitor error:', e.message);
    }
  }, 60000); // Revisar cada 60 segundos
}

// ── Comandos ──────────────────────────────────────────────────

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername)
    return ctx.reply('❌ Debes proporcionar tu usuario de Roblox.\nEjemplo: `/verificar MiUsuario`');

  const existing = await db.getUser(ctx.userId);
  if (existing) {
    return ctx.reply(
      `✅ Ya tienes una cuenta vinculada: **${existing.robloxUsername}**\n\n` +
      `Si quieres cambiar de cuenta, usa \`/desvincular\` primero.`
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

// ── Perfil interactivo con menú desplegable ───────────────────

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

  if (!profile) return ctx.reply('❌ No pude obtener el perfil. Intenta de nuevo.');

  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const groupList = groups.length
    ? groups.slice(0, 5).map(g => `• [${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join('\n')
    : '_Sin grupos públicos_';

  const mainEmbed = new EmbedBuilder()
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

  // Botones de acción rápida
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`estado_${entry.robloxId}_${target.id}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🔗 Ver perfil').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [mainEmbed], components: [row] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const [action, robloxId, extraId] = i.customId.split('_');

    if (action === 'avatar') {
      const url = await roblox.getAvatarFull(robloxId);
      const embed = new EmbedBuilder().setTitle(`🎭 Avatar de ${profile.displayName}`).setImage(url).setColor(0x5865F2);
      await i.followUp({ embeds: [embed], ephemeral: true });
    }
    else if (action === 'estado') {
      const presence = await roblox.getPresence(robloxId);
      if (!presence) return i.followUp({ content: '❌ No pude obtener la presencia.', ephemeral: true });
      const { label, color } = roblox.formatPresence(presence.userPresenceType);
      const embed = new EmbedBuilder().setTitle(label).setDescription(`**${profile.displayName}**`).setColor(color);
      if (presence.userPresenceType === 2 && presence.universeId) {
        const gameName = await roblox.getGameName(presence.universeId);
        if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
      }
      await i.followUp({ embeds: [embed], ephemeral: true });
    }
    else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      const embed = new EmbedBuilder()
        .setTitle(`🏰 Grupos de ${profile.displayName}`)
        .setColor(0x5865F2)
        .setDescription(grps.length
          ? grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n')
          : '_Sin grupos_'
        );
      await i.followUp({ embeds: [embed], ephemeral: true });
    }
    else if (action === 'insignias') {
      const badges = await roblox.getBadges(robloxId);
      const embed = new EmbedBuilder()
        .setTitle(`🏅 Insignias recientes de ${profile.displayName}`)
        .setColor(0x5865F2)
        .setDescription(badges.length
          ? badges.map(b => `• **${b.name}**`).join('\n')
          : '_Sin insignias recientes_'
        );
      await i.followUp({ embeds: [embed], ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const [headshot, full] = await Promise.all([
    roblox.getAvatar(entry.robloxId),
    roblox.getAvatarFull(entry.robloxId),
  ]);

  if (!headshot && !full) return ctx.reply('❌ No pude cargar el avatar. Intenta de nuevo.');

  const embed = new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2)
    .setThumbnail(headshot)
    .setImage(full)
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

  // Botón para activar alerta
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}`)
      .setLabel('🔔 Activar alerta')
      .setStyle(ButtonStyle.Primary),
  );

  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando puede hacer esto.', ephemeral: true });
    const [, watchedId, watchedUsername] = i.customId.split('_');
    await cmdAlertaSet(i.user.id, watchedId, watchedUsername, i.channelId, i.guildId);
    await i.reply({ content: `✅ Recibirás alertas cuando **${watchedUsername}** cambie su estado.`, ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ── Grupos con paginación ─────────────────────────────────────

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no pertenece a ningún grupo público.`);

  // Dividir en páginas de 5 grupos
  const pages = [];
  for (let i = 0; i < groups.length; i += 5) {
    const chunk = groups.slice(i, i + 5);
    pages.push(
      new EmbedBuilder()
        .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
        .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
        .setColor(0x5865F2)
        .setDescription(
          chunk.map(g =>
            `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: ${g.role.name} · Rango: ${g.role.rank}`
          ).join('\n\n')
        )
        .setFooter({ text: `${groups.length} grupos en total` })
    );
  }

  await paginate(ctx, pages, `Grupos de ${entry.robloxUsername}`);
}

// ── Amigos con paginación ─────────────────────────────────────

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** no tiene amigos públicos.`);

  const pages = [];
  for (let i = 0; i < friends.length; i += 10) {
    const chunk = friends.slice(i, i + 10);
    pages.push(
      new EmbedBuilder()
        .setTitle(`👥 Amigos de ${entry.robloxUsername}`)
        .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
        .setColor(0x5865F2)
        .setDescription(
          chunk.map(f => `• [${f.displayName}](https://www.roblox.com/users/${f.id}/profile) (@${f.name})`).join('\n')
        )
        .setFooter({ text: `${friends.length} amigos en total` })
    );
  }

  await paginate(ctx, pages, `Amigos de ${entry.robloxUsername}`);
}

// ── Insignias ─────────────────────────────────────────────────

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const badges = await roblox.getBadges(entry.robloxId);
  if (!badges.length) return ctx.reply(`**${entry.robloxUsername}** no tiene insignias recientes.`);

  const embed = new EmbedBuilder()
    .setTitle(`🏅 Insignias recientes de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0xFEE75C)
    .setDescription(
      badges.map(b =>
        `**${b.name}**\n› ${b.description?.slice(0, 80) || '_Sin descripción_'}`
      ).join('\n\n')
    )
    .setFooter({ text: 'Mostrando las 10 más recientes' });

  ctx.reply({ embeds: [embed] });
}

// ── Inventario ────────────────────────────────────────────────

async function cmdInventario(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);

  if (!entry) return ctx.reply(`❌ **${target.username}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile)
    return ctx.reply(`🔒 **${target.username}** tiene su perfil en privado.`);

  const items = await roblox.getInventory(entry.robloxId);

  const embed = new EmbedBuilder()
    .setTitle(`🎒 Inventario de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0xEB459E);

  if (!items.length) {
    embed.setDescription('_El inventario es privado o está vacío._');
  } else {
    embed.setDescription(items.map(i => `• **${i.name}**`).join('\n'))
      .setFooter({ text: 'Mostrando hasta 10 items recientes' });
  }

  ctx.reply({ embeds: [embed] });
}

// ── Comparar dos usuarios ─────────────────────────────────────

async function cmdComparar(ctx, targetUser1, targetUser2) {
  if (!targetUser1 || !targetUser2)
    return ctx.reply('❌ Menciona a dos usuarios. Ejemplo: `/comparar @usuario1 @usuario2`');

  const [entry1, entry2] = await Promise.all([
    db.getUser(targetUser1.id),
    db.getUser(targetUser2.id),
  ]);

  if (!entry1) return ctx.reply(`❌ **${targetUser1.username}** no tiene cuenta vinculada.`);
  if (!entry2) return ctx.reply(`❌ **${targetUser2.username}** no tiene cuenta vinculada.`);

  const [
    profile1, friends1, followers1, groups1,
    profile2, friends2, followers2, groups2,
    avatar1, avatar2,
  ] = await Promise.all([
    roblox.getProfile(entry1.robloxId),
    roblox.getFriendCount(entry1.robloxId),
    roblox.getFollowerCount(entry1.robloxId),
    roblox.getGroups(entry1.robloxId),
    roblox.getProfile(entry2.robloxId),
    roblox.getFriendCount(entry2.robloxId),
    roblox.getFollowerCount(entry2.robloxId),
    roblox.getGroups(entry2.robloxId),
    roblox.getAvatar(entry1.robloxId),
    roblox.getAvatar(entry2.robloxId),
  ]);

  // Grupos en común
  const groupIds1 = new Set(groups1.map(g => g.group.id));
  const common = groups2.filter(g => groupIds1.has(g.group.id));

  const age1 = Math.floor((Date.now() - new Date(profile1.created)) / (1000 * 60 * 60 * 24 * 365));
  const age2 = Math.floor((Date.now() - new Date(profile2.created)) / (1000 * 60 * 60 * 24 * 365));

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Comparación de cuentas`)
    .setColor(0x5865F2)
    .addFields(
      { name: '👤 Usuario',      value: `**${profile1.name}**`,  inline: true },
      { name: '📊 vs',           value: '─────',                  inline: true },
      { name: '👤 Usuario',      value: `**${profile2.name}**`,  inline: true },
      { name: '👥 Amigos',       value: `${friends1}`,            inline: true },
      { name: '\u200B',          value: '\u200B',                  inline: true },
      { name: '👥 Amigos',       value: `${friends2}`,            inline: true },
      { name: '👣 Seguidores',   value: `${followers1}`,          inline: true },
      { name: '\u200B',          value: '\u200B',                  inline: true },
      { name: '👣 Seguidores',   value: `${followers2}`,          inline: true },
      { name: '🏰 Grupos',       value: `${groups1.length}`,      inline: true },
      { name: '\u200B',          value: '\u200B',                  inline: true },
      { name: '🏰 Grupos',       value: `${groups2.length}`,      inline: true },
      { name: '📅 Antigüedad',   value: `${age1} años`,           inline: true },
      { name: '\u200B',          value: '\u200B',                  inline: true },
      { name: '📅 Antigüedad',   value: `${age2} años`,           inline: true },
    )
    .setThumbnail(avatar1)
    .setFooter({ text: `Grupos en común: ${common.length > 0 ? common.map(g => g.group.name).join(', ') : 'Ninguno'}` });

  ctx.reply({ embeds: [embed] });
}

// ── Búsqueda pública ──────────────────────────────────────────

async function cmdBuscar(ctx, robloxUsername) {
  if (!robloxUsername)
    return ctx.reply('❌ Proporciona un nombre. Ejemplo: `/buscar MiUsuario`');

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

// ── Alertas de presencia ──────────────────────────────────────

async function cmdAlertaSet(discordId, watchedRobloxId, watchedUsername, channelId, guildId) {
  const alerts = await db.getAlerts(discordId) ?? [];
  const exists = alerts.find(a => String(a.watchedRobloxId) === String(watchedRobloxId));
  if (!exists) {
    alerts.push({ watchedRobloxId, watchedUsername, channelId, guildId });
    await db.saveAlerts(discordId, alerts);
    // Registrar en lista global de usuarios con alertas
    const alertUsers = await redisGet('alert_users') ?? [];
    if (!alertUsers.includes(discordId)) {
      alertUsers.push(discordId);
      await redisSet('alert_users', alertUsers);
    }
  }
}

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    const alerts = await db.getAlerts(ctx.userId) ?? [];
    if (!alerts.length) return ctx.reply('❌ No tienes alertas configuradas.');
    const embed = new EmbedBuilder()
      .setTitle('🔔 Tus alertas de presencia')
      .setColor(0x5865F2)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** ${a.watchedUsername} (\`${a.watchedRobloxId}\`)`).join('\n'));
    return ctx.reply({ embeds: [embed] });
  }

  if (sub === 'quitar') {
    const target = targetUser;
    if (!target) return ctx.reply('❌ Menciona a un usuario. Ej: `!alertas quitar @usuario`');
    const entry = await db.getUser(target.id);
    if (!entry) return ctx.reply('❌ Ese usuario no tiene cuenta vinculada.');
    const alerts = (await db.getAlerts(ctx.userId) ?? []).filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada.`);
  }

  ctx.reply('❌ Uso: `!alertas ver` o `!alertas quitar @usuario`');
}

// ── Administración ────────────────────────────────────────────

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
        value: '`/verificar <usuario>` · `/confirmar` · `/actualizar` · `/desvincular`' },
      { name: '👤 Perfil y datos',
        value: '`/perfil` · `/avatar` · `/estado` · `/grupos` · `/amigos` · `/insignias` · `/inventario` · `/buscar <usuario>`' },
      { name: '⚔️ Social',
        value: '`/comparar @u1 @u2` — Compara dos cuentas de Roblox\n`!alertas ver` — Ver tus alertas activas\n`!alertas quitar @usuario` — Eliminar una alerta' },
      { name: '🔒 Privacidad',
        value: '`!permitir presencia` · `!permitir perfil` · `!bloquear presencia` · `!bloquear perfil`' },
      { name: '⚙️ Administración',
        value: '`/setverifiedrole <rol>` · `/bindrole <id> <rango> <rol>` · `/unbindrole <id>` · `/listroles`' },
    )
    .setFooter({ text: 'Bot de verificación Roblox v6.0' });
  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdAmigos, cmdInsignias, cmdInventario, cmdComparar,
  cmdBuscar, cmdActualizar, cmdDesvincular, cmdAlertas,
  cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdAyuda, startPresenceMonitor,
};
