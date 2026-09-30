const fs = require('fs');
const file = 'frontend/src/store/useAppStore.ts';
let code = fs.readFileSync(file, 'utf-8');

code = code.replace("  [key: string]: unknown;\n", "");

fs.writeFileSync(file, code);
