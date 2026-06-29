import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { notifications as notificationApi } from '../api'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

function projectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.expoProjectId ||
    (Constants.expoConfig?.extra as Record<string, string | undefined> | undefined)?.easProjectId
  )
}

export async function registerPushNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CtrlPoint',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const existing = await Notifications.getPermissionsAsync()
    const existingPermission = existing as unknown as { granted?: boolean; status?: string }
    const finalPermission = existingPermission.granted || existingPermission.status === 'granted'
      ? existingPermission
      : (await Notifications.requestPermissionsAsync() as unknown as { granted?: boolean; status?: string })
    if (!finalPermission.granted && finalPermission.status !== 'granted') return null

    const id = projectId()
    const tokenResult = id
      ? await Notifications.getExpoPushTokenAsync({ projectId: id })
      : await Notifications.getExpoPushTokenAsync()
    const token = tokenResult.data
    await notificationApi.registerToken({ token, platform: Platform.OS })
    return token
  } catch (err) {
    console.warn('[push] registration failed', err)
    return null
  }
}
