import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPmpN2BdzBL_KbZhQaLNfxAtN6U4zsY6o",
  authDomain: "menedzerhasel-f1c78.firebaseapp.com",
  projectId: "menedzerhasel-f1c78",
  storageBucket: "menedzerhasel-f1c78.firebasestorage.app",
  messagingSenderId: "96208279949",
  appId: "1:96208279949:web:a488493b8156c711a845c4"
};

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

function bufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

async function encryptVault(key, text) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, key, enc.encode(text)
    );
    return {
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(ciphertext)
    };
}

async function decryptVault(key, ivStr, cipherStr) {
    const iv = base64ToBuffer(ivStr);
    const ciphertext = base64ToBuffer(cipherStr);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, key, ciphertext
    );
    return new TextDecoder().decode(decrypted);
}

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
    try {
        const parts = vaultString.split("|");
        const decryptedJsonString = await decryptVault(currentKey, parts[1], parts[2]);
        decryptedVault = JSON.parse(decryptedJsonString);
        renderEntries();
    } catch (e) {
        console.error("Błąd dekodowania:", e);
    }
}

async function saveVault() {
    if (!currentKey) return;
    try {
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await encryptVault(currentKey, vaultText);
        const salt = localStorage.getItem("pm_salt");
        const vaultString = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;
        await setDoc(doc(db, "vaults", "dominikax"), { vault: vaultString });
    } catch (e) {
        console.error("Błąd zapisu:", e);
    }
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
    } catch (err) { 
        console.error(err);
        alert("Błąd logowania"); 
    }
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
    document.getElementById("entry-name").value = "";
    document.getElementById("entry-login").value = "";
    document.getElementById("entry-password").value = "";
});

function renderEntries() {
    entriesList.innerHTML = "";
    decryptedVault.forEach((entry) => {
        const li = document.createElement("li");
        li.innerHTML = `<div><b>${entry.name}</b><br>Login: ${entry.login}</div>`;
        const b1 = document.createElement("button");
        b1.textContent = "Hasło";
        b1.onclick = () => navigator.clipboard.writeText(entry.password);
        li.appendChild(b1);
        entriesList.appendChild(li);
    });
}

generateQrBtn?.addEventListener("click", async () => {
    if (!qrContainer) return;
    qrContainer.innerHTML = "";
    qrContainer.classList.add("qr-fullscreen");
    try {
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await encryptVault(currentKey, vaultText);
        let salt = localStorage.getItem("pm_salt");
        const qrData = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;

        new QRCode(qrContainer, {
            text: qrData,
            width: 350,
            height: 350,
            colorDark: "#000",
            colorLight: "#fff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Zamknij QR";
        closeBtn.className = "close-qr-btn";
        closeBtn.onclick = () => {
            qrContainer.classList.remove("qr-fullscreen");
            qrContainer.innerHTML = "";
        };
        qrContainer.appendChild(closeBtn);
    } catch (e) {
        console.error("QR ERROR:", e);
    }
});