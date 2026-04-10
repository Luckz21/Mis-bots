// ============================================================
//  i18n.js  —  Sistema de multi-idioma
//  Idiomas: es (español), en (inglés), pt (portugués)
// ============================================================

const translations = {
  es: {
    // Verificación
    verify_already:     (name) => `✅ Ya tienes cuenta vinculada: **${name}**\nUsa \`/desvincular\` para cambiarla.`,
    verify_not_found:   '❌ No encontré ese usuario en Roblox. Verifica el nombre.',
    verify_title:       '🔐 Verificación de cuenta Roblox',
    verify_step1:       '**1️⃣** Ve a tu perfil de Roblox',
    verify_step2:       '**2️⃣** Edita tu **descripción** y agrega este código:',
    verify_step3:       '**3️⃣** Vuelve aquí y usa `/confirmar`',
    verify_time:        '⏱️ Tienes **10 minutos**. Puedes borrar el código después.',
    confirm_no_pending: '❌ No tienes verificación pendiente. Usa `/verificar` primero.',
    confirm_no_profile: '❌ No pude acceder al perfil. Intenta de nuevo.',
    confirm_code_fail:  (code, name) => `❌ No encontré el código \`${code}\` en la descripción de **${name}**.\nEspera unos segundos.`,
    confirm_success:    (name) => `✅ Vinculado a **${name}**.`,
    // General
    no_account:         (name) => `❌ **${name}** no tiene cuenta de Roblox vinculada.`,
    profile_private:    '🔒 Perfil privado.',
    presence_private:   (name) => `🔒 **${name}** no permite ver su presencia.`,
    no_cookie:          '❌ Cookie de Roblox no configurada en el bot.',
    error_generic:      '❌ Error inesperado. Intenta de nuevo.',
    premium_only:       '⭐ Esta función es exclusiva **Premium**.',
    cooldown:           (cmd, time) => `⏳ Espera **${time}** antes de usar \`/${cmd}\` de nuevo.`,
    blacklisted:        '⛔ Fuiste bloqueado temporalmente por usar comandos demasiado rápido. Inténtalo en 5 minutos.',
    // Economía
    daily_claimed:      (pts, total) => `🎁 Ganaste **${pts} puntos**! Total: **${total}**`,
    daily_wait:         (hrs, mins) => `⏰ Vuelve en **${hrs}h ${mins}m**.`,
    // Roles
    need_manage_roles:  '❌ Necesitas el permiso **Gestionar Roles**.',
    need_manage_guild:  '❌ Necesitas **Administrar Servidor**.',
    owner_only:         '❌ Solo el dueño del bot puede usar este comando.',
  },
  en: {
    verify_already:     (name) => `✅ Already linked: **${name}**\nUse \`/unlink\` to change it.`,
    verify_not_found:   '❌ Roblox user not found. Check the username.',
    verify_title:       '🔐 Roblox Account Verification',
    verify_step1:       '**1️⃣** Go to your Roblox profile',
    verify_step2:       '**2️⃣** Edit your **description** and add this code:',
    verify_step3:       '**3️⃣** Come back and use `/confirm`',
    verify_time:        '⏱️ You have **10 minutes**. You can delete the code after.',
    confirm_no_pending: '❌ No pending verification. Use `/verify` first.',
    confirm_no_profile: '❌ Could not access Roblox profile. Try again.',
    confirm_code_fail:  (code, name) => `❌ Could not find code \`${code}\` in **${name}**'s description.\nWait a few seconds.`,
    confirm_success:    (name) => `✅ Linked to **${name}**.`,
    no_account:         (name) => `❌ **${name}** has no linked Roblox account.`,
    profile_private:    '🔒 Private profile.',
    presence_private:   (name) => `🔒 **${name}** has hidden their presence.`,
    no_cookie:          '❌ Roblox cookie not configured.',
    error_generic:      '❌ Unexpected error. Try again.',
    premium_only:       '⭐ This feature requires **Premium**.',
    cooldown:           (cmd, time) => `⏳ Wait **${time}** before using \`/${cmd}\` again.`,
    blacklisted:        '⛔ Temporarily blocked for spamming commands. Try again in 5 minutes.',
    daily_claimed:      (pts, total) => `🎁 You earned **${pts} points**! Total: **${total}**`,
    daily_wait:         (hrs, mins) => `⏰ Come back in **${hrs}h ${mins}m**.`,
    need_manage_roles:  '❌ You need the **Manage Roles** permission.',
    need_manage_guild:  '❌ You need **Manage Server** permission.',
    owner_only:         '❌ Only the bot owner can use this command.',
  },
  pt: {
    verify_already:     (name) => `✅ Já vinculado: **${name}**\nUse \`/desvincular\` para mudar.`,
    verify_not_found:   '❌ Usuário do Roblox não encontrado. Verifique o nome.',
    verify_title:       '🔐 Verificação de conta Roblox',
    verify_step1:       '**1️⃣** Vá ao seu perfil do Roblox',
    verify_step2:       '**2️⃣** Edite sua **descrição** e adicione este código:',
    verify_step3:       '**3️⃣** Volte aqui e use `/confirmar`',
    verify_time:        '⏱️ Você tem **10 minutos**. Pode deletar o código depois.',
    confirm_no_pending: '❌ Sem verificação pendente. Use `/verificar` primeiro.',
    confirm_no_profile: '❌ Não consegui acessar o perfil. Tente novamente.',
    confirm_code_fail:  (code, name) => `❌ Não encontrei o código \`${code}\` na descrição de **${name}**.\nAguarde alguns segundos.`,
    confirm_success:    (name) => `✅ Vinculado a **${name}**.`,
    no_account:         (name) => `❌ **${name}** não tem conta do Roblox vinculada.`,
    profile_private:    '🔒 Perfil privado.',
    presence_private:   (name) => `🔒 **${name}** não permite ver sua presença.`,
    no_cookie:          '❌ Cookie do Roblox não configurado.',
    error_generic:      '❌ Erro inesperado. Tente novamente.',
    premium_only:       '⭐ Esta função é exclusiva **Premium**.',
    cooldown:           (cmd, time) => `⏳ Aguarde **${time}** antes de usar \`/${cmd}\` novamente.`,
    blacklisted:        '⛔ Bloqueado temporariamente por usar comandos muito rápido. Tente em 5 minutos.',
    daily_claimed:      (pts, total) => `🎁 Você ganhou **${pts} pontos**! Total: **${total}**`,
    daily_wait:         (hrs, mins) => `⏰ Volte em **${hrs}h ${mins}m**.`,
    need_manage_roles:  '❌ Você precisa da permissão **Gerenciar Cargos**.',
    need_manage_guild:  '❌ Você precisa **Gerenciar Servidor**.',
    owner_only:         '❌ Apenas o dono do bot pode usar este comando.',
  },
};

// Obtener texto en el idioma del servidor (default: español)
function t(guildLang, key, ...args) {
  const lang   = translations[guildLang] ?? translations.es;
  const fallback = translations.es;
  const value  = lang[key] ?? fallback[key];
  if (!value) return `[${key}]`;
  return typeof value === 'function' ? value(...args) : value;
}

module.exports = { t, translations };
