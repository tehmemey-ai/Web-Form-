import { TelegramConfig } from '../types';

export function escapeTelegramHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatWaNumber(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  return digits;
}

export function buildWaUrl(phone: string | undefined, message: string): string {
  const formatted = formatWaNumber(phone);
  const encodedText = encodeURIComponent(message);
  return formatted
    ? `https://wa.me/${formatted}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export interface TelegramInlineButton {
  text: string;
  url: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlText: string,
  topicId?: string,
  inlineButtons?: TelegramInlineButton[][]
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

    if (inlineButtons && inlineButtons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: inlineButtons
      };
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

export function formatPinRequestTelegramMessage(req: {
  id: string;
  fullName: string;
  handphone?: string;
  department?: string;
  category?: string;
  downloadPin?: string;
}): { html: string; waReplyUrl: string } {
  const shortId = req.id ? `#${req.id.slice(0, 8).toUpperCase()}` : '-';
  const pin = req.downloadPin || '123456';

  const replyText = `Halo Bpk/Ibu ${req.fullName}, permohonan data Anda (Request ID: ${shortId}) telah selesai diproses. PIN Akses untuk mengunduh hasil data Anda adalah: *${pin}*. Silakan masukkan PIN tersebut di dashboard portal. Terima kasih!`;
  const waReplyUrl = buildWaUrl(req.handphone, replyText);

  let html = `🔑 <b>PEMOHON MINTA PIN AKSES (JAPRI ADMIN)</b>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━\n`;
  html += `🆔 <b>Request ID:</b> <code>${escapeTelegramHtml(shortId)}</code>\n`;
  html += `👤 <b>Pemohon:</b> <b>${escapeTelegramHtml(req.fullName)}</b>\n`;
  if (req.department) {
    html += `🏢 <b>Unit Kerja:</b> ${escapeTelegramHtml(req.department)}\n`;
  }
  html += `📱 <b>No. HP / WA:</b> <code>${escapeTelegramHtml(req.handphone || '-')}</code>\n`;
  if (req.category) {
    html += `📁 <b>Kategori:</b> ${escapeTelegramHtml(req.category)}\n`;
  }
  html += `\n🔐 <b>PIN Akses:</b> <code>${escapeTelegramHtml(pin)}</code> <i>(tap untuk salin)</i>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━\n`;
  html += `⚡ <i>Klik tombol di bawah untuk langsung kirim PIN ke WhatsApp pemohon (teks sudah otomatis terisi).</i>`;

  return { html, waReplyUrl };
}

export function formatRejectionInquiryTelegramMessage(req: {
  id: string;
  fullName: string;
  handphone?: string;
  department?: string;
  rejectionReason?: string;
}): { html: string; waReplyUrl: string } {
  const shortId = req.id ? `#${req.id.slice(0, 8).toUpperCase()}` : '-';
  const reason = req.rejectionReason || '-';
  const replyText = `Halo Bpk/Ibu ${req.fullName}, terkait permohonan data Anda (Request ID: ${shortId}) yang ditolak dengan catatan: "${reason}". Silakan sampaikan hal yang ingin ditanyakan.`;
  const waReplyUrl = buildWaUrl(req.handphone, replyText);

  let html = `💬 <b>PEMOHON JAPRI TERKAIT PENOLAKAN</b>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━\n`;
  html += `🆔 <b>Request ID:</b> <code>${escapeTelegramHtml(shortId)}</code>\n`;
  html += `👤 <b>Pemohon:</b> <b>${escapeTelegramHtml(req.fullName)}</b>\n`;
  if (req.department) {
    html += `🏢 <b>Unit Kerja:</b> ${escapeTelegramHtml(req.department)}\n`;
  }
  html += `📱 <b>No. HP / WA:</b> <code>${escapeTelegramHtml(req.handphone || '-')}</code>\n`;
  html += `📌 <b>Alasan Penolakan:</b> <i>${escapeTelegramHtml(reason)}</i>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━\n`;
  html += `⚡ <i>Klik tombol di bawah untuk langsung membalas pemohon via WhatsApp.</i>`;

  return { html, waReplyUrl };
}

export function formatTestTelegramMessage(adminName?: string, adminWhatsapp?: string): string {
  const waInfo = adminWhatsapp ? `\n📱 <b>Nomor WA Admin:</b> <code>${escapeTelegramHtml(formatWaNumber(adminWhatsapp))}</code>` : '';
  return `🤖 <b>TES KONEKSI NOTIFIKASI TELEGRAM BERHASIL!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ Bot Telegram <b>Internal Data Request Portal</b> telah terhubung dengan benar.\n\n` +
    `👤 <b>Diuji oleh:</b> ${escapeTelegramHtml(adminName || 'Administrator')}${waInfo}\n` +
    `🕒 <b>Waktu Uji:</b> ${new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔔 <i>Notifikasi otomatis akan dikirim saat ada permohonan baru dan saat pemohon klik "Japri Admin" minta PIN (dilengkapi tombol 1-klik balas WA).</i>`;
}
