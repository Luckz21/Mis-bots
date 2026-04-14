// commands/admin.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('./utils/database');
const { getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

async function cmdSetVerifiedRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.verifiedRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setverifiedrole', 0x57F287, false, [role.toString()]);
}

async function cmdSetPremiumRole(ctx, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.premiumRoleId = role.id;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setpremiumrole', 0x57F287, false, [role.toString()]);
}

async function cmdBindRole(ctx, groupId, minRank, role) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  if (!config.bindings) config.bindings = [];
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  config.bindings.push({ groupId: String(groupId), minRank: Number(minRank), roleId: role.id });
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_bindrole', 0x57F287, false, [groupId, minRank, role.toString()]);
}

async function cmdUnbindRole(ctx, groupId) {
  const config = await db.getGuildConf(ctx.guild.id);
  if (!config?.bindings?.length) return replyEmbed(ctx, 'error', 'admin_no_bindings', 0xED4245, true);
  config.bindings = config.bindings.filter(b => String(b.groupId) !== String(groupId));
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_unbindrole', 0x57F287, false, [groupId]);
}

async function cmdListRoles(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const config = await db.getGuildConf(ctx.guild.id);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  
  const verifiedRoleText = await t(lang, 'verified_role');
  const premiumRoleText = await t(lang, 'premium_role');
  const groupBindingsText = await t(lang, 'group_bindings');
  const nicknameFormatText = await t(lang, 'nickname_format');
  const botLanguageText = await t(lang, 'bot_language');
  const notConfiguredText = await t(lang, 'not_configured');
  const noBindingsText = await t(lang, 'no_bindings');
  const disabledText = await t(lang, 'disabled');
  const footerText = await t(lang, 'admin_listroles_footer');
  
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'admin_listroles_title'))
    .setColor(userColor)
    .addFields(
      { name: `✅ ${verifiedRoleText}`, value: config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '_' + notConfiguredText + '_' },
      { name: `⭐ ${premiumRoleText}`, value: config?.premiumRoleId ? `<@&${config.premiumRoleId}>` : '_' + notConfiguredText + '_' },
      { name: `🏰 ${groupBindingsText}`, value: config?.bindings?.length ? config.bindings.map(b => `• \`${b.groupId}\` ≥ ${b.minRank} → <@&${b.roleId}>`).join('\n') : '_' + noBindingsText + '_' },
      { name: `🔤 ${nicknameFormatText}`, value: config?.nicknameFormat ? `\`${config.nicknameFormat}\`` : '_' + disabledText + '_' },
      { name: `🌐 ${botLanguageText}`, value: config?.lang ? `\`${config.lang}\`` : '`es`' },
    )
    .setFooter({ text: footerText });
  ctx.reply({ embeds: [embed] });
}

async function cmdSetWelcome(ctx, channelId, message) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.welcomeChannelId = channelId;
  config.welcomeMessage = message || '¡Bienvenido {user}! Tu cuenta de Roblox **{roblox}** ha sido verificada. 🎉';
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setwelcome', 0x57F287, false, [channelId]);
}

async function cmdSetAlertChannel(ctx, channelId) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.alertChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setalertchannel', 0x57F287, false, [channelId]);
}

async function cmdSetSuggestions(ctx, channelId) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.suggestionChannelId = channelId;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setsuggestions', 0x57F287, false, [channelId]);
}

async function cmdSetNickname(ctx, format) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.nicknameFormat = format ?? null;
  await db.saveGuildConf(ctx.guild.id, config);
  if (format) replyEmbed(ctx, 'success', 'admin_setnickname', 0x57F287, false, [format]);
  else replyEmbed(ctx, 'success', 'admin_setnickname_off', 0x57F287);
}

async function cmdSetLang(ctx, lang) {
  if (!['es', 'en', 'pt'].includes(lang)) return replyEmbed(ctx, 'error', 'invalid_language', 0xED4245, true);
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.lang = lang;
  await db.saveGuildConf(ctx.guild.id, config);
  const names = { es: '🇪🇸 Español', en: '🇺🇸 English', pt: '🇧🇷 Português' };
  replyEmbed(ctx, 'success', 'admin_setlang', 0x57F287, false, [names[lang]]);
}

async function cmdSetPrefix(ctx, prefix) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.prefix = prefix;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setprefix', 0x57F287, false, [prefix]);
}

async function cmdSetVoiceCategory(ctx, categoryId) {
  const config = await db.getGuildConf(ctx.guild.id) ?? {};
  config.voiceCategoryId = categoryId;
  await db.saveGuildConf(ctx.guild.id, config);
  replyEmbed(ctx, 'success', 'admin_setvoicecategory', 0x57F287);
}

module.exports = {
  cmdSetVerifiedRole, cmdSetPremiumRole, cmdBindRole, cmdUnbindRole, cmdListRoles,
  cmdSetWelcome, cmdSetAlertChannel, cmdSetSuggestions, cmdSetNickname, cmdSetLang, cmdSetPrefix, cmdSetVoiceCategory
};
