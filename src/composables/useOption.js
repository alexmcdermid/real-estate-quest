import { CACHE_KEY } from "../config/constants"
import { encodeCache, decodeCache } from "../composables/useQuestion"
import { reactive, watch } from 'vue'

const defaultOptions = {
  shuffled: false,
  isDark: false
}

const globalOptions = reactive(getOptions())

watch(
  globalOptions,
  (newOptions) => {
    setOptions(newOptions)
  },
  { deep: true }
)

export default function useOptions() {
  return { options: globalOptions }
}

export function getOptions() {
  let cache = {}
  const cachedEncoded = localStorage.getItem(CACHE_KEY)
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded)
  }
  return cache.options || { ...defaultOptions }
}

export function setOptions(newOptions) {
  let cache = {}
  const cachedEncoded = localStorage.getItem(CACHE_KEY)
  if (cachedEncoded) {
    cache = decodeCache(cachedEncoded)
  }
  cache.options = { ...defaultOptions, ...newOptions }
  localStorage.setItem(CACHE_KEY, encodeCache(cache))
}
