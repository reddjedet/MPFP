#!/usr/bin/env bash
# Script de construcción unificado para Render / PaaS
set -o errexit

echo "📦 Instalando dependencias de Python..."
pip install -r requirements.txt

echo "⚛️ Instalando dependencias de React 19 y compilando Vite..."
npm --prefix frontend install
npm --prefix frontend run build

echo "✅ Build completado exitosamente!"
