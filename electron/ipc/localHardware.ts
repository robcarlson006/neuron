import os from 'os'
import { execSync } from 'child_process'
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
 * Helper to get accurate CPU model, core count, memory and architecture.
 */
function getAccurateSystemSpecs(): {
  cpuModel: string
  cpuCores: number
  totalMemBytes: number
  freeMemBytes: number
  platform: string
  arch: string
} {
  const platform = os.platform()
  let arch = os.arch()
  let totalMemBytes = os.totalmem()
  const freeMemBytes = os.freemem()
  const cpus = os.cpus() || []
  let cpuModel = cpus[0]?.model?.trim() || 'Unknown CPU'
  let cpuCores = cpus.length || 1

  if (platform === 'darwin') {
    try {
      // Check if running under Rosetta 2 translation
      const isTranslated = execSync('sysctl -n sysctl.proc_translated 2>/dev/null', { timeout: 1000 }).toString().trim()
      if (isTranslated === '1') {
        arch = 'arm64'
      }
    } catch {}

    try {
      // Read exact brand string on macOS (e.g. "Apple M1 Pro", "Apple M2 Max", "Apple M3", "Intel Core i7")
      const brand = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null', { timeout: 1000 }).toString().trim()
      if (brand && brand !== 'VirtualApple' && !brand.startsWith('VirtualApple')) {
        cpuModel = brand
      } else {
        const hwModel = execSync('sysctl -n hw.model 2>/dev/null', { timeout: 1000 }).toString().trim()
        if (hwModel) {
          cpuModel = cpuModel.startsWith('VirtualApple') || cpuModel === 'Unknown CPU' ? `Apple Silicon (${hwModel})` : cpuModel
        }
      }
    } catch {}

    try {
      const coresStr = execSync('sysctl -n hw.ncpu 2>/dev/null', { timeout: 1000 }).toString().trim()
      const ncpu = parseInt(coresStr, 10)
      if (!isNaN(ncpu) && ncpu > 0) {
        cpuCores = ncpu
      }
    } catch {}

    try {
      const memStr = execSync('sysctl -n hw.memsize 2>/dev/null', { timeout: 1000 }).toString().trim()
      const memsize = parseInt(memStr, 10)
      if (!isNaN(memsize) && memsize > 0) {
        totalMemBytes = memsize
      }
    } catch {}
  } else if (platform === 'win32') {
    try {
      const wmicOutput = execSync('wmic cpu get name /value 2>nul', { timeout: 1500 }).toString().trim()
      const match = wmicOutput.match(/Name=(.+)/i)
      if (match && match[1]) {
        cpuModel = match[1].trim()
      }
    } catch {}
  } else if (platform === 'linux') {
    try {
      const fs = require('fs')
      if (fs.existsSync('/proc/cpuinfo')) {
        const info = fs.readFileSync('/proc/cpuinfo', 'utf8')
        const match = info.match(/model name\s*:\s*(.+)/i)
        if (match && match[1]) {
          cpuModel = match[1].trim()
        }
      }
    } catch {}
  }

  cpuModel = cpuModel.replace(/\s+/g, ' ')

  return {
    cpuModel,
    cpuCores,
    totalMemBytes,
    freeMemBytes,
    platform,
    arch
  }
}

/**
 * Reads host system hardware metrics and returns a HardwareProfile.
 */
export function getHardwareProfile(): HardwareProfile {
  const specs = getAccurateSystemSpecs()

  const { tier, recommendedModelId, tierReason } = determineHardwareTier(
    specs.totalMemBytes,
    specs.platform,
    specs.arch,
    specs.cpuModel,
    specs.cpuCores
  )

  return {
    totalMemoryGb: Number((specs.totalMemBytes / (1024 * 1024 * 1024)).toFixed(1)),
    freeMemoryGb: Number((specs.freeMemBytes / (1024 * 1024 * 1024)).toFixed(1)),
    cpuModel: specs.cpuModel,
    cpuCores: specs.cpuCores,
    arch: specs.arch,
    platform: specs.platform,
    tier,
    recommendedModelId,
    tierReason
  }
}
