import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAMePGCH8FZElB3GmHh-_4KaPr5r94o4N4",
    authDomain: "hakilink-ef5fc.firebaseapp.com",
    projectId: "hakilink-ef5fc",
    storageBucket: "hakilink-ef5fc.firebasestorage.app",
    messagingSenderId: "103913424592",
    appId: "1:103913424592:web:77298ffdc3c8c6cfd8c0d5",
    measurementId: "G-X48FT135XB"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);