#!/bin/bash
set -e

cd "$(dirname "$0")/../.."
npm install
npm run build
npm prune --omit=dev
