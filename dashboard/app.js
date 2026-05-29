// Firebase Configuration
if (!window.CONFIG || !window.CONFIG.DATABASE_URL || window.CONFIG.DATABASE_URL.includes("VERCEL_ENV")) {
    console.error("Firebase Config Missing or Invalid:", window.CONFIG);
    alert("CRITICAL ERROR: Firebase Configuration was not injected. Check your Vercel Build Logs.");
}

const firebaseConfig = {
    apiKey: window.CONFIG?.API_KEY || "",
    authDomain: window.CONFIG?.AUTH_DOMAIN || "",
    databaseURL: window.CONFIG?.DATABASE_URL || "",
    projectId: window.CONFIG?.PROJECT_ID || "",
    storageBucket: window.CONFIG?.STORAGE_BUCKET || "",
    messagingSenderId: window.CONFIG?.MESSAGING_SENDER_ID || "",
    appId: window.CONFIG?.APP_ID || ""
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DOM Elements
const machineSelector = document.getElementById('machine-selector');
const badge = document.getElementById('status-badge');
const lastSeenText = document.getElementById('last-seen');
const localIpText = document.getElementById('local-ip');
const mainContent = document.getElementById('main-content');
const loginOverlay = document.getElementById('login-overlay');
const settingsOverlay = document.getElementById('settings-overlay');
const headerActions = document.getElementById('header-actions');
const removeBtn = document.getElementById('remove-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

let currentMachineID = "";
let pendingAction = null;
let statusListener = null;
let lastKnownData = null;

// --- Security Utils ---

// Simple SHA-256 implementation using Web Crypto API
async function hashCreds(username, password) {
    const msg = `${username.trim()}:${password}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Authentication Logic ---

async function handleLogin() {
    const userIn = document.getElementById('login-user').value;
    const passIn = document.getElementById('login-pass').value;

    if (!userIn || !passIn) return alert("Please fill in both fields.");

    try {
        const snapshot = await db.ref('admin_config').get();
        let config = snapshot.val();

        // Default Hashed Value for admin : Password123
        const defaultHash = "0da12d837ccae2ae46d6a5ea7bc98fe5ce790208b6e305a591f59f24b62db6c1";

        if (!config || !config.hashed_key) {
            await db.ref('admin_config').set({ hashed_key: defaultHash });
            config = { hashed_key: defaultHash };
        }

        const inputHash = await hashCreds(userIn, passIn);

        if (inputHash === config.hashed_key) {
            localStorage.setItem('ss_session', 'active');
            showDashboard();
        } else {
            alert("Invalid credentials.");
        }
    } catch (error) {
        console.error("Login Error:", error);
        alert("System Error: " + error.message + "\nCheck browser console for details.");
    }
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    mainContent.style.display = 'block';
    headerActions.style.display = 'flex';
    initDashboard();
}

function checkSession() {
    if (localStorage.getItem('ss_session') === 'active') {
        showDashboard();
    }
}

function logoutDashboard() {
    if (confirm("Are you sure you want to logout from the dashboard?")) {
        localStorage.removeItem('ss_session');
        window.location.reload();
    }
}

// --- Settings Logic ---

function openSettings() {
    settingsOverlay.style.display = 'flex';
}

function closeSettings() {
    settingsOverlay.style.display = 'none';
}

async function saveSettings() {
    const newUser = document.getElementById('new-user').value;
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;

    if (!newUser || !newPass) return alert("Please fill in all fields.");
    
    if (newPass !== confirmPass) {
        return alert("Passwords do not match!");
    }

    if (confirm("Are you sure? This will update the hashed key in Firebase. You will need to login again.")) {
        const newHash = await hashCreds(newUser, newPass);
        await db.ref('admin_config').set({ hashed_key: newHash });
        localStorage.removeItem('ss_session');
        window.location.reload();
    }
}

async function deleteMachine() {
    if (!currentMachineID) return;
    
    if (confirm(`Are you sure you want to permanently remove ${currentMachineID} from the registry?`)) {
        await db.ref(`heartbeats/${currentMachineID}`).remove();
        await db.ref(`commands/${currentMachineID}`).remove();
        alert(`${currentMachineID} removed.`);
        window.location.reload();
    }
}

// --- Dashboard Logic ---

function initDashboard() {
    db.ref('heartbeats').on('value', (snapshot) => {
        const heartbeats = snapshot.val();
        console.log("Heartbeats Snapshot:", heartbeats);
        
        if (!heartbeats) {
            machineSelector.innerHTML = '<option value="">No machines found</option>';
            removeBtn.style.display = 'none';
            setOffline();
            return;
        }

        const currentSelection = machineSelector.value;
        machineSelector.innerHTML = "";
        
        const ids = Object.keys(heartbeats);
        ids.forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id;
            machineSelector.appendChild(option);
        });

        // Auto-select first machine if none selected or current is gone
        if (currentSelection && heartbeats[currentSelection]) {
            machineSelector.value = currentSelection;
        } else {
            console.log("Auto-selecting machine:", ids[0]);
            machineSelector.value = ids[0];
            switchMachine();
        }
    });
}

function switchMachine() {
    const newID = machineSelector.value;
    if (!newID) {
        removeBtn.style.display = 'none';
        return;
    }

    removeBtn.style.display = 'inline-block';

    if (statusListener) {
        db.ref(`heartbeats/${currentMachineID}`).off('value', statusListener);
    }

    currentMachineID = newID;
    lastKnownData = null;
    console.log(`Switched to machine: ${currentMachineID}`);

    statusListener = db.ref(`heartbeats/${currentMachineID}`).on('value', (snapshot) => {
        lastKnownData = snapshot.val();
        console.log(`Status update for ${currentMachineID}:`, lastKnownData);
        if (lastKnownData) {
            updateStatus(lastKnownData);
        } else {
            setOffline();
        }
    });
}

function updateStatus(data) {
    if (!data) return;
    
    let lastSeenMs = data.last_seen;
    if (typeof lastSeenMs !== 'number') {
        console.warn("last_seen is not a number:", lastSeenMs);
        return;
    }
    
    // Firebase timestamps are in ms.
    if (lastSeenMs < 10000000000) lastSeenMs *= 1000;

    const adjustedNow = Date.now() + serverTimeOffset;
    const diffSeconds = Math.floor((adjustedNow - lastSeenMs) / 1000);

    console.log(`Time Diff: ${diffSeconds}s (Adjusted Now: ${adjustedNow}, Last Seen: ${lastSeenMs})`);

    if (diffSeconds >= 0 && diffSeconds < 45) {
        badge.className = 'badge badge-online';
        badge.textContent = 'Online';
    } else {
        setOffline();
    }

    const date = new Date(lastSeenMs);
    lastSeenText.textContent = `Last seen: ${date.toLocaleTimeString()}`;
    localIpText.textContent = `Local IP: ${data.ip || '--.--.--.--'}`;
}

function setOffline() {
    badge.className = 'badge badge-offline';
    badge.textContent = 'Offline';
}

setInterval(() => {
    if (lastKnownData && currentMachineID) {
        updateStatus(lastKnownData);
    }
}, 2000);

function confirmAction(action) {
    if (!currentMachineID) return alert("Select a machine first");
    pendingAction = action;
    modalTitle.textContent = `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`;
    modalDesc.textContent = `Are you sure you want to ${action} ${currentMachineID}?`;
    modalOverlay.style.display = 'flex';
}

function closeModal() {
    modalOverlay.style.display = 'none';
    pendingAction = null;
}

function proceedAction() {
    if (pendingAction) {
        executeAction(pendingAction);
        closeModal();
    }
}

function executeAction(action) {
    if (!currentMachineID) return;
    
    const buttons = document.querySelectorAll('.controls button');
    buttons.forEach(btn => btn.disabled = true);

    db.ref(`commands/${currentMachineID}`).set(action)
        .then(() => {
            alert(`Command '${action}' sent to ${currentMachineID}.`);
        })
        .catch(err => {
            alert(`Error: ${err.message}`);
        })
        .finally(() => {
            setTimeout(() => {
                buttons.forEach(btn => btn.disabled = false);
            }, 3000);
        });
}

checkSession();
