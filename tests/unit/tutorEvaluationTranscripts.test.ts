import type { TutorTurnAssessment } from '../../src/types'
import { chooseTutorMove, inferLearnerTurnState } from '../../src/lib/tutorLearningPolicy'
import { countTutorWords, validateTutorResponse } from '../../src/lib/tutorResponse'

type Turn = { state: ReturnType<typeof inferLearnerTurnState>; move: ReturnType<typeof chooseTutorMove>; response: string }

function evaluate(answer: string, assessment?: Partial<TutorTurnAssessment>, options: Parameters<typeof inferLearnerTurnState>[2] = {}): Turn {
  const state = inferLearnerTurnState(answer, assessment, options)
  const move = chooseTutorMove(state, options.recentImpasses)
  return { state, move, response: '' }
}

function expectTranscript(response: string, range = { min: 35, max: 80 }) {
  const result = validateTutorResponse(response, { minWords: range.min, maxWords: range.max })
  expect(result.issues).toEqual([])
  expect(result.wordCount).toBeGreaterThanOrEqual(range.min)
  expect(result.wordCount).toBeLessThanOrEqual(range.max)
  expect(result.questionCount).toBe(1)
  expect(response.trim().endsWith('?')).toBe(true)
}

describe('representative tutor evaluation transcripts', () => {
  it('opens a beginner lesson with one small idea and active recall', () => {
    const beginner = { neverStudied: true, isFirstTurn: true }
    const turn = evaluate('I have never studied opportunity cost.', undefined, { isFirstTurn: beginner.isFirstTurn })
    expect(beginner.neverStudied).toBe(true)
    expect(turn.state).toBe('opening_turn')
    expect(turn.move.nextMove).toBe('micro_teach_and_retrieve')
    const response = 'Opportunity cost is the value of the best alternative you give up when making a choice. It is about what your time or resources could have produced elsewhere, rather than only the money you spend. Choosing one option means leaving another behind. Active recall: If you spend an hour studying economics, what might be its opportunity cost?'
    expectTranscript(response)
    expect(response).not.toMatch(/as you already know|remember from before/i)
  })

  it('deepens confident consecutive success with transfer rather than definitions', () => {
    const turn = evaluate('A binding price ceiling creates a shortage because quantity demanded exceeds quantity supplied.', { outcome: 'correct' }, { consecutiveCorrect: 3 })
    expect(turn.state).toBe('advanced_understanding')
    expect(turn.move.nextMove).toBe('deepen_application')
    const response = 'Correct: at the ceiling, buyers want more units than sellers offer. Now consider a city that removes the ceiling while demand suddenly rises. The market can adjust through prices, which encourage supply and reduce some demand; the size and speed of that response depend on how elastic both sides are. Active recall: If supply were very inelastic, how would that change the price and quantity response?'
    expectTranscript(response)
    expect(response).not.toMatch(/is defined as|basic definition/i)
    expect(response).toMatch(/if supply were/i)
  })

  it('remediates a specific misconception with a counterexample and variant', () => {
    const answer = 'Opportunity cost is only the cash I pay, so a free concert has no cost.'
    const assessment = { outcome: 'incorrect', misconception: 'Equates opportunity cost with explicit monetary expense' } as Partial<TutorTurnAssessment>
    const turn = evaluate(answer, assessment)
    expect(turn.state).toBe('conceptual_misconception')
    expect(turn.move.nextMove).toBe('remediate_misconception')
    expect(turn.move.assistanceLevel).toBe(3)
    const response = 'A free concert can still have an opportunity cost: the evening might otherwise have gone to a paid shift. The forgone wages are part of the value of the next best alternative, even though no ticket money changes hands. Cash expense is only one possible part of a tradeoff. Try the same idea with your time. Active recall: If you skip a shift to attend a free lecture, what cost should you consider?'
    expectTranscript(response)
    expect(response).toMatch(/free concert|free lecture/i)
  })

  it('escapes repeated hint loops with a compact explanation and mirror question', () => {
    const turn = evaluate('I still cannot tell which alternative matters.', { outcome: 'incorrect' }, { recentImpasses: 2 })
    expect(turn.state).toBe('persistent_impasse')
    expect(turn.move.nextMove).toBe('concise_explanation_and_reretrieval')
    expect(turn.move.assistanceLevel).toBe(4)
    const response = 'Compare the options you could realistically choose, then identify the best one you would leave behind. Its value is the opportunity cost; you do not add every rejected option together. For example, if you choose a shift over a film, the film is the relevant alternative only when it was your best feasible use of that time. Active recall: If you choose revision over a shift, which single alternative would you compare?'
    expectTranscript(response)
  })

  it('preserves mathematical notation and asks for one derivation step', () => {
    const turn = evaluate('I am ready to derive the stationary point condition.', { outcome: 'correct' }, { consecutiveCorrect: 2 })
    expect(turn.state).toBe('advanced_understanding')
    const response = 'For a differentiable function, an interior optimum must satisfy a zero first derivative. Starting with $f(x)=x^2-6x+5$, differentiate to get $f\prime(x)=2x-6$. Setting the slope to zero gives $2x-6=0$, so the stationary point occurs at $x=3$; the second derivative $f\prime\prime(x)=2$ confirms a local minimum. Active recall: What equation do you solve next to find the stationary point?'
    expect(response).toContain('$f(x)=x^2-6x+5$')
    expect(response).toContain('$2x-6=0$')
    expect(countTutorWords(response)).toBeGreaterThanOrEqual(35)
    expectTranscript(response)
  })

  it('uses feedback, one economic idea, and a counterfactual application', () => {
    const turn = evaluate('The next best alternative is the evening shift I give up.', { outcome: 'correct' })
    expect(turn.state).toBe('correct_confident')
    const response = 'Exactly: the forgone shift is the relevant alternative. Opportunity cost captures the value of what a choice prevents, so the decision depends on both the benefit of attending and the value of those wages. Suppose the employer doubles the shift pay while the concert stays unchanged; the tradeoff changes even though the ticket remains free. Active recall: How would the higher shift pay affect the opportunity cost of attending?'
    expectTranscript(response)
  })

  it('keeps spaced review focused on rapid retrieval', () => {
    const reviewPrompt = 'Quick Review: retrieve the idea of price elasticity.'
    const turn = evaluate(reviewPrompt, undefined)
    expect(turn.state).toBe('unassessed_or_ambiguous')
    expect(turn.move.nextMove).toBe('clarification_probe')
    const response = 'Quick review: price elasticity describes how strongly quantity demanded responds to a price change. It is measured as the percentage change in quantity divided by the percentage change in price, so it compares relative changes rather than raw units. Active recall: If price rises by 10% and quantity demanded falls by 20%, what is the price elasticity of demand?'
    expectTranscript(response)
    expect(response).not.toMatch(/today we will begin with|in this comprehensive lesson/i)
  })

  it('segments an explicit detailed explanation request and checks comprehension', () => {
    const turn = evaluate('Please explain this to me in detail: why does a demand curve slope downward?')
    expect(turn.state).toBe('explanation_request')
    expect(turn.move.nextMove).toBe('segmented_explanation')
    const response = 'First, when a good becomes cheaper, consumers can buy more with the same budget. Second, its lower relative price makes it attractive compared with substitutes, so some buyers switch toward it. These income and substitution effects explain the usual downward slope, though unusual goods can behave differently in special cases. Active recall: How would a price decrease lead a consumer to buy more through the substitution effect?'
    expectTranscript(response, { min: 50, max: 95 })
    expect(response.split(/First|Second/).length - 1).toBe(2)
  })

  it('clarifies an unassessable answer without awarding mastery', () => {
    const turn = evaluate('I guess it changes somehow.', { outcome: 'unassessed' })
    expect(turn.state).toBe('unassessed_or_ambiguous')
    expect(turn.move.nextMove).toBe('clarification_probe')
    expect(turn.state).not.toBe('advanced_understanding')
    const response = 'I cannot tell which part of the market change you mean yet, so I will not treat this as evidence that the idea is mastered. Naming the curve that shifts will help us check the cause before deciding what happens to equilibrium. Active recall: Are you describing demand, supply, or movement along a curve?'
    expectTranscript(response)
  })

  it('adapts across three consecutive micro-teach, retrieval, evaluation turns', () => {
    const turn1 = evaluate('I have not studied equilibrium before.', undefined, { isFirstTurn: true })
    expect(turn1.move.nextMove).toBe('micro_teach_and_retrieve')
    const response1 = 'Market equilibrium is the price where the amount buyers want equals the amount sellers offer. At that point, there is no built-in pressure from a shortage or surplus to push the price in one direction. We can build the idea in small steps, beginning with what happens when price is below that balance. Active recall: Does quantity demanded exceed quantity supplied below equilibrium?'
    expectTranscript(response1)

    const turn2 = evaluate('Quantity demanded is larger, so there is a shortage.', { outcome: 'correct' })
    expect(turn2.state).toBe('correct_confident')
    expect(turn2.move.nextMove).toBe('acknowledge_and_advance')
    const response2 = 'Correct: buyers want more than sellers provide, creating a shortage. Sellers may then raise prices; as price rises, buyers demand less and sellers supply more, moving the market toward balance. That adjustment connects the shortage to the equilibrium price rather than treating equilibrium as a fixed number. Active recall: As price rises from below equilibrium, how does quantity demanded respond?'
    expectTranscript(response2)

    const turn3 = evaluate('Quantity demanded rises because sellers charge more.', { outcome: 'partial' })
    expect(turn3.state).toBe('partial_understanding')
    expect(turn3.move.nextMove).toBe('partial_scaffold')
    const response3 = 'You correctly connect the price increase with sellers offering more, but the buyer response goes the other way. A higher price makes the good less attractive or affordable, so quantity demanded falls along the demand curve. Keep the two sides distinct: higher price encourages supply and discourages demand. Active recall: If price rises while other factors stay fixed, what happens to quantity demanded?'
    expectTranscript(response3)
  })
})
