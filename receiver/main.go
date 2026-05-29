package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
)

// LAN Dashboard HTML (Responsive)
const LAN_DASHBOARD_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ShadowSwitch LAN</title><style>:root{--p:#dd2c00;--bg:#111112;--s:#1a1a1c;--t:#fff}body{background:var(--bg);color:var(--t);font-family:sans-serif;margin:0}header{background:var(--s);padding:1rem;display:flex;align-items:center;gap:1.5rem;position:fixed;top:0;width:100%;z-index:100;box-shadow:0 2px 5px rgba(0,0,0,.5);box-sizing:border-box}.hamburger{display:none;cursor:pointer;background:none;border:none;padding:.5rem;z-index:101}.hamburger span{display:block;width:25px;height:3px;background:var(--t);margin:5px 0;transition:.3s}.desktop-nav{display:flex;gap:.5rem}.sidebar{position:fixed;top:0;left:-250px;width:250px;height:100%;background:var(--s);transition:.3s;z-index:99;padding-top:5rem;box-shadow:2px 0 5px rgba(0,0,0,.5)}.sidebar.active{left:0}.sidebar-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:98}.sidebar-overlay.active{display:block}.sidebar button{display:block;width:calc(100% - 2rem);margin:.5rem 1rem;text-align:left}main{padding-top:5rem;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box}.card{background:var(--s);padding:2rem;border-radius:8px;text-align:center;max-width:400px;width:90%;box-shadow:0 4px 6px rgba(0,0,0,0.3)}button{background:var(--p);color:#fff;border:none;padding:.8rem 1.5rem;border-radius:4px;cursor:pointer;font-weight:700;transition:.2s}button:hover{opacity:.8}button:disabled{background:#555;cursor:not-allowed}h1{color:var(--p);margin:0;font-size:1.2rem}@media(max-width:768px){.desktop-nav{display:none}.hamburger{display:block}}</style></head><body><header><button class="hamburger" onclick="toggleSidebar()"><span></span><span></span><span></span></button><h1>ShadowSwitch</h1><div class="desktop-nav"><button onclick="execute('shutdown')">Shutdown</button><button onclick="execute('restart')">Restart</button><button onclick="execute('lock')">Lock</button></div></header><div class="sidebar-overlay" id="overlay" onclick="toggleSidebar()"></div><nav class="sidebar" id="sidebar"><button onclick="execute('shutdown')">Shutdown</button><button onclick="execute('restart')">Restart</button><button onclick="execute('lock')">Lock</button><button onclick="execute('logout')">Log Out</button></nav><main><div class="card"><h1>ShadowSwitch</h1><p>Local Management Interface</p></div></main><script>function toggleSidebar(){document.getElementById('sidebar').classList.toggle('active');document.getElementById('overlay').classList.toggle('active')}function execute(action){if(!confirm("Are you sure you want to "+action+"?"))return;const btn=event.target;btn.disabled=true;fetch("/api/action",{method:"POST",headers:{"Content-Type":"application/json","X-ShadowSwitch-Token":"CHANGE_ME_SECURE_TOKEN"},body:JSON.stringify({action})}).then(r=>r.json()).then(data=>{alert(data.message||"Command sent");btn.disabled=false;if(document.getElementById('sidebar').classList.contains('active'))toggleSidebar()}).catch(err=>{alert("Error: "+err);btn.disabled=false})}</script></body></html>`

type ActionRequest struct {
	Action string `json:"action"`
}

// Default Configuration (Built-in)
var (
	DefaultFirebaseURL    = "https://shadow-switch-default-rtdb.asia-southeast1.firebasedatabase.app"
	DefaultFirebaseSecret = "jhtV78fwNzTzXiFa6LsAQVCXLaKgqEQ017zQOUTM"
	DefaultAuthToken      = "AntiKierSystem"
)

func main() {
	if runtime.GOOS != "windows" {
		log.Fatal("ShadowSwitch Receiver is only supported on Windows.")
	}

	// Try to load .env from the executable's directory (Optional override)
	exePath, err := os.Executable()
	if err == nil {
		_ = godotenv.Load(path.Join(path.Dir(exePath), ".env"))
	}
	_ = godotenv.Load() // Fallback to CWD

	fmt.Println("ShadowSwitch Receiver starting...")

	// Use environment variable if set, otherwise use built-in default
	fbURL := getEnv("FIREBASE_URL", DefaultFirebaseURL)
	fbSecret := getEnv("FIREBASE_SECRET", DefaultFirebaseSecret)
	authToken := getEnv("AUTH_TOKEN", DefaultAuthToken)

	// Update OS Env so other functions can see them
	os.Setenv("FIREBASE_URL", fbURL)
	os.Setenv("FIREBASE_SECRET", fbSecret)
	os.Setenv("AUTH_TOKEN", authToken)

	// Multi-machine support
	machineID := getEnv("MACHINE_ID", "")
	if machineID == "" {
		currentUser, err := user.Current()
		if err == nil {
			// Clean username (remove domain/special chars if any)
			parts := strings.Split(currentUser.Username, "\\")
			machineID = parts[len(parts)-1]
		} else {
			machineID = "unknown-machine"
		}
	}
	os.Setenv("MACHINE_ID", machineID)
	log.Printf("Machine Identified as: %s\n", machineID)

	localIP := getLocalIP()
	port := getEnv("LAN_PORT", ":8080")
	fmt.Printf("LAN Mode: Listening on http://%s%s\n", localIP, port)

	// Start LAN Server
	go startLANServer()

	// Start Heartbeat
	go startHeartbeat()

	// Start Firebase Listener
	startFirebaseListener()
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "localhost"
	}
	for _, address := range addrs {
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "localhost"
}

func getLANHTML() string {
	token := getEnv("AUTH_TOKEN", "CHANGE_ME_SECURE_TOKEN")
	machineID := os.Getenv("MACHINE_ID")
	html := strings.ReplaceAll(LAN_DASHBOARD_HTML, "CHANGE_ME_SECURE_TOKEN", token)
	return strings.ReplaceAll(html, "Local Management Interface", "Machine: "+machineID)
}

func startLANServer() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, getLANHTML())
	})

	http.HandleFunc("/api/action", handleAction)

	listenPort := getEnv("LAN_PORT", ":8080")
	log.Fatal(http.ListenAndServe(listenPort, nil))
}

func handleAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify X-ShadowSwitch-Token
	token := r.Header.Get("X-ShadowSwitch-Token")
	if token != getEnv("AUTH_TOKEN", "CHANGE_ME_SECURE_TOKEN") {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req ActionRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	msg := "Action triggered: " + req.Action
	success := true

	switch req.Action {
	case "shutdown":
		go execCommand("shutdown", "/s", "/t", "0", "/f")
	case "restart":
		go execCommand("shutdown", "/r", "/t", "0", "/f")
	case "logout":
		go execCommand("shutdown", "/l")
	case "lock":
		go execCommand("rundll32.exe", "user32.dll,LockWorkStation")
	default:
		msg = "Unknown action: " + req.Action
		success = false
	}

	w.Header().Set("Content-Type", "application/json")
	if !success {
		w.WriteHeader(http.StatusBadRequest)
	}
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"message": msg,
	})
}

func startHeartbeat() {
	intervalStr := getEnv("HEARTBEAT_INTERVAL", "15s")
	interval, err := time.ParseDuration(intervalStr)
	if err != nil {
		interval = 15 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial heartbeat
	updateHeartbeat()

	for range ticker.C {
		updateHeartbeat()
	}
}

func updateHeartbeat() {
	firebaseURL := strings.TrimRight(os.Getenv("FIREBASE_URL"), "/")
	machineID := os.Getenv("MACHINE_ID")
	secret := os.Getenv("FIREBASE_SECRET")
	url := fmt.Sprintf("%s/heartbeats/%s.json?auth=%s", firebaseURL, machineID, secret)

	// Use Firebase Server Timestamp placeholder
	data := map[string]interface{}{
		"last_seen": map[string]string{".sv": "timestamp"},
		"status":    "online",
		"ip":        getLocalIP(),
	}
	jsonData, _ := json.Marshal(data)

	req, err := http.NewRequest(http.MethodPut, url, bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("[Heartbeat] Request Creation Error: %v\n", err)
		return
	}
	
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Heartbeat] Network Error: %v (URL: %s)\n", err, firebaseURL)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Heartbeat] Firebase Rejected (Status %d) for Machine: %s. Check your Secret/URL.\n", resp.StatusCode, machineID)
	} else {
		log.Printf("[Heartbeat] Success sent for %s (IP: %s)\n", machineID, data["ip"])
	}
}

func startFirebaseListener() {
	firebaseURL := strings.TrimRight(os.Getenv("FIREBASE_URL"), "/")
	url := fmt.Sprintf("%s/commands/%s.json?auth=%s", firebaseURL, os.Getenv("MACHINE_ID"), os.Getenv("FIREBASE_SECRET"))

	for {
		log.Println("Connecting to Firebase stream...")
		err := streamFirebase(url)
		if err != nil {
			log.Printf("Stream error: %v. Retrying in 5s...\n", err)
			time.Sleep(5 * time.Second)
		}
	}
}

func streamFirebase(url string) error {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			dataStr := strings.TrimPrefix(line, "data: ")
			if dataStr == "null" {
				continue
			}

			var event map[string]interface{}
			if err := json.Unmarshal([]byte(dataStr), &event); err != nil {
				continue
			}

			if path, ok := event["path"].(string); ok && path == "/" {
				if action, ok := event["data"].(string); ok && action != "" {
					handleFirebaseAction(action)
				}
			}
		}
	}
	return scanner.Err()
}

func handleFirebaseAction(action string) {
	log.Printf("Firebase command received: %s\n", action)

	resetFirebaseCommand()

	switch action {
	case "shutdown":
		execCommand("shutdown", "/s", "/t", "0", "/f")
	case "restart":
		execCommand("shutdown", "/r", "/t", "0", "/f")
	case "logout":
		execCommand("shutdown", "/l")
	case "lock":
		execCommand("rundll32.exe", "user32.dll,LockWorkStation")
	}
}

func resetFirebaseCommand() {
	firebaseURL := strings.TrimRight(os.Getenv("FIREBASE_URL"), "/")
	url := fmt.Sprintf("%s/commands/%s.json?auth=%s", firebaseURL, os.Getenv("MACHINE_ID"), os.Getenv("FIREBASE_SECRET"))
	req, _ := http.NewRequest(http.MethodDelete, url, nil)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

func execCommand(name string, arg ...string) {
	cmd := exec.Command(name, arg...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
	err := cmd.Run()
	if err != nil {
		log.Printf("Error executing command %s: %v\n", name, err)
	}
}
