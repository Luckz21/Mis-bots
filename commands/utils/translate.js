// commands/utils/translate.js
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function cacheGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/trans:${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function cacheSet(key, value, ttl = 86400) {
  try {
    await fetch(`${REDIS_URL}/set/trans:${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    await fetch(`${REDIS_URL}/expire/trans:${encodeURIComponent(key)}/${ttl}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch {}
}

async function translateText(text, targetLang = 'es') {
  if (!text || targetLang === 'es') return text;
  const cacheKey = `${targetLang}:${text}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=es|${targetLang}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data.responseData.translatedText || text;
    await cacheSet(cacheKey, translated, 30 * 86400);
    return translated;
  } catch (e) {
    console.error('Translation error:', e.message);
    return text;
  }
}

function formatString(str, ...args) {
  return str.replace(/{(\d+)}/g, (match, num) => args[num] ?? match);
}

const staticTranslations = require('../../i18n').translations;

async function t(guildLang, key, ...args) {
  const lang = guildLang || 'es';
  const langObj = staticTranslations[lang] ?? staticTranslations.es;
  let value = langObj[key];

  if (!value) {
    if (lang === 'es') {
      value = key;
    } else {
      value = await translateText(key, lang);
    }
  } else if (typeof value === 'function') {
    const raw = value(...args);
    if (lang === 'es') return raw;
    return await translateText(raw, lang);
  }

  let result = value;
  if (args.length > 0 && typeof result === 'string') {
    result = formatString(result, ...args);
  }

  if (lang !== 'es' && typeof result === 'string') {
    result = await translateText(result, lang);
  }

  return result;
}

module.exports = { t, translateText };
