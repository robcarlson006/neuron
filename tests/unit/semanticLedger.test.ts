import { SemanticLedger } from "../../src/lib/coverage/semanticLedger"
import type { AtomicChunk } from "../../src/lib/coverage/documentTopologyParser"

describe("Semantic Ledger & Verification State Machine", () => {
  const sampleChunks: AtomicChunk[] = [
    {
      index: 0,
      title: "Introduction to Discounted Cash Flow",
      type: "section",
      text: "The DCF model projects free cash flows over an explicit forecast horizon...",
      charStart: 0,
      charEnd: 200,
      tokenEstimate: 50
    },
    {
      index: 1,
      title: "Working Capital & Depreciation Violations",
      type: "worked_example",
      text: "Notice that changes in net working capital must be subtracted from operating cash flow...",
      charStart: 201,
      charEnd: 450,
      tokenEstimate: 60
    },
    {
      index: 2,
      title: "Terminal Value Estimation",
      type: "section",
      text: "Gordon Growth model assumes perpetual constant growth rate g < WACC...",
      charStart: 451,
      charEnd: 700,
      tokenEstimate: 60
    }
  ]

  it("initializes chunks in pending state", () => {
    const ledger = new SemanticLedger()
    ledger.initialize(1, sampleChunks)
    const manifest = ledger.getCoverageManifest(1)

    expect(manifest.totalChunks).toBe(3)
    expect(manifest.verifiedChunks).toBe(0)
    expect(manifest.coveragePercentage).toBe(0)
    expect(manifest.isFullyCovered).toBe(false)
    expect(ledger.hasPendingChunks()).toBe(true)
  })

  it("transitions chunks through extraction, auditing, and verification states", () => {
    const ledger = new SemanticLedger()
    ledger.initialize(1, sampleChunks)

    // Mark chunk 0 as extracted
    ledger.markExtracted(0, ["DCF Definition", "Forecast Horizon"])
    const entries = ledger.getEntries()
    expect(entries[0].status).toBe("extracted")
    expect(entries[0].extractedPrinciples).toContain("DCF Definition")

    // Mark chunk 0 as audited
    ledger.markAudited(0, ["Missed tax shield on interest"])
    expect(entries[0].status).toBe("audited")
    expect(entries[0].auditedGaps).toContain("Missed tax shield on interest")

    // Mark chunk 0 as verified
    ledger.markVerified(0, 4)
    expect(entries[0].status).toBe("verified")
    expect(entries[0].itemsGeneratedCount).toBe(4)

    const manifest = ledger.getCoverageManifest(1)
    expect(manifest.verifiedChunks).toBe(1)
    expect(manifest.coveragePercentage).toBe(33)
  })

  it("tracks next pending chunk correctly", () => {
    const ledger = new SemanticLedger()
    ledger.initialize(1, sampleChunks)

    const next = ledger.getNextPendingChunk()
    expect(next?.chunkIndex).toBe(0)

    ledger.markExtracted(0, ["Principle"])
    ledger.markVerified(0, 2)

    const nextAfter = ledger.getNextPendingChunk()
    expect(nextAfter?.chunkIndex).toBe(1)
  })
})
