// ============================================================
//  commands.js  —  v9.0
//  + Caché LRU, cooldowns, multi-idioma, auto-nickname,
//    on-join sync, leaderboard, streaks, minijuegos,
//    logros, prefix personalizable, helpbot interactivo,
//    captcha, barra de progreso, guía de bienvenida
// ============================================================

const {
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ComponentType,
} = require('discord.js');

const { cooldowns, profileCache, avatarCache, groupCache, presenceCache, friendCache, badgeCache, sanitizeUsername, sanitizeText } = require('./security.js');
const { t } = require('./i18n.js');

// ── Database ──────────────────────────────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
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
  getOutfit: async (id) => {
    const data = await robloxFetch(`https://avatar.roblox.com/v1/users/${id}/currently-wearing`);
    return data?.assetIds ?? [];
  },
  searchGame: async (q) => {
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=5`);
    return d?.games ?? [];
  },
  isPremiumRoblox: async (id) => {
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

// Barra de progreso visual con emojis
function progressBar(current, max, size = 10) {
  const filled = Math.round((current / max) * size);
  const empty  = size - filled;
  return '🟩'.repeat(Math.max(0, filled)) + '⬛'.repeat(Math.max(0, empty));
}

// Sistema de rangos por puntos
function getRank(points) {
  if (points >= 10000) return { name: '💎 Diamante',  color: 0x00FFFF, next: null,  needed: null };
  if (points >= 5000)  return { name: '🏆 Platino',   color: 0xE5E4E2, next: 10000, needed: 10000 - points };
  if (points >= 2000)  return { name: '🥇 Oro',       color: 0xFFD700, next: 5000,  needed: 5000  - points };
  if (points >= 500)   return { name: '🥈 Plata',     color: 0xC0C0C0, next: 2000,  needed: 2000  - points };
  return                      { name: '🥉 Bronce',    color: 0xCD7F32, next: 500,   needed: 500   - points };
}

// Comprobar y otorgar logros
const ACHIEVEMENTS = [
  { id: 'first_verify',  name: '🎖️ Primer Paso',        desc: 'Verificar tu cuenta por primera vez',    condition: (eco, user) => !!user },
  { id: 'streak_7',      name: '🔥 Racha de 7 días',    desc: 'Usar !daily 7 días seguidos',             condition: (eco) => (eco.streak ?? 0) >= 7 },
  { id: 'streak_30',     name: '🌟 Racha de 30 días',   desc: 'Usar !daily 30 días seguidos',            condition: (eco) => (eco.streak ?? 0) >= 30 },
  { id: 'points_1000',   name: '💰 Millonario (1k)',    desc: 'Acumular 1000 puntos',                    condition: (eco) => (eco.totalEarned ?? 0) >= 1000 },
  { id: 'points_5000',   name: '💎 Gran Fortuna (5k)',  desc: 'Acumular 5000 puntos en total',           condition: (eco) => (eco.totalEarned ?? 0) >= 5000 },
];

async function checkAchievements(discordId, eco, user) {
  const achieved = eco.achievements ?? [];
  const newOnes  = [];
  for (const ach of ACHIEVEMENTS) {
    if (!achieved.includes(ach.id) && ach.condition(eco, user)) {
      achieved.push(ach.id);
      newOnes.push(ach);
    }
  }
  if (newOnes.length) {
    eco.achievements = achieved;
    await db.saveEconomy(discordId, eco);
  }
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
    new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(i === 0),
    new ButtonBuilder().setCustomId('page').setLabel(`${i + 1}/${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(i === pages.length - 1),
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

function premiumEmbed(ctx, lang) {
  const embed = new EmbedBuilder().setTitle('⭐ Función exclusiva Premium').setColor(0xFFD700)
    .setDescription(
      '```\n╔══════════════════════════╗\n║   PREMIUM MEMBERSHIP     ║\n╚══════════════════════════╝```\n' +
      '**Funciones desbloqueadas con Premium:**\n' +
      '> 🔔 Alertas ilimitadas\n> 🎨 `/flex`\n> ⚔️ `/comparar`\n> 📜 `/historial`\n> ⚙️ `/syncall`\n> ⭐ Bypass de cooldowns (x0.5)\n\n' +
      `**[☕ Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})** — Pon tu ID: \`${ctx.userId}\``
    ).setTimestamp();
  ctx.reply({ embeds: [embed] });
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

  // Auto-nickname
  if (config.nicknameFormat) {
    const profile = await roblox.getProfile(robloxId);
    if (profile) {
      const groups = await roblox.getGroups(robloxId);
      const primaryGroup = groups[0];
      const rank = primaryGroup ? primaryGroup.role.name : '';
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
            let gameName = null;
            if (curr === 2 && presence.universeId) {
              gameName = await roblox.getGameName(presence.universeId);
              if (gameName) embed.addFields({ name: '🕹️ Jugando', value: `[${gameName}](https://www.roblox.com/games/${presence.rootPlaceId})` });
            }
            if (presence.lastOnline) embed.addFields({ name: '🕐 Última vez', value: new Date(presence.lastOnline).toLocaleString('es-ES') });
            const config = await db.getGuildConf(alert.guildId);
            const channelId = config?.alertChannelId ?? alert.channelId;
            try {
              const channel = await client.channels.fetch(channelId);
              await channel.send({ content: `<@${discordId}>`, embeds: [embed] });
            } catch {
              try {
                const user = await client.users.fetch(discordId);
                await user.send({ embeds: [embed] });
              } catch { console.error('No pude notificar a', discordId); }
            }
          }
          presenceCacheMonitor[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) { console.error('Monitor error:', e.message); }
  }, 60000);
}

// ── Evento on-join sync ───────────────────────────────────────
async function onMemberJoin(member) {
  const entry = await db.getUser(member.id);
  if (!entry) return;
  await syncRoles(member.guild, member.id, entry.robloxId);
  console.log(`🔄 On-join sync para ${member.user.username}`);
}

// ── Guía de bienvenida al añadir el bot ───────────────────────
async function onGuildAdd(guild) {
  try {
    const channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages'));
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle('👋 ¡Hola! Soy el Bot de Roblox')
      .setColor(0x5865F2)
      .setDescription('Gracias por añadirme. Aquí está la guía de configuración rápida:')
      .addFields(
        { name: '1️⃣ Configurar rol de verificado',    value: '`/setverifiedrole @Rol`' },
        { name: '2️⃣ Canal de bienvenida (opcional)',  value: '`/setwelcome #canal Mensaje`' },
        { name: '3️⃣ Canal de alertas (opcional)',     value: '`/setalertchannel #canal`' },
        { name: '4️⃣ Vincular grupos Roblox → roles', value: '`/bindrole <grupoId> <rangoMin> @Rol`' },
        { name: '5️⃣ Idioma del bot',                 value: '`/setlang es|en|pt`' },
        { name: '6️⃣ Los usuarios se verifican con:', value: '`/verificar <usuario>`' },
        { name: '📋 Ver todos los comandos',           value: '`/ayuda`' },
      )
      .setFooter({ text: 'Usa /ayuda para ver todos los comandos disponibles' });
    channel.send({ embeds: [embed] });
  } catch (e) { console.error('onGuildAdd error:', e.message); }
}

// ════════════════════════════════════════════════════════════
//  VERIFICACIÓN
// ════════════════════════════════════════════════════════════

async function cmdVerificar(ctx, robloxUsername) {
  const lang = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(robloxUsername);
  if (!clean) return ctx.reply('❌ Nombre de usuario inválido.');
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply(t(lang, 'verify_already', existing.robloxUsername));
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply(t(lang, 'verify_not_found'));
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  const embed = new EmbedBuilder()
    .setTitle(t(lang, 'verify_title')).setColor(0xFFAA00)
    .setDescription(
      `${t(lang, 'verify_step1')}\n${t(lang, 'verify_step2')}\n\`\`\`${code}\`\`\`\n${t(lang, 'verify_step3')}\n\n${t(lang, 'verify_time')}`
    )
    .addFields(
      { name: '👤 Usuario detectado', value: `**${robloxUser.name}**`, inline: true },
      { name: '🆔 ID',               value: `\`${robloxUser.id}\``,  inline: true },
    )
    .setFooter({ text: 'El código solo verifica que eres el dueño' });
  ctx.reply({ embeds: [embed] });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply(t(lang, 'confirm_no_pending'));
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile) return ctx.reply(t(lang, 'confirm_no_profile'));
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply(t(lang, 'confirm_code_fail', pending.code, pending.robloxUsername));
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
  });
  // Logro primer paso
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const user = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);
  const config = await db.getGuildConf(ctx.guild.id);
  if (config?.welcomeChannelId) {
    const ch = await ctx.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (ch) {
      const msg = (config.welcomeMessage || '¡Bienvenido {user}! Tu cuenta **{roblox}** fue verificada. 🎉')
        .replace('{user}', `<@${ctx.userId}>`).replace('{roblox}', pending.robloxUsername);
      ch.send(msg).catch(() => {});
    }
  }
  const avatarUrl = await roblox.getAvatar(pending.robloxId);
  const embed = new EmbedBuilder().setTitle('✅ ¡Verificación exitosa!').setColor(0x57F287)
    .setThumbnail(avatarUrl)
    .setDescription(t(lang, 'confirm_success', pending.robloxUsername))
    .addFields(
      { name: '👁️ Perfil',   value: 'Visible ✅', inline: true },
      { name: '🎮 Presencia', value: 'Privada 🔒', inline: true },
    )
    .setFooter({ text: 'Puedes borrar el código de tu descripción' });
  if (newAchs.length) embed.addFields({ name: '🏅 Logro desbloqueado', value: newAchs.map(a => `**${a.name}**`).join(', ') });
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
    roblox.isPremiumRoblox(entry.robloxId), isPremium(target.id),
    db.getEconomy(target.id) ?? { points: 0 },
  ]);

  const age      = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank     = getRank(eco?.points ?? 0);
  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_Sin grupos_';
  const achList  = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean).join(' ');

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(hasGold ? 0xFFD700 : rank.color)
    .setThumbnail(avatarUrl)
    .setDescription(
      (profile.description?.slice(0, 150) || '*Sin descripción*') +
      (hasPremiumRoblox ? '\n💎 **Roblox Premium**' : '')
    )
    .addFields(
      { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '\u200B' },
      { name: '🆔 ID',              value: `\`${entry.robloxId}\``,   inline: true },
      { name: '📅 Días en Roblox',  value: `${age}`,                   inline: true },
      { name: rank.name,            value: `${eco?.points ?? 0} pts`,  inline: true },
      { name: '👥 Amigos',          value: `**${friends}**`,           inline: true },
      { name: '👣 Seguidores',      value: `**${followers}**`,         inline: true },
      { name: '➡️ Siguiendo',       value: `**${following}**`,         inline: true },
      { name: '🏰 Grupos',          value: `**${groups.length}**`,     inline: true },
      { name: '🏅 Insignias',       value: `**${badges.length}+**`,    inline: true },
      { name: '\u200B',             value: '\u200B',                    inline: true },
    );

  if (rank.next) {
    const bar = progressBar(eco?.points ?? 0, rank.next);
    embed.addFields({ name: `Progreso hacia el siguiente rango`, value: `${bar} ${eco?.points ?? 0}/${rank.next}` });
  }
  if (achList) embed.addFields({ name: '🏅 Logros', value: achList });
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
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
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
  // Forzar bypass de caché para presencia real
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
    new ButtonBuilder().setCustomId(`setalert_${entry.robloxId}_${entry.robloxUsername}_${target.id}`).setLabel('🔔 Activar alerta').setStyle(ButtonStyle.Primary),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    const parts = i.customId.split('_');
    const wId = parts[1], wName = parts[2];
    const userAlerts = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    if (!userPremium && userAlerts.length >= 2)
      return i.reply({ content: '❌ Límite gratuito: 2 alertas. ⭐ Premium = ilimitadas.', ephemeral: true });
    if (!userAlerts.find(a => String(a.watchedRobloxId) === String(wId))) {
      userAlerts.push({ watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId });
      await db.saveAlerts(ctx.userId, userAlerts);
      const alertUsers = await redisGet('alert_users') ?? [];
      if (!alertUsers.includes(ctx.userId)) { alertUsers.push(ctx.userId); await redisSet('alert_users', alertUsers); }
    }
    await i.reply({ content: `✅ Alerta activada para **${wName}**. Te haré ping cuando cambie su estado.`, ephemeral: true });
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
  for (let i = 0; i < groups.length; i += 5) {
    pages.push(new EmbedBuilder().setTitle(`🏰 Grupos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(groups.slice(i, i + 5).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› ${g.role.name} · Rango \`${g.role.rank}\``
      ).join('\n\n'))
      .setFooter({ text: `${groups.length} grupos` }));
  }
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
  for (let i = 0; i < friends.length; i += 10) {
    pages.push(new EmbedBuilder().setTitle(`👥 Amigos de ${entry.robloxUsername}`).setColor(0x5865F2)
      .setDescription(friends.slice(i, i + 10).map(f => {
        const name = f.name || `ID:${f.id}`;
        const displayName = f.displayName || name;
        return `• [${displayName}](https://www.roblox.com/users/${f.id}/profile)${displayName !== name ? ` (@${name})` : ''}`;
      }).join('\n'))
      .setFooter({ text: `${friends.length} amigos` }));
  }
  await paginate(ctx, pages);
}

async function cmdInsignias(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply(`❌ Sin cuenta vinculada.`);
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply('🔒 Perfil privado.');
  const badges = await roblox.getBadges(entry.robloxId);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Insignias de ${entry.robloxUsername}`)
    .setColor(0xFEE75C)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n') : '_Sin insignias_')
    .setFooter({ text: 'Últimas 10' })] });
}

async function cmdHistorialNombres(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  const history = await roblox.getNameHistory(entry.robloxId);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`📜 Historial de nombres de ${entry.robloxUsername}`)
    .setColor(0x5865F2)
    .setDescription(history.length ? history.map((h, i) => `**${i + 1}.** ${h.name}`).join('\n') : '_Sin historial de nombres_')] });
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
      { name: '🆔 ID', value: `\`${u.id}\``, inline: true },
      { name: '📅 Días', value: `${age}`, inline: true },
      { name: '👥 Amigos', value: `${fr}`, inline: true },
      { name: '👣 Seguidores', value: `${fo}`, inline: true },
      { name: '➡️ Siguiendo', value: `${fg}`, inline: true },
      { name: '🏰 Grupos', value: `${gr.length}`, inline: true },
      { name: '📝 Descripción', value: p.description?.slice(0, 300) || '_Sin descripción_' },
    ).setFooter({ text: 'Búsqueda pública' })] });
}

// ════════════════════════════════════════════════════════════
//  HISTORIAL DE JUEGOS (línea ~480)
// ════════════════════════════════════════════════════════════

async function cmdHistorial(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No tienes cuenta vinculada.');
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return ctx.reply('📜 Sin historial aún. Se registra automáticamente cuando usas `/estado` mientras juegas.');
  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de ${entry.robloxUsername}`).setColor(0x5865F2)
    .setDescription(history.map((h, i) => {
      const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
    }).join('\n\n'))
    .setFooter({ text: `${history.length}/20 juegos registrados` }).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('clear_history').setLabel('🗑️ Borrar historial').setStyle(ButtonStyle.Danger),
  );
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo tú puedes hacer esto.', ephemeral: true });
    await db.deleteHistory(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle('🗑️ Historial borrado').setColor(0xED4245).setDescription('Tu historial fue eliminado.')], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ════════════════════════════════════════════════════════════
//  PREMIUM
// ════════════════════════════════════════════════════════════

async function cmdPremiumStatus(ctx) {
  const [premium, active] = await Promise.all([db.getPremium(ctx.userId), isPremium(ctx.userId)]);
  const embed = new EmbedBuilder();
  if (active) {
    const exp = premium.expiresAt
      ? `**Expira:** ${new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}`
      : '**Tipo:** Permanente ∞';
    embed.setTitle('⭐ Premium activo').setColor(0xFFD700)
      .setDescription(`\`\`\`\n╔══════════════════╗\n║  ⭐ PREMIUM ⭐   ║\n╚══════════════════╝\`\`\`\n${exp}\n\n🔔 Alertas ilimitadas · 🎨 /flex · ⚔️ /comparar · 📜 /historial · ⚙️ /syncall`);
  } else {
    embed.setTitle('⭐ Plan Premium').setColor(0x99AAB5)
      .setDescription(
        `\`\`\`\n╔══════════════════╗\n║   PREMIUM PLAN   ║\n╚══════════════════╝\`\`\`\n` +
        `> 🔔 Alertas ilimitadas (gratis = 2)\n> 🎨 \`/flex\` — Tarjeta exclusiva\n> ⚔️ \`/comparar\`\n> 📜 \`/historial\`\n> ⚙️ \`/syncall\`\n> ⭐ Rol Premium\n> ⏩ Cooldowns reducidos\n\n` +
        `**[☕ Ko-fi](https://ko-fi.com/${process.env.KOFI_PAGE ?? 'tu_pagina'})**\n\nPon tu ID en el mensaje:\n\`\`\`${ctx.userId}\`\`\``
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
  const gIds1 = new Set(g1.map(g => g.group.id));
  const common = g2.filter(g => gIds1.has(g.group.id));
  const age1 = Math.floor((Date.now() - new Date(p1.created)) / 86400000);
  const age2 = Math.floor((Date.now() - new Date(p2.created)) / 86400000);
  const w = (a, b) => a > b ? '🏆' : a < b ? '💀' : '🤝';
  const embed = new EmbedBuilder().setTitle(`⚔️ ${p1.name}  vs  ${p2.name}`)
    .setColor(0x5865F2).setThumbnail(av1)
    .setDescription(`Grupos en común: **${common.length}**${common.length ? ` (${common.slice(0,3).map(g=>g.group.name).join(', ')})` : ''}`)
    .addFields(
      { name: `👤 ${p1.name}`, value: '\u200B', inline: true }, { name: '⚔️', value: '\u200B', inline: true }, { name: `👤 ${p2.name}`, value: '\u200B', inline: true },
      { name: `${w(fr1,fr2)} ${fr1}`, value: '\u200B', inline: true }, { name: '👥 Amigos', value: '\u200B', inline: true }, { name: `${w(fr2,fr1)} ${fr2}`, value: '\u200B', inline: true },
      { name: `${w(fo1,fo2)} ${fo1}`, value: '\u200B', inline: true }, { name: '👣 Seguidores', value: '\u200B', inline: true }, { name: `${w(fo2,fo1)} ${fo2}`, value: '\u200B', inline: true },
      { name: `${w(g1.length,g2.length)} ${g1.length}`, value: '\u200B', inline: true }, { name: '🏰 Grupos', value: '\u200B', inline: true }, { name: `${w(g2.length,g1.length)} ${g2.length}`, value: '\u200B', inline: true },
      { name: `${w(age1,age2)} ${age1}d`, value: '\u200B', inline: true }, { name: '📅 Antigüedad', value: '\u200B', inline: true }, { name: `${w(age2,age1)} ${age2}d`, value: '\u200B', inline: true },
    ).setFooter({ text: '🏆 = ganador · 🤝 = empate · ⭐ Premium' });
  ctx.reply({ embeds: [embed] });
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
  const age = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank = getRank(eco?.points ?? 0);
  const achList = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean);
  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName}`)
    .setDescription(`\`\`\`\n╔════════════════════════════╗\n║     TARJETA DE PERFIL      ║\n╚════════════════════════════╝\`\`\`\n*${profile.description?.slice(0, 120) || 'Sin descripción'}*`)
    .setColor(0xFFD700).setImage(avatarFull)
    .addFields(
      { name: '🎮 Estado',       value: label,                              inline: true },
      { name: '📅 Días',         value: `${age}`,                           inline: true },
      { name: rank.name,         value: `${eco?.points ?? 0} pts`,          inline: true },
      { name: '👥 Amigos',       value: `**${friends}**`,                   inline: true },
      { name: '👣 Seguidores',   value: `**${followers}**`,                 inline: true },
      { name: '🏰 Grupos',       value: `**${groups.length}**`,             inline: true },
      { name: '🏅 Insignias',    value: `**${badges.length}+**`,            inline: true },
      { name: '⭐ Premium',       value: 'Activo ✅',                        inline: true },
      { name: '\u200B',          value: '\u200B',                            inline: true },
    )
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setFooter({ text: `⭐ Usuario Premium · ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}` })
    .setTimestamp();
  if (achList.length) embed.addFields({ name: '🏅 Logros', value: achList.join(' ') });
  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  ECONOMÍA + MINIJUEGOS + LOGROS
// ════════════════════════════════════════════════════════════

async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0 };
  const rank = getRank(eco.points ?? 0);
  const bar  = rank.next ? `${progressBar(eco.points ?? 0, rank.next)} ${eco.points}/${rank.next}` : '💎 ¡Rango máximo!';
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Puntos de ${target.username ?? ctx.username}`)
    .setColor(rank.color)
    .addFields(
      { name: '💰 Puntos',     value: `**${eco.points ?? 0}**`,       inline: true },
      { name: '📈 Total',      value: `**${eco.totalEarned ?? 0}**`,   inline: true },
      { name: '🔥 Racha',      value: `**${eco.streak ?? 0}** días`,   inline: true },
      { name: rank.name,       value: bar },
    )] });
}

async function cmdDaily(ctx) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0, streak: 0 };
  const now  = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;

  if (last && now - last < 86400000) {
    const next = new Date(last.getTime() + 86400000);
    const hrs  = Math.floor((next - now) / 3600000);
    const mins = Math.floor(((next - now) % 3600000) / 60000);
    return ctx.reply(`⏰ Vuelve en **${hrs}h ${mins}m**. Racha actual: 🔥 **${eco.streak ?? 0}** días.`);
  }

  // Calcular racha
  const yesterday = last ? new Date(last.getTime()) : null;
  const isConsecutive = yesterday && (now - yesterday) < 48 * 3600000;
  eco.streak = isConsecutive ? (eco.streak ?? 0) + 1 : 1;

  const premium = await isPremium(ctx.userId);
  const streakBonus = Math.min(eco.streak, 10); // máx x2 después de 10 días
  const base    = 50 + Math.floor(Math.random() * 50);
  const multiplier = (premium ? 2 : 1) * (1 + streakBonus * 0.1);
  const reward  = Math.floor(base * multiplier);

  eco.points      = (eco.points ?? 0) + reward;
  eco.lastDaily   = now.toISOString();
  eco.totalEarned = (eco.totalEarned ?? 0) + reward;
  await db.saveEconomy(ctx.userId, eco);

  // Verificar logros
  const user = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  const rank = getRank(eco.points);

  const embed = new EmbedBuilder().setTitle('🎁 ¡Daily reclamado!').setColor(0x57F287)
    .addFields(
      { name: '💰 Ganaste',   value: `**${reward} puntos**`, inline: true },
      { name: '🔥 Racha',     value: `**${eco.streak}** días`, inline: true },
      { name: '💼 Total',     value: `**${eco.points}**`,      inline: true },
    );
  if (premium) embed.addFields({ name: '⭐ Bonus Premium', value: 'x2 aplicado!' });
  if (newAchs.length) embed.addFields({ name: '🏅 Logros desbloqueados', value: newAchs.map(a => `**${a.name}** — ${a.desc}`).join('\n') });
  embed.setFooter({ text: `Rango: ${rank.name} · Vuelve mañana` });
  ctx.reply({ embeds: [embed] });
}

async function cmdLogros(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? {};
  const achieved = eco.achievements ?? [];
  const embed = new EmbedBuilder().setTitle(`🏅 Logros de ${target.username ?? ctx.username}`).setColor(0xFFD700)
    .setDescription(
      ACHIEVEMENTS.map(a => `${achieved.includes(a.id) ? '✅' : '🔒'} **${a.name}**\n› ${a.desc}`).join('\n\n')
    )
    .setFooter({ text: `${achieved.length}/${ACHIEVEMENTS.length} logros` });
  ctx.reply({ embeds: [embed] });
}

// Minijuego: Coin Flip
async function cmdCoinFlip(ctx, betStr) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const bet = parseInt(betStr);
  if (!bet || bet < 10 || bet > (eco.points ?? 0))
    return ctx.reply(`❌ Apuesta entre **10** y **${eco.points ?? 0}** puntos.\nUso: \`!coinflip <cantidad>\``);
  const win = Math.random() > 0.5;
  eco.points = (eco.points ?? 0) + (win ? bet : -bet);
  eco.totalEarned = win ? (eco.totalEarned ?? 0) + bet : eco.totalEarned;
  await db.saveEconomy(ctx.userId, eco);
  const embed = new EmbedBuilder()
    .setTitle(win ? '🎉 ¡Ganaste!' : '💀 Perdiste')
    .setColor(win ? 0x57F287 : 0xED4245)
    .setDescription(`Apostaste **${bet} puntos** → ${win ? `ganaste **${bet}** 🪙` : `perdiste **${bet}** 💸`}`)
    .addFields({ name: '💰 Saldo actual', value: `**${eco.points}** puntos` });
  ctx.reply({ embeds: [embed] });
}

// Transferir puntos
async function cmdPay(ctx, targetUser, amountStr) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario. Ej: `!pay @usuario 100`');
  if (targetUser.id === ctx.userId) return ctx.reply('❌ No puedes enviarte puntos a ti mismo.');
  const amount = parseInt(amountStr);
  const eco    = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (!amount || amount < 1 || amount > (eco.points ?? 0))
    return ctx.reply(`❌ Cantidad inválida. Tienes **${eco.points ?? 0}** puntos.`);
  const targetEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  eco.points     -= amount;
  targetEco.points = (targetEco.points ?? 0) + amount;
  await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
  ctx.reply(`✅ Enviaste **${amount} puntos** a **${targetUser.username}**. Tu saldo: **${eco.points}**`);
}

async function cmdTop(ctx) {
  ctx.reply('📊 El leaderboard global estará disponible próximamente.\n¡Sigue acumulando puntos con `!daily`!');
}

// ════════════════════════════════════════════════════════════
//  JUEGOS DE ROBLOX
// ════════════════════════════════════════════════════════════

async function cmdJuego(ctx, query) {
  const clean = sanitizeText(query, 100);
  if (!clean) return ctx.reply('❌ Uso: `/juego <nombre>`');
  const games = await roblox.searchGame(clean);
  if (!games.length) return ctx.reply('❌ No encontré juegos con ese nombre.');
  const game = games[0];
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🎮 ${game.name}`)
    .setURL(`https://www.roblox.com/games/${game.placeId}`).setColor(0x00B0F4)
    .addFields(
      { name: '👥 Jugando', value: `${game.playerCount ?? 'N/A'}`, inline: true },
      { name: '❤️ Likes',   value: `${game.totalUpVotes ?? 'N/A'}`, inline: true },
      { name: '👎 Dislikes',value: `${game.totalDownVotes ?? 'N/A'}`, inline: true },
    ).setFooter({ text: `ID: ${game.placeId}` })] });
}

// ════════════════════════════════════════════════════════════
//  MODERACIÓN
// ════════════════════════════════════════════════════════════

async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply('❌ Menciona a un usuario.');
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply(`❌ **${targetUser.username}** sin cuenta vinculada.`);
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 Whois: ${targetUser.username}`)
    .setColor(0x5865F2).setThumbnail(avatarUrl)
    .addFields(
      { name: '🎮 Roblox', value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 ID',     value: `\`${entry.robloxId}\``, inline: true },
      { name: '⭐ Premium',value: premium ? 'Sí ✅' : 'No', inline: true },
      { name: '📅 Verificado', value: new Date(entry.verifiedAt).toLocaleDateString('es-ES'), inline: true },
    )] });
}

async function cmdSyncAll(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return ctx.reply('❌ El bot necesita **Gestionar Roles**.');
  await ctx.reply('⏳ Sincronizando...');
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { await syncRoles(ctx.guild, id, entry.robloxId); count++; }
  }
  ctx.reply(`✅ Roles sincronizados para **${count}** miembros.`);
}

// ════════════════════════════════════════════════════════════
//  ALERTAS Y CONFIGURACIÓN
// ════════════════════════════════════════════════════════════

async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    const alerts = await db.getAlerts(ctx.userId) ?? [];
    if (!alerts.length) return ctx.reply('❌ Sin alertas. Actívalas desde el botón en `/estado`.');
    const embed = new EmbedBuilder().setTitle('🔔 Tus alertas').setColor(0x5865F2)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)`).join('\n'))
      .setFooter({ text: 'Recibirás ping cuando cambien su estado' });
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

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply('✅ Roles actualizados.');
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Cuenta **${entry.robloxUsername}** desvinculada.`);
}

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ `!permitir presencia` o `!permitir perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  ctx.reply(`✅ Tu **${tipo}** ahora es pública.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply('❌ `!bloquear presencia` o `!bloquear perfil`');
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  ctx.reply(`🔒 Tu **${tipo}** ahora es privada.`);
}

// Configuración de servidor
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
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Roles del servidor').setColor(0x5865F2)
    .addFields(
      { name: '✅ Verificado', value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_No configurado_' },
      { name: '⭐ Premium',    value: config?.premiumRoleId  ? `<@&${config.premiumRoleId}>`  : '_No configurado_' },
      { name: '🏰 Vinculaciones', value: config?.bindings?.length ? config.bindings.map(b => `• \`${b.groupId}\` rango ≥ ${b.minRank} → <@&${b.roleId}>`).join('\n') : '_Sin vinculaciones_' },
      { name: '🔤 Formato apodo', value: config?.nicknameFormat ?? '_No configurado_' },
      { name: '🌐 Idioma', value: config?.lang ?? 'es (español)' },
    )] });
}

async function cmdSetWelcome(ctx, channelId, message) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage = message || '¡Bienvenido {user}! Tu cuenta **{roblox}** fue verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Bienvenida en <#${channelId}>. Usa \`{user}\` y \`{roblox}\`.`);
}

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas: <#${channelId}>`);
}

async function cmdSetNickname(ctx, format) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageNicknames))
    return ctx.reply('❌ Necesitas **Gestionar Apodos**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.nicknameFormat = format || null;
  await db.saveGuildConf(ctx.guild.id, config);
  if (format) ctx.reply(`✅ Formato de apodo: \`${format}\`\nVariables: \`{roblox}\`, \`{display}\`, \`{rank}\``);
  else ctx.reply('✅ Auto-nickname desactivado.');
}

async function cmdSetLang(ctx, lang) {
  if (!['es', 'en', 'pt'].includes(lang)) return ctx.reply('❌ Idiomas disponibles: `es`, `en`, `pt`');
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply('❌ Necesitas **Administrar Servidor**.');
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.lang = lang;
  await db.saveGuildConf(ctx.guild.id, config);
  const names = { es: '🇪🇸 Español', en: '🇺🇸 English', pt: '🇧🇷 Português' };
  ctx.reply(`✅ Idioma del bot: **${names[lang]}**`);
}

// Ayuda interactiva con menú desplegable
async function cmdAyuda(ctx) {
  const categories = {
    '🔐 Verificación':   '`/verificar` `/confirmar` `/actualizar` `/desvincular`',
    '👤 Perfil':          '`/perfil` `/avatar` `/estado` `/grupos` `/amigos` `/insignias` `/buscar` `/historial-nombres`',
    '⭐ Premium':         '`/premium` · `/flex` ⭐ · `/comparar` ⭐ · `/historial` ⭐ · `/syncall` ⭐',
    '💰 Economía':        '`!daily` `!puntos` `!logros` `!coinflip <bet>` `!pay @u <pts>`',
    '🎮 Roblox':          '`/juego <nombre>`',
    '🔔 Alertas':         '`!alertas ver` `!alertas quitar @u` _(activa en `/estado`)_',
    '🔒 Privacidad':      '`!permitir presencia/perfil` · `!bloquear presencia/perfil`',
    '🔍 Moderación':      '`/whois @u`',
    '⚙️ Admin':           '`/setverifiedrole` `/setpremiumrole` `/bindrole` `/unbindrole` `/listroles` `/setwelcome` `/setalertchannel` `/setnickname` `/setlang`',
  };
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('help_menu').setPlaceholder('Selecciona una categoría...')
      .addOptions(Object.keys(categories).map(k => ({ label: k, value: k, description: categories[k].slice(0, 50) }))),
  );
  const embed = new EmbedBuilder().setTitle('📋 Ayuda — Bot Roblox v9.0').setColor(0x5865F2)
    .setDescription('Selecciona una categoría del menú de abajo.\nTodos los comandos funcionan con `/`, `!` o `?`.')
    .setFooter({ text: '⭐ = requiere Premium · Ko-fi: ' + (process.env.KOFI_PAGE ?? 'configura KOFI_PAGE') });
  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [select] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    const cat = i.values[0];
    const e = new EmbedBuilder().setTitle(cat).setColor(0x5865F2).setDescription(categories[cat]);
    await i.update({ embeds: [e], components: [select] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = {
  cmdVerificar, cmdConfirmar, cmdPerfil, cmdAvatar, cmdEstado,
  cmdGrupos, cmdAmigos, cmdInsignias, cmdHistorialNombres, cmdBuscar,
  cmdComparar, cmdFlex, cmdHistorial, cmdJuego,
  cmdPuntos, cmdDaily, cmdLogros, cmdCoinFlip, cmdPay, cmdTop,
  cmdWhois, cmdSyncAll,
  cmdAlertas, cmdSetWelcome, cmdSetAlertChannel, cmdSetNickname, cmdSetLang,
  cmdActualizar, cmdDesvincular, cmdPermitir, cmdBloquear,
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdPremiumStatus, cmdActivarPremium,
  cmdAyuda, startPresenceMonitor, onMemberJoin, onGuildAdd,
  cooldowns,
};
