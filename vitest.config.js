import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    'npm:@base44/sdk@0.8.44': '@base44/sdk',
  } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 },
});
