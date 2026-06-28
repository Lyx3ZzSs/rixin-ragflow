export type EnvLike = Record<string, string | boolean | undefined>;

export function isContractAgentEnabled(
  env: EnvLike = import.meta.env,
): boolean {
  const value = env.VITE_CONTRACT_AGENT_ENABLED;
  return value === true || value === 'true';
}

export function getContractAgentDefaultRoute(
  env: EnvLike = import.meta.env,
): string {
  if (!isContractAgentEnabled(env)) {
    return '/';
  }

  const defaultRoute = env.VITE_CONTRACT_AGENT_DEFAULT_ROUTE;
  return typeof defaultRoute === 'string' && defaultRoute
    ? defaultRoute
    : '/contract-agent';
}
