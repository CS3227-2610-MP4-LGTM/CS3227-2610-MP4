import { categoryLabels, difficultyLabels, languageLabels, type ChallengeCard } from "@/lib/learner/challenges";

export function ChallengeMetadata({ challenge }: { challenge: ChallengeCard }) {
  return <dl className="challenge-metadata">
    <div><dt>Description</dt><dd>{challenge.description}</dd></div>
    <div><dt>Language</dt><dd>{languageLabels[challenge.language]}</dd></div>
    <div><dt>Difficulty</dt><dd>{difficultyLabels[challenge.difficulty]}</dd></div>
    <div><dt>Flaw categories</dt>
      <dd className="challenge-categories">{challenge.categories.map(category =>
        <span key={category}>{categoryLabels[category]}</span>,
      )}</dd>
    </div>
  </dl>;
}
