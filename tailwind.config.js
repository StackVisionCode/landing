/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // Paleta de marca: escala derivada de los dos azules del brand kit
        // (400 = Light Blue #67BAF4, 800 = Bold Blue #1E466B, exactos —
        // el resto interpolado en el mismo tono para tintes/sombras
        // consistentes). "ink" = Jet Black #0D0D0D (superficies sólidas,
        // no texto de cuerpo). El fondo base del sitio es Soft White #FAFAFA.
        brand: {
          50: '#EEF6FE',
          100: '#DCEDFC',
          200: '#B4DBF9',
          300: '#8CC7F5',
          400: '#67BAF4',
          500: '#4CA0DE',
          600: '#3679AE',
          700: '#285A85',
          800: '#1E466B',
          900: '#16334D',
        },
        ink: '#0D0D0D',
        // Paleta del landing Taxoffix (propuesta C).
        cream: '#F8F4ED',
        sand: '#F4EDE4',
        lime: '#E3FF00',
        azure: '#4DD8FF',
        star: '#057BC1',
        twilight: '#083645',
        muted: '#3E5F6B',
        line: '#E4DCCF',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
