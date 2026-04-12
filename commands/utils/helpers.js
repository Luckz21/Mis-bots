// commands/utils/helpers.js
const { db } = require('./database');
const { t } = require('../../i18n');

async function isPremium(discordId) {
  const data = await db.getPremium(discordId);
  if (!data) return false;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) return false;
  return true;
}

async function getGuildLang(guildId) {
  if (!guildId) return 'es';
  try {
    const config = await db.getGuildConf(guildId);
    return config?.lang ?? 'es';
  } catch { return 'es'; }
}

function progressBar(current, max, size = 10) {
  const filled = Math.min(Math.round((current / max) * size), size);
  return '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
}

const RANKS = [
  { name: '🥉 Bronce',    min: 0,     color: 0xCD7F32, next: 500   },
  { name: '🥈 Plata',     min: 500,   color: 0xC0C0C0, next: 2000  },
  { name: '🥇 Oro',       min: 2000,  color: 0xFFD700, next: 5000  },
  { name: '🏆 Platino',   min: 5000,  color: 0xE5E4E2, next: 10000 },
  { name: '💎 Diamante',  min: 10000, color: 0x00FFFF, next: 20000 },
  { name: '🌟 Maestro',   min: 20000, color: 0x9B59B6, next: 35000 },
  { name: '🔮 Gran Maestro', min: 35000, color: 0x8E44AD, next: 50000 },
  { name: '👑 Élite',     min: 50000, color: 0xF1C40F, next: 75000 },
  { name: '🚀 Leyenda',   min: 75000, color: 0xE67E22, next: 100000 },
  { name: '⚡ Dios',      min: 100000, color: 0xFF00FF, next: null },
];

function getRank(points) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

// ... resto de helpers (generateCode, filterAlertsByResetPeriod, etc.)

module.exports = {
  isPremium,
  getGuildLang,
  progressBar,
  getRank,
  RANKS,
  // ... otros
};
