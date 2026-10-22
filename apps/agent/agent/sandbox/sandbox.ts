import { defineSandbox } from 'eve/sandbox'
import { JustBashSandbox } from 'eve/sandbox/just-bash'

/**
 * No sandbox workload: tools run in the app runtime and the default tools are off. Pinning
 * just-bash keeps eve from probing for Docker or microsandbox at startup.
 */
export const environment = JustBashSandbox.environment()
export default defineSandbox(() => environment.open())
