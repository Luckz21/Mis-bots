// ============================================================
//  trivia.js  —  v2.0
//  Preguntas variadas: Roblox, matemáticas, ciencias,
//  historia, cultura general, geografía
// ============================================================

const TRIVIA_QUESTIONS = [
  // ── Roblox ──────────────────────────────────────────────────
  { q: '¿En qué año fue fundado Roblox?', a: '2006', cat: 'Roblox' },
  { q: '¿Cómo se llama la moneda virtual de Roblox?', a: 'Robux', cat: 'Roblox' },
  { q: '¿Qué lenguaje de programación se usa en Roblox Studio?', a: 'Lua', cat: 'Roblox' },
  { q: '¿Cómo se llama el entorno de desarrollo oficial de Roblox?', a: 'Roblox Studio', cat: 'Roblox' },
  { q: '¿Quién cofundó Roblox junto a Erik Cassel?', a: 'David Baszucki', cat: 'Roblox' },
  { q: '¿Qué significa RAP en el contexto de Roblox?', a: 'Recent Average Price', cat: 'Roblox' },
  { q: '¿Cuál es el nombre del personaje mascota oficial de Roblox?', a: 'Roblox', cat: 'Roblox' },
  { q: '¿Cómo se llaman los objetos de edición limitada en Roblox?', a: 'Limiteds', cat: 'Roblox' },
  { q: '¿Qué hace el comando /e dance en Roblox?', a: 'Hace bailar al avatar', cat: 'Roblox' },
  { q: '¿Qué es un Gamepass en Roblox?', a: 'Un pase de acceso a contenido especial dentro de un juego', cat: 'Roblox' },

  // ── Matemáticas ─────────────────────────────────────────────
  { q: '¿Cuánto es 7 × 8?', a: '56', cat: 'Matemáticas' },
  { q: '¿Cuánto es la raíz cuadrada de 144?', a: '12', cat: 'Matemáticas' },
  { q: '¿Cuánto es 15% de 200?', a: '30', cat: 'Matemáticas' },
  { q: '¿Cuántos lados tiene un hexágono?', a: '6', cat: 'Matemáticas' },
  { q: '¿Cuánto es 2 elevado a la potencia 10?', a: '1024', cat: 'Matemáticas' },
  { q: '¿Cuánto es el ángulo interior de un triángulo equilátero?', a: '60', cat: 'Matemáticas' },
  { q: '¿Cuánto es 100 ÷ 4?', a: '25', cat: 'Matemáticas' },
  { q: '¿Cómo se llama el número Pi aproximado a 2 decimales?', a: '3.14', cat: 'Matemáticas' },
  { q: '¿Cuánto es 9²?', a: '81', cat: 'Matemáticas' },
  { q: '¿Cuántos grados tiene un círculo completo?', a: '360', cat: 'Matemáticas' },

  // ── Ciencias ────────────────────────────────────────────────
  { q: '¿Cuál es el símbolo químico del oro?', a: 'Au', cat: 'Ciencias' },
  { q: '¿Cuántos huesos tiene el cuerpo humano adulto?', a: '206', cat: 'Ciencias' },
  { q: '¿Cuál es el planeta más grande del Sistema Solar?', a: 'Júpiter', cat: 'Ciencias' },
  { q: '¿A qué velocidad viaja la luz en km/s aproximadamente?', a: '300000', cat: 'Ciencias' },
  { q: '¿Cuál es el símbolo químico del agua?', a: 'H2O', cat: 'Ciencias' },
  { q: '¿Qué organelo produce energía en las células?', a: 'Mitocondria', cat: 'Ciencias' },
  { q: '¿Cuántos cromosomas tiene una célula humana normal?', a: '46', cat: 'Ciencias' },
  { q: '¿Cuál es el metal más abundante en la corteza terrestre?', a: 'Aluminio', cat: 'Ciencias' },
  { q: '¿Qué planeta es conocido como el planeta rojo?', a: 'Marte', cat: 'Ciencias' },
  { q: '¿Cuántos elementos tiene la tabla periódica actualmente?', a: '118', cat: 'Ciencias' },

  // ── Historia ────────────────────────────────────────────────
  { q: '¿En qué año comenzó la Primera Guerra Mundial?', a: '1914', cat: 'Historia' },
  { q: '¿En qué año terminó la Segunda Guerra Mundial?', a: '1945', cat: 'Historia' },
  { q: '¿Quién fue el primer presidente de los Estados Unidos?', a: 'George Washington', cat: 'Historia' },
  { q: '¿En qué año llegó el hombre a la Luna por primera vez?', a: '1969', cat: 'Historia' },
  { q: '¿En qué año cayó el Muro de Berlín?', a: '1989', cat: 'Historia' },
  { q: '¿Quién pintó la Mona Lisa?', a: 'Leonardo da Vinci', cat: 'Historia' },
  { q: '¿En qué año Cristóbal Colón llegó a América?', a: '1492', cat: 'Historia' },
  { q: '¿Qué civilización construyó las pirámides de Giza?', a: 'Egipcios', cat: 'Historia' },
  { q: '¿En qué año ocurrió la Revolución Francesa?', a: '1789', cat: 'Historia' },
  { q: '¿Quién fue la primera mujer en ganar el Premio Nobel?', a: 'Marie Curie', cat: 'Historia' },

  // ── Geografía ───────────────────────────────────────────────
  { q: '¿Cuál es el río más largo del mundo?', a: 'Nilo', cat: 'Geografía' },
  { q: '¿Cuál es la capital de Australia?', a: 'Canberra', cat: 'Geografía' },
  { q: '¿Cuál es el océano más grande del mundo?', a: 'Pacífico', cat: 'Geografía' },
  { q: '¿Cuántos países tiene América del Sur?', a: '12', cat: 'Geografía' },
  { q: '¿Cuál es la montaña más alta del mundo?', a: 'Everest', cat: 'Geografía' },
  { q: '¿Cuál es el país más grande del mundo por superficie?', a: 'Rusia', cat: 'Geografía' },
  { q: '¿Cuál es la capital de Japón?', a: 'Tokio', cat: 'Geografía' },
  { q: '¿En qué continente está Egipto?', a: 'África', cat: 'Geografía' },
  { q: '¿Cuál es el desierto más grande del mundo?', a: 'Sahara', cat: 'Geografía' },
  { q: '¿Cuántos continentes hay en el mundo?', a: '7', cat: 'Geografía' },

  // ── Tecnología ──────────────────────────────────────────────
  { q: '¿En qué año fue fundada Apple Inc.?', a: '1976', cat: 'Tecnología' },
  { q: '¿Quién creó el lenguaje de programación Python?', a: 'Guido van Rossum', cat: 'Tecnología' },
  { q: '¿Qué significa HTML?', a: 'HyperText Markup Language', cat: 'Tecnología' },
  { q: '¿En qué año fue lanzado el primer iPhone?', a: '2007', cat: 'Tecnología' },
  { q: '¿Qué empresa desarrolló el sistema operativo Android?', a: 'Google', cat: 'Tecnología' },
  { q: '¿Cuántos bits tiene un byte?', a: '8', cat: 'Tecnología' },
  { q: '¿Qué significa CPU?', a: 'Central Processing Unit', cat: 'Tecnología' },
  { q: '¿En qué año fue creado el lenguaje JavaScript?', a: '1995', cat: 'Tecnología' },
  { q: '¿Qué empresa creó Discord?', a: 'Discord Inc.', cat: 'Tecnología' },
  { q: '¿Qué significa RAM?', a: 'Random Access Memory', cat: 'Tecnología' },

  // ── Cultura general ─────────────────────────────────────────
  { q: '¿Cuántos jugadores hay en un equipo de fútbol?', a: '11', cat: 'General' },
  { q: '¿Cuántas cuerdas tiene una guitarra estándar?', a: '6', cat: 'General' },
  { q: '¿En qué país se originó el sushi?', a: 'Japón', cat: 'General' },
  { q: '¿Cuántos colores tiene el arcoíris?', a: '7', cat: 'General' },
  { q: '¿Cuántos planetas tiene el Sistema Solar?', a: '8', cat: 'General' },
  { q: '¿Qué idioma tiene más hablantes nativos en el mundo?', a: 'Chino mandarín', cat: 'General' },
  { q: '¿Cuántas horas tiene un día?', a: '24', cat: 'General' },
  { q: '¿De qué material está hecho el grafeno?', a: 'Carbono', cat: 'General' },
  { q: '¿Cuántos meses tiene un año?', a: '12', cat: 'General' },
  { q: '¿Cuántos segundos tiene una hora?', a: '3600', cat: 'General' },
];

// Aliases aceptados para respuestas (normalización)
const ALIASES = {
  'Nilo': ['nilo', 'nile', 'el nilo'],
  'Júpiter': ['jupiter', 'júpiter'],
  'Marte': ['marte', 'mars'],
  'Mitocondria': ['mitocondria', 'mitocondrias'],
  'Aluminio': ['aluminio', 'aluminum'],
  'Pacífico': ['pacifico', 'pacífico', 'océano pacífico'],
  'Roblox Studio': ['roblox studio', 'studio'],
  'David Baszucki': ['david baszucki', 'baszucki', 'david'],
  'Lua': ['lua'],
  'Au': ['au', 'AU'],
  'H2O': ['h2o', 'H2O'],
  'George Washington': ['george washington', 'washington'],
  'Marie Curie': ['marie curie', 'curie', 'maría curie'],
  'Leonardo da Vinci': ['leonardo da vinci', 'da vinci', 'davinci'],
  'HyperText Markup Language': ['hypertext markup language', 'html', 'hyper text markup language'],
  'Central Processing Unit': ['central processing unit', 'cpu', 'unidad central de proceso'],
  'Random Access Memory': ['random access memory', 'ram', 'memoria de acceso aleatorio'],
  'Guido van Rossum': ['guido van rossum', 'guido', 'van rossum'],
  'Chino mandarín': ['chino mandarin', 'chino mandarín', 'mandarin', 'mandarín', 'chino'],
  'Discord Inc.': ['discord', 'discord inc', 'discord inc.'],
  'Recent Average Price': ['recent average price', 'rap'],
  'Hace bailar al avatar': ['bailar', 'hace bailar al avatar', 'hace bailar', 'danza', 'dance'],
  'Un pase de acceso a contenido especial dentro de un juego': ['gamepass', 'pase', 'pase de acceso', 'acceso a contenido especial'],
  'Africá': ['africa', 'áfrica'],
  'Roblox': ['roblox'],
  '3.14': ['3.14', 'pi', '3,14'],
  '300000': ['300000', '300.000', '3×10^5', '300 000'],
};

function normalizeAnswer(str) {
  return str.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s]/g, '').trim();
}

function checkAnswer(userAnswer, correctAnswer) {
  const normUser    = normalizeAnswer(userAnswer);
  const normCorrect = normalizeAnswer(correctAnswer);
  if (normUser === normCorrect) return true;
  // Verificar aliases
  const aliasList = ALIASES[correctAnswer];
  if (aliasList) return aliasList.some(a => normalizeAnswer(a) === normUser);
  // Verificar si contiene la respuesta (para respuestas largas)
  if (normCorrect.length > 5 && normUser.includes(normCorrect)) return true;
  if (normCorrect.length > 5 && normCorrect.includes(normUser) && normUser.length > 3) return true;
  return false;
}

function getRandomQuestion() {
  return TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
}

function getQuestionByCategory(cat) {
  const filtered = TRIVIA_QUESTIONS.filter(q => q.cat === cat);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

const CATEGORIES = [...new Set(TRIVIA_QUESTIONS.map(q => q.cat))];

module.exports = { TRIVIA_QUESTIONS, getRandomQuestion, getQuestionByCategory, checkAnswer, normalizeAnswer, CATEGORIES };
