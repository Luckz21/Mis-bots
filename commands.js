// ============================================================
//  commands.js  —  v8.0
//  Fixes: amigos, alertas con ping, historial propio,
//  premium mejorado, dashboard profesional
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
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) { console.error('redisGet error:', e.message); return null; }
}

async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (e) { console.error('redisSet error:', e.message); }
}

async function redisDel(key) {
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
  } catch (e) { console.error('redisDel error:', e.message); }
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
  getHistory:     (id)       => redisGet(`history:${id}`),
  saveHistory:    (id, data) => redisSet(`history:${id}`, data),
  deleteHistory:  (id)       => redisDel(`history:${id}`),
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
  } catch (e) { console.error('robloxFetch:', url, e.message); return null; }
}

const roblox = {
  getUserByName: async (username) => {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    return data?.data?.[0] ?? null;
  },
  getProfile:    (id) => robloxFetch(`https://users.roblox.com/v1/users/${id}`),
  getAvatar: async (id) => {
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
  // FIX: Se obtiene cada amigo con sus datos correctos
  getFriends: async (id) => {
    const data = await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends?userSort=Alphabetical`);
    if (!data?.data) return [];
    // Asegurar que cada amigo tiene name y displayName
    return data.data.map(f => ({
      id: f.id ?? f.userId,
      name: f.name ?? f.username ?? `ID:${f.id}`,
      displayName: f.displayName ?? f.name ?? `ID:${f.id}`,
    }));
  },
  getGroups: async (id) => (await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`))?.data ?? [],
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
  getGameThumbnail: async (uid) => {
    if (!uid) return null;
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${uid}&size=512x512&format=Png`);
    return d?.data?.[0]?.imageUrl ?? null;
  },
  getBadges: async (id) => (await robloxFetch(`https://badges.roblox.com/v1/users/${id}/badges?limit=10&sortOrder=Desc`))?.data ?? [],
  searchGame: async (q) => {
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=5`);
    return d?.games ?? [];
  },
  isPremiumRoblox: async (id) => {
    const d = await robloxFetch(`https://premiumfeatures.roblox.com/v1/users/${id}/validate-membership`);
    return d === true || d?.isPremium === true;
  },
  formatPresence: (type) => ({
    0: { label: '⚫ Desconectado',           color: 0x99AAB5, emoji: '⚫' },
    1: { label: '🟢 Conectado (web o app)',   color: 0x57F287, emoji: '🟢' },
    2: { label: '🎮 Jugando en este momento', color: 0x00B0F4, emoji: '🎮' },
    3: { label: '🛠️ En Roblox Studio',        color: 0xFEE75C, emoji: '🛠️' },
  }[type] ?? { label: '❓ Desconocido', color: 0x99AAB5, emoji: '❓' }),
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

function premiumEmbed(ctx) {
  const embed = new EmbedBuilder()
    .setTitle('⭐ Función exclusiva Premium')
    .setColor(0xFFD700)
    .setDescription(
      '```\n╔══════════════════════════╗\n║   PREMIUM MEMBERSHIP     ║\n╚══════════════════════════╝```\n' +
      'Esta función requiere **Premium**.\n\n' +
      '**✨ ¿Qué incluye Premium?**\n' +
      '> 🔔 Alertas de presencia ilimitadas\n' +
      '> 🎨 `/flex` — Tarjeta de perfil exclusiva\n' +
      '> ⚔️ `/comparar` — Comparar dos cuentas\n' +
      '> 📜 `/historial` — Historial de juegos\n' +
      '> ⚙️ `/syncall` — Sincronizar todos los roles\n' +
      '> ⭐ Rol Premium exclusivo en el servidor\n\n' +
      `**☕ [Obtener Premium en Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})**\n\n` +
      `> _Pon tu Discord ID en el mensaje de donación:_\n> \`\`\`${ctx.userId}\`\`\``
    )
    .setFooter({ text: 'Bot Roblox · Sistema Premium' })
    .setTimestamp();
  ctx.reply({ embeds: [embed] });
}

// Registrar juego en historial (se llama desde /estado y monitor)
async function recordGameHistory(discordId, gameName, placeId) {
  if (!gameName) return;
  const history = await db.getHistory(discordId) ?? [];
  // Evitar duplicados consecutivos
  if (history.length > 0 && history[0].gameName === gameName) return;
  history.unshift({ gameName, placeId, playedAt: new Date().toISOString() });
  // Mantener máximo 20 entradas
  if (history.length > 20) history.splice(20);
  await db.saveHistory(discordId, history);
}

async function paginate(ctx, pages) {
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

// ── Monitor de presencia con ping ─────────────────────────────
async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      const alertUsers = await redisGet('alert_users') ?? [];
      for (const discordId of alertUsers) {
        const alerts = await db.getAlerts(discordId) ?? [];
        const guildConfs = {};
        for (const alert of alerts) {
          const presence = await roblox.getPresence(alert.watchedRobloxId);
          if (!presence) continue;
          const prev = presenceCache[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            const { label, color } = roblox.formatPresence(curr);
            const embed = new EmbedBuilder()
              .setTitle('🔔 Alerta de presencia')
              .setDescription(`**${alert.watchedUsername}** cambió su estado a: ${label}`)
              .setColor(color).setTimestamp();
            let gameName = null;
            if (curr === 2 && presence.universeId) {
              gameName = await roblox.getGameName(presence.universeId);
              if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
              // Registrar en historial del usuario vigilado
              const watchedEntry = await db.getUser(alert.watchedDiscordId ?? '');
              if (watchedEntry) await recordGameHistory(alert.watchedDiscordId, gameName, presence.rootPlaceId);
            }
            if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez', value: new Date(presence.lastOnline).toLocaleString('es-ES') });

            // Buscar canal de alertas del servidor
            if (!guildConfs[alert.guildId]) guildConfs[alert.guildId] = await db.getGuildConf(alert.guildId);
            const gconf = guildConfs[alert.guildId];
            const channelId = gconf?.alertChannelId ?? alert.channelId;

            try {
              const channel = await client.channels.fetch(channelId);
              // PING al usuario que configuró la alerta
              await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
            } catch (e) {
              // Si falla el canal, intentar DM
              try {
                const user = await client.users.fetch(discordId);
                await user.send({ embeds: [embed] });
              } catch (e2) { console.error('No pude notificar a', discordId); }
            }
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
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox. Verifica el nombre.');
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  const embed = new EmbedBuilder()
    .setTitle('🔐 Verificación de cuenta Roblox')
    .setColor(0xFFAA00)
    .setDescription(
      '**Sigue estos pasos:**\n\n' +
      '**1️⃣** Ve a tu perfil de Roblox\n' +
      '**2️⃣** Edita tu **descripción** y agrega este código:\n\n' +
      `\`\`\`${code}\`\`\`\n` +
      '**3️⃣** Vuelve aquí y usa `/confirmar`\n\n' +
      '⏱️ Tienes **10 minutos**. Puedes borrar el código después.'
    )
    .addFields(
      { name: '👤 Cuenta detectada', value: `**${robloxUser.name}**`, inline: true },
      { name: '🆔 ID de Roblox', value: `\`${robloxUser.id}\``, inline: true },
    )
    .setFooter({ text: 'El código solo verifica que eres el dueño de la cuenta' });
  ctx.reply({ embeds: [embed] });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply('❌ No tienes verificación pendiente. Usa `/verificar` primero.');
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile) return ctx.reply('❌ No pude acceder al perfil. Intenta de nuevo.');
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(`❌ No encontré el código \`${pending.code}\` en tu descripción.\nEspera unos segundos y vuelve a intentar.`);
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
  });
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);
  const config = await db.getGuildConf(ctx.guild.id);
  if (config?.welcomeChannelId) {
    const ch = await ctx.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (ch) {
      const msg = (config.welcomeMessage || '¡Bienvenido {user}! Tu cuenta **{roblox}** ha sido verificada. 🎉')
        .replace('{user}', `<@${ctx.userId}>`).replace('{roblox}', pending.robloxUsername);
      ch.send(msg).catch(() => {});
    }
  }
  const avatarUrl = await roblox.getAvatar(pending.robloxId);
  const embed = new EmbedBuilder()
    .setTitle('✅ ¡Verificación exitosa!')
    .setColor(0x57F287)
    .setThumbnail(avatarUrl)
    .setDescription(`Tu cuenta de Discord quedó vinculada a **${pending.robloxUsername}** en Roblox.`)
    .addFields(
      { name: '👁️ Tu perfil', value: 'Visible para otros ✅', inline: true },
      { name: '🎮 Tu presencia', value: 'Privada 🔒', inline: true },
    )
    .addFields({ name: '💡 Tip', value: 'Usa `!permitir presencia` si quieres que otros vean en qué juegas.' })
    .setFooter({ text: 'Puedes borrar el código de tu descripción' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD / PERFIL PROFESIONAL
// ════════════════════════════════════════════════════════════

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) {
    const who = target.id === ctx.userId ? 'No tienes' : `**${target.username}** no tiene`;
    return ctx.reply(`❌ ${who} una cuenta de Roblox vinculada.`);
  }
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');

  const [profile, avatarUrl, friends, followers, following, groups, badges] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
    roblox.getBadges(entry.robloxId),
  ]);
  if (!profile) return ctx.reply('❌ No pude obtener el perfil. Intenta de nuevo.');

  const [hasPremiumRoblox, hasGold] = await Promise.all([
    roblox.isPremiumRoblox(entry.robloxId),
    isPremium(target.id),
  ]);

  const age = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const years = Math.floor(age / 365);
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_Sin grupos_';

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(hasGold ? 0xFFD700 : 0x5865F2)
    .setThumbnail(avatarUrl)
    .setDescription(
      (profile.description?.slice(0, 200) || '*Sin descripción*') +
      `\n\n${hasPremiumRoblox ? '💎 **Roblox Premium** activo' : ''}`
    )
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: '🆔 ID de Roblox',  value: `\`${entry.robloxId}\``,       inline: true },
      { name: '📅 En Roblox',     value: `${age} días (${years} años)`, inline: true },
      { name: '📆 Creado',        value: createdAt,                      inline: true },
      { name: '👥 Amigos',        value: `**${friends}**`,               inline: true },
      { name: '👣 Seguidores',    value: `**${followers}**`,             inline: true },
      { name: '➡️ Siguiendo',     value: `**${following}**`,             inline: true },
      { name: '🏰 Grupos',        value: `**${groups.length}**`,         inline: true },
      { name: '🏅 Insignias',     value: `**${badges.length}+**`,        inline: true },
      { name: '\u200B',           value: '\u200B',                        inline: true },
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: '🏰 Grupos destacados', value: topGroups },
    )
    .setFooter({ text: `${hasGold ? '⭐ Premium · ' : ''}Discord: ${target.username ?? ctx.username}  ·  Roblox Bot v8` })
    .setTimestamp();

  // Botones de acción rápida
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🔗 Ver en Roblox').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate().catch(() => {});
    const parts = i.customId.split('_');
    const action = parts[1];
    const robloxId = parts[2];
    if (action === 'avatar') {
      const url = await roblox.getAvatarFull(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(`🎭 ${profile.displayName}`).setImage(url).setColor(0x5865F2)], ephemeral: true });
    } else if (action === 'estado') {
      const p = await roblox.getPresence(robloxId);
      if (!p) return i.followUp({ content: '❌ Sin presencia.', ephemeral: true });
      const { label, color } = roblox.formatPresence(p.userPresenceType);
      const e = new EmbedBuilder().setTitle(label).setDescription(`**${profile.displayName}**`).setColor(color);
      if (p.userPresenceType === 2 && p.universeId) {
        const gn = await roblox.getGameName(p.universeId);
        if (gn) e.addFields({ name: '🕹️ Jugando', value: `[${gn}](https://www.roblox.com/games/${p.rootPlaceId})` });
      }
      await i.followUp({ embeds: [e], ephemeral: true });
    } else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      const embed2 = new EmbedBuilder().setTitle('🏰 Grupos').setColor(0x5865F2)
        .setDescription(grps.length ? grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name} (rango ${g.role.rank})`).join('\n') : '_Sin grupos_');
      await i.followUp({ embeds: [embed2], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      const embed2 = new EmbedBuilder().setTitle('🏅 Insignias recientes').setColor(0xFEE75C)
        .setDescription(b.length ? b.map(x => `• **${x.name}**`).join('\n') : '_Sin insignias_');
      await i.followUp({ embeds: [embed2], ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return ctx.reply('❌ No pude cargar el avatar.');
  const embed = new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2).setThumbnail(h).setImage(f)
    .setFooter({ text: `Solicitado por ${ctx.username}` });
  ctx.reply({ embeds: [embed] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return ctx.reply(`🔒 **${target.username}** no permite ver su presencia.`);
  if (!ROBLOX_COOKIE) return ctx.reply('❌ Cookie de Roblox no configurada.');
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply('❌ No pude obtener la presencia. Intenta de nuevo.');
  const { label, color } = roblox.formatPresence(presence.userPresenceType);

  let gameName = null;
  if (presence.userPresenceType === 2 && presence.universeId) {
    gameName = await roblox.getGameName(presence.universeId);
    // Registrar en historial si es el propio usuario
    if (isSelf && gameName) await recordGameHistory(ctx.userId, gameName, presence.rootPlaceId);
  }

  const embed = new EmbedBuilder()
    .setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);
  if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez en línea', value: new Date(presence.lastOnline).toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
  embed.setFooter({ text: `Solicitado por ${ctx.username}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}_${target.id}`).setLabel('🔔 Activar alerta').setStyle(ButtonStyle.Primary),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    const parts = i.customId.split('_');
    const wId = parts[1], wName = parts[2], wDiscordId = parts[3];
    const userAlerts = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    if (!userPremium && userAlerts.length >= 2)
      return i.reply({ content: '❌ Límite de 2 alertas para usuarios gratuitos.\n⭐ Obtén **Premium** para alertas ilimitadas.', ephemeral: true });
    const exists = userAlerts.find(a => String(a.watchedRobloxId) === String(wId));
    if (!exists) {
      userAlerts.push({ watchedRobloxId: wId, watchedUsername: wName, watchedDiscordId: wDiscordId, channelId: i.channelId, guildId: i.guildId });
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: `✅ Recibirás alertas (con ping) cuando **${wName}** cambie su estado.`, ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no pertenece a ningún grupo público.`);
  const pages = [];
  for (let i = 0; i < groups.length; i += 5) {
    const chunk = groups.slice(i, i + 5);
    pages.push(new EmbedBuilder()
      .setTitle(`🏰 Grupos de ${entry.robloxUsername}`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(0x5865F2)
      .setDescription(chunk.map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: **${g.role.name}** · Rango: \`${g.role.rank}\``
      ).join('\n\n'))
      .setFooter({ text: `${groups.length} grupos en total` })
    );
  }
  await paginate(ctx, pages);
}

// FIX: cmdAmigos ahora muestra nombres correctamente
async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** no tiene amigos públicos.`);
  const pages = [];
  for (let i = 0; i < friends.length; i += 10) {
    const chunk = friends.slice(i, i + 10);
    pages.push(new EmbedBuilder()
      .setTitle(`👥 Amigos de ${entry.robloxUsername}`)
      .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
      .setColor(0x5865F2)
      .setDescription(
        chunk.map(f => {
          const name = f.name || `ID:${f.id}`;
          const displayName = f.displayName || name;
          return `• [${displayName}](https://www.roblox.com/users/${f.id}/profile)${displayName !== name ? ` (@${name})` : ''}`;
        }).join('\n')
      )
      .setFooter({ text: `${friends.length} amigos en total` })
    );
  }
  await paginate(ctx, pages);
}

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const badges = await roblox.getBadges(entry.robloxId);
  const embed = new EmbedBuilder()
    .setTitle(`🏅 Insignias de ${entry.robloxUsername}`)
    .setColor(0xFEE75C)
    .setDescription(badges.length
      ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n')
      : '_Sin insignias recientes_'
    )
    .setFooter({ text: 'Últimas 10 insignias' });
  ctx.reply({ embeds: [embed] });
}

async function cmdBuscar(ctx, username) {
  if (!username) return ctx.reply('❌ Uso: `/buscar <usuario>`');
  const u = await roblox.getUserByName(username);
  if (!u) return ctx.reply('❌ No encontré ese usuario en Roblox.');
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return ctx.reply('❌ No pude obtener el perfil.');
  const age = Math.floor((Date.now() - new Date(p.created)) / 86400000);
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${p.displayName}  ·  @${p.name}`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`)
    .setColor(0xEB459E).setThumbnail(av)
    .addFields(
      { name: '🆔 ID', value: `\`${u.id}\``, inline: true },
      { name: '📅 Días en Roblox', value: `${age}`, inline: true },
      { name: '💎 Premium', value: (await roblox.isPremiumRoblox(u.id)) ? 'Sí ✅' : 'No', inline: true },
      { name: '👥 Amigos', value: `${fr}`, inline: true },
      { name: '👣 Seguidores', value: `${fo}`, inline: true },
      { name: '🏰 Grupos', value: `${gr.length}`, inline: true },
      { name: '📝 Descripción', value: p.description?.slice(0, 300) || '_Sin descripción_' },
    )
    .setFooter({ text: 'Búsqueda pública · No requiere vinculación' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  HISTORIAL DE JUEGOS (línea ~400)
//  Se registra automáticamente cuando usas /estado mientras juegas
// ════════════════════════════════════════════════════════════

async function cmdHistorial(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return ctx.reply('📜 No tienes historial aún.\nSe registra automáticamente cuando usas `/estado` mientras juegas.');

  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de juegos de ${entry.robloxUsername}`)
    .setColor(0x5865F2)
    .setDescription(
      history.map((h, i) => {
        const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
      }).join('\n\n')
    )
    .setFooter({ text: `${history.length} juegos registrados · Máximo 20` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('clear_history').setLabel('🗑️ Borrar historial').setStyle(ButtonStyle.Danger),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo tú puedes hacer esto.', ephemeral: true });
    await db.deleteHistory(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Historial borrado').setColor(0xED4245).setDescription('Tu historial de juegos ha sido eliminado.')], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ════════════════════════════════════════════════════════════
//  PREMIUM
// ════════════════════════════════════════════════════════════

async function cmdPremiumStatus(ctx) {
  const premium = await db.getPremium(ctx.userId);
  const active  = await isPremium(ctx.userId);
  const embed   = new EmbedBuilder();
  if (active) {
    const exp = premium.expiresAt
      ? `**Expira:** ${new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}`
      : '**Tipo:** Permanente ∞';
    embed.setTitle('⭐ Premium activo').setColor(0xFFD700)
      .setDescription(
        '```\n╔══════════════════════════╗\n║   ⭐ PREMIUM ACTIVO ⭐    ║\n╚══════════════════════════╝```\n' +
        `${exp}\n\n**Funciones desbloqueadas:**\n> 🔔 Alertas ilimitadas\n> 🎨 \`/flex\`\n> ⚔️ \`/comparar\`\n> 📜 \`/historial\`\n> ⚙️ \`/syncall\`\n> ⭐ Rol Premium`
      );
  } else {
    embed.setTitle('⭐ Premium').setColor(0x99AAB5)
      .setDescription(
        '```\n╔══════════════════════════╗\n║      PREMIUM PLAN        ║\n╚══════════════════════════╝```\n' +
        '**¿Qué obtienes con Premium?**\n' +
        '> 🔔 Alertas de presencia **ilimitadas** (gratis = 2)\n' +
        '> 🎨 `/flex` — Tarjeta de perfil exclusiva\n' +
        '> ⚔️ `/comparar` — Comparar dos cuentas de Roblox\n' +
        '> 📜 `/historial` — Ver tus juegos recientes\n' +
        '> ⚙️ `/syncall` — Sincronizar roles de todos\n' +
        '> ⭐ Rol Premium exclusivo en el servidor\n\n' +
        `**[☕ Obtener Premium en Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})**\n\n` +
        `> Pon tu Discord ID en el mensaje de donación:\n> \`\`\`${ctx.userId}\`\`\``
      )
      .setFooter({ text: 'Después de donar recibirás una confirmación por DM' });
  }
  ctx.reply({ embeds: [embed] });
}

async function cmdActivarPremium(ctx, targetId, dias) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply('❌ Solo el dueño del bot.');
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId });
  ctx.reply(`✅ Premium activado para <@${targetId}>${dias ? ` por ${dias} días` : ' permanentemente'}.`);
}

async function cmdComparar(ctx, targetUser1, targetUser2) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!targetUser1 || !targetUser2) return ctx.reply('❌ Menciona a dos usuarios.');
  const [e1, e2] = await Promise.all([db.getUser(targetUser1.id), db.getUser(targetUser2.id)]);
  if (!e1) return ctx.reply(`❌ **${targetUser1.username}** no tiene cuenta vinculada.`);
  if (!e2) return ctx.reply(`❌ **${targetUser2.username}** no tiene cuenta vinculada.`);
  const [p1, fr1, fo1, g1, p2, fr2, fo2, g2, av1, av2] = await Promise.all([
    roblox.getProfile(e1.robloxId), roblox.getFriendCount(e1.robloxId),
    roblox.getFollowerCount(e1.robloxId), roblox.getGroups(e1.robloxId),
    roblox.getProfile(e2.robloxId), roblox.getFriendCount(e2.robloxId),
    roblox.getFollowerCount(e2.robloxId), roblox.getGroups(e2.robloxId),
    roblox.getAvatar(e1.robloxId), roblox.getAvatar(e2.robloxId),
  ]);
  const gIds1  = new Set(g1.map(g => g.group.id));
  const common = g2.filter(g => gIds1.has(g.group.id));
  const age1   = Math.floor((Date.now() - new Date(p1.created)) / 86400000);
  const age2   = Math.floor((Date.now() - new Date(p2.created)) / 86400000);
  const winner = (a, b) => a > b ? '🏆' : a < b ? '💀' : '🤝';
  const embed = new EmbedBuilder()
    .setTitle(`⚔️ ${p1.name}  vs  ${p2.name}`)
    .setColor(0x5865F2).setThumbnail(av1)
    .setDescription(`Grupos en común: **${common.length}** ${common.length > 0 ? `(${common.slice(0, 3).map(g => g.group.name).join(', ')})` : ''}`)
    .addFields(
      { name: `👤 ${p1.name}`,   value: '\u200B', inline: true },
      { name: '⚔️ Categoría',    value: '\u200B', inline: true },
      { name: `👤 ${p2.name}`,   value: '\u200B', inline: true },
      { name: `${winner(fr1, fr2)} ${fr1}`, value: '\u200B', inline: true },
      { name: '👥 Amigos',       value: '\u200B', inline: true },
      { name: `${winner(fr2, fr1)} ${fr2}`, value: '\u200B', inline: true },
      { name: `${winner(fo1, fo2)} ${fo1}`, value: '\u200B', inline: true },
      { name: '👣 Seguidores',   value: '\u200B', inline: true },
      { name: `${winner(fo2, fo1)} ${fo2}`, value: '\u200B', inline: true },
      { name: `${winner(g1.length, g2.length)} ${g1.length}`, value: '\u200B', inline: true },
      { name: '🏰 Grupos',       value: '\u200B', inline: true },
      { name: `${winner(g2.length, g1.length)} ${g2.length}`, value: '\u200B', inline: true },
      { name: `${winner(age1, age2)} ${age1}d`,  value: '\u200B', inline: true },
      { name: '📅 Antigüedad',   value: '\u200B', inline: true },
      { name: `${winner(age2, age1)} ${age2}d`,  value: '\u200B', inline: true },
    )
    .setFooter({ text: '🏆 = ganador · 🤝 = empate · ⭐ Premium' });
  ctx.reply({ embeds: [embed] });
}

async function cmdFlex(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const [profile, avatarFull, friends, followers, groups, badges, presence] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatarFull(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getGroups(entry.robloxId), roblox.getBadges(entry.robloxId),
    roblox.getPresence(entry.robloxId),
  ]);
  const { label } = roblox.formatPresence(presence?.userPresenceType ?? 0);
  const age = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const hasPremiumRoblox = await roblox.isPremiumRoblox(entry.robloxId);
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };

  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName}`)
    .setDescription(
      '```\n' +
      '╔════════════════════════════════╗\n' +
      '║       TARJETA DE PERFIL        ║\n' +
      '╚════════════════════════════════╝\n' +
      '```\n' +
      `*${profile.description?.slice(0, 150) || 'Sin descripción'}*`
    )
    .setColor(0xFFD700)
    .setImage(avatarFull)
    .addFields(
      { name: '🎮 Estado actual',  value: label,                    inline: true },
      { name: '📅 Días en Roblox', value: `${age} días`,            inline: true },
      { name: '💎 Roblox Premium', value: hasPremiumRoblox ? 'Sí ✅' : 'No ❌', inline: true },
      { name: '👥 Amigos',         value: `**${friends}**`,          inline: true },
      { name: '👣 Seguidores',     value: `**${followers}**`,        inline: true },
      { name: '🏰 Grupos',         value: `**${groups.length}**`,    inline: true },
      { name: '🏅 Insignias',      value: `**${badges.length}+**`,   inline: true },
      { name: '💰 Puntos',         value: `**${eco.points ?? 0}**`,  inline: true },
      { name: '⭐ Discord Premium', value: 'Activo ✅',               inline: true },
    )
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setFooter({ text: `⭐ Usuario Premium · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` })
    .setTimestamp();
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  ECONOMÍA
// ════════════════════════════════════════════════════════════

async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0 };
  const embed = new EmbedBuilder()
    .setTitle(`💰 Puntos de ${target.username ?? ctx.username}`)
    .setColor(0xFFD700)
    .addFields(
      { name: '💰 Puntos actuales', value: `**${eco.points ?? 0}**`,       inline: true },
      { name: '📈 Total ganado',    value: `**${eco.totalEarned ?? 0}**`,   inline: true },
    )
    .setFooter({ text: 'Usa !daily para ganar puntos cada día' });
  ctx.reply({ embeds: [embed] });
}

async function cmdDaily(ctx) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0 };
  const now  = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs  = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return ctx.reply(`⏰ Ya reclamaste tu daily. Vuelve en **${hrs}h ${mins}m**.`);
  }
  const bonus   = await isPremium(ctx.userId) ? 2 : 1;
  const reward  = (50 + Math.floor(Math.random() * 50)) * bonus;
  eco.points    = (eco.points ?? 0) + reward;
  eco.lastDaily = now.toISOString();
  eco.totalEarned = (eco.totalEarned ?? 0) + reward;
  await db.saveEconomy(ctx.userId, eco);
  const embed = new EmbedBuilder()
    .setTitle('🎁 ¡Daily reclamado!')
    .setColor(0x57F287)
    .setDescription(`Ganaste **${reward} puntos**${bonus === 2 ? ' (⭐ x2 Premium!)' : ''}!\nTotal acumulado: **${eco.points} puntos**`)
    .setFooter({ text: 'Vuelve mañana para más puntos' });
  ctx.reply({ embeds: [embed] });
}

async function cmdTop(ctx) {
  ctx.reply('📊 El leaderboard estará disponible próximamente. ¡Sigue acumulando con `!daily`!');
}

// ════════════════════════════════════════════════════════════
//  JUEGOS
// ════════════════════════════════════════════════════════════

async function cmdJuego(ctx, query) {
  if (!query) return ctx.reply('❌ Uso: `/juego <nombre>`');
  const games = await roblox.searchGame(query);
  if (!games.length) return ctx.reply('❌ No encontré juegos con ese nombre.');
  const game = games[0];
  const thumb = await roblox.getGameThumbnail(game.universeId ?? game.id);
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${game.name}`)
    .setURL(`https://www.roblox.com/games/${game.placeId}`)
    .setColor(0x00B0F4)
    .addFields(
      { name: '👥 Jugando ahora', value: `${game.playerCount ?? 'N/A'}`, inline: true },
      { name: '❤️ Likes',         value: `${game.totalUpVotes ?? 'N/A'}`, inline: true },
      { name: '👎 Dislikes',      value: `${game.totalDownVotes ?? 'N/A'}`, inline: true },
    )
    .setFooter({ text: `ID: ${game.placeId}` });
  if (thumb) embed.setThumbnail(thumb);
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  MODERACIÓN
// ════════════════════════════════════════════════════════════

async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario.');
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply(`❌ **${targetUser.username}** no tiene cuenta vinculada.`);
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Whois: ${targetUser.username}`)
    .setColor(0x5865F2)
    .setThumbnail(avatarUrl)
    .addFields(
      { name: '🎮 Cuenta Roblox', value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 Roblox ID',    value: `\`${entry.robloxId}\``, inline: true },
      { name: '⭐ Premium',       value: premium ? 'Sí ✅' : 'No', inline: true },
      { name: '📅 Verificado',   value: new Date(entry.verifiedAt).toLocaleDateString('es-ES'), inline: true },
    );
  ctx.reply({ embeds: [embed] });
}

async function cmdSyncAll(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return ctx.reply('❌ El bot necesita el permiso **Gestionar Roles**.');
  await ctx.reply('⏳ Sincronizando roles...');
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { await syncRoles(ctx.guild, id, entry.robloxId); count++; }
  }
  ctx.reply(`✅ Roles sincronizados para **${count}** miembros verificados.`);
}

// ════════════════════════════════════════════════════════════
//  ALERTAS
// ════════════════════════════════════════════════════════════

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    const alerts = await db.getAlerts(ctx.userId) ?? [];
    if (!alerts.length) return ctx.reply('❌ No tienes alertas configuradas.\nUsa `/estado @usuario` y toca el botón 🔔.');
    const embed = new EmbedBuilder().setTitle('🔔 Tus alertas de presencia').setColor(0x5865F2)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)`).join('\n'))
      .setFooter({ text: 'Las alertas llegan con ping en el canal o por DM' });
    return ctx.reply({ embeds: [embed] });
  }
  if (sub === 'quitar') {
    if (!targetUser) return ctx.reply('❌ Menciona a un usuario. Ej: `!alertas quitar @usuario`');
    const entry = await db.getUser(targetUser.id);
    if (!entry) return ctx.reply('❌ Ese usuario no tiene cuenta vinculada.');
    const alerts = (await db.getAlerts(ctx.userId) ?? []).filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada.`);
  }
  ctx.reply('❌ Uso: `!alertas ver` o `!alertas quitar @usuario`');
}

// ════════════════════════════════════════════════════════════
//  CONFIGURACIÓN Y PRIVACIDAD
// ════════════════════════════════════════════════════════════

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Roles actualizados correctamente.');
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes ninguna cuenta vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada.`);
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
  ctx.reply(`✅ Rol Premium: ${role}`);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Grupo \`${groupId}\` rango ≥ ${minRank} → ${role}`);
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
  const embed = new EmbedBuilder().setTitle('⚙️ Roles configurados').setColor(0x5865F2)
    .addFields(
      { name: '✅ Verificado', value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_' },
      { name: '⭐ Premium',    value: config?.premiumRoleId  ? `<@&${config.premiumRoleId}>`  : '_No configurado_' },
      { name: '🏰 Vinculaciones de grupos', value: config?.bindings?.length
        ? config.bindings.map(b => `• Grupo \`${b.groupId}\` rango ≥ **${b.minRank}** → <@&${b.roleId}>`).join('\n')
        : '_Sin vinculaciones_' },
    );
  ctx.reply({ embeds: [embed] });
}

async function cmdSetWelcome(ctx, channelId, message) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage = message || '¡Bienvenido {user}! Tu cuenta **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Bienvenida configurada en <#${channelId}>.\nUsa \`{user}\` y \`{roblox}\` en el mensaje.`);
}

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas: <#${channelId}>`);
}

async function cmdAyuda(ctx) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Comandos — Bot Roblox v8.0')
    .setColor(0x5865F2)
    .setDescription('Todos los comandos funcionan con `/`, `!` o `?`.')
    .addFields(
      { name: '🔐 Verificación',    value: '`/verificar` `/confirmar` `/actualizar` `/desvincular`' },
      { name: '👤 Perfil',          value: '`/perfil` `/avatar` `/estado` `/grupos` `/amigos` `/insignias` `/buscar`' },
      { name: '⭐ Premium',         value: '`/premium` · `/flex` ⭐ · `/comparar` ⭐ · `/historial` ⭐ · `/syncall` ⭐' },
      { name: '💰 Economía',        value: '`!daily` `!puntos [@usuario]`' },
      { name: '🎮 Juegos de Roblox',value: '`/juego <nombre>` — Buscar un juego' },
      { name: '🔔 Alertas',         value: '`!alertas ver` · `!alertas quitar @usuario`\n_Activa alertas desde el botón en `/estado`_' },
      { name: '🔒 Privacidad',      value: '`!permitir presencia/perfil` · `!bloquear presencia/perfil`' },
      { name: '🔍 Moderación',      value: '`/whois @usuario`' },
      { name: '⚙️ Administración',  value: '`/setverifiedrole` `/setpremiumrole` `/bindrole` `/unbindrole` `/listroles` `/setwelcome` `/setalertchannel`' },
    )
    .setFooter({ text: '⭐ = requiere Premium · Ko-fi: ' + (process.env.KOFI_PAGE ?? 'configura KOFI_PAGE en Railway') });
  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdAmigos, cmdInsignias, cmdBuscar,
  cmdComparar, cmdFlex, cmdHistorial, cmdJuego,
  cmdPuntos, cmdDaily, cmdTop,
  cmdWhois, cmdSyncAll,
  cmdAlertas, cmdSetWelcome, cmdSetAlertChannel,
  cmdActualizar, cmdDesvincular, cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdPremiumStatus, cmdActivarPremium,
  cmdAyuda, startPresenceMonitor,
};
