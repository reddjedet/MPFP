const fs = require('fs');
const file = 'frontend/src/store/useAppStore.ts';
let code = fs.readFileSync(file, 'utf-8');

code = code.replace(
  "adr?: number | null;",
  "adr?: number | null;\n  adr_price?: number | null;"
);

fs.writeFileSync(file, code);
