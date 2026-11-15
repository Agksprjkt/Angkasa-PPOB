export function resolveIntegrationSetting(
  environmentValue: string | undefined,
  dashboardValue: string | undefined,
) {
  const environment = environmentValue?.trim();
  if (environment) {
    return {
      value: environment,
      source: 'environment' as const,
    };
  }
  if (dashboardValue !== undefined) {
    return {
      value: dashboardValue,
      source: 'dashboard' as const,
    };
  }
  return {
    value: undefined,
    source: 'unset' as const,
  };
}
