# Sistem Permintaan Data Internal (Internal Data Requesting Form)

Aplikasi web modern untuk pengajuan dan pemrosesan permohonan data internal instansi secara terstruktur, cepat, dan transparan. Terintegrasi langsung dengan Firebase Authentication (Google Sign-In) dan Cloud Firestore.

## 🚀 Fitur Utama
- **Autentikasi Pengguna**: Login mudah & aman dengan akun Google.
- **Formulir Permohonan Lengkap**: Kategori permohonan, tujuan penggunaan, tingkat urgensi (Normal, Mendesak, Sangat Mendesak), serta unggah surat/dokumen pendukung.
- **Dashboard & Pelacakan Realtime**: Pantau status tiket (*PENDING*, *PROCESSING*, *COMPLETED*, *REJECTED*) secara live.
- **Multi-File Upload Hasil & Chunking**: Admin dapat mengunggah berkas hasil data hingga multiple files sekaligus dengan sistem subkoleksi & chunking otomatis untuk menjaga performa database.
- **PIN Akses Unduhan**: Keamanan ekstra dengan kode PIN 6-digit untuk mengunduh berkas hasil.
- **Pencarian & Filter Canggih**: Filter berdasarkan status, rentang tanggal, nomor tiket, atau kata kunci pencarian.

---

## 🛠️ Panduan Menjalankan di Lokal (Local Development)

### 1. Prasyarat
- [Node.js](https://nodejs.org/) (versi 18 atau lebih baru)
- npm / yarn / pnpm / bun

### 2. Instalasi Dependensi
Clone repository ini dan jalankan perintah install:
```bash
npm install
```

### 3. Menjalankan Server Lokal
Jalankan development server:
```bash
npm run dev
```
Buka browser di alamat yang muncul di terminal (biasanya `http://localhost:3000` atau `http://localhost:5173`).

---

## 🔐 Konfigurasi Database & Autentikasi
Aplikasi ini sudah terkonfigurasi dengan Cloud Firestore melalui:
- `firebase-applet-config.json`
- `firebase.ts`
- `firestore.rules`

Data tersimpan secara aman di Google Cloud Platform (`ai-studio-664224fd-2648-4b95-9fab-6c119960f71a`). Semua perubahan data di lokal akan otomatis tersinkronisasi ke cloud database yang sama.

> **Tips Google Sign-In di Lokal**:
> Jika saat login Google di `localhost` muncul pesan domain belum diizinkan, pastikan domain `localhost` sudah terdaftar di daftar **Authorized Domains** pada Firebase Console -> Authentication -> Settings.

---

## 📦 Build untuk Production
Untuk mengompilasi aplikasi menjadi static build yang siap di-deploy (misalnya ke Vercel, Netlify, atau Firebase Hosting):
```bash
npm run build
```
Output build akan tersimpan di direktori `dist/`.
