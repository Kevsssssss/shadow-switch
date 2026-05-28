// Firebase Configuration
if (!window.CONFIG || !window.CONFIG.FIREBASE_DATABASE_URL || window.CONFIG.FIREBASE_DATABASE_URL.includes("VERCEL_ENV")) {
    console.error("Firebase Config Missing or Invalid:", window.CONFIG);
    alert("CRITICAL ERROR: Firebase Configuration was not injected. Check your Vercel Build Logs.");
}

const firebaseConfig = {
    apiKey: window.CONFIG?.FIREBASE_API_KEY || "",
    authDomain: window.CONFIG?.FIREBASE_AUTH_DOMAIN || "",
    databaseURL: window.CONFIG?.FIREBASE_DATABASE_URL || "",
    projectId: window.CONFIG?.FIREBASE_PROJECT_ID || "",
    storageBucket: window.CONFIG?.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: window.CONFIG?.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: window.CONFIG?.FIREBASE_APP_ID || ""
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// DOM Elements
const machineSelector = document.getElementById('machine-selector');
const badge = document.getElementById('status-badge');
const lastSeenText = document.getElementById('last-seen');
const localIpText = document.getElementById('local-ip');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');

let currentMachineID = "";
let pendingAction = null;
let statusListener = null;

// Listen for all heartbeats to populate the selector
db.ref('heartbeats').on('value', (snapshot) => {
    const heartbeats = snapshot.val();
    if (!heartbeats) return;

    const currentSelection = machineSelector.value;
    machineSelector.innerHTML = "";
    
    Object.keys(heartbeats).forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        machineSelector.appendChild(option);
    });

    // Restore selection or pick first
    if (heartbeats[currentSelection]) {
        machineSelector.value = currentSelection;
    } else if (!currentMachineID && Object.keys(heartbeats).length > 0) {
        switchMachine();
    }
});

function switchMachine() {
    const newID = machineSelector.value;
    if (!newID) return;

    // Remove old listener
    if (statusListener) {
        db.ref(`heartbeats/${currentMachineID}`).off('value', statusListener);
    }

    currentMachineID = newID;
    console.log(`Switched to machine: ${currentMachineID}`);

    // Add new listener
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
    const now = Math.floor(Date.now() / 1000);
    const diff = now - data.last_seen;

    if (diff < 60) {
        badge.className = 'badge badge-online';
        badge.textContent = 'Online';
    } else {
        setOffline();
    }

    const date = new Date(data.last_seen * 1000);
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
