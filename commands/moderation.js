// commands/moderation.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('./utils/database');
const roblox = require('./utils/roblox');
const { isPremium, syncRoles, getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

async function cmdWhois(ctx, targetUser) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!targetUser) return replyEmbed(ctx, 'error', 'mention_user', 0xED4245, true);
  const entry = await db.getUser(targetUser.id);
  if (!entry) return replyEmbed(ctx, 'error', 'no_account', 0xED4245, true, [targetUser.username]);
  const [premium, avatarUrl] = await Promise.all([isPremium(targetUser.id), roblox.getAvatar(entry.robloxId)]);
  const userColor = entry.profileColor || 0x1900ff;
  
  const robloxAccountText = await t(lang, 'roblox_account');
  const robloxIdText = await t(lang, 'roblox_id');
  const yesText = await t(lang, 'yes');
  const noText = await t(lang, 'no');
  const verifiedOnText = await t(lang, 'verified_on');
  const whoisFooterText = await t(lang, 'whois_footer');
  
  const embed = new EmbedBuilder()
    .setTitle(await t(lang, 'whois_title', targetUser.username))
    .setColor(userColor).setThumbnail(avatarUrl)
    .addFields(
      { name: '🎮 ' + robloxAccountText, value: `[${entry.robloxUsername}](https://www.roblox.com/users/${entry.robloxId}/profile)`, inline: true },
      { name: '🆔 ' + robloxIdText, value: `\`${entry.robloxId}\``, inline: true },
      { name: '⭐ Premium', value: premium ? yesText : noText, inline: true },
      { name: '📅 ' + verifiedOnText, value: new Date(entry.verifiedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }), inline: true },
    )
    .setFooter({ text: whoisFooterText });
  ctx.reply({ embeds: [embed] });
}

async function cmdSyncAll(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!ctx.guild.members.cache.get(ctx.userId)?.permissions.has(PermissionFlagsBits.Administrator)) {
    return replyEmbed(ctx, 'error', 'need_admin', 0xED4245, true);
  }
  if (!ctx.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return replyEmbed(ctx, 'error', 'bot_need_manage_roles', 0xED4245, true);
  
  await ctx.reply({ content: await t(lang, 'syncall_start'), ephemeral: true });
  const members = await ctx.guild.members.fetch();
  let count = 0;
  for (const [id] of members) {
    const entry = await db.getUser(id);
    if (entry) { await syncRoles(ctx.guild, id, entry.robloxId); count++; }
  }
  ctx.reply({ content: await t(lang, 'syncall_done', count), ephemeral: true });
}

module.exports = { cmdWhois, cmdSyncAll };
