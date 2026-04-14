// commands/help.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');
const { HELP_CATEGORIES } = require('./utils/constants');

async function cmdAyuda(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  
  // Filtrar categorías según si es owner
  const filteredCategories = { ...HELP_CATEGORIES };
  if (!isOwner) delete filteredCategories['👑 Owner'];
  const categoryKeys = Object.keys(filteredCategories);
  
  // Pre-traducir textos estáticos
  const helpTitle = await t(lang, 'help_title');
  const helpDescription = await t(lang, 'help_description');
  const helpFooter = await t(lang, 'help_footer');
  const helpCategoryFooter = await t(lang, 'help_category_footer');
  const helpSelectCategory = await t(lang, 'help_select_category');
  const helpOverview = await t(lang, 'help_overview');
  const helpOverviewDesc = await t(lang, 'help_overview_desc');
  const onlyAuthor = await t(lang, 'only_author');
  
  // Función para crear el embed de vista general
  const makeOverviewEmbed = () => {
    const embed = new EmbedBuilder()
      .setTitle(helpTitle)
      .setColor(0x1900ff)
      .setDescription(helpDescription)
      .setFooter({ text: helpFooter });
    
    for (const key of categoryKeys) {
      embed.addFields({ name: key, value: filteredCategories[key].description, inline: false });
    }
    return embed;
  };
  
  // Función para crear el embed de una categoría específica
  const makeCategoryEmbed = (key) => {
    const cat = filteredCategories[key];
    const embed = new EmbedBuilder()
      .setTitle(key)
      .setColor(0x1900ff)
      .setDescription(cat.description)
      .setFooter({ text: helpCategoryFooter });
    
    for (const cmd of cat.commands) {
      embed.addFields({ name: cmd.name, value: cmd.desc, inline: false });
    }
    return embed;
  };
  
  // Construir el menú desplegable
  const selectOptions = [
    {
      label: helpOverview,
      value: '__overview__',
      description: helpOverviewDesc
    },
    ...categoryKeys.map(k => ({
      label: k.length > 25 ? k.slice(0, 25) : k,
      value: k,
      description: filteredCategories[k].description.slice(0, 50)
    }))
  ];
  
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder(helpSelectCategory)
      .addOptions(selectOptions)
  );
  
  const msg = await ctx.replyAndFetch({ 
    embeds: [makeOverviewEmbed()], 
    components: [select] 
  });
  
  if (!msg) return;
  
  const collector = msg.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect, 
    time: 120000 
  });
  
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) {
      return i.reply({ content: onlyAuthor, ephemeral: true });
    }
    const selected = i.values[0];
    const embed = selected === '__overview__' ? makeOverviewEmbed() : makeCategoryEmbed(selected);
    await i.update({ embeds: [embed], components: [select] });
  });
  
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = { cmdAyuda };
