import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { ThemeColors, useTheme } from '../utils/theme'

export function SkeletonBlock({ height, width = '100%', radius = 14 }: { height: number; width?: number | `${number}%`; radius?: number }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const opacity = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 720, useNativeDriver: true }),
      ]),
    )
    animation.start()
    return () => animation.stop()
  }, [opacity])

  return <Animated.View style={[styles.block, { height, width, borderRadius: radius, opacity }]} />
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  return (
    <View style={styles.card}>
      <SkeletonBlock height={18} width="58%" />
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBlock key={index} height={12} width={index === rows - 1 ? '72%' : '92%'} radius={8} />
      ))}
    </View>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceStrong,
  },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
})
}
