/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sl-blue': '#0066cc',
        'sl-dark': '#1e1e1e',
        'sl-gray': '#252526',
        'sl-light-gray': '#3c3c3c',
      }
    },
  },
  plugins: [],
}
