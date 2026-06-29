import { Platform } from 'react-native'

export const font = {
  regular: Platform.select({ android: 'sans-serif', ios: 'System', default: undefined }),
  medium: Platform.select({ android: 'sans-serif-medium', ios: 'System', default: undefined }),
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
}
