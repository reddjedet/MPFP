#!/bin/bash
# ==============================================================================
# Script de Apagado y Liberación de Puertos (stop.sh) - Máquina de Planes, Finanzas y Portfolios (MPFP)
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

echo "🛑 Deteniendo servicios de Máquina de Planes, Finanzas y Portfolios (MPFP)..."

# Función para apagado graceful
graceful_stop_pid() {
    local pid=$1
    local name=$2
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "Enviando SIGTERM a $name (PID: $pid)..."
        kill -15 "$pid" 2>/dev/null || true
        # Esperar hasta 2 segundos para cierre limpio
        for i in {1..20}; do
            if ! kill -0 "$pid" 2>/dev/null; then
                echo "✓ $name terminado limpiamente."
                return 0
            fi
            sleep 0.1
        done
        echo "⚠️ $name no respondió a SIGTERM; forzando SIGKILL..."
        kill -9 "$pid" 2>/dev/null || true
    fi
}

# 1. Apagar Backend FastAPI por PID guardado
if [ -f "$DIR/app.pid" ]; then
    PID=$(cat "$DIR/app.pid")
    graceful_stop_pid "$PID" "Backend FastAPI"
    rm -f "$DIR/app.pid"
fi

# 2. Apagar Frontend React Vite por PID guardado
if [ -f "$DIR/frontend.pid" ]; then
    FPID=$(cat "$DIR/frontend.pid")
    graceful_stop_pid "$FPID" "Frontend React Vite"
    rm -f "$DIR/frontend.pid"
fi

# 3. Limpiar procesos remanentes mediante SIGTERM y luego forzado
pkill -15 -f "uvicorn.*main:app" 2>/dev/null || true
pkill -15 -f "vite" 2>/dev/null || true
sleep 0.5

# 4. Liberar puertos 8000 y 5173
lsof -ti:${BACKEND_PORT} | xargs -r kill -9 2>/dev/null || true
lsof -ti:${FRONTEND_PORT} | xargs -r kill -9 2>/dev/null || true
fuser -k -9 ${BACKEND_PORT}/tcp 2>/dev/null || true
fuser -k -9 ${FRONTEND_PORT}/tcp 2>/dev/null || true
pkill -9 -f "uvicorn.*main:app" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true


echo "✓ Todos los servicios (FastAPI en $BACKEND_PORT y React en $FRONTEND_PORT) fueron detenidos correctamente."
