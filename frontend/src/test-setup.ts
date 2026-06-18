// Polyfill URL.createObjectURL and URL.revokeObjectURL for jsdom
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = function () {
    return ''
  } as unknown as typeof URL.createObjectURL
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = function () {
    // no-op
  } as unknown as typeof URL.revokeObjectURL
}
