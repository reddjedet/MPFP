#!/bin/bash
# ==============================================================================
# Script de Arranque Local (start.sh) - Máquina de Planes, Finanzas y Portfolios
# Monograma: MPFP
#
# Uso:
#   ./start.sh            Arranca normalmente (recompila si detecta cambios)
#   ./start.sh --build    Fuerza recompilación del frontend
#   ./start.sh --skip     Salta la compilación (usa el build existente tal cual)
# ==============================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

BACKEND_PORT=8000
FRONTEND_PORT=5173

if [ ! -d "$DIR/venv" ]; then
    echo "❌ Error: El entorno virtual 'venv' no existe en $DIR."
    exit 1
fi

source "$DIR/venv/bin/activate"

# 1. Detener instancias previas limpiamente
echo "🧹 Liberando puertos de instancias previas..."
lsof -ti:${BACKEND_PORT} | xargs -r kill -9 2>/dev/null || true
lsof -ti:${FRONTEND_PORT} | xargs -r kill -9 2>/dev/null || true
fuser -k -9 ${BACKEND_PORT}/tcp 2>/dev/null || true
fuser -k -9 ${FRONTEND_PORT}/tcp 2>/dev/null || true
pkill -9 -f "uvicorn.*main:app" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
sleep 1

# 2. Compilar Frontend React — detección inteligente de cambios
FORCE_BUILD=false
SKIP_BUILD=false
for arg in "$@"; do
    if [ "$arg" == "--build" ] || [ "$arg" == "-b" ]; then
        FORCE_BUILD=true
    fi
    if [ "$arg" == "--skip" ] || [ "$arg" == "-s" ]; then
        SKIP_BUILD=true
    fi
done

DIST_INDEX="$DIR/frontend/dist/index.html"
SRC_DIR="$DIR/frontend/src"

needs_build() {
    # Si no existe el build, siempre compilar
    if [ ! -f "$DIST_INDEX" ]; then
        return 0
    fi

    # Comparar: ¿hay algún archivo en frontend/src/ más nuevo que dist/index.html?
    NEWER_FILES=$(find "$SRC_DIR" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) -newer "$DIST_INDEX" 2>/dev/null | head -5)
    if [ -n "$NEWER_FILES" ]; then
        return 0
    fi

    return 1
}

if [ "$SKIP_BUILD" = true ]; then
    echo "⏭️  Saltando compilación del frontend (flag --skip)."
elif [ "$FORCE_BUILD" = true ]; then
    echo "📦 Recompilando frontend (flag --build forzado)..."
    (cd "$DIR/frontend" && npm run build)
    echo "✅ Frontend compilado exitosamente."
elif needs_build; then
    echo "🔍 Cambios detectados en frontend/src/ desde el último build."
    echo "📦 Recompilando frontend automáticamente..."
    (cd "$DIR/frontend" && npm run build)
    echo "✅ Frontend compilado exitosamente."
else
    echo "⚡ Frontend al día — sin cambios en src/ desde el último build."
fi

echo "================================================================================"
echo "   🚀 Máquina de Planes, Finanzas y Portfolios (MPFP) Iniciada con Éxito       "
echo "================================================================================"
echo "💻 Plataforma React (SPA):       http://127.0.0.1:$BACKEND_PORT/"
echo "⚡ Vite Dev Server (Hot-Reload): http://127.0.0.1:$FRONTEND_PORT"
echo "======================================================="

# 3. Lanzar Backend FastAPI (servidor unificado)
nohup "$DIR/venv/bin/python" -m uvicorn main:app --reload --reload-dir "$DIR/routers" --reload-dir "$DIR/services" --host 127.0.0.1 --port $BACKEND_PORT > "$DIR/app.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$DIR/app.pid"
disown $BACKEND_PID 2>/dev/null || true
echo "✓ Backend FastAPI corriendo (PID: $BACKEND_PID, logs: app.log)"

# 4. Lanzar Vite Dev Server en segundo plano
if [ -d "$DIR/frontend" ]; then
    cd "$DIR/frontend"
    nohup ./node_modules/.bin/vite --host 127.0.0.1 --port $FRONTEND_PORT > "$DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$DIR/frontend.pid"
    disown $FRONTEND_PID 2>/dev/null || true
    cd "$DIR"
    echo "✓ Vite Dev Server corriendo (PID: $FRONTEND_PID, logs: frontend.log)"
fi

# 5. Esperar a que FastAPI responda antes de abrir el navegador
echo "⏳ Verificando disponibilidad del servidor..."
for i in {1..15}; do
    if curl -s http://127.0.0.1:$BACKEND_PORT/health >/dev/null 2>&1; then
        echo "✓ Servidor listo y respondiendo."
        break
    fi
    sleep 0.4
done

# 6. Abrir navegador en la aplicación React
echo "🌐 Abriendo navegador en http://127.0.0.1:$BACKEND_PORT/ ..."
if command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "http://127.0.0.1:$BACKEND_PORT/" >/dev/null 2>&1 &) || true
elif command -v firefox >/dev/null 2>&1; then
    (firefox "http://127.0.0.1:$BACKEND_PORT/" >/dev/null 2>&1 &) || true
fi

echo ""
echo "✨ Abre en tu navegador: http://127.0.0.1:$BACKEND_PORT/"
echo "🛑 Para detener todo ejecuta: ./stop.sh"
echo "======================================================="
