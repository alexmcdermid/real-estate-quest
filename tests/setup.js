if (typeof window !== 'undefined') {
  const createStorage = () => {
    const values = new Map()

    return {
      get length() {
        return values.size
      },
      clear() {
        values.clear()
      },
      getItem(key) {
        return values.has(String(key)) ? values.get(String(key)) : null
      },
      key(index) {
        return Array.from(values.keys())[index] ?? null
      },
      removeItem(key) {
        values.delete(String(key))
      },
      setItem(key, value) {
        values.set(String(key), String(value))
      },
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorage(),
    configurable: true,
    writable: true,
  })

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorage(),
    configurable: true,
    writable: true,
  })
}
