#!/bin/bash
set -e

cd "$(dirname "$0")/../.."
npm ci --omit=dev
npm run build
