// commands/utils/database.js
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (e) {
    console.error('redisGet:', e.message);
    return null;
  }
}

async function redisSet(key, value) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch (e) {
    console.error('redisSet:', e.message);
  }
}

async function redisDel(key) {
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch (e) {
    console.error('redisDel:', e.message);
  }
}

// Base de datos tipada
const db = {
  getUser:        (id)       => redisGet(`user:${id}`),
  saveUser:       (id, data) => redisSet(`user:${id}`, { discordId: id, ...data }),
  deleteUser:     (id)       => redisDel(`user:${id}`),
  getGuildConf:   (id)       => redisGet(`guild:${id}`),
  saveGuildConf:  (id, data) => redisSet(`guild:${id}`, data),
  getAlerts:      (id)       => redisGet(`alerts:${id}`),
  saveAlerts:     (id, data) => redisSet(`alerts:${id}`, data),
  getEconomy:     (id)       => redisGet(`eco:${id}`),
  saveEconomy:    (id, data) => redisSet(`eco:${id}`, data),
  getPremium:     (id)       => redisGet(`premium:${id}`),
  savePremium:    (id, data) => redisSet(`premium:${id}`, data),
  getHistory:     (id)       => redisGet(`history:${id}`),
  saveHistory:    (id, data) => redisSet(`history:${id}`, data),
  deleteHistory:  (id)       => redisDel(`history:${id}`),
  getLFG:         (id)       => redisGet(`lfg:${id}`),
  saveLFG:        (id, data) => redisSet(`lfg:${id}`, data),
  deleteLFG:      (id)       => redisDel(`lfg:${id}`),
  getAlts:        (id)       => redisGet(`alts:${id}`),
  saveAlts:       (id, data) => redisSet(`alts:${id}`, data),
  getFlexBg:      (id)       => redisGet(`flexbg:${id}`),
  saveFlexBg:     (id, data) => redisSet(`flexbg:${id}`, data),
  getGameStats:   (id)       => redisGet(`gamestats:${id}`),
  saveGameStats:  (id, data) => redisSet(`gamestats:${id}`, data),
};

module.exports = { redisGet, redisSet, redisDel, db };
