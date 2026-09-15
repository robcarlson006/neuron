import { parseDocumentTopology, estimateTokens, buildComprehensiveOutline } from "../../src/lib/coverage/documentTopologyParser"

describe("Document Topology Parser", () => {
  it("estimates tokens accurately (~4 chars per token)", () => {
    expect(estimateTokens("abcd")).toBe(1)
    expect(estimateTokens("abcdefgh")).toBe(2)
    expect(estimateTokens("")).toBe(0)
  })

  it("handles empty or whitespace text gracefully", () => {
    const topo = parseDocumentTopology("")
    expect(topo.totalCharacters).toBe(0)
    expect(topo.totalEstimatedTokens).toBe(0)
    expect(topo.chunks).toEqual([])
  })

  it("parses slide decks by slide boundary tags without losing text", () => {
    const slideDeck = `
[Slide 1]
# Introduction to Corporate Finance
Professor Smith

[Slide 2]
## Discounted Cash Flow (DCF) Formula
$$PV = \\sum \\frac{CF_t}{(1+r)^t}$$
Key assumption: Constant discount rate $r$.

[Slide 3]
## Common Pitfalls in Capital Budgeting
- Forgetting working capital adjustments
- Double counting depreciation
`
    const topo = parseDocumentTopology(slideDeck, "lecture_01.pptx")
    expect(topo.detectedFormat).toBe("slide_deck")
    expect(topo.chunks.length).toBe(3)
    expect(topo.chunks[0].slideNumber).toBe(1)
    expect(topo.chunks[1].slideNumber).toBe(2)
    expect(topo.chunks[2].slideNumber).toBe(3)
    expect(topo.chunks[1].text).toContain("Discounted Cash Flow")
  })

  it("parses hierarchical textbooks with markdown chapters and sections", () => {
    const textbook = `
# Chapter 1: Foundations of Microeconomics
Economics is the study of scarcity and choice.

## Section 1.1: Opportunity Cost and PPF
The production possibility frontier illustrates trade-offs.

## Section 1.2: Comparative Advantage and Trade
Specialization allows gains from trade.

# Chapter 2: Supply and Demand
Market equilibrium occurs where quantity supplied equals quantity demanded.
`
    const topo = parseDocumentTopology(textbook, "principles_of_econ.pdf")
    expect(topo.detectedFormat).toBe("textbook_hierarchical")
    expect(topo.chunks.length).toBeGreaterThanOrEqual(3)
    
    // Ensure all section titles are captured
    const titles = topo.chunks.map(c => c.title)
    expect(titles.some(t => t.includes("Chapter 1"))).toBe(true)
    expect(titles.some(t => t.includes("Opportunity Cost"))).toBe(true)
    expect(titles.some(t => t.includes("Supply and Demand"))).toBe(true)
  })

  it("parses timestamped audio transcripts into natural chronological windows", () => {
    const transcript = `
[00:00] Welcome everyone to Lecture 4 on Neural Networks.
[00:45] Today we will derive backpropagation using the chain rule of calculus.
[01:30] Notice how the error gradient flows backwards from the loss function through the hidden layers.
[02:15] Next, let's examine vanishing gradients when using sigmoid activation functions.
`
    const topo = parseDocumentTopology(transcript, "lecture_recording.txt")
    expect(topo.detectedFormat).toBe("timestamped_transcript")
    expect(topo.chunks.length).toBeGreaterThan(0)
    expect(topo.chunks[0].text).toContain("Lecture 4")
  })

  it("guarantees 100% full text coverage without arbitrary truncation", () => {
    const longText = Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1}: Detailed explanation of concept ${i + 1} with supporting evidence.`).join("\n\n")
    const topo = parseDocumentTopology(longText, "reading.txt", 200)
    
    expect(topo.chunks.length).toBeGreaterThan(1)
    // Check that every paragraph appears in at least one chunk
    for (let i = 1; i <= 50; i++) {
      const found = topo.chunks.some(c => c.text.includes(`Paragraph ${i}:`))
      expect(found).toBe(true)
    }
  })

  describe("buildComprehensiveOutline", () => {
    it("returns complete text when document is under 16,000 characters", () => {
      const shortText = "Chapter 1: Foundations\nThis is a short reading."
      const outline = buildComprehensiveOutline(shortText, "notes.md")
      expect(outline).toContain("[File: notes.md]")
      expect(outline).toContain(shortText)
    })

    it("generates an exhaustive structural outline covering every chapter from start to finish for large documents", () => {
      // Build a 25,000 character multi-chapter book
      const chapters = Array.from({ length: 15 }, (_, i) => {
        const body = `Content for chapter ${i + 1} explaining deep principles. `.repeat(40)
        return `## Chapter ${i + 1}: Topic ${i + 1}\n\n${body}`
      }).join("\n\n")

      expect(chapters.length).toBeGreaterThan(20000)

      const outline = buildComprehensiveOutline(chapters, "complete_textbook.pdf")
      // Verify all 15 chapters are listed in the outline
      for (let i = 1; i <= 15; i++) {
        expect(outline).toContain(`Chapter ${i}`)
      }
      expect(outline).toContain("Opening Overview")
      expect(outline).toContain("Concluding Section")
    })
  })
})
