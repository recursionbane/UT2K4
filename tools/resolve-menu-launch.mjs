// Convert the profile's menu launch path to its authenticated gateway mount.
export function resolveMenuLaunch({ launch }) {
  if (typeof launch !== 'string' || !launch.startsWith('/')) throw Error('Invalid menu launch');
  const url = new URL(launch, 'https://profile.invalid');
  if (url.origin !== 'https://profile.invalid' || url.hash ||
      !['/ut2004/', '/v/ut2004/'].includes(url.pathname) ||
      url.searchParams.get('map') !== 'NoIntro' ||
      url.searchParams.get('Mutator') !== 'MenuProfile.MenuProfileBootstrap' ||
      [...url.searchParams].length !== 2) throw Error('Unexpected menu launch configuration');
  return '/v/ut2004/' + url.search;
}
