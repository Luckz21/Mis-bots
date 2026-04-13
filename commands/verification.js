// commands/verification.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');

const { sanitizeUsername } = require('../security');
const { db, redisGet, redisSet } = require('./utils/database');
const roblox = require('./utils/roblox');
const { getGuildLang, checkAchievements, syncRoles } = require('./utils/helpers');
const { t } = require('./utils/translate');

const pendingVerifications = {};
const pendingCaptchas = new Set();

function generateCode() {
  return 'RBX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
}

// Helper para enviar respuestas con embed
async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  Comandos públicos
// ──────────────────────────────────────────────────────────────

async function cmdCaptcha(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('captcha_verify').setLabel('✅ Soy humano').setStyle(ButtonStyle.Success),
  );
  const title = await t(lang, 'captcha_title');
  const desc = await t(lang, 'captcha_desc');
  const msg = await ctx.replyAndFetch({
    embeds: [new EmbedBuilder().setTitle(title).setColor(0x1900ff).setDescription(desc)],
    components: [row]
  });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: '❌ Solo quien ejecutó el comando.', ephemeral: true });
    pendingCaptchas.add(ctx.userId);
    const successTitle = await t(lang, 'captcha_success_title');
    const successDesc = await t(lang, 'captcha_success');
    await i.update({
      embeds: [new EmbedBuilder().setTitle(successTitle).setColor(0x57F287).setDescription(successDesc)],
      components: []
    });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

async function cmdVerificar(ctx, robloxUsername) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!pendingCaptchas.has(ctx.userId)) {
    return replyEmbed(ctx, 'error', 'captcha_required', 0xED4245, true);
  }
  pendingCaptchas.delete(ctx.userId);
  const clean = sanitizeUsername(robloxUsername);
  if (!clean) return replyEmbed(ctx, 'error', 'invalid_username', 0xED4245, true);
  const existing = await db.getUser(ctx.userId);
  if (existing) {
    return replyEmbed(ctx, 'error', 'verify_already', 0xED4245, true, [existing.robloxUsername]);
  }
  const robloxUser = await roblox.getUserByName(clean);
  if (!robloxUser) return replyEmbed(ctx, 'error', 'verify_not_found', 0xED4245, true);
  const code = generateCode();
  pendingVerifications[ctx.userId] = { robloxId: robloxUser.id, robloxUsername: robloxUser.name, code };
  
  const title = await t(lang, 'verify_title');
  const step1 = await t(lang, 'verify_step1');
  const step2 = await t(lang, 'verify_step2');
  const step3 = await t(lang, 'verify_step3');
  const time = await t(lang, 'verify_time');
  
  ctx.reply({
    embeds: [new EmbedBuilder()
      .setTitle(title)
      .setColor(0x1900ff)
      .setDescription(`${step1}\n${step2}\n\`\`\`${code}\`\`\`\n${step3}\n\n${time}`)
      .addFields(
        { name: '👤 Usuario', value: `**${robloxUser.name}**`, inline: true },
        { name: '🆔 ID',      value: `\`${robloxUser.id}\``,  inline: true },
      )
      .setFooter({ text: 'El código solo verifica que eres el dueño de la cuenta' })
    ],
    ephemeral: true
  });
  setTimeout(() => { if (pendingVerifications[ctx.userId]?.code === code) delete pendingVerifications[ctx.userId]; }, 600000);
}

async function cmdConfirmar(ctx) {
  const lang    = await getGuildLang(ctx.guild?.id);
  const pending = pendingVerifications[ctx.userId];
  if (!pending) return replyEmbed(ctx, 'error', 'confirm_no_pending', 0xED4245, true);
  const profile = await roblox.getProfile(pending.robloxId);
  if (!profile) return replyEmbed(ctx, 'error', 'confirm_no_profile', 0xED4245, true);
  if (!(profile.description ?? '').includes(pending.code)) {
    return replyEmbed(ctx, 'error', 'confirm_code_fail', 0xED4245, true, [pending.code, pending.robloxUsername]);
  }
  await db.saveUser(ctx.userId, {
    robloxId: pending.robloxId, robloxUsername: pending.robloxUsername,
    verifiedAt: new Date().toISOString(), privacyPresence: false, privacyProfile: true,
    allowDMs: true,
  });
  const eco = await db.getEconomy(ctx.userId) ?? { points: 0 };
  const user = await db.getUser(ctx.userId);
  const newAchs = await checkAchievements(ctx.userId, eco, user);
  delete pendingVerifications[ctx.userId];
  await syncRoles(ctx.guild, ctx.userId, pending.robloxId);

  const createdProfile = await roblox.getProfile(pending.robloxId);
  if (createdProfile?.created) {
    const config = await db.getGuildConf(ctx.guild.id);
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
    if (ch) {
      const welcomeMsg = config.welcomeMessage || '¡Bienvenido {user}! Tu cuenta **{roblox}** fue verificada. 🎉';
      ch.send(welcomeMsg.replace('{user}', `<@${ctx.userId}>`).replace('{roblox}', pending.robloxUsername)).catch(() => {});
    }
  }
  const avatarUrl = await roblox.getAvatar(pending.robloxId);
  const title = await t(lang, 'verify_success_title');
  const desc = await t(lang, 'confirm_success', pending.robloxUsername);
  const embed = new EmbedBuilder().setTitle(title).setColor(0x57F287)
    .setThumbnail(avatarUrl)
    .setDescription(desc)
    .addFields(
      { name: await t(lang, 'profile_visibility'), value: await t(lang, 'visible_yes'), inline: true },
      { name: await t(lang, 'presence_visibility'), value: await t(lang, 'private_default'), inline: true },
    )
    .setFooter({ text: await t(lang, 'delete_code_footer') });
  if (newAchs.length) embed.addFields({ name: await t(lang, 'new_achievements'), value: newAchs.map(a => `**${a.name}**`).join(', ') });
  ctx.reply({ embeds: [embed] });
}

async function cmdActualizar(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  await syncRoles(ctx.guild, ctx.userId, entry.robloxId);
  replyEmbed(ctx, 'success', 'roles_updated', 0x57F287, true);
}

async function cmdDesvincular(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const entry = await db.getUser(ctx.userId);
  if (!entry) return replyEmbed(ctx, 'error', 'no_linked_account', 0xED4245, true);
  await db.deleteUser(ctx.userId);
  replyEmbed(ctx, 'success', 'unlinked_success', 0x57F287, true, [entry.robloxUsername]);
}

module.exports = {
  cmdCaptcha,
  cmdVerificar,
  cmdConfirmar,
  cmdActualizar,
  cmdDesvincular
};
