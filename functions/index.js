// functions/index.js

// Impor modul yang diperlukan
const functions = require("firebase-functions");
// Modul utama Firebase Functions
const admin = require("firebase-admin");
// Modul Firebase Admin SDK untuk berinteraksi
// dengan Firebase services (Firestore, Storage)
const axios = require("axios");
// Modul Axios untuk melakukan HTTP requests
// ke Suno API

// Inisialisasi Firebase Admin SDK
// Ini memungkinkan Cloud Function Anda untuk berinteraksi
// dengan Firestore dan Storage
admin.initializeApp();

// Referensi ke Firestore dan Storage
const db = admin.firestore();
const storage = admin.storage();

// --- PENTING: Konfigurasi API Key Suno ---
// Anda harus menyimpan API Key Anda dengan aman.
// Cara terbaik adalah menggunakan Firebase Environment Configuration.
// Jalankan perintah ini di terminal (dari folder 'functions'):
// firebase functions:config:set sunoapi.key="YOUR_SUNO_API_KEY_HERE"
// Ganti "YOUR_SUNO_API_KEY_HERE" dengan API Key Suno Anda yang sebenarnya.
// Setelah itu, Anda bisa mengaksesnya seperti di bawah ini:
const SUNO_API_KEY = functions.config().sunoapi.key;
const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1"; // Base URL Suno API

/**
 * Fungsi untuk menunda eksekusi selama waktu tertentu.
 * Digunakan untuk polling status tugas.
 * @param {number} ms - Durasi penundaan dalam milidetik.
 * @return {Promise<void>} Sebuah Promise yang akan selesai setelah penundaan.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cloud Function utama untuk menghasilkan musik menggunakan Suno API.
 * Mengambil prompt dari frontend, melakukan polling status, mengunduh audio,
 * mengunggahnya ke Firebase Storage, dan menyimpan metadata ke Firestore.
 * @param {object} data - Payload data dari frontend.
 * @param {string} data.prompt - Prompt teks untuk generasi musik.
 * @param {functions.https.CallableContext} context - Konteks panggilan fungsi.
 * @return {Promise<object>} Objek yang menunjukkan status keberhasilan atau
 * kegagalan.
 * @throws {functions.https.HttpsError} Jika terjadi error pada validasi,
 * Suno API, atau timeout.
 */
exports.generateMusic = functions.https.onCall(async (data, context) => {
  // Pastikan permintaan datang dari pengguna yang terautentikasi
  // (opsional tapi disarankan untuk produksi)
  // if (!context.auth) {
  //   throw new functions.https.HttpsError("unauthenticated",
  //     "The function must be called while authenticated.");
  // }

  const prompt = data.prompt;
  // Ambil prompt dari data yang dikirim frontend

  if (!prompt) {
    throw new functions.https.HttpsError("invalid-argument",
        "Prompt is required.");
  }

  try {
    // 1. Panggil Suno API untuk memulai generasi musik
    const generateResponse = await axios.post(
        `${SUNO_BASE_URL}/generate`,
        {
          prompt: prompt,
          // Anda bisa menambahkan parameter lain seperti 'tags', 'title',
          // 'make_instrumental' sesuai dokumentasi Suno API jika diperlukan.
          // Contoh: tags: "pop, upbeat", title: "My AI Song"
        },
        {
          headers: {
            "Authorization": `Bearer ${SUNO_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
    );

    const taskId = generateResponse.data.id; // Dapatkan ID tugas dari Suno API
    let musicData = null;
    let attempts = 0;
    const maxAttempts = 30;
    // Maksimal percobaan polling (misal 30 * 5 detik = 150 detik = 2.5 menit)
    const pollInterval = 5000; // Interval polling 5 detik

    // 2. Lakukan Polling ke Suno API untuk mendapatkan status musik
    while (!musicData && attempts < maxAttempts) {
      await sleep(pollInterval); // Tunggu sebelum polling berikutnya
      attempts++;

      const statusResponse = await axios.get(
          `${SUNO_BASE_URL}/task/${taskId}`,
          {
            headers: {
              "Authorization": `Bearer ${SUNO_API_KEY}`,
            },
          },
      );

      // Periksa apakah status sudah 'completed' dan ada URL audio
      if (statusResponse.data.status === "completed" &&
          statusResponse.data.audio_url) {
        musicData = statusResponse.data;
      } else if (statusResponse.data.status === "failed") {
        throw new functions.https.HttpsError("internal",
            "Music generation failed on Suno API.");
      }
      // Jika status masih 'processing' atau lainnya, lanjutkan polling
    }

    if (!musicData) {
      throw new functions.https.HttpsError("deadline-exceeded",
          "Music generation timed out.");
    }

    // 3. Unduh file audio dari Suno API
    const audioUrl = musicData.audio_url;
    const audioFileName = `music/${taskId}.mp3`; // Nama file di Storage
    const fileBucket = storage.bucket(); // Dapatkan bucket default
    const file = fileBucket.file(audioFileName);

    const audioResponse = await axios.get(
        audioUrl, {responseType: "arraybuffer"});
    await file.save(audioResponse.data, {
      metadata: {
        contentType: "audio/mpeg", // Sesuaikan jika formatnya bukan mp3
      },
    });

    // 4. Dapatkan URL publik dari file audio di Firebase Storage
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491", // Tanggal kadaluarsa yang sangat jauh
    });

    // 5. Simpan metadata musik ke Firestore
    await db.collection("generatedMusic").add({
      prompt: prompt,
      title: musicData.title ||
        `Generated Music from Prompt: ${prompt.substring(0, 50)}...`,
      // Judul dari Suno atau dari prompt
      lyrics: musicData.lyrics ||
        "No lyrics provided by Suno API for instrumental.",
      // Lirik dari Suno
      audioUrl: downloadUrl, // URL audio dari Firebase Storage
      sunoTaskId: taskId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {success: true, message: "Music generated and saved successfully!"};
  } catch (error) {
    console.error("Error in generateMusic function:", error);
    // Tangani error dan kirim kembali ke frontend
    if (error.response) {
      // Error dari Suno API
      throw new functions.https.HttpsError("internal",
          `Suno API Error: ${error.response.status} - ` +
          `${error.response.data.detail || error.message}`);
    } else if (error instanceof functions.https.HttpsError) {
      // Error yang sudah kita definisikan
      throw error;
    } else {
      // Error tak terduga
      throw new functions.https.HttpsError("unknown",
          "An unexpected error occurred.",
          error.message);
    }
  }
});
