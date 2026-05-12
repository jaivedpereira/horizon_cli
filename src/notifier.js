/**
 * HORIZON CLI — Notifier
 * Notificações Termux (Android) com anti-spam via ID fixo.
 */

import { execSync } from 'child_process';
import { IS_TERMUX } from './config.js';
import { shellEscape } from './utils.js';

const NOTIF_ID = 1000;

/**
 * Envia notificação no Termux. Usa o mesmo ID para atualizar em vez de spammar.
 * @param {string} titulo
 * @param {string} mensagem
 * @param {'normal'|'progresso'|'sucesso'|'erro'} tipo
 */
export function notify(titulo, mensagem, tipo = 'normal') {
    if (!IS_TERMUX) return;
    try {
        const parts = [
            'termux-notification',
            `-i ${NOTIF_ID}`,
            `-t ${shellEscape(titulo)}`,
            `-c ${shellEscape(mensagem)}`,
        ];
        if (tipo === 'progresso') parts.push('--ongoing');
        execSync(parts.join(' '), { stdio: 'ignore' });
    } catch {
        /* silencioso */
    }
}

/** Remove a notificação fixada. */
export function clearNotification() {
    if (!IS_TERMUX) return;
    try {
        execSync(`termux-notification-remove ${NOTIF_ID}`, { stdio: 'ignore' });
    } catch {
        /* silencioso */
    }
}

/** Reescaneia uma pasta pra galeria do Android enxergar os novos arquivos. */
export function refreshGallery(folderPath) {
    if (!IS_TERMUX) return;
    try {
        execSync(`termux-media-scan -r ${shellEscape(folderPath)}`, { stdio: 'ignore' });
    } catch {
        /* silencioso */
    }
}
