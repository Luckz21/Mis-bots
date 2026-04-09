const fs = require('fs');

const FILE = './data.json';

// cargar base de datos
function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

// guardar base de datos
function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// obtener usuario
async function getUser(userId) {
  const db = load();
  return db[userId] || null;
}

// guardar usuario
async function saveUser(userId, data) {
  const db = load();
  db[userId] = data;
  save(db);
}

// eliminar usuario
async function deleteUser(userId) {
  const db = load();
  delete db[userId];
  save(db);
}

// config del servidor
async function getGuildConf(guildId) {
  const db = load();
  return db.guilds?.[guildId] || null;
}

async function saveGuildConf(guildId, config) {
  const db = load();
  if (!db.guilds) db.guilds = {};
  db.guilds[guildId] = config;
  save(db);
}

module.exports = {
  getUser,
  saveUser,
  deleteUser,
  getGuildConf,
  saveGuildConf
};
