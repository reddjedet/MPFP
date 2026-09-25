import re

FILE_PATH = "frontend/src/components/portfolio/HoldingsManagerView.tsx"

with open(FILE_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update the Chart Options to use Treemap instead of Sunburst
old_chart_option = """    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        borderRadius: 8,
        formatter: (params: any) => buildTooltip(params.data?.meta)
      },
      series: [
        {
          type: 'sunburst',
          data,
          radius: ['15%', '86%'],
          center: ['50%', '50%'],
          emphasis: { focus: 'ancestor' },
          itemStyle: { borderColor: chartTheme.cardBorder, borderWidth: 2, borderRadius: 4 },
          levels: [
            {},
            {
              r0: '15%',
              r: '45%',
              label: {
                rotate: 'tangential',
                align: 'right',
                color: chartTheme.textPrimary,
                fontSize: 11,
                fontWeight: 600,
                formatter: (p: any) => (p.data?.meta?.pct >= 4 ? p.name : '')
              }
            },
            {
              r0: '45%',
              r: '86%',
              label: {
                rotate: 'radial',
                color: chartTheme.textMuted,
                fontSize: 9,
                formatter: (p: any) =>
                  p.data?.meta?.pct >= 3 ? `${p.name} ${fmtPct(p.data.meta.pct, 1)}` : ''
              }
            }
          ]
        }
      ]
    };"""

new_chart_option = """    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: chartTheme.tooltipBg,
        borderColor: chartTheme.tooltipBorder,
        textStyle: { color: chartTheme.tooltipText, fontSize: 11 },
        borderRadius: 8,
        formatter: (params: any) => buildTooltip(params.data?.meta)
      },
      series: [
        {
          type: 'treemap',
          data,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 12,
            fontWeight: 600,
            color: '#fff',
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowBlur: 3
          },
          itemStyle: {
            borderColor: chartTheme.cardBorder,
            borderWidth: 2,
            gapWidth: 1
          },
          levels: [
            {
              itemStyle: { borderWidth: 0, gapWidth: 2 }
            },
            {
              itemStyle: { borderWidth: 2, gapWidth: 1, borderColor: chartTheme.cardBorder },
              upperLabel: {
                show: true,
                height: 24,
                color: chartTheme.textPrimary,
                fontWeight: 'bold',
                fontSize: 11,
                backgroundColor: 'transparent'
              }
            },
            {
              itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }
            }
          ]
        }
      ]
    };"""

content = content.replace(old_chart_option, new_chart_option)

# 2. Update descriptive text for the chart
content = content.replace(
    "Sunburst sector → ticker. Tamaño = {chartMode === 'real' ? 'valor de mercado' : 'peso objetivo'}.",
    "Treemap agrupado por sectores. Tamaño = {chartMode === 'real' ? 'valor de mercado' : 'peso objetivo'}."
)

# 3. Update the buttons logic and text
content = content.replace(
    ">Modelo<", ">Pesos Objetivo<"
)
content = content.replace(
    ">Real<", ">Tenencia Real<"
)
# Note: we need to handle the react code where it sets the label
content = re.sub(
    r">\s*Modelo\s*</button>", ">Pesos Objetivo</button>", content
)
content = re.sub(
    r">\s*Real\s*</button>", ">Tenencia Real</button>", content
)

with open(FILE_PATH, "w", encoding="utf-8") as f:
    f.write(content)

