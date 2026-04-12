// commands/help.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType
} = require('discord.js');

const { HELP_CATEGORIES } = require('./utils/constants');

async function cmdAyuda(ctx) {
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const filteredCategories = { ...HELP_CATEGORIES };
  if (!isOwner) delete filteredCategories['👑 Owner'];
  const categoryKeys = Object.keys(filteredCategories);
  
  const makeOverviewEmbed = () => new EmbedBuilder()
    .setTitle('📋 Ayuda — Bot Roblox v10.8')
    .setColor(0x1900ff)
    .setDescription('Selecciona una categoría del menú de abajo para ver los comandos y sus descripciones.\n\nTodos los comandos funcionan con `/` (slash), `!` o `?`.')
    .addFields(...categoryKeys.map(k => ({ name: k, value: filteredCategories[k].description, inline: false })))
    .setFooter({ text: `⭐ = requiere Premium · PayPal integrado · v10.8` });
  
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

module.exports = {
  cmdAyuda
};
