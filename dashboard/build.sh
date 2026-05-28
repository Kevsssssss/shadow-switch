#!/bin/bash

echo "Starting build process..."

# Create a public folder for Vercel output
mkdir -p public

# Copy files to the public folder
cp index.html public/
cp app.js public/

# Replace placeholders in the copy inside the public folder
sed -i "s|<!-- VERCEL_ENV_API_KEY -->|$VERCEL_ENV_API_KEY|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_AUTH_DOMAIN -->|$VERCEL_ENV_AUTH_DOMAIN|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_DATABASE_URL -->|$VERCEL_ENV_DATABASE_URL|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_PROJECT_ID -->|$VERCEL_ENV_PROJECT_ID|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_STORAGE_BUCKET -->|$VERCEL_ENV_STORAGE_BUCKET|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_MESSAGING_SENDER_ID -->|$VERCEL_ENV_MESSAGING_SENDER_ID|g" public/index.html
sed -i "s|<!-- VERCEL_ENV_APP_ID -->|$VERCEL_ENV_APP_ID|g" public/index.html

echo "Build complete: Files moved to public/ and placeholders replaced."
