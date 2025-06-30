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

// Referensi ke Firestore
const db = admin.firestore();

// --- PENTING: Konfigurasi API Key Suno ---
// Untuk testing, hardcode API key di sini (JANGAN untuk produksi)
const SUNO_API_KEY = "987c036d9411a39eb8fe24f119d042d2";
const SUNO_BASE_URL = "https://apibox.erweima.ai/api/v1"; // Base URL Suno API

/**
 * Fungsi utama untuk generate musik
 * @param {object} data - Payload data dari frontend.
 * @param {string} data.prompt - Prompt teks untuk generasi musik.
 * @param {functions.https.CallableContext} context - Konteks panggilan fungsi.
 * @return {Promise<object>}

 * @throws {functions.https.HttpsError}
 */
exports.generateMusic = functions.https.onCall(async (data, context) => {
  if (!SUNO_API_KEY) {
    throw new functions.https.HttpsError(
        "failed-precondition",
        [
          "SUNO_API_KEY is not configured.",
          "Please set it using",
          "firebase functions:secrets:set SUNO_API_KEY",
        ].join(" "),
    );
  }

  const prompt =
    (data && data.prompt) ||
    (data && data.data && data.data.prompt);
  if (!prompt) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Prompt is required.",
    );
  }

  // URL callback function
  const callBackUrl =
        "https://us-central1-sinau-eae8b.cloudfunctions.net/sunoCallback";

  try {
    // Kirim request ke Suno API
    const generateResponse = await axios.post(
        `${SUNO_BASE_URL}/generate`,
        {
          prompt: prompt,
          model: "V4_5",
          callBackUrl: callBackUrl,
          instrumental: false,
          customMode: false,
        },
        {
          headers: {
            "Authorization": `Bearer ${SUNO_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
    );

    // Kembalikan taskId ke frontend
    return {
      success: true,
      message: "Task submitted to Suno API.",
      taskId: generateResponse.data.data.taskId,
    };
  } catch (error) {
    console.error("Error in generateMusic function:", error);
    if (error.response) {
      throw new functions.https.HttpsError(
          "internal",
          `Suno API Error: ${error.response.status} - ` +
                    `${error.response.data.msg || error.message}`,
      );
    } else if (error instanceof functions.https.HttpsError) {
      throw error;
    } else {
      throw new functions.https.HttpsError(
          "unknown",
          "An unexpected error occurred.",
          error.message,
      );
    }
  }
});

// Fungsi polling status task Suno API
exports.getMusicStatus = functions.https.onCall(async (data, context) => {
  if (!SUNO_API_KEY) {
    throw new functions.https.HttpsError(
        "failed-precondition",
        [
          "SUNO_API_KEY is not configured.",
          "Please set it using",
          "firebase functions:secrets:set SUNO_API_KEY",
        ].join(" "),
    );
  }
  const taskId =
    (data && data.taskId) ||
    (data && data.data && data.data.taskId);
  if (!taskId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "taskId is required.",
    );
  }
  try {
    const statusResponse = await axios.get(
        `${SUNO_BASE_URL}/getMusicGenerationDetails?taskId=${taskId}`,
        {
          headers: {
            "Authorization": `Bearer ${SUNO_API_KEY}`,
          },
        },
    );
    // Kembalikan data status ke frontend
    return {
      success: true,
      data: statusResponse.data.data,
    };
  } catch (error) {
    console.error("Error in getMusicStatus function:", error);
    if (error.response) {
      throw new functions.https.HttpsError(
          "internal",
          `Suno API Error: ${error.response.status} - ` +
                    `${error.response.data.msg || error.message}`,
      );
    } else if (error instanceof functions.https.HttpsError) {
      throw error;
    } else {
      throw new functions.https.HttpsError(
          "unknown",
          "An unexpected error occurred.",
          error.message,
      );
    }
  }
});

// Endpoint callback untuk Suno API
exports.sunoCallback = functions.https.onRequest((req, res) => {
  console.log("Suno callback received:", req.body);

  // Simpan data callback ke Firestore
  db.collection("sunoCallbacks").add({
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    data: req.body,
  });

  res.status(200).send({success: true});
});
