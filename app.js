let currentKey = null;
let decryptedVault = [];
let lastSyncHash = null;

// ---------------- UI ----------------

const authSection = document.getElementById('auth-section');
const vaultSection = document.getElementById('vault-section');
const authForm = document.getElementById('auth-form');
const masterPasswordInput = document.getElementById('master-password');
const addEntryForm = document.getElementById('add-entry-form');
const entriesList = document.getElementById('entries-list');
const generateQrBtn = document.getElementById('generate-qr-btn');
const qrContainer = document.getElementById("qrcode");

// ===================== SYNC =====================

// ===================== SYNC =====================

async function loadFromServer() {
    try {
        const res = await fetch("http://localhost:3000/sync/dominikax");
        const jsonResponse = await res.json();

        // Bezpieczne pobranie vault - jeśli to obiekt, zamieniamy go na string
        let vaultString = typeof jsonResponse.vault === 'object' 
            ? JSON.stringify(jsonResponse.vault) 
            : jsonResponse.vault;

        if (!vaultString || vaultString === "" || vaultString === "[]" || vaultString === "[object Object]") return;

        // Jeśli to format szyfrowany (salt|iv|cipher)
// Jeśli to format szyfrowany (salt|iv|cipher)
        if (vaultString.includes("|")) {
            const parts = vaultString.split("|");
            const serverSalt = parts[0];
            const iv = parts[1];
            const ciphertext = parts[2];

            // 🔥 TUTAJ JEST FIX! Zapisujemy sól z Androida na stałe w przeglądarce:
            localStorage.setItem("pm_salt", serverSalt);

            const password = masterPasswordInput.value;
            const saltBuf = base64ToBuffer(serverSalt);
            
            // Odtwarzamy ten sam klucz co w Androidzie
            currentKey = await deriveKey(password, saltBuf);

            // Odszyfrowujemy
            const decryptedJsonString = await decryptVault(currentKey, iv, ciphertext);
            
            decryptedVault = JSON.parse(decryptedJsonString);
        } else {
            // Stary format (czysty JSON)
            decryptedVault = JSON.parse(vaultString);
        }

        renderEntries();
        console.log("✅ Dane pobrane i wyświetlone");
    } catch (e) {
        console.error("❌ Błąd pobierania z serwera:", e);
    }
}

// ===================== SAVE =====================

async function saveVault() {
    try {
        if (!currentKey) return;
        // TUTAJ JEST NAPRAWA: Zmieniamy listę na tekst przed szyfrowaniem!
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await encryptVault(currentKey, vaultText);
        
        // Android oczekuje formatu salt|iv|cipher
        const salt = localStorage.getItem("pm_salt");
        const vaultString = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;

        await fetch("http://localhost:3000/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: "dominikax",
                vault: vaultString
            })
        });
    } catch (e) {
        console.error(e);
    }
}

// ===================== LOGIN =====================

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
            const saltBuf = base64ToBuffer(salt);
            currentKey = await deriveKey(password, saltBuf);

            const data = localStorage.getItem("pm_vault");
if (data) {
                const parsed = JSON.parse(data);

                const decryptedStr = await decryptVault(
                    currentKey,
                    parsed.iv,
                    parsed.ciphertext
                );
                // Dodajemy to, aby zamienić tekst na listę:
                decryptedVault = JSON.parse(decryptedStr);
            }
        }

        authSection.classList.add("hidden");
        vaultSection.classList.remove("hidden");

        renderEntries();
        loadFromServer();
        setInterval(loadFromServer, 5000);

    } catch (err) {
        console.error(err);
    }
});

// ===================== ADD ENTRY =====================

addEntryForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    decryptedVault.push({
        name: document.getElementById("entry-name").value,
        login: document.getElementById("entry-login").value,
        password: document.getElementById("entry-password").value,
        url: document.getElementById("entry-url")?.value || ""
    });

    await saveVault();
    renderEntries();
});

// ===================== RENDER =====================

function renderEntries() {
    entriesList.innerHTML = "";

    decryptedVault.forEach(entry => {
        const li = document.createElement("li");

        li.innerHTML = `
            <div>
                <b>${entry.name}</b><br>
                Login: ${entry.login}<br>
                URL: ${entry.url || "brak"}
            </div>
        `;

        const b1 = document.createElement("button");
        b1.textContent = "Login";
        b1.onclick = () => navigator.clipboard.writeText(entry.login);

        const b2 = document.createElement("button");
        b2.textContent = "Hasło";
        b2.onclick = () => navigator.clipboard.writeText(entry.password);

        const b3 = document.createElement("button");
        b3.textContent = "Otwórz";
        b3.onclick = () => window.open(entry.url || "https://google.com");

        li.append(b1, b2, b3);
        entriesList.appendChild(li);
    });
}

// ===================== QR (🔥 NAPRAWIONE SZYFROWANE) =====================

generateQrBtn?.addEventListener("click", async () => {
    if (!qrContainer) return;

    qrContainer.innerHTML = "";
    qrContainer.classList.add("qr-fullscreen");

    try {
        // 1. encrypt vault (NAPRAWIONE)
        const vaultText = JSON.stringify(decryptedVault);
        const encrypted = await encryptVault(currentKey, vaultText);

        // 2. pobierz salt (TAK JAK ANDROID OCZEKUJE)
        let salt = localStorage.getItem("pm_salt");

        if (!salt) {
            const s = crypto.getRandomValues(new Uint8Array(16));
            salt = bufferToBase64(s);
            localStorage.setItem("pm_salt", salt);
        }

        // 3. FINAL FORMAT DLA ANDROIDA
        const qrData = `${salt}|${encrypted.iv}|${encrypted.ciphertext}`;

        // 4. QR render
        new QRCode(qrContainer, {
            text: qrData,
            width: 350,
            height: 350,
            colorDark: "#000",
            colorLight: "#fff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // 5. close button
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