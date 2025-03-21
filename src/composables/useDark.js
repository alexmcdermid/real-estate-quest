import { computed } from 'vue'
import { useTheme } from 'vuetify'

export default function useDark() {
  const theme = useTheme()

  const storedIsDark = localStorage.getItem("isDark")
  if (storedIsDark !== null) {
    theme.global.name.value = storedIsDark === "true" ? "dark" : "light"
  }

  const isDark = computed(() => theme.global.name.value === "dark")
  const darkModeIcon = computed(() => (isDark.value ? "mdi-weather-sunny" : "mdi-weather-night"))

  function toggleDarkMode() {
    theme.global.name.value = isDark.value ? "light" : "dark"
    localStorage.setItem("isDark", (!isDark.value).toString())
  }

  return { isDark, darkModeIcon, toggleDarkMode }
}
