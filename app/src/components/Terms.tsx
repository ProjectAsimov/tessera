export const GUIDELINES_URL = 'https://projectasimov.github.io/guidelines.html';
export const PRIVACY_URL = 'https://projectasimov.github.io/privacy.html';

/** The one-line group terms notice (Join sheet and Share sheet). */
export function Terms() {
  return (
    <p class="terms">
      Members see each other's names, streaks and shoutouts. By joining you agree to the{' '}
      <a href={GUIDELINES_URL} target="_blank" rel="noopener">community guidelines</a>.
    </p>
  );
}
