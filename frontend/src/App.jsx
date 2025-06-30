// src/App.jsx
import { useState, useEffect } from 'react';
// Impor storage, ref, uploadBytesResumable, getDownloadURL
import { db, storage, functions } from './firebase-config'; // Impor 'storage' dari file konfigurasi
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, query as fsQuery, orderBy as fsOrderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Impor fungsi Storage
import { httpsCallable } from "firebase/functions";

const generateMusic = httpsCallable(functions, "generateMusic");
const getMusicStatus = httpsCallable(functions, "getMusicStatus");

function App() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [imageUpload, setImageUpload] = useState(null); // State untuk file gambar yang dipilih
  const [uploadProgress, setUploadProgress] = useState(0); // State untuk progress upload
  const [isUploading, setIsUploading] = useState(false); // State untuk status upload
  const [musicPrompt, setMusicPrompt] = useState(''); // State untuk prompt musik
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false); // State untuk status generate musik
  const [generatedMusic, setGeneratedMusic] = useState(null); // State untuk menyimpan hasil musik
  const [musicStatus, setMusicStatus] = useState(null); // State untuk status polling
  const [showLyric, setShowLyric] = useState(false); // State untuk show/hide lyric
  const [pollingTaskId, setPollingTaskId] = useState(null); // TaskId yang sedang dipolling
  const [songs, setSongs] = useState([]); // State untuk gallery lagu
  const [showLyricMap, setShowLyricMap] = useState({}); // State show lirik per lagu
  const notesCollectionRef = collection(db, 'notes');

  useEffect(() => {
    const q = query(notesCollectionRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setNotes(notesData);
    });
    return () => unsubscribe();
  }, []);

  // Polling otomatis ke getMusicStatus
  useEffect(() => {
    if (!pollingTaskId) return;
    let intervalId = null;
    let stopped = false;
    async function pollStatus() {
      try {
        const res = await getMusicStatus({ taskId: pollingTaskId });
        if (res.data && res.data.success && res.data.data) {
          setMusicStatus(res.data.data);
          // Jika sudah ada stream_audio_url dan status success, stop polling
          if (
            Array.isArray(res.data.data.data) &&
            res.data.data.data.length > 0 &&
            res.data.data.data[0].stream_audio_url
          ) {
            stopped = true;
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        // Optional: handle error
      }
    }
    pollStatus();
    intervalId = setInterval(() => {
      if (!stopped) pollStatus();
    }, 3000);
    return () => clearInterval(intervalId);
  }, [pollingTaskId]);

  // Fetch semua lagu dari Firestore untuk gallery
  useEffect(() => {
    async function fetchSongs() {
      const q = fsQuery(collection(db, 'sunoCallbacks'), fsOrderBy('receivedAt', 'desc'));
      const snap = await getDocs(q);
      // Log isi dokumen untuk debug
      snap.forEach(doc => {
        console.log("Isi dokumen:", doc.data());
      });
      const allSongs = [];
      snap.forEach(doc => {
        const arr = doc.data().data?.data;
        if (Array.isArray(arr)) {
          arr.forEach(song => allSongs.push(song));
        }
      });
      setSongs(allSongs);
    }
    fetchSongs();
  }, []);

  // Fungsi untuk upload gambar
  const handleUploadImage = async () => {
    if (imageUpload === null) return null; // Jika tidak ada gambar, kembalikan null

    setIsUploading(true); // Mulai proses upload
    const imageRef = ref(storage, `images/${imageUpload.name + Date.now()}`); // Buat referensi unik
    const uploadTask = uploadBytesResumable(imageRef, imageUpload); // Mulai upload

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // Pantau progress upload
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          // Handle error saat upload
          console.error("Error uploading image:", error);
          setIsUploading(false);
          reject(error);
        },
        async () => {
          // Setelah upload selesai, dapatkan URL gambar
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setIsUploading(false); // Selesai upload
          setUploadProgress(0); // Reset progress
          setImageUpload(null); // Bersihkan file yang dipilih
          resolve(downloadURL); // Kembalikan URL gambar
        }
      );
    });
  };

  // Fungsi untuk menambahkan catatan baru (dimodifikasi untuk mendukung gambar)
  const addNote = async () => {
    if (newNote.trim() === '' && imageUpload === null) {
      alert('Catatan atau gambar tidak boleh kosong!');
      return;
    }

    let imageUrl = null;
    if (imageUpload) {
      imageUrl = await handleUploadImage(); // Upload gambar jika ada
    }

    try {
      await addDoc(notesCollectionRef, {
        text: newNote,
        imageUrl: imageUrl, // Simpan URL gambar di Firestore
        createdAt: serverTimestamp()
      });
      setNewNote('');
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  // Fungsi untuk generate musik menggunakan Suno API
  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim()) {
      alert('Masukkan prompt untuk generate musik!');
      return;
    }
    setIsGeneratingMusic(true);
    setMusicStatus(null);
    setShowLyric(false);
    alert('Permintaan generate lagu dikirim, mohon tunggu hasilnya...');
    try {
      const result = await generateMusic({ prompt: musicPrompt });
      if (result.data.success) {
        setGeneratedMusic(result.data);
        setPollingTaskId(result.data.taskId); // Mulai polling status
        setMusicPrompt('');
      } else {
        alert('Gagal generate musik: ' + result.data.message);
      }
    } catch (error) {
      alert('Error: ' + (error.message || 'Terjadi kesalahan saat generate musik'));
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: 'auto' }}>
      <h1>Aplikasi Catatan & Foto Firebase</h1>

      {/* Form Tambah Catatan */}
      <div style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Tulis catatan baru..."
          style={{ padding: '10px', width: 'calc(100% - 22px)', marginBottom: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
        />
        <input
          type="file"
          onChange={(e) => setImageUpload(e.target.files[0])} // Pilih file gambar
          style={{ marginBottom: '10px' }}
        />

        {/* Progress Bar Upload */}
        {isUploading && (
          <div style={{ width: '100%', backgroundColor: '#f3f3f3', borderRadius: '5px', marginBottom: '10px' }}>
            <div
              style={{
                width: `${uploadProgress}%`,
                height: '20px',
                backgroundColor: '#4CAF50',
                borderRadius: '5px',
                textAlign: 'center',
                color: 'white',
                lineHeight: '20px'
              }}
            >
              {Math.round(uploadProgress)}%
            </div>
          </div>
        )}

        <button
          onClick={addNote}
          disabled={isUploading} // Disable tombol saat upload berlangsung
          style={{
            padding: '10px 15px',
            backgroundColor: isUploading ? '#ccc' : '#2196F3', // Warna berubah saat disabled
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isUploading ? 'not-allowed' : 'pointer'
          }}
        >
          {isUploading ? 'Mengunggah...' : 'Tambah Catatan & Foto'}
        </button>
      </div>

      {/* Form Generate Musik AI */}
      <div style={{ marginBottom: '20px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
        <h3 style={{ marginTop: '0', color: '#333' }}>🎵 Generate Musik AI dengan Suno</h3>
        <input
          type="text"
          value={musicPrompt}
          onChange={(e) => setMusicPrompt(e.target.value)}
          placeholder="Contoh: musik pop ceria dengan gitar akustik..."
          style={{ 
            padding: '10px', 
            width: 'calc(100% - 22px)', 
            marginBottom: '10px', 
            borderRadius: '5px', 
            border: '1px solid #ddd',
            fontSize: '14px'
          }}
        />
        <button
          onClick={handleGenerateMusic}
          disabled={isGeneratingMusic}
          style={{
            padding: '10px 15px',
            backgroundColor: isGeneratingMusic ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isGeneratingMusic ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {isGeneratingMusic ? 'Mengirim prompt...' : 'Generate Musik'}
        </button>
        
        {/* Status Generate Musik */}
        {isGeneratingMusic && (
          <div style={{ 
            marginTop: '10px', 
            padding: '10px', 
            backgroundColor: '#e3f2fd', 
            borderRadius: '5px',
            border: '1px solid #2196F3'
          }}>
            <p style={{ margin: '0', color: '#1976d2' }}>
              ⏳ Sedang generate musik... Ini bisa memakan waktu 1-2 menit.
            </p>
          </div>
        )}

        {/* Hasil Musik */}
        {pollingTaskId && (
          <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
            {!musicStatus || !musicStatus.data || !musicStatus.data[0] || !musicStatus.data[0].stream_audio_url ? (
              <div>Menunggu hasil generate musik...</div>
            ) : (
              <div>
                <h2>{musicStatus.data[0].title}</h2>
                <img src={musicStatus.data[0].image_url} alt={musicStatus.data[0].title} style={{ width: '100%', borderRadius: 8 }} />
                <audio controls src={musicStatus.data[0].stream_audio_url} style={{ width: '100%', marginTop: 16 }} />
                <div style={{ marginTop: 16 }}>
                  <a href={musicStatus.data[0].stream_audio_url} download>
                    <button>Download</button>
                  </a>
                  <button style={{ marginLeft: 8 }} onClick={() => setShowLyric((v) => !v)}>
                    {showLyric ? 'Hide Lyric' : 'Show Lyric'}
                  </button>
                </div>
                {showLyric && (
                  <pre style={{
                    background: '#f5f5f5',
                    padding: 16,
                    borderRadius: 8,
                    marginTop: 16,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {musicStatus.data[0].prompt}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gallery Lagu */}
      <div style={{ marginTop: 32 }}>
        <h2>Gallery Lagu</h2>
        {songs.length === 0 ? (
          <div>Belum ada lagu yang di-generate.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            {songs.map((song, idx) => (
              <div key={song.id + idx} style={{ width: 260, border: '1px solid #eee', borderRadius: 8, padding: 12, background: '#fafbfc' }}>
                <img src={song.image_url} alt={song.title} style={{ width: '100%', borderRadius: 6 }} />
                <h4 style={{ margin: '8px 0 4px 0' }}>{song.title}</h4>
                <audio controls src={song.stream_audio_url} style={{ width: '100%' }} />
                <div style={{ marginTop: 8 }}>
                  <a href={song.stream_audio_url} download>
                    <button>Download</button>
                  </a>
                  <button style={{ marginLeft: 8 }} onClick={() => setShowLyricMap(m => ({ ...m, [song.id]: !m[song.id] }))}>
                    {showLyricMap[song.id] ? 'Hide Lyric' : 'Show Lyric'}
                  </button>
                </div>
                {showLyricMap[song.id] && (
                  <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 6, marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                    {song.prompt}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;