import { determineHardwareTier, getHardwareProfile } from '../../electron/ipc/localHardware'

describe('Local Hardware Profiler & Model Recommender', () => {
  describe('determineHardwareTier', () => {
    it('categorizes machines with <4 GB RAM as unsupported', () => {
      const mem3GB = 3 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem3GB, 'darwin', 'arm64', 'Apple M1', 8)
      expect(result.tier).toBe('unsupported')
      expect(result.recommendedModelId).toBe('cloud')
      expect(result.tierReason).toContain('Less than 4 GB of RAM')
    })

    it('recommends Qwen 2.5 1.5B (Light) for systems with <8 GB RAM', () => {
      const mem6GB = 6 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem6GB, 'darwin', 'x64', 'Intel Core i5', 4)
      expect(result.tier).toBe('light')
      expect(result.recommendedModelId).toBe('qwen-2.5-1.5b')
      expect(result.tierReason).toContain('Qwen 2.5 1.5B')
    })

    it('recommends Qwen 2.5 1.5B (Light) for dual-core systems even if memory is 8GB', () => {
      const mem8GB = 8 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem8GB, 'win32', 'x64', 'Intel Celeron', 2)
      expect(result.tier).toBe('light')
      expect(result.recommendedModelId).toBe('qwen-2.5-1.5b')
    })

    it('recommends Qwen 2.5 3B (Balanced) for 8GB to 12GB RAM systems (e.g. M2 MacBook Pro 8GB)', () => {
      const mem8GB = 8 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem8GB, 'darwin', 'arm64', 'Apple M2', 8)
      expect(result.tier).toBe('balanced')
      expect(result.recommendedModelId).toBe('qwen-2.5-3b')
      expect(result.tierReason).toContain('8–12 GB RAM')
    })

    it('recommends Qwen 2.5 7B (High-Performance) for 16GB+ systems', () => {
      const mem16GB = 16 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem16GB, 'darwin', 'arm64', 'Apple M2 Pro', 12)
      expect(result.tier).toBe('high')
      expect(result.recommendedModelId).toBe('qwen-2.5-7b')
      expect(result.tierReason).toContain('16 GB+ RAM')
    })

    it('recommends Qwen 2.5 7B for 32GB or 64GB high-end desktop workstations', () => {
      const mem64GB = 64 * 1024 * 1024 * 1024
      const result = determineHardwareTier(mem64GB, 'win32', 'x64', 'AMD Ryzen 9', 16)
      expect(result.tier).toBe('high')
      expect(result.recommendedModelId).toBe('qwen-2.5-7b')
    })
  })

  describe('getHardwareProfile', () => {
    it('returns a populated profile for the current host environment', () => {
      const profile = getHardwareProfile()
      expect(profile).toBeDefined()
      expect(profile.totalMemoryGb).toBeGreaterThan(0)
      expect(profile.cpuCores).toBeGreaterThanOrEqual(1)
      expect(profile.cpuModel).toBeTruthy()
      expect(['light', 'balanced', 'high', 'unsupported']).toContain(profile.tier)
      expect(profile.recommendedModelId).toBeTruthy()
    })
  })
})
