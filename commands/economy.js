// commands/economy.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits
} = require('discord.js');

const { t } = require('../i18n');
const { db, redisGet, redisSet, redisDel } = require('./utils/database');
const roblox = require('./utils/roblox');
const {
  isPremium,
  getGuildLang,
  getRank,
  progressBar,
  checkAchievements,
  isJailed,
  getAnimeGif
} = require('./utils/helpers');
const { ACHIEVEMENTS, SHOP_ITEMS } = require('./utils/constants');

// ──────────────────────────────────────────────────────────────
//  Consulta de puntos y daily
// ──────────────────────────────────────────────────────────────

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
    ).setFooter({ text: 'Gana puntos con /daily todos los días' })] });
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
  
  const gifUrl = await getAnimeGif('smile');
  if (gifUrl) embed.setImage(gifUrl);
  
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Logros
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
//  Juegos de azar: coinflip y pay
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
//  Robo (con encarcelamiento y fianza)
// ──────────────────────────────────────────────────────────────

async function cmdRob(ctx, targetUser) {
  if (!targetUser) return ctx.reply({ content: '❌ Menciona a un usuario.', ephemeral: true });
  if (targetUser.id === ctx.userId) return ctx.reply({ content: '❌ No puedes robarte a ti mismo.', ephemeral: true });
  
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

  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const success = isOwner ? true : (Math.random() < 0.4);
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
    
    const user = await db.getUser(ctx.userId);
    await checkAchievements(ctx.userId, eco, user);
  }
}

// ──────────────────────────────────────────────────────────────
//  Rankings (local y global)
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
//  Tienda y compras
// ──────────────────────────────────────────────────────────────

async function cmdTienda(ctx) {
  const userEntry = await db.getUser(ctx.userId);
  const inventory = userEntry?.inventory ?? [];
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const userColor = userEntry?.profileColor || 0x1900ff;
  const embed = new EmbedBuilder()
    .setTitle('🛒 Tienda de Puntos')
    .setColor(userColor)
    .setDescription(
      SHOP_ITEMS.map(item => {
        const owned = inventory.includes(item.id) || isOwner;
        const status = owned ? '✅' : '🔒';
        return `${status} **${item.name}** — \`${item.cost}\` pts\nID: \`${item.id}\``;
      }).join('\n\n')
    )
    .setFooter({ text: 'Usa /comprar <id> para adquirir. ✅ = Ya desbloqueado' });
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
  
  const user = await db.getUser(ctx.userId);
  await checkAchievements(ctx.userId, eco, user);
  
  ctx.reply({ content: isOwner ? `👑 Como dueño, recibiste **${item.name}** gratis.` : `✅ Compraste **${item.name}** por ${item.cost} puntos.`, ephemeral: true });
}

module.exports = {
  cmdPuntos,
  cmdDaily,
  cmdLogros,
  cmdCoinFlip,
  cmdPay,
  cmdRob,
  cmdTopLocal,
  cmdTopGlobal,
  cmdTienda,
  cmdComprar
};
