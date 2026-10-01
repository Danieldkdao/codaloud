const channels = (color: string) => {
  const hex = color.replace(/^#/, "");
  const expanded =
    hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [0, 2, 4].map((offset) =>
    Number.parseInt(expanded.slice(offset, offset + 2), 16),
  );
};

// Ghostty's theme parser accepts opaque hex colors. Match bg-card/70 against
// the panel's bg-background by compositing the two resolved theme variables.
export const terminalCardBackground = (card: string, background: string) => {
  const top = channels(card);
  const base = channels(background);
  if (!top || !base) return card;
  return (
    "#" +
    top
      .map((value, index) =>
        Math.round(value * 0.7 + base[index] * 0.3)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
