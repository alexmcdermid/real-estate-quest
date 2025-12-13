import { describe, it, expect, beforeEach, vi } from "vitest";

const themeMock = { global: { name: { value: "light" } } };
const options = { isDark: false };

vi.mock("vuetify", () => ({
  useTheme: () => themeMock,
}));

vi.mock("../../src/composables/useOption", () => ({
  __esModule: true,
  default: () => ({ options }),
}));

import useDark from "../../src/composables/useDark";

describe("useDark", () => {
  beforeEach(() => {
    options.isDark = false;
    themeMock.global.name.value = "light";
  });

  it("reflects current theme state", () => {
    const { isDark, darkModeIcon } = useDark();
    expect(isDark.value).toBe(false);
    expect(darkModeIcon.value).toBe("mdi-weather-night");
  });

  it("toggles dark mode and updates theme name", () => {
    const { toggleDarkMode, isDark } = useDark();
    toggleDarkMode();
    expect(isDark.value).toBe(true);
    expect(themeMock.global.name.value).toBe("dark");
  });
});
