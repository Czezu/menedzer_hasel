import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- WKLEJ TU SWOJE DANE Z FIREBASE ---
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCPmpN2BdzBL_KbZhQaLNfxAtN6U4zsY6o",
  authDomain: "menedzerhasel-f1c78.firebaseapp.com",
  projectId: "menedzerhasel-f1c78",
  storageBucket: "menedzerhasel-f1c78.firebasestorage.app",
  messagingSenderId: "96208279949",
  appId: "1:96208279949:web:a488493b8156c711a845c4"
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentKey = null;
let decryptedVault = [];

const authSection = document.getElementById('auth-section');
const vaultSection = document.getElementById('vault-section');
const authForm = document.getElementById('auth-form');
const masterPasswordInput = document.getElementById('master-password');
const addEntryForm = document.getElementById('add-entry-form');
const entriesList = document.getElementById('entries-list');
const generateQrBtn = document.getElementById('generate-qr-btn');
const qrContainer = document.getElementById("qrcode");

// --- SYNC Z FIREBASE (AUTOMATYCZNIE) ---
async function startSync() {
    const docRef = doc(db, "vaults", "dominikax");
    onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            processVaultData(data.vault);
        }
    });
}

async function processVaultData(vaultString) {
    if (!vaultString || !currentKey) return;
    const parts = vaultString.split("|");
    const decryptedJsonString = await decryptVault(currentKey, parts[1], parts[2]);
    decryptedVault = JSON.parse(decryptedJsonString);
    renderEntries();
}

async function saveVault() {
    if (!currentKey) return;
    const vaultText = JSON.stringify(decryptedVault);
    const encrypted = await encryptVault(currentKey, vaultText);
    const salt = localStorage.getItem("pm_salt");
    const vaultString = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;
    await setDoc(doc(db, "vaults", "dominikax"), { vault: vaultString });
}

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = masterPasswordInput.value;
    try {
        let salt = localStorage.getItem("pm_salt");
        if (!salt) {
            const s = crypto.getRandomValues(new Uint8Array(16));
            salt = bufferToBase64(s);
            localStorage.setItem("pm_salt", salt);
            currentKey = await deriveKey(password, s);
            decryptedVault = [];
            await saveVault();
        } else {
            currentKey = await deriveKey(password, base64ToBuffer(salt));
        }
        authSection.classList.add("hidden");
        vaultSection.classList.remove("hidden");
        startSync();
    } catch (err) { alert("Błąd logowania"); }
});

addEntryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    decryptedVault.push({
        name: document.getElementById("entry-name").value,
        login: document.getElementById("entry-login").value,
        password: document.getElementById("entry-password").value,
        url: document.getElementById("entry-url")?.value || ""
    });
    await saveVault();
});

function renderEntries() {
    entriesList.innerHTML = "";
    decryptedVault.forEach((entry, index) => {
        const li = document.createElement("li");
        li.innerHTML = `<div><b>${entry.name}</b><br>Login: ${entry.login}</div>`;
        const b1 = document.createElement("button");
        b1.textContent = "Hasło";
        b1.onclick = () => navigator.clipboard.writeText(entry.password);
        li.appendChild(b1);
        entriesList.appendChild(li);
    });
}