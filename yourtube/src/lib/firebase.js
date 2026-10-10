// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAd25f6gmiTBlz5HUYZ7uLCHMgIy_U5LsM",
  authDomain: "yourtube-797ad.firebaseapp.com",
  projectId: "yourtube-797ad",
  storageBucket: "yourtube-797ad.firebasestorage.app",
  messagingSenderId: "21644707402",
  appId: "1:21644707402:web:225b9b33738a8a27335e4df",
  measurementId: "G-S59P23NS5N",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
export { auth, provider };
