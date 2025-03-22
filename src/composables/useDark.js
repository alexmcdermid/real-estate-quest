import { computed } from 'vue'
import { useTheme } from 'vuetify'
import useOptions from './useOption'

export default function useDark() {
  const theme = useTheme()
  const { options } = useOptions()

  theme.global.name.value = options.isDark ? "dark" : "light"

  const isDark = computed(() => options.isDark)
  const darkModeIcon = computed(() =>
    isDark.value ? "mdi-weather-sunny" : "mdi-weather-night"
  )

  function toggleDarkMode() {
    options.isDark = !options.isDark
    theme.global.name.value = options.isDark ? "dark" : "light"
  }

  return { isDark, darkModeIcon, toggleDarkMode, options }
}
