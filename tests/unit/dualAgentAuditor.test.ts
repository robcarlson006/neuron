import {
  buildPass1ExtractionPrompt,
  buildPass2AuditorPrompt,
  reconcileChunkKnowledge,
  type Pass1ExtractionResult,
  type Pass2AuditResult
} from "../../src/lib/coverage/dualAgentAuditor"

describe("Dual Agent Auditor & Reconciliation", () => {
  const sampleChunkText = "When debt trades at a severe discount to par, junior creditors face steep haircut risks. Chapter 11 absolute priority rule dictates senior debt must be paid 100 cents on the dollar before subordinated tranches receive any recovery."

  it("builds Pass 1 extraction prompt requesting concepts, formulas, and worked steps", () => {
    const prompt = buildPass1ExtractionPrompt(sampleChunkText, "Valuation of Distressed Debt", "Corporate Finance")

    expect(prompt).toContain("Valuation of Distressed Debt")
    expect(prompt).toContain("Corporate Finance")
    expect(prompt).toContain("EXTRACTION DIRECTIVES")
    expect(prompt).toContain("principles")
  })

  it("builds Pass 2 adversarial gap-hunter prompt targeting omissions and subtle traps", () => {
    const pass1Json = JSON.stringify({
      principles: ["Absolute Priority Rule"],
      concepts: [{ name: "Absolute Priority", definition: "Senior debt paid before junior debt" }],
      examples: []
    })

    const prompt = buildPass2AuditorPrompt(sampleChunkText, "Valuation of Distressed Debt", pass1Json, "Corporate Finance")

    expect(prompt).toContain("adversarial academic auditor")
    expect(prompt).toContain("omitted_theorems_or_rules")
    expect(prompt).toContain("missed_edge_cases_or_traps")
    expect(prompt).toContain("underdeveloped_concepts")
  })

  it("reconciles Pass 1 and Pass 2 into an authoritative combined knowledge structure", () => {
    const pass1: Pass1ExtractionResult = {
      principles: ["Absolute Priority Rule"],
      concepts: [
        {
          name: "Absolute Priority",
          definition: "Senior debt must be made whole before junior creditors receive distributions.",
          common_misconception: "Assuming equity always gets wiped out even if senior creditors agree to a consensual plan."
        }
      ],
      examples: ["Chrysler bankruptcy 2009"]
    }

    const pass2: Pass2AuditResult = {
      omitted_theorems_or_rules: ["Cramdown Provision §1129(b)"],
      missed_edge_cases_or_traps: ["Debtor-in-Possession (DIP) financing priming liens"],
      underdeveloped_concepts: ["Subordinated debt recovery waterfall"]
    }

    const reconciled = reconcileChunkKnowledge(0, "Valuation of Distressed Debt", pass1, pass2)

    expect(reconciled.chunkIndex).toBe(0)
    expect(reconciled.sectionTitle).toBe("Valuation of Distressed Debt")
    expect(reconciled.allPrinciples).toContain("Absolute Priority Rule")
    expect(reconciled.allPrinciples).toContain("Cramdown Provision §1129(b)")
    expect(reconciled.misconceptionTraps).toContain("Assuming equity always gets wiped out even if senior creditors agree to a consensual plan.")
    expect(reconciled.misconceptionTraps).toContain("Debtor-in-Possession (DIP) financing priming liens")
    expect(reconciled.workedExamples).toContain("Chrysler bankruptcy 2009")
  })
})
