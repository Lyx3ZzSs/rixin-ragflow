export type EnvLike = Record<string, string | boolean | undefined>;
type NavigateLike = (route: string) => void;
type LocationLike = Pick<Location, 'assign'>;

function getDefaultEnv(): EnvLike {
  return (import.meta as ImportMeta & { env?: EnvLike }).env ?? {};
}

export function isContractAgentEnabled(
  env: EnvLike = getDefaultEnv(),
): boolean {
  const value = env.VITE_CONTRACT_AGENT_ENABLED;
  return value === true || value === 'true';
}

export function getContractAgentDefaultRoute(
  env: EnvLike = getDefaultEnv(),
): string {
  if (!isContractAgentEnabled(env)) {
    return '/';
  }

  const defaultRoute = env.VITE_CONTRACT_AGENT_DEFAULT_ROUTE;
  return typeof defaultRoute === 'string' && defaultRoute
    ? defaultRoute
    : '/contract-agent/';
}

export function isContractAgentStandaloneRoute(route: string): boolean {
  return route === '/contract-agent' || route.startsWith('/contract-agent/');
}

export function normalizeContractAgentRoute(route: string): string {
  return route === '/contract-agent' ? '/contract-agent/' : route;
}

export function redirectToDefaultRoute(
  navigate: NavigateLike,
  {
    env = getDefaultEnv(),
    location = window.location,
  }: { env?: EnvLike; location?: LocationLike } = {},
): void {
  const route = normalizeContractAgentRoute(getContractAgentDefaultRoute(env));
  if (isContractAgentStandaloneRoute(route)) {
    location.assign(route);
    return;
  }

  navigate(route);
}
