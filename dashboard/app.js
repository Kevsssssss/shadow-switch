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
    let lastSeenMs = data.last_seen;
    
    // Auto-detect if the timestamp is in seconds (old Go code) or milliseconds (new Firebase Server Time)
    // 10000000000 is the year 2286 in seconds, so anything below is definitely seconds.
    if (lastSeenMs < 10000000000) {
        lastSeenMs = lastSeenMs * 1000;
    }

    const nowMs = Date.now();
    
    // Convert to seconds for the diff check
    const diff = Math.floor((nowMs - lastSeenMs) / 1000);

    console.log(`[Status Update] Now(ms): ${nowMs}, LastSeen(ms): ${lastSeenMs}, Diff: ${diff}s`);

    // With Server Timestamps, the diff should be very small (near 0)
    if (diff < 60 && diff > -60) {
        badge.className = 'badge badge-online';
        badge.textContent = 'Online';
    } else {
        console.log(`[Status Update] Machine marked offline due to diff: ${diff}s`);
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
