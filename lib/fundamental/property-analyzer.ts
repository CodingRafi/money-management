import type { PropertyInput, PropertyAnalysisResult } from "./property-types"
import { getPropertyLabel } from "./property-config"
import { calculatePropertyRatios, calculateDerivedValues } from "./property-calculator"
import { calculateCategoryScores, calculateCompositeScore } from "./property-scorer"

export class PropertyAnalyzer {
  analyze(input: PropertyInput): PropertyAnalysisResult {
    // Step 1: Calculate all ratios
    const ratios = calculatePropertyRatios(input)

    // Step 2: Calculate derived values
    const derivedValues = calculateDerivedValues(input, ratios)

    // Step 3: Calculate category scores
    const categoryScores = calculateCategoryScores(ratios)

    // Step 4: Calculate composite score
    const compositeScore = calculateCompositeScore(categoryScores)

    // Step 5: Get label
    const label = getPropertyLabel(compositeScore)

    return {
      input,
      ratios,
      derivedValues,
      categoryScores,
      compositeScore,
      label,
    }
  }
}
