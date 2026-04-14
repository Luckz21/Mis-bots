// commands/robloxCommands.js
const { EmbedBuilder } = require('discord.js');
const { sanitizeText } = require('../security');
const { db } = require('./utils/database');
const roblox = require('./utils/roblox');
const { paginate, getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');

async function replyEmbed(ctx, titleKey, descKey, color = 0x1900ff, ephemeral = false, args = []) {
  const lang = await getGuildLang(ctx.guild?.id);
  const title = await t(lang, titleKey, ...args);
  const description = await t(lang, descKey, ...args);
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  return ctx.reply({ embeds: [embed], ephemeral });
}

// ──────────────────────────────────────────────────────────────
//  Catálogo
// ──────────────────────────────────────────────────────────────

async function cmdCatalogo(ctx, query) {
  const lang = await getGuildLang(ctx.guild?.id);
  const clean = sanitizeText(query, 100);
  if (!clean) return replyEmbed(ctx, 'error', 'invalid_search', 0xED4245, true);
  const items = await roblox.searchCatalog(clean);
  if (!items.length) return replyEmbed(ctx, 'error', 'catalog_not_found', 0xED4245, true);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  
  const idText = await t(lang, 'id');
  const typeText = await t(lang, 'type');
  const priceText = await t(lang, 'price');
  const creatorText = await t(lang, 'creator');
  const freeText = await t(lang, 'free_or_unavailable');
  const unknownText = await t(lang, 'unknown');
  
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
      { name: `🆔 ${idText}`, value: `\`${item.id}\``, inline: true },
      { name: `📦 ${typeText}`, value: item.itemType ?? unknownText, inline: true },
      { name: `💰 ${priceText}`, value: details?.PriceInRobux ? `R$ ${details.PriceInRobux}` : freeText, inline: true },
      { name: `👤 ${creatorText}`, value: details?.Creator?.Name ?? unknownText, inline: true },
    );
    pages.push(embed);
  }
  await paginate(ctx, pages);
}

// ──────────────────────────────────────────────────────────────
//  Muro de grupo
// ──────────────────────────────────────────────────────────────

async function cmdMuroGrupo(ctx, groupId) {
  const lang = await getGuildLang(ctx.guild?.id);
  if (!groupId || isNaN(groupId)) return replyEmbed(ctx, 'error', 'invalid_group_id', 0xED4245, true);
  const [groupInfo, posts] = await Promise.all([
    roblox.getGroupInfo(groupId),
    roblox.getGroupWall(groupId),
  ]);
  if (!groupInfo) return replyEmbed(ctx, 'error', 'group_not_found', 0xED4245, true);
  if (!posts.length) return ctx.reply(`El muro del grupo **${groupInfo.name}** está vacío o es privado.`);
  const userEntry = await db.getUser(ctx.userId);
  const userColor = userEntry?.profileColor || 0x1900ff;
  
  const membersText = await t(lang, 'members');
  const unknownText = await t(lang, 'unknown');
  const footerText = await t(lang, 'last_wall_posts');
  
  const embed = new EmbedBuilder()
    .setTitle(`📋 Muro de ${groupInfo.name}`)
    .setURL(`https://www.roblox.com/groups/${groupId}`)
    .setColor(userColor)
    .setDescription(
      posts.map((p, i) => {
        const author = p.poster?.user?.username ?? unknownText;
        const date = new Date(p.created).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        const body = p.body?.slice(0, 150) ?? '';
        return `**${i + 1}. ${author}** · ${date}\n${body}`;
      }).join('\n\n')
    )
    .addFields({ name: `👥 ${membersText}`, value: `${groupInfo.memberCount ?? '?'}`, inline: true })
    .setFooter({ text: footerText });
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Estado de Roblox
// ──────────────────────────────────────────────────────────────

async function cmdRobloxStatus(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const status = await roblox.getRobloxStatus();
  if (!status) return replyEmbed(ctx, 'error', 'status_unavailable', 0xED4245, true);
  
  const overall = status.status?.description ?? await t(lang, 'unknown');
  const indicator = status.status?.indicator;
  const colorMap = { none: 0x57F287, minor: 0xFEE75C, major: 0xED4245, critical: 0xED4245 };
  const emojiMap = { none: '✅', minor: '⚠️', major: '❌', critical: '🔴' };
  const components = (status.components ?? []).filter(c => !c.group).slice(0, 8);
  const compStatus = {
    operational: '✅ Operacional',
    degraded_performance: '⚠️ Degradado',
    partial_outage: '⚠️ Interrupción parcial',
    major_outage: '❌ Interrupción mayor',
    under_maintenance: '🔧 En mantenimiento'
  };
  const sourceText = await t(lang, 'source');
  
  const embed = new EmbedBuilder()
    .setTitle(`${emojiMap[indicator] ?? '❓'} Estado de Roblox`)
    .setURL('https://status.roblox.com')
    .setColor(colorMap[indicator] ?? 0x99AAB5)
    .setDescription(`**Estado general:** ${overall}`)
    .setTimestamp();
  
  if (components.length) {
    embed.addFields({ name: '🖥️ Servicios', value: components.map(c => `${compStatus[c.status] ?? '❓'} **${c.name}**`).join('\n') });
  }
  
  const incidents = (status.incidents ?? []).slice(0, 3);
  if (incidents.length) {
    embed.addFields({ name: '⚠️ Incidentes activos', value: incidents.map(i => `**${i.name}** — ${i.status}`).join('\n') });
  }
  
  embed.addFields({ name: '🔗 Enlace directo', value: '[Ver estado en tiempo real](https://status.roblox.com)' });
  embed.setFooter({ text: `${sourceText}: status.roblox.com` });
  
  ctx.reply({ embeds: [embed] });
}

module.exports = {
  cmdCatalogo,
  cmdMuroGrupo,
  cmdRobloxStatus
};
