import os
import re

FRONTEND_DIR = "/run/media/christian/51cc8d45-50ef-4ae6-8f35-ecd9286e0c67/Documentos/Proyectos Antigravity/Streamlit-a-app-github/frontend"

# We have 11 files to process
FILES_TO_PROCESS = [
    ("src/components/CedearsView.tsx", "src/components/market/CedearsView.tsx"),
    ("src/components/EtfRotationView.tsx", "src/components/market/EtfRotationView.tsx"),
    ("src/components/EarningsView.tsx", "src/components/market/EarningsCalendarView.tsx"),
    ("src/components/FixedIncomeView.tsx", "src/components/market/FixedIncomeView.tsx"),
    ("src/components/MarketIndicesView.tsx", "src/components/market/MarketIndicesView.tsx"),
    ("src/components/MarkowitzLab.tsx", "src/components/markowitz/MarkowitzLab.tsx"),
    ("src/components/ValuationView.tsx", "src/components/markowitz/ValuationView.tsx"),
    ("src/components/PerformanceView.tsx", "src/components/markowitz/PerformanceView.tsx"),
    ("src/components/RotationView.tsx", "src/components/rotation/RotationView.tsx"),
    ("src/components/ui/CommandPalette.tsx", "src/components/ui/CommandPalette.tsx"),
    ("src/components/common/Ticker360Drawer.tsx", "src/components/ui/Ticker360Drawer.tsx")
]

def apply_replacements(content: str, filename: str) -> str:
    # Backgrounds
    content = re.sub(r'bg-\[\#0c0d12\]/95', 'bg-background', content)
    content = re.sub(r'bg-\[\#13141b\]/95', 'bg-background', content)
    content = re.sub(r'bg-\[\#0f1015\]', 'bg-background', content)
    content = re.sub(r'bg-\[var\(--bg-app\)\]', 'bg-background', content)
    
    content = re.sub(r'bg-\[\#202124\]', 'bg-secondary', content)
    content = re.sub(r'bg-\[\#181920\]', 'bg-secondary', content)
    content = re.sub(r'bg-\[\#2a2c33\]', 'bg-secondary', content)
    
    content = re.sub(r'bg-white/\[0\.03\]', 'bg-secondary/50', content)
    content = re.sub(r'bg-white/5(?!\d)', 'bg-secondary/50', content)
    content = re.sub(r'bg-white/10(?!\d)', 'bg-secondary/50', content)
    
    content = re.sub(r'glass-panel', 'bg-card border border-border', content)
    content = re.sub(r'bg-\[var\(--bg-glass\)\]', 'bg-card border border-border', content)
    
    content = re.sub(r'bg-black/40', 'bg-secondary', content)
    content = re.sub(r'bg-black/50', 'bg-secondary', content)
    
    # Text
    content = re.sub(r'text-white', 'text-foreground', content)
    content = re.sub(r'text-zinc-100', 'text-foreground', content)
    content = re.sub(r'text-zinc-200', 'text-foreground', content)
    content = re.sub(r'text-\[var\(--text-main\)\]', 'text-foreground', content)
    
    content = re.sub(r'text-zinc-300', 'text-muted-foreground', content)
    content = re.sub(r'text-zinc-400', 'text-muted-foreground', content)
    content = re.sub(r'text-zinc-500', 'text-muted-foreground', content)
    
    # Borders
    content = re.sub(r'border-white/10', 'border-border', content)
    content = re.sub(r'border-white/20', 'border-border', content)
    content = re.sub(r'border-white/5', 'border-border', content)
    content = re.sub(r'border-\[var\(--border-glass\)\]', 'border-border', content)
    
    # Border Radius
    content = re.sub(r'rounded-\[3px\]', 'rounded-lg', content)
    content = re.sub(r'rounded-\[2px\]', 'rounded-lg', content)
    
    # Backdrop
    content = re.sub(r'backdrop-blur-xl', '', content)
    content = re.sub(r'backdrop-blur-\[20px\]', '', content)
    
    # Area specific colors (Neutralize active states)
    # Example: bg-blue-600/15 text-blue-300 border-b-2 border-blue-500 -> bg-secondary text-foreground border-foreground
    content = re.sub(r'bg-(blue|emerald|purple)-[56]00/[12]5\s+text-\1-[34]00\s+border-(?:b-2\s+)?border-\1-[45]00', 'bg-secondary text-foreground border-foreground', content)
    
    # Individual icon colors text-blue-400 etc. but avoid touching semantic ones if possible
    # We should handle emerald and red for semantic first
    content = re.sub(r'text-emerald-400', 'text-positive', content)
    content = re.sub(r'text-green-400', 'text-positive', content)
    content = re.sub(r'text-red-400', 'text-negative', content)
    content = re.sub(r'text-red-500', 'text-negative', content)
    
    # Other specific colors to foreground (icons)
    content = re.sub(r'text-blue-400', 'text-foreground', content)
    content = re.sub(r'text-purple-400', 'text-foreground', content)

    # Gradients
    content = re.sub(r'bg-gradient-to-[a-z]+\s+from-[a-z]+-[0-9]+\s+via-[a-z]+-[0-9]+\s+to-[a-z]+-[0-9]+', 'bg-foreground text-background', content)
    content = re.sub(r'bg-gradient-to-[a-z]+\s+from-[a-z]+-[0-9]+\s+to-[a-z]+-[0-9]+', 'bg-foreground text-background', content)
    
    # Semantic Colors:
    content = re.sub(r'bg-emerald-500/15', 'bg-positive/10', content)
    content = re.sub(r'bg-red-500/15', 'bg-negative/10', content)
    
    # Shadows
    content = re.sub(r'shadow-md shadow-blue-[56]00/20', 'shadow-md', content)
    
    # Import Updates for @/
    content = re.sub(r'from [\'"]\.\./[^\'"]+[\'"]', lambda m: m.group(0).replace('../', '@/'), content)
    content = re.sub(r'from [\'"]\.\./\.\./[^\'"]+[\'"]', lambda m: m.group(0).replace('../../', '@/'), content)
    
    # Component specific adaptations
    if "CedearsView.tsx" in filename:
        content = content.replace("import { useTicker360 } from '@/context/Ticker360Context';", "import { useAppStore } from '@/store/useAppStore';")
        content = content.replace("const { openTicker360 } = useTicker360();", "const { openTickerDrawer } = useAppStore();")
        content = content.replace("openTicker360(", "openTickerDrawer(")
        
    if "Ticker360Drawer.tsx" in filename:
        content = content.replace("import { useTicker360 } from '@/context/Ticker360Context';", "import { useAppStore } from '@/store/useAppStore';")
        content = content.replace("const { selectedTicker, isTicker360Open, closeTicker360 } = useTicker360();", "const { selectedTicker, isTickerDrawerOpen: isTicker360Open, closeTickerDrawer: closeTicker360 } = useAppStore();")
        
    if "CommandPalette.tsx" in filename:
        content = content.replace("interface CommandPaletteProps {", "interface CommandPaletteProps {\n  // Using store instead of props")
        # Removing props in favor of store if applicable, but this regex might be tricky
        pass # Will do manually or via advanced parsing if needed

    return content

for src_rel, dest_rel in FILES_TO_PROCESS:
    src_path = os.path.join(FRONTEND_DIR, src_rel)
    dest_path = os.path.join(FRONTEND_DIR, dest_rel)
    
    if not os.path.exists(src_path):
        print(f"File not found: {src_path}")
        continue
        
    with open(src_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    new_content = apply_replacements(content, dest_rel)
    
    # Ensure dir exists
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"Processed {src_rel} -> {dest_rel}")
