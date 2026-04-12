// ============================================================
//  commands.js  —  v10.7 (MEJORAS MASIVAS)
//  + PayPal integrado
//  + GIFs anime en acciones
//  + 30+ colores en tienda
//  + 10 rangos y 20 insignias adicionales
//  + Perfil mejorado
//  + Comando /dms
//  + Ayuda con color #1900ff
// ============================================================

const {
  EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ComponentType,
  ChannelType,
} = require('discord.js');

const {
  cooldowns,
  profileCache, avatarCache, groupCache,
  presenceCache, friendCache, badgeCache,
  outfitCache, rapCache,
  sanitizeUsername, sanitizeText, normalizeString,
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
  getAlts:        (id)       => redisGet(`alts:${id}`),
  saveAlts:       (id, data) => redisSet(`alts:${id}`, data),
  getFlexBg:      (id)       => redisGet(`flexbg:${id}`),
  saveFlexBg:     (id, data) => redisSet(`flexbg:${id}`, data),
  getGameStats:   (id)       => redisGet(`gamestats:${id}`),
  saveGameStats:  (id, data) => redisSet(`gamestats:${id}`, data),
};

// ── Función helper para encarcelamiento ───────────────────────
async function isJailed(userId) {
  const jailed = await redisGet(`jailed:${userId}`);
  if (!jailed) return false;
  return new Date(jailed.until) > new Date();
}

// ── GIFs anime ───────────────────────────────────────────────
async function getAnimeGif(category) {
  try {
    const res = await fetch(`https://api.waifu.pics/sfw/${category}`);
    const data = await res.json();
    return data.url;
  } catch {
    return null;
  }
}

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
    const d = await robloxFetch(`https://games.roblox.com/v1/games/list?model.keyword=${encodeURIComponent(q)}&model.maxRows=10`);
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
      const res = await fetch('https://status.roblox.com/api/v2/summary.json', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  },
  formatPresence: (type) => ({
    0: { label: '⚫ Desconectado',           color: 0x99AAB5 },
    1: { label: '🟢 Conectado (web o app)',   color: 0x57F287 },
    2: { label: '🎮 Jugando en este momento', color: 0x00B0F4 },
    3: { label: '🛠️ En Roblox Studio',        color: 0xFEE75C },
  }[type] ?? { label: '❓ Desconocido', color: 0x99AAB5 }),
  getOutfit: async (id) => {
    const cached = outfitCache.get(id);
    if (cached) return cached;
    const d = await robloxFetch(`https://avatar.roblox.com/v1/users/${id}/outfits?limit=1`);
    const result = d?.data?.[0] ?? null;
    if (result) outfitCache.set(id, result);
    return result;
  },
  getRAP: async (id) => {
    const cached = rapCache.get(id);
    if (cached) return cached;
    try {
      const res = await fetch(`https://www.rolimons.com/api/player/${id}`);
      const data = await res.json();
      const result = { value: data?.rap ?? 0, limiteds: data?.limiteds ?? [] };
      rapCache.set(id, result);
      return result;
    } catch { return { value: 0, limiteds: [] }; }
  },
};

// ── Helpers ───────────────────────────────────────────────────
const pendingVerifications = {};
const presenceCacheMonitor = {};
const pendingCaptchas = new Set();

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
  if (!guildId) return 'es';
  try {
    const config = await db.getGuildConf(guildId);
    return config?.lang ?? 'es';
  } catch { return 'es'; }
}

function progressBar(current, max, size = 10) {
  const filled = Math.min(Math.round((current / max) * size), size);
  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

// ── Rangos (10 niveles) ──────────────────────────────────────
const RANKS = [
  { name: '🥉 Bronce',    min: 0,     color: 0xCD7F32, next: 500   },
  { name: '🥈 Plata',     min: 500,   color: 0xC0C0C0, next: 2000  },
  { name: '🥇 Oro',       min: 2000,  color: 0xFFD700, next: 5000  },
  { name: '🏆 Platino',   min: 5000,  color: 0xE5E4E2, next: 10000 },
  { name: '💎 Diamante',  min: 10000, color: 0x00FFFF, next: 20000 },
  { name: '🌟 Maestro',   min: 20000, color: 0x9B59B6, next: 35000 },
  { name: '🔮 Gran Maestro', min: 35000, color: 0x8E44AD, next: 50000 },
  { name: '👑 Élite',     min: 50000, color: 0xF1C40F, next: 75000 },
  { name: '🚀 Leyenda',   min: 75000, color: 0xE67E22, next: 100000 },
  { name: '⚡ Dios',      min: 100000, color: 0xFF00FF, next: null },
];

function getRank(points) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

// ── Insignias (logros) ───────────────────────────────────────
const ACHIEVEMENTS = [
  // Verificación
  { id: 'first_verify',  name: '🎖️ Primer Paso', desc: 'Verificar tu cuenta por primera vez' },
  // Rachas
  { id: 'streak_7',      name: '🔥 Racha de 7 días', desc: 'Usar !daily 7 días seguidos' },
  { id: 'streak_30',     name: '🌟 Racha de 30 días', desc: 'Usar !daily 30 días seguidos' },
  // Puntos totales
  { id: 'points_1000',   name: '💰 1000 puntos', desc: 'Acumular 1000 puntos en total' },
  { id: 'points_5000',   name: '💎 5000 puntos', desc: 'Acumular 5000 puntos en total' },
  { id: 'points_10000',  name: '🏦 10000 puntos', desc: 'Acumular 10000 puntos en total' },
  { id: 'points_50000',  name: '🚀 50000 puntos', desc: 'Acumular 50000 puntos en total' },
  // Trivia
  { id: 'trivia_10',     name: '🧠 Aprendiz', desc: 'Responder 10 preguntas de trivia correctamente' },
  { id: 'trivia_50',     name: '📚 Erudito', desc: 'Responder 50 preguntas de trivia correctamente' },
  { id: 'trivia_100',    name: '🏛️ Sabio', desc: 'Responder 100 preguntas de trivia correctamente' },
  // Robos
  { id: 'rob_5',         name: '🦹 Ladronzuelo', desc: 'Robar exitosamente 5 veces' },
  { id: 'rob_20',        name: '💰 Maestro del hurto', desc: 'Robar exitosamente 20 veces' },
  { id: 'rob_fail_10',   name: '🚔 Torpe', desc: 'Fallar 10 robos' },
  { id: 'rob_jail_5',    name: '🔒 Preso', desc: 'Ir a la cárcel 5 veces' },
  { id: 'bail_paid_3',   name: '💸 Fianza pagada', desc: 'Pagar fianza 3 veces' },
  // Dinero robado total
  { id: 'stolen_1000',   name: '🪙 Mil monedas robadas', desc: 'Robar un total de 1000 puntos' },
  { id: 'stolen_10000',  name: '💼 Botín mayor', desc: 'Robar un total de 10000 puntos' },
  // Diarias
  { id: 'daily_30',      name: '📅 Comprometido', desc: 'Reclamar 30 dailies en total' },
  // Tienda
  { id: 'shop_5',        name: '🛍️ Comprador', desc: 'Comprar 5 items en la tienda' },
  { id: 'color_collector', name: '🎨 Coleccionista', desc: 'Comprar 10 colores diferentes' },
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
    points_10000: () => (eco.totalEarned ?? 0) >= 10000,
    points_50000: () => (eco.totalEarned ?? 0) >= 50000,
    trivia_10:    () => (eco.triviaWins ?? 0) >= 10,
    trivia_50:    () => (eco.triviaWins ?? 0) >= 50,
    trivia_100:   () => (eco.triviaWins ?? 0) >= 100,
    rob_5:        () => (eco.successfulRobs ?? 0) >= 5,
    rob_20:       () => (eco.successfulRobs ?? 0) >= 20,
    rob_fail_10:  () => (eco.failedRobs ?? 0) >= 10,
    rob_jail_5:   () => (eco.timesJailed ?? 0) >= 5,
    bail_paid_3:  () => (eco.bailPaidCount ?? 0) >= 3,
    stolen_1000:  () => (eco.totalStolen ?? 0) >= 1000,
    stolen_10000: () => (eco.totalStolen ?? 0) >= 10000,
    daily_30:     () => (eco.dailyClaims ?? 0) >= 30,
    shop_5:       () => (eco.shopPurchases ?? 0) >= 5,
    color_collector: () => {
      const profile = user;
      const inventory = profile?.inventory ?? [];
      const colorItems = SHOP_ITEMS.filter(i => i.type === 'color').map(i => i.id);
      const ownedColors = inventory.filter(id => colorItems.includes(id));
      return ownedColors.length >= 10;
    }
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

  const stats = await db.getGameStats(discordId) ?? { games: {} };
  if (!stats.games[gameName]) stats.games[gameName] = { count: 0, lastPlayed: null };
  stats.games[gameName].count++;
  stats.games[gameName].lastPlayed = new Date().toISOString();
  await db.saveGameStats(discordId, stats);
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
      `Usa \`/buy\` para obtener Premium con PayPal.`
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

function getCurrentResetPeriodStart() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return todayUTC;
}

function filterAlertsByResetPeriod(alerts) {
  if (!alerts) return [];
  const periodStart = getCurrentResetPeriodStart().getTime();
  return alerts.filter(a => {
    const createdAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    return createdAt >= periodStart;
  });
}

// ── Monitor de presencia ──────────────────────────────────────
async function startPresenceMonitor(client) {
  console.log('🔔 Monitor de presencia iniciado');
  setInterval(async () => {
    try {
      const alertUsers = await redisGet('alert_users') ?? [];
      for (const discordId of alertUsers) {
        let alerts = await db.getAlerts(discordId) ?? [];
        const isUserPremium = await isPremium(discordId);
        if (!isUserPremium) {
          alerts = filterAlertsByResetPeriod(alerts);
        }
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
              try { 
                const userEntry = await db.getUser(discordId);
                if (userEntry?.allowDMs !== false) {
                  const user = await client.users.fetch(discordId);
                  await user.send({ embeds: [embed] });
                }
              } catch { console.error('No pude notificar a', discordId); }
            }
          }
          presenceCacheMonitor[alert.watchedRobloxId] = curr;
        }
      }
    } catch (e) { console.error('Monitor error:', e.message); }
  }, 60000);

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
  }, 3600000);
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
      .setTitle('👋 ¡Hola! Soy el Bot de Roblox v10.7')
      .setColor(0x1900ff)
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
      .setFooter({ text: 'Bot Roblox v10.7 · Usa /ayuda para ver todo' })] });
  } catch (e) { console.error('onGuildAdd:', e.message); }
}

// ════════════════════════════════════════════════════════════
//  VERIFICACIÓN (con captcha)
// ════════════════════════════════════════════════════════════

async function cmdCaptcha(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('captcha_verify').setLabel('✅ Soy humano').setStyle(ButtonStyle.Success),
  );
  const msg = await ctx.replyAndFetch({ embeds: [
    new EmbedBuilder().setTitle(t(lang, 'captcha_title')).setColor(0x1900ff).setDescription(t(lang, 'captcha_desc'))
  ], components: [row] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    pendingCaptchas.add(ctx.userId);
    await i.update({ embeds: [new EmbedBuilder().setTitle('✅ Verificación completada').setColor(0x57F287).setDescription(t(lang, 'captcha_success'))], components: [] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdVerificar(ctx, robloxUsername) {
  const lang  = await getGuildLang(ctx.guild?.id);
  if (!pendingCaptchas.has(ctx.userId)) {
    return ctx.reply({ content: '❌ Debes completar el captcha primero. Usa `/captcha`.', ephemeral: true });
  }
  pendingCaptchas.delete(ctx.userId);
  const clean = sanitizeUsername(robloxUsername);
  if (!clean) return ctx.reply({ content: '❌ Nombre de usuario inválido o demasiado corto.', ephemeral: true });
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply({ content: t(lang, 'verify_already', existing.robloxUsername), ephemeral: true });
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply({ content: t(lang, 'verify_not_found'), ephemeral: true });
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(t(lang, 'verify_title')).setColor(0x1900ff)
    .setDescription(`${t(lang, 'verify_step1')}\n${t(lang, 'verify_step2')}\n\`\`\`${code}\`\`\`\n${t(lang, 'verify_step3')}\n\n${t(lang, 'verify_time')}`)
    .addFields(
      { name: '👤 Usuario', value: `**${robloxUser.name}**`, inline: true },
      { name: '🆔 ID',      value: `\`${robloxUser.id}\``,  inline: true },
    )
    .setFooter({ text: 'El código solo verifica que eres el dueño de la cuenta' })], ephemeral: true });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const lang    = await getGuildLang(ctx.guild?.id);
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply({ content: t(lang, 'confirm_no_pending'), ephemeral: true });
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile)  return ctx.reply({ content: t(lang, 'confirm_no_profile'), ephemeral: true });
  if (!(profile.description ?? '').includes(pending.code))
    return ctx.reply({ content: t(lang, 'confirm_code_fail', pending.code, pending.robloxUsername), ephemeral: true });
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
    allowDMs: true, // por defecto permitir DMs
  });
  const eco    = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const user   = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

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
//  PERFIL / DASHBOARD (mejorado)
// ════════════════════════════════════════════════════════════

async function cmdPerfil(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });

  const [profile, avatarUrl, friends, followers, following, groups, badges] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatar(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getFollowingCount(entry.robloxId), roblox.getGroups(entry.robloxId),
    roblox.getBadges(entry.robloxId),
  ]);
  if (!profile) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });

  const [hasPremiumRoblox, hasGold, eco, premiumData] = await Promise.all([
    roblox.isPremiumRoblox(entry.robloxId), isPremium(target.id), db.getEconomy(target.id), db.getPremium(target.id),
  ]);

  const age       = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank      = getRank(eco?.points ?? 0);
  const topGroups = groups.slice(0, 3).map(g => `[${g.group.name}](https://www.roblox.com/groups/${g.group.id})`).join(' · ') || '_Sin grupos_';
  const achList   = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean).join(' ');
  const createdAt = new Date(profile.created).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

  // Color del perfil: el comprado por el usuario que ejecuta el comando, o el default #1900ff
  const userColor = entry.profileColor || 0x1900ff;

  const embed = new EmbedBuilder()
    .setTitle(`${hasGold ? '⭐ ' : ''}${profile.displayName}  ·  @${profile.name}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor)
    .setThumbnail(avatarUrl)
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

  if (hasGold && premiumData?.expiresAt) {
    const now = Date.now();
    const exp = new Date(premiumData.expiresAt).getTime();
    const totalDuration = premiumData.durationDays ? premiumData.durationDays * 86400000 : 30 * 86400000;
    const percentLeft = Math.max(0, Math.min(1, (exp - now) / totalDuration));
    const filled = Math.round(percentLeft * 10);
    const bar = '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
    const daysLeft = Math.ceil((exp - now) / 86400000);
    embed.addFields({ name: '⭐ Premium restante', value: `${bar} ${daysLeft} día(s)` });
  } else if (hasGold) {
    embed.addFields({ name: '⭐ Premium', value: '∞ Permanente' });
  }

  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  if (achList)   embed.addFields({ name: '🏅 Logros', value: achList });
  embed.addFields({ name: '🏰 Grupos destacados', value: topGroups });
  embed.setFooter({ text: `${hasGold ? '⭐ Premium · ' : ''}Discord: ${target.username ?? ctx.username}` }).setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`btn_avatar_${entry.robloxId}`).setLabel('🎭 Avatar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`btn_estado_${entry.robloxId}`).setLabel('🎮 Estado').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`btn_grupos_${entry.robloxId}`).setLabel('🏰 Grupos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_insignias_${entry.robloxId}`).setLabel('🏅 Insignias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`btn_sync_${entry.robloxId}`).setLabel('🔄 Sincronizar roles').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('🔗 Ver en Roblox').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`),
  );

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row1, row2] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
  collector.on('collect', async (i) => {
    await i.deferUpdate().catch(() => {});
    const [, action, robloxId] = i.customId.split('_');
    if (action === 'avatar') {
      const url = await roblox.getAvatarFull(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle(`🎭 ${profile.displayName}`).setImage(url).setColor(0x1900ff)], ephemeral: true });
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
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏰 Grupos').setColor(0x1900ff)
        .setDescription(grps.slice(0, 10).map(g => `• **${g.group.name}** — ${g.role.name}`).join('\n') || '_Sin grupos_')], ephemeral: true });
    } else if (action === 'insignias') {
      const b = await roblox.getBadges(robloxId);
      await i.followUp({ embeds: [new EmbedBuilder().setTitle('🏅 Insignias').setColor(0xFEE75C)
        .setDescription(b.map(x => `• ${x.name}`).join('\n') || '_Sin insignias_')], ephemeral: true });
    } else if (action === 'sync') {
      await syncRoles(ctx.guild, i.user.id, robloxId);
      await i.followUp({ content: '✅ Roles sincronizados.', ephemeral: true });
    }
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ════════════════════════════════════════════════════════════
//  COMANDOS DE PERFIL (continuación)
// ════════════════════════════════════════════════════════════

async function cmdAvatar(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const [h, f] = await Promise.all([roblox.getAvatar(entry.robloxId), roblox.getAvatarFull(entry.robloxId)]);
  if (!h) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(`🎭 Avatar de ${entry.robloxUsername}`)
    .setURL(`https://www.roblox.com/users/${entry.robloxId}/profile`)
    .setColor(userColor).setThumbnail(h).setImage(f)
    .setFooter({ text: `Solicitado por ${ctx.username}` })] });
}

async function cmdEstado(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !entry.privacyPresence) return ctx.reply({ content: t(lang, 'presence_private', target.username), ephemeral: true });
  if (!ROBLOX_COOKIE) return ctx.reply({ content: t(lang, 'no_cookie'), ephemeral: true });
  presenceCache.cache?.delete?.(entry.robloxId);
  const presence = await roblox.getPresence(entry.robloxId);
  if (!presence) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
  const { label, color } = roblox.formatPresence(presence.userPresenceType);
  let gameName = null;
  if (presence.userPresenceType === 2 && presence.universeId) {
    gameName = await roblox.getGameName(presence.universeId);
    if (isSelf && gameName) await recordGameHistory(ctx.userId, gameName, presence.rootPlaceId);
  }
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder().setTitle(label)
    .setDescription(`**[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)**`)
    .setColor(userColor);
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
    let userAlerts  = await db.getAlerts(ctx.userId) ?? [];
    const userPremium = await isPremium(ctx.userId);
    const validAlerts = userPremium ? userAlerts : filterAlertsByResetPeriod(userAlerts);
    if (!userPremium && validAlerts.length >= 2)
      return i.reply({ content: '❌ Límite gratuito: 2 alertas por día (se reinician a las 20:00 RD). ⭐ Premium = ilimitadas.', ephemeral: true });
    if (!validAlerts.find(a => String(a.watchedRobloxId) === String(wId))) {
      const newAlert = { watchedRobloxId: wId, watchedUsername: wName, channelId: i.channelId, guildId: i.guildId, createdAt: new Date().toISOString() };
      userAlerts.push(newAlert);
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
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const groups = await roblox.getGroups(entry.robloxId);
  if (!groups.length) return ctx.reply(`**${entry.robloxUsername}** no tiene grupos públicos.`);
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < groups.length; i += 5)
    pages.push(new EmbedBuilder().setTitle(`🏰 Grupos de ${entry.robloxUsername}`).setColor(userColor)
      .setDescription(groups.slice(i, i + 5).map(g =>
        `**[${g.group.name}](https://www.roblox.com/groups/${g.group.id})**\n› Rol: **${g.role.name}** · Rango \`${g.role.rank}\``
      ).join('\n\n')).setFooter({ text: `${groups.length} grupos en total` }));
  await paginate(ctx, pages);
}

async function cmdAmigos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const lang   = await getGuildLang(ctx.guild?.id);
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: t(lang, 'no_account', target.username ?? ctx.username), ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: t(lang, 'profile_private'), ephemeral: true });
  const friends = await roblox.getFriends(entry.robloxId);
  if (!friends.length) return ctx.reply(`**${entry.robloxUsername}** no tiene amigos públicos.`);
  const userColor = entry.profileColor || 0x1900ff;
  const pages = [];
  for (let i = 0; i < friends.length; i += 10)
    pages.push(new EmbedBuilder().setTitle(`👥 Amigos de ${entry.robloxUsername}`).setColor(userColor)
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
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  if (target.id !== ctx.userId && !entry.privacyProfile) return ctx.reply({ content: '🔒 Perfil privado.', ephemeral: true });
  const badges = await roblox.getBadges(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Insignias de ${entry.robloxUsername}`).setColor(userColor)
    .setDescription(badges.length ? badges.map(b => `• **${b.name}**${b.description ? `\n  › ${b.description.slice(0, 60)}` : ''}`).join('\n\n') : '_Sin insignias recientes_')
    .setFooter({ text: 'Últimas 10 insignias · Se ganan jugando diferentes juegos' })] });
}

async function cmdHistorialNombres(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const history = await roblox.getNameHistory(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`📜 Historial de nombres de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(history.length ? history.map((h, i) => `**${i + 1}.** ${h.name}`).join('\n') : '_Sin historial de nombres anteriores_')
    .setFooter({ text: 'Nombres anteriores que tuvo esta cuenta de Roblox' })] });
}

async function cmdBuscar(ctx, username) {
  const lang  = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeUsername(username);
  if (!clean) return ctx.reply({ content: '❌ Nombre inválido.', ephemeral: true });
  const u = await roblox.getUserByName(clean);
  if (!u) return ctx.reply({ content: t(lang, 'verify_not_found'), ephemeral: true });
  const [p, av, fr, fo, fg, gr] = await Promise.all([
    roblox.getProfile(u.id), roblox.getAvatar(u.id),
    roblox.getFriendCount(u.id), roblox.getFollowerCount(u.id),
    roblox.getFollowingCount(u.id), roblox.getGroups(u.id),
  ]);
  if (!p) return ctx.reply({ content: t(lang, 'error_generic'), ephemeral: true });
  const age = Math.floor((Date.now() - new Date(p.created)) / 86400000);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 ${p.displayName}  ·  @${p.name}`)
    .setURL(`https://www.roblox.com/users/${u.id}/profile`).setColor(0x1900ff).setThumbnail(av)
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

async function cmdWhoisRoblox(ctx, robloxId) {
  if (!robloxId || isNaN(robloxId)) return ctx.reply({ content: '❌ Proporciona un ID numérico de Roblox. Ej: `!whoislox 123456`', ephemeral: true });
  const profile  = await roblox.getUserById(robloxId);
  if (!profile)  return ctx.reply({ content: '❌ No encontré ningún usuario con ese ID en Roblox.', ephemeral: true });
  const avatarUrl = await roblox.getAvatar(robloxId);
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ID de Roblox: ${robloxId}`)
    .setColor(0x1900ff).setThumbnail(avatarUrl)
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

async function cmdOutfit(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const outfit = await roblox.getOutfit(entry.robloxId);
  if (!outfit) return ctx.reply({ content: '❌ No se pudo obtener el outfit.', ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`👕 Outfit de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(`**${outfit.name}**`)
    .setImage(outfit.imageUrl)
    .setFooter({ text: 'Ropa actual en Roblox' });
  ctx.reply({ embeds: [embed] });
}

async function cmdRAP(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const entry  = await db.getUser(target.id);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const rap = await roblox.getRAP(entry.robloxId);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`💰 Valor RAP de ${entry.robloxUsername}`)
    .setColor(userColor)
    .addFields(
      { name: 'Valor estimado', value: `${rap.value.toLocaleString()} R$`, inline: true },
      { name: 'Limiteds', value: `${rap.limiteds.length}`, inline: true },
    )
    .setFooter({ text: 'Fuente: Rolimons (aproximado)' });
  ctx.reply({ embeds: [embed] });
}

// ════════════════════════════════════════════════════════════
//  JUEGOS DE ROBLOX
// ════════════════════════════════════════════════════════════

async function cmdJuego(ctx, query) {
  const clean = sanitizeText(query, 100);
  if (!clean) return ctx.reply({ content: '❌ Uso: `/juego <nombre del juego>`', ephemeral: true });
  const games = await roblox.searchGame(clean);
  if (!games.length) return ctx.reply({ content: '❌ No encontré juegos con ese nombre en Roblox.', ephemeral: true });
  const game = games[0];
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(`🎮 ${game.name}`)
    .setURL(`https://www.roblox.com/games/${game.placeId}`)
    .setColor(userColor)
    .addFields(
      { name: '👥 Jugando ahora', value: `${game.playerCount ?? 'N/A'}`, inline: true },
      { name: '❤️ Likes',         value: `${game.totalUpVotes ?? 'N/A'}`, inline: true },
      { name: '👎 Dislikes',      value: `${game.totalDownVotes ?? 'N/A'}`, inline: true },
    )
    .setFooter({ text: `ID del juego: ${game.placeId}` })] });
}

// ════════════════════════════════════════════════════════════
//  HISTORIAL DE JUEGOS
// ════════════════════════════════════════════════════════════

async function cmdHistorial(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  const history = await db.getHistory(ctx.userId) ?? [];
  if (!history.length) return ctx.reply('📜 Sin historial aún.\nSe registra automáticamente cuando usas `/estado` mientras juegas en Roblox.');
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`📜 Historial de juegos de ${entry.robloxUsername}`)
    .setDescription(history.map((h, i) => {
      const date = new Date(h.playedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `**${i + 1}.** [${h.gameName}](https://www.roblox.com/games/${h.placeId})\n› ${date}`;
    }).join('\n\n'))
    .setColor(userColor)
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

// ── CATÁLOGO, MURO, STATUS ─────────────────────────────────────
async function cmdCatalogo(ctx, query) {
  const clean = sanitizeText(query, 100);
  if (!clean) return ctx.reply({ content: '❌ Uso: `/catalogo <nombre del item>`', ephemeral: true });
  const items = await roblox.searchCatalog(clean);
  if (!items.length) return ctx.reply({ content: '❌ No encontré items con ese nombre en el catálogo.', ephemeral: true });
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
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
      .setColor(userColor);
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

async function cmdMuroGrupo(ctx, groupId) {
  if (!groupId || isNaN(groupId)) return ctx.reply({ content: '❌ Proporciona el ID numérico del grupo. Ej: `/murogrupo 12345`', ephemeral: true });
  const [groupInfo, posts] = await Promise.all([
    roblox.getGroupInfo(groupId),
    roblox.getGroupWall(groupId),
  ]);
  if (!groupInfo) return ctx.reply({ content: '❌ No encontré ese grupo en Roblox. Verifica el ID.', ephemeral: true });
  if (!posts.length) return ctx.reply(`El muro del grupo **${groupInfo.name}** está vacío o es privado.`);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`📋 Muro de ${groupInfo.name}`)
    .setURL(`https://www.roblox.com/groups/${groupId}`)
    .setColor(userColor)
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

async function cmdRobloxStatus(ctx) {
  const status = await roblox.getRobloxStatus();
  if (!status) return ctx.reply({ content: '❌ No pude obtener el estado de Roblox. Intenta en unos minutos.', ephemeral: true });
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

// ── LFG ────────────────────────────────────────────────────────
async function cmdLFG(ctx, gameName, slots) {
  if (!gameName) return ctx.reply({ content: '❌ Uso: `!lfg <nombre del juego> [slots]`\nEjemplo: `!lfg Blox Fruits 4`', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ Necesitas tener cuenta vinculada para crear un LFG.', ephemeral: true });
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
    const userColor = entry.profileColor || 0x1900ff;
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
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 60 * 1000 });
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

// ── SUGERENCIAS ────────────────────────────────────────────────
async function cmdSugerencia(ctx, text) {
  const clean = sanitizeText(text, 500);
  if (!clean || clean.length < 10) return ctx.reply({ content: '❌ La sugerencia debe tener al menos 10 caracteres.', ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.suggestionChannelId) return ctx.reply({ content: '❌ El servidor no tiene canal de sugerencias configurado.', ephemeral: true });
  const channel = await ctx.guild.channels.fetch(config.suggestionChannelId).catch(() => null);
  if (!channel) return ctx.reply({ content: '❌ No pude encontrar el canal de sugerencias.', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  const userColor = entry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('💡 Nueva sugerencia')
    .setDescription(clean)
    .setColor(userColor)
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
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.suggestionChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de sugerencias: <#${channelId}>`);
}

// ── PREMIUM ────────────────────────────────────────────────────
async function cmdPremiumStatus(ctx) {
  const [premium, active] = await Promise.all([db.getPremium(ctx.userId), isPremium(ctx.userId)]);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder().setColor(userColor);
  if (active) {
    let expText = '';
    let bar = '';
    if (premium?.expiresAt) {
      const now = Date.now();
      const exp = new Date(premium.expiresAt).getTime();
      const totalDuration = premium.durationDays ? premium.durationDays * 86400000 : 30 * 86400000;
      const percentLeft = Math.max(0, Math.min(1, (exp - now) / totalDuration));
      const filled = Math.round(percentLeft * 10);
      bar = '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
      const daysLeft = Math.ceil((exp - now) / 86400000);
      expText = `Expira: ${new Date(premium.expiresAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}\n${bar} ${daysLeft} día(s) restantes`;
    } else {
      expText = 'Permanente ∞';
    }
    embed.setTitle('⭐ Premium activo').setColor(0xFFD700)
      .setDescription(`\`\`\`\n╔══════════════════╗\n║  ⭐ PREMIUM ⭐   ║\n╚══════════════════╝\`\`\`\n**${expText}**\n\n🔔 Alertas ilimitadas · 🎨 /flex · ⚔️ /comparar · 📜 /historial · ⚙️ /syncall · ⏩ Cooldowns x0.5`);
  } else {
    embed.setTitle('⭐ Plan Premium')
      .setDescription(
        `\`\`\`\n╔══════════════════╗\n║   PREMIUM PLAN   ║\n╚══════════════════╝\`\`\`\n` +
        `> 🔔 Alertas **ilimitadas** (gratis = 2/día)\n> 🎨 \`/flex\` — Tarjeta de perfil exclusiva\n> ⚔️ \`/comparar\` — Comparar dos cuentas\n> 📜 \`/historial\` — Ver tus juegos recientes\n> ⚙️ \`/syncall\` — Sincronizar todos los roles\n> ⭐ Rol Premium en el servidor\n> ⏩ Cooldowns reducidos a la mitad\n\n` +
        `**Planes:**\n\`7 días\` - $1.99\n\`30 días\` - $4.99\n\n` +
        `Usa \`/buy\` para comprar con PayPal.`
      );
  }
  ctx.reply({ embeds: [embed] });
}

async function cmdActivarPremium(ctx, targetId, dias) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: t(await getGuildLang(ctx.guild?.id), 'owner_only'), ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });
  const expDate = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
  await db.savePremium(targetId, { activatedAt: new Date().toISOString(), expiresAt: expDate, activatedBy: ctx.userId, durationDays: dias ?? null });
  const premiumList = await redisGet('premium_users_list') ?? [];
  if (!premiumList.includes(targetId)) { premiumList.push(targetId); await redisSet('premium_users_list', premiumList); }
  ctx.reply({ content: `✅ Premium activado para <@${targetId}>${dias ? ` por **${dias} días**` : ' **permanentemente**'}.` });
}

async function cmdDesactivarPremium(ctx, targetId) {
  if (ctx.userId !== process.env.BOT_OWNER_ID)
    return ctx.reply({ content: t(await getGuildLang(ctx.guild?.id), 'owner_only'), ephemeral: true });
  if (!targetId) return ctx.reply({ content: '❌ Debes proporcionar el Discord ID del usuario.', ephemeral: true });

  const existing = await db.getPremium(targetId);
  if (!existing) return ctx.reply({ content: `❌ El usuario <@${targetId}> no tiene Premium activo.`, ephemeral: true });

  await redisDel(`premium:${targetId}`);
  const premiumList = await redisGet('premium_users_list') ?? [];
  const newList = premiumList.filter(id => id !== targetId);
  await redisSet('premium_users_list', newList);

  ctx.reply({ content: `✅ Premium **desactivado** para <@${targetId}>. El usuario ha perdido acceso a las funciones Premium.` });
}

async function cmdComparar(ctx, targetUser1, targetUser2) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!targetUser1 || !targetUser2) return ctx.reply({ content: '❌ Menciona a dos usuarios.', ephemeral: true });
  const [e1, e2] = await Promise.all([db.getUser(targetUser1.id), db.getUser(targetUser2.id)]);
  if (!e1) return ctx.reply({ content: `❌ **${targetUser1.username}** sin cuenta.`, ephemeral: true });
  if (!e2) return ctx.reply({ content: `❌ **${targetUser2.username}** sin cuenta.`, ephemeral: true });
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
  const userColor = e1.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`⚔️ ${p1.name}  vs  ${p2.name}`)
    .setColor(userColor).setThumbnail(av1)
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
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const [profile, avatarFull, friends, followers, groups, badges, presence, eco, bgUrl] = await Promise.all([
    roblox.getProfile(entry.robloxId), roblox.getAvatarFull(entry.robloxId),
    roblox.getFriendCount(entry.robloxId), roblox.getFollowerCount(entry.robloxId),
    roblox.getGroups(entry.robloxId), roblox.getBadges(entry.robloxId),
    roblox.getPresence(entry.robloxId), db.getEconomy(ctx.userId),
    db.getFlexBg(ctx.userId),
  ]);
  const { label } = roblox.formatPresence(presence?.userPresenceType ?? 0);
  const age  = Math.floor((Date.now() - new Date(profile.created)) / 86400000);
  const rank = getRank(eco?.points ?? 0);
  const achList = (eco?.achievements ?? []).map(id => ACHIEVEMENTS.find(a => a.id === id)?.name ?? '').filter(Boolean);
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`✨ ${profile.displayName}`)
    .setDescription(`\`\`\`\n╔════════════════════════════╗\n║     TARJETA DE PERFIL      ║\n╚════════════════════════════╝\`\`\`\n*${profile.description?.slice(0, 120) || 'Sin descripción'}*`)
    .setColor(userColor).setImage(avatarFull)
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
  if (bgUrl) embed.setImage(bgUrl).setThumbnail(avatarFull);
  if (achList.length) embed.addFields({ name: '🏅 Logros', value: achList.join(' ') });
  if (rank.next) embed.addFields({ name: 'Progreso de rango', value: `${progressBar(eco?.points ?? 0, rank.next)} ${eco?.points ?? 0}/${rank.next}` });
  ctx.reply({ embeds: [embed] });
}

async function cmdMiStats(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ Sin cuenta vinculada.', ephemeral: true });
  const stats = await db.getGameStats(ctx.userId) ?? { games: {} };
  const games = Object.entries(stats.games).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (!games.length) return ctx.reply({ content: '📊 Aún no hay estadísticas. Juega Roblox y usa `/estado`.', ephemeral: true });
  const userColor = entry.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`📊 Estadísticas de juego de ${entry.robloxUsername}`)
    .setColor(userColor)
    .setDescription(games.map(([name, data], i) => `**${i+1}.** ${name} — **${data.count}** sesión${data.count !== 1 ? 'es' : ''}`).join('\n'))
    .setFooter({ text: 'Basado en tu historial de /estado' });
  ctx.reply({ embeds: [embed] });
}

// ── ALTS ───────────────────────────────────────────────────────
async function cmdAddAlt(ctx, username) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const clean = sanitizeUsername(username);
  if (!clean) return ctx.reply({ content: '❌ Nombre inválido.', ephemeral: true });
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return ctx.reply({ content: '❌ Usuario no encontrado.', ephemeral: true });
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (alts.length >= 3) return ctx.reply({ content: '❌ Ya tienes 3 alts vinculadas (máximo).', ephemeral: true });
  if (alts.find(a => a.id === robloxUser.id)) return ctx.reply({ content: '❌ Esa cuenta ya está vinculada como alt.', ephemeral: true });
  const main = await db.getUser(ctx.userId);
  if (main?.robloxId === robloxUser.id) return ctx.reply({ content: '❌ Esa es tu cuenta principal.', ephemeral: true });
  alts.push({ id: robloxUser.id, name: robloxUser.name, displayName: robloxUser.displayName });
  await db.saveAlts(ctx.userId, alts);
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('✅ Alt añadida').setColor(0x57F287).setDescription(`**${robloxUser.displayName}** (@${robloxUser.name})`)] });
}

async function cmdAlts(ctx) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  const alts = await db.getAlts(ctx.userId) ?? [];
  if (!alts.length) return ctx.reply({ content: '❌ No tienes alts vinculadas. Usa `/addalt <usuario>`.', ephemeral: true });
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('👥 Tus cuentas alt')
    .setColor(userColor)
    .setDescription(alts.map((a, i) => `**${i+1}.** [${a.displayName}](https://www.roblox.com/users/${a.id}/profile) (@${a.name})`).join('\n'));
  ctx.reply({ embeds: [embed] });
}

async function cmdSetFlexBg(ctx, url) {
  if (!await isPremium(ctx.userId)) return premiumEmbed(ctx);
  if (!url || !url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) return ctx.reply({ content: '❌ URL inválida. Debe ser una imagen (jpg, png, gif).', ephemeral: true });
  await db.saveFlexBg(ctx.userId, url);
  ctx.reply({ content: '✅ Fondo de /flex actualizado.', ephemeral: true });
}

// ── ECONOMÍA (ampliada) ───────────────────────────────────────
async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco    = await db.getEconomy(target.id) ?? { points: 0, totalEarned: 0, streak: 0 };
  const rank   = getRank(eco.points ?? 0);
  const bar    = rank.next ? `${progressBar(eco.points ?? 0, rank.next)} ${eco.points}/${rank.next}` : '💎 ¡Rango máximo!';
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Puntos de ${target.username ?? ctx.username}`)
    .setColor(userColor)
    .addFields(
      { name: '💰 Puntos actuales', value: `**${eco.points ?? 0}**`,      inline: true },
      { name: '📈 Total ganado',    value: `**${eco.totalEarned ?? 0}**`,  inline: true },
      { name: '🔥 Racha actual',    value: `**${eco.streak ?? 0}** días`, inline: true },
      { name: rank.name,            value: bar },
    ).setFooter({ text: 'Gana puntos con !daily todos los días' })] });
}

async function cmdDaily(ctx) {
  const eco  = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, totalEarned: 0, streak: 0, dailyClaims: 0 };
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
  eco.dailyClaims  = (eco.dailyClaims ?? 0) + 1;
  await db.saveEconomy(ctx.userId, eco);
  const user    = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  const rank    = getRank(eco.points);
  const userColor = user?.profileColor || 0x1900ff;
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
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🏅 Logros de ${target.username ?? ctx.username}`)
    .setColor(userColor)
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
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder()
    .setTitle(win ? '🎉 ¡Ganaste el coinflip!' : '💀 Perdiste el coinflip')
    .setColor(win ? 0x57F287 : 0xED4245)
    .setDescription(`Apostaste **${bet} puntos** y ${win ? `ganaste **${bet}** 🪙` : `perdiste **${bet}** 💸`}`)
    .addFields({ name: '💰 Saldo actual', value: `**${eco.points}** puntos` })] });
}

async function cmdPay(ctx, targetUser, amountStr) {
  if (!targetUser) return ctx.reply({ content: '❌ Menciona a un usuario. Ej: `!pay @usuario 100`', ephemeral: true });
  if (targetUser.id === ctx.userId) return ctx.reply({ content: '❌ No puedes enviarte puntos a ti mismo.', ephemeral: true });
  const amount = parseInt(amountStr);
  const eco    = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (!amount || amount < 1 || amount > (eco.points ?? 0))
    return ctx.reply({ content: `❌ Cantidad inválida. Tienes **${eco.points ?? 0}** puntos disponibles.`, ephemeral: true });
  const targetEco   = await db.getEconomy(targetUser.id) ?? { points: 0 };
  eco.points       -= amount;
  targetEco.points  = (targetEco.points ?? 0) + amount;
  await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
  ctx.reply(`✅ Enviaste **${amount} puntos** a **${targetUser.username}**.\nTu nuevo saldo: **${eco.points}** puntos.`);
}

async function cmdRob(ctx, targetUser) {
  if (!targetUser) return ctx.reply({ content: '❌ Menciona a un usuario.', ephemeral: true });
  if (targetUser.id === ctx.userId) return ctx.reply({ content: '❌ No puedes robarte a ti mismo.', ephemeral: true });
  
  // Mensajes personalizados
  if (targetUser.id === process.env.BOT_OWNER_ID) {
    if (ctx.userId === '752391528475000933') {
      return ctx.reply({ content: '¿Como se atreve un simple femboy a morder la mano su alfa? 🥵', ephemeral: true });
    }
    return ctx.reply({ content: '👑 No puedes robarle a tu propio rey, plebeyo.', ephemeral: true });
  }
  if (ctx.userId === process.env.BOT_OWNER_ID) return ctx.reply({ content: '👑 El dueño no necesita robar.', ephemeral: true });

  if (await isJailed(ctx.userId)) {
    const jailed = await redisGet(`jailed:${ctx.userId}`);
    const mins = Math.ceil((new Date(jailed.until) - new Date()) / 60000);
    return ctx.reply({ content: `🚔 Estás encarcelado por **${mins} minutos**. Usa el botón de "Pagar fianza" del mensaje donde fallaste el robo.`, ephemeral: true });
  }
  
  if (await isJailed(targetUser.id)) {
    return ctx.reply({ content: `❌ No puedes robar a **${targetUser.username}** porque está bajo protección carcelaria.`, ephemeral: true });
  }

  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, successfulRobs: 0, failedRobs: 0, totalStolen: 0, timesJailed: 0, bailPaidCount: 0 };
  const targetEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  
  if (targetEco.points < 50) return ctx.reply({ content: `❌ **${targetUser.username}** no tiene suficientes puntos para robar (mínimo 50).`, ephemeral: true });

  const success = Math.random() < 0.4;
  const maxRob = Math.min(200, Math.floor(targetEco.points * 0.2));
  const amount = Math.floor(Math.random() * maxRob) + 20;

  if (success) {
    targetEco.points -= amount;
    eco.points += amount;
    eco.successfulRobs = (eco.successfulRobs ?? 0) + 1;
    eco.totalStolen = (eco.totalStolen ?? 0) + amount;
    await Promise.all([db.saveEconomy(ctx.userId, eco), db.saveEconomy(targetUser.id, targetEco)]);
    
    const gifUrl = await getAnimeGif('kick');
    const embed = new EmbedBuilder()
      .setTitle('🦹 ¡Robo exitoso!')
      .setColor(0x57F287)
      .setDescription(`Robaste **${amount}** puntos a **${targetUser.username}**.`);
    if (gifUrl) embed.setImage(gifUrl);
    await ctx.reply({ embeds: [embed] });
    
    // Check achievements after successful rob
    const user = await db.getUser(ctx.userId);
    await checkAchievements(ctx.userId, eco, user);
  } else {
    const fine = Math.min(100, eco.points);
    eco.points -= fine;
    eco.failedRobs = (eco.failedRobs ?? 0) + 1;
    await db.saveEconomy(ctx.userId, eco);
    
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    eco.timesJailed = (eco.timesJailed ?? 0) + 1;
    await db.saveEconomy(ctx.userId, eco);
    await redisSet(`jailed:${ctx.userId}`, { until, reason: 'robo_fallido' });
    
    const gifUrl = await getAnimeGif('cry');
    const embed = new EmbedBuilder()
      .setTitle('🚔 ¡Robo fallido!')
      .setColor(0xED4245)
      .setDescription(`Fallaste al robar a **${targetUser.username}**.\nMulta: **${fine}** monedas.\nEstás **encarcelado por 1 hora**.\n\nPuedes pagar 200 monedas para salir inmediatamente.`);
    if (gifUrl) embed.setImage(gifUrl);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pay_bail').setLabel('💰 Pagar fianza (200 monedas)').setStyle(ButtonStyle.Primary),
    );
    
    const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
    if (!msg) return;
    
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo el encarcelado puede pagar la fianza.', ephemeral: true });
      const userEco = await db.getEconomy(ctx.userId) ?? { points: 0, bailPaidCount: 0 };
      if (userEco.points < 200) {
        return i.reply({ content: `❌ Necesitas 200 monedas. Tienes ${userEco.points}.`, ephemeral: true });
      }
      userEco.points -= 200;
      userEco.bailPaidCount = (userEco.bailPaidCount ?? 0) + 1;
      await db.saveEconomy(ctx.userId, userEco);
      await redisDel(`jailed:${ctx.userId}`);
      
      const user = await db.getUser(ctx.userId);
      await checkAchievements(ctx.userId, userEco, user);
      
      await i.update({ embeds: [embed.setFooter({ text: '✅ Fianza pagada. Estás libre.' }).setColor(0x57F287)], components: [] });
      collector.stop();
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    
    // Check achievements after failed rob
    const user = await db.getUser(ctx.userId);
    await checkAchievements(ctx.userId, eco, user);
  }
}

// ── LEADERBOARDS ──────────────────────────────────────────────
async function cmdTopLocal(ctx) {
  const members = await ctx.guild.members.fetch();
  const ecoList = [];
  for (const [id] of members) {
    const eco = await db.getEconomy(id);
    if (eco?.points) ecoList.push({ id, username: members.get(id)?.user.username ?? id, points: eco.points });
  }
  ecoList.sort((a, b) => b.points - a.points);
  const top10 = ecoList.slice(0, 10);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(t(await getGuildLang(ctx.guild.id), 'lb_local_title'))
    .setColor(userColor)
    .setDescription(top10.map((u, i) => `**${i+1}.** ${u.username} — **${u.points}** pts`).join('\n') || 'No hay datos aún.');
  ctx.reply({ embeds: [embed] });
}

async function cmdTopGlobal(ctx) {
  const global = await redisGet('leaderboard_global') ?? [];
  global.sort((a, b) => b.points - a.points);
  const top10 = global.slice(0, 10);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(t(await getGuildLang(ctx.guild?.id), 'lb_global_title'))
    .setColor(userColor)
    .setDescription(top10.map((u, i) => `**${i+1}.** ${u.username} — **${u.points}** pts`).join('\n') || 'No hay datos aún.');
  ctx.reply({ embeds: [embed] });
}

async function updateGlobalLeaderboard(userId, username, points) {
  const global = await redisGet('leaderboard_global') ?? [];
  const existing = global.find(u => u.id === userId);
  if (existing) existing.points = points;
  else global.push({ id: userId, username, points });
  global.sort((a, b) => b.points - a.points);
  await redisSet('leaderboard_global', global.slice(0, 100));
}

// ── TIENDA (30+ colores) ─────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'color_red', name: '🔴 Rojo', cost: 500, type: 'color', value: 0xED4245 },
  { id: 'color_blue', name: '🔵 Azul', cost: 500, type: 'color', value: 0x5865F2 },
  { id: 'color_green', name: '🟢 Verde', cost: 500, type: 'color', value: 0x57F287 },
  { id: 'color_yellow', name: '🟡 Amarillo', cost: 500, type: 'color', value: 0xFEE75C },
  { id: 'color_purple', name: '🟣 Morado', cost: 500, type: 'color', value: 0x9B59B6 },
  { id: 'color_orange', name: '🟠 Naranja', cost: 500, type: 'color', value: 0xE67E22 },
  { id: 'color_pink', name: '💗 Rosa', cost: 500, type: 'color', value: 0xFF69B4 },
  { id: 'color_cyan', name: '🔷 Cian', cost: 500, type: 'color', value: 0x00FFFF },
  { id: 'color_lime', name: '🍏 Lima', cost: 500, type: 'color', value: 0x00FF00 },
  { id: 'color_magenta', name: '🌸 Magenta', cost: 500, type: 'color', value: 0xFF00FF },
  { id: 'color_brown', name: '🤎 Marrón', cost: 500, type: 'color', value: 0x8B4513 },
  { id: 'color_navy', name: '🌙 Azul marino', cost: 500, type: 'color', value: 0x000080 },
  { id: 'color_teal', name: '🦚 Verde azulado', cost: 500, type: 'color', value: 0x008080 },
  { id: 'color_olive', name: '🫒 Oliva', cost: 500, type: 'color', value: 0x808000 },
  { id: 'color_maroon', name: '🍷 Granate', cost: 500, type: 'color', value: 0x800000 },
  { id: 'color_coral', name: '🐠 Coral', cost: 500, type: 'color', value: 0xFF7F50 },
  { id: 'color_salmon', name: '🍣 Salmón', cost: 500, type: 'color', value: 0xFA8072 },
  { id: 'color_gold', name: '🥇 Dorado', cost: 1000, type: 'color', value: 0xFFD700 },
  { id: 'color_silver', name: '🥈 Plateado', cost: 1000, type: 'color', value: 0xC0C0C0 },
  { id: 'color_bronze', name: '🥉 Bronce', cost: 1000, type: 'color', value: 0xCD7F32 },
  { id: 'color_lavender', name: '💜 Lavanda', cost: 500, type: 'color', value: 0xE6E6FA },
  { id: 'color_mint', name: '🌿 Menta', cost: 500, type: 'color', value: 0x98FF98 },
  { id: 'color_peach', name: '🍑 Durazno', cost: 500, type: 'color', value: 0xFFDAB9 },
  { id: 'color_skyblue', name: '☀️ Azul cielo', cost: 500, type: 'color', value: 0x87CEEB },
  { id: 'color_indigo', name: '🌀 Índigo', cost: 500, type: 'color', value: 0x4B0082 },
  { id: 'color_violet', name: '🔮 Violeta', cost: 500, type: 'color', value: 0xEE82EE },
  { id: 'color_turquoise', name: '💎 Turquesa', cost: 500, type: 'color', value: 0x40E0D0 },
  { id: 'color_chocolate', name: '🍫 Chocolate', cost: 500, type: 'color', value: 0xD2691E },
  { id: 'color_tomato', name: '🍅 Tomate', cost: 500, type: 'color', value: 0xFF6347 },
  { id: 'color_plum', name: '🍇 Ciruela', cost: 500, type: 'color', value: 0xDDA0DD },
  { id: 'badge_vip', name: '🌟 Insignia VIP', cost: 2000, type: 'badge' },
];

async function cmdTienda(ctx) {
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('🛒 Tienda de Puntos')
    .setColor(userColor)
    .setDescription(SHOP_ITEMS.map(item => `**${item.name}** — \`${item.cost}\` pts\nID: \`${item.id}\``).join('\n\n'))
    .setFooter({ text: 'Usa /comprar <id> para adquirir' });
  ctx.reply({ embeds: [embed] });
}

async function cmdComprar(ctx, itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return ctx.reply({ content: '❌ Item no encontrado. Usa /tienda para ver.', ephemeral: true });
  
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, shopPurchases: 0 };
  const profile = await db.getUser(ctx.userId) ?? {};
  if (!profile.inventory) profile.inventory = [];
  
  if (profile.inventory.includes(item.id)) return ctx.reply({ content: '❌ Ya tienes este item.', ephemeral: true });
  
  if (!isOwner) {
    if (eco.points < item.cost) return ctx.reply({ content: `❌ Necesitas ${item.cost} puntos. Tienes ${eco.points}.`, ephemeral: true });
    eco.points -= item.cost;
    eco.shopPurchases = (eco.shopPurchases ?? 0) + 1;
  }
  
  profile.inventory.push(item.id);
  if (item.type === 'color') profile.profileColor = item.value;
  await db.saveUser(ctx.userId, profile);
  if (!isOwner) await db.saveEconomy(ctx.userId, eco);
  
  // Check achievements
  const user = await db.getUser(ctx.userId);
  await checkAchievements(ctx.userId, eco, user);
  
  ctx.reply({ content: isOwner ? `👑 Como dueño, recibiste **${item.name}** gratis.` : `✅ Compraste **${item.name}** por ${item.cost} puntos.`, ephemeral: true });
}

// ── TRIVIA (con límite diario) ─────────────────────────────────
const { getRandomQuestion: _getRandomQ, checkAnswer: _checkAnswer, CATEGORIES: _TRIVIA_CATS } = require('./trivia.js');

async function cmdTrivia(ctx, category) {
  const lang = await getGuildLang(ctx.guild?.id);
  const channel = ctx.channel;
  if (!channel) return ctx.reply({ content: '❌ Este comando solo funciona en canales de texto.', ephemeral: true });

  const today = new Date().toISOString().slice(0,10);
  const countKey = `trivia:count:${ctx.userId}:${today}`;
  const count = parseInt(await redisGet(countKey) || '0');
  const isPremiumUser = await isPremium(ctx.userId);
  const limit = isPremiumUser ? 30 : 10;
  
  if (count >= limit) {
    return ctx.reply({ content: `❌ Has alcanzado el límite diario de trivia (${limit} preguntas). Vuelve mañana o hazte Premium para 30.`, ephemeral: true });
  }

  let question;
  if (category && _TRIVIA_CATS.includes(category)) {
    const { getQuestionByCategory } = require('./trivia.js');
    question = getQuestionByCategory(category);
  } else {
    question = _getRandomQ();
  }

  const catEmoji = { Roblox: '🎮', Matemáticas: '🔢', Ciencias: '🔬', Historia: '📜', Geografía: '🌍', Tecnología: '💻', General: '🎯' };
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle(`${catEmoji[question.cat] ?? '🎲'} Trivia — ${question.cat}`)
    .setDescription(`**${question.q}**`)
    .setColor(userColor)
    .setFooter({ text: `Escribe tu respuesta · 30 segundos · ${count + 1}/${limit} hoy` });

  await ctx.reply({ embeds: [embed] });

  const filter = m => m.author.id !== (ctx.clientUserId ?? '') && !m.author.bot;
  const collector = channel.createMessageCollector({ filter, time: 30000 });
  let answered = false;

  collector.on('collect', async (m) => {
    if (answered) return;
    if (_checkAnswer(m.content, question.a)) {
      answered = true;
      collector.stop('answered');
      
      await redisSet(countKey, count + 1);
      await fetch(`${REDIS_URL}/expire/${countKey}/86400`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
      
      const eco = await db.getEconomy(m.author.id) ?? { points: 0, totalEarned: 0, triviaWins: 0 };
      const reward = 5;
      eco.points = (eco.points ?? 0) + reward;
      eco.totalEarned = (eco.totalEarned ?? 0) + reward;
      eco.triviaWins = (eco.triviaWins ?? 0) + 1;
      await db.saveEconomy(m.author.id, eco);
      
      const user = await db.getUser(m.author.id);
      await checkAchievements(m.author.id, eco, user);
      
      await m.reply(`✅ ¡Correcto! La respuesta era **${question.a}**\n🎁 <@${m.author.id}> gana **+${reward} puntos**! Saldo: **${eco.points}**\n📊 ${count + 1}/${limit} preguntas hoy.`);
    }
  });

  collector.on('end', (collected, reason) => {
    if (!answered) {
      channel.send(`⏰ Tiempo agotado. La respuesta era **${question.a}**.`).catch(() => {});
    }
  });
}

// ── CANALES DE VOZ AUTOMÁTICOS ────────────────────────────────
async function cmdSetVoiceCategory(ctx, categoryId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageChannels))
    return ctx.reply({ content: '❌ Necesitas Gestionar Canales.', ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.voiceCategoryId = categoryId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Categoría para canales de voz automáticos configurada.`);
}

// ── MODERACIÓN Y CONFIGURACIÓN ────────────────────────────────
async function cmdWhois(ctx, targetUser) {
  if (!targetUser) return ctx.reply({ content: '❌ Menciona a un usuario. Ej: `/whois @usuario`', ephemeral: true });
  const entry = await db.getUser(targetUser.id);
  if (!entry) return ctx.reply({ content: `❌ **${targetUser.username}** no tiene cuenta de Roblox vinculada.`, ephemeral: true });
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  const userColor = entry.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`🔍 Whois: ${targetUser.username}`)
    .setColor(userColor).setThumbnail(avatarUrl)
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
    return ctx.reply({ content: '❌ El bot necesita el permiso **Gestionar Roles** en este servidor.', ephemeral: true });
  await ctx.reply('⏳ Sincronizando roles de todos los miembros verificados...');
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { await syncRoles(ctx.guild, id, entry.robloxId); count++; }
  }
  ctx.reply(`✅ Roles sincronizados para **${count}** miembros verificados.`);
}

// ── ALERTAS Y PRIVACIDAD ──────────────────────────────────────
async function cmdAlertas(ctx, sub, targetUser) {
  if (sub === 'ver') {
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    if (!alerts.length) return ctx.reply({ content: '❌ No tienes alertas activas (las gratuitas se reinician a las 20:00 RD).', ephemeral: true });
    const userEntry = await db.getUser(ctx.userId);
    const userColor = userEntry?.profileColor || 0x1900ff;
    ctx.reply({ embeds: [new EmbedBuilder().setTitle('🔔 Tus alertas de presencia').setColor(userColor)
      .setDescription(alerts.map((a, i) => `**${i + 1}.** **${a.watchedUsername}** (\`${a.watchedRobloxId}\`)${a.createdAt ? ` · ${new Date(a.createdAt).toLocaleTimeString('es-ES')}` : ''}`).join('\n'))
      .setFooter({ text: 'Recibirás un ping cuando cambie su estado' })] });
    return;
  }
  if (sub === 'quitar') {
    if (!targetUser) return ctx.reply({ content: '❌ Menciona al usuario cuya alerta quieres eliminar.', ephemeral: true });
    const entry = await db.getUser(targetUser.id);
    if (!entry) return ctx.reply({ content: '❌ Ese usuario no tiene cuenta de Roblox vinculada.', ephemeral: true });
    let alerts = await db.getAlerts(ctx.userId) ?? [];
    const isPremiumUser = await isPremium(ctx.userId);
    if (!isPremiumUser) alerts = filterAlertsByResetPeriod(alerts);
    alerts = alerts.filter(a => String(a.watchedRobloxId) !== String(entry.robloxId));
    await db.saveAlerts(ctx.userId, alerts);
    return ctx.reply(`✅ Alerta de **${entry.robloxUsername}** eliminada correctamente.`);
  }
  ctx.reply({ content: '❌ Uso: `!alertas ver` — Ver tus alertas\n`!alertas quitar @usuario` — Eliminar una alerta', ephemeral: true });
}

async function cmdActualizar(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta de Roblox vinculada. Usa `/verificar` primero.', ephemeral: true });
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  ctx.reply({ content: '✅ Tus roles de Discord han sido actualizados según tu cuenta de Roblox.', ephemeral: true });
}

async function cmdDesvincular(ctx) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes ninguna cuenta de Roblox vinculada.', ephemeral: true });
  await db.deleteUser(ctx.userId);
  ctx.reply(`✅ Tu cuenta **${entry.robloxUsername}** fue desvinculada. Puedes volver a verificarte cuando quieras.`);
}

async function cmdPermitir(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply({ content: '❌ Uso: `!permitir presencia` o `!permitir perfil`', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: true });
  ctx.reply(`✅ Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **visible** para otros.`);
}

async function cmdBloquear(ctx, tipo) {
  if (!['presencia', 'perfil'].includes(tipo)) return ctx.reply({ content: '❌ Uso: `!bloquear presencia` o `!bloquear perfil`', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  await db.saveUser(ctx.userId, { ...entry, [tipo === 'presencia' ? 'privacyPresence' : 'privacyProfile']: false });
  ctx.reply(`🔒 Tu **${tipo === 'presencia' ? 'presencia en Roblox' : 'perfil'}** ahora es **privada**.`);
}

// ── CONFIGURACIÓN DE ADMIN ────────────────────────────────────
async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Rol de verificado configurado: ${role}`);
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
  ctx.reply(`✅ Vinculación creada:\nGrupo Roblox \`${groupId}\` con rango ≥ **${minRank}** → ${role}`);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return ctx.reply({ content: '❌ No hay vinculaciones configuradas.', ephemeral: true });
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Vinculación del grupo \`${groupId}\` eliminada.`);
}

async function cmdListRoles(ctx) {
  const config = await db.getGuildConf(ctx.guild.id);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Configuración de roles').setColor(userColor)
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
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage   = message || '¡Bienvenido {user}! Tu cuenta de Roblox **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Mensaje de bienvenida configurado en <#${channelId}>.`);
}

async function cmdSetAlertChannel(ctx, channelId) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Canal de alertas de presencia configurado: <#${channelId}>`);
}

async function cmdSetNickname(ctx, format) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageNicknames))
    return ctx.reply({ content: '❌ Necesitas **Gestionar Apodos**.', ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.nicknameFormat = format ?? null;
  await db.saveGuildConf(ctx.guild.id, config);
  if (format) ctx.reply(`✅ Auto-nickname activado: \`${format}\``);
  else ctx.reply('✅ Auto-nickname desactivado.');
}

async function cmdSetLang(ctx, lang) {
  if (!['es', 'en', 'pt'].includes(lang)) return ctx.reply({ content: '❌ Idiomas disponibles: `es` (Español), `en` (English), `pt` (Português)', ephemeral: true });
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.lang  = lang;
  await db.saveGuildConf(ctx.guild.id, config);
  const names = { es: '🇪🇸 Español', en: '🇺🇸 English', pt: '🇧🇷 Português' };
  ctx.reply(`✅ Idioma del bot cambiado a **${names[lang]}**.`);
}

async function cmdSetPrefix(ctx, prefix) {
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.ManageGuild))
    return ctx.reply({ content: t(await getGuildLang(ctx.guild.id), 'need_manage_guild'), ephemeral: true });
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.prefix = prefix;
  await db.saveGuildConf(ctx.guild.id, config);
  ctx.reply(`✅ Prefijo del servidor cambiado a \`${prefix}\``);
}

// ── AYUDA (color #1900ff, sin comandos owner para no-owner) ──
const HELP_CATEGORIES = {
  '🔐 Verificación': {
    description: 'Conecta tu cuenta de Roblox con Discord para acceder a todas las funciones del bot.',
    commands: [
      { name: '/captcha', desc: 'Completa la verificación anti-bot antes de usar /verificar.' },
      { name: '/verificar <usuario>', desc: 'Inicia el proceso de vinculación.' },
      { name: '/confirmar', desc: 'Confirma la verificación.' },
      { name: '/actualizar', desc: 'Re-sincroniza tus roles.' },
      { name: '/desvincular', desc: 'Desvincula tu cuenta.' },
    ],
  },
  '👤 Perfil e información': {
    description: 'Consulta información detallada de cuentas de Roblox.',
    commands: [
      { name: '/perfil [@usuario]', desc: 'Dashboard completo con estadísticas.' },
      { name: '/outfit [@usuario]', desc: 'Muestra la ropa actual del usuario.' },
      { name: '/rap [@usuario]', desc: 'Valor estimado RAP de sus limiteds.' },
      { name: '/avatar [@usuario]', desc: 'Avatar en tamaño grande.' },
      { name: '/estado [@usuario]', desc: 'Presencia en Roblox.' },
      { name: '/grupos [@usuario]', desc: 'Lista de grupos.' },
      { name: '/amigos [@usuario]', desc: 'Lista de amigos.' },
      { name: '/insignias [@usuario]', desc: 'Insignias recientes.' },
      { name: '/historial-nombres [@usuario]', desc: 'Nombres anteriores.' },
      { name: '/buscar <usuario>', desc: 'Busca usuario público.' },
      { name: '!whoislox <ID>', desc: 'Búsqueda por ID.' },
    ],
  },
  '⭐ Premium': {
    description: 'Funciones exclusivas para supporters.',
    commands: [
      { name: '/premium', desc: 'Estado y opciones de compra.' },
      { name: '/flex ⭐', desc: 'Tarjeta de perfil premium.' },
      { name: '/comparar @u1 @u2 ⭐', desc: 'Compara dos cuentas.' },
      { name: '/historial ⭐', desc: 'Historial de juegos.' },
      { name: '/mistats ⭐', desc: 'Estadísticas de juego.' },
      { name: '/addalt <usuario> ⭐', desc: 'Añadir cuenta alt.' },
      { name: '/alts ⭐', desc: 'Ver alts vinculadas.' },
      { name: '/setflexbg <url> ⭐', desc: 'Fondo personalizado para /flex.' },
      { name: '/syncall ⭐', desc: 'Sincronizar todos los roles.' },
      { name: '/buy', desc: 'Comprar Premium con PayPal (7 o 30 días).' },
    ],
  },
  '💰 Economía': {
    description: 'Sistema de puntos, rachas y minijuegos.',
    commands: [
      { name: '/daily', desc: 'Reclama puntos diarios.' },
      { name: '/puntos [@usuario]', desc: 'Ver puntos y racha.' },
      { name: '/logros [@usuario]', desc: 'Logros desbloqueados.' },
      { name: '/toplocal', desc: 'Top 10 del servidor.' },
      { name: '/topglobal', desc: 'Top 10 global.' },
      { name: '/tienda', desc: 'Ver tienda de puntos (30+ colores).' },
      { name: '/comprar <id>', desc: 'Comprar item de la tienda.' },
      { name: '/rob @usuario', desc: 'Intentar robar puntos.' },
      { name: '!pay @usuario <cantidad>', desc: 'Transferir puntos.' },
      { name: '!coinflip <cantidad>', desc: 'Apuesta cara o cruz.' },
      { name: '/trivia', desc: 'Responde trivia (5 pts, límite diario).' },
    ],
  },
  '🎮 Roblox y búsquedas': {
    description: 'Busca juegos, catálogo y estado.',
    commands: [
      { name: '/juego <nombre>', desc: 'Busca un juego.' },
      { name: '/catalogo <item>', desc: 'Busca items del catálogo.' },
      { name: '/murogrupo <ID>', desc: 'Muro de un grupo.' },
      { name: '/robloxstatus', desc: 'Estado de los servidores.' },
    ],
  },
  '🎯 Social': {
    description: 'Funciones para comunidad.',
    commands: [
      { name: '!lfg <juego> [slots]', desc: 'Crea grupo LFG.' },
      { name: '/sugerencia <texto>', desc: 'Envía una sugerencia.' },
    ],
  },
  '🔔 Alertas y privacidad': {
    description: 'Controla quién ve tu información.',
    commands: [
      { name: '🔔 Botón en /estado', desc: 'Activar alerta de presencia.' },
      { name: '!alertas ver', desc: 'Ver tus alertas activas.' },
      { name: '!alertas quitar @usuario', desc: 'Eliminar alerta.' },
      { name: '!permitir presencia|perfil', desc: 'Hacer público.' },
      { name: '!bloquear presencia|perfil', desc: 'Hacer privado.' },
      { name: '/dms', desc: 'Activar/desactivar mensajes directos del bot.' },
    ],
  },
  '🔍 Moderación': {
    description: 'Herramientas para staff.',
    commands: [
      { name: '/whois @usuario', desc: 'Ver vinculación Discord-Roblox.' },
    ],
  },
  '⚙️ Administración': {
    description: 'Configuración del servidor.',
    commands: [
      { name: '/setverifiedrole @rol', desc: 'Rol de verificado.' },
      { name: '/setpremiumrole @rol', desc: 'Rol Premium.' },
      { name: '/bindrole <grupo> <rango> @rol', desc: 'Vincular grupo a rol.' },
      { name: '/unbindrole <grupo>', desc: 'Eliminar vinculación.' },
      { name: '/listroles', desc: 'Ver configuración.' },
      { name: '/setwelcome #canal', desc: 'Mensaje de bienvenida.' },
      { name: '/setalertchannel #canal', desc: 'Canal de alertas.' },
      { name: '/setsuggestions #canal', desc: 'Canal de sugerencias.' },
      { name: '/setnickname formato', desc: 'Auto-nickname.' },
      { name: '/setlang es|en|pt', desc: 'Idioma del bot.' },
      { name: '/setprefix <prefijo>', desc: 'Prefijo para comandos de texto.' },
    ],
  },
  '👑 Owner': {
    description: 'Comandos exclusivos del dueño del bot.',
    commands: [
      { name: '/activarpremium <id> [días]', desc: 'Activar Premium manualmente.' },
      { name: '/desactivarpremium <id>', desc: 'Desactivar Premium.' },
      { name: '/encarcelar @usuario [horas]', desc: 'Encarcela a un usuario.' },
      { name: '/setpuntos @usuario <cantidad>', desc: 'Establece puntos.' },
      { name: '/addpuntos @usuario <cantidad>', desc: 'Añade puntos.' },
      { name: '/ownercolor <#HEX>', desc: 'Cambia el color de perfil del owner.' },
    ],
  },
};

async function cmdAyuda(ctx) {
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const filteredCategories = { ...HELP_CATEGORIES };
  if (!isOwner) delete filteredCategories['👑 Owner'];
  const categoryKeys = Object.keys(filteredCategories);
  
  const makeOverviewEmbed = () => new EmbedBuilder()
    .setTitle('📋 Ayuda — Bot Roblox v10.7')
    .setColor(0x1900ff)
    .setDescription('Selecciona una categoría del menú de abajo para ver los comandos y sus descripciones.\n\nTodos los comandos funcionan con `/` (slash), `!` o `?`.')
    .addFields(...categoryKeys.map(k => ({ name: k, value: filteredCategories[k].description, inline: false })))
    .setFooter({ text: `⭐ = requiere Premium · PayPal integrado · v10.7` });
  
  const makeCategoryEmbed = (key) => {
    const cat = filteredCategories[key];
    return new EmbedBuilder().setTitle(key).setColor(0x1900ff).setDescription(cat.description)
      .addFields(...cat.commands.map(c => ({ name: c.name, value: c.desc, inline: false })))
      .setFooter({ text: 'Usa el menú de abajo para cambiar de categoría' });
  };
  
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('📂 Selecciona una categoría...')
      .addOptions([
        { label: '🏠 Vista general', value: '__overview__', description: 'Ver resumen de todas las categorías' },
        ...categoryKeys.map(k => ({ label: k.slice(0, 25), value: k, description: filteredCategories[k].description.slice(0, 50) })),
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

// ── DM PERMISSIONS ───────────────────────────────────────────
async function cmdDMs(ctx, enable) {
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply({ content: '❌ No tienes cuenta vinculada.', ephemeral: true });
  const newStatus = enable ?? !(entry.allowDMs ?? true);
  entry.allowDMs = newStatus;
  await db.saveUser(ctx.userId, entry);
  ctx.reply({ content: `✅ Mensajes directos del bot **${newStatus ? 'activados' : 'desactivados'}**.`, ephemeral: true });
}

// ════════════════════════════════════════════════════════════
//  COMANDOS EXCLUSIVOS DEL DUEÑO (OWNER)
// ════════════════════════════════════════════════════════════

async function cmdEncarcelar(ctx, targetUser, horas = 1) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño del bot.', ephemeral: true });
  const until = new Date(Date.now() + horas * 3600000).toISOString();
  await redisSet(`jailed:${targetUser.id}`, { until, reason: 'owner_action' });
  
  const gifUrl = await getAnimeGif('handcuff');
  const embed = new EmbedBuilder()
    .setTitle('🔒 Usuario encarcelado')
    .setColor(0xED4245)
    .setDescription(`**${targetUser.username}** ha sido encarcelado por ${horas} hora(s).`);
  if (gifUrl) embed.setImage(gifUrl);
  
  ctx.reply({ embeds: [embed] });
}

async function cmdSetPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  if (cantidad < 0) return ctx.reply({ content: '❌ La cantidad no puede ser negativa.', ephemeral: true });
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0, totalEarned: 0 };
  eco.points = cantidad;
  await db.saveEconomy(targetUser.id, eco);
  ctx.reply(`✅ Puntos de **${targetUser.username}** establecidos a ${cantidad}.`);
}

async function cmdAddPuntos(ctx, targetUser, cantidad) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  const eco = await db.getEconomy(targetUser.id) ?? { points: 0, totalEarned: 0 };
  eco.points = (eco.points ?? 0) + cantidad;
  eco.totalEarned = (eco.totalEarned ?? 0) + cantidad;
  await db.saveEconomy(targetUser.id, eco);
  ctx.reply(`✅ Se añadieron ${cantidad} puntos a **${targetUser.username}**. Ahora tiene ${eco.points}.`);
}

async function cmdOwnerColor(ctx, hexColor) {
  if (ctx.userId !== process.env.BOT_OWNER_ID) return ctx.reply({ content: '❌ Solo el dueño.', ephemeral: true });
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ Sin cuenta vinculada.');
  if (!/^#[0-9A-F]{6}$/i.test(hexColor)) return ctx.reply('❌ Formato inválido. Usa #RRGGBB.');
  const colorInt = parseInt(hexColor.slice(1), 16);
  entry.profileColor = colorInt;
  await db.saveUser(ctx.userId, entry);
  ctx.reply(`✅ Color de perfil cambiado a ${hexColor}.`);
}

// ── COMPRA PREMIUM CON PAYPAL (reemplaza Ko-fi) ───────────────
async function cmdBuyPremium(ctx) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('buy_7d').setLabel('⭐ 7 días - $1.99').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('buy_30d').setLabel('💎 30 días - $4.99').setStyle(ButtonStyle.Danger),
  );

  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('🛒 Comprar Premium')
    .setColor(userColor)
    .setDescription('Selecciona el plan que deseas adquirir. Serás redirigido a PayPal para completar el pago de forma segura.');

  const msg = await ctx.replyAndFetch({ embeds: [embed], components: [row] });
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });

    let amount, itemName;
    if (i.customId === 'buy_7d') { amount = '1.99'; itemName = 'Premium 7 días'; }
    else { amount = '4.99'; itemName = 'Premium 30 días'; }

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:8080';
    const paypalUrl = `https://www.paypal.com/cgi-bin/webscr?` +
      `cmd=_xclick&business=${encodeURIComponent(process.env.PAYPAL_EMAIL)}` +
      `&item_name=${encodeURIComponent(itemName)}` +
      `&amount=${amount}` +
      `&currency_code=USD` +
      `&custom=${ctx.userId}` +
      `&notify_url=${encodeURIComponent(`${baseUrl}/paypal-webhook`)}` +
      `&return=${encodeURIComponent('https://discord.com/channels/@me')}` +
      `&cancel_return=${encodeURIComponent('https://discord.com/channels/@me')}`;

    const newEmbed = new EmbedBuilder()
      .setTitle(`🔗 Pago — ${itemName}`)
      .setColor(0x009CDE)
      .setDescription(`Haz clic en el botón para pagar **$${amount}** con PayPal.\nEl Premium se activará automáticamente.`)
      .setFooter({ text: 'Serás redirigido a PayPal' });

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('💳 Pagar con PayPal').setStyle(ButtonStyle.Link).setURL(paypalUrl)
    );

    await i.update({ embeds: [newEmbed], components: [linkRow] });
  });

  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ── Exportaciones ─────────────────────────────────────────────
module.exports = {
  // Verificación
  cmdCaptcha, cmdVerificar, cmdConfirmar,
  // Perfil
  cmdPerfil, cmdAvatar, cmdEstado, cmdGrupos, cmdAmigos, cmdInsignias,
  cmdHistorialNombres, cmdBuscar, cmdWhoisRoblox, cmdOutfit, cmdRAP,
  // Premium
  cmdPremiumStatus, cmdActivarPremium, cmdDesactivarPremium, cmdBuyPremium,
  cmdComparar, cmdFlex, cmdMiStats,
  cmdAddAlt, cmdAlts, cmdSetFlexBg,
  // Historial
  cmdHistorial,
  // Roblox y catálogo
  cmdJuego, cmdCatalogo, cmdMuroGrupo, cmdRobloxStatus,
  // LFG y Sugerencias
  cmdLFG, cmdSugerencia, cmdSetSuggestions,
  // Economía
  cmdPuntos, cmdDaily, cmdLogros, cmdCoinFlip, cmdPay, cmdRob,
  cmdTopLocal, cmdTopGlobal, cmdTienda, cmdComprar,
  // Trivia
  cmdTrivia,
  // Moderación
  cmdWhois, cmdSyncAll,
  // Alertas y privacidad
  cmdAlertas, cmdPermitir, cmdBloquear, cmdActualizar, cmdDesvincular, cmdDMs,
  // Configuración
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdSetWelcome, cmdSetAlertChannel, cmdSetNickname, cmdSetLang, cmdSetPrefix,
  cmdSetVoiceCategory,
  // Owner exclusivos
  cmdEncarcelar, cmdSetPuntos, cmdAddPuntos, cmdOwnerColor,
  // Ayuda
  cmdAyuda,
  // Utilidades exportadas para bot.js
  roblox, startPresenceMonitor, onMemberJoin, onGuildAdd,
  cooldowns,
};
