import { ipcMain } from 'electron'
import { getGoogleCalendarService } from './googleCalendarService'

export function registerGoogleCalendarHandlers(): void {
  const service = getGoogleCalendarService()
  ipcMain.handle('googleCalendar:getStatus', async (_event, userId?: number) => service.getRuntimeStatus(userId))
  ipcMain.handle('googleCalendar:validateClientId', async (_event, clientId: string) => service.validateClientId(clientId))
  ipcMain.handle('googleCalendar:connect', async (_event, { userId, replaceAccountId }: { userId: number; replaceAccountId?: number }) => service.connect(userId, replaceAccountId))
  ipcMain.handle('googleCalendar:getAccounts', async (_event, userId: number) => service.getAccounts(userId))
  ipcMain.handle('googleCalendar:disconnect', async (_event, { userId, accountId }: { userId: number; accountId: number }) => service.disconnect(userId, accountId))
  ipcMain.handle('googleCalendar:syncAccount', async (_event, { userId, accountId }: { userId: number; accountId: number }) => service.syncAccount(userId, accountId))
  ipcMain.handle('googleCalendar:setSourceEnabled', async (_event, { userId, sourceId, enabled }: { userId: number; sourceId: number; enabled: boolean }) => service.setSourceEnabled(userId, sourceId, enabled))
  service.setHandlerRegistered(true)
}
