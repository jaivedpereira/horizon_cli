/**
 * HORIZON CLI — Push Notifications (Telegram)
 *
 * Envia notificações para o(s) admin(s) via Telegram quando eventos
 * importantes acontecem:
 *   - Circuit breaker abriu (ban detectado)
 *   - Download de playlist grande concluído
 *   - Sync encontrou N faixas novas
 *   - Erro crítico / crash
 *   - Bot recebeu primeiro usuário novo
 *
 * Requer BOT_TOKEN no .env (o mesmo do bot). Se não existir, falha
 * silenciosamente (o CLI funciona sem isso).
 */

import dotenv from 'dotenv';
import { log } from './logger.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const ENABLED = Boolean(BOT_TOKEN && ADMIN_IDS.length);

/**
 * Envia mensagem de texto pra todos os admins via Telegram Bot API.
 * Falha silenciosamente se BOT_TOKEN ou ADMIN_USER_IDS não estiverem definidos.
 */
async function sendToAdmins(text) {
    if (!ENABLED) return;
    for (const chatId of ADMIN_IDS) {
        try {
            const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'Markdown',
                    disable_notification: false,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
        } catch (err) {
            log.warn(`pushNotify: falhou pra ${chatId}: ${err.message}`);
        }
    }
}

// ============================================================
//  EVENTOS PRÉ-DEFINIDOS
// ============================================================

export async function notifyCircuitOpened(reason) {
    await sendToAdmins(
        `🚨 *HORIZON: Circuit Breaker ABERTO*\n\n` +
            `Motivo: ${reason}\n` +
            `O app está pausado por 10 minutos.\n\n` +
            `_Rode \`horizon antiban reset\` pra liberar._`,
    );
}

export async function notifyBatchComplete({ total, ok, err, duration }) {
    if (total < 5) return; // Não notifica pra poucos downloads.
    await sendToAdmins(
        `✅ *HORIZON: Lote concluído*\n\n` +
            `Total: ${total} | OK: ${ok} | Falhas: ${err}\n` +
            `Tempo: ${duration}`,
    );
}

export async function notifySyncComplete({ subs, enqueued, checked }) {
    if (!enqueued) return; // Só notifica se achou coisa nova.
    await sendToAdmins(
        `🔔 *HORIZON: Sync concluído*\n\n` +
            `Inscrições: ${subs}\n` +
            `Vídeos checados: ${checked}\n` +
            `Novos enfileirados: ${enqueued}`,
    );
}

export async function notifyNewUser(user) {
    await sendToAdmins(
        `👤 *HORIZON: Novo usuário no bot*\n\n` +
            `Nome: ${user.name}\n` +
            `ID: \`${user.id}\``,
    );
}

export async function notifyError(context, error) {
    await sendToAdmins(
        `❌ *HORIZON: Erro*\n\n` +
            `Contexto: ${context}\n` +
            `Erro: \`${String(error).slice(0, 300)}\``,
    );
}

export async function notifyCustom(message) {
    await sendToAdmins(message);
}

/** Verifica se o push está habilitado (útil pra UI). */
export function isPushEnabled() {
    return ENABLED;
}

export function getPushStatus() {
    return {
        enabled: ENABLED,
        hasToken: Boolean(BOT_TOKEN),
        adminCount: ADMIN_IDS.length,
        admins: ADMIN_IDS,
    };
}
