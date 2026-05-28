#!/bin/bash

# Replace all placeholders in index.html with environment variables
# This script handles the Vercel environment variable injection

sed -i "s|<!-- VERCEL_ENV_API_KEY -->|$VERCEL_ENV_API_KEY|g" index.html
sed -i "s|<!-- VERCEL_ENV_AUTH_DOMAIN -->|$VERCEL_ENV_AUTH_DOMAIN|g" index.html
sed -i "s|<!-- VERCEL_ENV_DATABASE_URL -->|$VERCEL_ENV_DATABASE_URL|g" index.html
sed -i "s|<!-- VERCEL_ENV_PROJECT_ID -->|$VERCEL_ENV_PROJECT_ID|g" index.html
sed -i "s|<!-- VERCEL_ENV_STORAGE_BUCKET -->|$VERCEL_ENV_STORAGE_BUCKET|g" index.html
sed -i "s|<!-- VERCEL_ENV_MESSAGING_SENDER_ID -->|$VERCEL_ENV_MESSAGING_SENDER_ID|g" index.html
sed -i "s|<!-- VERCEL_ENV_APP_ID -->|$VERCEL_ENV_APP_ID|g" index.html

echo "Build complete: Placeholders replaced."
