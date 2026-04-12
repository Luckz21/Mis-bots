// commands/utils/helpers.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { db, redisGet, redisSet, redisDel } = require('./database');
const roblox = require('./roblox');
const { RANKS, ACHIEVEMENTS, SHOP_ITEMS } = require('./constants');
const { t } = require('../../i18n');

// ── Premium ──────────────────────────────────────────────────
async function isPremium(discordId) {
  const data = await db.getPremium(discordId);
  if (!data) return false;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
  return true;
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

// ── Idioma del servidor ──────────────────────────────────────
async function getGuildLang(guildId) {
  if (!guildId) return 'es';
  try {
    const config = await db.getGuildConf(guildId);
    return config?.lang ?? 'es';
  } catch { return 'es'; }
}

// ── Barra de progreso ────────────────────────────────────────
function progressBar(current, max, size = 10) {
  const filled = Math.min(Math.round((current / max) * size), size);
  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

// ── Rangos ───────────────────────────────────────────────────
function getRank(points) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

// ── Logros (checkAchievements) ───────────────────────────────
async function checkAchievements(discordId, eco, user) {
  if (discordId === process.env.BOT_OWNER_ID) {
    const allAchievements = ACHIEVEMENTS.map(a => a.id);
    eco.achievements = allAchievements;
    await db.saveEconomy(discordId, eco);
    return [];
  }

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
    if (ach.id === 'owner_exclusive') continue;
    if (!achieved.includes(ach.id) && conditions[ach.id]?.()) {
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

// ── Sincronización de roles ──────────────────────────────────
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

// ── Paginación ───────────────────────────────────────────────
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

// ── Alertas (filtro por período) ─────────────────────────────
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

// ── Encarcelamiento ──────────────────────────────────────────
async function isJailed(userId) {
  const jailed = await redisGet(`jailed:${userId}`);
  if (!jailed) return false;
  return new Date(jailed.until) > new Date();
}

// ── Historial de juegos ──────────────────────────────────────
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

// ── Exportaciones ─────────────────────────────────────────────
module.exports = {
  isPremium,
  premiumEmbed,
  getGuildLang,
  progressBar,
  getRank,
  checkAchievements,
  syncRoles,
  paginate,
  filterAlertsByResetPeriod,  // <-- IMPORTANTE
  isJailed,                   // <-- IMPORTANTE
  recordGameHistory,
  getAnimeGif
};
