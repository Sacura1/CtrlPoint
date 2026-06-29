import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Check, CreditCard, ShieldCheck, Sparkles, Zap } from 'lucide-react-native'
import {
  fetchProducts,
  finishTransaction,
  initConnection,
  Product,
  Purchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'expo-iap'
import { auth as authApi, billing as billingApi } from '../api'
import { useAuth } from '../auth/AuthContext'
import { CardSkeleton } from '../components/Skeleton'
import { CreditPackage } from '../types'
import { alpha, ThemeColors, useTheme } from '../utils/theme'

const FEATURED_PACKAGE = 'builder'

const PLAY_PRODUCT_IDS: Record<string, string> = {
  launch: 'credits_launch',
  starter: 'credits_starter',
  builder: 'credits_builder',
  pro: 'credits_pro',
  studio: 'credits_studio',
}

const nativeBillingEnabled = Platform.OS === 'android' && !__DEV__

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isBillingClientNotReady(err: any) {
  const raw = String(err?.message || err?.debugMessage || err || '').toLowerCase()
  return raw.includes('billing client') && raw.includes('not ready')
}

function productIdFor(pkg: CreditPackage) {
  return pkg.googlePlayProductId || PLAY_PRODUCT_IDS[pkg.id] || pkg.id
}

function fallbackPrice(value: number) {
  return `$${value.toFixed(2)}`
}

function packLabel(pkg: CreditPackage) {
  if (pkg.id === FEATURED_PACKAGE) return 'Recommended'
  if (pkg.credits >= 300) return 'Studio'
  if (pkg.credits >= 100) return 'Heavy use'
  if (pkg.credits >= 25) return 'Starter'
  return 'Small pack'
}

function productPrice(product: Product | undefined, pkg: CreditPackage) {
  return product?.displayPrice || fallbackPrice(pkg.priceUsd)
}

function productRate(product: Product | undefined, pkg: CreditPackage) {
  if (product?.price && product.currency) {
    const value = product.price / pkg.credits
    try {
      const formatted = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: product.currency,
        minimumFractionDigits: value < 1 ? 2 : 0,
        maximumFractionDigits: value < 1 ? 2 : 2,
      }).format(value)
      return `${formatted} / credit`
    } catch {
      return `${value.toFixed(2)} ${product.currency} / credit`
    }
  }
  return `${(pkg.priceUsd / pkg.credits * 100).toFixed(1)} cents / credit`
}

function normalizeBillingErrorMessage(err: any, productId?: string) {
  const raw = String(err?.message || err?.debugMessage || err || '').trim()
  const lower = raw.toLowerCase()

  if (lower.includes('purchase limit') || lower.includes('try again in 24 hours')) {
    return 'Google Play says this account has reached its purchase limit for today. Try again in 24 hours or choose a smaller pack.'
  }

  if (lower.includes('billing api version') && lower.includes('not supported')) {
    return productId === PLAY_PRODUCT_IDS.studio
      ? 'Google Play could not open the Studio pack on this account right now. Check that credits_studio is an active one-time in-app product, or try a smaller pack.'
      : 'Google Play Billing is unavailable for this product right now. Try again later.'
  }

  if (lower.includes('item unavailable') || lower.includes('not found') || lower.includes('not active')) {
    return 'This credit pack is not active in Google Play yet. Check the Play Console product setup.'
  }

  if (isBillingClientNotReady(err)) {
    return 'Google Play Billing is still connecting. Wait a few seconds and try again.'
  }

  return raw || 'Google Play purchase failed.'
}

function isPurchasedState(state: Purchase['purchaseState']) {
  return String(state || '').toLowerCase() === 'purchased'
}

export default function CreditsScreen() {
  const { user, setUser } = useAuth()
  const { colors, common } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [storeError, setStoreError] = useState('')
  const processingTokens = useRef(new Set<string>())
  const busyProductIdRef = useRef<string | null>(null)
  const checkoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const billingConnected = useRef(false)
  const billingConnectionPromise = useRef<Promise<void> | null>(null)
  const listenersReady = useRef(false)
  const purchaseUpdateSub = useRef<{ remove: () => void } | null>(null)
  const purchaseErrorSub = useRef<{ remove: () => void } | null>(null)

  const setBusy = useCallback((productId: string | null) => {
    busyProductIdRef.current = productId
    if (!productId && checkoutTimeoutRef.current) {
      clearTimeout(checkoutTimeoutRef.current)
      checkoutTimeoutRef.current = null
    }
    setBusyProductId(productId)
  }, [])

  const productMap = useMemo(() => {
    const next: Record<string, Product> = {}
    products.forEach((product) => {
      next[product.id] = product
    })
    return next
  }, [products])

  const loadPackages = useCallback(async () => {
    const result = await billingApi.packages()
    setPackages(result.packages)
    return result.packages
  }, [])

  const refreshBalance = useCallback(async () => {
    const result = await authApi.me()
    setUser(result.user)
    return result.user
  }, [setUser])

  const handlePurchaseSuccess = useCallback(async (purchase: Purchase) => {
    if (purchase.purchaseState && !isPurchasedState(purchase.purchaseState)) {
      setMessage({ ok: true, text: 'Purchase is pending. Credits will be added after Google Play completes it.' })
      setBusy(null)
      return
    }

    const purchaseToken = purchase.purchaseToken
    if (!purchaseToken) {
      setMessage({ ok: false, text: 'Google Play did not return a purchase token.' })
      setBusy(null)
      return
    }
    if (processingTokens.current.has(purchaseToken)) return
    processingTokens.current.add(purchaseToken)

    try {
      const result = await billingApi.fulfillPlayPurchase({ productId: purchase.productId, purchaseToken })
      if (result.user) setUser(result.user)
      await finishTransaction({ purchase, isConsumable: true })
      await refreshBalance().catch(() => null)
      setMessage({ ok: true, text: 'Credits added.' })
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Could not verify the purchase.' })
    } finally {
      processingTokens.current.delete(purchaseToken)
      setBusy(null)
    }
  }, [refreshBalance, setBusy, setUser])

  const handlePurchaseError = useCallback((err: any) => {
    const text = normalizeBillingErrorMessage(err, busyProductIdRef.current || undefined)
    setBusy(null)
    if (/cancel/i.test(text)) return
    setMessage({ ok: false, text })
    setStoreError(text)
  }, [setBusy])

  const ensureBillingReady = useCallback(async () => {
    if (Platform.OS !== 'android') throw new Error('Google Play Billing is only available on Android.')
    if (!nativeBillingEnabled) throw new Error('Play Billing is disabled in local debug builds. Test purchases from a release build installed through Play Console internal testing.')

    if (!listenersReady.current) {
      purchaseUpdateSub.current = purchaseUpdatedListener(handlePurchaseSuccess)
      purchaseErrorSub.current = purchaseErrorListener(handlePurchaseError)
      listenersReady.current = true
    }

    if (billingConnected.current) return

    if (!billingConnectionPromise.current) {
      billingConnectionPromise.current = initConnection()
        .then((ok) => {
          if (!ok) throw new Error('Google Play Billing is unavailable.')
          billingConnected.current = true
        })
        .catch((err) => {
          billingConnected.current = false
          throw err
        })
        .finally(() => {
          billingConnectionPromise.current = null
        })
    }

    await billingConnectionPromise.current
    await sleep(250)
  }, [handlePurchaseError, handlePurchaseSuccess])

  const withBillingRetry = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    let lastError: any
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await ensureBillingReady()
        return await operation()
      } catch (err) {
        lastError = err
        if (!isBillingClientNotReady(err) || attempt === 2) break
        billingConnected.current = false
        await sleep(350 * (attempt + 1))
      }
    }
    throw lastError
  }, [ensureBillingReady])

  const loadStoreProducts = useCallback(async (creditPackages: CreditPackage[]) => {
    if (!nativeBillingEnabled || creditPackages.length === 0) return

    const productIds = Array.from(new Set(creditPackages.map(productIdFor)))
    const fetched = (await withBillingRetry(() => fetchProducts({ skus: productIds, type: 'in-app' }) as Promise<Product[] | null>))
    if (Array.isArray(fetched)) setProducts(fetched)
  }, [withBillingRetry])

  const loadAll = useCallback(async () => {
    const nextPackages = await loadPackages()
    await refreshBalance()
    loadStoreProducts(nextPackages).catch(() => null)
  }, [loadPackages, loadStoreProducts, refreshBalance])

  useEffect(() => {
    loadAll()
      .catch((err) => setMessage({ ok: false, text: err.message || 'Could not load credit packs.' }))
      .finally(() => setLoading(false))

    const balanceInterval = setInterval(() => {
      refreshBalance().catch(() => null)
    }, 8000)

    return () => {
      clearInterval(balanceInterval)
      purchaseUpdateSub.current?.remove()
      purchaseErrorSub.current?.remove()
      if (checkoutTimeoutRef.current) clearTimeout(checkoutTimeoutRef.current)
    }
  }, [loadAll, refreshBalance])

  const refresh = async () => {
    setRefreshing(true)
    await loadAll().catch((err) => setMessage({ ok: false, text: err.message || 'Could not refresh credit packs.' }))
    setRefreshing(false)
  }

  const ensureBillingProduct = async (productId: string) => {
    const fetched = await withBillingRetry(() => fetchProducts({ skus: [productId], type: 'in-app' }) as Promise<Product[] | null>)
    const product = Array.isArray(fetched) ? fetched.find((item) => item.id === productId) : undefined
    if (!product) throw new Error(`Google Play product "${productId}" is not active or not available on this device.`)
    setProducts((current) => {
      const withoutProduct = current.filter((item) => item.id !== productId)
      return [...withoutProduct, product]
    })
    return product
  }

  const buy = async (pkg: CreditPackage) => {
    const productId = productIdFor(pkg)
    if (busyProductId) return

    if (!nativeBillingEnabled) {
      setStoreError('Play Billing is disabled in this local debug build. Use a Play Console internal testing release to test purchases.')
      setMessage({ ok: false, text: 'Local debug builds cannot open Google Play Billing.' })
      return
    }

    setBusy(productId)
    checkoutTimeoutRef.current = setTimeout(() => {
      setBusy(null)
    }, 120000)
    setMessage(null)
    setStoreError('')
    try {
      await ensureBillingProduct(productId)
      const purchaseResult = await requestPurchase({
        request: {
          google: {
            skus: [productId],
            obfuscatedAccountId: user?.id,
          },
        },
        type: 'in-app',
      })
      const purchases = Array.isArray(purchaseResult) ? purchaseResult : purchaseResult ? [purchaseResult as Purchase] : []
      if (purchases.length) {
        for (const purchase of purchases) await handlePurchaseSuccess(purchase)
      } else {
        setBusy(null)
      }
    } catch (err: any) {
      setBusy(null)
      const text = normalizeBillingErrorMessage(err, productId)
      setStoreError(text)
      setMessage({ ok: false, text })
    }
  }

  const baselineRate = useMemo(() => {
    if (!packages.length) return 0
    return Math.max(...packages.map((pkg) => pkg.priceUsd / pkg.credits))
  }, [packages])

  return (
    <ScrollView
      style={common.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand2} />}
    >
      <View style={styles.balancePanel}>
        <View style={styles.balanceIcon}>
          <CreditCard size={21} color={colors.brand2} />
        </View>
        <View style={styles.balanceCopy}>
          <Text style={styles.balanceLabel}>Current balance</Text>
          <Text style={styles.balanceValue}>{user?.credits ?? 0} credits</Text>
        </View>
        <View style={styles.balanceStatus}>
          <ShieldCheck size={13} color={colors.green} />
          <Text style={styles.balanceStatusText}>Play Billing</Text>
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={styles.title}>Top up credits</Text>
        <Text style={styles.subtitle}>Buy credits for AI builds, edits, and short MNS names.</Text>
      </View>

      {message ? (
        <View style={[styles.notice, message.ok ? styles.noticeOk : styles.noticeError]}>
          <Text style={[styles.noticeText, { color: message.ok ? colors.green : colors.red }]}>{message.text}</Text>
        </View>
      ) : null}

      {storeError ? (
        <View style={styles.storeNotice}>
          <Text style={styles.storeNoticeTitle}>Store setup needed</Text>
          <Text style={styles.storeNoticeText}>{storeError}</Text>
        </View>
      ) : null}

      <View style={styles.packList}>
        {loading ? (
          <>
            <CardSkeleton rows={3} />
            <CardSkeleton rows={3} />
            <CardSkeleton rows={3} />
          </>
        ) : (
          packages.map((pkg) => {
            const productId = productIdFor(pkg)
            const product = productMap[productId]
            const rate = pkg.priceUsd / pkg.credits
            const savings = baselineRate > 0 && rate < baselineRate ? Math.round((1 - rate / baselineRate) * 100) : 0
            const featured = pkg.id === FEATURED_PACKAGE
            const busy = busyProductId === productId
            const unavailable = Platform.OS !== 'android'
            const disabled = unavailable || !!busyProductId

            return (
              <Pressable
                key={pkg.id}
                onPress={() => buy(pkg)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.packCard,
                  featured && styles.packCardFeatured,
                  pressed && !disabled && styles.packPressed,
                  disabled && styles.packDisabled,
                ]}
              >
                <View style={styles.packTop}>
                  <View style={styles.packNameBlock}>
                    <Text style={[styles.packTag, featured && styles.packTagFeatured]}>{packLabel(pkg)}</Text>
                    <Text style={styles.packName}>{pkg.name}</Text>
                  </View>
                  {featured ? (
                    <View style={styles.featuredMark}>
                      <Sparkles size={13} color={colors.brand2} />
                    </View>
                  ) : null}
                </View>

                <View style={styles.packMiddle}>
                  <View>
                    <Text style={styles.creditCount}>{pkg.credits.toLocaleString()}</Text>
                    <Text style={styles.creditLabel}>credits</Text>
                  </View>
                  {savings > 0 ? (
                    <View style={styles.savingsPill}>
                      <Zap size={12} color={colors.green} />
                      <Text style={styles.savingsText}>Save {savings}%</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.packBottom}>
                  <View>
                    <Text style={styles.price}>{productPrice(product, pkg)}</Text>
                    <Text style={styles.rate}>{productRate(product, pkg)}</Text>
                  </View>
                  <View style={[styles.buyButton, !unavailable && styles.buyButtonReady]}>
                    {busy ? (
                      <ActivityIndicator color="#fffdfa" />
                    ) : unavailable ? (
                      <Text style={styles.buyUnavailable}>Unavailable</Text>
                    ) : (
                      <>
                        <Text style={styles.buyText}>Buy</Text>
                        <Check size={14} color="#fffdfa" />
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            )
          })
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How credits work</Text>
        <Text style={styles.infoText}>Credits do not expire. Google Play handles payment, and CtrlPoint adds the credits after the purchase is verified.</Text>
      </View>
    </ScrollView>
  )
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 128,
    gap: 14,
  },
  balancePanel: {
    minHeight: 82,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.mode === 'light' ? 'rgba(82,61,40,0.18)' : 'rgba(103,232,164,0.20)',
    backgroundColor: colors.mode === 'light' ? '#fffdfa' : '#08100d',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.brand2,
    shadowOpacity: colors.mode === 'light' ? 0.08 : 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  balanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.brand, colors.mode === 'light' ? 0.08 : 0.16),
    borderWidth: 1,
    borderColor: alpha(colors.brand2, colors.mode === 'light' ? 0.18 : 0.28),
  },
  balanceCopy: {
    flex: 1,
    minWidth: 0,
  },
  balanceLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  balanceValue: {
    color: colors.text,
    marginTop: 3,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  balanceStatus: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(colors.green, 0.28),
    backgroundColor: alpha(colors.green, 0.08),
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  balanceStatusText: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
  },
  heading: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  notice: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  noticeOk: {
    backgroundColor: alpha(colors.green, 0.08),
    borderColor: alpha(colors.green, 0.22),
  },
  noticeError: {
    backgroundColor: alpha(colors.red, 0.08),
    borderColor: alpha(colors.red, 0.22),
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  storeNotice: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(colors.amber, 0.24),
    backgroundColor: alpha(colors.amber, 0.08),
    padding: 13,
    gap: 4,
  },
  storeNoticeTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  storeNoticeText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  packList: {
    gap: 12,
  },
  packCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 16,
  },
  packCardFeatured: {
    borderColor: alpha(colors.brand2, colors.mode === 'light' ? 0.26 : 0.34),
    backgroundColor: colors.mode === 'light' ? '#fffaf1' : '#0b1511',
  },
  packPressed: {
    transform: [{ scale: 0.985 }],
    borderColor: alpha(colors.brand2, 0.42),
  },
  packDisabled: {
    opacity: 0.7,
  },
  packTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  packNameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  packTag: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    color: colors.muted,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  packTagFeatured: {
    color: colors.brand2,
    borderColor: alpha(colors.brand2, 0.26),
    backgroundColor: alpha(colors.brand, 0.1),
  },
  packName: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  featuredMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(colors.brand, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.brand2, 0.22),
  },
  packMiddle: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  creditCount: {
    color: colors.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
  },
  creditLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  savingsPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(colors.green, 0.24),
    backgroundColor: alpha(colors.green, 0.08),
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  savingsText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '900',
  },
  packBottom: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  price: {
    color: colors.brand2,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
  },
  rate: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  buyButton: {
    minWidth: 112,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },
  buyButtonReady: {
    borderColor: alpha(colors.brand2, 0.28),
    backgroundColor: colors.brand,
  },
  buyText: {
    color: '#fffdfa',
    fontSize: 14,
    fontWeight: '900',
  },
  buyUnavailable: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 5,
  },
  infoTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  infoText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
})
}
