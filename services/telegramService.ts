import { TelegramConfig } from '../types';

export function escapeTelegramHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlText: string,
  topicId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!botToken || !chatId) {
    return { success: false, error: 'Bot Token dan Chat ID wajib diisi.' };
  }

  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();

  try {
    const payload: Record<string, any> = {
      chat_id: cleanChatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (topicId && topicId.trim()) {
      const parsedTopic = parseInt(topicId.trim(), 10);
      if (!isNaN(parsedTopic)) {
        payload.message_thread_id = parsedTopic;
      }
    }

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      const errorDescription = result?.description || `HTTP ${response.status}: ${response.statusText}`;
      return { success: false, error: errorDescription };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to send Telegram message:', err);
    return {
      success: false,
      error: err?.message || 'Gagal menghubungi server Telegram. Pastikan koneksi internet aktif.'
    };
  }
}

export function formatNewRequestTelegramMessage(req: {
  id: string;
  fullName: string;
  email: string;
  handphone: string;
  department: string;
  category?: string;
  urgency?: string;
  description: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  otherCategoryReason?: string;
  supportingDocName?: string;
}): string {
  const shortId = req.id ? `#${req.id.slice(0, 8).toUpperCase()}` : '-';
  const urgencyEmoji = req.urgency === 'Critical' ? '🔴' : req.urgency === 'High' ? '🟠' : req.urgency === 'Medium' ? '🟡' : '🟢';

  let msg = `🔔 <b>PERMOHONAN DATA BARU MASUK!</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 <b>Request ID:</b> <code>${escapeTelegramHtml(shortId)}</code>\n`;
  msg += `👤 <b>Pemohon:</b> <b>${escapeTelegramHtml(req.fullName)}</b>\n`;
  msg += `🏢 <b>Unit Kerja:</b> ${escapeTelegramHtml(req.department)}\n`;
  msg += `📱 <b>No. HP / WA:</b> <code>${escapeTelegramHtml(req.handphone)}</code>\n`;
  msg += `📧 <b>Email:</b> ${escapeTelegramHtml(req.email)}\n`;
  msg += `📁 <b>Kategori:</b> ${escapeTelegramHtml(req.category || '-')}\n`;
  if (req.otherCategoryReason) {
    msg += `ℹ️ <b>Keterangan Kategori:</b> ${escapeTelegramHtml(req.otherCategoryReason)}\n`;
  }
  msg += `${urgencyEmoji} <b>Urgensi:</b> ${escapeTelegramHtml(req.urgency || '-')}\n`;

  if (req.dateRangeStart || req.dateRangeEnd) {
    msg += `📅 <b>Rentang Data:</b> ${escapeTelegramHtml(req.dateRangeStart || 'Awal')} s.d. ${escapeTelegramHtml(req.dateRangeEnd || 'Akhir')}\n`;
  }

  if (req.supportingDocName) {
    msg += `📎 <b>Dokumen Pendukung:</b> ${escapeTelegramHtml(req.supportingDocName)}\n`;
  }

  msg += `\n📝 <b>Deskripsi Permohonan:</b>\n<i>${escapeTelegramHtml(req.description)}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕒 <i>Waktu Masuk: ${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}</i>\n`;
  msg += `👉 <i>Silakan buka Dashboard Portal untuk meninjau dan menindaklanjuti permohonan.</i>`;

  return msg;
}

export function formatTestTelegramMessage(adminName?: string): string {
  return `🤖 <b>TES KONEKSI NOTIFIKASI TELEGRAM BERHASIL!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ Bot Telegram <b>Internal Data Request Portal</b> telah terhubung dengan benar.\n\n` +
    `👤 <b>Diuji oleh:</b> ${escapeTelegramHtml(adminName || 'Administrator')}\n` +
    `🕒 <b>Waktu Uji:</b> ${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔔 <i>Notifikasi otomatis akan dikirim ke chat ini setiap kali ada pemohon yang mengirim data/permohonan baru.</i>`;
}
