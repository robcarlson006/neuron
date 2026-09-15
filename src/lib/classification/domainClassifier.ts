/**
 * Universal Epistemic Domain Classifier
 * Implements the Biglan-Kolb-Anderson Epistemic Taxonomy covering ALL academic and professional fields.
 * Automatically identifies how truth is established and tested in the uploaded material.
 */

export type EpistemicArchetype =
  | 'formal_deductive'       // Math, CS, Stats, Formal Logic, Actuarial
  | 'empirical_physical'     // Physics, Chemistry, Molecular Biology, Engineering
  | 'social_behavioral'      // Economics, Psychology, Sociology, Political Science
  | 'interpretive_humanities'// English Literature, Philosophy, History, Religious Studies
  | 'applied_clinical_legal' // Medicine, Nursing, Law, Corporate Finance, Business Strategy
  | 'taxonomic_structural'   // Human Anatomy, Systematic Botany, Geology, Foreign Languages

export interface DomainClassificationResult {
  primaryArchetype: EpistemicArchetype
  secondaryArchetype?: EpistemicArchetype
  confidence: number
  detectedSignals: string[]
  recommendedProblemTypes: string[]
  tutorPersona: string
  pedagogicalDirectives: string[]
}

/**
 * Fast multi-signal heuristic classifier based on lexical tokens, typography, and structural cues.
 */
export function classifyMaterialDomain(
  sampleText: string,
  subjectName: string = '',
  filename: string = ''
): DomainClassificationResult {
  const text = `${subjectName} ${filename} ${sampleText}`.toLowerCase()
  const signals: string[] = []

  // Feature counters
  let formalScore = 0
  let physicalScore = 0
  let socialScore = 0
  let humanitiesScore = 0
  let appliedScore = 0
  let taxonomicScore = 0

  // 1. Formal / Deductive signals
  const mathSymbols = (text.match(/\\frac|\\sum|\\int|\\sqrt|\\alpha|\\beta|\\theta|\\partial|\b(?:theorem|lemma|proof|axiom|derivative|integral|eigenvector|matrix|algorithm|asymptotic|polynomial)\b/g) || []).length
  if (mathSymbols > 3) {
    formalScore += Math.min(30, mathSymbols * 3)
    signals.push(`High density of mathematical/algorithmic tokens (${mathSymbols} matches)`)
  }
  if (/\b(?:calculus|algebra|geometry|discrete\s+math|statistics|data\s+structures|algorithms|linear\s+algebra|formal\s+logic)\b/i.test(text)) {
    formalScore += 35
    signals.push('Subject keyword matches Formal/Deductive discipline')
  }

  // 2. Empirical / Physical Science signals
  const physicalSymbols = (text.match(/\b(?:moles|stoichiometry|enthalpy|entropy|kinetics|newton|joules|voltage|current|magnetic|velocity|acceleration|equilibrium\s+constant|protein\s+folding|mitochondria|dna\s+polymerase)\b/g) || []).length
  if (physicalSymbols > 2) {
    physicalScore += Math.min(30, physicalSymbols * 4)
    signals.push(`Physical/chemical/molecular terms detected (${physicalSymbols} matches)`)
  }
  if (/\b(?:chemistry|physics|molecular\s+biology|biochemistry|thermodynamics|mechanics|circuits|chemical\s+engineering)\b/i.test(text)) {
    physicalScore += 35
    signals.push('Subject keyword matches Physical/Empirical Science')
  }

  // 3. Social / Behavioral Science signals
  const socialSymbols = (text.match(/\b(?:hypothesis|p-value|regression|correlation|elasticity|gdp|inflation|central\s+bank|cognitive|conditioning|reinforcement|heuristic|social\s+stratification|participant|survey|control\s+group)\b/g) || []).length
  if (socialSymbols > 2) {
    socialScore += Math.min(30, socialSymbols * 4)
    signals.push(`Social/behavioral/economic markers detected (${socialSymbols} matches)`)
  }
  if (/\b(?:economics|psychology|sociology|behavioral|cognitive\s+science|macroeconomics|microeconomics|political\s+science)\b/i.test(text)) {
    socialScore += 35
    signals.push('Subject keyword matches Social/Behavioral discipline')
  }

  // 4. Interpretive Humanities signals
  const humanitiesSymbols = (text.match(/\b(?:author|narrative|stanza|metaphor|motif|allegory|hermeneutic|epistemology|thesis|counter-argument|historiography|renaissance|critique|dialectic|deconstruction|existential)\b/g) || []).length
  if (humanitiesSymbols > 2) {
    humanitiesScore += Math.min(30, humanitiesSymbols * 4)
    signals.push(`Literary, rhetorical, or philosophical markers detected (${humanitiesSymbols} matches)`)
  }
  if (/\b(?:literature|english|philosophy|history|art\s+history|ethics|religious\s+studies|humanities)\b/i.test(text)) {
    humanitiesScore += 35
    signals.push('Subject keyword matches Interpretive Humanities')
  }

  // 5. Applied / Clinical / Legal / Corporate signals
  const appliedSymbols = (text.match(/\b(?:patient|symptoms|diagnosis|pathology|dosage|contraindication|statute|plaintiff|defendant|tort|precedent|contract|cash\s+flow|dcf|ebitda|valuation|working\s+capital|depreciation|amortization)\b/g) || []).length
  if (appliedSymbols > 2) {
    appliedScore += Math.min(30, appliedSymbols * 4)
    signals.push(`Clinical, legal, or financial decision terms detected (${appliedSymbols} matches)`)
  }
  if (/\b(?:medicine|nursing|pharmacology|law|legal|corporate\s+finance|accounting|business\s+strategy|management)\b/i.test(text)) {
    appliedScore += 35
    signals.push('Subject keyword matches Applied/Professional field')
  }

  // 6. Taxonomic / Structural / Language signals
  const taxonomicSymbols = (text.match(/\b(?:conjugation|tense|irregular\s+verb|syntax|phonology|morphology|anatomy|innervation|artery|insertion|origin|phylum|genus|species|sedimentary|metamorphic)\b/g) || []).length
  if (taxonomicSymbols > 2) {
    taxonomicScore += Math.min(30, taxonomicSymbols * 4)
    signals.push(`Morphological, anatomical, or linguistic classification terms detected (${taxonomicSymbols} matches)`)
  }
  if (/\b(?:anatomy|botany|geology|linguistics|spanish|french|german|japanese|chinese|latin)\b/i.test(text)) {
    taxonomicScore += 35
    signals.push('Subject keyword matches Taxonomic/Language discipline')
  }

  const scores: { archetype: EpistemicArchetype; score: number }[] = [
    { archetype: 'formal_deductive', score: formalScore },
    { archetype: 'empirical_physical', score: physicalScore },
    { archetype: 'social_behavioral', score: socialScore },
    { archetype: 'interpretive_humanities', score: humanitiesScore },
    { archetype: 'applied_clinical_legal', score: appliedScore },
    { archetype: 'taxonomic_structural', score: taxonomicScore }
  ]

  scores.sort((a, b) => b.score - a.score)

  const top = scores[0]
  const second = scores[1]
  const primaryArchetype = top.score > 10 ? top.archetype : 'formal_deductive'
  const secondaryArchetype = second.score > 15 ? second.archetype : undefined
  const confidence = Math.min(1.0, Math.max(0.4, top.score / 70))

  return buildArchetypeMetadata(primaryArchetype, secondaryArchetype, confidence, signals)
}

function buildArchetypeMetadata(
  primary: EpistemicArchetype,
  secondary: EpistemicArchetype | undefined,
  confidence: number,
  signals: string[]
): DomainClassificationResult {
  switch (primary) {
    case 'formal_deductive':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['faded_worked_derivation', 'bug_hunter_error_audit', 'boundary_invariance_probe'],
        tutorPersona: 'Analytical Derivation Coach (verifies step-by-step logic, checks boundary cases and proofs)',
        pedagogicalDirectives: [
          'Enforce mathematical clarity in LaTeX ($...$ and $$...$$).',
          'Use Faded Steps: show initial setup, require student to execute the algebraic pivot.',
          'Generate Bug-Hunter items where student must spot an intentional rule violation.'
        ]
      }

    case 'empirical_physical':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['system_equilibrium_shift', 'stoichiometric_balance', 'physical_variable_manipulation'],
        tutorPersona: 'Physical Systems Inquisitor (verifies conservation laws, units, and equilibrium dynamics)',
        pedagogicalDirectives: [
          'Probe how disturbing one variable alters the equilibrium state of the system.',
          'Verify dimensional homogeneity and unit accuracy.',
          'Connect macroscopic observations to microscopic/governing mechanisms.'
        ]
      }

    case 'social_behavioral':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['two_tier_diagnostic_mcq', 'confound_variable_isolation', 'behavioral_paradox_vignette'],
        tutorPersona: 'Causal Inference Specialist (challenges spurious correlations, demands mechanism justification)',
        pedagogicalDirectives: [
          'Structure items in Two-Tiers: Tier 1 = Predict Outcome, Tier 2 = Causal Mechanism.',
          'Engineer distractors around authentic student misconceptions (e.g. confusing shift vs movement).',
          'Force student to untangle correlation from causation.'
        ]
      }

    case 'interpretive_humanities':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['counterfactual_textual_interrogation', 'dialectical_thesis_rebuttal', 'analytical_rubric_evaluation'],
        tutorPersona: 'Socratic Dialectical Partner (plays devil\'s advocate, requires textual evidence for claims)',
        pedagogicalDirectives: [
          'Create counterfactual text scenarios: "If passage X were omitted, how does thematic meaning shift?"',
          'Evaluate student open responses against 3 criteria: Textual Evidence, Formal Mechanism, Dialectical Rebuttal.',
          'Reject superficial plot recall; probe interpretive subtext.'
        ]
      }

    case 'applied_clinical_legal':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['sequential_triage_vignette', 'rule_conflict_audit', 'dcf_financial_error_audit'],
        tutorPersona: 'Senior Clinical/Legal Examiner (evaluates prioritization, trade-offs under incomplete information)',
        pedagogicalDirectives: [
          'Present realistic fact patterns or financial schedules with competing constraints.',
          'Include Bug-Hunter tasks (e.g., DCF schedules with working capital or depreciation violations).',
          'Require student to determine the next best diagnostic or strategic intervention.'
        ]
      }

    case 'taxonomic_structural':
      return {
        primaryArchetype: primary,
        secondaryArchetype: secondary,
        confidence,
        detectedSignals: signals,
        recommendedProblemTypes: ['minimal_pair_discrimination', 'morphological_syntax_puzzle', 'anatomical_relational_mapping'],
        tutorPersona: 'Structural Precision Coach (drills morphological contrasts and functional classification)',
        pedagogicalDirectives: [
          'Construct explicit contrast pairs to break category confusion between adjacent structures.',
          'Test directional and structural relationships (e.g., origin/insertion, afferent/efferent).',
          'Use context-rich cloze deletion for nomenclature and syntax rules.'
        ]
      }
  }
}
