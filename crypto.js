// crypto.js - Obsługa bezpieczeństwa i Web Crypto API

const CRYPTO_CONFIG = {
    iterations: 100000,
    hash: 'SHA-256',
    length: 256
};

// --- BEZPIECZNE KONWERTERY ---
// Używamy btoa i atob na tablicach bajtów, aby uniknąć problemów z kodowaniem znaków
function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// --- LOGIKA KRYPTOGRAFICZNA ---

async function deriveKey(masterPassword, saltBuffer) {
    const encoder = new TextEncoder();
    const passwordKey = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(masterPassword),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: CRYPTO_CONFIG.iterations,
            hash: CRYPTO_CONFIG.hash
        },
        passwordKey,
        { name: 'AES-GCM', length: CRYPTO_CONFIG.length },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptVault(key, vaultText) {
    const encoder = new TextEncoder();
    // Kodujemy surowy tekst, który przekazujesz (np. wynik JSON.stringify)
    const dataBuffer = encoder.encode(vaultText); 
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBuffer
    );

    return {
        iv: bufferToBase64(iv),
        ciphertext: bufferToBase64(encryptedContent)
    };
}

async function decryptVault(key, ivBase64, ciphertextBase64) {
    const iv = base64ToBuffer(ivBase64);
    const ciphertext = base64ToBuffer(ciphertextBase64);

    try {
        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );
        const decoder = new TextDecoder();
        // Zwracamy surowy tekst – to `app.js` zdecyduje, czy zrobić z niego JSON.parse
        return decoder.decode(decryptedContent);
    } catch (e) {
        throw new Error("Nieprawidłowe hasło główne lub uszkodzone dane.");
    }
}