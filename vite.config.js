import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['three']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  }
});
