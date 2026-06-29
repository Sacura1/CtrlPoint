import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'

const REVIEW_KEY = 'ctrlpoint_last_review_prompt_at'
const REVIEW_GAP_MS = 14 * 24 * 60 * 60 * 1000

export async function maybeRequestReview(_event: 'generated' | 'deployed' | 'updated') {
  try {
    const available = await StoreReview.isAvailableAsync()
    if (!available) return

    const raw = await AsyncStorage.getItem(REVIEW_KEY)
    const last = raw ? Number(raw) : 0
    if (last && Date.now() - last < REVIEW_GAP_MS) return

    await AsyncStorage.setItem(REVIEW_KEY, String(Date.now()))
    await StoreReview.requestReview()
  } catch {}
}
