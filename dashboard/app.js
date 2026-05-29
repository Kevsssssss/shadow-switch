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
const openSettingsBtn = document.getElementById('open-settings-btn');
const removeBtn = document.getElementById('remove-btn');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

let currentMachineID = "";
let pendingAction = null;
let statusListener = null;

// --- Authentication Logic ---

async function handleLogin() {
    const userIn = document.getElementById('login-user').value;
    const passIn = document.getElementById('login-pass').value;

    const snapshot = await db.ref('admin_config').get();
    let config = snapshot.val();

    // Initialize with defaults if empty
    if (!config) {
        config = { user: "admin", pass: "Password123" };
        await db.ref('admin_config').set(config);
    }

    if (userIn === config.user && passIn === config.pass) {
        localStorage.setItem('ss_session', 'active');
        showDashboard();
    } else {
        alert("Invalid credentials.");
    }
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    mainContent.style.display = 'block';
    openSettingsBtn.style.display = 'block';
    initDashboard();
}

function checkSession() {
    if (localStorage.getItem('ss_session') === 'active') {
        showDashboard();
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

    if (!newUser || !newPass) return alert("Please fill in both fields.");

    if (confirm("Are you sure? You will need to login again with new credentials.")) {
        await db.ref('admin_config').set({ user: newUser, pass: newPass });
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
    // Listen for all heartbeats to populate the selector
    db.ref('heartbeats').on('value', (snapshot) => {
        const heartbeats = snapshot.val();
        if (!heartbeats) {
            machineSelector.innerHTML = '<option value="">No machines found</option>';
            removeBtn.style.display = 'none';
            setOffline();
            return;
        }

        const currentSelection = machineSelector.value;
        machineSelector.innerHTML = "";
        
        Object.keys(heartbeats).forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id;
            machineSelector.appendChild(option);
        });

        if (heartbeats[currentSelection]) {
            machineSelector.value = currentSelection;
        } else if (!currentMachineID && Object.keys(heartbeats).length > 0) {
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
    console.log(`Switched to machine: ${currentMachineID}`);

    statusListener = db.ref(`heartbeats/${currentMachineID}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            updateStatus(data);
        } else {
            setOffline();
        }
    });
}

function updateStatus(data) {
    let lastSeenMs = data.last_seen;
    if (lastSeenMs < 10000000000) lastSeenMs *= 1000;

    const nowMs = Date.now();
    const diff = Math.floor((nowMs - lastSeenMs) / 1000);

    // Allowing 60s drift for "Online" status
    if (Math.abs(diff) < 60) {
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

// Start session check
checkSession();
