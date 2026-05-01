import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mrl: {
          red: "#E10600",
          black: "#0B0D10",
          gray: "#161A20"
        }
      }
    }
  },
  plugins: []
};

export default config;
