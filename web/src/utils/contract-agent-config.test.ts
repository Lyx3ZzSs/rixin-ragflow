import {
  getContractAgentDefaultRoute,
  isContractAgentEnabled,
  redirectToDefaultRoute,
} from './contract-agent-config';

describe('contract agent config', () => {
  it('is disabled by default', () => {
    expect(() => isContractAgentEnabled()).not.toThrow();
    expect(() => getContractAgentDefaultRoute()).not.toThrow();
    expect(isContractAgentEnabled()).toBe(false);
    expect(getContractAgentDefaultRoute()).toBe('/');
  });

  it('is disabled when the feature flag is false', () => {
    const env = { VITE_CONTRACT_AGENT_ENABLED: 'false' };

    expect(isContractAgentEnabled(env)).toBe(false);
    expect(getContractAgentDefaultRoute(env)).toBe('/');
  });

  it('is disabled when the feature flag is not exactly true', () => {
    expect(
      isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: 'TRUE' }),
    ).toBe(false);
    expect(
      isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: 'True' }),
    ).toBe(false);
    expect(
      isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: ' true ' }),
    ).toBe(false);
  });

  it('is enabled when the feature flag is true', () => {
    expect(
      isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: 'true' }),
    ).toBe(true);
    expect(isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: true })).toBe(
      true,
    );
  });

  it('uses the contract agent route by default when enabled', () => {
    expect(
      getContractAgentDefaultRoute({ VITE_CONTRACT_AGENT_ENABLED: 'true' }),
    ).toBe('/contract-agent/');
  });

  it('uses the custom contract agent route when enabled', () => {
    expect(
      getContractAgentDefaultRoute({
        VITE_CONTRACT_AGENT_ENABLED: 'true',
        VITE_CONTRACT_AGENT_DEFAULT_ROUTE: '/contracts',
      }),
    ).toBe('/contracts');
  });

  it('loads the standalone contract agent with document navigation', () => {
    const navigate = jest.fn();
    const location = { assign: jest.fn() };

    redirectToDefaultRoute(navigate, {
      env: { VITE_CONTRACT_AGENT_ENABLED: 'true' },
      location,
    });

    expect(navigate).not.toHaveBeenCalled();
    expect(location.assign).toHaveBeenCalledWith('/contract-agent/');
  });

  it('uses SPA navigation for normal RAGFlow routes', () => {
    const navigate = jest.fn();
    const location = { assign: jest.fn() };

    redirectToDefaultRoute(navigate, {
      env: { VITE_CONTRACT_AGENT_ENABLED: 'false' },
      location,
    });

    expect(location.assign).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/');
  });
});
