// commands/help.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { getGuildLang } = require('./utils/helpers');
const { t } = require('./utils/translate');
const { HELP_CATEGORIES } = require('./utils/constants');

async function cmdAyuda(ctx) {
  const lang = await getGuildLang(ctx.guild?.id);
  const isOwner = ctx.userId === process.env.BOT_OWNER_ID;
  const filteredCategories = { ...HELP_CATEGORIES };
  if (!isOwner) delete filteredCategories['👑 Owner'];
  const categoryKeys = Object.keys(filteredCategories);
  
  const makeOverviewEmbed = () => new EmbedBuilder()
    .setTitle(await t(lang, 'help_title'))
    .setColor(0x1900ff)
    .setDescription(await t(lang, 'help_description'))
    .addFields(...categoryKeys.map(k => ({ name: k, value: filteredCategories[k].description, inline: false })))
    .setFooter({ text: await t(lang, 'help_footer') });
  
  const makeCategoryEmbed = (key) => {
    const cat = filteredCategories[key];
    return new EmbedBuilder().setTitle(key).setColor(0x1900ff).setDescription(cat.description)
      .addFields(...cat.commands.map(c => ({ name: c.name, value: c.desc, inline: false })))
      .setFooter({ text: await t(lang, 'help_category_footer') });
  };
  
  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder(await t(lang, 'help_select_category'))
      .addOptions([
        { label: await t(lang, 'help_overview'), value: '__overview__', description: await t(lang, 'help_overview_desc') },
        ...categoryKeys.map(k => ({ label: k.slice(0, 25), value: k, description: filteredCategories[k].description.slice(0, 50) })),
      ]),
  );
  
  const msg = await ctx.replyAndFetch({ embeds: [makeOverviewEmbed()], components: [select] });
  if (!msg) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.userId) return i.reply({ content: await t(lang, 'only_author'), ephemeral: true });
    const selected = i.values[0];
    const embed = selected === '__overview__' ? makeOverviewEmbed() : makeCategoryEmbed(selected);
    await i.update({ embeds: [embed], components: [select] });
  });
  collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

module.exports = { cmdAyuda };
