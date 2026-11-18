import { loadFont as loadThai } from "@remotion/google-fonts/NotoSansThai";

export const thai = loadThai("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["thai", "latin"],
}).fontFamily;

export const C = {
  navy: "#12104F",
  navy2: "#141667",
  purple: "#7C3AED",
  pink: "#D6409F",
  light: "#A855F7",
  canvas: "#F7F5FB",
  ink: "#1B1633",
  muted: "#6B6580",
  white: "#FFFFFF",
};
