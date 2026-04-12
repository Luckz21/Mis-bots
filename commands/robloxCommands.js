// commands/robloxCommands.js
const {
  EmbedBuilder
} = require('discord.js');

const { sanitizeText } = require('../security');
const { db } = require('./utils/database');
const roblox = require('./utils/roblox');
const { paginate } = require('./utils/helpers');

// ──────────────────────────────────────────────────────────────
//  Catálogo de Roblox
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
//  Muro de grupo
// ──────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────
//  Estado de los servidores de Roblox
// ──────────────────────────────────────────────────────────────

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
  embed.addFields({ name: '🔗 Enlace directo', value: '[Ver estado en tiempo real](https://status.roblox.com)' });
  embed.setFooter({ text: 'Fuente: status.roblox.com' });
  ctx.reply({ embeds: [embed] });
}

// ──────────────────────────────────────────────────────────────
//  Exportaciones
// ──────────────────────────────────────────────────────────────

module.exports = {
  cmdCatalogo,
  cmdMuroGrupo,
  cmdRobloxStatus
};
