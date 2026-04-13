// commands/index.js
const verification = require('./verification');
const profile = require('./profile');
const robloxCommands = require('./robloxCommands');
const premium = require('./premium');
const economy = require('./economy');
const triviaCommands = require('./triviaCommands');
const social = require('./social');
const moderation = require('./moderation');
const alerts = require('./alerts');
const admin = require('./admin');
const owner = require('./owner');
const help = require('./help');
const monitor = require('./monitor');

module.exports = {
  ...verification,
  ...profile,
  ...robloxCommands,
  ...premium,
  ...economy,
  ...triviaCommands,
  ...social,
  ...moderation,
  ...alerts,
  ...admin,
  ...owner,
  ...help,
  ...monitor,
  cooldowns: require('../security').cooldowns,
  CooldownManager: require('../security').CooldownManager
};
