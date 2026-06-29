import { Platform, StatusBar } from 'react-native'

export const TOP_INSET = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 38) : 0
export const BOTTOM_INSET = Platform.OS === 'android' ? 48 : 0
export const BOTTOM_NAV_HEIGHT = 66
export const BOTTOM_NAV_SPACE = BOTTOM_NAV_HEIGHT + BOTTOM_INSET
