import os from 'os'
import type { HardwareProfile, HardwareTier } from '../../src/types'

/**
 * Determines hardware tier and recommended model based on system specs.
 */
export function determineHardwareTier(
  totalMemBytes: number,
  _platform: string,
  _arch: string,
  _cpuModel: string,
  cpuCores: number
): { tier: HardwareTier; recommendedModelId: string; tierReason: string } {
  const totalMemGb = totalMemBytes / (1024 * 1024 * 1024)

  if (totalMemGb < 4.0) {
    return {
      tier: 'unsupported',
      recommendedModelId: 'cloud',
      tierReason: 'Less than 4 GB of RAM detected. Running local LLMs will cause severe system memory pressure. Cloud AI is recommended.'
    }
  }

  if (totalMemGb < 7.5 || cpuCores <= 2) {
    return {
      tier: 'light',
      recommendedModelId: 'qwen-2.5-1.5b',
      tierReason: 'System has limited RAM (< 8 GB) or 2 CPU cores. Qwen 2.5 1.5B provides fast offline inference with minimal memory footprint (~1.6 GB).'
    }
  }

  if (totalMemGb <= 14.0) {
    return {
      tier: 'balanced',
      recommendedModelId: 'qwen-2.5-3b',
      tierReason: 'System has 8–12 GB RAM. Qwen 2.5 3B delivers high reasoning & JSON accuracy while comfortably leaving RAM for the OS.'
    }
  }

  return {
    tier: 'high',
    recommendedModelId: 'qwen-2.5-7b',
    tierReason: '16 GB+ RAM detected. Qwen 2.5 7B provides maximum generation quality and in-depth tutoring capabilities.'
  }
}

/**
 * Reads host system hardware metrics and returns a HardwareProfile.
 */
export function getHardwareProfile(): HardwareProfile {
  const totalMemBytes = os.totalmem()
  const freeMemBytes = os.freemem()
  const cpus = os.cpus() || []
  const cpuModel = cpus[0]?.model || 'Unknown CPU'
  const cpuCores = cpus.length || 1
  const platform = os.platform()
  const arch = os.arch()

  const { tier, recommendedModelId, tierReason } = determineHardwareTier(
    totalMemBytes,
    platform,
    arch,
    cpuModel,
    cpuCores
  )

  return {
    totalMemoryGb: Number((totalMemBytes / (1024 * 1024 * 1024)).toFixed(1)),
    freeMemoryGb: Number((freeMemBytes / (1024 * 1024 * 1024)).toFixed(1)),
    cpuModel,
    cpuCores,
    arch,
    platform,
    tier,
    recommendedModelId,
    tierReason
  }
}
