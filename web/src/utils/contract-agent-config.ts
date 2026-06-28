export type EnvLike = Record<string, string | boolean | undefined>;

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
    : '/contract-agent';
}
