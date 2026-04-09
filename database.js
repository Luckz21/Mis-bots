// ============================================================
//  database.js
//  Maneja toda la comunicación con Upstash Redis.
//  Usamos la API REST de Upstash (HTTP puro) para evitar
//  los problemas de SSL que tiene el driver nativo de MongoDB.
//
//  Estructura de datos en Redis:
//    user:{discordId}  → datos del usuario verificado
//    guild:{guildId}   → configuración del servidor (roles, bindings)
// ============================================================

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Función base: hace una petición HTTP a Upstash
async function redisRequest(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${REDIS_URL}${path}`, options);
  return res.json();
}

// Obtener un valor (devuelve objeto JS o null si no existe)
async function redisGet(key) {
  const data = await redisRequest(`/get/${encodeURIComponent(key)}`);
  return data.result ? JSON.parse(data.result) : null;
}

// Guardar un valor (lo serializa a JSON string)
async function redisSet(key, value) {
  await redisRequest(`/set/${encodeURIComponent(key)}`, 'POST', {
    value: JSON.stringify(value),
  });
}

// Eliminar un valor
async function redisDel(key) {
  await redisRequest(`/del/${encodeURIComponent(key)}`, 'POST');
}

// ── Funciones de usuarios ────────────────────────────────────
// Cada usuario verificado se guarda con su discordId como clave.
// Estructura:
// {
//   discordId, robloxId, robloxUsername, verifiedAt,
//   privacyPresence: bool,  ← permite que otros vean su juego
//   privacyProfile: bool    ← permite que otros vean su perfil
// }

const getUser    = (discordId)       => redisGet(`user:${discordId}`);
const saveUser   = (discordId, data) => redisSet(`user:${discordId}`, { discordId, ...data });
const deleteUser = (discordId)       => redisDel(`user:${discordId}`);

// ── Funciones de configuración del servidor ──────────────────
// Cada servidor guarda su configuración con el guildId como clave.
// Estructura:
// {
//   verifiedRoleId: string,   ← rol que se da al verificarse
//   bindings: [               ← vinculaciones grupo Roblox → rol Discord
//     { groupId, minRank, roleId }
//   ]
// }

const getGuildConf  = (guildId)       => redisGet(`guild:${guildId}`);
const saveGuildConf = (guildId, data) => redisSet(`guild:${guildId}`, data);

module.exports = { getUser, saveUser, deleteUser, getGuildConf, saveGuildConf };
