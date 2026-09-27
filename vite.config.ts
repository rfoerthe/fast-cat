import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/** Aktiviert die React-Transformation und Fast Refresh für die Vite-Entwicklungsoberfläche. */
export default defineConfig({ plugins: [react()] });
