// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection, query, orderBy } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAnvt-9y-fJpU7ctSLWURFxifv5qYHn6oo",
  authDomain: "sinau-eae8b.firebaseapp.com",
  projectId: "sinau-eae8b",
  storageBucket: "sinau-eae8b.appspot.com",
  messagingSenderId: "739487555781",
  appId: "1:739487555781:web:a75e89c8ced4862aecd0ac",
  measurementId: "G-15GMTSZR66"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "us-central1"); // Region harus sama dengan deploy

export { db, storage, functions, getDocs, collection, query, orderBy };