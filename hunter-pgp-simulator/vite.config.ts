import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base relativa: el build en dist/ se puede abrir desde cualquier subruta.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: { environment: 'node' },
});
