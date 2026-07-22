/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // JAMIN brand — from the logo
        brand: {
          DEFAULT: "#E11B22", // signature red
          50: "#FEECEC",
          100: "#FBD5D6",
          200: "#F6A9AB",
          300: "#F07E81",
          400: "#EA5257",
          500: "#E11B22",
          600: "#B8151B",
          700: "#8E1015",
          800: "#650B0F",
          900: "#3C0709",
        },
        gold: {
          DEFAULT: "#C9A227",
          light: "#E8C766",
          dark: "#9C7D1A",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#4B4B4B",
          faint: "#8A8A8A",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          alt: "#F7F7F8",
          sunken: "#EFEFF1",
        },
      },
      fontFamily: {
        sans: ["Inter_400Regular"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"],
        bold: ["Inter_700Bold"],
      },
      borderRadius: {
        xl: "18px",
        "2xl": "24px",
        "3xl": "30px",
      },
    },
  },
  plugins: [],
};
