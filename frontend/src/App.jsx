// src/App.jsx
import { useState, useEffect } from 'react';
// Impor storage, ref, uploadBytesResumable, getDownloadURL
import { db, storage } from './firebase-config'; // Impor 'storage' dari file konfigurasi
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Impor fungsi Storage

function App() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [imageUpload, setImageUpload] = useState(null); // State untuk file gambar yang dipilih
  const [uploadProgress, setUploadProgress] = useState(0); // State untuk progress upload
  const [isUploading, setIsUploading] = useState(false); // State untuk status upload
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

      {/* Daftar Catatan */}
      <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h2>Daftar Catatan</h2>
        {notes.length === 0 ? (
          <p>Belum ada catatan. Tambahkan satu!</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {notes.map((note) => (
              <li key={note.id} style={{
                backgroundColor: '#f9f9f9',
                padding: '10px',
                marginBottom: '10px',
                borderRadius: '5px',
                border: '1px solid #eee',
                wordWrap: 'break-word'
              }}>
                {note.text}
                {note.imageUrl && ( // Tampilkan gambar jika ada URL-nya
                  <img 
                    src={note.imageUrl} 
                    alt="Catatan Gambar" 
                    style={{ maxWidth: '100%', height: 'auto', display: 'block', marginTop: '10px', borderRadius: '5px' }} 
                  />
                )}
                {note.createdAt && (
                  <span style={{ fontSize: '0.8em', color: '#888', display: 'block', marginTop: '5px' }}>
                    {new Date(note.createdAt.seconds * 1000).toLocaleString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;