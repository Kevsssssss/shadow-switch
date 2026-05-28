const fs = require('fs');
const path = require('path');

console.log("Starting secure Node.js build process...");

// Simple .env parser to avoid needing external npm packages like 'dotenv'
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    console.log("Found local .env file. Loading variables...");
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            // Remove surrounding quotes if present
            if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
                value = value.replace(/^"|"$/g, '');
            }
            process.env[key] = value;
        }
    });
}

// Grab variables from process.env (which now includes Vercel's vars OR our local .env)
const config = {
    API_KEY: process.env.FIREBASE_API_KEY || process.env.VERCEL_ENV_API_KEY || "",
    AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || process.env.VERCEL_ENV_AUTH_DOMAIN || "",
    DATABASE_URL: process.env.FIREBASE_DATABASE_URL || process.env.VERCEL_ENV_DATABASE_URL || "",
    PROJECT_ID: process.env.FIREBASE_PROJECT_ID || process.env.VERCEL_ENV_PROJECT_ID || "",
    STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || process.env.VERCEL_ENV_STORAGE_BUCKET || "",
    MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VERCEL_ENV_MESSAGING_SENDER_ID || "",
    APP_ID: process.env.FIREBASE_APP_ID || process.env.VERCEL_ENV_APP_ID || ""
};

// Check if variables are missing
if (!config.DATABASE_URL) {
    console.error("⚠️ WARNING: FIREBASE_DATABASE_URL is missing during build!");
} else {
    console.log("✅ Environment variables found securely.");
}

// Write them to config.js
const fileContent = `window.CONFIG = ${JSON.stringify(config, null, 4)};`;
fs.writeFileSync(path.join(__dirname, 'config.js'), fileContent);

console.log("Build complete: config.js generated securely.");
