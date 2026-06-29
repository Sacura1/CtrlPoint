import React, { forwardRef, useMemo, useState } from 'react'
import { StyleSheet, TextInput, TextInputProps } from 'react-native'
import { alpha, ThemeColors, useTheme } from '../utils/theme'

export const AppInput = forwardRef<TextInput, TextInputProps>(function AppInput({ onBlur, onFocus, style, ...props }, ref) {
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [focused, setFocused] = useState(false)

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.faint}
      {...props}
      onFocus={(event) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        onBlur?.(event)
      }}
      style={[common.input, style, focused && styles.focused]}
    />
  )
})

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  focused: {
    borderColor: alpha(colors.brand2, 0.72),
    shadowColor: colors.brand2,
    shadowOpacity: colors.mode === 'light' ? 0.14 : 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
})
}
