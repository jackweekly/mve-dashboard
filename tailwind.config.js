/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/views/**/*.html.erb',
    './app/helpers/**/*.rb',
    './app/javascript/**/*.js',
    './app/javascript/**/*.jsx',
    './app/javascript/**/*.ts',
    './app/javascript/**/*.tsx',
    './app/assets/stylesheets/**/*.css',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
