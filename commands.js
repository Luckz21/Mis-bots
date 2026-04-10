// ============================================================
//  commands.js  —  v9.0 (Economy & Gamification Update)
// ============================================================

const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('./database');
const roblox = require('./roblox');

// --- SISTEMA ANTI-SPAM (COOLDOWNS) V9 ---
const cooldowns = new Map();
function isOnCooldown(userId) {
  const now = Date.now();
  if (cooldowns.has(userId)) {
    const expirationTime = cooldowns.get(userId) + 3000; // 3 segundos de cooldown
    if (now < expirationTime) return true;
  }
  cooldowns.set(userId, now);
  setTimeout(() => cooldowns.delete(userId), 3000);
  return false;
}

// --- HELPERS EXISTENTES ---
const pendingVerifications = {};
const presenceCache = {};

function generateCode() { return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase(); }

async function isPremium(discordId) {
  if (discordId === process.env.BOT_OWNER_ID) return true;
  const data = await db.getPremium(discordId);
  if (!data) return false;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
  return true;
}

function premiumEmbed(ctx) {
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Función exclusiva Premium').setColor(0xFFD700).setDescription('Esta función requiere Premium. Usa `/premium` para más info.')] });
}

async function recordGameHistory(discordId, gameName, placeId) {
  if (!gameName) return;
  const history = await db.getHistory(discordId) ?? [];
  if (history.length > 0 && history[0].gameName === gameName) return;
  history.unshift({ gameName, placeId, playedAt: new Date().toISOString() });
  if (history.length > 20) history.splice(20);
  await db.saveHistory(discordId, history);
}

// --- AUTO-SYNC ON JOIN (V9) ---
async function autoSyncOnJoin(member) {
  const entry = await db.getUser(member.id);
  if (!entry) return; // No está verificado globalmente
  await syncRoles(member.guild, member.id, entry.robloxId);
  // Auto-Nickname
  if (member.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    member.setNickname(entry.robloxUsername).catch(()=>{});
  }
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
  for (const roleId of rolesToAdd) await member.roles.add(roleId).catch(()=>{});
}

// ════════════════════════════════════════════════════════════
//  NUEVA ECONOMÍA V9 (Rachas, Minijuegos, Transferencias)
// ════════════════════════════════════════════════════════════

async function cmdDaily(ctx) {
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0, lastDaily: null, streak: 0, totalEarned: 0 };
  const now = new Date();
  const last = eco.lastDaily ? new Date(eco.lastDaily) : null;
  
  if (last && now - last < 86400000) {
    const hrs = Math.floor(((last.getTime() + 86400000) - now) / 3600000);
    const mins = Math.floor((((last.getTime() + 86400000) - now) % 3600000) / 60000);
    return ctx.reply(`⏰ Ya reclamaste tu daily. Vuelve en **${hrs}h ${mins}m**.`);
  }

  // Lógica de Rachas (Streaks)
  if (last && now - last > 172800000) eco.streak = 0; // Se pierde la racha si pasan más de 48h
  eco.streak = (eco.streak ?? 0) + 1;

  const baseReward = 50 + Math.floor(Math.random() * 50);
  const streakBonus = Math.min(eco.streak * 10, 200); // Max 200 puntos extra por racha
  const premiumBonus = await isPremium(ctx.userId) ? 2 : 1;
  
  const totalReward = (baseReward + streakBonus) * premiumBonus;
  
  eco.points = (eco.points ?? 0) + totalReward;
  eco.lastDaily = now.toISOString();
  eco.totalEarned = (eco.totalEarned ?? 0) + totalReward;
  
  await db.saveEconomy(ctx.userId, eco);
  
  const embed = new EmbedBuilder()
    .setTitle('🎁 ¡Recompensa Diaria!')
    .setColor(0x57F287)
    .setDescription(`Ganaste **${totalReward} puntos**.\n🔥 Racha actual: **${eco.streak} días** (+${streakBonus})\n${premiumBonus === 2 ? '⭐ ¡Bonus Premium x2 aplicado!' : ''}\n\n💰 Balance total: **${eco.points}**`)
  ctx.reply({ embeds: [embed] });
}

async function cmdCoinflip(ctx, apuesta, eleccion) {
  if (!apuesta || apuesta <= 0 || isNaN(apuesta)) return ctx.reply('❌ Ingresa una apuesta válida.');
  if (eleccion !== 'cara' && eleccion !== 'cruz') return ctx.reply('❌ Debes elegir `cara` o `cruz`.');
  
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (eco.points < apuesta) return ctx.reply(`❌ No tienes suficientes puntos. Tu balance: **${eco.points}**`);

  const resultado = Math.random() < 0.5 ? 'cara' : 'cruz';
  const gano = eleccion === resultado;

  if (gano) {
    eco.points += apuesta; // Gana el doble de lo que apostó (recupera + ganancia)
  } else {
    eco.points -= apuesta; // Pierde la apuesta
  }
  
  await db.saveEconomy(ctx.userId, eco);

  const embed = new EmbedBuilder()
    .setTitle('🪙 Cara o Cruz')
    .setColor(gano ? 0x57F287 : 0xED4245)
    .setDescription(`Elegiste **${eleccion}** y la moneda cayó en **${resultado}**.\n\n${gano ? `🎉 ¡Ganaste **${apuesta}** puntos!` : `💀 Perdiste **${apuesta}** puntos.`}\n💰 Nuevo balance: **${eco.points}**`);
  ctx.reply({ embeds: [embed] });
}

async function cmdPay(ctx, targetUser, cantidad) {
  if (!targetUser || !cantidad || cantidad <= 0) return ctx.reply('❌ Uso: `/pay @usuario <cantidad>`');
  if (targetUser.id === ctx.userId) return ctx.reply('❌ No puedes pagarte a ti mismo.');

  const senderEco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (senderEco.points < cantidad) return ctx.reply(`❌ Fondos insuficientes. Tienes **${senderEco.points}** puntos.`);

  const receiverEco = await db.getEconomy(targetUser.id) ?? { points: 0 };

  senderEco.points -= cantidad;
  receiverEco.points += cantidad;

  await db.saveEconomy(ctx.userId, senderEco);
  await db.saveEconomy(targetUser.id, receiverEco);

  ctx.reply(`💸 Has transferido **${cantidad} puntos** a **${targetUser.username}**.`);
}

async function cmdRob(ctx, targetUser) {
  if (!targetUser || targetUser.id === ctx.userId) return ctx.reply('❌ Menciona a otra persona para robar.');
  
  const robberEco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  if (robberEco.points < 100) return ctx.reply('❌ Necesitas al menos 100 puntos para intentar robar (para pagar la fianza si te atrapan).');

  const victimEco = await db.getEconomy(targetUser.id) ?? { points: 0 };
  if (victimEco.points < 50) return ctx.reply('❌ Esa persona es muy pobre. No vale la pena.');

  const success = Math.random() < 0.4; // 40% chance de éxito

  if (success) {
    const stolen = Math.floor(Math.random() * (victimEco.points * 0.2)); // Roba hasta el 20%
    robberEco.points += stolen;
    victimEco.points -= stolen;
    await db.saveEconomy(ctx.userId, robberEco);
    await db.saveEconomy(targetUser.id, victimEco);
    ctx.reply(`🥷 **¡Robo Exitoso!** Le quitaste **${stolen} puntos** a ${targetUser.username}.`);
  } else {
    const fine = 100;
    robberEco.points -= fine;
    await db.saveEconomy(ctx.userId, robberEco);
    ctx.reply(`🚓 **¡Atrapado!** La policía te pilló robando a ${targetUser.username}. Pagas una multa de **${fine} puntos**.`);
  }
}

async function cmdPuntos(ctx, targetUser) {
  const target = targetUser ?? { id: ctx.userId, username: ctx.username };
  const eco = await db.getEconomy(target.id) ?? { points: 0, streak: 0 };
  ctx.reply({ embeds: [new EmbedBuilder().setTitle(`💰 Billetera de ${target.username ?? ctx.username}`).setColor(0xFFD700).addFields({ name: 'Puntos', value: `**${eco.points}**`, inline: true }, { name: '🔥 Racha Daily', value: `${eco.streak ?? 0} días`, inline: true })] });
}

// ════════════════════════════════════════════════════════════
//  VERIFICACIÓN & CORE (Con Auto-Nickname)
// ════════════════════════════════════════════════════════════

async function cmdVerificar(ctx, robloxUsername) {
  if (!robloxUsername) return ctx.reply('❌ Uso: `/verificar <usuario>`');
  const existing = await db.getUser(ctx.userId);
  if (existing) return ctx.reply(`✅ Ya tienes cuenta vinculada: **${existing.robloxUsername}**`);
  const robloxUser = await roblox.getUserByName(robloxUsername);
  if (!robloxUser) return ctx.reply('❌ No encontré ese usuario en Roblox.');
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  const embed = new EmbedBuilder().setTitle('🔐 Verificación').setColor(0xFFAA00)
    .setDescription(`Pon este código en tu descripción de Roblox:\n\n\`\`\`${code}\`\`\`\n\nLuego usa \`/confirmar\`. Tienes 10 minutos.`);
  ctx.reply({ embeds: [embed] });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx, memberObj) {
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return ctx.reply('❌ No tienes verificación pendiente.');
  const profile = await roblox.getProfile(pending.robloxId);
  if (!(profile?.description ?? '').includes(pending.code)) return ctx.reply('❌ Código no encontrado en tu descripción de Roblox.');
  
  await db.saveUser(ctx.userId, { robloxId: pending.robloxId, robloxUsername: pending.robloxUsername, verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true });
  delete pendingVerifications[ctx.userId];
  
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);
  
  // V9 Auto-Nickname
  if (memberObj && memberObj.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    memberObj.setNickname(pending.robloxUsername).catch(()=>{});
  }

  ctx.reply({ embeds: [new EmbedBuilder().setTitle('✅ ¡Verificado!').setColor(0x57F287).setDescription(`Vinculado a **${pending.robloxUsername}**.`)] });
}

// ════════════════════════════════════════════════════════════
//  Resto de tus comandos intactos (resumidos aquí para el copy-paste)
// ════════════════════════════════════════════════════════════
async function cmdPerfil(ctx, t) { /* Lógica de V8 */ }
async function cmdEstado(ctx, t) { /* Lógica de V8 */ }
async function cmdActualizar(ctx, memberObj) { 
  const entry = await db.getUser(ctx.userId);
  if (!entry) return ctx.reply('❌ No vinculado.');
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  if (memberObj && memberObj.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) memberObj.setNickname(entry.robloxUsername).catch(()=>{});
  ctx.reply('✅ Roles y apodo actualizados.');
}
async function cmdAyuda(ctx) {
  ctx.reply({ embeds: [new EmbedBuilder().setTitle('📋 Comandos V9').setColor(0x5865F2).addFields(
    { name: '🔐 Core', value: '`/verificar` `/confirmar` `/actualizar`' },
    { name: '💰 Economía', value: '`/daily` `/puntos` `/pay` `/coinflip` `/rob`' },
    { name: '⭐ Premium', value: '`/premium` `/flex` `/historial`' }
  )] });
}
//... (Asegúrate de mantener tus funciones originales de cmdFlex, cmdAmigos, etc. No las borres, solo añade las de arriba).

// EXPORTACIONES V9
module.exports = {
  isOnCooldown, autoSyncOnJoin,
  cmdVerificar, cmdConfirmar, cmdActualizar,
  cmdDaily, cmdPuntos, cmdCoinflip, cmdPay, cmdRob,
  cmdPerfil, cmdEstado, cmdAyuda, /* ...resto de exports... */
};
    
