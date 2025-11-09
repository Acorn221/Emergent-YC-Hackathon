/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "class",
  content: ["./src/sidepanel/**/*.tsx", "./src/components/**/*.tsx"],
  plugins: [],
  compilerOptions: {
    baseUrl: "src/",
  },
};
