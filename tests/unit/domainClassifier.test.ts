import { classifyMaterialDomain } from "../../src/lib/classification/domainClassifier"

describe("Universal Epistemic Domain Classifier", () => {
  it("classifies STEM / Quantitative Derivations as formal_deductive", () => {
    const mathText = `
Linear Algebra: Eigenvalues and Eigenvectors.
Given matrix $A$, solve $\\det(A - \\lambda I) = 0$ to determine characteristic roots.
Compute the corresponding nullspace for each eigenvalue to find the orthonormal basis.
`
    const result = classifyMaterialDomain(mathText, "Linear Algebra", "lecture_04.pdf")
    expect(result.primaryArchetype).toBe("formal_deductive")
    expect(result.recommendedProblemTypes).toContain("faded_worked_derivation")
    expect(result.recommendedProblemTypes).toContain("bug_hunter_error_audit")
  })

  it("classifies Social / Behavioral / Economics as social_behavioral", () => {
    const econText = `
Microeconomics: Consumer Choice and Price Elasticity of Demand.
When subway transit fares rise by 10%, ridership falls by 14%, implying $|E_d| = 1.4$.
Is total revenue increasing or decreasing? How does cognitive dissonance affect commuter perception?
`
    const result = classifyMaterialDomain(econText, "Economics", "econ101_elasticity.txt")
    expect(result.primaryArchetype).toBe("social_behavioral")
    expect(result.recommendedProblemTypes).toContain("two_tier_diagnostic_mcq")
    expect(result.recommendedProblemTypes).toContain("confound_variable_isolation")
  })

  it("classifies Literary / Philosophical texts as interpretive_humanities", () => {
    const litText = `
Literary Criticism: The Narrative Arc of Hamlet.
Examine Shakespeare's use of dramatic irony in the soliloquy "To be or not to be".
How does the subversion of revenge tragedy tropes destabilize moral certainty in Renaissance drama?
`
    const result = classifyMaterialDomain(litText, "English Literature", "hamlet_analysis.docx")
    expect(result.primaryArchetype).toBe("interpretive_humanities")
    expect(result.recommendedProblemTypes).toContain("counterfactual_textual_interrogation")
    expect(result.recommendedProblemTypes).toContain("dialectical_thesis_rebuttal")
  })

  it("classifies Medicine / Law / Clinical as applied_clinical_legal", () => {
    const medText = `
Clinical Diagnosis & Patient Triage:
Patient presents with acute right lower quadrant abdominal pain, rebound tenderness, and leukocytosis.
Differential diagnosis: acute appendicitis vs mesenteric adenitis. Determine sequential workup and immediate surgical referral criteria.
`
    const result = classifyMaterialDomain(medText, "Clinical Medicine", "triage_protocols.pdf")
    expect(result.primaryArchetype).toBe("applied_clinical_legal")
    expect(result.recommendedProblemTypes).toContain("sequential_triage_vignette")
    expect(result.recommendedProblemTypes).toContain("rule_conflict_audit")
  })

  it("classifies Anatomy / Taxonomy / Botany as taxonomic_structural", () => {
    const bioText = `
Anatomy and Organ Systems:
Classification of cranial nerves: sensory vs motor function.
Morphology of the olfactory nerve (CN I) vs optic nerve (CN II) and their foraminal pathways through the cribriform plate.
`
    const result = classifyMaterialDomain(bioText, "Human Anatomy", "cranial_nerves.pdf")
    expect(result.primaryArchetype).toBe("taxonomic_structural")
    expect(result.recommendedProblemTypes).toContain("minimal_pair_discrimination")
    expect(result.recommendedProblemTypes).toContain("morphological_syntax_puzzle")
  })
})
