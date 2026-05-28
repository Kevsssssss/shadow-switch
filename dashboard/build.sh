#!/bin/bash

echo "Starting robust build process..."

# Generate config.js dynamically in the CURRENT folder
cat <<EOF > config.js
window.CONFIG = {
    API_KEY: "$VERCEL_ENV_API_KEY",
    AUTH_DOMAIN: "$VERCEL_ENV_AUTH_DOMAIN",
    DATABASE_URL: "$VERCEL_ENV_DATABASE_URL",
    PROJECT_ID: "$VERCEL_ENV_PROJECT_ID",
    STORAGE_BUCKET: "$VERCEL_ENV_STORAGE_BUCKET",
    MESSAGING_SENDER_ID: "$VERCEL_ENV_MESSAGING_SENDER_ID",
    APP_ID: "$VERCEL_ENV_APP_ID"
};
EOF

echo "Build complete: config.js generated."
ls -la
