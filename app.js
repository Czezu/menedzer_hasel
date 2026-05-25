import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCPmpN2BdzBL_KbZhQaLNfxAtN6U4zsY6o",
    authDomain: "menedzerhasel-f1c78.firebaseapp.com",
    projectId: "menedzerhasel-f1c78",
    storageBucket: "menedzerhasel-f1c78.firebasestorage.app",
    messagingSenderId: "96208279949",
    appId: "1:96208279949:web:a488493b8156c711a845c4"
};

// Inicjalizacja struktur Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentKey = null;
let decryptedVault = [];
let isLoginMode = true;
let unsubscribeSync = null;

// Elementy DOM DOM
const authSection = document.getElementById('auth-section');
const vaultSection = document.getElementById('vault-section');
const authForm = document.getElementById('auth-form');
const authHeading = document.getElementById('auth-heading');
const emailInput = document.getElementById('auth-email');
const authPasswordInput = document.getElementById('auth-password');
const masterPasswordInput = document.getElementById('master-password');
const loginBtn = document.getElementById('login-btn');
const switchAuthModeBtn = document.getElementById('switch-auth-mode-btn');
const logoutBtn = document.getElementById('logout-btn');
const authError = document.getElementById('auth-error');

const addEntryForm = document.getElementById('add-entry-form');
const entriesList = document.getElementById('entries-list');
const generateQrBtn = document.getElementById('generate-qr-btn');
const qrContainer = document.getElementById("qrcode");

const toggleVoice = document.getElementById('toggle-voice');
const themeSelect = document.getElementById('theme-select');

// --- LEKTOR SPEECH SYNTHESIS ---
function speak(text) {
    if (!toggleVoice || !toggleVoice.checked) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pl-PL';
    window.speechSynthesis.speak(utterance);
}

// Mapowanie najechania myszką oraz tabowania
function setupAccessibilityListeners() {
    const targets = document.querySelectorAll('h1, h2, h3, label, p, button, input, select');
    targets.forEach(el => {
        const getSpeakText = () => {
            if (el.tagName === 'INPUT' && el.placeholder) return `${el.previousElementSibling?.textContent || ''} ${el.placeholder}`;
            if (el.tagName === 'SELECT') return `Lista wyboru. ${el.previousElementSibling?.textContent || ''}`;
            return el.textContent || el.value || el.ariaLabel || '';
        };
        el.addEventListener('mouseenter', () => getSpeakText() && speak(getSpeakText()));
        el.addEventListener('focus', () => getSpeakText() && speak(getSpeakText()));
    });
}
setupAccessibilityListeners();

// --- ZARZĄDZANIE MOTYWAMI ---
themeSelect?.addEventListener('change', (e) => {
    document.body.className = '';
    if (e.target.value === 'dark') document.body.classList.add('theme-dark');
    if (e.target.value === 'high-contrast') document.body.classList.add('theme-high-contrast');
});

// --- PRZEŁĄCZANIE TRYBU LOGOWANIA / REJESTRACJI ---
switchAuthModeBtn?.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    authError.classList.add('hidden');
    if (isLoginMode) {
        authHeading.textContent = "Logowanie do Sejfu";
        loginBtn.textContent = "Zaloguj i odblokuj";
        switchAuthModeBtn.textContent = "Chcę założyć nowe konto";
    } else {
        authHeading.textContent = "Rejestracja nowego konta";
        loginBtn.textContent = "Zarejestruj konto chmurowe";
        switchAuthModeBtn.textContent = "Mam już konto - zaloguj";
    }
    speak(authHeading.textContent);
});

// --- SYNCHRONIZACJA W CZASIE RZECZYWISTYM (ZMIANA NA USER.UID) ---
function startSync(user) {
    if (unsubscribeSync) unsubscribeSync();
    
    // Dynamiczny odczyt folderu pod UID usera
    const docRef = doc(db, "vaults", user.uid);
    unsubscribeSync = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            processVaultData(data.vault);
        } else {
            decryptedVault = [];
            renderEntries();
        }
    });
}

async function processVaultData(vaultString) {
    if (!vaultString || !currentKey) return;
    try {
        const parts = vaultString.split("|");
        const decryptedJsonString = await window.decryptVault(currentKey, parts[1], parts[2]);
        decryptedVault = JSON.parse(decryptedJsonString);
        renderEntries();
    } catch (e) {
        console.error("Błąd dekodowania danych:", e);
        authError.textContent = "Błąd dekodowania danych. Sprawdź poprawność Hasła Głównego.";
        authError.classList.remove('hidden');
        speak("Błąd dekodowania danych. Nieprawidłowe hasło główne.");
        signOut(auth);
    }
}

async function saveVault() {
    const user = auth.currentUser;
    if (!currentKey || !user) return;
    try {
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await window.encryptVault(currentKey, vaultText);
        const salt = localStorage.getItem("pm_salt");
        const vaultString = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;
        
        // Zapis w kolekcji chmurowej powiązanej z UID
        await setDoc(doc(db, "vaults", user.uid), { vault: vaultString });
    } catch (e) {
        console.error("Błąd zapisu chmury:", e);
    }
}

// --- OBSŁUGA FORMULARZA AUTORYZACJI ---
authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    
    const email = emailInput.value.trim();
    const authPassword = authPasswordInput.value;
    const masterPassword = masterPasswordInput.value;

    try {
        let userCredential;
        if (isLoginMode) {
            userCredential = await signInWithEmailAndPassword(auth, email, authPassword);
            speak("Zalogowano pomyślnie. Trwa odblokowywanie bazy.");
        } else {
            userCredential = await createUserWithEmailAndPassword(auth, email, authPassword);
            speak("Konto chmurowe utworzone pomyślnie.");
        }

        const user = userCredential.user;

        // Kryptografia klucza głównego
        let salt = localStorage.getItem("pm_salt");
        if (!salt) {
            const s = crypto.getRandomValues(new Uint8Array(16));
            salt = window.bufferToBase64(s);
            localStorage.setItem("pm_salt", salt);
            currentKey = await window.deriveKey(masterPassword, s);
            decryptedVault = [];
            await saveVault();
        } else {
            currentKey = await window.deriveKey(masterPassword, window.base64ToBuffer(salt));
        }

        authSection.classList.add("hidden");
        vaultSection.classList.remove("hidden");
        startSync(user);

    } catch (err) {
        console.error(err);
        authError.textContent = `Błąd: ${err.message}`;
        authError.classList.remove('hidden');
        speak("Wystąpił błąd autoryzacji.");
    }
});

// --- OBSŁUGA STANU ZALOGOWANIA ---
onAuthStateChanged(auth, (user) => {
    if (user && currentKey) {
        authSection.classList.add("hidden");
        vaultSection.classList.remove("hidden");
        startSync(user);
    } else {
        authSection.classList.remove("hidden");
        vaultSection.classList.add("hidden");
        if (unsubscribeSync) unsubscribeSync();
        currentKey = null;
    }
});

// Wylogowanie
logoutBtn.addEventListener("click", () => {
    signOut(auth).then(() => {
        localStorage.removeItem("pm_salt"); // Resetujemy lokalny salt, by wymusić nową derywację przy zmianie konta
        speak("Sejf został zablokowany i zamknięty.");
    });
});

// --- DODAWANIE WPISÓW ---
addEntryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    decryptedVault.push({
        name: document.getElementById("entry-name").value,
        login: document.getElementById("entry-login").value,
        password: document.getElementById("entry-password").value,
        url: document.getElementById("entry-url")?.value || ""
    });
    await saveVault();
    speak("Nowe hasło zostało pomyślnie zapisane do sejfu.");
    
    document.getElementById("entry-name").value = "";
    document.getElementById("entry-login").value = "";
    document.getElementById("entry-password").value = "";
    document.getElementById("entry-url").value = "";
});

// --- REDNEROWANIE LISTY Z CZYSZCZENIEM SCHOWKA ---
function renderEntries() {
    entriesList.innerHTML = "";
    decryptedVault.forEach((entry) => {
        const li = document.createElement("li");
        li.innerHTML = `<div><b>${entry.name}</b><br>Login: ${entry.login}</div>`;
        
        const b1 = document.createElement("button");
        b1.textContent = "Hasło";
        
        b1.onclick = () => {
            navigator.clipboard.writeText(entry.password);
            b1.textContent = "Skopiowano!";
            b1.style.background = "#16a34a";
            speak("Skopiowano hasło użytkownika do schowka systemowego. Zniknie za 30 sekund.");
            
            setTimeout(() => {
                navigator.clipboard.writeText(""); 
                b1.textContent = "Hasło";
                b1.style.background = "";
            }, 30000);
        };
        
        li.appendChild(b1);
        entriesList.appendChild(li);
    });
    setupAccessibilityListeners(); 
}

// --- GENERATOR SILNYCH HASEŁ ---
const lengthSlider = document.getElementById('password-length');
const lengthVal = document.getElementById('length-val');
const generateBtn = document.getElementById('generate-secure-password-btn');

lengthSlider?.addEventListener('input', (e) => {
    lengthVal.textContent = `${e.target.value} znaków`;
});

generateBtn?.addEventListener('click', () => {
    const length = parseInt(lengthSlider.value);
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let password = "";
    
    const randomValues = new Uint32Array(length);
    window.crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
        password += charset[randomValues[i] % charset.length];
    }
    
    const passwordInput = document.getElementById('entry-password');
    if (passwordInput) {
        passwordInput.value = password;
        passwordInput.type = "text"; 
        speak(`Wygenerowano bezpieczne hasło o długości ${length} znaków.`);
    }
});

// --- KOD QR ---
generateQrBtn?.addEventListener("click", async () => {
    if (!qrContainer || !currentKey) return;
    qrContainer.innerHTML = "";
    qrContainer.classList.add("qr-fullscreen");
    try {
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await window.encryptVault(currentKey, vaultText);
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
        speak("Wygenerowano kod QR bazy na pełnym ekranie.");
    } catch (e) {
        console.error("QR ERROR:", e);
    }
});