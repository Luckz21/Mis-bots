// ============================================================
//  commands.js  —  v7.0
//  Incluye: Premium, economía, moderación, juegos, notificaciones
// ============================================================

const {
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType,
} = require('discord.js');

// ── Database ──────────────────────────────────────────────────
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
  getUser:        (id)       => redisGet(`user:${id}`),
  saveUser:       (id, data) => redisSet(`user:${id}`, { discordId: id, ...data }),
  deleteUser:     (id)       => redisDel(`user:${id}`),
  getGuildConf:   (id)       => redisGet(`guild:${id}`),
  saveGuildConf:  (id, data) => redisSet(`guild:${id}`, data),
  getAlerts:      (id)       => redisGet(`alerts:${id}`),
  saveAlerts:     (id, data) => redisSet(`alerts:${id}`, data),
  getEconomy:     (id)       => redisGet(`eco:${id}`),
  saveEconomy:    (id, data) => redisSet(`eco:${id}`, data),
  getPremium:     (id)       => redisGet(`premium:${id}`),
  savePremium:    (id, data) => redisSet(`premium:${id}`, data),
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
  } catch (e) { console.error('robloxFetch:', e.message); return null; }
}

const roblox = {
  getUserByName: async (username) => {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    return data?.data?.[0] ?? null;
  },
  getProfile:        (id) => robloxFetch(`https://users.roblox.com/v1/users/${id}`),
  getAvatar:   async (id) => {
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`);
    return d?.data?.[0]?.imageUrl ?? null;
  },
  getAvatarFull: async (id) => {
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=720x720&format=Png`);
    return d?.data?.[0]?.imageUrl ?? null;
  },
  getFriendCount:    async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0,
  getFollowerCount:  async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0,
  getFollowingCount: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0,
  getFriends: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends?userSort=Alphabetical`))?.data ?? [],
  getGroups:  async (id) => (await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`))?.data ?? [],
  getPresence: async (id) => {
    const d = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST', body: JSON.stringify({ userIds: [id] }),
    });
    return d?.userPresences?.[0] ?? null;
  },
  getGameName: async (uid) => {
    if (!uid) return null;
    const d = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${uid}`);
    return d?.data?.[0]?.name ?? null;
  },
  getBadges:  async (id) => (await robloxFetch(`https://badges.roblox.com/v1/users/${id}/badges?limit=10&sortOrder=Desc`))?.data ?? [],
  searchGame: async (q) => {
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=5`);
    return d?.games ?? [];
  },
  getPopularGames: async () => {
    const d = await robloxFetch('https://games.roblox.com/v1/games/list?model.sortToken=&model.gameFilter=0&model.maxRows=5&model.keyword=');
    return d?.games ?? [];
  },
  isPremium: async (id) => {
    const d = await robloxFetch(`https://premiumfeatures.roblox.com/v1/users/${id}/validate-membership`);
    return d === true || d?.isPremium === true;
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
const presenceCache = {};

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

async function isPremium(discordId) {
  const data = await db.getPremium(discordId);
  if (!data) return false;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
  return true;
}

function premiumRequired(ctx) {
  const embed = new EmbedBuilder()
    .setTitle('⭐ Función Premium')
    .setColor(0xFFD700)
    .setDescription(
      'Esta función es exclusiva para usuarios **Premium**.\n\n' +
      '💛 Apoya el bot en Ko-fi y desbloquea:\n' +
      '• 🔔 Alertas ilimitadas\n• 🎨 Comando `/flex`\n• ⚔️ Comparaciones\n' +
      '• 📊 Historial de juegos\n• ⚙️ Sync masivo de roles\n\n' +
      `[☕ Donar en Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})\n\n` +
      '_Después de donar escribe tu Discord ID en el mensaje._'
    );
  ctx.reply({ embeds: [embed] });
  return false;
}

async function paginate(ctx, pages) {
  if (!pages.length) return;
  let current = 0;
  const getRow = (i) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
    new ButtonBuilder().setCustomId('page').setLabel(`${i + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(i === pages.length - 1),
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
  if (config.premiumRoleId && await isPremium(discordId)) rolesToAdd.push(config.premiumRoleId);
  if (config.bindings?.length > 0) {
    const groups = await roblox.getGroups(robloxId);
    for (const b of config.bindings) {
      const m = groups.find(g => String(g.group.id) === String(b.groupId));
      if (m && m.role.rank >= b.minRank) rolesToAdd.push(b.roleId);
    }
  }
  for (const roleId of rolesToAdd)
    await member.roles.add(roleId).catch(e => console.error(`Rol ${roleId}:`, e.message));
}

// ── Monitor de presencia ──────────────────────────────────────
async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      const alertUsers = await redisGet('alert_users') ?? [];
      for (const discordId of alertUsers) {
        const alerts = await db.getAlerts(discordId) ?? [];
        for (const alert of alerts) {
          const presence = await roblox.getPresence(alert.watchedRobloxId);
          if (!presence) continue;
          const prev = presenceCache[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            const channel = await client.channels.fetch(alert.channelId).catch(() => null);
            if (!channel) continue;
            const { label, color } = roblox.formatPresence(curr);
            const embed = new EmbedBuilder()
              .setTitle('🔔 Alerta de presencia')
              .setDescription(`**${alert.watchedUsername}** cambió su estado a: ${label}`)
              .setColor(color).setTimestamp();
            if (curr === 2 && presence.universeId) {
              const gn = await roblox.getGameName(presence.universeId);
              if (gn) embed.addFields({ name: '🕹️ Jugando', value: `[${gn}](https://www.roblox.com/games/${presence.rootPlaceId})` });
            }
            channel.send({ content: `<@${discordId}>`, embeds: [embed] }).catch(() => {});
          }
          presenceCache[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) { console.error('Monitor error:', e.message); }
  }, 60000);
}

// ════════════════════════════════════════════════════════════
//  VERIFICACIÓN
// ════════════════════════════════════════════════════════════

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername) return ctx.reply('❌ Uso: `/verificar <usuario>`');
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply(`✅ Ya tienes cuenta vinculada: **${existing.robloxUsername}**\nUsa \`/desvincular\` para cambiarla.`);
  const robloxUser = await roblox.getUserByName(robloxUsername);
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox.');
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  const embed = new EmbedBuilder().setTitle('🔐 Verificación de cuenta Roblox').setColor(0xFFAA00)
    .setDescription(`**Paso 1:** Ve a tu perfil de Roblox\n**Paso 2:** Edita tu **descripción** y agrega:\n\`\`\`${code}\`\`\`\n**Paso 3:** Usa \`/confirmar\`\n\n⏱️ Tienes **10 minutos**.`)
    .addFields({ name: '👤 Cuenta detectada', value: `**${robloxUser.name}** · ID: \`${robloxUser.id}\`` });
  ctx.reply({ embeds: [embed] });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply('❌ No tienes verificación pendiente. Usa `/verificar` primero.');
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile) return ctx.reply('❌ No pude acceder al perfil. Intenta de nuevo.');
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(`❌ No encontré el código \`${pending.code}\` en tu descripción. Espera unos segundos.`);
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
  });
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  // Mensaje de bienvenida personalizado
  const config = await db.getGuildConf(ctx.guild.id);
  if (config?.welcomeChannelId && config?.welcomeMessage) {
    const ch = await ctx.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (ch) {
      const msg = config.welcomeMessage
        .replace('{user}', `<@${ctx.userId}>`)
        .replace('{roblox}', pending.robloxUsername);
      ch.send(msg).catch(() => {});
    }
  }

  const embed = new EmbedBuilder().setTitle('✅ ¡Cuenta verificada!').setColor(0x57F287)
    .setDescription(`Vinculado a **${pending.robloxUsername}**.\n• Perfil visible ✅\n• Presencia privada 🔒\n\nUsa \`!permitir presencia\` para que otros vean tu juego.`);
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  PERFIL E INFORMACIÓN
// ════════════════════════════════════════════════════════════

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(`❌ **${target.username ?? 'Tú'}** no tiene cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply(`🔒 Perfil privado.`);

  const [profile, avatarUrl, friends, followers, following, groups] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
  ]);
  if (!profile) return ctx.reply('❌ No pude obtener el perfil.');

  const hasPremiumRoblox = await roblox.isPremium(entry.robloxId);
  const hasGold = await isPremium(target.id);
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}👤 ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(hasGold ? 0xFFD700 : 0x5865F2).setThumbnail(avatarUrl)
    .addFields(
      { name: '🆔 ID', value: `\`${entry.robloxId}\``, inline: true },
      { name: '📅 Creado', value: createdAt, inline: true },
      { name: '💎 Premium Roblox', value: hasPremiumRoblox ? 'Sí ✅' : 'No', inline: true },
      { name: '👥 Amigos', value: `${friends}`, inline: true },
      { name: '👣 Seguidores', value: `${followers}`, inline: true },
      { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
      { name: '📝 Descripción', value: profile.description?.slice(0, 300) || '_Sin descripción_' },
    )
    .setFooter({ text: `${hasGold ? '⭐ Usuario Premium · ' : ''}Vinculado por ${target.username ?? ctx.username}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🔗 Roblox').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const [action, robloxId] = i.customId.split('_');
    if (action === 'avatar') {
      const url = await roblox.getAvatarFull(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(`🎭 Avatar de ${profile.displayName}`).setImage(url).setColor(0x5865F2)], ephemeral: true });
    } else if (action === 'estado') {
      const p = await roblox.getPresence(robloxId);
      if (!p) return i.followUp({ content: '❌ Sin presencia.', ephemeral: true });
      const { label, color } = roblox.formatPresence(p.userPresenceType);
      const e = new EmbedBuilder().setTitle(label).setColor(color);
      if (p.userPresenceType === 2 && p.universeId) {
        const gn = await roblox.getGameName(p.universeId);
        if (gn) e.addFields({ name: '🕹️', value: gn });
      }
      await i.followUp({ embeds: [e], ephemeral: true });
    } else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏰 Grupos').setColor(0x5865F2)
        .setDescription(grps.length ? grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n') : '_Sin grupos_')], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏅 Insignias').setColor(0xFEE75C)
        .setDescription(b.length ? b.map(x => `• ${x.name}`).join('\n') : '_Sin insignias_')], ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(`❌ Sin cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return ctx.reply('❌ No pude cargar el avatar.');
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2).setThumbnail(h).setImage(f)] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(`❌ Sin cuenta vinculada.`);
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return ctx.reply(`🔒 **${target.username}** no permite ver su presencia.`);
  if (!ROBLOX_COOKIE) return ctx.reply('❌ Cookie no configurada.');
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply('❌ No pude obtener la presencia.');
  const { label, color } = roblox.formatPresence(presence.userPresenceType);
  const embed = new EmbedBuilder().setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);
  if (presence.userPresenceType === 2 && presence.universeId) {
    const gn = await roblox.getGameName(presence.universeId);
    if (gn) embed.addFields({ name: '🕹️ Jugando', value: `[${gn}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  }
  if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez', value: new Date(presence.lastOnline).toLocaleString('es-ES') });
  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}`).setLabel('🔔 Activar alerta').setStyle(ButtonStyle.Primary),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    const [, wId, wName] = i.customId.split('_');

    // Verificar límite de alertas para usuarios no premium
    const userAlerts = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    if (!userPremium && userAlerts.length >= 2) {
      return i.reply({ content: '❌ Los usuarios gratuitos solo pueden tener **2 alertas**. Obtén ⭐ Premium para alertas ilimitadas.', ephemeral: true });
    }

    const exists = userAlerts.find(a => String(a.watchedRobloxId) === String(wId));
    if (!exists) {
      userAlerts.push({ watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId });
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: `✅ Recibirás alertas cuando **${wName}** cambie su estado.`, ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply('Sin grupos públicos.');
  const pages = [];
  for (let i = 0; i < groups.length; i += 5) {
    const chunk = groups.slice(i, i + 5);
    pages.push(new EmbedBuilder().setTitle(`🏰 Grupos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(chunk.map(g => `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› ${g.role.name} · Rango ${g.role.rank}`).join('\n\n'))
      .setFooter({ text: `${groups.length} grupos` }));
  }
  await paginate(ctx, pages);
}

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply('Sin amigos públicos.');
  const pages = [];
  for (let i = 0; i < friends.length; i += 10) {
    const chunk = friends.slice(i, i + 10);
    pages.push(new EmbedBuilder().setTitle(`👥 Amigos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(chunk.map(f => `• [${f.displayName}](https://www.roblox.com/users/${f.id}/profile) (@${f.name})`).join('\n'))
      .setFooter({ text: `${friends.length} amigos` }));
  }
  await paginate(ctx, pages);
}

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const badges = await roblox.getBadges(entry.robloxId);
  const embed = new EmbedBuilder().setTitle(`🏅 Insignias de ${entry.robloxUsername}`).setColor(0xFEE75C)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**\n› ${b.description?.slice(0, 60) || ''}`).join('\n\n') : '_Sin insignias recientes_')
    .setFooter({ text: 'Últimas 10' });
  ctx.reply({ embeds: [embed] });
}

async function cmdBuscar(ctx, username) {
  if (!username) return ctx.reply('❌ Uso: `/buscar <usuario>`');
  const u = await roblox.getUserByName(username);
  if (!u) return ctx.reply('❌ No encontré ese usuario.');
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return ctx.reply('❌ No pude obtener el perfil.');
  const embed = new EmbedBuilder().setTitle(`🔍 ${p.displayName} (@${p.name})`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`).setColor(0xEB459E).setThumbnail(av)
    .addFields(
      { name: '🆔 ID', value: `\`${u.id}\``, inline: true },
      { name: '📅 Creado', value: new Date(p.created).toLocaleDateString('es-ES'), inline: true },
      { name: '👥 Amigos', value: `${fr}`, inline: true },
      { name: '👣 Seguidores', value: `${fo}`, inline: true },
      { name: '➡️ Siguiendo', value: `${fg}`, inline: true },
      { name: '🏰 Grupos', value: `${gr.length}`, inline: true },
      { name: '📝 Descripción', value: p.description?.slice(0, 300) || '_Sin descripción_' },
    ).setFooter({ text: 'Búsqueda pública' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  PREMIUM SYSTEM
// ════════════════════════════════════════════════════════════

async function cmdPremiumStatus(ctx) {
  const premium = await db.getPremium(ctx.userId);
  const active = await isPremium(ctx.userId);
  const embed = new EmbedBuilder().setColor(active ? 0xFFD700 : 0x99AAB5);
  if (active) {
    const exp = premium.expiresAt ? `Expira: ${new Date(premium.expiresAt).toLocaleDateString('es-ES')}` : 'Permanente';
    embed.setTitle('⭐ Tienes Premium activo').setDescription(`${exp}\n\n**Funciones desbloqueadas:**\n• Alertas ilimitadas\n• /flex\n• /comparar\n• /historial\n• Sync masivo`);
  } else {
    embed.setTitle('⭐ Premium').setDescription(
      `No tienes Premium activo.\n\n**¿Qué obtienes?**\n• 🔔 Alertas ilimitadas (gratis = 2)\n• 🎨 /flex — tarjeta de perfil\n• ⚔️ /comparar — comparar cuentas\n• ⚙️ /syncall — sincronizar todos\n\n[☕ Obtener Premium en Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})\n\n_Pon tu Discord ID (\`${ctx.userId}\`) en el mensaje de donación._`
    );
  }
  ctx.reply({ embeds: [embed] });
}

// Activar Premium manualmente (solo admins del bot)
async function cmdActivarPremium(ctx, targetId, dias) {
  const BOT_OWNER = process.env.BOT_OWNER_ID;
  if (ctx.userId !== BOT_OWNER) return ctx.reply('❌ Solo el dueño del bot puede usar este comando.');
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId });
  ctx.reply(`✅ Premium activado para <@${targetId}>${dias ? ` por ${dias} días` : ' permanentemente'}.`);
}

async function cmdComparar(ctx, targetUser1, targetUser2) {
  if (!await isPremium(ctx.userId)) return premiumRequired(ctx);
  if (!targetUser1 || !targetUser2) return ctx.reply('❌ Menciona a dos usuarios.');
  const [e1, e2] = await Promise.all([db.getUser(targetUser1.id), db.getUser(targetUser2.id)]);
  if (!e1) return ctx.reply(`❌ **${targetUser1.username}** no tiene cuenta vinculada.`);
  if (!e2) return ctx.reply(`❌ **${targetUser2.username}** no tiene cuenta vinculada.`);
  const [p1, fr1, fo1, g1, p2, fr2, fo2, g2, av1] = await Promise.all([
    roblox.getProfile(e1.robloxId), roblox.getFriendCount(e1.robloxId),
    roblox.getFollowerCount(e1.robloxId), roblox.getGroups(e1.robloxId),
    roblox.getProfile(e2.robloxId), roblox.getFriendCount(e2.robloxId),
    roblox.getFollowerCount(e2.robloxId), roblox.getGroups(e2.robloxId),
    roblox.getAvatar(e1.robloxId),
  ]);
  const gIds1 = new Set(g1.map(g => g.group.id));
  const common = g2.filter(g => gIds1.has(g.group.id));
  const age1 = Math.floor((Date.now() - new Date(p1.created)) / 86400000 / 365);
  const age2 = Math.floor((Date.now() - new Date(p2.created)) / 86400000 / 365);
  const embed = new EmbedBuilder().setTitle('⚔️ Comparación de cuentas').setColor(0x5865F2).setThumbnail(av1)
    .addFields(
      { name: '👤', value: `**${p1.name}**`, inline: true },
      { name: 'vs', value: '──', inline: true },
      { name: '👤', value: `**${p2.name}**`, inline: true },
      { name: '👥 Amigos', value: `${fr1}`, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, { name: '👥 Amigos', value: `${fr2}`, inline: true },
      { name: '👣 Seguidores', value: `${fo1}`, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, { name: '👣 Seguidores', value: `${fo2}`, inline: true },
      { name: '🏰 Grupos', value: `${g1.length}`, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, { name: '🏰 Grupos', value: `${g2.length}`, inline: true },
      { name: '📅 Antigüedad', value: `${age1} años`, inline: true }, { name: '\u200B', value: '\u200B', inline: true }, { name: '📅 Antigüedad', value: `${age2} años`, inline: true },
    )
    .setFooter({ text: `Grupos en común: ${common.length > 0 ? common.map(g => g.group.name).slice(0, 3).join(', ') : 'Ninguno'}` });
  ctx.reply({ embeds: [embed] });
}

async function cmdFlex(ctx) {
  if (!await isPremium(ctx.userId)) return premiumRequired(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const [profile, avatarUrl, friends, followers, groups, badges, presence] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatarFull(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getGroups(entry.robloxId), roblox.getBadges(entry.robloxId),
    roblox.getPresence(entry.robloxId),
  ]);
  const { label } = roblox.formatPresence(presence?.userPresenceType ?? 0);
  const age = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName} — Tarjeta de perfil`)
    .setDescription(`*${profile.description?.slice(0, 150) || 'Sin descripción'}*`)
    .setColor(0xFFD700).setImage(avatarUrl)
    .addFields(
      { name: '🎮 Estado actual', value: label, inline: true },
      { name: '📅 Días en Roblox', value: `${age} días`, inline: true },
      { name: '👥 Amigos', value: `${friends}`, inline: true },
      { name: '👣 Seguidores', value: `${followers}`, inline: true },
      { name: '🏰 Grupos', value: `${groups.length}`, inline: true },
      { name: '🏅 Insignias', value: `${badges.length}+`, inline: true },
    )
    .setFooter({ text: '⭐ Usuario Premium · ' + new Date().toLocaleDateString('es-ES') });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  ECONOMÍA INTERNA
// ════════════════════════════════════════════════════════════

async function addPoints(userId, points) {
  const eco = await db.getEconomy(userId) ?? { points: 0, lastDaily: null, totalEarned: 0 };
  eco.points = (eco.points || 0) + points;
  eco.totalEarned = (eco.totalEarned || 0) + points;
  await db.saveEconomy(userId, eco);
  return eco.points;
}

async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? { points: 0 };
  const embed = new EmbedBuilder().setTitle(`💰 Puntos de ${target.username ?? ctx.username}`)
    .setColor(0xFFD700).addFields(
      { name: '💰 Puntos actuales', value: `${eco.points ?? 0}`, inline: true },
      { name: '📈 Total ganado', value: `${eco.totalEarned ?? 0}`, inline: true },
    );
  ctx.reply({ embeds: [embed] });
}

async function cmdDaily(ctx) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null };
  const now = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return ctx.reply(`⏰ Ya reclamaste tu daily. Vuelve en **${hrs}h ${mins}m**.`);
  }
  const reward = 50 + Math.floor(Math.random() * 50);
  eco.points = (eco.points || 0) + reward;
  eco.lastDaily = now.toISOString();
  eco.totalEarned = (eco.totalEarned || 0) + reward;
  await db.saveEconomy(ctx.userId, eco);
  const embed = new EmbedBuilder().setTitle('🎁 Daily reclamado').setColor(0x57F287)
    .setDescription(`Ganaste **${reward} puntos**!\nTotal: **${eco.points} puntos**`);
  ctx.reply({ embeds: [embed] });
}

async function cmdTop(ctx) {
  ctx.reply('📊 El leaderboard estará disponible próximamente. ¡Sigue acumulando puntos con `!daily`!');
}

// ════════════════════════════════════════════════════════════
//  JUEGOS DE ROBLOX
// ════════════════════════════════════════════════════════════

async function cmdJuego(ctx, query) {
  if (!query) return ctx.reply('❌ Uso: `/juego <nombre>`');
  const games = await roblox.searchGame(query);
  if (!games.length) return ctx.reply('❌ No encontré juegos con ese nombre.');
  const game = games[0];
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${game.name}`)
    .setURL(`https://www.roblox.com/games/${game.placeId}`)
    .setColor(0x00B0F4)
    .addFields(
      { name: '👥 Jugando ahora', value: `${game.playerCount ?? 'N/A'}`, inline: true },
      { name: '❤️ Likes', value: `${game.totalUpVotes ?? 'N/A'}`, inline: true },
      { name: '👎 Dislikes', value: `${game.totalDownVotes ?? 'N/A'}`, inline: true },
    )
    .setFooter({ text: `ID: ${game.placeId}` });
  if (game.imageToken) embed.setThumbnail(`https://www.roblox.com/asset-thumbnail/image?assetId=${game.placeId}&width=768&height=432&format=Png`);
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  MODERACIÓN Y GESTIÓN
// ════════════════════════════════════════════════════════════

async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario. Ej: `!whois @usuario`');
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply(`❌ **${targetUser.username}** no tiene cuenta vinculada.`);
  const premium = await isPremium(targetUser.id);
  const embed = new EmbedBuilder().setTitle(`🔍 Whois: ${targetUser.username}`).setColor(0x5865F2)
    .addFields(
      { name: '🎮 Cuenta Roblox', value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 Roblox ID', value: `\`${entry.robloxId}\``, inline: true },
      { name: '⭐ Premium', value: premium ? 'Sí' : 'No', inline: true },
      { name: '📅 Verificado', value: new Date(entry.verifiedAt).toLocaleDateString('es-ES'), inline: true },
    );
  ctx.reply({ embeds: [embed] });
}

async function cmdSyncAll(ctx) {
  if (!await isPremium(ctx.userId)) return premiumRequired(ctx);
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return ctx.reply('❌ El bot no tiene permiso de **Gestionar Roles**.');
  await ctx.reply('⏳ Sincronizando roles de todos los miembros verificados...');
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { await syncRoles(ctx.guild, id, entry.robloxId); count++; }
  }
  ctx.reply(`✅ Roles sincronizados para **${count}** miembros verificados.`);
}

// ════════════════════════════════════════════════════════════
//  NOTIFICACIONES Y CONFIGURACIÓN
// ════════════════════════════════════════════════════════════

async function cmdSetWelcome(ctx, channelId, message) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage = message || '¡Bienvenido {user}! Tu cuenta de Roblox **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Mensaje de bienvenida configurado en <#${channelId}>.\nUsa \`{user}\` para mencionar al usuario y \`{roblox}\` para su nombre de Roblox.`);
}

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas configurado: <#${channelId}>`);
}

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    const alerts = await db.getAlerts(ctx.userId) ?? [];
    if (!alerts.length) return ctx.reply('❌ No tienes alertas configuradas.');
    const embed = new EmbedBuilder().setTitle('🔔 Tus alertas').setColor(0x5865F2)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** ${a.watchedUsername} (\`${a.watchedRobloxId}\`)`).join('\n'));
    return ctx.reply({ embeds: [embed] });
  }
  if (sub === 'quitar') {
    if (!targetUser) return ctx.reply('❌ Menciona a un usuario.');
    const entry = await db.getUser(targetUser.id);
    if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
    const alerts = (await db.getAlerts(ctx.userId) ?? []).filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada.`);
  }
  ctx.reply('❌ Uso: `!alertas ver` o `!alertas quitar @usuario`');
}

// ════════════════════════════════════════════════════════════
//  PRIVACIDAD Y ROLES
// ════════════════════════════════════════════════════════════

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Roles actualizados.');
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Cuenta **${entry.robloxUsername}** desvinculada.`);
}

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ Uso: `!permitir presencia` o `!permitir perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  ctx.reply(`✅ Tu **${tipo}** ahora es pública.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ Uso: `!bloquear presencia` o `!bloquear perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  ctx.reply(`🔒 Tu **${tipo}** ahora es privada.`);
}

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado: ${role}`);
}

async function cmdSetPremiumRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.premiumRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol Premium configurado: ${role}`);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculado: Grupo \`${groupId}\` rango ≥ ${minRank} → ${role}`);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return ctx.reply('❌ Sin vinculaciones.');
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación del grupo \`${groupId}\` eliminada.`);
}

async function cmdListRoles(ctx) {
  const config = await db.getGuildConf(ctx.guild.id);
  const embed = new EmbedBuilder().setTitle('⚙️ Roles configurados').setColor(0x5865F2).addFields(
    { name: '✅ Verificado', value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_' },
    { name: '⭐ Premium', value: config?.premiumRoleId ? `<@&${config.premiumRoleId}>` : '_No configurado_' },
    { name: '🏰 Vinculaciones', value: config?.bindings?.length ? config.bindings.map(b => `• Grupo \`${b.groupId}\` rango ≥ ${b.minRank} → <@&${b.roleId}>`).join('\n') : '_Sin vinculaciones_' },
  );
  ctx.reply({ embeds: [embed] });
}

async function cmdAyuda(ctx) {
  const embed = new EmbedBuilder().setTitle('📋 Comandos — Bot Roblox v7.0').setColor(0x5865F2)
    .setDescription('Usa `/` o `!` o `?` para todos los comandos.')
    .addFields(
      { name: '🔐 Verificación', value: '`/verificar` `/confirmar` `/actualizar` `/desvincular`' },
      { name: '👤 Perfil', value: '`/perfil` `/avatar` `/estado` `/grupos` `/amigos` `/insignias` `/buscar`' },
      { name: '⭐ Premium', value: '`/premium` — Ver estado\n`/flex` — Tarjeta de perfil ⭐\n`/comparar @u1 @u2` ⭐\n`/syncall` ⭐' },
      { name: '💰 Economía', value: '`!daily` `!puntos` `!top`' },
      { name: '🎮 Juegos', value: '`/juego <nombre>` — Buscar juego de Roblox' },
      { name: '🔔 Alertas', value: '`!alertas ver` `!alertas quitar @usuario`' },
      { name: '🔒 Privacidad', value: '`!permitir presencia/perfil` `!bloquear presencia/perfil`' },
      { name: '⚙️ Admin', value: '`/setverifiedrole` `/setpremiumrole` `/bindrole` `/unbindrole` `/listroles` `/setwelcome` `/setalertchannel` `/activarpremium`' },
    )
    .setFooter({ text: '⭐ = requiere Premium · Ko-fi: ' + (process.env.KOFI_PAGE ?? 'configura KOFI_PAGE') });
  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdAmigos, cmdInsignias, cmdBuscar,
  cmdComparar, cmdFlex, cmdJuego,
  cmdPuntos, cmdDaily, cmdTop,
  cmdWhois, cmdSyncAll,
  cmdAlertas, cmdSetWelcome, cmdSetAlertChannel,
  cmdActualizar, cmdDesvincular, cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdPremiumStatus, cmdActivarPremium,
  cmdAyuda, startPresenceMonitor,
};
