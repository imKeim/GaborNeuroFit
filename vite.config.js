import { defineConfig } from 'vite';

// Core configuration for the Vite bundler
export default defineConfig({
  // Enforce relative paths in build output to ensure seamless hosting on GitHub Pages subdirectories
  base: './',
});