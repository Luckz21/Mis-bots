// ============================================================
//  commands.js  —  v10.0  (FINAL)
//  Nuevas funciones: leaderboard, Roblox status, catálogo,
//  muro de grupos, LFG, sugerencias, whois inverso,
//  cumpleaños de cuenta, ayuda mejorada con descripciones
// ============================================================

const {
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ComponentType,
} = require('discord.js');

const {
  cooldowns,
  profileCache, avatarCache, groupCache,
  presenceCache, friendCache, badgeCache,
  sanitizeUsername, sanitizeText,
} = require('./security.js');
const { t } = require('./i18n.js');

// ── Database ──────────────────────────────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) { console.error('redisGet:', e.message); return null; }
}

async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('redisSet:', e.message); }
}

async function redisDel(key) {
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  } catch (e) { console.error('redisDel:', e.message); }
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
  getLFG:         (id)       => redisGet(`lfg:${id}`),
  saveLFG:        (id, data) => redisSet(`lfg:${id}`, data),
  deleteLFG:      (id)       => redisDel(`lfg:${id}`),
};

// ── Roblox API con caché ──────────────────────────────────────
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
    const cached = profileCache.get(`name:${username}`);
    if (cached) return cached;
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST', body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    const result = data?.data?.[0] ?? null;
    if (result) profileCache.set(`name:${username}`, result);
    return result;
  },
  getUserById: async (id) => {
    const cached = profileCache.get(`profile:${id}`);
    if (cached) return cached;
    const result = await robloxFetch(`https://users.roblox.com/v1/users/${id}`);
    if (result) profileCache.set(`profile:${id}`, result);
    return result;
  },
  getProfile: async (id) => {
    const cached = profileCache.get(`profile:${id}`);
    if (cached) return cached;
    const result = await robloxFetch(`https://users.roblox.com/v1/users/${id}`);
    if (result) profileCache.set(`profile:${id}`, result);
    return result;
  },
  getAvatar: async (id) => {
    const cached = avatarCache.get(`head:${id}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=420x420&format=Png`);
    const result = d?.data?.[0]?.imageUrl ?? null;
    if (result) avatarCache.set(`head:${id}`, result);
    return result;
  },
  getAvatarFull: async (id) => {
    const cached = avatarCache.get(`full:${id}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=720x720&format=Png`);
    const result = d?.data?.[0]?.imageUrl ?? null;
    if (result) avatarCache.set(`full:${id}`, result);
    return result;
  },
  getFriendCount:    async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends/count`))?.count ?? 0,
  getFollowerCount:  async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followers/count`))?.count ?? 0,
  getFollowingCount: async (id) => (await robloxFetch(`https://friends.roblox.com/v1/users/${id}/followings/count`))?.count ?? 0,
  getFriends: async (id) => {
    const cached = friendCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://friends.roblox.com/v1/users/${id}/friends?userSort=Alphabetical`);
    const result = (data?.data ?? []).map(f => ({
      id: f.id ?? f.userId,
      name: f.name ?? f.username ?? `ID:${f.id}`,
      displayName: f.displayName ?? f.name ?? `ID:${f.id}`,
    }));
    if (result.length) friendCache.set(id, result);
    return result;
  },
  getGroups: async (id) => {
    const cached = groupCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://groups.roblox.com/v1/users/${id}/groups/roles`);
    const result = data?.data ?? [];
    if (result.length) groupCache.set(id, result);
    return result;
  },
  getGroupWall: async (groupId) => {
    const data = await robloxFetch(`https://groups.roblox.com/v2/groups/${groupId}/wall/posts?limit=5&sortOrder=Desc`);
    return data?.data ?? [];
  },
  getGroupInfo: async (groupId) => {
    return robloxFetch(`https://groups.roblox.com/v1/groups/${groupId}`);
  },
  getPresence: async (id) => {
    const cached = presenceCache.get(id);
    if (cached) return cached;
    const d = await robloxFetch('https://presence.roblox.com/v1/presence/users', {
      method: 'POST', body: JSON.stringify({ userIds: [id] }),
    });
    const result = d?.userPresences?.[0] ?? null;
    if (result) presenceCache.set(id, result);
    return result;
  },
  getGameName: async (uid) => {
    if (!uid) return null;
    const cached = profileCache.get(`game:${uid}`);
    if (cached) return cached;
    const d = await robloxFetch(`https://games.roblox.com/v1/games?universeIds=${uid}`);
    const result = d?.data?.[0]?.name ?? null;
    if (result) profileCache.set(`game:${uid}`, result);
    return result;
  },
  getBadges: async (id) => {
    const cached = badgeCache.get(id);
    if (cached) return cached;
    const data = await robloxFetch(`https://badges.roblox.com/v1/users/${id}/badges?limit=10&sortOrder=Desc`);
    const result = data?.data ?? [];
    if (result.length) badgeCache.set(id, result);
    return result;
  },
  getNameHistory: async (id) => {
    const data = await robloxFetch(`https://users.roblox.com/v1/users/${id}/username-history?limit=10&sortOrder=Desc`);
    return data?.data ?? [];
  },
  searchGame: async (q) => {
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=5`);
    return d?.games ?? [];
  },
  searchCatalog: async (q) => {
    const d = await robloxFetch(`https://catalog.roblox.com/v1/search/items?keyword=${encodeURIComponent(q)}&limit=5&category=All`);
    return d?.data ?? [];
  },
  getCatalogItem: async (id) => {
    return robloxFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
  },
  getCatalogThumbnail: async (id) => {
    const d = await robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=150x150&format=Png`);
    return d?.data?.[0]?.imageUrl ?? null;
  },
  isPremiumRoblox: async (id) => {
    const d = await robloxFetch(`https://premiumfeatures.roblox.com/v1/users/${id}/validate-membership`);
    return d === true || d?.isPremium === true;
  },
  getRobloxStatus: async () => {
    try {
      const res = await fetch('https://status.roblox.com/api/v2/summary.json');
      return await res.json();
    } catch { return null; }
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
const presenceCacheMonitor = {};

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

async function isPremium(discordId) {
  const data = await db.getPremium(discordId);
  if (!data) return false;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
  return true;
}

async function getGuildLang(guildId) {
  const config = await db.getGuildConf(guildId);
  return config?.lang ?? 'es';
}

function progressBar(current, max, size = 10) {
  const filled = Math.min(Math.round((current / max) * size), size);
  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

function getRank(points) {
  if (points >= 10000) return { name: '💎 Diamante', color: 0x00FFFF, next: null };
  if (points >= 5000)  return { name: '🏆 Platino',  color: 0xE5E4E2, next: 10000 };
  if (points >= 2000)  return { name: '🥇 Oro',      color: 0xFFD700, next: 5000  };
  if (points >= 500)   return { name: '🥈 Plata',    color: 0xC0C0C0, next: 2000  };
  return                      { name: '🥉 Bronce',   color: 0xCD7F32, next: 500   };
}

const ACHIEVEMENTS = [
  { id: 'first_verify',  name: '🎖️ Primer Paso',      desc: 'Verificar tu cuenta por primera vez' },
  { id: 'streak_7',      name: '🔥 Racha de 7 días',  desc: 'Usar !daily 7 días seguidos' },
  { id: 'streak_30',     name: '🌟 Racha de 30 días', desc: 'Usar !daily 30 días seguidos' },
  { id: 'points_1000',   name: '💰 1000 puntos',      desc: 'Acumular 1000 puntos en total' },
  { id: 'points_5000',   name: '💎 5000 puntos',      desc: 'Acumular 5000 puntos en total' },
];

async function checkAchievements(discordId, eco, user) {
  const achieved = eco.achievements ?? [];
  const newOnes  = [];
  const conditions = {
    first_verify: () => !!user,
    streak_7:     () => (eco.streak ?? 0) >= 7,
    streak_30:    () => (eco.streak ?? 0) >= 30,
    points_1000:  () => (eco.totalEarned ?? 0) >= 1000,
    points_5000:  () => (eco.totalEarned ?? 0) >= 5000,
  };
  for (const ach of ACHIEVEMENTS) {
    if (!achieved.includes(ach.id) && conditions[ach.id]?.()) {
      achieved.push(ach.id);
      newOnes.push(ach);
    }
  }
  if (newOnes.length) { eco.achievements = achieved; await db.saveEconomy(discordId, eco); }
  return newOnes;
}

async function recordGameHistory(discordId, gameName, placeId) {
  if (!gameName) return;
  const history = await db.getHistory(discordId) ?? [];
  if (history.length > 0 && history[0].gameName === gameName) return;
  history.unshift({ gameName, placeId, playedAt: new Date().toISOString() });
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
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    if (i.customId === 'prev') current--;
    if (i.customId === 'next') current++;
    await i.update({ embeds: [pages[current]], components: [getRow(current)] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

function premiumEmbed(ctx) {
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle('⭐ Función exclusiva Premium').setColor(0xFFD700)
    .setDescription(
      '```\n╔══════════════════════════╗\n║   PREMIUM MEMBERSHIP     ║\n╚══════════════════════════╝```\n' +
      '**Funciones Premium:**\n> 🔔 Alertas ilimitadas\n> 🎨 `/flex`\n> ⚔️ `/comparar`\n> 📜 `/historial`\n> ⚙️ `/syncall`\n> ⏩ Cooldowns reducidos\n\n' +
      `**[☕ Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})** — Pon tu ID: \`${ctx.userId}\``
    ).setTimestamp()] });
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
  if (config.nicknameFormat) {
    const profile = await roblox.getProfile(robloxId);
    if (profile) {
      const groups  = await roblox.getGroups(robloxId);
      const rank    = groups[0]?.role.name ?? '';
      const nickname = config.nicknameFormat
        .replace('{roblox}', profile.name)
        .replace('{display}', profile.displayName)
        .replace('{rank}', rank)
        .slice(0, 32);
      await member.setNickname(nickname).catch(() => {});
    }
  }
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
          const prev = presenceCacheMonitor[alert.watchedRobloxId];
          const curr = presence.userPresenceType;
          if (prev !== undefined && prev !== curr) {
            const { label, color } = roblox.formatPresence(curr);
            const embed = new EmbedBuilder()
              .setTitle('🔔 Alerta de presencia')
              .setDescription(`**${alert.watchedUsername}** → ${label}`)
              .setColor(color).setTimestamp();
            if (curr === 2 && presence.universeId) {
              const gn = await roblox.getGameName(presence.universeId);
              if (gn) embed.addFields({ name: '🕹️ Jugando', value: `[${gn}](https://www.roblox.com/games/${presence.rootPlaceId})` });
            }
            if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez', value: new Date(presence.lastOnline).toLocaleString('es-ES') });
            const config    = await db.getGuildConf(alert.guildId);
            const channelId = config?.alertChannelId ?? alert.channelId;
            try {
              const channel = await client.channels.fetch(channelId);
              await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
            } catch {
              try { const user = await client.users.fetch(discordId); await user.send({ embeds: [embed] }); }
              catch { console.error('No pude notificar a', discordId); }
            }
          }
          presenceCacheMonitor[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) { console.error('Monitor error:', e.message); }
  }, 60000);

  // Monitor de cumpleaños de cuentas (revisar cada hora)
  setInterval(async () => {
    try {
      const birthdayUsers = await redisGet('birthday_monitor') ?? [];
      const today = new Date();
      for (const { discordId, robloxId, channelId, guildId, created } of birthdayUsers) {
        const createdDate = new Date(created);
        if (createdDate.getMonth() === today.getMonth() && createdDate.getDate() === today.getDate()) {
          const years = today.getFullYear() - createdDate.getFullYear();
          const profile  = await roblox.getProfile(robloxId);
          const avatarUrl = await roblox.getAvatar(robloxId);
          const embed = new EmbedBuilder()
            .setTitle('🎂 ¡Aniversario de cuenta!')
            .setDescription(`**${profile?.name ?? 'Usuario'}** celebra **${years} año${years !== 1 ? 's' : ''}** en Roblox hoy!`)
            .setColor(0xFF69B4).setThumbnail(avatarUrl).setTimestamp();
          try {
            const channel = await client.channels.fetch(channelId);
            await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
          } catch { console.error('No pude enviar aniversario a', discordId); }
        }
      }
    } catch (e) { console.error('Birthday monitor error:', e.message); }
  }, 3600000); // cada hora
}

async function onMemberJoin(member) {
  const entry = await db.getUser(member.id);
  if (!entry) return;
  await syncRoles(member.guild, member.id, entry.robloxId);
  console.log(`🔄 On-join sync: ${member.user.username}`);
}

async function onGuildAdd(guild) {
  try {
    const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages'));
    if (!channel) return;
    channel.send({ embeds: [new EmbedBuilder()
      .setTitle('👋 ¡Hola! Soy el Bot de Roblox v10')
      .setColor(0x5865F2)
      .setDescription('Gracias por añadirme. Aquí está la guía rápida:')
      .addFields(
        { name: '1️⃣ Rol de verificado',  value: '`/setverifiedrole @Rol`' },
        { name: '2️⃣ Bienvenida',         value: '`/setwelcome #canal Mensaje`' },
        { name: '3️⃣ Alertas',            value: '`/setalertchannel #canal`' },
        { name: '4️⃣ Grupos → Roles',     value: '`/bindrole <grupoId> <rangoMin> @Rol`' },
        { name: '5️⃣ Idioma',             value: '`/setlang es|en|pt`' },
        { name: '6️⃣ Verificación',       value: 'Los usuarios usan `/verificar <username>`' },
        { name: '📋 Todos los comandos',  value: '`/ayuda`' },
      )
      .setFooter({ text: 'Bot Roblox v10 · Usa /ayuda para ver todo' })] });
  } catch (e) { console.error('onGuildAdd:', e.message); }
}

// ════════════════════════════════════════════════════════════
//  VERIFICACIÓN
// ════════════════════════════════════════════════════════════

async function cmdVerificar(ctx, robloxUsername) {
  const lang  = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(robloxUsername);
  if (!clean) return ctx.reply('❌ Nombre de usuario inválido o demasiado corto.');
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply(t(lang, 'verify_already', existing.robloxUsername));
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply(t(lang, 'verify_not_found'));
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(t(lang, 'verify_title')).setColor(0xFFAA00)
    .setDescription(`${t(lang, 'verify_step1')}\n${t(lang, 'verify_step2')}\n\`\`\`${code}\`\`\`\n${t(lang, 'verify_step3')}\n\n${t(lang, 'verify_time')}`)
    .addFields(
      { name: '👤 Usuario', value: `**${robloxUser.name}**`, inline: true },
      { name: '🆔 ID',      value: `\`${robloxUser.id}\``,  inline: true },
    )
    .setFooter({ text: 'El código solo verifica que eres el dueño de la cuenta' })] });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const lang    = await getGuildLang(ctx.guild?.id);
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply(t(lang, 'confirm_no_pending'));
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile)  return ctx.reply(t(lang, 'confirm_no_profile'));
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(t(lang, 'confirm_code_fail', pending.code, pending.robloxUsername));
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
  });
  const eco    = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const user   = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  // Registrar para monitor de cumpleaños
  const createdProfile = await roblox.getProfile(pending.robloxId);
  if (createdProfile?.created) {
    const config      = await db.getGuildConf(ctx.guild.id);
    const alertChannel = config?.alertChannelId ?? ctx.channelId;
    const birthdayList = await redisGet('birthday_monitor') ?? [];
    if (!birthdayList.find(b => b.discordId === ctx.userId)) {
      birthdayList.push({ discordId: ctx.userId, robloxId: pending.robloxId, channelId: alertChannel, guildId: ctx.guild.id, created: createdProfile.created });
      await redisSet('birthday_monitor', birthdayList);
    }
  }

  const config = await db.getGuildConf(ctx.guild.id);
  if (config?.welcomeChannelId) {
    const ch = await ctx.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (ch) ch.send((config.welcomeMessage || '¡Bienvenido {user}! Tu cuenta **{roblox}** fue verificada. 🎉').replace('{user}', `<@${ctx.userId}>`).replace('{roblox}', pending.robloxUsername)).catch(() => {});
  }
  const avatarUrl = await roblox.getAvatar(pending.robloxId);
  const embed = new EmbedBuilder().setTitle('✅ ¡Verificación exitosa!').setColor(0x57F287)
    .setThumbnail(avatarUrl)
    .setDescription(t(lang, 'confirm_success', pending.robloxUsername))
    .addFields(
      { name: '👁️ Perfil',   value: 'Visible para otros ✅', inline: true },
      { name: '🎮 Presencia', value: 'Privada por defecto 🔒',  inline: true },
    )
    .setFooter({ text: 'Puedes borrar el código de tu descripción de Roblox' });
  if (newAchs.length) embed.addFields({ name: '🏅 Logros desbloqueados', value: newAchs.map(a => `**${a.name}**`).join(', ') });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  PERFIL / DASHBOARD
// ════════════════════════════════════════════════════════════

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(t(lang, 'no_account', target.username ?? ctx.username));
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply(t(lang, 'profile_private'));

  const [profile, avatarUrl, friends, followers, following, groups, badges] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
    roblox.getBadges(entry.robloxId),
  ]);
  if (!profile) return ctx.reply(t(lang, 'error_generic'));

  const [hasPremiumRoblox, hasGold, eco] = await Promise.all([
    roblox.isPremiumRoblox(entry.robloxId), isPremium(target.id), db.getEconomy(target.id),
  ]);

  const age       = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank      = getRank(eco?.points ?? 0);
  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_Sin grupos_';
  const achList   = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean).join(' ');
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(hasGold ? 0xFFD700 : rank.color).setThumbnail(avatarUrl)
    .setDescription((profile.description?.slice(0, 150) || '*Sin descripción*') + (hasPremiumRoblox ? '\n💎 **Roblox Premium**' : ''))
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: '🆔 ID',             value: `\`${entry.robloxId}\``,   inline: true },
      { name: '📅 Creado',         value: createdAt,                   inline: true },
      { name: '📆 Días en Roblox', value: `${age}`,                    inline: true },
      { name: '👥 Amigos',         value: `**${friends}**`,            inline: true },
      { name: '👣 Seguidores',     value: `**${followers}**`,          inline: true },
      { name: '➡️ Siguiendo',      value: `**${following}**`,          inline: true },
      { name: '🏰 Grupos',         value: `**${groups.length}**`,      inline: true },
      { name: '🏅 Insignias',      value: `**${badges.length}+**`,     inline: true },
      { name: rank.name,           value: `${eco?.points ?? 0} pts`,   inline: true },
    );

  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  if (achList)   embed.addFields({ name: '🏅 Logros', value: achList });
  embed.addFields({ name: '🏰 Grupos destacados', value: topGroups });
  embed.setFooter({ text: `${hasGold ? '⭐ Premium · ' : ''}Discord: ${target.username ?? ctx.username}` }).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🔗 Roblox').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate().catch(() => {});
    const [, action, robloxId] = i.customId.split('_');
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
        if (gn) e.addFields({ name: '🕹️', value: gn });
      }
      await i.followUp({ embeds: [e], ephemeral: true });
    } else if (action === 'grupos') {
      const grps = await roblox.getGroups(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏰 Grupos').setColor(0x5865F2)
        .setDescription(grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n') || '_Sin grupos_')], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏅 Insignias').setColor(0xFEE75C)
        .setDescription(b.map(x => `• ${x.name}`).join('\n') || '_Sin insignias_')], ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(t(lang, 'no_account', target.username ?? ctx.username));
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply(t(lang, 'profile_private'));
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return ctx.reply(t(lang, 'error_generic'));
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(0x5865F2).setThumbnail(h).setImage(f)
    .setFooter({ text: `Solicitado por ${ctx.username}` })] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(t(lang, 'no_account', target.username ?? ctx.username));
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return ctx.reply(t(lang, 'presence_private', target.username));
  if (!ROBLOX_COOKIE) return ctx.reply(t(lang, 'no_cookie'));
  presenceCache.cache?.delete?.(entry.robloxId);
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply(t(lang, 'error_generic'));
  const { label, color } = roblox.formatPresence(presence.userPresenceType);
  let gameName = null;
  if (presence.userPresenceType === 2 && presence.universeId) {
    gameName = await roblox.getGameName(presence.universeId);
    if (isSelf && gameName) await recordGameHistory(ctx.userId, gameName, presence.rootPlaceId);
  }
  const embed = new EmbedBuilder().setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(color);
  if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
  if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez en línea', value: new Date(presence.lastOnline).toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
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
    const userAlerts  = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    if (!userPremium && userAlerts.length >= 2)
      return i.reply({ content: '❌ Límite gratuito: 2 alertas. ⭐ Premium = ilimitadas.', ephemeral: true });
    if (!userAlerts.find(a => String(a.watchedRobloxId) === String(wId))) {
      userAlerts.push({ watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId });
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: `✅ Alerta activada para **${wName}**. Recibirás un ping cuando cambie su estado.`, ephemeral: true });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdGrupos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(t(lang, 'no_account', target.username ?? ctx.username));
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply(t(lang, 'profile_private'));
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no tiene grupos públicos.`);
  const pages = [];
  for (let i = 0; i < groups.length; i += 5)
    pages.push(new EmbedBuilder().setTitle(`🏰 Grupos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(groups.slice(i, i + 5).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: **${g.role.name}** · Rango \`${g.role.rank}\``
      ).join('\n\n')).setFooter({ text: `${groups.length} grupos en total` }));
  await paginate(ctx, pages);
}

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(t(lang, 'no_account', target.username ?? ctx.username));
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply(t(lang, 'profile_private'));
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** no tiene amigos públicos.`);
  const pages = [];
  for (let i = 0; i < friends.length; i += 10)
    pages.push(new EmbedBuilder().setTitle(`👥 Amigos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(friends.slice(i, i + 10).map(f => {
        const nm = f.name || `ID:${f.id}`;
        const dn = f.displayName || nm;
        return `• [${dn}](https://www.roblox.com/users/${f.id}/profile)${dn !== nm ? ` (@${nm})` : ''}`;
      }).join('\n')).setFooter({ text: `${friends.length} amigos` }));
  await paginate(ctx, pages);
}

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const badges = await roblox.getBadges(entry.robloxId);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Insignias de ${entry.robloxUsername}`).setColor(0xFEE75C)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n') : '_Sin insignias recientes_')
    .setFooter({ text: 'Últimas 10 insignias · Se ganan jugando diferentes juegos' })] });
}

async function cmdHistorialNombres(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  const history = await roblox.getNameHistory(entry.robloxId);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`📜 Historial de nombres de ${entry.robloxUsername}`)
    .setColor(0x5865F2)
    .setDescription(history.length ? history.map((h, i) => `**${i + 1}.** ${h.name}`).join('\n') : '_Sin historial de nombres anteriores_')
    .setFooter({ text: 'Nombres anteriores que tuvo esta cuenta de Roblox' })] });
}

async function cmdBuscar(ctx, username) {
  const lang  = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(username);
  if (!clean) return ctx.reply('❌ Nombre inválido.');
  const u = await roblox.getUserByName(clean);
  if (!u) return ctx.reply(t(lang, 'verify_not_found'));
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return ctx.reply(t(lang, 'error_generic'));
  const age = Math.floor((Date.now() - new Date(p.created)) / 86400000);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 ${p.displayName}  ·  @${p.name}`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`).setColor(0xEB459E).setThumbnail(av)
    .addFields(
      { name: '🆔 ID',          value: `\`${u.id}\``, inline: true },
      { name: '📅 Días',        value: `${age}`,       inline: true },
      { name: '👥 Amigos',      value: `${fr}`,         inline: true },
      { name: '👣 Seguidores',  value: `${fo}`,         inline: true },
      { name: '🏰 Grupos',      value: `${gr.length}`,  inline: true },
      { name: '\u200B',         value: '\u200B',         inline: true },
      { name: '📝 Descripción', value: p.description?.slice(0, 300) || '_Sin descripción_' },
    ).setFooter({ text: 'Búsqueda pública · No requiere vinculación previa' })] });
}

// ── Búsqueda inversa por ID de Roblox ─────────────────────────
async function cmdWhoisRoblox(ctx, robloxId) {
  if (!robloxId || isNaN(robloxId)) return ctx.reply('❌ Proporciona un ID numérico de Roblox. Ej: `!whoislox 123456`');
  const profile  = await roblox.getUserById(robloxId);
  if (!profile)  return ctx.reply('❌ No encontré ningún usuario con ese ID en Roblox.');
  const avatarUrl = await roblox.getAvatar(robloxId);
  // Buscar si está vinculado en la base de datos
  // (búsqueda directa — Redis no tiene índice inverso, así que informamos si es posible)
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ID de Roblox: ${robloxId}`)
    .setColor(0xEB459E).setThumbnail(avatarUrl)
    .addFields(
      { name: '👤 Nombre',       value: `**${profile.displayName}** (@${profile.name})`, inline: true },
      { name: '🆔 ID',           value: `\`${robloxId}\``,  inline: true },
      { name: '📅 Creado',       value: new Date(profile.created).toLocaleDateString('es-ES'), inline: true },
      { name: '📝 Descripción',  value: profile.description?.slice(0, 200) || '_Sin descripción_' },
    )
    .setURL(`https://www.roblox.com/users/${robloxId}/profile`)
    .setFooter({ text: 'Búsqueda por ID de Roblox' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  HISTORIAL DE JUEGOS
// ════════════════════════════════════════════════════════════

async function cmdHistorial(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return ctx.reply('📜 Sin historial aún.\nSe registra automáticamente cuando usas `/estado` mientras juegas en Roblox.');
  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de juegos de ${entry.robloxUsername}`)
    .setDescription(history.map((h, i) => {
      const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
    }).join('\n\n'))
    .setColor(0x5865F2)
    .setFooter({ text: `${history.length}/20 registrados · Se actualiza con /estado` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('clear_history').setLabel('🗑️ Borrar historial').setStyle(ButtonStyle.Danger),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo tú puedes borrar tu historial.', ephemeral: true });
    await db.deleteHistory(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Historial borrado').setColor(0xED4245).setDescription('Tu historial de juegos fue eliminado correctamente.')], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ════════════════════════════════════════════════════════════
//  NUEVAS FUNCIONES: CATÁLOGO, MURO DE GRUPOS, ROBLOX STATUS
// ════════════════════════════════════════════════════════════

// Buscar items en el catálogo de Roblox
async function cmdCatalogo(ctx, query) {
  const clean = sanitizeText(query, 100);
  if (!clean) return ctx.reply('❌ Uso: `/catalogo <nombre del item>`');
  const items = await roblox.searchCatalog(clean);
  if (!items.length) return ctx.reply('❌ No encontré items con ese nombre en el catálogo.');

  const pages = [];
  for (let i = 0; i < Math.min(items.length, 5); i++) {
    const item = items[i];
    const [details, thumb] = await Promise.all([
      roblox.getCatalogItem(item.id).catch(() => null),
      roblox.getCatalogThumbnail(item.id).catch(() => null),
    ]);
    const embed = new EmbedBuilder()
      .setTitle(`🛍️ ${item.name}`)
      .setURL(`https://www.roblox.com/catalog/${item.id}`)
      .setColor(0x00B0F4);
    if (thumb) embed.setThumbnail(thumb);
    embed.addFields(
      { name: '🆔 ID',       value: `\`${item.id}\``,                              inline: true },
      { name: '📦 Tipo',     value: item.itemType ?? 'Desconocido',                 inline: true },
      { name: '💰 Precio',   value: details?.PriceInRobux ? `R$ ${details.PriceInRobux}` : 'Gratis / No disponible', inline: true },
      { name: '👤 Creador',  value: details?.Creator?.Name ?? 'Desconocido',        inline: true },
    );
    pages.push(embed);
  }
  await paginate(ctx, pages);
}

// Ver el muro de un grupo de Roblox
async function cmdMuroGrupo(ctx, groupId) {
  if (!groupId || isNaN(groupId)) return ctx.reply('❌ Proporciona el ID numérico del grupo. Ej: `/murogrupo 12345`');
  const [groupInfo, posts] = await Promise.all([
    roblox.getGroupInfo(groupId),
    roblox.getGroupWall(groupId),
  ]);
  if (!groupInfo) return ctx.reply('❌ No encontré ese grupo en Roblox. Verifica el ID.');
  if (!posts.length) return ctx.reply(`El muro del grupo **${groupInfo.name}** está vacío o es privado.`);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Muro de ${groupInfo.name}`)
    .setURL(`https://www.roblox.com/groups/${groupId}`)
    .setColor(0x5865F2)
    .setDescription(
      posts.map((p, i) => {
        const author = p.poster?.user?.username ?? 'Desconocido';
        const date   = new Date(p.created).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const body   = p.body?.slice(0, 150) ?? '';
        return `**${i + 1}. ${author}** · ${date}\n${body}`;
      }).join('\n\n')
    )
    .addFields({ name: '👥 Miembros', value: `${groupInfo.memberCount ?? '?'}`, inline: true })
    .setFooter({ text: 'Últimas 5 publicaciones del muro público' });
  ctx.reply({ embeds: [embed] });
}

// Estado de los servidores de Roblox
async function cmdRobloxStatus(ctx) {
  const status = await roblox.getRobloxStatus();
  if (!status) return ctx.reply('❌ No pude obtener el estado de Roblox. Intenta en unos minutos.');

  const overall  = status.status?.description ?? 'Desconocido';
  const indicator = status.status?.indicator;
  const colorMap  = { none: 0x57F287, minor: 0xFEE75C, major: 0xED4245, critical: 0xED4245 };
  const emojiMap  = { none: '✅', minor: '⚠️', major: '❌', critical: '🔴' };

  const components = (status.components ?? []).filter(c => !c.group).slice(0, 8);
  const compStatus  = { operational: '✅ Operacional', degraded_performance: '⚠️ Degradado', partial_outage: '⚠️ Interrupción parcial', major_outage: '❌ Interrupción mayor', under_maintenance: '🔧 En mantenimiento' };

  const embed = new EmbedBuilder()
    .setTitle(`${emojiMap[indicator] ?? '❓'} Estado de Roblox`)
    .setURL('https://status.roblox.com')
    .setColor(colorMap[indicator] ?? 0x99AAB5)
    .setDescription(`**Estado general:** ${overall}`)
    .setTimestamp();

  if (components.length) {
    embed.addFields({ name: '🖥️ Servicios', value: components.map(c =>
      `${compStatus[c.status] ?? '❓'} **${c.name}**`
    ).join('\n') });
  }

  const incidents = (status.incidents ?? []).slice(0, 3);
  if (incidents.length) {
    embed.addFields({ name: '⚠️ Incidentes activos', value: incidents.map(i =>
      `**${i.name}** — ${i.status}`
    ).join('\n') });
  }

  embed.setFooter({ text: 'Fuente: status.roblox.com' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  LFG (Looking for Group)
// ════════════════════════════════════════════════════════════

async function cmdLFG(ctx, gameName, slots) {
  if (!gameName) return ctx.reply('❌ Uso: `!lfg <nombre del juego> [slots]`\nEjemplo: `!lfg Blox Fruits 4`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Necesitas tener cuenta vinculada para crear un LFG.');
  const maxSlots = Math.min(Math.max(parseInt(slots) || 4, 2), 10);
  const lfgData  = {
    hostId:    ctx.userId,
    hostName:  ctx.username,
    robloxName: entry.robloxUsername,
    gameName:  sanitizeText(gameName, 50),
    slots:     maxSlots,
    members:   [{ id: ctx.userId, name: ctx.username, roblox: entry.robloxUsername }],
    createdAt: new Date().toISOString(),
  };

  const makeLFGEmbed = (data) => {
    const filled = data.members.length;
    const bar    = '🟢'.repeat(filled) + '⬛'.repeat(data.slots - filled);
    return new EmbedBuilder()
      .setTitle(`🎮 LFG — ${data.gameName}`)
      .setColor(filled >= data.slots ? 0xED4245 : 0x57F287)
      .setDescription(
        `**Anfitrión:** ${data.robloxName} (@${data.hostName})\n` +
        `**Jugadores:** ${bar} ${filled}/${data.slots}\n\n` +
        `**Miembros:**\n${data.members.map((m, i) => `${i + 1}. ${m.roblox} (@${m.name})`).join('\n')}`
      )
      .setFooter({ text: filled >= data.slots ? '🔴 Grupo lleno' : '🟢 Abierto — toca el botón para unirte' })
      .setTimestamp();
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lfg_join').setLabel('✅ Unirse').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('lfg_leave').setLabel('❌ Salir').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('lfg_close').setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger),
  );

  const msg = await ctx.replyAndFetch({ embeds: [makeLFGEmbed(lfgData)], components: [row] });
  if (!msg) return;

  await db.saveLFG(msg.id, lfgData);

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000 }); // 30 min
  collector.on('collect', async (i) => {
    const data = await db.getLFG(msg.id) ?? lfgData;

    if (i.customId === 'lfg_join') {
      if (data.members.find(m => m.id === i.user.id))
        return i.reply({ content: '❌ Ya estás en el grupo.', ephemeral: true });
      if (data.members.length >= data.slots)
        return i.reply({ content: '❌ El grupo está lleno.', ephemeral: true });
      const userEntry = await db.getUser(i.user.id);
      data.members.push({ id: i.user.id, name: i.user.username, roblox: userEntry?.robloxUsername ?? i.user.username });
      await db.saveLFG(msg.id, data);
      await i.update({ embeds: [makeLFGEmbed(data)], components: data.members.length >= data.slots ? [] : [row] });
    } else if (i.customId === 'lfg_leave') {
      if (i.user.id === data.hostId)
        return i.reply({ content: '❌ El anfitrión no puede salir. Usa 🔒 Cerrar.', ephemeral: true });
      data.members = data.members.filter(m => m.id !== i.user.id);
      await db.saveLFG(msg.id, data);
      await i.update({ embeds: [makeLFGEmbed(data)], components: [row] });
    } else if (i.customId === 'lfg_close') {
      if (i.user.id !== data.hostId)
        return i.reply({ content: '❌ Solo el anfitrión puede cerrar el grupo.', ephemeral: true });
      await db.deleteLFG(msg.id);
      collector.stop();
      await i.update({ embeds: [makeLFGEmbed(data).setColor(0xED4245).setFooter({ text: '🔒 Grupo cerrado por el anfitrión' })], components: [] });
    }
  });
  collector.on('end', () => { msg.edit({ components: [] }).catch(() => {}); db.deleteLFG(msg.id); });
}

// ════════════════════════════════════════════════════════════
//  SUGERENCIAS
// ════════════════════════════════════════════════════════════

async function cmdSugerencia(ctx, text) {
  const clean = sanitizeText(text, 500);
  if (!clean || clean.length < 10) return ctx.reply('❌ La sugerencia debe tener al menos 10 caracteres.\nUso: `/sugerencia <tu idea>`');
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.suggestionChannelId) return ctx.reply('❌ El servidor no tiene canal de sugerencias configurado.\nUn admin debe usar `/setsuggestions #canal`.');

  const channel = await ctx.guild.channels.fetch(config.suggestionChannelId).catch(() => null);
  if (!channel) return ctx.reply('❌ No pude encontrar el canal de sugerencias.');

  const entry = await db.getUser(ctx.userId);
  const embed = new EmbedBuilder()
    .setTitle('💡 Nueva sugerencia')
    .setDescription(clean)
    .setColor(0x5865F2)
    .addFields(
      { name: '👤 Autor',      value: `<@${ctx.userId}> (${ctx.username})`, inline: true },
      { name: '🎮 Roblox',     value: entry ? `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)` : '_No vinculado_', inline: true },
    )
    .setFooter({ text: `ID: ${ctx.userId}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sug_up').setLabel('👍 0').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sug_down').setLabel('👎 0').setStyle(ButtonStyle.Danger),
  );

  const suggMsg = await channel.send({ embeds: [embed], components: [row] });
  ctx.reply({ content: `✅ Sugerencia enviada a <#${config.suggestionChannelId}>!`, ephemeral: true });

  // Votación durante 24h
  const votes = { up: new Set(), down: new Set() };
  const collector = suggMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 86400000 });
  collector.on('collect', async (i) => {
    if (i.customId === 'sug_up') {
      votes.down.delete(i.user.id);
      if (votes.up.has(i.user.id)) votes.up.delete(i.user.id);
      else votes.up.add(i.user.id);
    } else {
      votes.up.delete(i.user.id);
      if (votes.down.has(i.user.id)) votes.down.delete(i.user.id);
      else votes.down.add(i.user.id);
    }
    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sug_up').setLabel(`👍 ${votes.up.size}`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sug_down').setLabel(`👎 ${votes.down.size}`).setStyle(ButtonStyle.Danger),
    );
    await i.update({ components: [newRow] });
  });
  collector.on('end', () => suggMsg.edit({ components: [] }).catch(() => {}));
}

async function cmdSetSuggestions(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.suggestionChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de sugerencias: <#${channelId}>`);
}

// ════════════════════════════════════════════════════════════
//  PREMIUM
// ════════════════════════════════════════════════════════════

async function cmdPremiumStatus(ctx) {
  const [premium, active] = await Promise.all([db.getPremium(ctx.userId), isPremium(ctx.userId)]);
  const embed = new EmbedBuilder();
  if (active) {
    const exp = premium?.expiresAt ? `Expira: ${new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` : 'Permanente ∞';
    embed.setTitle('⭐ Premium activo').setColor(0xFFD700)
      .setDescription(`\`\`\`\n╔══════════════════╗\n║  ⭐ PREMIUM ⭐   ║\n╚══════════════════╝\`\`\`\n**${exp}**\n\n🔔 Alertas ilimitadas · 🎨 /flex · ⚔️ /comparar · 📜 /historial · ⚙️ /syncall · ⏩ Cooldowns x0.5`);
  } else {
    embed.setTitle('⭐ Plan Premium').setColor(0x99AAB5)
      .setDescription(
        `\`\`\`\n╔══════════════════╗\n║   PREMIUM PLAN   ║\n╚══════════════════╝\`\`\`\n` +
        `> 🔔 Alertas **ilimitadas** (gratis = 2)\n> 🎨 \`/flex\` — Tarjeta de perfil exclusiva\n> ⚔️ \`/comparar\` — Comparar dos cuentas\n> 📜 \`/historial\` — Ver tus juegos recientes\n> ⚙️ \`/syncall\` — Sincronizar todos los roles\n> ⭐ Rol Premium en el servidor\n> ⏩ Cooldowns reducidos a la mitad\n\n` +
        `**[☕ Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})**\n\nPon tu Discord ID en el mensaje de donación:\n\`\`\`${ctx.userId}\`\`\``
      );
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
  if (!e1) return ctx.reply(`❌ **${targetUser1.username}** sin cuenta.`);
  if (!e2) return ctx.reply(`❌ **${targetUser2.username}** sin cuenta.`);
  const [p1, fr1, fo1, g1, p2, fr2, fo2, g2, av1] = await Promise.all([
    roblox.getProfile(e1.robloxId), roblox.getFriendCount(e1.robloxId), roblox.getFollowerCount(e1.robloxId), roblox.getGroups(e1.robloxId),
    roblox.getProfile(e2.robloxId), roblox.getFriendCount(e2.robloxId), roblox.getFollowerCount(e2.robloxId), roblox.getGroups(e2.robloxId),
    roblox.getAvatar(e1.robloxId),
  ]);
  const gIds1  = new Set(g1.map(g => g.group.id));
  const common = g2.filter(g => gIds1.has(g.group.id));
  const age1   = Math.floor((Date.now() - new Date(p1.created)) / 86400000);
  const age2   = Math.floor((Date.now() - new Date(p2.created)) / 86400000);
  const w = (a, b) => a > b ? '🏆' : a < b ? '💀' : '🤝';
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`⚔️ ${p1.name}  vs  ${p2.name}`)
    .setColor(0x5865F2).setThumbnail(av1)
    .setDescription(`Grupos en común: **${common.length}**${common.length ? ` (${common.slice(0,3).map(g=>g.group.name).join(', ')})` : ''}`)
    .addFields(
      { name: `👤 ${p1.name}`,                  value: '\u200B', inline: true }, { name: '⚔️', value: '\u200B', inline: true }, { name: `👤 ${p2.name}`,                  value: '\u200B', inline: true },
      { name: `${w(fr1,fr2)} ${fr1}`,           value: '\u200B', inline: true }, { name: '👥 Amigos',     value: '\u200B', inline: true }, { name: `${w(fr2,fr1)} ${fr2}`,           value: '\u200B', inline: true },
      { name: `${w(fo1,fo2)} ${fo1}`,           value: '\u200B', inline: true }, { name: '👣 Seguidores', value: '\u200B', inline: true }, { name: `${w(fo2,fo1)} ${fo2}`,           value: '\u200B', inline: true },
      { name: `${w(g1.length,g2.length)} ${g1.length}`, value: '\u200B', inline: true }, { name: '🏰 Grupos', value: '\u200B', inline: true }, { name: `${w(g2.length,g1.length)} ${g2.length}`, value: '\u200B', inline: true },
      { name: `${w(age1,age2)} ${age1}d`,       value: '\u200B', inline: true }, { name: '📅 Días',       value: '\u200B', inline: true }, { name: `${w(age2,age1)} ${age2}d`,       value: '\u200B', inline: true },
    ).setFooter({ text: '🏆 = ganador · 🤝 = empate · ⭐ Función Premium' })] });
}

async function cmdFlex(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  const [profile, avatarFull, friends, followers, groups, badges, presence, eco] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatarFull(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getGroups(entry.robloxId), roblox.getBadges(entry.robloxId),
    roblox.getPresence(entry.robloxId), db.getEconomy(ctx.userId),
  ]);
  const { label } = roblox.formatPresence(presence?.userPresenceType ?? 0);
  const age  = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank = getRank(eco?.points ?? 0);
  const achList = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean);
  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName}`)
    .setDescription(`\`\`\`\n╔════════════════════════════╗\n║     TARJETA DE PERFIL      ║\n╚════════════════════════════╝\`\`\`\n*${profile.description?.slice(0, 120) || 'Sin descripción'}*`)
    .setColor(0xFFD700).setImage(avatarFull)
    .addFields(
      { name: '🎮 Estado',     value: label,                   inline: true },
      { name: '📅 Días',       value: `${age}`,                 inline: true },
      { name: rank.name,       value: `${eco?.points ?? 0} pts`,inline: true },
      { name: '👥 Amigos',     value: `**${friends}**`,         inline: true },
      { name: '👣 Seguidores', value: `**${followers}**`,       inline: true },
      { name: '🏰 Grupos',     value: `**${groups.length}**`,   inline: true },
      { name: '🏅 Insignias',  value: `**${badges.length}+**`,  inline: true },
      { name: '⭐ Premium',     value: 'Activo ✅',              inline: true },
      { name: '\u200B',        value: '\u200B',                  inline: true },
    )
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setFooter({ text: `⭐ Usuario Premium · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` })
    .setTimestamp();
  if (achList.length) embed.addFields({ name: '🏅 Logros', value: achList.join(' ') });
  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  ECONOMÍA
// ════════════════════════════════════════════════════════════

async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco    = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0, streak: 0 };
  const rank   = getRank(eco.points ?? 0);
  const bar    = rank.next ? `${progressBar(eco.points ?? 0, rank.next)} ${eco.points}/${rank.next}` : '💎 ¡Rango máximo!';
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Puntos de ${target.username ?? ctx.username}`)
    .setColor(rank.color)
    .addFields(
      { name: '💰 Puntos actuales', value: `**${eco.points ?? 0}**`,      inline: true },
      { name: '📈 Total ganado',    value: `**${eco.totalEarned ?? 0}**`,  inline: true },
      { name: '🔥 Racha actual',    value: `**${eco.streak ?? 0}** días`, inline: true },
      { name: rank.name,            value: bar },
    ).setFooter({ text: 'Gana puntos con !daily todos los días' })] });
}

async function cmdDaily(ctx) {
  const eco  = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0, streak: 0 };
  const now  = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs  = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return ctx.reply(`⏰ Ya reclamaste tu daily hoy.\nVuelve en **${hrs}h ${mins}m**.\n🔥 Racha actual: **${eco.streak ?? 0}** días.`);
  }
  const isConsecutive = last && (now - last) < 48 * 3600000;
  eco.streak = isConsecutive ? (eco.streak ?? 0) + 1 : 1;
  const premium    = await isPremium(ctx.userId);
  const streakBonus = 1 + Math.min(eco.streak, 10) * 0.1;
  const base       = 50 + Math.floor(Math.random() * 50);
  const reward     = Math.floor(base * (premium ? 2 : 1) * streakBonus);
  eco.points       = (eco.points ?? 0) + reward;
  eco.lastDaily    = now.toISOString();
  eco.totalEarned  = (eco.totalEarned ?? 0) + reward;
  await db.saveEconomy(ctx.userId, eco);
  const user    = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  const rank    = getRank(eco.points);
  const embed   = new EmbedBuilder().setTitle('🎁 ¡Daily reclamado!').setColor(0x57F287)
    .addFields(
      { name: '💰 Ganaste',  value: `**${reward} puntos**`,   inline: true },
      { name: '🔥 Racha',    value: `**${eco.streak}** días`, inline: true },
      { name: '💼 Total',    value: `**${eco.points}**`,       inline: true },
    )
    .setFooter({ text: `${rank.name} · Vuelve mañana para más puntos` });
  if (premium) embed.addFields({ name: '⭐ Bonus Premium', value: '¡x2 aplicado!' });
  if (newAchs.length) embed.addFields({ name: '🏅 Nuevos logros', value: newAchs.map(a => `**${a.name}** — ${a.desc}`).join('\n') });
  ctx.reply({ embeds: [embed] });
}

async function cmdLogros(ctx, targetUser) {
  const target  = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco     = await db.getEconomy(target.id) ?? {};
  const achieved = eco.achievements ?? [];
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Logros de ${target.username ?? ctx.username}`)
    .setColor(0xFFD700)
    .setDescription(ACHIEVEMENTS.map(a =>
      `${achieved.includes(a.id) ? '✅' : '🔒'} **${a.name}**\n› _${a.desc}_`
    ).join('\n\n'))
    .setFooter({ text: `${achieved.length}/${ACHIEVEMENTS.length} logros desbloqueados` })] });
}

async function cmdCoinFlip(ctx, betStr) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const bet = parseInt(betStr);
  if (!bet || bet < 10 || bet > (eco.points ?? 0))
    return ctx.reply(`❌ Apuesta entre **10** y **${eco.points ?? 0}** puntos.\nUso: \`!coinflip <cantidad>\``);
  const win     = Math.random() > 0.5;
  eco.points    = (eco.points ?? 0) + (win ? bet : -bet);
  eco.totalEarned = win ? (eco.totalEarned ?? 0) + bet : eco.totalEarned;
  await db.saveEconomy(ctx.userId, eco);
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(win ? '🎉 ¡Ganaste el coinflip!' : '💀 Perdiste el coinflip')
    .setColor(win ? 0x57F287 : 0xED4245)
    .setDescription(`Apostaste **${bet} puntos** y ${win ? `ganaste **${bet}** 🪙` : `perdiste **${bet}** 💸`}`)
    .addFields({ name: '💰 Saldo actual', value: `**${eco.points}** puntos` })] });
}

async function cmdPay(ctx, targetUser, amountStr) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario. Ej: `!pay @usuario 100`');
  if (targetUser.id === ctx.userId) return ctx.reply('❌ No puedes enviarte puntos a ti mismo.');
  const amount = parseInt(amountStr);
  const eco    = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (!amount || amount < 1 || amount > (eco.points ?? 0))
    return ctx.reply(`❌ Cantidad inválida. Tienes **${eco.points ?? 0}** puntos disponibles.`);
  const targetEco   = await db.getEconomy(targetUser.id) ?? { points: 0 };
  eco.points       -= amount;
  targetEco.points  = (targetEco.points ?? 0) + amount;
  await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
  ctx.reply(`✅ Enviaste **${amount} puntos** a **${targetUser.username}**.\nTu nuevo saldo: **${eco.points}** puntos.`);
}

async function cmdTop(ctx) {
  ctx.reply('📊 El leaderboard global estará disponible en una próxima actualización.\n¡Sigue acumulando puntos con `!daily` todos los días!');
}

// ════════════════════════════════════════════════════════════
//  JUEGOS DE ROBLOX
// ════════════════════════════════════════════════════════════

async function cmdJuego(ctx, query) {
  const clean = sanitizeText(query, 100);
  if (!clean) return ctx.reply('❌ Uso: `/juego <nombre del juego>`');
  const games = await roblox.searchGame(clean);
  if (!games.length) return ctx.reply('❌ No encontré juegos con ese nombre en Roblox.');
  const game = games[0];
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(`🎮 ${game.name}`)
    .setURL(`https://www.roblox.com/games/${game.placeId}`)
    .setColor(0x00B0F4)
    .addFields(
      { name: '👥 Jugando ahora', value: `${game.playerCount ?? 'N/A'}`, inline: true },
      { name: '❤️ Likes',         value: `${game.totalUpVotes ?? 'N/A'}`, inline: true },
      { name: '👎 Dislikes',      value: `${game.totalDownVotes ?? 'N/A'}`, inline: true },
    )
    .setFooter({ text: `ID del juego: ${game.placeId}` })] });
}

// ════════════════════════════════════════════════════════════
//  MODERACIÓN
// ════════════════════════════════════════════════════════════

async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario. Ej: `/whois @usuario`');
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply(`❌ **${targetUser.username}** no tiene cuenta de Roblox vinculada.`);
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 Whois: ${targetUser.username}`)
    .setColor(0x5865F2).setThumbnail(avatarUrl)
    .addFields(
      { name: '🎮 Cuenta de Roblox', value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 ID de Roblox',     value: `\`${entry.robloxId}\``,                                                               inline: true },
      { name: '⭐ Premium',           value: premium ? 'Sí ✅' : 'No ❌',                                                            inline: true },
      { name: '📅 Verificado el',    value: new Date(entry.verifiedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }), inline: true },
    )
    .setFooter({ text: 'Información de vinculación Discord ↔ Roblox' })] });
}

async function cmdSyncAll(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return ctx.reply('❌ El bot necesita el permiso **Gestionar Roles** en este servidor.');
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
//  ALERTAS Y CONFIGURACIÓN
// ════════════════════════════════════════════════════════════

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    const alerts = await db.getAlerts(ctx.userId) ?? [];
    if (!alerts.length) return ctx.reply('❌ No tienes alertas activas.\nActívalas tocando el botón 🔔 en `/estado @usuario`.');
    ctx.reply({ embeds: [new EmbedBuilder().setTitle('🔔 Tus alertas de presencia').setColor(0x5865F2)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)`).join('\n'))
      .setFooter({ text: 'Recibirás un ping en el canal o por DM cuando cambien su estado' })] });
    return;
  }
  if (sub === 'quitar') {
    if (!targetUser) return ctx.reply('❌ Menciona al usuario cuya alerta quieres eliminar.');
    const entry = await db.getUser(targetUser.id);
    if (!entry) return ctx.reply('❌ Ese usuario no tiene cuenta de Roblox vinculada.');
    const alerts = (await db.getAlerts(ctx.userId) ?? []).filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada correctamente.`);
  }
  ctx.reply('❌ Uso: `!alertas ver` — Ver tus alertas\n`!alertas quitar @usuario` — Eliminar una alerta');
}

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta de Roblox vinculada. Usa `/verificar` primero.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Tus roles de Discord han sido actualizados según tu cuenta de Roblox.');
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes ninguna cuenta de Roblox vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada. Puedes volver a verificarte cuando quieras.`);
}

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ Uso: `!permitir presencia` o `!permitir perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  ctx.reply(`✅ Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **visible** para otros.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ Uso: `!bloquear presencia` o `!bloquear perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  ctx.reply(`🔒 Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **privada**.`);
}

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado configurado: ${role}\nEste rol se asignará automáticamente cuando alguien use \`/confirmar\`.`);
}

async function cmdSetPremiumRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.premiumRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol Premium configurado: ${role}\nEste rol se asignará a usuarios con Premium activo.`);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación creada:\nGrupo Roblox \`${groupId}\` con rango ≥ **${minRank}** → ${role}`);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return ctx.reply('❌ No hay vinculaciones configuradas en este servidor.');
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación del grupo \`${groupId}\` eliminada.`);
}

async function cmdListRoles(ctx) {
  const config = await db.getGuildConf(ctx.guild.id);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Configuración de roles').setColor(0x5865F2)
    .addFields(
      { name: '✅ Rol de verificado',      value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_' },
      { name: '⭐ Rol Premium',             value: config?.premiumRoleId  ? `<@&${config.premiumRoleId}>`  : '_No configurado_' },
      { name: '🏰 Vinculaciones de grupos', value: config?.bindings?.length ? config.bindings.map(b => `• Grupo \`${b.groupId}\` rango ≥ ${b.minRank} → <@&${b.roleId}>`).join('\n') : '_Sin vinculaciones_' },
      { name: '🔤 Formato de apodo',       value: config?.nicknameFormat ? `\`${config.nicknameFormat}\`` : '_Desactivado_' },
      { name: '🌐 Idioma del bot',          value: config?.lang ? `\`${config.lang}\`` : '`es` (español)' },
    )
    .setFooter({ text: 'Usa los comandos de admin para modificar esta configuración' })] });
}

async function cmdSetWelcome(ctx, channelId, message) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage   = message || '¡Bienvenido {user}! Tu cuenta de Roblox **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Mensaje de bienvenida configurado en <#${channelId}>.\nVariables disponibles: \`{user}\` (menciona al usuario) y \`{roblox}\` (nombre de Roblox).`);
}

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas de presencia configurado: <#${channelId}>\nTodas las alertas se enviarán aquí con ping al usuario correspondiente.`);
}

async function cmdSetNickname(ctx, format) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageNicknames))
    return ctx.reply('❌ Necesitas **Gestionar Apodos**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.nicknameFormat = format ?? null;
  await db.saveGuildConf(ctx.guild.id, config);
  if (format) ctx.reply(`✅ Auto-nickname activado: \`${format}\`\nVariables: \`{roblox}\` = nombre Roblox, \`{display}\` = display name, \`{rank}\` = rango en el grupo principal.`);
  else ctx.reply('✅ Auto-nickname desactivado. Los apodos no se cambiarán automáticamente.');
}

async function cmdSetLang(ctx, lang) {
  if (!['es', 'en', 'pt'].includes(lang)) return ctx.reply('❌ Idiomas disponibles: `es` (Español), `en` (English), `pt` (Português)');
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.lang  = lang;
  await db.saveGuildConf(ctx.guild.id, config);
  const names = { es: '🇪🇸 Español', en: '🇺🇸 English', pt: '🇧🇷 Português' };
  ctx.reply(`✅ Idioma del bot cambiado a **${names[lang]}**.`);
}

// ════════════════════════════════════════════════════════════
//  AYUDA MEJORADA CON DESCRIPCIONES COMPLETAS
// ════════════════════════════════════════════════════════════

const HELP_CATEGORIES = {
  '🔐 Verificación': {
    description: 'Conecta tu cuenta de Roblox con Discord para acceder a todas las funciones del bot.',
    commands: [
      { name: '/verificar <usuario>', desc: 'Inicia el proceso de vinculación. Te da un código que debes pegar en tu descripción de Roblox.' },
      { name: '/confirmar', desc: 'Confirma la verificación después de poner el código. El bot comprueba tu descripción automáticamente.' },
      { name: '/actualizar', desc: 'Re-sincroniza tus roles de Discord con tu cuenta de Roblox. Útil si cambiaste de grupo o rango.' },
      { name: '/desvincular', desc: 'Desvincula tu cuenta. Podrás volver a verificarte con otra cuenta cuando quieras.' },
    ],
  },
  '👤 Perfil e información': {
    description: 'Consulta información detallada de cuentas de Roblox vinculadas o de cualquier usuario público.',
    commands: [
      { name: '/perfil [@usuario]', desc: 'Muestra el dashboard completo: avatar, estadísticas, grupos, logros, rango de economía y barra de progreso. Incluye botones interactivos.' },
      { name: '/avatar [@usuario]', desc: 'Muestra el avatar de Roblox en tamaño grande (headshot + cuerpo completo).' },
      { name: '/estado [@usuario]', desc: 'Muestra si el usuario está ⚫ desconectado, 🟢 conectado en web, 🎮 jugando o 🛠️ en Studio. Incluye el nombre del juego y última conexión.' },
      { name: '/grupos [@usuario]', desc: 'Lista todos los grupos de Roblox con el rol y rango del usuario en cada uno. Paginación con botones ◀ ▶.' },
      { name: '/amigos [@usuario]', desc: 'Muestra la lista de amigos de Roblox con links a sus perfiles. Paginación incluida.' },
      { name: '/insignias [@usuario]', desc: 'Muestra las últimas 10 insignias (badges) ganadas en juegos de Roblox.' },
      { name: '/historial-nombres [@usuario]', desc: 'Muestra los nombres de usuario anteriores que ha tenido la cuenta en Roblox.' },
      { name: '/buscar <usuario>', desc: 'Busca información pública de cualquier usuario de Roblox sin necesitar que esté vinculado al bot.' },
      { name: '!whoislox <ID>', desc: 'Búsqueda inversa: busca un usuario de Roblox por su ID numérico.' },
    ],
  },
  '⭐ Funciones Premium': {
    description: 'Funciones exclusivas para usuarios que apoyan el bot en Ko-fi. Usa `/premium` para ver cómo activarlo.',
    commands: [
      { name: '/premium', desc: 'Muestra tu estado Premium actual o cómo activarlo mediante donación en Ko-fi.' },
      { name: '/flex ⭐', desc: 'Genera una tarjeta de perfil visual exclusiva con todas tus estadísticas, logros y rango de economía.' },
      { name: '/comparar @u1 @u2 ⭐', desc: 'Compara dos cuentas de Roblox lado a lado con indicadores de ganador 🏆 en cada categoría.' },
      { name: '/historial ⭐', desc: 'Muestra los últimos 20 juegos que jugaste en Roblox. Se registra automáticamente cuando usas /estado. Incluye botón para borrar.' },
      { name: '/syncall ⭐', desc: 'Sincroniza los roles de Discord de TODOS los miembros verificados del servidor a la vez.' },
    ],
  },
  '💰 Economía y minijuegos': {
    description: 'Sistema de puntos con rangos, rachas y minijuegos. Acumula puntos reclamando tu daily cada día.',
    commands: [
      { name: '!daily', desc: 'Reclama tu recompensa diaria (50-100 puntos). Las rachas aumentan el multiplicador. Premium = x2 puntos.' },
      { name: '!puntos [@usuario]', desc: 'Muestra los puntos actuales, total acumulado, racha de días y barra de progreso hacia el siguiente rango.' },
      { name: '!logros [@usuario]', desc: 'Muestra todos los logros disponibles y cuáles has desbloqueado (verificación, rachas, puntos).' },
      { name: '!coinflip <cantidad>', desc: 'Apuesta puntos a cara o cruz. Ganas o pierdes la cantidad apostada. Mínimo 10 puntos.' },
      { name: '!pay @usuario <cantidad>', desc: 'Transfiere puntos a otro usuario del servidor.' },
    ],
  },
  '🎮 Roblox y búsquedas': {
    description: 'Busca juegos, items del catálogo y consulta el estado de los servidores de Roblox.',
    commands: [
      { name: '/juego <nombre>', desc: 'Busca un juego de Roblox y muestra cuántos jugadores hay en este momento, likes y dislikes.' },
      { name: '/catalogo <item>', desc: 'Busca items en el catálogo de Roblox (ropa, accesorios, etc.) con precio y creador.' },
      { name: '/murogrupo <ID>', desc: 'Muestra las últimas 5 publicaciones del muro público de un grupo de Roblox.' },
      { name: '/robloxstatus', desc: 'Consulta el estado actual de los servidores de Roblox. Muestra si hay caídas o mantenimientos activos.' },
    ],
  },
  '🎯 Social y comunidad': {
    description: 'Funciones para organizar sesiones de juego y enviar sugerencias al servidor.',
    commands: [
      { name: '!lfg <juego> [slots]', desc: 'Crea un grupo "Looking for Group" para un juego de Roblox. Otros usuarios pueden unirse con botones. El grupo se cierra automáticamente cuando está lleno o después de 30 minutos.' },
      { name: '/sugerencia <texto>', desc: 'Envía una sugerencia al canal de sugerencias del servidor. Otros usuarios pueden votar con 👍 o 👎.' },
    ],
  },
  '🔔 Alertas y privacidad': {
    description: 'Controla quién puede ver tu información y recibe notificaciones de presencia.',
    commands: [
      { name: '🔔 Botón en /estado', desc: 'Toca el botón "Activar alerta" en /estado para recibir un ping cada vez que ese usuario cambie su estado en Roblox.' },
      { name: '!alertas ver', desc: 'Muestra la lista de usuarios sobre los que tienes alertas activas.' },
      { name: '!alertas quitar @usuario', desc: 'Elimina la alerta de un usuario específico.' },
      { name: '!permitir presencia', desc: 'Permite que otros usuarios usen /estado para ver en qué juego estás. Por defecto está desactivado.' },
      { name: '!permitir perfil', desc: 'Permite que otros usuarios vean tu perfil. Por defecto está activado.' },
      { name: '!bloquear presencia', desc: 'Oculta tu presencia de Roblox para otros usuarios del bot.' },
      { name: '!bloquear perfil', desc: 'Oculta tu perfil de Roblox para otros usuarios del bot.' },
    ],
  },
  '🔍 Moderación': {
    description: 'Herramientas para administradores del servidor.',
    commands: [
      { name: '/whois @usuario', desc: 'Muestra qué cuenta de Roblox tiene un usuario de Discord, cuándo se verificó y si tiene Premium.' },
      { name: '!whoislox <ID>', desc: 'Búsqueda inversa: encuentra un usuario de Roblox por su ID numérico.' },
    ],
  },
  '⚙️ Administración del servidor': {
    description: 'Configura el bot para tu servidor. Requieren permisos de administrador.',
    commands: [
      { name: '/setverifiedrole @rol', desc: 'Define qué rol se asigna automáticamente cuando alguien se verifica.' },
      { name: '/setpremiumrole @rol', desc: 'Define qué rol se asigna a usuarios con Premium activo.' },
      { name: '/bindrole <grupoId> <rango> @rol', desc: 'Vincula un grupo de Roblox con un rol de Discord. Usuarios con ese grupo y rango mínimo reciben el rol automáticamente.' },
      { name: '/unbindrole <grupoId>', desc: 'Elimina la vinculación de un grupo de Roblox.' },
      { name: '/listroles', desc: 'Muestra toda la configuración de roles del servidor.' },
      { name: '/setwelcome #canal mensaje', desc: 'Configura un mensaje de bienvenida que se envía cuando alguien se verifica. Usa {user} y {roblox} como variables.' },
      { name: '/setalertchannel #canal', desc: 'Define el canal donde se enviarán todas las alertas de presencia del servidor.' },
      { name: '/setsuggestions #canal', desc: 'Define el canal donde se enviarán las sugerencias de los usuarios.' },
      { name: '/setnickname formato', desc: 'Activa auto-nickname al verificarse. Usa {roblox}, {display} y {rank} como variables.' },
      { name: '/setlang es|en|pt', desc: 'Cambia el idioma del bot para este servidor (Español, Inglés o Portugués).' },
    ],
  },
};

async function cmdAyuda(ctx) {
  const categoryKeys = Object.keys(HELP_CATEGORIES);

  const makeOverviewEmbed = () => new EmbedBuilder()
    .setTitle('📋 Ayuda — Bot Roblox v10.0')
    .setColor(0x5865F2)
    .setDescription('Selecciona una categoría del menú de abajo para ver los comandos y sus descripciones.\n\nTodos los comandos funcionan con `/` (slash), `!` o `?`.')
    .addFields(
      ...categoryKeys.map(k => ({
        name: k,
        value: HELP_CATEGORIES[k].description,
        inline: false,
      }))
    )
    .setFooter({ text: `⭐ = requiere Premium · Ko-fi: ${process.env.KOFI_PAGE ?? 'configura KOFI_PAGE'} · v10.0` });

  const makeCategoryEmbed = (key) => {
    const cat = HELP_CATEGORIES[key];
    return new EmbedBuilder()
      .setTitle(key)
      .setColor(0x5865F2)
      .setDescription(cat.description)
      .addFields(
        ...cat.commands.map(c => ({
          name: c.name,
          value: c.desc,
          inline: false,
        }))
      )
      .setFooter({ text: 'Usa el menú de abajo para cambiar de categoría · Bot Roblox v10' });
  };

  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('📂 Selecciona una categoría...')
      .addOptions([
        { label: '🏠 Vista general', value: '__overview__', description: 'Ver resumen de todas las categorías' },
        ...categoryKeys.map(k => ({
          label: k.slice(0, 25),
          value: k,
          description: HELP_CATEGORIES[k].description.slice(0, 50),
        })),
      ]),
  );

  const msg = await ctx.replyAndFetch({ embeds: [makeOverviewEmbed()], components: [select] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando puede navegar.', ephemeral: true });
    const selected = i.values[0];
    const embed    = selected === '__overview__' ? makeOverviewEmbed() : makeCategoryEmbed(selected);
    await i.update({ embeds: [embed], components: [select] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdAmigos, cmdInsignias, cmdHistorialNombres, cmdBuscar, cmdWhoisRoblox,
  cmdComparar, cmdFlex, cmdHistorial,
  cmdCatalogo, cmdMuroGrupo, cmdRobloxStatus,
  cmdJuego, cmdLFG, cmdSugerencia, cmdSetSuggestions,
  cmdPuntos, cmdDaily, cmdLogros, cmdCoinFlip, cmdPay, cmdTop,
  cmdWhois, cmdSyncAll,
  cmdAlertas, cmdSetWelcome, cmdSetAlertChannel, cmdSetNickname, cmdSetLang,
  cmdActualizar, cmdDesvincular, cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdPremiumStatus, cmdActivarPremium,
  cmdAyuda, startPresenceMonitor, onMemberJoin, onGuildAdd,
  cooldowns,
};
