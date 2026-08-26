import React, { useState } from 'react';
import { TelegramConfig } from '../types';
import { sendTelegramMessage, formatTestTelegramMessage } from '../services/telegramService';
import { 
  CloseIcon, BellIcon, SettingsIcon, SendIcon, CheckIcon, Spinner, 
  HelpCircleIcon, EyeIcon, LockIcon, InfoIcon 
} from './Icons';
import Button from './Button';

interface TelegramSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TelegramConfig;
  onSave: (newConfig: TelegramConfig) => Promise<void>;
  adminName?: string;
}

export const TelegramSettingsModal: React.FC<TelegramSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  adminName
}) => {
  const [enabled, setEnabled] = useState<boolean>(config.enabled ?? false);
  const [botToken, setBotToken] = useState<string>(config.botToken || '');
  const [chatId, setChatId] = useState<string>(config.chatId || '');
  const [topicId, setTopicId] = useState<string>(config.topicId || '');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleTestNotification = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      setTestResult({
        success: false,
        message: 'Harap isi Bot Token dan Chat ID terlebih dahulu untuk melakukan tes.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSaveSuccess(false);

    try {
      const testMessage = formatTestTelegramMessage(adminName);
      const res = await sendTelegramMessage(botToken.trim(), chatId.trim(), testMessage, topicId.trim());

      if (res.success) {
        setTestResult({
          success: true,
          message: 'Pesan tes berhasil dikirim! Silakan periksa chat / grup Telegram Anda.'
        });
      } else {
        setTestResult({
          success: false,
          message: `Gagal mengirim tes: ${res.error || 'Periksa kembali Token dan Chat ID.'}`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Terjadi kesalahan saat menguji: ${err?.message || 'Koneksi gagal'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await onSave({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
        topicId: topicId.trim() || undefined,
        enabled: enabled
      });
      setSaveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Gagal menyimpan ke database: ${error?.message || 'Error'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 relative my-8 text-slate-800">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          title="Tutup"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 mb-5 pb-4 border-b border-slate-100">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-200 flex-shrink-0">
            <SendIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">Pengaturan Notifikasi Telegram</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                enabled && botToken && chatId 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {enabled && botToken && chatId ? '● Aktif' : '○ Nonaktif'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Kirimkan alert otomatis ke Telegram admin/grup saat ada permohonan data baru yang disubmit.
            </p>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Toggle Switch Enabled */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <label htmlFor="telegram-toggle" className="font-bold text-xs text-slate-900 block cursor-pointer">
                Aktifkan Notifikasi Telegram Otomatis
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Bot akan mengirim detail permohonan ke Chat ID yang ditentukan setiap kali form disubmit.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                id="telegram-toggle"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Bot Token Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Telegram Bot Token <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <EyeIcon className="w-3.5 h-3.5" />
                <span>{showToken ? 'Sembunyikan' : 'Lihat Token'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Contoh: 7123456789:AAFxz_SAMPLE_TOKEN_HERE"
                required={enabled}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Token rahasia dari @BotFather saat membuat bot Telegram.
            </p>
          </div>

          {/* Chat ID & Optional Topic ID */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chat ID / Group ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Contoh: 123456789 atau -1001234567890"
                required={enabled}
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                ID user pribadi atau ID grup/channel (diawali tanda <code className="text-slate-600 font-bold">-</code> jika grup).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Topic ID <span className="text-slate-400 text-[10px] font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                placeholder="cth: 2"
                className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-850 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Jika grup bertopik.
              </p>
            </div>
          </div>

          {/* Quick Guide Collapsible */}
          <div className="border border-sky-100 bg-sky-50/60 rounded-xl p-3 text-xs">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full flex items-center justify-between text-sky-900 font-bold text-xs hover:text-sky-950 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircleIcon className="w-4 h-4 text-sky-600" />
                <span>Panduan Cara Mendapatkan Bot Token & Chat ID</span>
              </span>
              <span className="text-[11px] text-sky-600">{showGuide ? '▲ Tutup' : '▼ Lihat Panduan'}</span>
            </button>

            {showGuide && (
              <div className="mt-2.5 pt-2.5 border-t border-sky-100/80 text-[11px] text-slate-700 space-y-2 leading-relaxed animate-in fade-in">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <p>
                    Buka Telegram, cari bot <strong>@BotFather</strong>. Kirim perintah <code className="bg-sky-100 text-sky-900 px-1 py-0.5 rounded">/newbot</code>, beri nama bot Anda, lalu salin <strong>HTTP API Token</strong> yang diberikan.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <p>
                    Buka bot yang baru Anda buat lalu klik tombol <strong>START</strong> (atau jika ingin menerima notifikasi di Grup, undang bot tersebut ke dalam Grup Telegram Anda dan jadikan admin/beri izin kirim pesan).
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <p>
                    Cari tahu Chat ID Anda dengan mengirim pesan apa saja ke <strong>@userinfobot</strong> (untuk chat pribadi) atau tambahkan <strong>@raw_data_bot</strong> ke grup Anda untuk melihat Chat ID grup (biasanya berupa angka minus, misal: <code className="bg-sky-100 text-sky-900 px-1 py-0.5 rounded">-1001234567890</code>).
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <p>
                    Tempelkan <strong>Bot Token</strong> dan <strong>Chat ID</strong> di form ini, lalu klik tombol <strong>Test Notifikasi</strong> di bawah untuk memastikan pesan terkirim.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Test Notification Feedback */}
          {testResult && (
            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in duration-150 ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}>
              {testResult.success ? (
                <CheckIcon className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <InfoIcon className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium leading-relaxed">
                {testResult.message}
              </div>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Pengaturan Telegram berhasil disimpan ke database!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={isTesting || !botToken || !chatId}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            >
              {isTesting ? (
                <Spinner className="w-3.5 h-3.5 text-sky-600" />
              ) : (
                <SendIcon className="w-3.5 h-3.5 text-sky-600" />
              )}
              <span>{isTesting ? 'Mengirim Tes...' : 'Test Notifikasi'}</span>
            </button>

            <div className="w-full sm:w-auto flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="w-1/2 sm:w-auto text-xs py-2 px-4 border-slate-200 text-slate-700"
              >
                Batal
              </Button>
              <Button
                type="submit"
                isLoading={isSaving}
                className="w-1/2 sm:w-auto text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                <CheckIcon className="w-3.5 h-3.5 mr-1" />
                Simpan Pengaturan
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
