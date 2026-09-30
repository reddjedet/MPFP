const fs = require('fs');
const file = 'frontend/src/store/useAppStore.ts';
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  "earnings_badge?: string | number | null;",
  "earnings_badge?: { badge_text?: string; badge_class?: string; target_month_name?: string; text?: string; class?: string; is_urgent?: boolean; [key: string]: unknown } | null;"
);
code = code.replace("gf_signal?: string | null;", "gf_signal?: string | number | boolean | Record<string, unknown> | null;");
code = code.replace("ppc_return?: string | number | null;", "ppc_return?: string | number | boolean | Record<string, unknown> | null;");
code = code.replace("pfcf_signal?: string | null;", "pfcf_signal?: string | number | boolean | Record<string, unknown> | null;");

fs.writeFileSync(file, code);
