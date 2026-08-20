import type { ElectronAPI } from '../electron/preload'

// Extend Window interface for tests
interface Window {
  electronAPI: ElectronAPI
}
