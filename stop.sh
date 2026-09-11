#!/bin/bash
# ==============================================================================
# Script de Apagado y Liberación de Puertos (stop.sh) - Máquina de Planes, Finanzas y Portfolios (MPFP)
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "🛑 Deteniendo servicios de Máquina de Planes, Finanzas y Portfolios (MPFP)..."

# 1. Apagar Backend FastAPI por PID guardado
if [ -f "$DIR/app.pid" ]; then
    PID=$(cat "$DIR/app.pid")
    kill -9 $PID 2>/dev/null || true
    rm -f "$DIR/app.pid"
fi

# 2. Apagar Frontend React Vite por PID guardado
if [ -f "$DIR/frontend.pid" ]; then
    FPID=$(cat "$DIR/frontend.pid")
    kill -9 $FPID 2>/dev/null || true
    rm -f "$DIR/frontend.pid"
fi

# 3. Liberar puertos 8000 y 5173
lsof -ti:${BACKEND_PORT} | xargs -r kill -9 2>/dev/null || true
lsof -ti:${FRONTEND_PORT} | xargs -r kill -9 2>/dev/null || true
fuser -k -9 ${BACKEND_PORT}/tcp 2>/dev/null || true
fuser -k -9 ${FRONTEND_PORT}/tcp 2>/dev/null || true

# 4. Limpiar procesos uvicorn y vite
pkill -9 -f "uvicorn.*main:app" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true

echo "✓ Todos los servicios (FastAPI en $BACKEND_PORT y React en $FRONTEND_PORT) fueron detenidos correctamente."
