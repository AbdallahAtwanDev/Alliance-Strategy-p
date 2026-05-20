/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        command: ['Inter', 'Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        cyanGlow: '0 0 22px rgba(34, 211, 238, 0.24)',
        emeraldGlow: '0 0 22px rgba(52, 211, 153, 0.24)',
        amberGlow: '0 0 22px rgba(251, 191, 36, 0.24)',
        roseGlow: '0 0 22px rgba(251, 113, 133, 0.24)',
      },
    },
  },
  plugins: [],
};
